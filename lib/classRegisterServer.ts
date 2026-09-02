import "server-only";

import { NextRequest } from "next/server";

import {
  addMadridCalendarDays,
  getMadridDateString,
  getMadridMinutes,
  isScheduledOnClassDays,
  madridWeekdayForDate,
  normalizeScheduledTime,
  scheduledTimeToMinutes,
} from "./classProgressServer";
import {
  classUsesAcademicYear,
  resolveCurrentStudentClass,
} from "./academicYearRules";
import { getCurrentAcademicYearServer } from "./academicYearsServer";
import {
  type AdminAttendanceCourse,
  type AdminAttendanceHistoryRow,
  type AdminStudentAttendance,
  type ClassAttendanceStatus,
  type ClassAttendanceSummary,
  type ClassRegisterDetails,
  type ClassRegisterLesson,
  type ClassRegisterReminder,
  type ClassRegisterSnapshot,
  type ClassRegisterUnavailableReason,
  type ClassRegisterUnavailableResponse,
  getEmptyClassAttendanceSummary,
} from "./classRegister";
import { supabaseAdmin } from "./supabaseAdmin";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export const CLASS_REGISTER_START_DATE = "2026-09-01";

type RegisterActor = {
  id: string;
  role: "teacher" | "admin";
};

type RawClass = {
  id: string;
  teacher_id: string | null;
  level_id: number;
  class_name: string | null;
  is_cambridge: boolean;
  course_type: string | null;
  days: string | null;
  start_time: string | null;
  end_time: string | null;
  start_date: string | null;
  end_date: string | null;
  academic_year_id: string | null;
};

export type ClassRegisterContext = {
  actor: RegisterActor;
  classId: string;
  teacherId: string;
  className: string;
  levelId: number;
  levelName: string;
  isCambridge: boolean;
  courseType: string;
  classDays: string;
  scheduledStartTime: string;
  scheduledEndTime: string;
  periodStart: string;
  periodEnd: string;
  academicYearLabel: string | null;
};

type ScheduledRegisterLesson = {
  lesson_date: string;
  scheduled_start_time: string;
  scheduled_end_time: string;
};

export class ClassRegisterError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

export class ClassRegisterUnavailableError extends ClassRegisterError {
  constructor(
    readonly reason: ClassRegisterUnavailableReason,
    message: string
  ) {
    super(message, 422);
    this.name = "ClassRegisterUnavailableError";
  }
}

export function getClassRegisterUnavailableResponse(
  error: ClassRegisterUnavailableError
): ClassRegisterUnavailableResponse {
  return {
    available: false,
    reason: error.reason,
    message: error.message,
  };
}

function text(value: unknown) {
  return String(value ?? "").trim();
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

function classDisplayName(classroom: RawClass, levelName: string) {
  const courseLabel = classroom.is_cambridge
    ? courseTypeLabel(classroom.course_type)
    : "";
  return [levelName, courseLabel].filter(Boolean).join(" ") ||
    text(classroom.class_name) ||
    "Class";
}

function validDate(value: string) {
  return DATE_PATTERN.test(value) && Boolean(madridWeekdayForDate(value));
}

function maxDate(left: string, right: string) {
  return left > right ? left : right;
}

function getBearerToken(request: NextRequest) {
  const authorization = request.headers.get("authorization") || "";
  return authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
}

async function getRegisterActor(
  request: NextRequest,
  allowedRoles: Array<RegisterActor["role"]> = ["teacher"]
): Promise<RegisterActor> {
  const token = getBearerToken(request);
  if (!token) throw new ClassRegisterError("Authentication required.", 401);

  const { data: authData, error: authError } =
    await supabaseAdmin.auth.getUser(token);
  if (authError || !authData.user) {
    throw new ClassRegisterError("Authentication required.", 401);
  }

  const { data: profile, error: profileError } = await supabaseAdmin
    .from("profiles")
    .select("id, role")
    .eq("id", authData.user.id)
    .maybeSingle();
  if (profileError) throw profileError;

  const role = text(profile?.role).toLowerCase();
  if (role !== "teacher" && role !== "admin") {
    throw new ClassRegisterError("Staff access required.", 403);
  }
  if (!allowedRoles.includes(role)) {
    throw new ClassRegisterError("Teacher access required.", 403);
  }

  return { id: authData.user.id, role };
}

async function buildClassContext(
  actor: RegisterActor,
  classroom: RawClass,
  options: { enforceTeacherOwnership: boolean }
): Promise<ClassRegisterContext> {
  if (
    options.enforceTeacherOwnership &&
    (actor.role !== "teacher" || text(classroom.teacher_id) !== actor.id)
  ) {
    throw new ClassRegisterError("Class Register was not found.", 404);
  }

  const [{ data: level, error: levelError }, academicYearResult] =
    await Promise.all([
      supabaseAdmin
        .from("levels")
        .select("id, name")
        .eq("id", classroom.level_id)
        .maybeSingle(),
      classUsesAcademicYear(classroom.course_type) && classroom.academic_year_id
        ? supabaseAdmin
            .from("academic_years")
            .select("id, label, start_date, end_date")
            .eq("id", classroom.academic_year_id)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ]);
  if (levelError || !level) {
    throw new ClassRegisterError("Unable to verify the class level.", 500);
  }
  if (academicYearResult.error) throw academicYearResult.error;

  const start = normalizeScheduledTime(classroom.start_time);
  const end = normalizeScheduledTime(classroom.end_time);
  if (
    !start ||
    !end ||
    (scheduledTimeToMinutes(end) || 0) <=
      (scheduledTimeToMinutes(start) || 0)
  ) {
    throw new ClassRegisterUnavailableError(
      "invalid_class_times",
      "This class needs valid start and end times before attendance can be recorded."
    );
  }

  const usesAcademicYear = classUsesAcademicYear(classroom.course_type);
  const periodStart = usesAcademicYear
    ? text(academicYearResult.data?.start_date)
    : text(classroom.start_date);
  const periodEnd = usesAcademicYear
    ? text(academicYearResult.data?.end_date)
    : text(classroom.end_date);
  if (!validDate(periodStart) || !validDate(periodEnd) || periodEnd < periodStart) {
    if (usesAcademicYear) {
      throw new ClassRegisterUnavailableError(
        "missing_academic_year",
        "This class needs a valid Academic Year before attendance can be recorded."
      );
    }

    const courseLabel = courseTypeLabel(classroom.course_type) || "Date-based";
    throw new ClassRegisterUnavailableError(
      "missing_course_dates",
      `This ${courseLabel} course does not have a start and end date yet. Ask Admin to add the course dates before taking attendance.`
    );
  }

  const levelName = text(level.name);
  return {
    actor,
    classId: text(classroom.id),
    teacherId: text(classroom.teacher_id),
    className: classDisplayName(classroom, levelName),
    levelId: Number(level.id),
    levelName,
    isCambridge: classroom.is_cambridge === true,
    courseType: normalizeCourseType(classroom.course_type),
    classDays: text(classroom.days),
    scheduledStartTime: start,
    scheduledEndTime: end,
    periodStart: maxDate(periodStart, CLASS_REGISTER_START_DATE),
    periodEnd,
    academicYearLabel: text(academicYearResult.data?.label) || null,
  };
}

export async function getTeacherClassRegisterContext(
  request: NextRequest,
  requestedClassId: string
) {
  if (!UUID_PATTERN.test(requestedClassId)) {
    throw new ClassRegisterError("Class Register was not found.", 404);
  }

  const actor = await getRegisterActor(request, ["teacher"]);
  const { data: classroom, error } = await supabaseAdmin
    .from("classes")
    .select(
      "id, teacher_id, level_id, class_name, is_cambridge, course_type, days, start_time, end_time, start_date, end_date, academic_year_id"
    )
    .eq("id", requestedClassId)
    .maybeSingle();
  if (error) throw error;
  if (!classroom) throw new ClassRegisterError("Class Register was not found.", 404);

  return buildClassContext(actor, classroom as RawClass, {
    enforceTeacherOwnership: true,
  });
}

function isLegitimateScheduledDate(
  context: ClassRegisterContext,
  lessonDate: string
) {
  const weekday = madridWeekdayForDate(lessonDate);
  return (
    validDate(lessonDate) &&
    lessonDate >= context.periodStart &&
    lessonDate <= context.periodEnd &&
    isScheduledOnClassDays(context.classDays, weekday)
  );
}

function lessonIsAvailable(
  lessonDate: string,
  startTime: string,
  now = new Date()
) {
  const today = getMadridDateString(now);
  if (lessonDate < today) return true;
  if (lessonDate > today) return false;
  return getMadridMinutes(now) >= (scheduledTimeToMinutes(startTime) || 0);
}

export function verifyClassRegisterLesson(
  context: ClassRegisterContext,
  lessonDate: string,
  scheduledStartTime: string,
  options: { requireAvailable?: boolean } = {}
) {
  const start = normalizeScheduledTime(scheduledStartTime);
  if (
    !isLegitimateScheduledDate(context, lessonDate) ||
    start !== context.scheduledStartTime
  ) {
    throw new ClassRegisterError(
      "This is not a scheduled lesson for the selected class.",
      422
    );
  }
  if (lessonDate > getMadridDateString()) {
    throw new ClassRegisterError("Future Class Registers cannot be opened.", 422);
  }
  if (options.requireAvailable && !lessonIsAvailable(lessonDate, start)) {
    throw new ClassRegisterError(
      "The Class Register becomes available at the scheduled lesson start time.",
      409
    );
  }

  return {
    lesson_date: lessonDate,
    scheduled_start_time: context.scheduledStartTime,
    scheduled_end_time: context.scheduledEndTime,
  };
}

function getRecentScheduledLessons(
  context: ClassRegisterContext,
  limit = 12,
  now = new Date()
) {
  const today = getMadridDateString(now);
  const lastDate = today < context.periodEnd ? today : context.periodEnd;
  const lessons: ScheduledRegisterLesson[] = [];
  if (lastDate < context.periodStart) return lessons;

  let date = lastDate;
  let inspected = 0;
  while (date >= context.periodStart && lessons.length < limit && inspected < 740) {
    if (isLegitimateScheduledDate(context, date)) {
      lessons.push({
        lesson_date: date,
        scheduled_start_time: context.scheduledStartTime,
        scheduled_end_time: context.scheduledEndTime,
      });
    }
    date = addMadridCalendarDays(date, -1);
    inspected += 1;
  }
  return lessons;
}

function registerKey(classId: string, lessonDate: string, startTime: unknown) {
  return `${classId}|${lessonDate}|${normalizeScheduledTime(startTime)}`;
}

function summarizeEntries(entries: any[]) {
  const presentCount = entries.filter(
    (entry) => entry.attendance_status === "present"
  ).length;
  const absentCount = entries.filter(
    (entry) => entry.attendance_status === "absent"
  ).length;
  return {
    presentCount,
    absentCount,
    unmarkedCount: entries.length - presentCount - absentCount,
  };
}

function buildLesson(
  context: ClassRegisterContext,
  scheduled: ScheduledRegisterLesson,
  register: any | null,
  entries: any[],
  now = new Date()
): ClassRegisterLesson {
  const counts = summarizeEntries(entries);
  const today = getMadridDateString(now);
  const currentMinutes = getMadridMinutes(now);
  const endMinutes = scheduledTimeToMinutes(scheduled.scheduled_end_time) || 0;
  const available = lessonIsAvailable(
    scheduled.lesson_date,
    scheduled.scheduled_start_time,
    now
  );
  const overdue =
    scheduled.lesson_date < today ||
    (scheduled.lesson_date === today && available && currentMinutes > endMinutes);
  const status: ClassRegisterLesson["status"] = register?.completed_at
    ? "completed"
    : register
      ? "in_progress"
      : available
        ? "not_started"
        : "upcoming";

  return {
    register_id: register ? text(register.id) : null,
    lesson_date: scheduled.lesson_date,
    scheduled_start_time: scheduled.scheduled_start_time,
    scheduled_end_time: scheduled.scheduled_end_time,
    completed_at: register?.completed_at || null,
    present_count: counts.presentCount,
    absent_count: counts.absentCount,
    unmarked_count: counts.unmarkedCount,
    student_count: entries.length,
    is_available: available,
    is_overdue: overdue && !register?.completed_at,
    status,
  };
}

async function loadRegisterDetails(register: any): Promise<ClassRegisterDetails> {
  const { data: entries, error } = await supabaseAdmin
    .from("class_register_entries")
    .select(
      "id, student_type, profile_student_id, young_learner_id, attendance_status, marked_at"
    )
    .eq("register_id", register.id);
  if (error) throw error;

  const profileIds = (entries || [])
    .map((entry) => text(entry.profile_student_id))
    .filter(Boolean);
  const youngLearnerIds = (entries || [])
    .map((entry) => text(entry.young_learner_id))
    .filter(Boolean);
  const [profilesResult, youngLearnersResult] = await Promise.all([
    profileIds.length
      ? supabaseAdmin
          .from("profiles")
          .select("id, first_name, last_name")
          .in("id", profileIds)
      : Promise.resolve({ data: [], error: null }),
    youngLearnerIds.length
      ? supabaseAdmin
          .from("young_learners")
          .select("id, first_name, last_name")
          .in("id", youngLearnerIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (profilesResult.error) throw profilesResult.error;
  if (youngLearnersResult.error) throw youngLearnersResult.error;

  const names = new Map(
    [...(profilesResult.data || []), ...(youngLearnersResult.data || [])].map(
      (student) => [text(student.id), student]
    )
  );
  const mappedEntries = (entries || [])
    .map((entry) => {
      const studentId =
        text(entry.profile_student_id) || text(entry.young_learner_id);
      const student = names.get(studentId);
      const firstName = text(student?.first_name);
      const lastName = text(student?.last_name);
      return {
        id: text(entry.id),
        student_type: entry.student_type as "profile" | "young_learner",
        student_id: studentId,
        first_name: firstName,
        last_name: lastName,
        full_name: `${firstName} ${lastName}`.trim() || "Student",
        attendance_status: (entry.attendance_status || null) as ClassAttendanceStatus,
        marked_at: entry.marked_at || null,
      };
    })
    .sort((left, right) =>
      `${left.last_name}|${left.first_name}`.localeCompare(
        `${right.last_name}|${right.first_name}`
      )
    );

  return {
    id: text(register.id),
    class_id: text(register.class_id),
    lesson_date: text(register.lesson_date),
    scheduled_start_time: normalizeScheduledTime(register.scheduled_start_time),
    scheduled_end_time: normalizeScheduledTime(register.scheduled_end_time),
    completed_at: register.completed_at || null,
    completed_by: register.completed_by || null,
    entries: mappedEntries,
  };
}

export async function loadClassRegisterSnapshot(
  context: ClassRegisterContext,
  selected?: { lessonDate: string; scheduledStartTime: string } | null
): Promise<ClassRegisterSnapshot> {
  const now = new Date();
  const today = getMadridDateString(now);
  const recentLessons = getRecentScheduledLessons(context, 12, now);
  let selectedLesson: ScheduledRegisterLesson | null = null;

  if (selected?.lessonDate) {
    selectedLesson = verifyClassRegisterLesson(
      context,
      selected.lessonDate,
      selected.scheduledStartTime
    );
  }

  const queryDates = Array.from(
    new Set([
      ...recentLessons.map((lesson) => lesson.lesson_date),
      ...(selectedLesson ? [selectedLesson.lesson_date] : []),
    ])
  );
  const registerResult = queryDates.length
    ? await supabaseAdmin
        .from("class_registers")
        .select(
          "id, class_id, lesson_date, scheduled_start_time, scheduled_end_time, completed_at, completed_by, created_at, updated_at"
        )
        .eq("class_id", context.classId)
        .in("lesson_date", queryDates)
    : { data: [], error: null };
  if (registerResult.error) throw registerResult.error;

  const registers = registerResult.data || [];
  const registerIds = registers.map((register) => text(register.id));
  const entryResult = registerIds.length
    ? await supabaseAdmin
        .from("class_register_entries")
        .select("id, register_id, attendance_status")
        .in("register_id", registerIds)
    : { data: [], error: null };
  if (entryResult.error) throw entryResult.error;

  const entriesByRegister = new Map<string, any[]>();
  for (const entry of entryResult.data || []) {
    const registerId = text(entry.register_id);
    entriesByRegister.set(registerId, [
      ...(entriesByRegister.get(registerId) || []),
      entry,
    ]);
  }
  const registersByKey = new Map(
    registers.map((register) => [
      registerKey(
        context.classId,
        text(register.lesson_date),
        register.scheduled_start_time
      ),
      register,
    ])
  );
  const lessonRows = recentLessons.map((lesson) => {
    const register = registersByKey.get(
      registerKey(context.classId, lesson.lesson_date, lesson.scheduled_start_time)
    );
    return buildLesson(
      context,
      lesson,
      register || null,
      register ? entriesByRegister.get(text(register.id)) || [] : [],
      now
    );
  });

  const selectedRegister = selectedLesson
    ? registersByKey.get(
        registerKey(
          context.classId,
          selectedLesson.lesson_date,
          selectedLesson.scheduled_start_time
        )
      ) || null
    : null;
  const selectedRow = selectedLesson
    ? buildLesson(
        context,
        selectedLesson,
        selectedRegister,
        selectedRegister
          ? entriesByRegister.get(text(selectedRegister.id)) || []
          : [],
        now
      )
    : null;

  return {
    class: {
      id: context.classId,
      name: context.className,
      level: context.levelName,
      course_type: context.courseType,
      days: context.classDays,
      scheduled_start_time: context.scheduledStartTime,
      scheduled_end_time: context.scheduledEndTime,
    },
    today_madrid: today,
    today_lesson:
      lessonRows.find((lesson) => lesson.lesson_date === today) || null,
    recent_registers: lessonRows.filter(
      (lesson) => lesson.lesson_date !== today
    ),
    selected_lesson: selectedRow,
    selected_register: selectedRegister
      ? await loadRegisterDetails(selectedRegister)
      : null,
  };
}

async function loadCurrentRoster(
  context: ClassRegisterContext,
  lessonDate: string
) {
  if (context.isCambridge) {
    const { data: enrolments, error: enrolmentError } = await supabaseAdmin
      .from("class_enrolments")
      .select("student_id, enrolled_at")
      .eq("class_id", context.classId)
      .lte("enrolled_at", lessonDate);
    if (enrolmentError) throw enrolmentError;

    const studentIds = Array.from(
      new Set((enrolments || []).map((row) => text(row.student_id)).filter(Boolean))
    );
    if (!studentIds.length) return [];
    const { data: profiles, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("id, role, active")
      .in("id", studentIds);
    if (profileError) throw profileError;

    return (profiles || [])
      .filter(
        (profile) =>
          text(profile.role).toLowerCase() === "student" &&
          profile.active !== false
      )
      .map((profile) => ({
        student_type: "profile",
        profile_student_id: text(profile.id),
        young_learner_id: null,
      }));
  }

  const { data: learners, error: learnerError } = await supabaseAdmin
    .from("young_learners")
    .select("id")
    .eq("class_id", context.classId)
    .eq("active", true);
  if (learnerError) throw learnerError;
  const learnerIds = (learners || []).map((learner) => text(learner.id));
  if (!learnerIds.length) return [];

  const { data: enrolments, error: enrolmentError } = await supabaseAdmin
    .from("young_learner_enrolments")
    .select("young_learner_id, enrolled_at")
    .eq("class_id", context.classId)
    .in("young_learner_id", learnerIds)
    .lte("enrolled_at", lessonDate);
  if (enrolmentError) throw enrolmentError;
  const enrolledIds = new Set(
    (enrolments || []).map((enrolment) => text(enrolment.young_learner_id))
  );

  return learnerIds
    .filter((id) => enrolledIds.has(id))
    .map((id) => ({
      student_type: "young_learner",
      profile_student_id: null,
      young_learner_id: id,
    }));
}

export async function openClassRegister(
  context: ClassRegisterContext,
  lessonDate: string,
  scheduledStartTime: string
) {
  const lesson = verifyClassRegisterLesson(
    context,
    lessonDate,
    scheduledStartTime,
    { requireAvailable: true }
  );
  const roster = await loadCurrentRoster(context, lesson.lesson_date);
  const { error } = await supabaseAdmin.rpc("open_class_register", {
    p_actor_id: context.actor.id,
    p_class_id: context.classId,
    p_lesson_date: lesson.lesson_date,
    p_scheduled_start_time: lesson.scheduled_start_time,
    p_scheduled_end_time: lesson.scheduled_end_time,
    p_roster: roster,
  });
  if (error) throw error;

  return loadClassRegisterSnapshot(context, {
    lessonDate: lesson.lesson_date,
    scheduledStartTime: lesson.scheduled_start_time,
  });
}

function parseAttendanceEntries(value: unknown) {
  if (!Array.isArray(value)) {
    throw new ClassRegisterError("Invalid Class Register entries.", 400);
  }
  return value.map((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new ClassRegisterError("Invalid Class Register entry.", 400);
    }
    const record = item as Record<string, unknown>;
    if (
      Object.keys(record).some(
        (key) => !["entry_id", "attendance_status"].includes(key)
      )
    ) {
      throw new ClassRegisterError("Unsupported Class Register entry fields.", 400);
    }
    const entryId = text(record.entry_id);
    const status = record.attendance_status;
    if (!UUID_PATTERN.test(entryId)) {
      throw new ClassRegisterError("Invalid Class Register entry.", 400);
    }
    if (status !== null && status !== "present" && status !== "absent") {
      throw new ClassRegisterError("Attendance must be Present or Absent.", 422);
    }
    return { entry_id: entryId, attendance_status: status };
  });
}

export async function saveClassRegister(
  context: ClassRegisterContext,
  input: {
    registerId: string;
    entries: unknown;
    complete: boolean;
  }
) {
  if (!UUID_PATTERN.test(input.registerId)) {
    throw new ClassRegisterError("Class Register was not found.", 404);
  }
  const { data: register, error: registerError } = await supabaseAdmin
    .from("class_registers")
    .select("id, class_id, lesson_date, scheduled_start_time")
    .eq("id", input.registerId)
    .eq("class_id", context.classId)
    .maybeSingle();
  if (registerError) throw registerError;
  if (!register) throw new ClassRegisterError("Class Register was not found.", 404);

  const lesson = verifyClassRegisterLesson(
    context,
    text(register.lesson_date),
    normalizeScheduledTime(register.scheduled_start_time),
    { requireAvailable: true }
  );
  const entries = parseAttendanceEntries(input.entries);
  const { error } = await supabaseAdmin.rpc("save_class_register_attendance", {
    p_actor_id: context.actor.id,
    p_register_id: input.registerId,
    p_entries: entries,
    p_complete: input.complete === true,
  });
  if (error) throw error;

  return loadClassRegisterSnapshot(context, {
    lessonDate: lesson.lesson_date,
    scheduledStartTime: lesson.scheduled_start_time,
  });
}

function getAllScheduledLessonsThroughNow(
  context: ClassRegisterContext,
  now = new Date()
) {
  const today = getMadridDateString(now);
  const lastDate = today < context.periodEnd ? today : context.periodEnd;
  const lessons: ScheduledRegisterLesson[] = [];
  if (lastDate < context.periodStart) return lessons;

  let date = context.periodStart;
  let inspected = 0;
  while (date <= lastDate && inspected < 740) {
    if (
      isLegitimateScheduledDate(context, date) &&
      lessonIsAvailable(date, context.scheduledStartTime, now)
    ) {
      lessons.push({
        lesson_date: date,
        scheduled_start_time: context.scheduledStartTime,
        scheduled_end_time: context.scheduledEndTime,
      });
    }
    date = addMadridCalendarDays(date, 1);
    inspected += 1;
  }
  return lessons;
}

export async function loadClassRegisterReminders(request: NextRequest) {
  const actor = await getRegisterActor(request, ["teacher"]);
  const { data: classes, error: classError } = await supabaseAdmin
    .from("classes")
    .select(
      "id, teacher_id, level_id, class_name, is_cambridge, course_type, days, start_time, end_time, start_date, end_date, academic_year_id"
    )
    .eq("teacher_id", actor.id);
  if (classError) throw classError;

  const contexts: ClassRegisterContext[] = [];
  for (const classroom of classes || []) {
    try {
      contexts.push(
        await buildClassContext(actor, classroom as RawClass, {
          enforceTeacherOwnership: true,
        })
      );
    } catch (error) {
      if (error instanceof ClassRegisterUnavailableError) {
        continue;
      }
      if (error instanceof ClassRegisterError && error.status === 422) {
        console.error("Class Register reminder skipped invalid schedule:", {
          classId: classroom.id,
          message: error.message,
        });
        continue;
      }
      throw error;
    }
  }
  if (!contexts.length) return { reminders: [] as ClassRegisterReminder[] };

  const now = new Date();
  const today = getMadridDateString(now);
  const candidates = contexts.flatMap((context) =>
    getAllScheduledLessonsThroughNow(context, now).map((lesson) => ({
      context,
      lesson,
    }))
  );
  if (!candidates.length) return { reminders: [] as ClassRegisterReminder[] };

  const { data: registers, error: registerError } = await supabaseAdmin
    .from("class_registers")
    .select("class_id, lesson_date, scheduled_start_time, completed_at")
    .in(
      "class_id",
      contexts.map((context) => context.classId)
    )
    .gte("lesson_date", CLASS_REGISTER_START_DATE)
    .lte("lesson_date", today);
  if (registerError) throw registerError;
  const completed = new Set(
    (registers || [])
      .filter((register) => Boolean(register.completed_at))
      .map((register) =>
        registerKey(
          text(register.class_id),
          text(register.lesson_date),
          register.scheduled_start_time
        )
      )
  );
  const started = new Set(
    (registers || []).map((register) =>
      registerKey(
        text(register.class_id),
        text(register.lesson_date),
        register.scheduled_start_time
      )
    )
  );
  const currentMinutes = getMadridMinutes(now);
  const reminders = candidates
    .filter(
      ({ context, lesson }) =>
        !completed.has(
          registerKey(
            context.classId,
            lesson.lesson_date,
            lesson.scheduled_start_time
          )
        )
    )
    .map(({ context, lesson }): ClassRegisterReminder => {
      const endMinutes =
        scheduledTimeToMinutes(lesson.scheduled_end_time) || currentMinutes;
      return {
        class_id: context.classId,
        class_name: context.className,
        level: context.levelName,
        course_type: context.courseType,
        lesson_date: lesson.lesson_date,
        scheduled_start_time: lesson.scheduled_start_time,
        scheduled_end_time: lesson.scheduled_end_time,
        is_overdue:
          lesson.lesson_date < today ||
          (lesson.lesson_date === today && currentMinutes > endMinutes),
        is_current_lesson:
          lesson.lesson_date === today && currentMinutes <= endMinutes,
        register_started: started.has(
          registerKey(
            context.classId,
            lesson.lesson_date,
            lesson.scheduled_start_time
          )
        ),
      };
    })
    .sort((left, right) => {
      if (left.is_overdue !== right.is_overdue) {
        return left.is_overdue ? -1 : 1;
      }
      return `${left.lesson_date}|${left.scheduled_start_time}`.localeCompare(
        `${right.lesson_date}|${right.scheduled_start_time}`
      );
    });

  return { reminders };
}

function calculateAttendanceSummary(entries: any[]): ClassAttendanceSummary {
  const presentCount = entries.filter(
    (entry) => entry.attendance_status === "present"
  ).length;
  const absentCount = entries.filter(
    (entry) => entry.attendance_status === "absent"
  ).length;
  const total = presentCount + absentCount;
  return {
    present_count: presentCount,
    absent_count: absentCount,
    completed_register_count: total,
    attendance_percentage:
      total === 0 ? null : Math.round((presentCount / total) * 1000) / 10,
  };
}

export async function getStudentClassAttendanceSummary(
  classId: string,
  studentType: "profile" | "young_learner",
  studentId: string
) {
  if (!UUID_PATTERN.test(classId) || !UUID_PATTERN.test(studentId)) {
    throw new ClassRegisterError("Attendance information was not found.", 404);
  }
  const { data: registers, error: registerError } = await supabaseAdmin
    .from("class_registers")
    .select("id")
    .eq("class_id", classId)
    .not("completed_at", "is", null);
  if (registerError) throw registerError;
  const registerIds = (registers || []).map((register) => text(register.id));
  if (!registerIds.length) return getEmptyClassAttendanceSummary();

  let query = supabaseAdmin
    .from("class_register_entries")
    .select("attendance_status")
    .in("register_id", registerIds)
    .not("attendance_status", "is", null);
  query =
    studentType === "profile"
      ? query.eq("profile_student_id", studentId)
      : query.eq("young_learner_id", studentId);
  const { data: entries, error: entryError } = await query;
  if (entryError) throw entryError;
  return calculateAttendanceSummary(entries || []);
}

export async function getTeacherStudentAttendance(
  request: NextRequest,
  classId: string,
  studentType: "profile" | "young_learner",
  studentId: string
) {
  const context = await getTeacherClassRegisterContext(request, classId);
  const rosterResult =
    studentType === "profile"
      ? await supabaseAdmin
          .from("class_enrolments")
          .select("student_id")
          .eq("class_id", classId)
          .eq("student_id", studentId)
          .limit(1)
      : await supabaseAdmin
          .from("young_learners")
          .select("id")
          .eq("class_id", classId)
          .eq("id", studentId)
          .limit(1);
  if (rosterResult.error) throw rosterResult.error;
  if (!(rosterResult.data || []).length) {
    throw new ClassRegisterError("Student attendance was not found.", 404);
  }

  return {
    class_id: context.classId,
    summary: await getStudentClassAttendanceSummary(
      context.classId,
      studentType,
      studentId
    ),
  };
}

async function loadAttendanceHistory(
  studentType: "profile" | "young_learner",
  studentId: string
) {
  let entryQuery = supabaseAdmin
    .from("class_register_entries")
    .select("id, register_id, attendance_status")
    .not("attendance_status", "is", null);
  entryQuery =
    studentType === "profile"
      ? entryQuery.eq("profile_student_id", studentId)
      : entryQuery.eq("young_learner_id", studentId);
  const { data: entries, error: entryError } = await entryQuery;
  if (entryError) throw entryError;
  const registerIds = (entries || []).map((entry) => text(entry.register_id));
  if (!registerIds.length) {
    return {
      history: [] as AdminAttendanceHistoryRow[],
      summaries: new Map<string, ClassAttendanceSummary>(),
      classRows: [] as any[],
      levels: new Map<string, string>(),
      academicYears: new Map<string, string>(),
    };
  }

  const { data: registers, error: registerError } = await supabaseAdmin
    .from("class_registers")
    .select(
      "id, class_id, lesson_date, scheduled_start_time, scheduled_end_time, completed_at, completed_by"
    )
    .in("id", registerIds)
    .not("completed_at", "is", null);
  if (registerError) throw registerError;
  const completedRegisterIds = new Set(
    (registers || []).map((register) => text(register.id))
  );
  const completedEntries = (entries || []).filter((entry) =>
    completedRegisterIds.has(text(entry.register_id))
  );
  const classIds = Array.from(
    new Set((registers || []).map((register) => text(register.class_id)))
  );
  const { data: classes, error: classError } = classIds.length
    ? await supabaseAdmin
        .from("classes")
        .select(
          "id, class_name, level_id, teacher_id, is_cambridge, course_type, academic_year_id"
        )
        .in("id", classIds)
    : { data: [], error: null };
  if (classError) throw classError;

  const levelIds = Array.from(
    new Set((classes || []).map((classroom) => Number(classroom.level_id)))
  ).filter(Number.isFinite);
  const teacherIds = Array.from(
    new Set([
      ...(classes || []).map((classroom) => text(classroom.teacher_id)),
      ...(registers || []).map((register) => text(register.completed_by)),
    ])
  ).filter(Boolean);
  const academicYearIds = Array.from(
    new Set((classes || []).map((classroom) => text(classroom.academic_year_id)))
  ).filter(Boolean);
  const [levelsResult, teachersResult, academicYearsResult] = await Promise.all([
    levelIds.length
      ? supabaseAdmin.from("levels").select("id, name").in("id", levelIds)
      : Promise.resolve({ data: [], error: null }),
    teacherIds.length
      ? supabaseAdmin
          .from("profiles")
          .select("id, first_name, last_name")
          .in("id", teacherIds)
      : Promise.resolve({ data: [], error: null }),
    academicYearIds.length
      ? supabaseAdmin
          .from("academic_years")
          .select("id, label")
          .in("id", academicYearIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (levelsResult.error) throw levelsResult.error;
  if (teachersResult.error) throw teachersResult.error;
  if (academicYearsResult.error) throw academicYearsResult.error;

  const levels = new Map(
    (levelsResult.data || []).map((level) => [String(level.id), text(level.name)])
  );
  const teachers = new Map(
    (teachersResult.data || []).map((teacher) => [
      text(teacher.id),
      `${text(teacher.first_name)} ${text(teacher.last_name)}`.trim() ||
        "Teacher",
    ])
  );
  const academicYears = new Map(
    (academicYearsResult.data || []).map((year) => [
      text(year.id),
      text(year.label),
    ])
  );
  const classMap = new Map(
    (classes || []).map((classroom) => [text(classroom.id), classroom])
  );
  const registerMap = new Map(
    (registers || []).map((register) => [text(register.id), register])
  );
  const history = completedEntries
    .map((entry): AdminAttendanceHistoryRow | null => {
      const register = registerMap.get(text(entry.register_id));
      const classroom = register
        ? classMap.get(text(register.class_id))
        : null;
      if (!register || !classroom) return null;
      const levelName = levels.get(String(classroom.level_id)) || "Class";
      return {
        entry_id: text(entry.id),
        register_id: text(register.id),
        class_id: text(classroom.id),
        lesson_date: text(register.lesson_date),
        scheduled_start_time: normalizeScheduledTime(
          register.scheduled_start_time
        ),
        scheduled_end_time: normalizeScheduledTime(register.scheduled_end_time),
        attendance_status: entry.attendance_status as "present" | "absent",
        class_name: classDisplayName(classroom as RawClass, levelName),
        level_name: levelName,
        course_type: normalizeCourseType(classroom.course_type),
        teacher_name:
          teachers.get(text(register.completed_by)) ||
          teachers.get(text(classroom.teacher_id)) ||
          "Teacher",
        academic_year_label:
          academicYears.get(text(classroom.academic_year_id)) || null,
      };
    })
    .filter((row): row is AdminAttendanceHistoryRow => row !== null)
    .sort((left, right) =>
      `${right.lesson_date}|${right.scheduled_start_time}`.localeCompare(
        `${left.lesson_date}|${left.scheduled_start_time}`
      )
    );

  const entriesByClass = new Map<string, any[]>();
  for (const row of history) {
    entriesByClass.set(row.class_id, [
      ...(entriesByClass.get(row.class_id) || []),
      { attendance_status: row.attendance_status },
    ]);
  }
  return {
    history,
    summaries: new Map(
      Array.from(entriesByClass.entries()).map(([classId, rows]) => [
        classId,
        calculateAttendanceSummary(rows),
      ])
    ),
    classRows: classes || [],
    levels,
    academicYears,
  };
}

async function resolveAdminCurrentClass(
  studentType: "profile" | "young_learner",
  studentId: string
) {
  if (studentType === "young_learner") {
    const { data: learner, error } = await supabaseAdmin
      .from("young_learners")
      .select("id, class_id")
      .eq("id", studentId)
      .maybeSingle();
    if (error) throw error;
    if (!learner) throw new ClassRegisterError("Student was not found.", 404);
    return text(learner.class_id) || null;
  }

  const { data: profile, error: profileError } = await supabaseAdmin
    .from("profiles")
    .select("id, role")
    .eq("id", studentId)
    .eq("role", "student")
    .maybeSingle();
  if (profileError) throw profileError;
  if (!profile) throw new ClassRegisterError("Student was not found.", 404);

  const [{ data: enrolments, error: enrolmentError }, currentAcademicYear] =
    await Promise.all([
      supabaseAdmin
        .from("class_enrolments")
        .select("class_id")
        .eq("student_id", studentId),
      getCurrentAcademicYearServer(),
    ]);
  if (enrolmentError) throw enrolmentError;
  const classIds = Array.from(
    new Set((enrolments || []).map((row) => text(row.class_id)).filter(Boolean))
  );
  if (!classIds.length) return null;
  const { data: classes, error: classError } = await supabaseAdmin
    .from("classes")
    .select("id, course_type, academic_year_id, start_date, end_date")
    .in("id", classIds);
  if (classError) throw classError;
  return (
    resolveCurrentStudentClass(
      classes || [],
      currentAcademicYear?.id,
      getMadridDateString()
    ).classroom?.id || null
  );
}

export async function getAdminStudentAttendance(
  studentType: "profile" | "young_learner",
  studentId: string
): Promise<AdminStudentAttendance> {
  if (!UUID_PATTERN.test(studentId)) {
    throw new ClassRegisterError("Student was not found.", 404);
  }
  const [currentClassId, attendance] = await Promise.all([
    resolveAdminCurrentClass(studentType, studentId),
    loadAttendanceHistory(studentType, studentId),
  ]);

  const classRowsById = new Map(
    (attendance.classRows || []).map((classroom: any) => [
      text(classroom.id),
      classroom,
    ])
  );
  const courseClassIds = Array.from(
    new Set([
      ...attendance.history.map((row) => row.class_id),
      ...(currentClassId ? [text(currentClassId)] : []),
    ])
  );
  const missingClassIds = courseClassIds.filter(
    (classId) => !classRowsById.has(classId)
  );
  if (missingClassIds.length) {
    const { data: missingClasses, error } = await supabaseAdmin
      .from("classes")
      .select(
        "id, class_name, level_id, teacher_id, is_cambridge, course_type, academic_year_id"
      )
      .in("id", missingClassIds);
    if (error) throw error;
    for (const classroom of missingClasses || []) {
      classRowsById.set(text(classroom.id), classroom);
    }
  }

  const missingLevelIds = Array.from(
    new Set(
      Array.from(classRowsById.values())
        .map((classroom: any) => Number(classroom.level_id))
        .filter(
          (levelId) =>
            Number.isFinite(levelId) && !attendance.levels.has(String(levelId))
        )
    )
  );
  if (missingLevelIds.length) {
    const { data: levels, error } = await supabaseAdmin
      .from("levels")
      .select("id, name")
      .in("id", missingLevelIds);
    if (error) throw error;
    for (const level of levels || []) {
      attendance.levels.set(String(level.id), text(level.name));
    }
  }

  const missingAcademicYearIds = Array.from(
    new Set(
      Array.from(classRowsById.values())
        .map((classroom: any) => text(classroom.academic_year_id))
        .filter(
          (academicYearId) =>
            Boolean(academicYearId) &&
            !attendance.academicYears.has(academicYearId)
        )
    )
  );
  if (missingAcademicYearIds.length) {
    const { data: academicYears, error } = await supabaseAdmin
      .from("academic_years")
      .select("id, label")
      .in("id", missingAcademicYearIds);
    if (error) throw error;
    for (const academicYear of academicYears || []) {
      attendance.academicYears.set(
        text(academicYear.id),
        text(academicYear.label)
      );
    }
  }

  const courses: AdminAttendanceCourse[] = courseClassIds
    .map((classId) => {
      const classroom: any = classRowsById.get(classId);
      if (!classroom) return null;
      const levelName =
        attendance.levels.get(String(classroom.level_id)) || "Class";
      return {
        class_id: classId,
        label: classDisplayName(classroom as RawClass, levelName),
        academic_year_label:
          attendance.academicYears.get(text(classroom.academic_year_id)) || null,
        summary:
          attendance.summaries.get(classId) || getEmptyClassAttendanceSummary(),
      };
    })
    .filter((course): course is AdminAttendanceCourse => course !== null);

  return {
    current_class_id: currentClassId ? text(currentClassId) : null,
    summary:
      (currentClassId && attendance.summaries.get(text(currentClassId))) ||
      getEmptyClassAttendanceSummary(),
    courses,
    history: attendance.history,
  };
}
