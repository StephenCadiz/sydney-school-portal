import "server-only";

import {
  normalizeCoursePlanningCourseType,
  normalizeCoursePlanningLevel,
  COURSE_PLANNING_CAMBRIDGE_LEVELS,
  COURSE_PLANNING_COURSE_TYPES,
} from "./coursePlanningEligibility";
import { validateCoursePlanningDateRange } from "./coursePlanningDates";
import { classUsesAcademicYear } from "./academicYearRules";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const COURSE_TYPES = new Set(["regular", "intensive", "express", "online"]);

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function validTime(value: unknown) {
  const match = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(text(value));
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

function timeToSeconds(value: string) {
  const [hours, minutes, seconds] = value.split(":").map(Number);
  return hours * 3600 + minutes * 60 + seconds;
}

function validMeetUrl(value: string) {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      url.hostname === "meet.google.com" &&
      url.pathname.replace(/\//g, "").length > 0
    );
  } catch {
    return false;
  }
}

export type AdminClassPayload = {
  class_name: string;
  level_id: number;
  teacher_id: string;
  classroom_id: string | null;
  course_type: "regular" | "intensive" | "express" | "online";
  days: string;
  start_time: string;
  end_time: string;
  meet_link: string | null;
  is_cambridge: boolean;
  start_date: string | null;
  end_date: string | null;
  academic_year_id: string | null;
};

export function isValidClassId(value: unknown) {
  return UUID_PATTERN.test(String(value || ""));
}

export function validateAdminClassPayload(
  input: unknown,
  levelRow: { name: unknown; catagory?: unknown } | null,
  academicYearRow: { id: unknown } | null = null
): { value: AdminClassPayload | null; error: string | null } {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { value: null, error: "Invalid class details." };
  }

  const body = input as Record<string, unknown>;
  const allowed = new Set([
    "class_name",
    "level_id",
    "teacher_id",
    "classroom_id",
    "course_type",
    "days",
    "start_time",
    "end_time",
    "meet_link",
    "is_cambridge",
    "start_date",
    "end_date",
    "academic_year_id",
  ]);
  if (Object.keys(body).some((key) => !allowed.has(key))) {
    return { value: null, error: "The request contains unsupported class fields." };
  }

  const levelId = Number(body.level_id);
  const teacherId = text(body.teacher_id);
  const classroomId = text(body.classroom_id);
  const courseType = normalizeCoursePlanningCourseType(body.course_type);
  const days = text(body.days);
  const startTime = validTime(body.start_time);
  const endTime = validTime(body.end_time);
  const meetLink = text(body.meet_link);
  const academicYearId = text(body.academic_year_id);

  if (!Number.isInteger(levelId) || levelId <= 0 || !levelRow) {
    return { value: null, error: "Choose a valid level." };
  }
  if (!isValidClassId(teacherId)) {
    return { value: null, error: "Choose a valid teacher." };
  }
  if (!COURSE_TYPES.has(courseType)) {
    return { value: null, error: "Choose a valid course type." };
  }
  if (!days) return { value: null, error: "Select at least one class day." };
  if (!startTime || !endTime || timeToSeconds(endTime) <= timeToSeconds(startTime)) {
    return { value: null, error: "End time must be later than start time." };
  }

  const levelName = normalizeCoursePlanningLevel(levelRow.name);
  const isSupport =
    String(levelRow.catagory || "").trim().toLowerCase() === "support" ||
    levelName === "SUPPORT CLASSES";
  const forcedCambridge = COURSE_PLANNING_CAMBRIDGE_LEVELS.has(levelName);
  const isCambridge = isSupport ? false : forcedCambridge || body.is_cambridge === true;
  const normalizedCourseType = isSupport || !isCambridge ? "regular" : courseType;
  const isOnline = normalizedCourseType === "online";
  const usesAcademicYear = classUsesAcademicYear(normalizedCourseType);

  if (
    usesAcademicYear &&
    (!UUID_PATTERN.test(academicYearId) ||
      !academicYearRow ||
      String(academicYearRow.id) !== academicYearId)
  ) {
    return { value: null, error: "Choose a valid academic year." };
  }

  if (isOnline) {
    if (!validMeetUrl(meetLink)) {
      return { value: null, error: "Enter a valid Google Meet link." };
    }
  } else if (!isValidClassId(classroomId)) {
    return { value: null, error: "Choose a classroom for an in-person class." };
  }

  const dateRange = validateCoursePlanningDateRange({
    startDate: usesAcademicYear ? null : body.start_date,
    endDate: usesAcademicYear ? null : body.end_date,
    required:
      isCambridge && COURSE_PLANNING_COURSE_TYPES.has(normalizedCourseType),
  });
  if (dateRange.error) return { value: null, error: dateRange.error };

  return {
    value: {
      class_name: text(body.class_name) || String(levelRow.name || "").trim(),
      level_id: levelId,
      teacher_id: teacherId,
      classroom_id: isOnline ? null : classroomId,
      course_type: normalizedCourseType as AdminClassPayload["course_type"],
      days,
      start_time: startTime,
      end_time: endTime,
      meet_link: isOnline ? meetLink : null,
      is_cambridge: isCambridge,
      start_date: usesAcademicYear ? null : dateRange.startDate,
      end_date: usesAcademicYear ? null : dateRange.endDate,
      academic_year_id: usesAcademicYear ? academicYearId : null,
    },
    error: null,
  };
}
