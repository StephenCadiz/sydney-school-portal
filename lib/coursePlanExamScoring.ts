import { normalizeHomeworkSkill } from "./homework";

export const COURSE_PLAN_EXAM_LEVELS = ["B1", "B2", "C1", "C2"] as const;
export const COURSE_PLAN_ELIGIBLE_SKILLS = ["reading", "listening", "writing"] as const;

export type CoursePlanExamSkill = (typeof COURSE_PLAN_ELIGIBLE_SKILLS)[number];

export type CoursePlanExamPart = {
  id: string;
  exam_set_id: string;
  part_type: string;
  label?: string | null;
  part_number?: number | null;
  parent_part_id?: string | null;
};

export type CoursePlanExam = {
  id: string;
  exam_number: number;
  title?: string | null;
  parts: CoursePlanExamPart[];
};

export type CoursePlanExamSkillRow = CoursePlanExamPart & {
  subparts?: Array<{ id: string; part_number: number; label?: string | null }>;
};

export function flattenExamParts(parts: CoursePlanExamSkillRow[]) {
  const numbered = parts.flatMap((part) =>
    (part.subparts || []).map((subpart) => ({
      id: subpart.id,
      exam_set_id: part.exam_set_id,
      part_type: part.part_type,
      label: subpart.label || `Part ${subpart.part_number}`,
      part_number: subpart.part_number,
      parent_part_id: part.id,
    }))
  );
  return numbered.length ? numbered : parts;
}

export type CoursePlanSelection = {
  exam_set_id: string;
  exam_part_id: string | null;
  exam_subpart_id?: string | null;
  purpose: "class_practice" | "homework";
  selection_scope: "full_exam" | "skill" | "part";
};

export type CoursePlanScore = {
  exam_set_id: string;
  exam_part_id: string;
  exam_subpart_id?: string | null;
  purpose: "class_practice" | "homework";
  percentage: number | null;
};

export function normalizeExamSkill(value: unknown): CoursePlanExamSkill | null {
  const normalized = normalizeHomeworkSkill(value);
  return COURSE_PLAN_ELIGIBLE_SKILLS.includes(normalized as CoursePlanExamSkill)
    ? (normalized as CoursePlanExamSkill)
    : null;
}

export function isEligibleExamPart(part: Pick<CoursePlanExamPart, "part_type">) {
  return normalizeExamSkill(part.part_type) !== null;
}

export function eligibleParts(exam: CoursePlanExam) {
  const hasNumberedParts = exam.parts.some((part) => part.parent_part_id && part.part_number);
  return exam.parts.filter((part) => isEligibleExamPart(part) && (!hasNumberedParts || Boolean(part.parent_part_id && part.part_number)));
}

export function expandSelection(
  selection: CoursePlanSelection,
  exams: CoursePlanExam[]
) {
  const exam = exams.find((candidate) => candidate.id === selection.exam_set_id);
  if (!exam) return [];
  if (selection.selection_scope === "full_exam") return eligibleParts(exam).flatMap((part) =>
    part.parent_part_id ? [part] : [part]
  );
  if (selection.selection_scope === "skill") {
    return eligibleParts(exam).filter((part) => part.parent_part_id === selection.exam_part_id || part.id === selection.exam_part_id);
  }
  return exam.parts.filter((part) =>
    isEligibleExamPart(part) &&
    (part.id === selection.exam_subpart_id || (!selection.exam_subpart_id && part.id === selection.exam_part_id))
  );
}

export function expandSelections(
  selections: CoursePlanSelection[],
  exams: CoursePlanExam[]
) {
  return selections.flatMap((selection) =>
    expandSelection(selection, exams).map((part) => ({
      ...part,
      purpose: selection.purpose,
    }))
  );
}

export function unavailablePartIds(
  selections: CoursePlanSelection[],
  exams: CoursePlanExam[],
  purpose: CoursePlanSelection["purpose"]
) {
  return new Set(
    expandSelections(selections, exams)
      .filter((part) => part.purpose !== purpose)
      .map((part) => part.id)
  );
}

export function remainingPartIds(
  selections: CoursePlanSelection[],
  exams: CoursePlanExam[],
  examSetId: string
) {
  const selected = new Set(
    expandSelections(selections, exams)
      .filter((part) => part.exam_set_id === examSetId)
      .map((part) => part.id)
  );
  const exam = exams.find((candidate) => candidate.id === examSetId);
  return eligibleParts(exam || { id: examSetId, exam_number: 0, parts: [] }).filter(
    (part) => !selected.has(part.id)
  );
}

export function skillAverage(
  scores: Array<Pick<CoursePlanScore, "exam_part_id" | "percentage">>,
  parts: CoursePlanExamPart[]
) {
  const eligible = parts.filter(isEligibleExamPart);
  const values = eligible
    .map((part) => scores.find((score) => score.exam_part_id === part.id)?.percentage)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

export function testPercentage(
  scores: Array<Pick<CoursePlanScore, "exam_part_id" | "percentage">>,
  exam: CoursePlanExam
) {
  const parts = eligibleParts(exam);
  const values = parts.map((part) =>
    scores.find((score) => score.exam_part_id === part.id)?.percentage
  );
  if (!parts.length || values.some((value) => typeof value !== "number" || !Number.isFinite(value))) {
    return null;
  }
  const numericValues = values.filter((value): value is number => typeof value === "number");
  return numericValues.reduce((sum, value) => sum + value, 0) / numericValues.length;
}
