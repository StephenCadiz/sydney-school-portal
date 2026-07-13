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

export function getCambridgeReadingSkillLabel(level: unknown) {
  return normalizeCambridgeLevel(level) === "B1"
    ? "Reading"
    : "Reading and Use of English";
}

export function getHomeworkSkillLabel(
  level: string,
  skill: string | null | undefined
) {
  if (skill === "reading") {
    return getCambridgeReadingSkillLabel(level);
  }

  if (skill === "listening") {
    return "Listening";
  }

  if (skill === "writing") {
    return "Writing";
  }

  if (skill === "speaking") {
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
