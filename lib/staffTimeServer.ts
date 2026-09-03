import "server-only";

import { isIP } from "node:net";
import type { NextRequest } from "next/server";

import { requireExamBankAdmin } from "./cambridgeExamBankServer";
import {
  addCalendarDays,
  enumerateDates,
  getIsoWeekday,
  getMadridDate,
  getMadridMinutes,
  getStaffTimeDayStatus,
  isIsoDate,
  madridLocalToIso,
  minutesBetween,
  normalizeTime,
  plannedIntervalLabel,
  plannedMinutes,
  reportPeriodLabel,
  spanishClosureLabel,
  text,
  type StaffTimeCompanySettings,
  type StaffTimeEmploymentRecord,
  type StaffTimeInterval,
  type StaffTimeLocationPolicy,
  type StaffTimeReportData,
  type StaffTimeReportDay,
  type StaffTimeReportSession,
  type StaffTimeReportTeacher,
  type StaffTimeSchedule,
  type StaffTimeSessionView,
  type StaffTimeTeacherDay,
  type StaffTimeWorkingType,
} from "./staffTime";
import { loadSchoolClosures } from "./schoolClosuresServer";
import { supabaseAdmin } from "./supabaseAdmin";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_INSPECTION_DAYS = 1461;

type StaffTimeActor = {
  id: string;
  role: "admin" | "teacher";
  first_name: string;
  last_name: string;
  active: boolean;
};

type ProfileRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  active: boolean | null;
};

type SessionRow = {
  id: string;
  teacher_id: string;
  work_date: string;
  clocking_mode: "school_network" | "authorised_remote";
  opened_at: string;
  closed_at: string | null;
  created_at: string;
};

type EventRow = {
  id: string;
  session_id: string;
  teacher_id: string;
  event_type: "sign_in" | "sign_out";
  occurred_at: string;
  request_ip: string;
  verification_result: string;
  allowed_network_id: string | null;
  created_at: string;
};

type CorrectionRow = {
  id: string;
  teacher_id: string;
  work_date: string;
  session_id: string | null;
  original_sign_in_event_id: string | null;
  original_sign_out_event_id: string | null;
  requested_sign_in_at: string | null;
  requested_sign_out_at: string | null;
  request_type: string;
  reason: string;
  submission_source: "teacher_request" | "admin_manual";
  submitted_by: string;
  submitted_at: string;
  status: "pending" | "approved" | "rejected";
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_note: string | null;
};

type IncidenceRow = {
  id: string;
  teacher_id: string;
  work_date: string;
  session_id: string | null;
  correction_id: string | null;
  incidence_type: string;
  source: string;
  description: string | null;
  status: "open" | "resolved" | "dismissed";
  detected_at: string;
  resolved_by: string | null;
  resolved_at: string | null;
  resolution_note: string | null;
};

type RemoteRow = {
  id: string;
  teacher_id: string;
  start_date: string;
  end_date: string;
  reason: string | null;
  authorised_by: string | null;
  authorised_at: string;
  revoked_by: string | null;
  revoked_at: string | null;
  revocation_reason: string | null;
};

export class StaffTimeError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
    this.name = "StaffTimeError";
  }
}

function databaseMessage(error: unknown) {
  if (!error || typeof error !== "object") return "";
  const value = error as { message?: unknown; details?: unknown; code?: unknown };
  return [value.message, value.details]
    .filter(Boolean)
    .map(String)
    .join(" ")
    .trim();
}

function throwDatabase(error: unknown, fallback: string): never {
  const message = databaseMessage(error);
  if (/overlap/i.test(message)) {
    throw new StaffTimeError(message, 409);
  }
  if (/effective|choose|selected|required|cannot|must/i.test(message)) {
    throw new StaffTimeError(message, 422);
  }
  throw new Error(fallback);
}

function bearerToken(request: NextRequest) {
  const authorization = request.headers.get("authorization") || "";
  return authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
}

export async function requireStaffTimeTeacher(request: NextRequest) {
  const token = bearerToken(request);
  if (!token) throw new StaffTimeError("Authentication required.", 401);
  const {
    data: { user },
    error: userError,
  } = await supabaseAdmin.auth.getUser(token);
  if (userError || !user) throw new StaffTimeError("Authentication required.", 401);
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("id, role, first_name, last_name, active")
    .eq("id", user.id)
    .single();
  if (error) throw new Error("Unable to verify Teacher access.");
  if (data?.role !== "teacher") {
    throw new StaffTimeError("Teacher access required.", 403);
  }
  return {
    id: String(data.id),
    role: "teacher",
    first_name: text(data.first_name),
    last_name: text(data.last_name),
    active: data.active !== false,
  } satisfies StaffTimeActor;
}

export async function requireStaffTimeAdmin(request: NextRequest) {
  const result = await requireExamBankAdmin(request);
  if (result.response) {
    throw new StaffTimeError(
      result.response.status === 401 ? "Authentication required." : "Admin access required.",
      result.response.status
    );
  }
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("id, role, first_name, last_name, active")
    .eq("id", result.userId)
    .single();
  if (error || data?.role !== "admin") {
    throw new StaffTimeError("Admin access required.", 403);
  }
  return {
    id: String(data.id),
    role: "admin",
    first_name: text(data.first_name),
    last_name: text(data.last_name),
    active: data.active !== false,
  } satisfies StaffTimeActor;
}

function normalizeIpCandidate(value: string | null) {
  let candidate = text(value).split(",")[0]?.trim() || "";
  if (candidate.startsWith("[") && candidate.includes("]")) {
    candidate = candidate.slice(1, candidate.indexOf("]"));
  } else if (/^\d{1,3}(?:\.\d{1,3}){3}:\d+$/.test(candidate)) {
    candidate = candidate.slice(0, candidate.lastIndexOf(":"));
  }
  if (candidate.toLowerCase().startsWith("::ffff:")) {
    const mapped = candidate.slice(7);
    if (isIP(mapped) === 4) candidate = mapped;
  }
  return isIP(candidate) ? candidate : null;
}

export function getTrustedRequestIp(request: NextRequest) {
  if (process.env.VERCEL === "1") {
    return normalizeIpCandidate(request.headers.get("x-vercel-forwarded-for"));
  }
  const trustedNonVercelProxy =
    process.env.NODE_ENV !== "production" ||
    process.env.STAFF_TIME_TRUST_FORWARD_HEADERS === "true";
  if (!trustedNonVercelProxy) return null;
  return (
    normalizeIpCandidate(request.headers.get("x-forwarded-for")) ||
    normalizeIpCandidate(request.headers.get("x-real-ip")) ||
    (process.env.NODE_ENV === "development" ? "127.0.0.1" : null)
  );
}

function validUuid(value: unknown) {
  const normalized = text(value);
  return UUID_PATTERN.test(normalized) ? normalized : "";
}

function validateDateRange(startDate: string, endDate: string, maxDays = MAX_INSPECTION_DAYS) {
  if (!isIsoDate(startDate) || !isIsoDate(endDate) || endDate < startDate) {
    throw new StaffTimeError("Choose a valid date range.", 422);
  }
  const dates = enumerateDates(startDate, endDate);
  if (!dates.length || dates.length > maxDays) {
    throw new StaffTimeError(
      `Choose a date range of ${maxDays.toLocaleString("en-GB")} days or fewer.`,
      422
    );
  }
  return dates;
}

function teacherName(profile: ProfileRow) {
  return [text(profile.first_name), text(profile.last_name)].filter(Boolean).join(" ") ||
    text(profile.email) ||
    "Unnamed Teacher";
}

async function loadTeacherProfiles() {
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("id, first_name, last_name, email, active")
    .eq("role", "teacher")
    .order("last_name", { ascending: true })
    .order("first_name", { ascending: true });
  if (error) throw new Error("Unable to load Teacher profiles.");
  return (data || []) as ProfileRow[];
}

async function loadEmploymentRecords(startDate: string, endDate: string, teacherIds?: string[]) {
  let query = supabaseAdmin
    .from("staff_time_employment_records")
    .select("*")
    .lte("effective_from", endDate)
    .or(`effective_to.is.null,effective_to.gte.${startDate}`)
    .order("effective_from", { ascending: false });
  if (teacherIds?.length) query = query.in("teacher_id", teacherIds);
  const { data, error } = await query;
  if (error) throw new Error("Unable to load Staff Time employment records.");
  return (data || []).map((row) => ({
    ...row,
    contracted_weekly_hours: Number(row.contracted_weekly_hours),
  })) as StaffTimeEmploymentRecord[];
}

async function loadSchedules(startDate: string, endDate: string, teacherIds?: string[]) {
  let query = supabaseAdmin
    .from("staff_work_schedules")
    .select("*")
    .lte("effective_from", endDate)
    .or(`effective_to.is.null,effective_to.gte.${startDate}`)
    .order("effective_from", { ascending: false });
  if (teacherIds?.length) query = query.in("teacher_id", teacherIds);
  const { data, error } = await query;
  if (error) throw new Error("Unable to load Staff Time schedules.");
  const rows = (data || []) as Omit<StaffTimeSchedule, "intervals">[];
  const scheduleIds = rows.map((row) => row.id);
  const intervalMap = new Map<string, StaffTimeInterval[]>();
  if (scheduleIds.length) {
    const intervals = await supabaseAdmin
      .from("staff_work_schedule_intervals")
      .select("id, schedule_id, weekday, start_time, end_time")
      .in("schedule_id", scheduleIds)
      .order("weekday")
      .order("start_time");
    if (intervals.error) throw new Error("Unable to load schedule intervals.");
    for (const row of intervals.data || []) {
      const scheduleId = String(row.schedule_id);
      intervalMap.set(scheduleId, [
        ...(intervalMap.get(scheduleId) || []),
        {
          id: String(row.id),
          weekday: Number(row.weekday),
          start_time: text(row.start_time).slice(0, 5),
          end_time: text(row.end_time).slice(0, 5),
        },
      ]);
    }
  }
  return rows.map((row) => ({
    ...row,
    intervals: intervalMap.get(row.id) || [],
  })) as StaffTimeSchedule[];
}

async function loadRemoteAuthorisations(
  startDate: string,
  endDate: string,
  teacherIds?: string[],
  includeRevoked = false
) {
  let query = supabaseAdmin
    .from("staff_remote_work_authorisations")
    .select("*")
    .lte("start_date", endDate)
    .gte("end_date", startDate)
    .order("start_date", { ascending: false });
  if (!includeRevoked) query = query.is("revoked_at", null);
  if (teacherIds?.length) query = query.in("teacher_id", teacherIds);
  const { data, error } = await query;
  if (error) throw new Error("Unable to load remote-work authorisations.");
  return (data || []) as RemoteRow[];
}

async function loadCorrections(startDate: string, endDate: string, teacherIds?: string[]) {
  let query = supabaseAdmin
    .from("staff_time_corrections")
    .select("*")
    .gte("work_date", startDate)
    .lte("work_date", endDate)
    .order("submitted_at", { ascending: false });
  if (teacherIds?.length) query = query.in("teacher_id", teacherIds);
  const { data, error } = await query;
  if (error) throw new Error("Unable to load Staff Time corrections.");
  return (data || []) as CorrectionRow[];
}

async function loadIncidences(startDate: string, endDate: string, teacherIds?: string[]) {
  let query = supabaseAdmin
    .from("staff_time_incidences")
    .select("*")
    .gte("work_date", startDate)
    .lte("work_date", endDate)
    .order("work_date", { ascending: false })
    .order("detected_at", { ascending: false });
  if (teacherIds?.length) query = query.in("teacher_id", teacherIds);
  const { data, error } = await query;
  if (error) throw new Error("Unable to load Staff Time incidences.");
  return (data || []) as IncidenceRow[];
}

async function loadSessionBundle(startDate: string, endDate: string, teacherIds?: string[]) {
  let query = supabaseAdmin
    .from("staff_clock_sessions")
    .select("*")
    .gte("work_date", startDate)
    .lte("work_date", endDate)
    .order("opened_at", { ascending: true });
  if (teacherIds?.length) query = query.in("teacher_id", teacherIds);
  const { data, error } = await query;
  if (error) throw new Error("Unable to load official clock sessions.");
  const sessions = (data || []) as SessionRow[];
  const sessionIds = sessions.map((row) => row.id);
  let events: EventRow[] = [];
  if (sessionIds.length) {
    const eventResult = await supabaseAdmin
      .from("staff_clock_events")
      .select("*")
      .in("session_id", sessionIds)
      .order("occurred_at", { ascending: true });
    if (eventResult.error) throw new Error("Unable to load official clock events.");
    events = (eventResult.data || []) as EventRow[];
  }
  const corrections = await loadCorrections(startDate, endDate, teacherIds);
  return { sessions, events, corrections };
}

function effectiveSchedule(schedules: StaffTimeSchedule[], teacherId: string, date: string) {
  return (
    schedules.find(
      (schedule) =>
        schedule.teacher_id === teacherId &&
        schedule.effective_from <= date &&
        (!schedule.effective_to || schedule.effective_to >= date)
    ) || null
  );
}

function effectiveEmployment(
  records: StaffTimeEmploymentRecord[],
  teacherId: string,
  date: string
) {
  return (
    records.find(
      (record) =>
        record.teacher_id === teacherId &&
        record.effective_from <= date &&
        (!record.effective_to || record.effective_to >= date)
    ) || null
  );
}

function buildSessionViews(bundle: {
  sessions: SessionRow[];
  events: EventRow[];
  corrections: CorrectionRow[];
}) {
  const eventsBySession = new Map<string, EventRow[]>();
  for (const event of bundle.events) {
    eventsBySession.set(event.session_id, [
      ...(eventsBySession.get(event.session_id) || []),
      event,
    ]);
  }
  const approvedBySession = new Map<string, CorrectionRow>();
  for (const correction of bundle.corrections) {
    if (correction.status !== "approved" || !correction.session_id) continue;
    const current = approvedBySession.get(correction.session_id);
    const currentTime = current?.reviewed_at || current?.submitted_at || "";
    const nextTime = correction.reviewed_at || correction.submitted_at;
    if (!current || nextTime > currentTime) {
      approvedBySession.set(correction.session_id, correction);
    }
  }
  const views: StaffTimeSessionView[] = bundle.sessions.map((session) => {
    const events = eventsBySession.get(session.id) || [];
    const signIn = events.find((event) => event.event_type === "sign_in") || null;
    const signOut = events.find((event) => event.event_type === "sign_out") || null;
    const correction = approvedBySession.get(session.id) || null;
    return {
      id: session.id,
      teacher_id: session.teacher_id,
      work_date: session.work_date,
      clocking_mode: session.clocking_mode,
      original_sign_in_at: signIn?.occurred_at || session.opened_at,
      original_sign_out_at: signOut?.occurred_at || null,
      effective_sign_in_at:
        correction?.requested_sign_in_at || signIn?.occurred_at || session.opened_at,
      effective_sign_out_at: correction?.requested_sign_out_at || signOut?.occurred_at || null,
      corrected: Boolean(correction),
      correction_reason: correction?.reason || null,
      verification_result: signIn?.verification_result || "verified_school_network",
    };
  });
  for (const correction of bundle.corrections) {
    if (correction.status !== "approved" || correction.session_id) continue;
    views.push({
      id: `correction-${correction.id}`,
      teacher_id: correction.teacher_id,
      work_date: correction.work_date,
      clocking_mode: "authorised_remote",
      original_sign_in_at: "",
      original_sign_out_at: null,
      effective_sign_in_at: correction.requested_sign_in_at,
      effective_sign_out_at: correction.requested_sign_out_at,
      corrected: true,
      correction_reason: correction.reason,
      verification_result: "approved_correction",
    });
  }
  return views.sort((left, right) =>
    text(left.effective_sign_in_at).localeCompare(text(right.effective_sign_in_at))
  );
}

async function requestIpIsAuthorised(ip: string | null) {
  if (!ip) return false;
  const { data, error } = await supabaseAdmin.rpc("staff_match_allowed_network", {
    p_request_ip: ip,
  });
  if (error) throw new Error("Unable to verify the current network.");
  return Array.isArray(data) && data.length > 0;
}

function clockingAvailability(input: {
  employment: StaffTimeEmploymentRecord | null;
  closure: StaffTimeTeacherDay["closure"];
  remoteAuthorised: boolean;
  currentNetworkAuthorised: boolean;
}) {
  if (!input.employment) {
    return { available: false, reason: "Time registration has not been configured for your employment record." };
  }
  if (!input.employment.time_recording_enabled) {
    return { available: false, reason: "Time registration is currently disabled for your employment record." };
  }
  const remoteAllowed =
    input.employment.clocking_location_policy === "school_or_authorised_remote" &&
    input.remoteAuthorised;
  if (input.closure && !remoteAllowed) {
    return { available: false, reason: `School is closed today: ${input.closure.name}. No time registration is required.` };
  }
  if (!remoteAllowed && !input.currentNetworkAuthorised) {
    return {
      available: false,
      reason: "You must be connected to the authorised school network to register your working time.",
    };
  }
  return { available: true, reason: null };
}

export async function loadTeacherWorkingDay(actor: StaffTimeActor, requestIp: string | null) {
  const today = getMadridDate();
  const [employment, schedules, remoteRows, closures, bundle, incidences, networkAuthorised] =
    await Promise.all([
      loadEmploymentRecords(today, today, [actor.id]),
      loadSchedules(today, today, [actor.id]),
      loadRemoteAuthorisations(today, today, [actor.id]),
      loadSchoolClosures({ startDate: today, endDate: today }),
      loadSessionBundle(today, today, [actor.id]),
      loadIncidences(today, today, [actor.id]),
      requestIpIsAuthorised(requestIp),
    ]);
  const employmentRecord = effectiveEmployment(employment, actor.id, today);
  const schedule = effectiveSchedule(schedules, actor.id, today);
  const intervals = (schedule?.intervals || []).filter(
    (interval) => interval.weekday === getIsoWeekday(today)
  );
  const closure = closures[0]
    ? {
        id: closures[0].id,
        name: closures[0].name,
        closure_type: closures[0].closure_type,
      }
    : null;
  const remoteAuthorised = remoteRows.length > 0;
  const sessions = buildSessionViews(bundle);
  const pendingCorrectionCount = bundle.corrections.filter(
    (row) => row.status === "pending"
  ).length;
  const openIncidenceTypes = incidences
    .filter((row) => row.status === "open")
    .map((row) => row.incidence_type);
  const status = getStaffTimeDayStatus({
    nowDate: today,
    currentMinutes: getMadridMinutes(),
    workDate: today,
    intervals,
    sessions,
    closure,
    remoteAuthorised,
    pendingCorrectionCount,
    openIncidenceTypes,
  });
  const availability = clockingAvailability({
    employment: employmentRecord,
    closure,
    remoteAuthorised,
    currentNetworkAuthorised: networkAuthorised,
  });
  return {
    teacher_id: actor.id,
    teacher_name: [actor.first_name, actor.last_name].filter(Boolean).join(" "),
    date: today,
    employment: employmentRecord,
    schedule,
    planned_intervals: intervals,
    closure,
    remote_authorised: remoteAuthorised,
    sessions,
    pending_correction_count: pendingCorrectionCount,
    open_incidence_types: openIncidenceTypes,
    status: status.status,
    status_label: status.label,
    current_network_authorised: networkAuthorised,
    clocking_available: availability.available,
    unavailable_reason: availability.reason,
    now: new Date().toISOString(),
  } satisfies StaffTimeTeacherDay;
}

const CLOCK_DENIAL_MESSAGES: Record<string, string> = {
  denied_no_employment_record: "Time registration has not been configured for your employment record.",
  denied_recording_disabled: "Time registration is currently disabled for your employment record.",
  denied_school_closed: "School is closed today. No time registration is required.",
  denied_unauthorised_network:
    "You must be connected to the authorised school network to register your working time.",
  denied_already_signed_in: "You already have an open working session.",
  denied_no_open_session: "There is no open working session to sign out from.",
};

export async function clockTeacher(actor: StaffTimeActor, action: "sign_in" | "sign_out", ip: string | null) {
  if (!ip) {
    throw new StaffTimeError(
      "Sign-in is unavailable because the server could not verify the request network.",
      503
    );
  }
  const { data, error } = await supabaseAdmin.rpc(
    action === "sign_in" ? "staff_clock_in" : "staff_clock_out",
    { p_actor_id: actor.id, p_request_ip: ip }
  );
  if (error) throwDatabase(error, "Unable to record the clock action.");
  const result = (data || {}) as { ok?: boolean; reason?: string; occurred_at?: string };
  if (!result.ok) {
    throw new StaffTimeError(
      CLOCK_DENIAL_MESSAGES[result.reason || ""] || "The clock action could not be verified.",
      409
    );
  }
  return result;
}

function correctionInput(body: unknown) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new StaffTimeError("Invalid correction details.", 400);
  }
  const value = body as Record<string, unknown>;
  const workDate = text(value.work_date);
  const sessionId = value.session_id ? validUuid(value.session_id) : "";
  const signInTime = value.sign_in_time ? normalizeTime(value.sign_in_time) : "";
  const signOutTime = value.sign_out_time ? normalizeTime(value.sign_out_time) : "";
  const reason = text(value.reason);
  if (!isIsoDate(workDate)) throw new StaffTimeError("Choose a valid work date.", 422);
  if (workDate > getMadridDate()) {
    throw new StaffTimeError("A correction cannot be created for a future work date.", 422);
  }
  if (value.session_id && !sessionId) throw new StaffTimeError("Choose a valid session.", 422);
  if (!signInTime && !signOutTime) {
    throw new StaffTimeError("Add a requested sign-in or sign-out time.", 422);
  }
  if (!reason || reason.length > 2000) {
    throw new StaffTimeError("Add a reason of no more than 2,000 characters.", 422);
  }
  const signInAt = signInTime ? madridLocalToIso(workDate, signInTime) : null;
  const signOutAt = signOutTime ? madridLocalToIso(workDate, signOutTime) : null;
  if (signInAt && signOutAt && signOutAt <= signInAt) {
    throw new StaffTimeError("Sign-out must be later than sign-in.", 422);
  }
  return { workDate, sessionId: sessionId || null, signInAt, signOutAt, reason };
}

export async function submitTeacherCorrection(actor: StaffTimeActor, body: unknown) {
  const parsed = correctionInput(body);
  const requestType = text((body as Record<string, unknown>).request_type);
  if (
    ![
      "forgot_sign_in",
      "forgot_sign_out",
      "incorrect_clock_action",
      "technical_problem",
      "other",
    ].includes(requestType)
  ) {
    throw new StaffTimeError("Choose a valid correction reason type.", 422);
  }
  const { data, error } = await supabaseAdmin.rpc("staff_submit_time_correction", {
    p_actor_id: actor.id,
    p_work_date: parsed.workDate,
    p_session_id: parsed.sessionId,
    p_requested_sign_in_at: parsed.signInAt,
    p_requested_sign_out_at: parsed.signOutAt,
    p_request_type: requestType,
    p_reason: parsed.reason,
  });
  if (error) throwDatabase(error, "Unable to submit the correction request.");
  return data;
}

export async function loadAdminToday(actor: StaffTimeActor, requestIp: string | null) {
  const today = getMadridDate();
  await refreshIncidences(actor.id, addCalendarDays(today, -7), today);
  const profiles = await loadTeacherProfiles();
  const teacherIds = profiles.map((profile) => profile.id);
  if (!teacherIds.length) return { date: today, rows: [] };
  const [employment, schedules, remotes, closures, bundle, incidences, networkAuthorised] =
    await Promise.all([
      loadEmploymentRecords(today, today, teacherIds),
      loadSchedules(today, today, teacherIds),
      loadRemoteAuthorisations(today, today, teacherIds),
      loadSchoolClosures({ startDate: today, endDate: today }),
      loadSessionBundle(today, today, teacherIds),
      loadIncidences(today, today, teacherIds),
      requestIpIsAuthorised(requestIp),
    ]);
  const allSessionViews = buildSessionViews(bundle);
  const closure = closures[0]
    ? { id: closures[0].id, name: closures[0].name, closure_type: closures[0].closure_type }
    : null;
  const rows = profiles.map((profile) => {
    const record = effectiveEmployment(employment, profile.id, today);
    const schedule = effectiveSchedule(schedules, profile.id, today);
    const intervals = (schedule?.intervals || []).filter(
      (interval) => interval.weekday === getIsoWeekday(today)
    );
    const sessions = allSessionViews.filter((session) => session.teacher_id === profile.id);
    const pending = bundle.corrections.filter(
      (correction) => correction.teacher_id === profile.id && correction.status === "pending"
    ).length;
    const openIncidenceTypes = incidences
      .filter((incidence) => incidence.teacher_id === profile.id && incidence.status === "open")
      .map((incidence) => incidence.incidence_type);
    const remoteAuthorised = remotes.some((remote) => remote.teacher_id === profile.id);
    const status = getStaffTimeDayStatus({
      nowDate: today,
      currentMinutes: getMadridMinutes(),
      workDate: today,
      intervals,
      sessions,
      closure,
      remoteAuthorised,
      pendingCorrectionCount: pending,
      openIncidenceTypes,
    });
    return {
      teacher_id: profile.id,
      teacher_name: teacherName(profile),
      profile_active: profile.active !== false,
      planned: closure ? "School closed" : plannedIntervalLabel(intervals),
      sessions,
      status: status.status,
      status_label: status.label,
      remote_authorised: remoteAuthorised,
      network_verification:
        sessions.at(-1)?.verification_result === "authorised_remote"
          ? "Authorised remote"
          : sessions.length
            ? "School network verified"
            : "—",
      incidence_types: openIncidenceTypes,
      configured: Boolean(record),
    };
  });
  return { date: today, rows, current_admin_network_authorised: networkAuthorised };
}

export async function loadAdminTeacherArea(options: {
  teacherId?: string;
  startDate?: string;
  endDate?: string;
}) {
  const today = getMadridDate();
  const profiles = await loadTeacherProfiles();
  const allIds = profiles.map((profile) => profile.id);
  const selectedId = options.teacherId && allIds.includes(options.teacherId) ? options.teacherId : "";
  const startDate = options.startDate || addCalendarDays(today, -30);
  const endDate = options.endDate || today;
  validateDateRange(startDate, endDate);
  const configStart = "1900-01-01";
  const [employment, schedules, remotes] = await Promise.all([
    loadEmploymentRecords(configStart, "9999-12-31", allIds),
    loadSchedules(configStart, "9999-12-31", allIds),
    loadRemoteAuthorisations(configStart, "9999-12-31", allIds, true),
  ]);
  const teachers = profiles.map((profile) => ({
    id: profile.id,
    name: teacherName(profile),
    email: profile.email,
    active: profile.active !== false,
    employment_records: employment.filter((record) => record.teacher_id === profile.id),
    schedules: schedules.filter((schedule) => schedule.teacher_id === profile.id),
    remote_authorisations: remotes.filter((remote) => remote.teacher_id === profile.id),
  }));
  if (!selectedId) return { teachers, selected: null, start_date: startDate, end_date: endDate };
  const [bundle, incidences, attempts] = await Promise.all([
    loadSessionBundle(startDate, endDate, [selectedId]),
    loadIncidences(startDate, endDate, [selectedId]),
    supabaseAdmin
      .from("staff_clock_attempts")
      .select("*")
      .eq("teacher_id", selectedId)
      .gte("attempted_at", `${startDate}T00:00:00Z`)
      .lte("attempted_at", `${addCalendarDays(endDate, 1)}T00:00:00Z`)
      .order("attempted_at", { ascending: false }),
  ]);
  if (attempts.error) throw new Error("Unable to load clock verification audit.");
  return {
    teachers,
    selected: {
      teacher: teachers.find((teacher) => teacher.id === selectedId),
      sessions: buildSessionViews(bundle),
      corrections: bundle.corrections,
      incidences,
      attempts: attempts.data || [],
    },
    start_date: startDate,
    end_date: endDate,
  };
}

export async function refreshIncidences(actorId: string, startDate: string, endDate: string) {
  validateDateRange(startDate, endDate, 367);
  const { data, error } = await supabaseAdmin.rpc("refresh_staff_time_incidences", {
    p_actor_id: actorId,
    p_start_date: startDate,
    p_end_date: endDate,
  });
  if (error) throwDatabase(error, "Unable to refresh Staff Time incidences.");
  return Number(data) || 0;
}

export async function loadAdminIncidences(actor: StaffTimeActor, startDate: string, endDate: string) {
  validateDateRange(startDate, endDate, 367);
  await refreshIncidences(actor.id, startDate, endDate);
  const profiles = await loadTeacherProfiles();
  const names = new Map(profiles.map((profile) => [profile.id, teacherName(profile)]));
  const [incidences, corrections] = await Promise.all([
    loadIncidences(startDate, endDate),
    loadCorrections(startDate, endDate),
  ]);
  return {
    start_date: startDate,
    end_date: endDate,
    incidences: incidences.map((row) => ({ ...row, teacher_name: names.get(row.teacher_id) || "Teacher" })),
    corrections: corrections.map((row) => ({ ...row, teacher_name: names.get(row.teacher_id) || "Teacher" })),
  };
}

export async function loadAdminSettings(requestIp: string | null) {
  const [company, networks] = await Promise.all([
    supabaseAdmin
      .from("staff_time_company_settings")
      .select("*")
      .order("effective_from", { ascending: false }),
    supabaseAdmin
      .from("staff_allowed_networks")
      .select("*")
      .order("active", { ascending: false })
      .order("label", { ascending: true }),
  ]);
  if (company.error) throw new Error("Unable to load company settings.");
  if (networks.error) throw new Error("Unable to load allowed networks.");
  return {
    company_history: company.data || [],
    current_company: (company.data || []).find((row) => !row.effective_to) || null,
    networks: networks.data || [],
    current_ip: requestIp,
  };
}

function objectBody(body: unknown) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new StaffTimeError("Invalid Staff Time request.", 400);
  }
  return body as Record<string, unknown>;
}

function requireText(value: unknown, label: string, max = 200) {
  const result = text(value);
  if (!result || result.length > max) {
    throw new StaffTimeError(`${label} is required and must be ${max} characters or fewer.`, 422);
  }
  return result;
}

export async function saveCompanySettings(actor: StaffTimeActor, body: unknown) {
  const value = objectBody(body);
  const effectiveFrom = text(value.effective_from);
  if (!isIsoDate(effectiveFrom)) throw new StaffTimeError("Choose a valid effective date.", 422);
  const params = {
    p_actor_id: actor.id,
    p_effective_from: effectiveFrom,
    p_legal_employer_name: requireText(value.legal_employer_name, "Legal employer name"),
    p_tax_identifier: requireText(value.tax_identifier, "CIF/NIF", 32),
    p_workplace_name: requireText(value.workplace_name, "Workplace name"),
    p_workplace_address: requireText(value.workplace_address, "Workplace address", 300),
    p_postcode: requireText(value.postcode, "Postcode", 20),
    p_city: requireText(value.city, "City", 100),
    p_province: requireText(value.province, "Province", 100),
    p_country: requireText(value.country, "Country", 100),
  };
  const { data, error } = await supabaseAdmin.rpc("save_staff_time_company_settings", params);
  if (error) throwDatabase(error, "Unable to save company settings.");
  return data;
}

export async function saveEmploymentRecord(actor: StaffTimeActor, body: unknown) {
  const value = objectBody(body);
  const teacherId = validUuid(value.teacher_id);
  const effectiveFrom = text(value.effective_from);
  const workingType = text(value.working_time_type) as StaffTimeWorkingType;
  const policy = text(value.clocking_location_policy) as StaffTimeLocationPolicy;
  const hours = Number(value.contracted_weekly_hours);
  if (!teacherId || !isIsoDate(effectiveFrom)) {
    throw new StaffTimeError("Choose a Teacher and valid effective date.", 422);
  }
  if (!["full_time", "part_time"].includes(workingType)) {
    throw new StaffTimeError("Choose a valid working-time type.", 422);
  }
  if (!["school_network_only", "school_or_authorised_remote"].includes(policy)) {
    throw new StaffTimeError("Choose a valid clocking-location policy.", 422);
  }
  if (!Number.isFinite(hours) || hours <= 0 || hours > 168) {
    throw new StaffTimeError("Contracted weekly hours must be between 0 and 168.", 422);
  }
  const { data, error } = await supabaseAdmin.rpc("save_staff_time_employment_record", {
    p_actor_id: actor.id,
    p_teacher_id: teacherId,
    p_effective_from: effectiveFrom,
    p_dni_nie: requireText(value.dni_nie, "DNI/NIE", 32),
    p_job_title: requireText(value.job_title, "Job title", 160),
    p_working_time_type: workingType,
    p_contracted_weekly_hours: hours,
    p_time_recording_enabled: value.time_recording_enabled === true,
    p_clocking_location_policy: policy,
  });
  if (error) throwDatabase(error, "Unable to save the employment record.");
  return data;
}

export async function saveWorkSchedule(actor: StaffTimeActor, body: unknown) {
  const value = objectBody(body);
  const teacherId = validUuid(value.teacher_id);
  const effectiveFrom = text(value.effective_from);
  if (!teacherId || !isIsoDate(effectiveFrom)) {
    throw new StaffTimeError("Choose a Teacher and valid effective date.", 422);
  }
  if (!Array.isArray(value.intervals) || value.intervals.length > 35) {
    throw new StaffTimeError("Add no more than 35 weekly schedule intervals.", 422);
  }
  const intervals = value.intervals.map((item) => {
    const row = objectBody(item);
    const weekday = Number(row.weekday);
    const startTime = normalizeTime(row.start_time);
    const endTime = normalizeTime(row.end_time);
    if (!Number.isInteger(weekday) || weekday < 1 || weekday > 7 || !startTime || !endTime) {
      throw new StaffTimeError("Every schedule interval needs a weekday, start and end time.", 422);
    }
    if ((Number(endTime.slice(0, 2)) * 60 + Number(endTime.slice(3))) <=
      (Number(startTime.slice(0, 2)) * 60 + Number(startTime.slice(3)))) {
      throw new StaffTimeError("Each schedule end time must be after its start time.", 422);
    }
    return { weekday, start_time: startTime, end_time: endTime };
  });
  const { data, error } = await supabaseAdmin.rpc("save_staff_work_schedule", {
    p_actor_id: actor.id,
    p_teacher_id: teacherId,
    p_effective_from: effectiveFrom,
    p_label: text(value.label),
    p_intervals: intervals,
  });
  if (error) throwDatabase(error, "Unable to save the weekly work schedule.");
  return data;
}

export async function addAllowedNetwork(
  actor: StaffTimeActor,
  body: unknown,
  requestIp: string | null,
  useCurrentIp: boolean
) {
  const value = objectBody(body);
  const network = useCurrentIp ? requestIp : text(value.network);
  if (!network) {
    throw new StaffTimeError("The server could not determine the current public IP.", 422);
  }
  const { data, error } = await supabaseAdmin
    .from("staff_allowed_networks")
    .insert({
      label: requireText(value.label, "Network label", 120),
      network,
      active: true,
      created_by: actor.id,
      updated_by: actor.id,
    })
    .select("*")
    .single();
  if (error) throwDatabase(error, "Unable to add the allowed school network.");
  return data;
}

export async function toggleAllowedNetwork(actor: StaffTimeActor, body: unknown) {
  const value = objectBody(body);
  const id = validUuid(value.id);
  if (!id || typeof value.active !== "boolean") {
    throw new StaffTimeError("Choose a valid network status.", 422);
  }
  const { data, error } = await supabaseAdmin
    .from("staff_allowed_networks")
    .update({ active: value.active, updated_by: actor.id })
    .eq("id", id)
    .select("*")
    .single();
  if (error) throwDatabase(error, "Unable to update the allowed school network.");
  return data;
}

export async function authoriseRemoteWork(actor: StaffTimeActor, body: unknown) {
  const value = objectBody(body);
  const teacherId = validUuid(value.teacher_id);
  const startDate = text(value.start_date);
  const endDate = text(value.end_date);
  if (!teacherId) throw new StaffTimeError("Choose a Teacher.", 422);
  validateDateRange(startDate, endDate, 366);
  const { data, error } = await supabaseAdmin
    .from("staff_remote_work_authorisations")
    .insert({
      teacher_id: teacherId,
      start_date: startDate,
      end_date: endDate,
      reason: text(value.reason) || null,
      authorised_by: actor.id,
    })
    .select("*")
    .single();
  if (error) throwDatabase(error, "Unable to authorise remote work.");
  return data;
}

export async function revokeRemoteWork(actor: StaffTimeActor, body: unknown) {
  const value = objectBody(body);
  const id = validUuid(value.id);
  if (!id) throw new StaffTimeError("Choose a valid remote-work authorisation.", 422);
  const { data, error } = await supabaseAdmin
    .from("staff_remote_work_authorisations")
    .update({
      revoked_by: actor.id,
      revoked_at: new Date().toISOString(),
      revocation_reason: text(value.reason) || "Revoked by Admin.",
    })
    .eq("id", id)
    .is("revoked_at", null)
    .select("*")
    .single();
  if (error) throwDatabase(error, "Unable to revoke remote work.");
  return data;
}

export async function reviewCorrection(actor: StaffTimeActor, body: unknown) {
  const value = objectBody(body);
  const id = validUuid(value.id);
  const decision = text(value.decision);
  if (!id || !["approved", "rejected"].includes(decision)) {
    throw new StaffTimeError("Choose a pending correction and review decision.", 422);
  }
  const { data, error } = await supabaseAdmin.rpc("staff_review_time_correction", {
    p_actor_id: actor.id,
    p_correction_id: id,
    p_decision: decision,
    p_review_note: text(value.review_note),
  });
  if (error) throwDatabase(error, "Unable to review the correction.");
  return data;
}

export async function createManualCorrection(actor: StaffTimeActor, body: unknown) {
  const value = objectBody(body);
  const teacherId = validUuid(value.teacher_id);
  if (!teacherId) throw new StaffTimeError("Choose a Teacher.", 422);
  const parsed = correctionInput(value);
  const { data, error } = await supabaseAdmin.rpc("staff_admin_create_time_correction", {
    p_actor_id: actor.id,
    p_teacher_id: teacherId,
    p_work_date: parsed.workDate,
    p_session_id: parsed.sessionId,
    p_requested_sign_in_at: parsed.signInAt,
    p_requested_sign_out_at: parsed.signOutAt,
    p_reason: parsed.reason,
  });
  if (error) throwDatabase(error, "Unable to create the audited correction.");
  return data;
}

export async function resolveIncidence(actor: StaffTimeActor, body: unknown) {
  const value = objectBody(body);
  const id = validUuid(value.id);
  const status = text(value.status);
  if (!id || !["resolved", "dismissed"].includes(status)) {
    throw new StaffTimeError("Choose a valid incidence resolution.", 422);
  }
  const { data, error } = await supabaseAdmin
    .from("staff_time_incidences")
    .update({
      status,
      resolved_by: actor.id,
      resolved_at: new Date().toISOString(),
      resolution_note: requireText(value.resolution_note, "Resolution note", 2000),
    })
    .eq("id", id)
    .eq("status", "open")
    .select("*")
    .single();
  if (error) throwDatabase(error, "Unable to resolve the incidence.");
  return data;
}

async function companySettingsForDate(date: string) {
  const { data, error } = await supabaseAdmin
    .from("staff_time_company_settings")
    .select("*")
    .lte("effective_from", date)
    .or(`effective_to.is.null,effective_to.gte.${date}`)
    .order("effective_from", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error("Unable to load company settings for the report period.");
  if (!data) {
    throw new StaffTimeError(
      "Configure company and workplace legal details for the selected report period before exporting.",
      422
    );
  }
  return { ...data, retention_years: Number(data.retention_years) } as StaffTimeCompanySettings;
}

export async function buildStaffTimeReport(input: {
  startDate: string;
  endDate: string;
  teacherId?: string;
}) {
  const dates = validateDateRange(input.startDate, input.endDate);
  const profiles = await loadTeacherProfiles();
  const selectedProfiles = input.teacherId
    ? profiles.filter((profile) => profile.id === input.teacherId)
    : profiles;
  if (input.teacherId && !selectedProfiles.length) {
    throw new StaffTimeError("The selected Teacher was not found.", 404);
  }
  const teacherIds = selectedProfiles.map((profile) => profile.id);
  const [company, employment, schedules, remotes, closures, bundle, incidences] =
    await Promise.all([
      companySettingsForDate(input.startDate),
      loadEmploymentRecords(input.startDate, input.endDate, teacherIds),
      loadSchedules(input.startDate, input.endDate, teacherIds),
      loadRemoteAuthorisations(input.startDate, input.endDate, teacherIds),
      loadSchoolClosures({ startDate: input.startDate, endDate: input.endDate }),
      loadSessionBundle(input.startDate, input.endDate, teacherIds),
      loadIncidences(input.startDate, input.endDate, teacherIds),
    ]);
  const sessionViews = buildSessionViews(bundle);
  const reportTeachers: StaffTimeReportTeacher[] = [];
  for (const profile of selectedProfiles) {
    const employmentForPeriod = employment.filter((row) => row.teacher_id === profile.id);
    if (!employmentForPeriod.length) continue;
    const headerEmployment =
      effectiveEmployment(employmentForPeriod, profile.id, input.startDate) ||
      [...employmentForPeriod].sort((a, b) => a.effective_from.localeCompare(b.effective_from))[0];
    const days: StaffTimeReportDay[] = dates.map((date) => {
      const schedule = effectiveSchedule(schedules, profile.id, date);
      const intervals = (schedule?.intervals || []).filter(
        (interval) => interval.weekday === getIsoWeekday(date)
      );
      const closureRow = closures.find(
        (item) => item.start_date <= date && item.end_date >= date
      );
      const closure = closureRow
        ? { id: closureRow.id, name: closureRow.name, closure_type: closureRow.closure_type }
        : null;
      const daySessions = sessionViews.filter(
        (session) => session.teacher_id === profile.id && session.work_date === date
      );
      const reportSessions: StaffTimeReportSession[] = daySessions.map((session) => ({
        sign_in_at: session.effective_sign_in_at,
        sign_out_at: session.effective_sign_out_at,
        original_sign_in_at: session.original_sign_in_at || null,
        original_sign_out_at: session.original_sign_out_at,
        corrected: session.corrected,
        correction_reason: session.correction_reason,
        clocking_mode: session.id.startsWith("correction-")
          ? "correction"
          : session.clocking_mode,
      }));
      const minutes = reportSessions.reduce(
        (sum, session) => sum + minutesBetween(session.sign_in_at, session.sign_out_at),
        0
      );
      const dayIncidences = incidences.filter(
        (row) => row.teacher_id === profile.id && row.work_date === date && row.status === "open"
      );
      const corrected = reportSessions.some((session) => session.corrected);
      const remote = reportSessions.some(
        (session) => session.clocking_mode === "authorised_remote"
      );
      let situation = "";
      if (closure && !reportSessions.length) situation = spanishClosureLabel(closure);
      else if (!intervals.length && !reportSessions.length) situation = "No laborable según horario";
      else if (dayIncidences.length) {
        situation = dayIncidences
          .map((row) =>
            row.incidence_type === "missing_sign_in"
              ? "Falta fichaje de entrada"
              : row.incidence_type === "missing_sign_out"
                ? "Falta fichaje de salida"
                : "Incidencia de fichaje"
          )
          .join("; ");
      } else if (corrected) situation = "Registro rectificado";
      else if (remote) situation = "Trabajo a distancia autorizado";
      else if (reportSessions.length && reportSessions.every((row) => row.sign_out_at)) {
        situation = "Registro completo";
      } else if (reportSessions.length) situation = "Falta fichaje de salida";
      else situation = "Sin registro";
      return {
        date,
        weekday: new Intl.DateTimeFormat("es-ES", {
          weekday: "long",
          timeZone: "UTC",
        })
          .format(new Date(`${date}T12:00:00Z`))
          .replace(/^./, (character) => character.toUpperCase()),
        planned: closure ? "—" : plannedIntervalLabel(intervals),
        sessions: reportSessions,
        entries: reportSessions.map((row) => row.sign_in_at).filter(Boolean).join("\n"),
        exits: reportSessions.map((row) => row.sign_out_at).filter(Boolean).join("\n"),
        registered_minutes: minutes,
        situation,
        incidence: dayIncidences.map((row) => row.incidence_type).join(", "),
        corrected,
        closure,
      };
    });
    reportTeachers.push({
      teacher_id: profile.id,
      name: `${headerEmployment.legal_first_name} ${headerEmployment.legal_last_name}`.trim(),
      dni_nie: headerEmployment.dni_nie,
      job_title: headerEmployment.job_title,
      working_time_type: headerEmployment.working_time_type,
      contracted_weekly_hours: headerEmployment.contracted_weekly_hours,
      days,
      totals: {
        recorded_days: days.filter((day) => day.sessions.length > 0).length,
        planned_minutes: days.reduce((sum, day) => {
          if (day.closure) return sum;
          const schedule = effectiveSchedule(schedules, profile.id, day.date);
          return (
            sum +
            plannedMinutes(
              (schedule?.intervals || []).filter(
                (interval) => interval.weekday === getIsoWeekday(day.date)
              )
            )
          );
        }, 0),
        registered_minutes: days.reduce((sum, day) => sum + day.registered_minutes, 0),
        closure_days: days.filter((day) => Boolean(day.closure)).length,
        incidences: days.filter((day) => Boolean(day.incidence)).length,
        corrected_records: days.filter((day) => day.corrected).length,
      },
    });
  }
  return {
    generated_at: new Date().toISOString(),
    start_date: input.startDate,
    end_date: input.endDate,
    period_label: reportPeriodLabel(input.startDate, input.endDate),
    company,
    teachers: reportTeachers,
  } satisfies StaffTimeReportData;
}

export function parseReportQuery(request: NextRequest) {
  const startDate = text(request.nextUrl.searchParams.get("start"));
  const endDate = text(request.nextUrl.searchParams.get("end"));
  const teacherValue = text(request.nextUrl.searchParams.get("teacher"));
  validateDateRange(startDate, endDate);
  const teacherId = teacherValue && teacherValue !== "all" ? validUuid(teacherValue) : "";
  if (teacherValue && teacherValue !== "all" && !teacherId) {
    throw new StaffTimeError("Choose a valid Teacher for the report.", 422);
  }
  return { startDate, endDate, teacherId: teacherId || undefined };
}
