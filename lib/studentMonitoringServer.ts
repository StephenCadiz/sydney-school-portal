import "server-only";

import { NextRequest } from "next/server";
import { getMadridDate } from "./staffTime";
import { supabaseAdmin } from "./supabaseAdmin";

export type MonitoringStatus =
  | "awaiting_teacher_feedback"
  | "monitoring_continued"
  | "overdue"
  | "feedback_submitted"
  | "kept"
  | "moved_up"
  | "moved_down"
  | "continued"
  | "closed";

export type MonitoringRecord = {
  id: string;
  student_id: string | null;
  student_type: "profile" | "young_learner";
  young_learner_id?: string | null;
  class_id: string;
  level_id: number;
  teacher_id: string;
  reason: string;
  feedback_due_on: string;
  status: MonitoringStatus;
  created_by: string;
  created_at: string;
  updated_at: string;
  submitted_at: string | null;
  decided_at: string | null;
  decided_by: string | null;
  decision: string | null;
  admin_notes: string | null;
  continue_count: number;
  student_name?: string;
  programme?: string;
  class_name?: string;
  days?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  level_name?: string;
  teacher_name?: string;
  feedback?: Record<string, unknown> | null;
};

function bearerToken(request: NextRequest) {
  const value = request.headers.get("authorization") || "";
  return value.startsWith("Bearer ") ? value.slice(7) : "";
}

export async function authenticateMonitoringActor(request: NextRequest) {
  const token = bearerToken(request);
  if (!token) return { actor: null, error: { message: "Authentication required.", status: 401 } };
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) return { actor: null, error: { message: "Authentication required.", status: 401 } };
  const { data: profile, error: profileError } = await supabaseAdmin
    .from("profiles").select("id, role, first_name, last_name").eq("id", data.user.id).maybeSingle();
  if (profileError) return { actor: null, error: { message: "Unable to verify access.", status: 500 } };
  if (!profile || !["admin", "teacher"].includes(String(profile.role))) {
    return { actor: null, error: { message: "Monitoring access denied.", status: 403 } };
  }
  return { actor: { id: String(profile.id), role: String(profile.role), profile }, error: null };
}

function effectiveStatus(row: any, today = getMadridDate()): MonitoringStatus {
  if (["awaiting_teacher_feedback", "monitoring_continued"].includes(String(row.status)) && String(row.feedback_due_on) < today) {
    return "overdue";
  }
  return String(row.status) as MonitoringStatus;
}

async function decorate(rows: any[]): Promise<MonitoringRecord[]> {
  const studentIds = [...new Set(rows.filter((row) => row.student_type !== "young_learner").map((row) => String(row.student_id)).filter(Boolean))];
  const youngLearnerIds = [...new Set(rows.filter((row) => row.student_type === "young_learner").map((row) => String(row.young_learner_id)).filter(Boolean))];
  const classIds = [...new Set(rows.map((row) => String(row.class_id)).filter(Boolean))];
  const levelIds = [...new Set(rows.map((row) => Number(row.level_id)).filter(Number.isFinite))];
  const [students, youngLearners, classes, levels, teachers, feedback] = await Promise.all([
    studentIds.length ? supabaseAdmin.from("profiles").select("id, first_name, last_name").in("id", studentIds) : { data: [], error: null },
    youngLearnerIds.length ? supabaseAdmin.from("young_learners").select("id, first_name, last_name").in("id", youngLearnerIds) : { data: [], error: null },
    classIds.length ? supabaseAdmin.from("classes").select("id, class_name, days, start_time, end_time, is_cambridge").in("id", classIds) : { data: [], error: null },
    levelIds.length ? supabaseAdmin.from("levels").select("id, name").in("id", levelIds) : { data: [], error: null },
    [...new Set(rows.map((row) => String(row.teacher_id)).filter(Boolean))].length
      ? supabaseAdmin.from("profiles").select("id, first_name, last_name").in("id", [...new Set(rows.map((row) => String(row.teacher_id)).filter(Boolean))])
      : { data: [], error: null },
    rows.length ? supabaseAdmin.from("student_monitoring_feedback").select("*").in("monitoring_id", rows.map((row) => row.id)).order("submitted_at", { ascending: false }) : { data: [], error: null },
  ]);
  const byId = (values: any[]) => new Map((values || []).map((value) => [String(value.id), value]));
  const studentById = byId(students.data || []), youngLearnerById = byId(youngLearners.data || []), classById = byId(classes.data || []), levelById = byId(levels.data || []), teacherById = byId(teachers.data || []);
  const feedbackById = new Map<string, any>();
  for (const item of feedback.data || []) if (!feedbackById.has(String(item.monitoring_id))) feedbackById.set(String(item.monitoring_id), item);
  return rows.map((row) => {
    const student = row.student_type === "young_learner" ? youngLearnerById.get(String(row.young_learner_id)) : studentById.get(String(row.student_id));
    const teacher = teacherById.get(String(row.teacher_id));
    const classroom = classById.get(String(row.class_id));
    return { ...row, status: effectiveStatus(row), programme: row.student_type === "young_learner" ? "Young Learner" : "Cambridge", student_name: `${student?.first_name || ""} ${student?.last_name || ""}`.trim() || "Student", class_name: classroom?.class_name || "Class", days: classroom?.days || null, start_time: classroom?.start_time || null, end_time: classroom?.end_time || null, level_name: levelById.get(String(row.level_id))?.name || "Level", teacher_name: `${teacher?.first_name || ""} ${teacher?.last_name || ""}`.trim() || "Teacher", feedback: feedbackById.get(String(row.id)) || null };
  });
}

export async function loadMonitoringRecords(actorId: string, role: string, classId?: string) {
  let query = supabaseAdmin.from("student_monitoring_records").select("*").order("feedback_due_on", { ascending: true }).order("created_at", { ascending: false });
  if (role === "teacher") query = query.eq("teacher_id", actorId);
  if (classId) query = query.eq("class_id", classId);
  const { data, error } = await query;
  if (error) throw error;
  const rows = data || [];
  if (role === "teacher" && rows.length) {
    const classIds = [...new Set(rows.map((row) => String(row.class_id)).filter(Boolean))];
    const { data: assignedClasses, error: classError } = await supabaseAdmin
      .from("classes").select("id").in("id", classIds).eq("teacher_id", actorId);
    if (classError) throw classError;
    const allowed = new Set((assignedClasses || []).map((row) => String(row.id)));
    return decorate(rows.filter((row) => allowed.has(String(row.class_id))));
  }
  return decorate(rows);
}

export type MonitoringStudentMatch = {
  id: string;
  student_type: "profile" | "young_learner";
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  enrolments: MonitoringEnrolment[];
};

export type MonitoringEnrolment = {
  student_type: "profile" | "young_learner";
  class_id: string;
  class_name: string;
  level_id: number;
  level_name: string;
  days: string | null;
  start_time: string | null;
  end_time: string | null;
  teacher_id: string;
  teacher_name: string;
  starts_on: string;
  ends_before: string | null;
};

function normalizeMonitoringName(value: unknown) {
  return String(value || "").toLocaleLowerCase().trim().replace(/\s+/g, " ");
}

function monitoringNameMatches(firstName: unknown, lastName: unknown, search: string) {
  const query = normalizeMonitoringName(search);
  if (!query) return false;
  const fullName = normalizeMonitoringName(`${firstName || ""} ${lastName || ""}`);
  const reversedName = normalizeMonitoringName(`${lastName || ""} ${firstName || ""}`);
  const variants = [fullName, reversedName].filter(Boolean);
  if (variants.some((name) => name.includes(query))) return true;
  return query.split(" ").filter(Boolean).every((token) => variants.some((name) => name.includes(token)));
}

function monitoringSearchTokens(search: string) {
  return [...new Set(normalizeMonitoringName(search).split(" ").filter(Boolean))];
}

function monitoringIlikeFilters(search: string) {
  return monitoringSearchTokens(search)
    .flatMap((token) => {
      const escaped = token.replace(/[\\%,_]/g, "\\$&");
      return [`first_name.ilike.%${escaped}%`, `last_name.ilike.%${escaped}%`];
    })
    .join(",");
}

export async function searchMonitoringStudents(search: string) {
  const normalizedSearch = normalizeMonitoringName(search);
  if (normalizedSearch.length < 2) return [] as MonitoringStudentMatch[];
  const nameFilters = monitoringIlikeFilters(normalizedSearch);
  // Use the same roster view as Admin and Teacher class lists. It preserves
  // legacy profile rows whose active flag is null while still excluding
  // inactive, cancelled, or ended enrolments below.
  const { data: rosterProfiles, error: profileError } = await supabaseAdmin
    .from("class_roster_profiles")
    .select("student_id, first_name, last_name, email, class_id, enrolled_at, ends_before, active")
    .or(nameFilters)
    .limit(100);
  if (profileError) throw profileError;
  const today = getMadridDate();
  const profileRosterRows = (rosterProfiles || []).filter((row) =>
    monitoringNameMatches(row.first_name, row.last_name, normalizedSearch) &&
    row.active !== false &&
    String(row.enrolled_at || "") <= today &&
    (!row.ends_before || today < String(row.ends_before))
  );
  const profileClassIds = [...new Set(profileRosterRows.map((period) => String(period.class_id)).filter(Boolean))];
  const { data: profileClasses, error: profileClassError } = profileClassIds.length
    ? await supabaseAdmin.from("classes").select("id").in("id", profileClassIds).eq("is_cambridge", true)
    : { data: [], error: null };
  if (profileClassError) throw profileClassError;
  const cambridgeClassIds = new Set((profileClasses || []).map((row) => String(row.id)));
  const profileMatches = [...new Map(profileRosterRows.filter((row) => cambridgeClassIds.has(String(row.class_id))).map((profile) => [String(profile.student_id), {
    id: String(profile.student_id), student_type: "profile" as const, first_name: profile.first_name || null, last_name: profile.last_name || null, email: profile.email || null,
  }])).values()];

  const { data: youngLearners, error: youngLearnerError } = await supabaseAdmin
    .from("young_learners").select("id, first_name, last_name, active").eq("active", true)
    .or(nameFilters).order("last_name").order("first_name").limit(100);
  if (youngLearnerError) throw youngLearnerError;
  const matchingYoungLearners = (youngLearners || []).filter((student) => monitoringNameMatches(student.first_name, student.last_name, normalizedSearch));
  const youngIds = matchingYoungLearners.map((student) => String(student.id));
  const { data: youngPeriods, error: youngPeriodError } = youngIds.length
    ? await supabaseAdmin.from("class_enrolment_periods").select("young_learner_id, class_id").eq("student_type", "young_learner").in("young_learner_id", youngIds).is("cancelled_at", null).lte("starts_on", today).or(`ends_before.is.null,ends_before.gt.${today}`)
    : { data: [], error: null };
  if (youngPeriodError) throw youngPeriodError;
  const youngClassIds = [...new Set((youngPeriods || []).map((period) => String(period.class_id)).filter(Boolean))];
  const { data: youngClasses, error: youngClassError } = youngClassIds.length
    ? await supabaseAdmin.from("classes").select("id").in("id", youngClassIds).or("is_cambridge.eq.false,is_cambridge.is.null")
    : { data: [], error: null };
  if (youngClassError) throw youngClassError;
  const eligibleYoungIds = new Set((youngPeriods || []).filter((period) => (youngClasses || []).some((row) => String(row.id) === String(period.class_id))).map((period) => String(period.young_learner_id)));
  const matches = [
    ...profileMatches,
    ...matchingYoungLearners.filter((student) => eligibleYoungIds.has(String(student.id))).map((student) => ({ id: String(student.id), student_type: "young_learner" as const, first_name: student.first_name || null, last_name: student.last_name || null, email: null })),
  ].sort((left, right) => `${left.last_name || ""} ${left.first_name || ""}`.localeCompare(`${right.last_name || ""} ${right.first_name || ""}`)).slice(0, 20);
  return Promise.all(matches.map(async (student) => ({
    ...student,
    enrolments: await loadMonitoringEnrolments(student.student_type, student.id),
  })));
}

export async function loadMonitoringEnrolments(studentType: "profile" | "young_learner", studentId: string) {
  const today = getMadridDate();
  const { data: periods, error: periodError } = await supabaseAdmin
    .from("class_enrolment_periods")
    .select("class_id, starts_on, ends_before")
    .eq("student_type", studentType)
    .eq(studentType === "profile" ? "profile_student_id" : "young_learner_id", studentId)
    .is("cancelled_at", null)
    .lte("starts_on", today)
    .or(`ends_before.is.null,ends_before.gt.${today}`);
  if (periodError) throw periodError;
  const classIds = [...new Set((periods || []).map((period) => String(period.class_id)).filter(Boolean))];
  if (!classIds.length) return [] as MonitoringEnrolment[];
  const [{ data: classes, error: classError }, { data: periodRows, error: periodRowsError }] = await Promise.all([
    studentType === "profile"
      ? supabaseAdmin.from("classes").select("id, class_name, level_id, days, start_time, end_time, teacher_id, is_cambridge").in("id", classIds).eq("is_cambridge", true).not("teacher_id", "is", null)
      : supabaseAdmin.from("classes").select("id, class_name, level_id, days, start_time, end_time, teacher_id, is_cambridge").in("id", classIds).or("is_cambridge.eq.false,is_cambridge.is.null").not("teacher_id", "is", null),
    supabaseAdmin.from("class_enrolment_periods").select("class_id, starts_on, ends_before").eq("student_type", studentType).eq(studentType === "profile" ? "profile_student_id" : "young_learner_id", studentId).is("cancelled_at", null).lte("starts_on", today).or(`ends_before.is.null,ends_before.gt.${today}`),
  ]);
  if (classError || periodRowsError) throw classError || periodRowsError;
  const teacherIds = [...new Set((classes || []).map((classroom) => String(classroom.teacher_id || "")).filter(Boolean))];
  const levelIds = [...new Set((classes || []).map((classroom) => classroom.level_id).filter(Boolean))];
  const [{ data: teachers, error: teacherError }, { data: levels, error: levelError }] = await Promise.all([
    teacherIds.length ? supabaseAdmin.from("profiles").select("id, first_name, last_name").in("id", teacherIds) : Promise.resolve({ data: [], error: null }),
    levelIds.length ? supabaseAdmin.from("levels").select("id, name").in("id", levelIds) : Promise.resolve({ data: [], error: null }),
  ]);
  if (teacherError || levelError) throw teacherError || levelError;
  const teacherById = new Map((teachers || []).map((teacher) => [String(teacher.id), teacher]));
  const levelById = new Map((levels || []).map((level) => [String(level.id), level]));
  const periodByClass = new Map((periodRows || []).map((period) => [String(period.class_id), period]));
  return (classes || []).map((classroom) => {
    const teacher = teacherById.get(String(classroom.teacher_id));
    const level = levelById.get(String(classroom.level_id));
    const period = periodByClass.get(String(classroom.id));
    return {
      student_type: studentType, class_id: String(classroom.id), class_name: String(classroom.class_name || "Class"), level_id: Number(classroom.level_id), level_name: String(level?.name || "Level"),
      days: classroom.days || null, start_time: classroom.start_time || null, end_time: classroom.end_time || null,
      teacher_id: String(classroom.teacher_id || ""), teacher_name: `${teacher?.first_name || ""} ${teacher?.last_name || ""}`.trim() || "Teacher",
      starts_on: String(period?.starts_on || ""), ends_before: period?.ends_before || null,
    } satisfies MonitoringEnrolment;
  });
}

export async function callMonitoringRpc<T>(name: string, args: Record<string, unknown>) {
  const { data, error } = await supabaseAdmin.rpc(name, args);
  if (error) throw new Error(error.message);
  return data as T;
}
