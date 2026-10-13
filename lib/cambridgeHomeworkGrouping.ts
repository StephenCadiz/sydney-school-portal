import {
  eligibleParts,
  isEligibleExamPart,
  type CoursePlanExam,
  type CoursePlanSelection,
} from "./coursePlanExamScoring";

/**
 * Older course-plan saves represented a complete skill as one assignment per
 * numbered subpart. Keep those records readable as one logical activity until
 * the plan is next edited, while leaving genuinely partial selections alone.
 */
export function collapseCompletePartSelections(
  selections: CoursePlanSelection[],
  exams: CoursePlanExam[]
) {
  const output: CoursePlanSelection[] = [];
  const consumed = new Set<number>();
  const grouped = new Map<string, number[]>();

  selections.forEach((selection, index) => {
    if (selection.selection_scope !== "part" || !selection.exam_subpart_id) return;
    const exam = exams.find((candidate) => candidate.id === selection.exam_set_id);
    const part = exam?.parts.find((candidate) => candidate.id === selection.exam_subpart_id);
    const parentId = part?.parent_part_id;
    if (!parentId || !isEligibleExamPart(part)) return;
    const key = `${selection.exam_set_id}:${parentId}:${selection.purpose}`;
    grouped.set(key, [...(grouped.get(key) || []), index]);
  });

  const collapseAt = new Map<number, CoursePlanSelection>();
  for (const indexes of grouped.values()) {
    const first = selections[indexes[0]];
    const exam = exams.find((candidate) => candidate.id === first.exam_set_id);
    const firstPart = exam?.parts.find((candidate) => candidate.id === first.exam_subpart_id);
    const parentId = firstPart?.parent_part_id;
    if (!exam || !parentId) continue;
    const expected = eligibleParts(exam).filter((part) => part.parent_part_id === parentId);
    const selected = new Set(indexes.map((index) => selections[index].exam_subpart_id));
    if (!expected.length || expected.some((part) => !selected.has(part.id))) continue;
    const skillSelection: CoursePlanSelection = {
      exam_set_id: first.exam_set_id,
      exam_part_id: parentId,
      exam_subpart_id: null,
      purpose: first.purpose,
      selection_scope: "skill",
    };
    collapseAt.set(indexes[0], skillSelection);
    indexes.forEach((index) => consumed.add(index));
  }

  selections.forEach((selection, index) => {
    if (collapseAt.has(index)) output.push(collapseAt.get(index)!);
    if (!consumed.has(index)) output.push(selection);
  });
  return output;
}

type HomeworkAssignmentRow = {
  id?: string | null;
  exam_part_id?: string | null;
  exam_subpart_id?: string | null;
  part?: any;
  subpart?: any;
  [key: string]: any;
};

export function collapseCompleteAssignmentRows(
  rows: HomeworkAssignmentRow[],
  expectedSubpartsByParent: Map<string, Set<string>>
) {
  const grouped = new Map<string, { index: number; rows: HomeworkAssignmentRow[] }>();

  rows.forEach((row, index) => {
    const parentId = String(row.exam_part_id || row.part?.id || "");
    const subpartId = String(row.exam_subpart_id || row.subpart?.id || "");
    if (!parentId || !subpartId) {
      return;
    }
    const expected = expectedSubpartsByParent.get(parentId);
    if (!expected?.size) {
      return;
    }
    const examId = String(row.part?.exam?.id || row.exam_set_id || "");
    const key = `${examId}:${parentId}:${row.release_date || ""}:${row.due_date || ""}`;
    const current = grouped.get(key) || { index, rows: [] };
    current.rows.push(row);
    grouped.set(key, current);
  });

  const replacements = new Map<number, HomeworkAssignmentRow>();
  const hidden = new Set<number>();
  for (const group of grouped.values()) {
    const ids = new Set(group.rows.map((row) => String(row.exam_subpart_id || row.subpart?.id || "")));
    const parentId = String(group.rows[0].exam_part_id || group.rows[0].part?.id || "");
    const expected = expectedSubpartsByParent.get(parentId);
    if (!expected || expected.size !== ids.size || Array.from(expected).some((id) => !ids.has(id))) {
      continue;
    }
    const members = [...group.rows].sort((first, second) =>
      Number(first.subpart?.part_number || 0) - Number(second.subpart?.part_number || 0)
    );
    const canonical = members[0];
    replacements.set(group.index, {
      ...canonical,
      subpart: null,
      __allParts: true,
      __assignmentIds: members.map((row) => String(row.id || "")).filter(Boolean),
    });
    group.rows.forEach((row) => {
      const index = rows.indexOf(row);
      if (index !== group.index) hidden.add(index);
    });
  }

  return rows
    .map((row, index) => ({ row: replacements.get(index) || row, index }))
    .filter(({ index }) => !hidden.has(index))
    .map(({ row }) => row);
}

export function assignmentMemberIds(row: HomeworkAssignmentRow) {
  const ids = Array.isArray(row.__assignmentIds) ? row.__assignmentIds : [row.id];
  return ids.map((id) => String(id || "")).filter(Boolean);
}
