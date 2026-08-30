import type { AcademicYear } from "./academicYearRules";

export const ROLLOVER_DECISIONS = [
  "decide_later",
  "promote",
  "repeat",
  "different_level",
  "not_returning",
] as const;

export type AcademicYearRolloverDecision =
  (typeof ROLLOVER_DECISIONS)[number];

export type AcademicYearRolloverStatus =
  | "draft"
  | "partially_applied"
  | "completed";

export type AcademicYearRollover = {
  id: string;
  source_academic_year_id: string;
  target_academic_year_id: string;
  status: AcademicYearRolloverStatus;
  created_by: string;
  updated_by: string | null;
  applied_by: string | null;
  applied_at: string | null;
  created_at: string;
  updated_at: string;
};

export type RolloverClass = {
  id: string;
  class_name: string;
  level_id: number;
  level_name: string;
  teacher_id: string;
  teacher_name: string;
  classroom_id: string | null;
  classroom_name: string;
  course_type: string;
  days: string;
  start_time: string;
  end_time: string;
  meet_link: string | null;
  is_cambridge: boolean;
  academic_year_id: string;
  copied_target_class_id?: string | null;
};

export type RolloverStudent = {
  id: string;
  student_type: "profile" | "young_learner";
  student_id: string;
  first_name: string;
  last_name: string;
  full_name: string;
  active: boolean;
  source_class_id: string;
  source_class_name: string;
  source_level_id: number;
  source_level_name: string;
  source_course_type: string;
  source_days: string;
  suggested_level_id: number | null;
  suggested_level_name: string | null;
  decision: AcademicYearRolloverDecision;
  target_class_id: string | null;
  notes: string;
  applied_at: string | null;
  updated_at: string;
};

export type RolloverSummary = {
  total_students: number;
  promote: number;
  repeat: number;
  different_level: number;
  not_returning: number;
  decide_later: number;
  applied: number;
  ready_not_applied: number;
  classes_prepared: number;
  copied_classes: number;
};

export type AcademicYearRolloverWorkspace = {
  rollover: AcademicYearRollover;
  source_year: AcademicYear;
  target_year: AcademicYear;
  source_classes: RolloverClass[];
  target_classes: RolloverClass[];
  students: RolloverStudent[];
  teachers: Array<{ id: string; name: string }>;
  classrooms: Array<{ id: string; name: string }>;
  summary: RolloverSummary;
};

export type AcademicYearReadiness = {
  target_academic_year_id: string;
  target_label: string;
  source_academic_year_id: string | null;
  source_label: string | null;
  rollover_id: string | null;
  classes_prepared: number;
  total_students: number;
  students_assigned: number;
  planned_assignments: number;
  not_returning: number;
  still_undecided: number;
  ready_not_applied: number;
};

const NEXT_LEVEL_BY_NAME = new Map<string, string>([
  ["PRE-KIDS 1", "PRE-KIDS 2"],
  ["PRE-KIDS 2", "PRE-KIDS 3"],
  ["PRE-KIDS 3", "KIDS 1"],
  ["KIDS 1", "KIDS 2"],
  ["KIDS 2", "JUNIOR 1"],
  ["JUNIOR 1", "JUNIOR 2"],
  ["JUNIOR 2", "JUNIOR 3"],
  ["JUNIOR 3", "JUNIOR 4"],
  ["JUNIOR 4", "TEENS 1"],
  ["B1", "B2"],
  ["B2", "C1"],
  ["C1", "C2"],
]);

export function normalizeRolloverLevelName(value: unknown) {
  return String(value ?? "").trim().toUpperCase();
}

export function getSuggestedNextLevelName(levelName: unknown) {
  return NEXT_LEVEL_BY_NAME.get(normalizeRolloverLevelName(levelName)) || null;
}

export function isRolloverDecision(value: unknown): value is AcademicYearRolloverDecision {
  return ROLLOVER_DECISIONS.includes(value as AcademicYearRolloverDecision);
}

export function getRolloverDecisionLabel(
  decision: AcademicYearRolloverDecision
) {
  if (decision === "promote") return "Promote";
  if (decision === "repeat") return "Repeat Level";
  if (decision === "different_level") return "Different Level";
  if (decision === "not_returning") return "Not Returning";
  return "Decide Later";
}

export function targetClassMatchesDecision(
  student: Pick<
    RolloverStudent,
    | "student_type"
    | "source_level_id"
    | "suggested_level_id"
    | "decision"
  >,
  classroom: Pick<RolloverClass, "is_cambridge" | "level_id">
) {
  const compatibleType =
    student.student_type === "profile"
      ? classroom.is_cambridge
      : !classroom.is_cambridge;
  if (!compatibleType) return false;

  if (student.decision === "promote") {
    return (
      student.suggested_level_id !== null &&
      Number(classroom.level_id) === Number(student.suggested_level_id)
    );
  }
  if (student.decision === "repeat") {
    return Number(classroom.level_id) === Number(student.source_level_id);
  }
  return (
    student.decision === "different_level" &&
    Number(classroom.level_id) !== Number(student.source_level_id)
  );
}
