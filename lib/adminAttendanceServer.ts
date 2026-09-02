import "server-only";

import {
  classUsesAcademicYear,
  getMadridDateString,
  resolveCurrentStudentClass,
} from "./academicYearRules";
import {
  type AdminAttendanceAcademicYear,
  type AdminAttendanceAlert,
  type AdminAttendanceClassDetails,
  type AdminAttendanceClassStudent,
  type AdminAttendanceClassSummary,
  type AdminAttendanceLevelSummary,
  type AdminAttendanceOverview,
  type AdminAttendanceStudentDetails,
  type AdminAttendanceStudentSearchResult,
  type AttendanceStudentType,
} from "./adminAttendance";
import {
  calculateAttendanceSummary,
  getAdminStudentAttendance,
} from "./classRegisterServer";
import {
  type AdminAttendanceHistoryRow,
} from "./classRegister";
import { supabaseAdmin } from "./supabaseAdmin";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const QUERY_CHUNK_SIZE = 100;

type RawClass = {
  id: string;
  class_name: string | null;
  level_id: number | string;
  teacher_id: string | null;
  is_cambridge: boolean;
  course_type: string | null;
  days: string | null;
  start_time: string | null;
  end_time: string | null;
  start_date: string | null;
  end_date: string | null;
  academic_year_id: string | null;
};

type AttendanceFact = {
  entry_id: string;
  register_id: string;
  class_id: string;
  student_type: AttendanceStudentType;
  student_id: string;
  attendance_status: "present" | "absent";
  lesson_date: string;
  scheduled_start_time: string;
  scheduled_end_time: string;
};

type RawAttendanceAlert = {
  id: string;
  alert_type: "consecutive_absence" | "low_attendance";
  class_id: string;
  student_type: AttendanceStudentType;
  profile_student_id: string | null;
  young_learner_id: string | null;
  condition_active: boolean;
  triggered_at: string;
  resolved_at: string | null;
  dealt_with_at: string | null;
  dealt_with_by: string | null;
};

type PersonRecord = {
  id: string;
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  role?: string | null;
  active?: boolean | null;
  class_id?: string | null;
};

type RawRegister = {
  id: string;
  class_id: string;
  lesson_date: string;
  scheduled_start_time: string;
  scheduled_end_time: string;
  completed_at: string;
};

type RawEntry = {
  id: string;
  register_id: string;
  student_type: string;
  profile_student_id: string | null;
  young_learner_id: string | null;
  attendance_status: string;
};

type AttendanceDataset = {
  classRows: RawClass[];
  facts: AttendanceFact[];
  alerts: RawAttendanceAlert[];
  levels: Map<string, string>;
  profiles: Map<string, PersonRecord>;
  youngLearners: Map<string, PersonRecord>;
  academicYears: Map<string, AdminAttendanceAcademicYear>;
  rosterByClass: Map<string, Set<string>>;
};

export class AdminAttendanceError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "AdminAttendanceError";
  }
}

function text(value: unknown) {
  return String(value ?? "").trim();
}

function unique(values: unknown[]) {
  return Array.from(new Set(values.map(text).filter(Boolean)));
}

function chunks<T>(values: T[], size = QUERY_CHUNK_SIZE) {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
}

function normalizeCourseType(value: unknown) {
  return text(value).toLowerCase();
}

function courseTypeLabel(value: unknown) {
  const normalized = normalizeCourseType(value);
  return normalized
    ? normalized.charAt(0).toUpperCase() + normalized.slice(1)
    : "";
}

function displayTime(value: unknown) {
  return text(value).slice(0, 5);
}

function fullName(person: PersonRecord | null | undefined, fallback: string) {
  return `${text(person?.first_name)} ${text(person?.last_name)}`.trim() || fallback;
}

function studentKey(
  classId: string,
  studentType: AttendanceStudentType,
  studentId: string
) {
  return `${classId}|${studentType}|${studentId}`;
}

function personKey(studentType: AttendanceStudentType, studentId: string) {
  return `${studentType}|${studentId}`;
}

function classDisplayName(classroom: RawClass, levelName: string) {
  const courseLabel = classroom.is_cambridge
    ? courseTypeLabel(classroom.course_type)
    : "";
  return [levelName, courseLabel].filter(Boolean).join(" ") ||
    text(classroom.class_name) ||
    "Class";
}

function classFallsWithinAcademicYear(
  classroom: RawClass,
  academicYear: AdminAttendanceAcademicYear | null
) {
  if (classUsesAcademicYear(classroom.course_type)) {
    return Boolean(
      academicYear &&
        text(classroom.academic_year_id) === text(academicYear.id)
    );
  }

  if (!academicYear) return true;
  const startDate = text(classroom.start_date);
  const endDate = text(classroom.end_date);
  return Boolean(
    startDate &&
      endDate &&
      startDate <= academicYear.end_date &&
      endDate >= academicYear.start_date
  );
}

async function loadAcademicYearScope(requestedId = "") {
  if (requestedId && !UUID_PATTERN.test(requestedId)) {
    throw new AdminAttendanceError("Academic Year was not found.", 404);
  }

  const { data, error } = await supabaseAdmin
    .from("academic_years")
    .select("id, label, start_date, end_date, status")
    .order("start_date", { ascending: false });
  if (error) throw error;

  const academicYears = (data || []) as AdminAttendanceAcademicYear[];
  const selected = requestedId
    ? academicYears.find((year) => text(year.id) === requestedId) || null
    : academicYears.find((year) => year.status === "current") ||
      academicYears[0] ||
      null;

  if (requestedId && !selected) {
    throw new AdminAttendanceError("Academic Year was not found.", 404);
  }

  return { academicYears, selected };
}

async function loadRegisters(classIds: string[]) {
  const rows: RawRegister[] = [];
  for (const classIdChunk of chunks(classIds)) {
    const { data, error } = await supabaseAdmin
      .from("class_registers")
      .select(
        "id, class_id, lesson_date, scheduled_start_time, scheduled_end_time, completed_at"
      )
      .in("class_id", classIdChunk)
      .not("completed_at", "is", null);
    if (error) throw error;
    rows.push(...((data || []) as RawRegister[]));
  }
  return rows;
}

async function loadEntries(registerIds: string[]) {
  const rows: RawEntry[] = [];
  for (const registerIdChunk of chunks(registerIds)) {
    const { data, error } = await supabaseAdmin
      .from("class_register_entries")
      .select(
        "id, register_id, student_type, profile_student_id, young_learner_id, attendance_status"
      )
      .in("register_id", registerIdChunk)
      .in("attendance_status", ["present", "absent"]);
    if (error) throw error;
    rows.push(...((data || []) as RawEntry[]));
  }
  return rows;
}

async function loadAlerts(classIds: string[]) {
  const rows: RawAttendanceAlert[] = [];
  for (const classIdChunk of chunks(classIds)) {
    const { data, error } = await supabaseAdmin
      .from("attendance_alerts")
      .select(
        "id, alert_type, class_id, student_type, profile_student_id, young_learner_id, condition_active, triggered_at, resolved_at, dealt_with_at, dealt_with_by"
      )
      .in("class_id", classIdChunk);
    if (error) throw error;
    rows.push(...((data || []) as RawAttendanceAlert[]));
  }
  return rows;
}

async function loadProfiles(profileIds: string[]) {
  const rows: PersonRecord[] = [];
  for (const profileIdChunk of chunks(profileIds)) {
    const { data, error } = await supabaseAdmin
      .from("profiles")
      .select("id, first_name, last_name, email, role, active")
      .in("id", profileIdChunk);
    if (error) throw error;
    rows.push(...((data || []) as PersonRecord[]));
  }
  return rows;
}

async function loadYoungLearners(learnerIds: string[]) {
  const rows: PersonRecord[] = [];
  for (const learnerIdChunk of chunks(learnerIds)) {
    const { data, error } = await supabaseAdmin
      .from("young_learners")
      .select("id, first_name, last_name, class_id, active")
      .in("id", learnerIdChunk);
    if (error) throw error;
    rows.push(...((data || []) as PersonRecord[]));
  }
  return rows;
}

async function loadDataset(classRows: RawClass[]): Promise<AttendanceDataset> {
  const classIds = classRows.map((classroom) => text(classroom.id));
  const rosterByClass = new Map<string, Set<string>>();
  if (!classIds.length) {
    return {
      classRows,
      facts: [],
      alerts: [],
      levels: new Map(),
      profiles: new Map(),
      youngLearners: new Map(),
      academicYears: new Map(),
      rosterByClass,
    };
  }

  const [registers, profileEnrolmentsResult, learnerEnrolmentsResult, currentLearnersResult] =
    await Promise.all([
      loadRegisters(classIds),
      supabaseAdmin
        .from("class_enrolments")
        .select("class_id, student_id")
        .in("class_id", classIds),
      supabaseAdmin
        .from("young_learner_enrolments")
        .select("class_id, young_learner_id")
        .in("class_id", classIds),
      supabaseAdmin
        .from("young_learners")
        .select("id, class_id")
        .in("class_id", classIds),
    ]);
  if (profileEnrolmentsResult.error) throw profileEnrolmentsResult.error;
  if (learnerEnrolmentsResult.error) throw learnerEnrolmentsResult.error;
  if (currentLearnersResult.error) throw currentLearnersResult.error;

  for (const enrolment of profileEnrolmentsResult.data || []) {
    const classId = text(enrolment.class_id);
    const id = text(enrolment.student_id);
    if (!classId || !id) continue;
    if (!rosterByClass.has(classId)) rosterByClass.set(classId, new Set());
    rosterByClass.get(classId)?.add(personKey("profile", id));
  }
  for (const enrolment of learnerEnrolmentsResult.data || []) {
    const classId = text(enrolment.class_id);
    const id = text(enrolment.young_learner_id);
    if (!classId || !id) continue;
    if (!rosterByClass.has(classId)) rosterByClass.set(classId, new Set());
    rosterByClass.get(classId)?.add(personKey("young_learner", id));
  }
  for (const learner of currentLearnersResult.data || []) {
    const classId = text(learner.class_id);
    const id = text(learner.id);
    if (!classId || !id) continue;
    if (!rosterByClass.has(classId)) rosterByClass.set(classId, new Set());
    rosterByClass.get(classId)?.add(personKey("young_learner", id));
  }

  const registerIds = registers.map((register) => text(register.id));
  const [entries, alerts] = await Promise.all([
    registerIds.length ? loadEntries(registerIds) : Promise.resolve([]),
    loadAlerts(classIds),
  ]);
  const registerMap = new Map(
    registers.map((register) => [text(register.id), register])
  );
  const facts = entries.flatMap((entry): AttendanceFact[] => {
    const register = registerMap.get(text(entry.register_id));
    const studentType = text(entry.student_type) as AttendanceStudentType;
    const studentId =
      studentType === "profile"
        ? text(entry.profile_student_id)
        : text(entry.young_learner_id);
    if (
      !register ||
      !studentId ||
      !["profile", "young_learner"].includes(studentType) ||
      !["present", "absent"].includes(text(entry.attendance_status))
    ) {
      return [];
    }
    const classId = text(register.class_id);
    if (!rosterByClass.has(classId)) rosterByClass.set(classId, new Set());
    rosterByClass.get(classId)?.add(personKey(studentType, studentId));
    return [
      {
        entry_id: text(entry.id),
        register_id: text(entry.register_id),
        class_id: classId,
        student_type: studentType,
        student_id: studentId,
        attendance_status: text(entry.attendance_status) as "present" | "absent",
        lesson_date: text(register.lesson_date),
        scheduled_start_time: displayTime(register.scheduled_start_time),
        scheduled_end_time: displayTime(register.scheduled_end_time),
      },
    ];
  });

  const levelIds = unique(classRows.map((classroom) => classroom.level_id));
  const profileIds = unique([
    ...classRows.map((classroom) => classroom.teacher_id),
    ...facts
      .filter((fact) => fact.student_type === "profile")
      .map((fact) => fact.student_id),
    ...alerts.map((alert) => alert.profile_student_id),
    ...alerts.map((alert) => alert.dealt_with_by),
    ...Array.from(rosterByClass.values()).flatMap((roster) =>
      Array.from(roster)
        .filter((key) => key.startsWith("profile|"))
        .map((key) => key.slice("profile|".length))
    ),
  ]);
  const learnerIds = unique([
    ...facts
      .filter((fact) => fact.student_type === "young_learner")
      .map((fact) => fact.student_id),
    ...alerts.map((alert) => alert.young_learner_id),
    ...Array.from(rosterByClass.values()).flatMap((roster) =>
      Array.from(roster)
        .filter((key) => key.startsWith("young_learner|"))
        .map((key) => key.slice("young_learner|".length))
    ),
  ]);
  const academicYearIds = unique(
    classRows.map((classroom) => classroom.academic_year_id)
  );

  const [levelsResult, profiles, youngLearners, yearsResult] = await Promise.all([
    levelIds.length
      ? supabaseAdmin.from("levels").select("id, name").in("id", levelIds)
      : Promise.resolve({ data: [], error: null }),
    profileIds.length ? loadProfiles(profileIds) : Promise.resolve([]),
    learnerIds.length ? loadYoungLearners(learnerIds) : Promise.resolve([]),
    academicYearIds.length
      ? supabaseAdmin
          .from("academic_years")
          .select("id, label, start_date, end_date, status")
          .in("id", academicYearIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (levelsResult.error) throw levelsResult.error;
  if (yearsResult.error) throw yearsResult.error;

  const profileMap = new Map(
    profiles.map((profile) => [text(profile.id), profile])
  );
  const youngLearnerMap = new Map(
    youngLearners.map((learner) => [text(learner.id), learner])
  );
  const classMap = new Map(
    classRows.map((classroom) => [text(classroom.id), classroom])
  );
  for (const [classId, roster] of rosterByClass) {
    const classroom = classMap.get(classId);
    const expectedPrefix = classroom?.is_cambridge
      ? "profile|"
      : "young_learner|";
    rosterByClass.set(
      classId,
      new Set(
        Array.from(roster).filter((key) => {
          if (!key.startsWith(expectedPrefix)) return false;
          if (key.startsWith("profile|")) {
            return profileMap.get(key.slice("profile|".length))?.role === "student";
          }
          return youngLearnerMap.has(key.slice("young_learner|".length));
        })
      )
    );
  }

  return {
    classRows,
    facts,
    alerts,
    levels: new Map(
      (levelsResult.data || []).map((level) => [text(level.id), text(level.name)])
    ),
    profiles: profileMap,
    youngLearners: youngLearnerMap,
    academicYears: new Map(
      ((yearsResult.data || []) as AdminAttendanceAcademicYear[]).map((year) => [
        text(year.id),
        year,
      ])
    ),
    rosterByClass,
  };
}

function groupFactsByStudentClass(facts: AttendanceFact[]) {
  const grouped = new Map<string, AttendanceFact[]>();
  for (const fact of facts) {
    const key = studentKey(fact.class_id, fact.student_type, fact.student_id);
    grouped.set(key, [...(grouped.get(key) || []), fact]);
  }
  return grouped;
}

function getAlertStatus(alert: RawAttendanceAlert) {
  if (!alert.condition_active) return "resolved" as const;
  if (alert.dealt_with_at) return "dealt_with" as const;
  return "needs_attention" as const;
}

function buildAlertRows(dataset: AttendanceDataset): AdminAttendanceAlert[] {
  const classMap = new Map(
    dataset.classRows.map((classroom) => [text(classroom.id), classroom])
  );
  const factsByStudentClass = groupFactsByStudentClass(dataset.facts);

  return dataset.alerts
    .flatMap((alert): AdminAttendanceAlert[] => {
      const classroom = classMap.get(text(alert.class_id));
      const studentId =
        alert.student_type === "profile"
          ? text(alert.profile_student_id)
          : text(alert.young_learner_id);
      if (!classroom || !studentId) return [];

      const levelName = dataset.levels.get(text(classroom.level_id)) || "Class";
      const student =
        alert.student_type === "profile"
          ? dataset.profiles.get(studentId)
          : dataset.youngLearners.get(studentId);
      const studentFacts = factsByStudentClass.get(
        studentKey(text(classroom.id), alert.student_type, studentId)
      ) || [];
      const newestFacts = [...studentFacts].sort((left, right) =>
        `${right.lesson_date}|${right.scheduled_start_time}`.localeCompare(
          `${left.lesson_date}|${left.scheduled_start_time}`
        )
      );
      const absenceDates =
        alert.alert_type === "consecutive_absence" && alert.condition_active
          ? newestFacts
              .slice(0, 2)
              .filter((fact) => fact.attendance_status === "absent")
              .map((fact) => fact.lesson_date)
          : [];

      return [
        {
          id: text(alert.id),
          alert_type: alert.alert_type,
          status: getAlertStatus(alert),
          class_id: text(classroom.id),
          class_name: classDisplayName(classroom, levelName),
          level_name: levelName,
          teacher_name: fullName(
            dataset.profiles.get(text(classroom.teacher_id)),
            "Teacher"
          ),
          student_type: alert.student_type,
          student_id: studentId,
          student_name: fullName(student, "Unknown student"),
          condition_active: alert.condition_active,
          triggered_at: text(alert.triggered_at),
          resolved_at: text(alert.resolved_at) || null,
          dealt_with_at: text(alert.dealt_with_at) || null,
          dealt_with_by_name: alert.dealt_with_by
            ? fullName(dataset.profiles.get(text(alert.dealt_with_by)), "Admin")
            : null,
          absence_dates: absenceDates,
          summary: calculateAttendanceSummary(studentFacts),
        },
      ];
    })
    .sort((left, right) => {
      const priority = {
        needs_attention: 0,
        dealt_with: 1,
        resolved: 2,
      } as const;
      const statusDifference = priority[left.status] - priority[right.status];
      if (statusDifference !== 0) return statusDifference;
      return left.status === "needs_attention"
        ? left.triggered_at.localeCompare(right.triggered_at)
        : right.triggered_at.localeCompare(left.triggered_at);
    });
}

function buildClassSummaries(dataset: AttendanceDataset) {
  const factsByClass = new Map<string, AttendanceFact[]>();
  for (const fact of dataset.facts) {
    factsByClass.set(fact.class_id, [
      ...(factsByClass.get(fact.class_id) || []),
      fact,
    ]);
  }
  const unresolvedAlertsByClass = new Map<string, number>();
  for (const alert of dataset.alerts) {
    if (!alert.condition_active || alert.dealt_with_at) continue;
    const classId = text(alert.class_id);
    unresolvedAlertsByClass.set(
      classId,
      (unresolvedAlertsByClass.get(classId) || 0) + 1
    );
  }

  return dataset.classRows
    .map((classroom): AdminAttendanceClassSummary => {
      const classId = text(classroom.id);
      const levelName = dataset.levels.get(text(classroom.level_id)) || "Class";
      const academicYear = dataset.academicYears.get(
        text(classroom.academic_year_id)
      );
      return {
        class_id: classId,
        class_name: classDisplayName(classroom, levelName),
        level_id: text(classroom.level_id),
        level_name: levelName,
        teacher_id: text(classroom.teacher_id),
        teacher_name: fullName(
          dataset.profiles.get(text(classroom.teacher_id)),
          "Teacher not assigned"
        ),
        course_type: courseTypeLabel(classroom.course_type) || "Regular",
        academic_year_id: text(classroom.academic_year_id) || null,
        academic_year_label: academicYear?.label || null,
        course_start_date: text(classroom.start_date) || null,
        course_end_date: text(classroom.end_date) || null,
        days: text(classroom.days),
        scheduled_start_time: displayTime(classroom.start_time),
        scheduled_end_time: displayTime(classroom.end_time),
        student_count: dataset.rosterByClass.get(classId)?.size || 0,
        active_alert_count: unresolvedAlertsByClass.get(classId) || 0,
        ...calculateAttendanceSummary(factsByClass.get(classId) || []),
      };
    })
    .sort((left, right) =>
      left.level_name.localeCompare(right.level_name, undefined, {
        numeric: true,
        sensitivity: "base",
      }) ||
      left.class_name.localeCompare(right.class_name, undefined, {
        numeric: true,
        sensitivity: "base",
      })
    );
}

function buildLevelSummaries(
  dataset: AttendanceDataset,
  classes: AdminAttendanceClassSummary[]
) {
  const classById = new Map(classes.map((classroom) => [classroom.class_id, classroom]));
  const groupedFacts = new Map<string, AttendanceFact[]>();
  const classIdsByLevel = new Map<string, Set<string>>();
  const studentIdsByLevel = new Map<string, Set<string>>();
  const alertsByLevel = new Map<string, number>();

  for (const classroom of classes) {
    if (!classIdsByLevel.has(classroom.level_id)) {
      classIdsByLevel.set(classroom.level_id, new Set());
      studentIdsByLevel.set(classroom.level_id, new Set());
    }
    classIdsByLevel.get(classroom.level_id)?.add(classroom.class_id);
    for (const rosterKey of dataset.rosterByClass.get(classroom.class_id) || []) {
      studentIdsByLevel.get(classroom.level_id)?.add(rosterKey);
    }
  }
  for (const fact of dataset.facts) {
    const classroom = classById.get(fact.class_id);
    if (!classroom) continue;
    groupedFacts.set(classroom.level_id, [
      ...(groupedFacts.get(classroom.level_id) || []),
      fact,
    ]);
    studentIdsByLevel
      .get(classroom.level_id)
      ?.add(personKey(fact.student_type, fact.student_id));
  }
  for (const alert of dataset.alerts) {
    if (!alert.condition_active || alert.dealt_with_at) continue;
    const classroom = classById.get(text(alert.class_id));
    if (!classroom) continue;
    alertsByLevel.set(
      classroom.level_id,
      (alertsByLevel.get(classroom.level_id) || 0) + 1
    );
  }

  return Array.from(classIdsByLevel.entries())
    .map(([levelId, classIds]): AdminAttendanceLevelSummary => ({
      level_id: levelId,
      level_name: dataset.levels.get(levelId) || "Class",
      class_count: classIds.size,
      student_count: studentIdsByLevel.get(levelId)?.size || 0,
      active_alert_count: alertsByLevel.get(levelId) || 0,
      ...calculateAttendanceSummary(groupedFacts.get(levelId) || []),
    }))
    .sort((left, right) =>
      left.level_name.localeCompare(right.level_name, undefined, {
        numeric: true,
        sensitivity: "base",
      })
    );
}

async function loadScopedClasses(academicYear: AdminAttendanceAcademicYear | null) {
  const { data, error } = await supabaseAdmin
    .from("classes")
    .select(
      "id, class_name, level_id, teacher_id, is_cambridge, course_type, days, start_time, end_time, start_date, end_date, academic_year_id"
    );
  if (error) throw error;
  return ((data || []) as RawClass[]).filter((classroom) =>
    classFallsWithinAcademicYear(classroom, academicYear)
  );
}

export async function getAdminAttendanceAlertCount() {
  const { selected } = await loadAcademicYearScope();
  const classRows = await loadScopedClasses(selected);
  const classIds = classRows.map((classroom) => text(classroom.id));
  let total = 0;
  for (const classIdChunk of chunks(classIds)) {
    const { count, error } = await supabaseAdmin
      .from("attendance_alerts")
      .select("id", { count: "exact", head: true })
      .in("class_id", classIdChunk)
      .eq("condition_active", true)
      .is("dealt_with_at", null);
    if (error) throw error;
    total += Math.max(0, Number(count) || 0);
  }
  return total;
}

export async function getAdminAttendanceOverview(
  academicYearId = ""
): Promise<AdminAttendanceOverview> {
  const { academicYears, selected } = await loadAcademicYearScope(academicYearId);
  const classRows = await loadScopedClasses(selected);
  const dataset = await loadDataset(classRows);
  for (const year of academicYears) dataset.academicYears.set(text(year.id), year);

  const classes = buildClassSummaries(dataset);
  const levels = buildLevelSummaries(dataset, classes);
  const alerts = buildAlertRows(dataset);
  const needsAttention = alerts.filter((alert) => alert.status === "needs_attention");
  const studentsBelow70 = new Set<string>();
  for (const facts of groupFactsByStudentClass(dataset.facts).values()) {
    const summary = calculateAttendanceSummary(facts);
    const student = facts[0];
    if (
      student &&
      summary.attendance_percentage !== null &&
      summary.attendance_percentage < 70
    ) {
      studentsBelow70.add(personKey(student.student_type, student.student_id));
    }
  }

  return {
    academic_years: academicYears,
    selected_academic_year: selected,
    summary: {
      ...calculateAttendanceSummary(dataset.facts),
      active_alert_count: needsAttention.length,
      alert_student_count: new Set(
        needsAttention.map((alert) => personKey(alert.student_type, alert.student_id))
      ).size,
      low_attendance_alert_count: needsAttention.filter(
        (alert) => alert.alert_type === "low_attendance"
      ).length,
      consecutive_absence_alert_count: needsAttention.filter(
        (alert) => alert.alert_type === "consecutive_absence"
      ).length,
      students_below_70_count: studentsBelow70.size,
    },
    levels,
    classes,
    alerts,
  };
}

export async function getAdminAttendanceClassDetails(
  classId: string
): Promise<AdminAttendanceClassDetails> {
  if (!UUID_PATTERN.test(classId)) {
    throw new AdminAttendanceError("Class was not found.", 404);
  }
  const { data, error } = await supabaseAdmin
    .from("classes")
    .select(
      "id, class_name, level_id, teacher_id, is_cambridge, course_type, days, start_time, end_time, start_date, end_date, academic_year_id"
    )
    .eq("id", classId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new AdminAttendanceError("Class was not found.", 404);

  const dataset = await loadDataset([data as RawClass]);
  const classroom = buildClassSummaries(dataset)[0];
  if (!classroom) throw new AdminAttendanceError("Class was not found.", 404);

  const factsByStudentClass = groupFactsByStudentClass(dataset.facts);
  const activeAlerts = new Map<string, number>();
  for (const alert of dataset.alerts) {
    if (!alert.condition_active || alert.dealt_with_at) continue;
    const id =
      alert.student_type === "profile"
        ? text(alert.profile_student_id)
        : text(alert.young_learner_id);
    if (!id) continue;
    const key = personKey(alert.student_type, id);
    activeAlerts.set(key, (activeAlerts.get(key) || 0) + 1);
  }

  const expectedStudentType: AttendanceStudentType = data.is_cambridge
    ? "profile"
    : "young_learner";
  const roster = Array.from(dataset.rosterByClass.get(classId) || []).filter(
    (key) => key.startsWith(`${expectedStudentType}|`)
  );
  const students = roster
    .map((key): AdminAttendanceClassStudent => {
      const studentId = key.slice(`${expectedStudentType}|`.length);
      const person =
        expectedStudentType === "profile"
          ? dataset.profiles.get(studentId)
          : dataset.youngLearners.get(studentId);
      return {
        student_type: expectedStudentType,
        student_id: studentId,
        student_name: fullName(person, "Unknown student"),
        active: person?.active !== false,
        active_alert_count: activeAlerts.get(key) || 0,
        ...calculateAttendanceSummary(
          factsByStudentClass.get(
            studentKey(classId, expectedStudentType, studentId)
          ) || []
        ),
      };
    })
    .sort((left, right) => left.student_name.localeCompare(right.student_name));

  return { classroom, students };
}

function normalizedSearch(value: unknown) {
  return text(value).toLocaleLowerCase("en-GB");
}

export async function searchAdminAttendanceStudents(
  query: string
): Promise<AdminAttendanceStudentSearchResult[]> {
  const normalizedQuery = normalizedSearch(query);
  if (!normalizedQuery) return [];
  if (normalizedQuery.length > 100) {
    throw new AdminAttendanceError("Student search is too long.", 400);
  }

  const [profilesResult, learnersResult, academicScope] = await Promise.all([
    supabaseAdmin
      .from("profiles")
      .select("id, first_name, last_name, email, active")
      .eq("role", "student"),
    supabaseAdmin
      .from("young_learners")
      .select("id, first_name, last_name, class_id, active"),
    loadAcademicYearScope(),
  ]);
  if (profilesResult.error) throw profilesResult.error;
  if (learnersResult.error) throw learnersResult.error;

  const profileMatches = (profilesResult.data || []).filter((student) =>
    normalizedSearch(fullName(student, "")).includes(normalizedQuery)
  );
  const learnerMatches = (learnersResult.data || []).filter((student) =>
    normalizedSearch(fullName(student, "")).includes(normalizedQuery)
  );
  const limitedPeople = [
    ...profileMatches.map((student) => ({ student, type: "profile" as const })),
    ...learnerMatches.map((student) => ({
      student,
      type: "young_learner" as const,
    })),
  ]
    .sort((left, right) =>
      fullName(left.student, "").localeCompare(fullName(right.student, ""))
    )
    .slice(0, 50);
  const matchedProfileIds = limitedPeople
    .filter((item) => item.type === "profile")
    .map((item) => text(item.student.id));
  const enrolmentsResult = matchedProfileIds.length
    ? await supabaseAdmin
        .from("class_enrolments")
        .select("student_id, class_id")
        .in("student_id", matchedProfileIds)
    : { data: [], error: null };
  if (enrolmentsResult.error) throw enrolmentsResult.error;

  const classIds = unique([
    ...(enrolmentsResult.data || []).map((row) => row.class_id),
    ...limitedPeople
      .filter((item) => item.type === "young_learner")
      .map((item) => item.student.class_id),
  ]);
  const classesResult = classIds.length
    ? await supabaseAdmin
        .from("classes")
        .select(
          "id, class_name, level_id, teacher_id, is_cambridge, course_type, days, start_time, end_time, start_date, end_date, academic_year_id"
        )
        .in("id", classIds)
    : { data: [], error: null };
  if (classesResult.error) throw classesResult.error;
  const classRows = (classesResult.data || []) as RawClass[];
  const levelIds = unique(classRows.map((classroom) => classroom.level_id));
  const levelsResult = levelIds.length
    ? await supabaseAdmin.from("levels").select("id, name").in("id", levelIds)
    : { data: [], error: null };
  if (levelsResult.error) throw levelsResult.error;
  const classMap = new Map(classRows.map((classroom) => [text(classroom.id), classroom]));
  const levelMap = new Map(
    (levelsResult.data || []).map((level) => [text(level.id), text(level.name)])
  );
  const enrolmentsByStudent = new Map<string, RawClass[]>();
  for (const enrolment of enrolmentsResult.data || []) {
    const classroom = classMap.get(text(enrolment.class_id));
    if (!classroom) continue;
    const studentId = text(enrolment.student_id);
    enrolmentsByStudent.set(studentId, [
      ...(enrolmentsByStudent.get(studentId) || []),
      classroom,
    ]);
  }

  return limitedPeople.map((item) => {
    const studentId = text(item.student.id);
    const classroom =
      item.type === "profile"
        ? resolveCurrentStudentClass(
            enrolmentsByStudent.get(studentId) || [],
            academicScope.selected?.id,
            getMadridDateString()
          ).classroom
        : classMap.get(text(item.student.class_id)) || null;
    const levelName = classroom
      ? levelMap.get(text(classroom.level_id)) || "Class"
      : null;
    return {
      student_type: item.type,
      student_id: studentId,
      student_name: fullName(item.student, "Unknown student"),
      email: item.type === "profile" ? text(item.student.email) || null : null,
      active: item.student.active !== false,
      class_id: classroom ? text(classroom.id) : null,
      class_name: classroom ? classDisplayName(classroom, levelName || "Class") : null,
      level_name: levelName,
    };
  });
}

function factsFromHistory(history: AdminAttendanceHistoryRow[]): AttendanceFact[] {
  return history.map((row) => ({
    entry_id: row.entry_id,
    register_id: row.register_id,
    class_id: row.class_id,
    student_type: "profile",
    student_id: "",
    attendance_status: row.attendance_status,
    lesson_date: row.lesson_date,
    scheduled_start_time: row.scheduled_start_time,
    scheduled_end_time: row.scheduled_end_time,
  }));
}

export async function getAdminAttendanceStudentDetails(
  studentType: AttendanceStudentType,
  studentId: string,
  academicYearId = ""
): Promise<AdminAttendanceStudentDetails> {
  if (!UUID_PATTERN.test(studentId)) {
    throw new AdminAttendanceError("Student was not found.", 404);
  }
  const { academicYears, selected } = await loadAcademicYearScope(academicYearId);
  const [attendance, personResult] = await Promise.all([
    getAdminStudentAttendance(studentType, studentId),
    studentType === "profile"
      ? supabaseAdmin
          .from("profiles")
          .select("id, first_name, last_name, email, active, role")
          .eq("id", studentId)
          .eq("role", "student")
          .maybeSingle()
      : supabaseAdmin
          .from("young_learners")
          .select("id, first_name, last_name, active, class_id")
          .eq("id", studentId)
          .maybeSingle(),
  ]);
  if (personResult.error) throw personResult.error;
  if (!personResult.data) throw new AdminAttendanceError("Student was not found.", 404);

  const allClassIds = unique([
    ...attendance.courses.map((course) => course.class_id),
    ...attendance.history.map((row) => row.class_id),
    attendance.current_class_id,
  ]);
  const classesResult = allClassIds.length
    ? await supabaseAdmin
        .from("classes")
        .select(
          "id, class_name, level_id, teacher_id, is_cambridge, course_type, days, start_time, end_time, start_date, end_date, academic_year_id"
        )
        .in("id", allClassIds)
    : { data: [], error: null };
  if (classesResult.error) throw classesResult.error;
  const scopedClasses = ((classesResult.data || []) as RawClass[]).filter(
    (classroom) => classFallsWithinAcademicYear(classroom, selected)
  );
  const scopedClassIds = new Set(scopedClasses.map((classroom) => text(classroom.id)));
  const history = attendance.history.filter((row) => scopedClassIds.has(row.class_id));
  const levelIds = unique(scopedClasses.map((classroom) => classroom.level_id));
  const teacherIds = unique(scopedClasses.map((classroom) => classroom.teacher_id));
  const [levelsResult, teachers] = await Promise.all([
    levelIds.length
      ? supabaseAdmin.from("levels").select("id, name").in("id", levelIds)
      : Promise.resolve({ data: [], error: null }),
    teacherIds.length ? loadProfiles(teacherIds) : Promise.resolve([]),
  ]);
  if (levelsResult.error) throw levelsResult.error;
  const levelMap = new Map(
    (levelsResult.data || []).map((level) => [text(level.id), text(level.name)])
  );
  const teacherMap = new Map(teachers.map((teacher) => [text(teacher.id), teacher]));
  const historyByClass = new Map<string, AdminAttendanceHistoryRow[]>();
  for (const row of history) {
    historyByClass.set(row.class_id, [
      ...(historyByClass.get(row.class_id) || []),
      row,
    ]);
  }

  const alerts: RawAttendanceAlert[] = [];
  if (scopedClassIds.size) {
    let query = supabaseAdmin
      .from("attendance_alerts")
      .select(
        "id, alert_type, class_id, student_type, profile_student_id, young_learner_id, condition_active, triggered_at, resolved_at, dealt_with_at, dealt_with_by"
      )
      .in("class_id", Array.from(scopedClassIds));
    query =
      studentType === "profile"
        ? query.eq("profile_student_id", studentId)
        : query.eq("young_learner_id", studentId);
    const alertResult = await query;
    if (alertResult.error) throw alertResult.error;
    alerts.push(...((alertResult.data || []) as RawAttendanceAlert[]));
  }
  const dealtWithIds = unique(alerts.map((alert) => alert.dealt_with_by));
  const dealtWithProfiles = dealtWithIds.length
    ? await loadProfiles(dealtWithIds)
    : [];
  const dataset: AttendanceDataset = {
    classRows: scopedClasses,
    facts: factsFromHistory(history).map((fact) => ({
      ...fact,
      student_type: studentType,
      student_id: studentId,
    })),
    alerts,
    levels: levelMap,
    profiles: new Map([
      ...teachers.map((teacher) => [text(teacher.id), teacher] as const),
      ...dealtWithProfiles.map((profile) => [text(profile.id), profile] as const),
      ...(studentType === "profile"
        ? [[studentId, personResult.data] as const]
        : []),
    ]),
    youngLearners: new Map(
      studentType === "young_learner" ? [[studentId, personResult.data]] : []
    ),
    academicYears: new Map(academicYears.map((year) => [text(year.id), year])),
    rosterByClass: new Map(),
  };

  const courses = scopedClasses
    .map((classroom) => {
      const classId = text(classroom.id);
      const levelName = levelMap.get(text(classroom.level_id)) || "Class";
      return {
        class_id: classId,
        class_name: classDisplayName(classroom, levelName),
        level_name: levelName,
        teacher_name: fullName(
          teacherMap.get(text(classroom.teacher_id)),
          "Teacher"
        ),
        course_type: courseTypeLabel(classroom.course_type) || "Regular",
        academic_year_label:
          academicYears.find(
            (year) => text(year.id) === text(classroom.academic_year_id)
          )?.label || null,
        ...calculateAttendanceSummary(historyByClass.get(classId) || []),
      };
    })
    .sort((left, right) => left.class_name.localeCompare(right.class_name));

  return {
    student: {
      student_type: studentType,
      student_id: studentId,
      student_name: fullName(personResult.data, "Unknown student"),
      email:
        studentType === "profile"
          ? text((personResult.data as PersonRecord).email) || null
          : null,
      active: personResult.data.active !== false,
    },
    selected_academic_year: selected,
    current_class_id:
      attendance.current_class_id && scopedClassIds.has(attendance.current_class_id)
        ? attendance.current_class_id
        : null,
    summary: calculateAttendanceSummary(history),
    courses,
    history,
    alerts: buildAlertRows(dataset),
  };
}

export async function markAttendanceAlertDealtWith(
  alertId: string,
  adminId: string
) {
  if (!UUID_PATTERN.test(alertId) || !UUID_PATTERN.test(adminId)) {
    throw new AdminAttendanceError("Attendance alert was not found.", 404);
  }
  const { data, error } = await supabaseAdmin
    .from("attendance_alerts")
    .update({
      dealt_with_at: new Date().toISOString(),
      dealt_with_by: adminId,
    })
    .eq("id", alertId)
    .eq("condition_active", true)
    .is("dealt_with_at", null)
    .select("id")
    .maybeSingle();
  if (error) throw error;
  if (!data) {
    throw new AdminAttendanceError(
      "This attendance alert no longer needs an update.",
      409
    );
  }
  return { id: text(data.id) };
}
