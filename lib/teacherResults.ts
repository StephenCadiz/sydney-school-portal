import {
  getCambridgeReadingSkillLabel,
  normalizeCambridgeLevel,
  normalizeHomeworkSkill,
} from "./homework";

export const MIN_AGGREGATE_STUDENTS = 2;

export type TeacherResultClassOption = {
  id: string;
  class_name: string;
  level_id: string;
  level_name: string;
  is_cambridge: boolean;
  course_type: string;
  days: string;
  start_time: string;
  end_time: string;
};

export type HomeworkSourceResult = {
  id?: string | null;
  class_id?: string | null;
  student_id?: string | null;
  week_number?: number | string | null;
  title?: string | null;
  skill?: string | null;
  percentage?: number | string | null;
  updated_at?: string | null;
  created_at?: string | null;
};

export type AggregateValue = {
  average: number | null;
  result_count: number;
  student_count: number;
  suppressed: boolean;
};

export type HomeworkSkillAggregate = AggregateValue & {
  skill: string;
  label: string;
};

export type HomeworkWeekAggregate = AggregateValue & {
  week: number;
  skill: string;
  label: string;
  coverage_count: number;
  coverage_total: number;
  coverage_percentage: number | null;
};

export type HomeworkClassComparison = AggregateValue & {
  class_id: string;
  class_name: string;
  level_name: string;
  roster_count: number;
};

export type HomeworkAnalytics = {
  overall: AggregateValue;
  skills: HomeworkSkillAggregate[];
  weeks: HomeworkWeekAggregate[];
};

export function toTeacherResultNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function getCambridgeTarget(level: unknown) {
  const targets: Record<string, number> = {
    B1: 70,
    B2: 60,
    C1: 60,
    C2: 60,
  };

  return targets[normalizeCambridgeLevel(level)] ?? null;
}

export function getHomeworkWeek(result: HomeworkSourceResult) {
  const storedWeek = Number(result.week_number);

  if (Number.isFinite(storedWeek) && storedWeek > 0) {
    return storedWeek;
  }

  const match = /week\s+(\d+)/i.exec(String(result.title || ""));
  return match ? Number(match[1]) : null;
}

function getResultTime(result: HomeworkSourceResult) {
  const timestamp = Date.parse(result.updated_at || result.created_at || "");
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function getSkillOrder(skill: string) {
  if (skill === "reading") return 1;
  if (skill === "listening") return 2;
  if (skill === "writing") return 3;
  return 99;
}

export function getHomeworkSkillLabel(level: unknown, skill: unknown) {
  const normalizedSkill = normalizeHomeworkSkill(skill);

  if (normalizedSkill === "reading") {
    return getCambridgeReadingSkillLabel(String(level || ""));
  }

  if (normalizedSkill === "listening") return "Listening";
  if (normalizedSkill === "writing") return "Writing";
  if (normalizedSkill === "speaking") return "Speaking";

  return String(skill || "Homework").trim() || "Homework";
}

export function deduplicateHomeworkResults(
  results: HomeworkSourceResult[],
  enrolledStudentIdsByClass: Map<string, Set<string>>
) {
  const newestByKey = new Map<string, HomeworkSourceResult>();

  for (const result of results) {
    const classId = String(result.class_id || "");
    const studentId = String(result.student_id || "");
    const week = getHomeworkWeek(result);
    const skill = normalizeHomeworkSkill(result.skill);
    const percentage = toTeacherResultNumber(result.percentage);

    if (
      !classId ||
      !studentId ||
      !week ||
      !skill ||
      percentage === null ||
      !enrolledStudentIdsByClass.get(classId)?.has(studentId)
    ) {
      continue;
    }

    const key = `${classId}:${studentId}:${week}:${skill}`;
    const existing = newestByKey.get(key);

    if (
      !existing ||
      getResultTime(result) > getResultTime(existing) ||
      (getResultTime(result) === getResultTime(existing) &&
        String(result.id || "").localeCompare(String(existing.id || "")) > 0)
    ) {
      newestByKey.set(key, {
        ...result,
        class_id: classId,
        student_id: studentId,
        week_number: week,
        skill,
        percentage,
      });
    }
  }

  return Array.from(newestByKey.values());
}

export function buildAggregateValue(results: HomeworkSourceResult[]): AggregateValue {
  const values = results
    .map((result) => toTeacherResultNumber(result.percentage))
    .filter((value): value is number => value !== null);
  const distinctStudents = new Set(
    results.map((result) => String(result.student_id || "")).filter(Boolean)
  ).size;
  const suppressed = values.length > 0 && distinctStudents < MIN_AGGREGATE_STUDENTS;

  return {
    average:
      values.length > 0 && !suppressed
        ? values.reduce((total, value) => total + value, 0) / values.length
        : null,
    result_count: values.length,
    student_count: distinctStudents,
    suppressed,
  };
}

export function buildHomeworkAnalytics(
  results: HomeworkSourceResult[],
  levelName: string,
  rosterCount: number
): HomeworkAnalytics {
  const skillGroups = new Map<string, HomeworkSourceResult[]>();
  const weekGroups = new Map<string, HomeworkSourceResult[]>();

  for (const result of results) {
    const skill = normalizeHomeworkSkill(result.skill);
    const week = getHomeworkWeek(result);

    if (!skill || !week) continue;
    skillGroups.set(skill, [...(skillGroups.get(skill) || []), result]);
    weekGroups.set(`${week}:${skill}`, [
      ...(weekGroups.get(`${week}:${skill}`) || []),
      result,
    ]);
  }

  const skills = ["reading", "listening", "writing"]
    .map((skill) => ({
      skill,
      label: getHomeworkSkillLabel(levelName, skill),
      ...buildAggregateValue(skillGroups.get(skill) || []),
    }))
    .sort((first, second) => getSkillOrder(first.skill) - getSkillOrder(second.skill));

  const weeks = Array.from(weekGroups.entries())
    .map(([key, rows]) => {
      const [weekText, skill] = key.split(":");
      const coverageCount = new Set(
        rows.map((row) => String(row.student_id || "")).filter(Boolean)
      ).size;

      return {
        week: Number(weekText),
        skill,
        label: getHomeworkSkillLabel(levelName, skill),
        coverage_count: coverageCount,
        coverage_total: rosterCount,
        coverage_percentage:
          rosterCount > 0 ? (coverageCount / rosterCount) * 100 : null,
        ...buildAggregateValue(rows),
      };
    })
    .sort(
      (first, second) =>
        first.week - second.week || getSkillOrder(first.skill) - getSkillOrder(second.skill)
    );

  return {
    overall: buildAggregateValue(results),
    skills,
    weeks,
  };
}

export function getTargetStatus(average: number | null, target: number | null) {
  if (average === null || target === null) return null;

  const difference = average - target;
  return {
    label: difference >= 0 ? "Target achieved" : "Below target",
    difference,
  };
}
