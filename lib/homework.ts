import { supabase } from "./supabase";

function formatSupabaseHomeworkError(action: string, error: any) {
  return [
    `Homework ${action} failed: ${error?.message || "Unknown Supabase error"}`,
    error?.details ? `Details: ${error.details}` : null,
    error?.hint ? `Hint: ${error.hint}` : null,
    error?.code ? `Code: ${error.code}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

export function getExamNumberFromWeek(weekNumber: number | string) {
  const week = Number(weekNumber);

  if (!Number.isFinite(week) || week < 1) {
    return null;
  }

  return Math.floor((week - 1) / 3) + 1;
}

export function getHomeworkSkillFromWeek(weekNumber: number | string) {
  const week = Number(weekNumber);

  if (!Number.isFinite(week) || week < 1) {
    return null;
  }

  const position = (week - 1) % 3;

  if (position === 0) return "reading";
  if (position === 1) return "listening";

  return "writing";
}

export function normalizeCambridgeLevel(level: unknown) {
  return String(level ?? "").trim().toUpperCase();
}

export function normalizeHomeworkSkill(skill: unknown) {
  const normalisedSkill = String(skill ?? "")
    .trim()
    .toLowerCase()
    .replace(/[_&/-]+/g, " ")
    .replace(/\s+/g, " ");

  if (!normalisedSkill) return "";
  if (normalisedSkill.includes("listening")) return "listening";
  if (normalisedSkill.includes("writing")) return "writing";
  if (normalisedSkill.includes("speaking")) return "speaking";
  if (normalisedSkill.includes("reading")) return "reading";

  return normalisedSkill;
}

export function getCambridgeReadingSkillLabel(level: unknown) {
  return normalizeCambridgeLevel(level) === "B1"
    ? "Reading"
    : "Reading and Use of English";
}

export function getHomeworkSkillLabel(
  level: string,
  skill: string | null | undefined
) {
  const normalisedSkill = normalizeHomeworkSkill(skill);

  if (normalisedSkill === "reading") {
    return getCambridgeReadingSkillLabel(level);
  }

  if (normalisedSkill === "listening") {
    return "Listening";
  }

  if (normalisedSkill === "writing") {
    return "Writing";
  }

  if (normalisedSkill === "speaking") {
    return "Speaking";
  }

  return "";
}

export function getGeneratedHomeworkTitle(
  level: string,
  weekNumber: number | string
) {
  const week = Number(weekNumber);
  const skill = getHomeworkSkillFromWeek(week);
  const skillLabel = getHomeworkSkillLabel(level, skill);

  if (!Number.isFinite(week) || week < 1 || !skillLabel) {
    return "";
  }

  return `${skillLabel} Week ${week}`;
}

function shouldMoveHomeworkDates(classDays: string | null | undefined) {
  if (!classDays) {
    return false;
  }

  const normalisedDays = classDays.toLowerCase().replace(/[,/&]+/g, " ");

  return (
    normalisedDays.includes("tuesday") &&
    normalisedDays.includes("thursday")
  );
}

export function getMadridDateString(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Madrid",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const values = Object.fromEntries(
    parts.map((part) => [part.type, part.value])
  );

  return `${values.year}-${values.month}-${values.day}`;
}

function addDaysToDateOnly(dateValue: string | null | undefined, days: number) {
  if (!dateValue) {
    return dateValue;
  }

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateValue);

  if (!match) {
    return dateValue;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));

  date.setUTCDate(date.getUTCDate() + days);

  const adjustedYear = date.getUTCFullYear();
  const adjustedMonth = String(date.getUTCMonth() + 1).padStart(2, "0");
  const adjustedDay = String(date.getUTCDate()).padStart(2, "0");

  return `${adjustedYear}-${adjustedMonth}-${adjustedDay}`;
}

export function adjustHomeworkDatesForClassDays(
  homeworkItems: any[],
  classDays: string | null | undefined
) {
  const daysToAdd = shouldMoveHomeworkDates(classDays) ? 1 : 0;

  return homeworkItems.map((item) => ({
    ...item,
    release_date:
      daysToAdd > 0
        ? addDaysToDateOnly(item.release_date, daysToAdd)
        : item.release_date,
    due_date:
      daysToAdd > 0
        ? addDaysToDateOnly(item.due_date, daysToAdd)
        : item.due_date,
  }));
}

export function getHomeworkTimingStatus(
  homework: { due_date?: string | null },
  todayMadrid = getMadridDateString(),
  hasMatchingResult = false
) {
  if (hasMatchingResult) {
    return "Complete";
  }

  if (!homework.due_date || homework.due_date >= todayMadrid) {
    return "Current";
  }

  return "Past";
}

function getDateSortValue(dateValue: string | null | undefined) {
  return dateValue || "9999-12-31";
}

function getSkillSortValue(skill: unknown) {
  const normalisedSkill = normalizeHomeworkSkill(skill);

  if (normalisedSkill === "reading") return 1;
  if (normalisedSkill === "listening") return 2;
  if (normalisedSkill === "writing") return 3;

  return 99;
}

function compareHomeworkTieBreakers(a: any, b: any) {
  const skillDifference =
    getSkillSortValue(a.homework_skill) - getSkillSortValue(b.homework_skill);

  if (skillDifference !== 0) return skillDifference;

  const weekDifference = Number(a.week_number || 0) - Number(b.week_number || 0);

  if (weekDifference !== 0) return weekDifference;

  const orderDifference =
    Number(a.homework_order || 0) - Number(b.homework_order || 0);

  if (orderDifference !== 0) return orderDifference;

  const titleDifference = String(a.title || "").localeCompare(
    String(b.title || "")
  );

  if (titleDifference !== 0) return titleDifference;

  return String(a.id || "").localeCompare(String(b.id || ""));
}

export function sortReleasedHomework(
  homeworkItems: any[],
  todayMadrid = getMadridDateString()
) {
  return [...homeworkItems].sort((a, b) => {
    const aStatus = getHomeworkTimingStatus(a, todayMadrid);
    const bStatus = getHomeworkTimingStatus(b, todayMadrid);

    if (aStatus !== bStatus) {
      return aStatus === "Current" ? -1 : 1;
    }

    const aDueDate = getDateSortValue(a.due_date);
    const bDueDate = getDateSortValue(b.due_date);

    if (aDueDate !== bDueDate) {
      return aStatus === "Current"
        ? aDueDate.localeCompare(bDueDate)
        : bDueDate.localeCompare(aDueDate);
    }

    return compareHomeworkTieBreakers(a, b);
  });
}

export async function getHomework(
  level: string,
  courseType: string
) {
  const normalisedLevel = String(level || "").trim().toUpperCase();
  const normalisedCourseType = String(courseType || "").trim().toLowerCase();

  if (!normalisedLevel || !normalisedCourseType) {
    return [];
  }

  const { data, error } = await supabase
    .from("cambridge_homework")
    .select("*")
    .eq("level", normalisedLevel)
    .eq("course_type", normalisedCourseType)
    .order("week_number")
    .order("homework_order");

  if (error) throw error;

  return data || [];
}

export async function getReleasedStudentHomework(
  level: string,
  courseType: string,
  classDays: string | null | undefined
) {
  const normalisedLevel = String(level || "").trim().toUpperCase();
  const normalisedCourseType = String(courseType || "").trim().toLowerCase();
  const todayMadrid = getMadridDateString();

  if (!normalisedLevel || !normalisedCourseType) {
    return [];
  }

  const { data, error } = await supabase
    .from("cambridge_homework")
    .select("*")
    .eq("level", normalisedLevel)
    .eq("course_type", normalisedCourseType)
    .eq("active", true)
    .lte("release_date", todayMadrid)
    .order("week_number")
    .order("homework_order");

  if (error) throw error;

  const adjustedHomework = adjustHomeworkDatesForClassDays(
    data || [],
    classDays
  ).filter((item) => item.release_date && item.release_date <= todayMadrid);

  return sortReleasedHomework(adjustedHomework, todayMadrid);
}

function isMissingHomeworkTimestampColumn(error: any) {
  const errorText = [
    error?.message,
    error?.details,
    error?.hint,
    error?.code,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return errorText.includes("created_at") || errorText.includes("updated_at");
}

export async function getHomeworkReleaseMetadata(
  level: string,
  courseType: string,
  classDays: string | null | undefined
) {
  const normalisedLevel = String(level || "").trim().toUpperCase();
  const normalisedCourseType = String(courseType || "").trim().toLowerCase();

  if (!normalisedLevel || !normalisedCourseType) {
    return [];
  }

  const metadataColumns =
    "id, week_number, homework_skill, release_date, active, level, course_type, homework_order, created_at, updated_at";
  const fallbackMetadataColumns =
    "id, week_number, homework_skill, release_date, active, level, course_type, homework_order";

  const metadataResult = await supabase
    .from("cambridge_homework")
    .select(metadataColumns)
    .eq("level", normalisedLevel)
    .eq("course_type", normalisedCourseType)
    .order("week_number")
    .order("homework_order");
  let data: any[] | null = metadataResult.data;
  let error: any = metadataResult.error;

  if (error && isMissingHomeworkTimestampColumn(error)) {
    const fallbackResult = await supabase
      .from("cambridge_homework")
      .select(fallbackMetadataColumns)
      .eq("level", normalisedLevel)
      .eq("course_type", normalisedCourseType)
      .order("week_number")
      .order("homework_order");

    data = fallbackResult.data;
    error = fallbackResult.error;
  }

  if (error) throw error;

  return adjustHomeworkDatesForClassDays(data || [], classDays);
}

export async function createHomework(homework: any) {
  const { error } = await supabase
    .from("cambridge_homework")
    .insert([homework]);

  if (error) {
    throw new Error(formatSupabaseHomeworkError("save", error));
  }
}

export async function updateHomework(
  id: string,
  homework: any
) {
  const { error } = await supabase
    .from("cambridge_homework")
    .update(homework)
    .eq("id", id);

  if (error) {
    throw new Error(formatSupabaseHomeworkError("update", error));
  }
}

export async function deleteHomework(id: string) {
  const { error } = await supabase
    .from("cambridge_homework")
    .delete()
    .eq("id", id);

  if (error) throw error;
}

export async function getAllHomework() {
  const { data, error } = await supabase
    .from("cambridge_homework")
    .select("*")
    .order("level")
    .order("course_type")
    .order("week_number")
    .order("homework_order");

  if (error) throw error;

  return data || [];
}
