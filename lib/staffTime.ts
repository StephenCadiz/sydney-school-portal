export const STAFF_TIME_ZONE = "Europe/Madrid";

export const STAFF_TIME_WEEKDAYS = [
  { value: 1, short: "Mon", label: "Monday", spanish: "Lunes" },
  { value: 2, short: "Tue", label: "Tuesday", spanish: "Martes" },
  { value: 3, short: "Wed", label: "Wednesday", spanish: "Miércoles" },
  { value: 4, short: "Thu", label: "Thursday", spanish: "Jueves" },
  { value: 5, short: "Fri", label: "Friday", spanish: "Viernes" },
  { value: 6, short: "Sat", label: "Saturday", spanish: "Sábado" },
  { value: 7, short: "Sun", label: "Sunday", spanish: "Domingo" },
] as const;

export const STAFF_TIME_CORRECTION_TYPES = [
  "forgot_sign_in",
  "forgot_sign_out",
  "incorrect_clock_action",
  "technical_problem",
  "other",
] as const;

export type StaffTimeCorrectionType =
  (typeof STAFF_TIME_CORRECTION_TYPES)[number];

export type StaffTimeWorkingType = "full_time" | "part_time";
export type StaffTimeStaffRole = "teacher" | "admin";

export type StaffTimeAdminEnrollmentEvent = {
  id?: string;
  admin_id: string;
  requires_time_registration: boolean;
  effective_from: string;
  changed_by?: string | null;
  changed_at: string;
};
export type StaffTimeLocationPolicy =
  | "school_network_only"
  | "school_or_authorised_remote";

export type StaffTimeInterval = {
  id?: string;
  weekday: number;
  start_time: string;
  end_time: string;
};

export type StaffTimeEmploymentRecord = {
  id: string;
  teacher_id: string;
  effective_from: string;
  effective_to: string | null;
  legal_first_name: string;
  legal_last_name: string;
  dni_nie: string;
  job_title: string;
  working_time_type: StaffTimeWorkingType;
  contracted_weekly_hours: number;
  time_recording_enabled: boolean;
  clocking_location_policy: StaffTimeLocationPolicy;
  created_at: string;
};

export type StaffTimeSchedule = {
  id: string;
  teacher_id: string;
  effective_from: string;
  effective_to: string | null;
  label: string | null;
  created_at: string;
  intervals: StaffTimeInterval[];
};

export type StaffTimeCompanySettings = {
  id: string;
  effective_from: string;
  effective_to: string | null;
  legal_employer_name: string;
  tax_identifier: string;
  workplace_name: string;
  workplace_address: string;
  postcode: string;
  city: string;
  province: string;
  country: string;
  retention_years: number;
  created_at: string;
};

export type StaffTimeSessionView = {
  id: string;
  teacher_id: string;
  work_date: string;
  clocking_mode: "school_network" | "authorised_remote";
  original_sign_in_at: string;
  original_sign_out_at: string | null;
  effective_sign_in_at: string | null;
  effective_sign_out_at: string | null;
  corrected: boolean;
  correction_reason: string | null;
  verification_result: string;
};

export type StaffTimeClosureView = {
  id: string;
  name: string;
  closure_type: "public_holiday" | "school_holiday" | "other";
};

export type StaffTimeDayStatus =
  | "not_due"
  | "due_soon"
  | "not_signed_in"
  | "working"
  | "completed"
  | "missing_sign_in"
  | "missing_sign_out"
  | "correction_pending"
  | "school_closed"
  | "non_working_day"
  | "authorised_remote";

export type StaffTimeTeacherDay = {
  teacher_id: string;
  teacher_name: string;
  staff_role: StaffTimeStaffRole;
  staff_role_label: string;
  date: string;
  employment: StaffTimeEmploymentRecord | null;
  schedule: StaffTimeSchedule | null;
  planned_intervals: StaffTimeInterval[];
  closure: StaffTimeClosureView | null;
  remote_authorised: boolean;
  sessions: StaffTimeSessionView[];
  pending_correction_count: number;
  open_incidence_types: string[];
  status: StaffTimeDayStatus;
  status_label: string;
  current_network_authorised: boolean;
  clocking_available: boolean;
  unavailable_reason: string | null;
  now: string;
};

export type StaffTimeReportSession = {
  sign_in_at: string | null;
  sign_out_at: string | null;
  original_sign_in_at: string | null;
  original_sign_out_at: string | null;
  corrected: boolean;
  correction_reason: string | null;
  clocking_mode: "school_network" | "authorised_remote" | "correction";
};

export type StaffTimeReportDay = {
  date: string;
  included_in_time_register: boolean;
  weekday: string;
  planned: string;
  sessions: StaffTimeReportSession[];
  entries: string;
  exits: string;
  registered_minutes: number;
  situation: string;
  incidence: string;
  corrected: boolean;
  closure: StaffTimeClosureView | null;
};

export type StaffTimeReportTeacher = {
  teacher_id: string;
  name: string;
  staff_role: StaffTimeStaffRole;
  staff_role_label: string;
  dni_nie: string;
  job_title: string;
  working_time_type: StaffTimeWorkingType;
  contracted_weekly_hours: number;
  days: StaffTimeReportDay[];
  totals: {
    recorded_days: number;
    planned_minutes: number;
    registered_minutes: number;
    closure_days: number;
    incidences: number;
    corrected_records: number;
  };
};

export type StaffTimeReportData = {
  generated_at: string;
  start_date: string;
  end_date: string;
  period_label: string;
  company: StaffTimeCompanySettings;
  teachers: StaffTimeReportTeacher[];
};

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/;

export function text(value: unknown) {
  return String(value ?? "").trim();
}

export function staffTimeRoleLabel(role: StaffTimeStaffRole) {
  return role === "admin" ? "Admin staff" : "Teacher";
}

export function isAdminTimeRegistrationRequired(
  events: StaffTimeAdminEnrollmentEvent[],
  date: string
) {
  const effective = events
    .filter((event) => event.effective_from <= date)
    .sort(
      (left, right) =>
        right.effective_from.localeCompare(left.effective_from) ||
        right.changed_at.localeCompare(left.changed_at) ||
        String(right.id || "").localeCompare(String(left.id || ""))
    )[0];
  return effective?.requires_time_registration === true;
}

export function wasAdminTimeRegistrationRequiredDuring(
  events: StaffTimeAdminEnrollmentEvent[],
  startDate: string,
  endDate: string
) {
  if (!isIsoDate(startDate) || !isIsoDate(endDate) || endDate < startDate) {
    return false;
  }
  if (isAdminTimeRegistrationRequired(events, startDate)) return true;
  return events.some(
    (event) =>
      event.requires_time_registration &&
      event.effective_from >= startDate &&
      event.effective_from <= endDate
  );
}

export function canAdminManageStaffTimeRecord(actorId: string, staffId: string) {
  return Boolean(actorId && staffId && actorId !== staffId);
}

export function isIsoDate(value: string) {
  if (!DATE_PATTERN.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day, 12));
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  );
}

export function normalizeTime(value: unknown) {
  const normalized = text(value);
  const match = normalized.match(TIME_PATTERN);
  return match ? `${match[1]}:${match[2]}` : "";
}

export function timeToMinutes(value: unknown) {
  const normalized = normalizeTime(value);
  if (!normalized) return null;
  const [hours, minutes] = normalized.split(":").map(Number);
  return hours * 60 + minutes;
}

export function getMadridParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: STAFF_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    date: `${values.year}-${values.month}-${values.day}`,
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    hour: Number(values.hour),
    minute: Number(values.minute),
    second: Number(values.second),
  };
}

export function getMadridDate(date = new Date()) {
  return getMadridParts(date).date;
}

export function getMadridMinutes(date = new Date()) {
  const parts = getMadridParts(date);
  return parts.hour * 60 + parts.minute;
}

export function getIsoWeekday(date: string) {
  if (!isIsoDate(date)) return 0;
  const day = new Date(`${date}T12:00:00Z`).getUTCDay();
  return day === 0 ? 7 : day;
}

export function addCalendarDays(date: string, amount: number) {
  const parsed = new Date(`${date}T12:00:00Z`);
  parsed.setUTCDate(parsed.getUTCDate() + amount);
  return parsed.toISOString().slice(0, 10);
}

export function enumerateDates(startDate: string, endDate: string) {
  const dates: string[] = [];
  if (!isIsoDate(startDate) || !isIsoDate(endDate) || endDate < startDate) {
    return dates;
  }
  for (let date = startDate; date <= endDate; date = addCalendarDays(date, 1)) {
    dates.push(date);
    if (dates.length > 3660) break;
  }
  return dates;
}

export function getMadridOffset(date: Date) {
  const parts = getMadridParts(date);
  const asUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second
  );
  return asUtc - date.getTime();
}

export function madridLocalToIso(date: string, time: string) {
  if (!isIsoDate(date) || !normalizeTime(time)) return null;
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = normalizeTime(time).split(":").map(Number);
  let utc = new Date(Date.UTC(year, month - 1, day, hour, minute));
  utc = new Date(utc.getTime() - getMadridOffset(utc));
  const correctedOffset = getMadridOffset(utc);
  utc = new Date(Date.UTC(year, month - 1, day, hour, minute) - correctedOffset);
  return utc.toISOString();
}

export function formatMadridTime(value: string | null | undefined) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("es-ES", {
    timeZone: STAFF_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(value));
}

export function formatSpanishDate(value: string) {
  return new Intl.DateTimeFormat("es-ES", {
    timeZone: "UTC",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(`${value}T12:00:00Z`));
}

export function formatSpanishWeekday(value: string) {
  const weekday = new Intl.DateTimeFormat("es-ES", {
    timeZone: "UTC",
    weekday: "long",
  }).format(new Date(`${value}T12:00:00Z`));
  return weekday.charAt(0).toUpperCase() + weekday.slice(1);
}

export function formatMinutes(minutes: number, spanish = false) {
  const safe = Math.max(0, Math.round(minutes));
  const hours = Math.floor(safe / 60);
  const remainder = safe % 60;
  return spanish
    ? `${hours} h ${String(remainder).padStart(2, "0")} min`
    : `${hours}h ${String(remainder).padStart(2, "0")}m`;
}

export function minutesBetween(start: string | null, end: string | null) {
  if (!start || !end) return 0;
  const difference = new Date(end).getTime() - new Date(start).getTime();
  return Number.isFinite(difference) && difference > 0
    ? Math.round(difference / 60_000)
    : 0;
}

export function spanishClosureLabel(closure: StaffTimeClosureView) {
  const label =
    closure.closure_type === "public_holiday"
      ? "Festivo"
      : closure.closure_type === "school_holiday"
        ? "Centro cerrado / Vacaciones del centro"
        : "Centro cerrado";
  return `${label} — ${closure.name}`;
}

export function plannedIntervalLabel(intervals: StaffTimeInterval[]) {
  return intervals.length
    ? intervals
        .map(
          (interval) =>
            `${normalizeTime(interval.start_time)}–${normalizeTime(interval.end_time)}`
        )
        .join(" / ")
    : "—";
}

export function plannedMinutes(intervals: StaffTimeInterval[]) {
  return intervals.reduce((sum, interval) => {
    const start = timeToMinutes(interval.start_time);
    const end = timeToMinutes(interval.end_time);
    return start === null || end === null || end <= start ? sum : sum + end - start;
  }, 0);
}

export function shouldShowStartReminder(
  nowMinutes: number,
  startMinutes: number,
  signedIn: boolean
) {
  return !signedIn && nowMinutes >= startMinutes - 15 && nowMinutes <= startMinutes;
}

export function shouldShowFinishReminder(
  nowMinutes: number,
  finishMinutes: number,
  hasOpenSession: boolean
) {
  return hasOpenSession && nowMinutes >= finishMinutes - 5;
}

export function getStaffTimeDayStatus(input: {
  nowDate: string;
  currentMinutes: number;
  workDate: string;
  intervals: StaffTimeInterval[];
  sessions: StaffTimeSessionView[];
  closure: StaffTimeClosureView | null;
  remoteAuthorised: boolean;
  pendingCorrectionCount: number;
  openIncidenceTypes: string[];
}): { status: StaffTimeDayStatus; label: string } {
  if (input.closure && !input.sessions.length) {
    return { status: "school_closed", label: "School closed" };
  }
  if (input.pendingCorrectionCount > 0) {
    return { status: "correction_pending", label: "Correction pending" };
  }
  if (input.openIncidenceTypes.includes("missing_sign_out")) {
    return { status: "missing_sign_out", label: "Missing sign-out" };
  }
  if (input.openIncidenceTypes.includes("missing_sign_in")) {
    return { status: "missing_sign_in", label: "Missing sign-in" };
  }
  const open = input.sessions.find((session) => !session.effective_sign_out_at);
  if (open) {
    return input.remoteAuthorised || open.clocking_mode === "authorised_remote"
      ? { status: "authorised_remote", label: "Working · authorised remote" }
      : { status: "working", label: "Working" };
  }
  if (input.sessions.length) {
    return { status: "completed", label: "Completed" };
  }
  if (!input.intervals.length) {
    return { status: "non_working_day", label: "Non-working day" };
  }
  if (input.workDate > input.nowDate) {
    return { status: "not_due", label: "Not due" };
  }
  const firstStart = Math.min(
    ...input.intervals.map((interval) => timeToMinutes(interval.start_time) ?? 1440)
  );
  if (input.workDate < input.nowDate || input.currentMinutes > firstStart) {
    return { status: "not_signed_in", label: "Not signed in" };
  }
  if (input.currentMinutes >= firstStart - 15) {
    return { status: "due_soon", label: "Due soon" };
  }
  return { status: "not_due", label: "Not due" };
}

export function reportPeriodLabel(startDate: string, endDate: string) {
  const start = new Date(`${startDate}T12:00:00Z`);
  const end = new Date(`${endDate}T12:00:00Z`);
  if (
    startDate.slice(0, 7) === endDate.slice(0, 7) &&
    startDate.endsWith("-01")
  ) {
    const nextMonth = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0));
    if (endDate === nextMonth.toISOString().slice(0, 10)) {
      const label = new Intl.DateTimeFormat("es-ES", {
        month: "long",
        year: "numeric",
        timeZone: "UTC",
      }).format(start);
      return label.charAt(0).toUpperCase() + label.slice(1);
    }
  }
  return `${formatSpanishDate(startDate)} – ${formatSpanishDate(endDate)}`;
}
