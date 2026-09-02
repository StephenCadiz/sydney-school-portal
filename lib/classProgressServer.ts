import "server-only";

import { NextRequest } from "next/server";

import {
  CLASS_PROGRESS_CAMBRIDGE_COURSE_TYPES,
  isClassProgressEligible,
  normalizeClassProgressCourseType,
  normalizeClassProgressLevel,
} from "./classProgressEligibility";
import {
  authorizeTeacherHomeworkClass,
  TeacherHomeworkError,
} from "./teacherHomeworkServer";
import { supabaseAdmin } from "./supabaseAdmin";
import { getCurrentAcademicYearServer } from "./academicYearsServer";
import { filterClassesForCurrentTeaching } from "./academicYearRules";
import { findSchoolClosure, type SchoolClosureSummary } from "./schoolClosures";
import {
  getSchoolClosureForDate,
  loadSchoolClosures,
  schoolClosedMessage,
} from "./schoolClosuresServer";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];
const WEEKDAY_SHORT: Record<string, string> = {
  sunday: "Sun",
  monday: "Mon",
  tuesday: "Tue",
  wednesday: "Wed",
  thursday: "Thu",
  friday: "Fri",
  saturday: "Sat",
};

export const CLASS_PROGRESS_CHANGED_EVENT = "teacher-class-progress-updated";
export const CLASS_PROGRESS_START_DATE = "2026-08-06";

export class ClassProgressError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

export type ClassProgressContext = {
  actorId: string;
  role: "teacher" | "admin";
  classId: string;
  className: string;
  levelId: number;
  levelName: string;
  isCambridge: boolean;
  courseType: string;
  classDays: string;
  scheduledStartTime: string;
  scheduledEndTime: string;
};

export type ClassProgressInput = {
  pupilsBookPage: number | null;
  activityBookPage: number | null;
  homework: string | null;
  extraActivities: string | null;
};

export type ScheduledLesson = {
  lesson_date: string;
  scheduled_start_time: string;
  scheduled_end_time: string;
  weekday: string;
};

function getMadridParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Madrid",
    weekday: "long",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const values = new Map(parts.map((part) => [part.type, part.value]));

  return {
    weekday: values.get("weekday") || "",
    year: Number(values.get("year")),
    month: Number(values.get("month")),
    day: Number(values.get("day")),
    hour: Number(values.get("hour")),
    minute: Number(values.get("minute")),
  };
}

export function getMadridDateString(date = new Date()) {
  const parts = getMadridParts(date);
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(
    parts.day
  ).padStart(2, "0")}`;
}

export function getMadridMinutes(date = new Date()) {
  const parts = getMadridParts(date);
  return parts.hour * 60 + parts.minute;
}

function dateFromString(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, 12));
  return Number.isNaN(date.getTime()) ||
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
    ? null
    : date;
}

export function addMadridCalendarDays(value: string, days: number) {
  const date = dateFromString(value);
  if (!date) return value;
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function madridWeekdayForDate(value: string) {
  const date = dateFromString(value);
  return date ? WEEKDAYS[date.getUTCDay()] : "";
}

export function normalizeScheduledTime(value: unknown) {
  const match = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(
    String(value || "").trim()
  );
  if (!match) return "";
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  const second = Number(match[3] || 0);
  if (hour > 23 || minute > 59 || second > 59) return "";
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(
    2,
    "0"
  )}:${String(second).padStart(2, "0")}`;
}

export function displayScheduledTime(value: unknown) {
  const normalized = normalizeScheduledTime(value);
  return normalized ? normalized.slice(0, 5) : "";
}

export function scheduledTimeToMinutes(value: unknown) {
  const normalized = normalizeScheduledTime(value);
  if (!normalized) return null;
  const [hour, minute] = normalized.split(":").map(Number);
  return hour * 60 + minute;
}

export function isScheduledOnClassDays(value: unknown, weekday: string) {
  const days = String(value || "");
  const fullMatch = new RegExp(`\\b${weekday}\\b`, "i").test(days);
  const abbreviation = WEEKDAY_SHORT[weekday.toLowerCase()];
  return (
    fullMatch ||
    (abbreviation ? new RegExp(`\\b${abbreviation}\\b`, "i").test(days) : false)
  );
}

export function getRecentScheduledLessons(
  classDays: string,
  scheduledStartTime: string,
  scheduledEndTime: string,
  daysBack = 42,
  date = new Date(),
  closures: readonly SchoolClosureSummary[] = []
) {
  const today = getMadridDateString(date);
  const start = normalizeScheduledTime(scheduledStartTime);
  const end = normalizeScheduledTime(scheduledEndTime);
  if (
    today < CLASS_PROGRESS_START_DATE ||
    !start ||
    !end ||
    start === end
  ) {
    return [] as ScheduledLesson[];
  }

  const lessons: ScheduledLesson[] = [];
  for (let offset = 0; offset <= daysBack; offset += 1) {
    const lessonDate = addMadridCalendarDays(today, -offset);
    if (lessonDate < CLASS_PROGRESS_START_DATE) break;
    const weekday = madridWeekdayForDate(lessonDate);
    if (!isScheduledOnClassDays(classDays, weekday)) continue;
    if (findSchoolClosure(lessonDate, closures)) continue;
    lessons.push({
      lesson_date: lessonDate,
      scheduled_start_time: start,
      scheduled_end_time: end,
      weekday,
    });
  }
  return lessons;
}

export async function getClassProgressContext(
  request: NextRequest,
  requestedClassId: string
): Promise<ClassProgressContext> {
  if (!UUID_PATTERN.test(requestedClassId)) {
    throw new ClassProgressError("Class Progress is not available for this class.", 404);
  }

  let access;
  try {
    access = await authorizeTeacherHomeworkClass(request, requestedClassId);
  } catch (error) {
    if (error instanceof TeacherHomeworkError) {
      throw new ClassProgressError(error.message, error.status);
    }
    throw error;
  }

  const { data: classroom, error: classError } = await supabaseAdmin
    .from("classes")
    .select("id, class_name, level_id, is_cambridge, course_type, days, start_time, end_time")
    .eq("id", access.classId)
    .maybeSingle();
  if (classError) throw classError;
  if (!classroom) throw new ClassProgressError("Class was not found.", 404);

  const { data: level, error: levelError } = await supabaseAdmin
    .from("levels")
    .select("id, name")
    .eq("id", classroom.level_id)
    .maybeSingle();
  if (levelError || !level) {
    throw new ClassProgressError("Unable to verify the class level.", 500);
  }

  const levelName = String(level.name || "").trim();
  const courseType = normalizeClassProgressCourseType(classroom.course_type);
  const isCambridge = classroom.is_cambridge === true;
  if (
    !isClassProgressEligible({
      isCambridge,
      levelName,
      courseType,
    })
  ) {
    throw new ClassProgressError("Class Progress is not available for this class.", 404);
  }

  const scheduledStartTime = normalizeScheduledTime(classroom.start_time);
  const scheduledEndTime = normalizeScheduledTime(classroom.end_time);
  if (!scheduledStartTime || !scheduledEndTime || scheduledStartTime === scheduledEndTime) {
    throw new ClassProgressError(
      "Class Progress requires a valid class start and end time.",
      422
    );
  }

  return {
    actorId: access.actorId,
    role: access.role,
    classId: access.classId,
    className: String(classroom.class_name || "").trim() || levelName || "Class",
    levelId: Number(level.id),
    levelName,
    isCambridge,
    courseType,
    classDays: String(classroom.days || ""),
    scheduledStartTime,
    scheduledEndTime,
  };
}

function optionalPage(value: unknown, label: string) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    throw new ClassProgressError(`${label} must be a positive whole number.`, 422);
  }
  return value;
}

function optionalText(value: unknown, label: string) {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") {
    throw new ClassProgressError(`${label} must be text.`, 422);
  }
  const trimmed = value.trim();
  if (trimmed.length > 4000) {
    throw new ClassProgressError(`${label} is too long.`, 422);
  }
  return trimmed || null;
}

export function parseClassProgressInput(
  body: unknown,
  isYoungLearner: boolean,
  options: { allowSchedule?: boolean } = {}
): ClassProgressInput &
  Partial<Pick<ScheduledLesson, "lesson_date" | "scheduled_start_time" | "scheduled_end_time">> {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new ClassProgressError("Invalid Class Progress entry.", 400);
  }
  const record = body as Record<string, unknown>;
  const allowed = new Set([
    "lesson_date",
    "scheduled_start_time",
    "scheduled_end_time",
    "pupils_book_page",
    "activity_book_page",
    "homework",
    "extra_activities",
  ]);
  if (Object.keys(record).some((key) => !allowed.has(key))) {
    throw new ClassProgressError("The request contains unsupported fields.", 400);
  }

  const pupilsBookPage = optionalPage(record.pupils_book_page, "Pupil’s Book page");
  const activityBookPage = optionalPage(
    record.activity_book_page,
    "Activity Book page"
  );
  if (!isYoungLearner && activityBookPage !== null) {
    throw new ClassProgressError(
      "Activity Book pages are only available for Young Learner classes.",
      422
    );
  }
  const homework = optionalText(record.homework, "Homework");
  const extraActivities = optionalText(record.extra_activities, "Extra activities");
  if (
    pupilsBookPage === null &&
    activityBookPage === null &&
    homework === null &&
    extraActivities === null
  ) {
    throw new ClassProgressError(
      "Add at least one completed page, homework item, or extra activity.",
      422
    );
  }

  const entry: ClassProgressInput & Partial<ScheduledLesson> = {
    pupilsBookPage,
    activityBookPage,
    homework,
    extraActivities,
  };
  if (options.allowSchedule) {
    const lessonDate = String(record.lesson_date || "").trim();
    const start = normalizeScheduledTime(record.scheduled_start_time);
    const end = normalizeScheduledTime(record.scheduled_end_time);
    if (!dateFromString(lessonDate) || !start || !end || start === end) {
      throw new ClassProgressError("Choose a valid scheduled lesson.", 422);
    }
    entry.lesson_date = lessonDate;
    entry.scheduled_start_time = start;
    entry.scheduled_end_time = end;
  }
  return entry;
}

export async function verifyScheduledLesson(
  context: ClassProgressContext,
  lessonDate: string,
  scheduledStartTime: string,
  scheduledEndTime: string,
  now = new Date()
) {
  const weekday = madridWeekdayForDate(lessonDate);
  if (
    !weekday ||
    lessonDate < CLASS_PROGRESS_START_DATE ||
    lessonDate > getMadridDateString(now) ||
    !isScheduledOnClassDays(context.classDays, weekday) ||
    normalizeScheduledTime(scheduledStartTime) !== context.scheduledStartTime ||
    normalizeScheduledTime(scheduledEndTime) !== context.scheduledEndTime
  ) {
    if (lessonDate < CLASS_PROGRESS_START_DATE) {
      throw new ClassProgressError(
        "Class Progress is only available for lessons from 6 August 2026 onwards.",
        422
      );
    }
    throw new ClassProgressError("This is not a scheduled lesson for the selected class.", 422);
  }

  const closure = await getSchoolClosureForDate(lessonDate);
  if (closure) {
    throw new ClassProgressError(schoolClosedMessage(lessonDate, closure), 409);
  }
}

function getTeacherName(profile: any) {
  return (
    `${profile?.first_name || ""} ${profile?.last_name || ""}`.trim() ||
    "Teacher"
  );
}

export async function loadClassProgressSnapshot(context: ClassProgressContext) {
  const scheduledCandidates = getRecentScheduledLessons(
    context.classDays,
    context.scheduledStartTime,
    context.scheduledEndTime
  );
  const candidateDates = scheduledCandidates.map((lesson) => lesson.lesson_date);
  const closures = candidateDates.length
    ? await loadSchoolClosures({
        startDate: candidateDates[candidateDates.length - 1],
        endDate: candidateDates[0],
      })
    : [];
  const recentLessons = scheduledCandidates.filter(
    (lesson) => !findSchoolClosure(lesson.lesson_date, closures)
  );
  const recentDates = recentLessons.map((lesson) => lesson.lesson_date);
  const entryResult = recentDates.length
    ? await supabaseAdmin
        .from("class_progress_entries")
        .select(
          "id, class_id, teacher_id, last_edited_by, lesson_date, scheduled_start_time, scheduled_end_time, pupils_book_page, activity_book_page, homework, extra_activities, completed_at, created_at, updated_at"
        )
        .eq("class_id", context.classId)
        .in("lesson_date", recentDates)
        .order("lesson_date", { ascending: false })
        .order("scheduled_start_time", { ascending: false })
    : { data: [], error: null };
  if (entryResult.error) throw entryResult.error;

  const entries = entryResult.data || [];
  const teacherIds = Array.from(
    new Set(
      entries
        .flatMap((entry) => [entry.teacher_id, entry.last_edited_by])
        .filter(Boolean)
        .map(String)
    )
  );
  const profileResult = teacherIds.length
    ? await supabaseAdmin
        .from("profiles")
        .select("id, first_name, last_name")
        .in("id", teacherIds)
    : { data: [], error: null };
  if (profileResult.error) throw profileResult.error;
  const teacherNames = new Map(
    (profileResult.data || []).map((profile) => [String(profile.id), getTeacherName(profile)])
  );
  const entriesByKey = new Map(
    entries.map((entry) => [
      `${entry.lesson_date}|${normalizeScheduledTime(entry.scheduled_start_time)}`,
      {
        ...entry,
        scheduled_start_time: normalizeScheduledTime(entry.scheduled_start_time),
        scheduled_end_time: normalizeScheduledTime(entry.scheduled_end_time),
        activity_book_page: context.isCambridge
          ? null
          : entry.activity_book_page,
        completing_teacher_name: teacherNames.get(String(entry.teacher_id)) || "Teacher",
        last_edited_by_name: entry.last_edited_by
          ? teacherNames.get(String(entry.last_edited_by)) || "Teacher"
          : null,
      },
    ])
  );
  const lessons = recentLessons.map((lesson) => ({
    ...lesson,
    entry:
      entriesByKey.get(`${lesson.lesson_date}|${lesson.scheduled_start_time}`) ||
      null,
  }));

  return {
    class: {
      id: context.classId,
      name: context.className,
      level: context.levelName,
      level_id: context.levelId,
      is_cambridge: context.isCambridge,
      course_type: context.courseType,
      is_young_learner: !context.isCambridge,
      days: context.classDays,
      scheduled_start_time: context.scheduledStartTime,
      scheduled_end_time: context.scheduledEndTime,
    },
    latest_lesson: lessons[0] || null,
    recent_lessons: lessons,
  };
}

export async function loadSameLevelProgress(context: ClassProgressContext) {
  let classesQuery = supabaseAdmin
    .from("classes")
    .select("id, class_name, teacher_id, level_id, is_cambridge, course_type, academic_year_id, start_date, end_date")
    .eq("level_id", context.levelId)
    .eq("is_cambridge", context.isCambridge);
  if (context.isCambridge) {
    classesQuery = classesQuery.in(
      "course_type",
      Array.from(CLASS_PROGRESS_CAMBRIDGE_COURSE_TYPES)
    );
  }
  const { data: classes, error: classesError } = await classesQuery;
  if (classesError) throw classesError;
  const currentAcademicYear = await getCurrentAcademicYearServer();
  const classRows = filterClassesForCurrentTeaching(
    classes || [],
    currentAcademicYear?.id
  ).filter((classroom) =>
    isClassProgressEligible({
      isCambridge: classroom.is_cambridge === true,
      levelName: context.levelName,
      courseType: classroom.course_type,
    })
  );
  const classIds = classRows.map((classroom) => String(classroom.id));
  const teacherIds = Array.from(
    new Set(classRows.map((classroom) => String(classroom.teacher_id || "")).filter(Boolean))
  );
  const [profileResult, entriesResult] = await Promise.all([
    teacherIds.length
      ? supabaseAdmin
          .from("profiles")
          .select("id, first_name, last_name")
          .in("id", teacherIds)
      : Promise.resolve({ data: [], error: null }),
    classIds.length
      ? supabaseAdmin
          .from("class_progress_entries")
          .select(
            "class_id, lesson_date, pupils_book_page, activity_book_page, completed_at"
          )
          .in("class_id", classIds)
          .order("completed_at", { ascending: false })
          .limit(1000)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (profileResult.error) throw profileResult.error;
  if (entriesResult.error) throw entriesResult.error;

  const names = new Map(
    (profileResult.data || []).map((profile) => [String(profile.id), getTeacherName(profile)])
  );
  const sameLevelEntries = entriesResult.data || [];
  const sameLevelDates = sameLevelEntries
    .map((entry) => String(entry.lesson_date || ""))
    .filter(Boolean)
    .sort();
  const sameLevelClosures = sameLevelDates.length
    ? await loadSchoolClosures({
        startDate: sameLevelDates[0],
        endDate: sameLevelDates[sameLevelDates.length - 1],
      })
    : [];
  const entriesByClass = new Map<string, any[]>();
  for (const entry of sameLevelEntries) {
    if (findSchoolClosure(String(entry.lesson_date), sameLevelClosures)) continue;
    const id = String(entry.class_id);
    entriesByClass.set(id, [...(entriesByClass.get(id) || []), entry]);
  }
  const today = getMadridDateString();
  return classRows
    .map((classroom) => {
      const entries = entriesByClass.get(String(classroom.id)) || [];
      const latest = entries[0] || null;
      const latestPupilsBook = entries.find(
        (entry) => entry.pupils_book_page !== null
      );
      const latestActivityBook = entries.find(
        (entry) => entry.activity_book_page !== null
      );
      const lastLessonDate = latest?.lesson_date || null;
      const daysSinceLastUpdate = lastLessonDate
        ? Math.max(
            0,
            Math.round(
              (Date.parse(`${today}T12:00:00Z`) -
                Date.parse(`${lastLessonDate}T12:00:00Z`)) /
                86_400_000
            )
          )
        : null;
      return {
        class_id: String(classroom.id),
        class_name:
          String(classroom.class_name || "").trim() || context.levelName,
        teacher_name: names.get(String(classroom.teacher_id)) || "Teacher",
        course_type: normalizeClassProgressCourseType(classroom.course_type),
        latest_lesson_date: lastLessonDate,
        latest_pupils_book_page: latestPupilsBook?.pupils_book_page ?? null,
        latest_activity_book_page: context.isCambridge
          ? null
          : latestActivityBook?.activity_book_page ?? null,
        days_since_last_update: daysSinceLastUpdate,
        is_current_class: String(classroom.id) === context.classId,
      };
    })
    .sort((left, right) => {
      if (left.is_current_class !== right.is_current_class) {
        return left.is_current_class ? -1 : 1;
      }
      return left.class_name.localeCompare(right.class_name);
    });
}

export function getBearerToken(request: NextRequest) {
  const authorization = request.headers.get("authorization") || "";
  return authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
}

export async function getTeacherProgressActor(request: NextRequest) {
  const token = getBearerToken(request);
  if (!token) throw new ClassProgressError("Authentication required.", 401);
  const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(token);
  if (authError || !authData.user) {
    throw new ClassProgressError("Authentication required.", 401);
  }
  const { data: profile, error: profileError } = await supabaseAdmin
    .from("profiles")
    .select("id, role")
    .eq("id", authData.user.id)
    .maybeSingle();
  if (profileError) throw profileError;
  if (String(profile?.role || "").trim().toLowerCase() !== "teacher") {
    throw new ClassProgressError("Teacher access required.", 403);
  }
  return { actorId: authData.user.id };
}

export async function loadClassProgressReminders(request: NextRequest) {
  const { actorId } = await getTeacherProgressActor(request);
  const { data: assignedClasses, error: classError } = await supabaseAdmin
    .from("classes")
    .select("id, class_name, level_id, is_cambridge, course_type, days, start_time, end_time, academic_year_id, start_date, end_date")
    .eq("teacher_id", actorId);
  if (classError) throw classError;
  const currentAcademicYear = await getCurrentAcademicYearServer();
  const classRows = filterClassesForCurrentTeaching(
    assignedClasses || [],
    currentAcademicYear?.id
  );
  const levelIds = Array.from(
    new Set(classRows.map((classroom) => Number(classroom.level_id)).filter(Boolean))
  );
  const levelResult = levelIds.length
    ? await supabaseAdmin.from("levels").select("id, name").in("id", levelIds)
    : { data: [], error: null };
  if (levelResult.error) throw levelResult.error;
  const levelNames = new Map(
    (levelResult.data || []).map((level) => [Number(level.id), String(level.name || "")])
  );
  const eligibleClasses = classRows
    .map((classroom) => ({
      ...classroom,
      levelName: levelNames.get(Number(classroom.level_id)) || "",
      start: normalizeScheduledTime(classroom.start_time),
      end: normalizeScheduledTime(classroom.end_time),
    }))
    .filter(
      (classroom) =>
        classroom.start &&
        classroom.end &&
        classroom.start !== classroom.end &&
        isClassProgressEligible({
          isCambridge: classroom.is_cambridge === true,
          levelName: classroom.levelName,
          courseType: classroom.course_type,
        })
    );
  if (!eligibleClasses.length) return { reminders: [] };

  const now = new Date();
  const today = getMadridDateString(now);
  const currentMinutes = getMadridMinutes(now);
  const daysSinceLaunch = Math.max(
    0,
    Math.round(
      (Date.parse(`${today}T12:00:00Z`) -
        Date.parse(`${CLASS_PROGRESS_START_DATE}T12:00:00Z`)) /
        86_400_000
    )
  );
  const reminderHistoryDays = Math.min(42, daysSinceLaunch);
  const earliestDate = addMadridCalendarDays(today, -reminderHistoryDays);
  const closures = await loadSchoolClosures({
    startDate: earliestDate,
    endDate: today,
  });
  const candidateLessons = eligibleClasses.flatMap((classroom) =>
    getRecentScheduledLessons(
      String(classroom.days || ""),
      classroom.start,
      classroom.end,
      reminderHistoryDays,
      now,
      closures
    ).map((lesson) => ({ classroom, lesson }))
  );
  const { data: entries, error: entryError } = await supabaseAdmin
    .from("class_progress_entries")
    .select("class_id, lesson_date, scheduled_start_time")
    .in(
      "class_id",
      eligibleClasses.map((classroom) => String(classroom.id))
    )
    .gte("lesson_date", earliestDate);
  if (entryError) throw entryError;
  const completed = new Set(
    (entries || []).map(
      (entry) =>
        `${entry.class_id}|${entry.lesson_date}|${normalizeScheduledTime(
          entry.scheduled_start_time
        )}`
    )
  );
  const reminders = candidateLessons
    .filter(({ classroom, lesson }) => {
      const key = `${classroom.id}|${lesson.lesson_date}|${lesson.scheduled_start_time}`;
      if (completed.has(key)) return false;
      if (lesson.lesson_date < today) return true;
      return (
        lesson.lesson_date === today &&
        currentMinutes >= (scheduledTimeToMinutes(lesson.scheduled_end_time) || 0) - 7
      );
    })
    .map(({ classroom, lesson }) => {
      const lessonEnd = scheduledTimeToMinutes(lesson.scheduled_end_time) || 0;
      const isCurrentFinishing =
        lesson.lesson_date === today &&
        currentMinutes >= lessonEnd - 7 &&
        currentMinutes <= lessonEnd;
      return {
        class_id: String(classroom.id),
        class_name:
          String(classroom.class_name || "").trim() || classroom.levelName,
        level: classroom.levelName,
        course_type: normalizeClassProgressCourseType(classroom.course_type),
        lesson_date: lesson.lesson_date,
        scheduled_start_time: lesson.scheduled_start_time,
        scheduled_end_time: lesson.scheduled_end_time,
        is_overdue: lesson.lesson_date < today || currentMinutes > lessonEnd,
        is_current_finishing: isCurrentFinishing,
      };
    })
    .sort((left, right) => {
      if (left.is_current_finishing !== right.is_current_finishing) {
        return left.is_current_finishing ? -1 : 1;
      }
      if (left.is_overdue !== right.is_overdue) return left.is_overdue ? -1 : 1;
      return `${right.lesson_date}|${right.scheduled_start_time}`.localeCompare(
        `${left.lesson_date}|${left.scheduled_start_time}`
      );
    });

  return { reminders };
}

export { UUID_PATTERN };
