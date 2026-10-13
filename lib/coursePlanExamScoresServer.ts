import "server-only";

import { getHomeworkSkillLabel } from "./homework";
import {
  expandSelections,
  flattenExamParts,
  isEligibleExamPart,
  skillAverage,
  testPercentage,
  type CoursePlanExam,
  type CoursePlanSelection,
} from "./coursePlanExamScoring";
import { supabaseAdmin } from "./supabaseAdmin";
import { CoursePlanningError, type CoursePlanningContext } from "./coursePlanningServer";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type ScoreAssignment = {
  course_plan_day_id: string;
  exam_set_id: string;
  exam_part_id: string;
  exam_subpart_id: string | null;
  selection_scope: "skill" | "part";
  purpose: "class_practice" | "homework";
  exam_number: number;
  exam_title: string | null;
  skill: string;
  skill_label: string;
  part_label: string | null;
  part_number: number | null;
  percentage: number | null;
  updated_at: string | null;
};

function requireUuid(value: unknown, label: string) {
  const normalized = String(value || "").trim();
  if (!UUID.test(normalized)) throw new CoursePlanningError(`${label} is required.`, 400);
  return normalized;
}

async function assertEnrolled(context: CoursePlanningContext, studentId: string) {
  const { data, error } = await supabaseAdmin
    .from("current_class_enrolments")
    .select("student_id")
    .eq("class_id", context.classId)
    .eq("student_id", studentId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new CoursePlanningError("The student is not enrolled in this class.", 403);
}

async function loadPlan(context: CoursePlanningContext) {
  const { data: plan, error: planError } = await supabaseAdmin
    .from("course_plans")
    .select("id, class_id")
    .eq("class_id", context.classId)
    .maybeSingle();
  if (planError) throw planError;
  if (!plan) throw new CoursePlanningError("Course Planning has not been created for this class.", 404);
  const { data: days, error: dayError } = await supabaseAdmin
    .from("course_plan_days")
    .select("id, lesson_date")
    .eq("course_plan_id", plan.id)
    .order("lesson_date", { ascending: true });
  if (dayError) throw dayError;
  const dayIds = (days || []).map((day) => String(day.id));
  const { data: items, error: itemError } = dayIds.length
    ? await supabaseAdmin
        .from("course_plan_exam_items")
        .select("id, course_plan_day_id, exam_set_id, exam_part_id, exam_subpart_id, purpose, selection_scope, sort_order")
        .in("course_plan_day_id", dayIds)
        .order("sort_order", { ascending: true })
    : { data: [], error: null };
  if (itemError) throw itemError;
  const examSetIds = Array.from(new Set((items || []).map((item) => String(item.exam_set_id))));
  const [examRows, partRows] = await Promise.all([
    examSetIds.length
      ? supabaseAdmin.from("cambridge_exam_sets").select("id, exam_number, title").in("id", examSetIds)
      : Promise.resolve({ data: [], error: null }),
    examSetIds.length
      ? supabaseAdmin.from("cambridge_exam_parts").select("id, exam_set_id, part_type").in("exam_set_id", examSetIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (examRows.error) throw examRows.error;
  if (partRows.error) throw partRows.error;
  const parentIds = (partRows.data || []).map((part) => String(part.id));
  const subpartRows = parentIds.length
    ? await supabaseAdmin.from("cambridge_exam_subparts").select("id, exam_part_id, part_number, label").in("exam_part_id", parentIds)
    : { data: [], error: null };
  if (subpartRows.error && !["42P01", "PGRST205"].includes(String(subpartRows.error.code || ""))) throw subpartRows.error;
  const subpartsByParent = new Map<string, any[]>();
  for (const row of subpartRows.data || []) {
    const key = String(row.exam_part_id);
    subpartsByParent.set(key, [...(subpartsByParent.get(key) || []), row]);
  }
  const exams: CoursePlanExam[] = (examRows.data || []).map((exam) => ({
    id: String(exam.id),
    exam_number: Number(exam.exam_number),
    title: exam.title ? String(exam.title) : null,
      parts: flattenExamParts((partRows.data || [])
        .filter((part) => String(part.exam_set_id) === String(exam.id))
        .map((part) => ({
        id: String(part.id),
        exam_set_id: String(part.exam_set_id),
          part_type: String(part.part_type),
          subparts: subpartsByParent.get(String(part.id)) || [],
        }))),
  }));
  return { plan, days: days || [], items: items || [], exams };
}

export async function loadCoursePlanExamScores(
  context: CoursePlanningContext,
  studentIdInput: unknown
) {
  const studentId = requireUuid(studentIdInput, "A valid student");
  await assertEnrolled(context, studentId);
  const { days, items, exams } = await loadPlan(context);
  const dayIds = days.map((day) => String(day.id));
  const { data: scores, error: scoreError } = dayIds.length
    ? await supabaseAdmin
        .from("course_plan_exam_scores")
        .select("course_plan_day_id, exam_set_id, exam_part_id, exam_subpart_id, purpose, percentage, updated_at")
        .eq("class_id", context.classId)
        .eq("student_id", studentId)
        .in("course_plan_day_id", dayIds)
    : { data: [], error: null };
  if (scoreError && !["42P01", "PGRST205"].includes(String(scoreError.code || ""))) throw scoreError;
  const scoreRows = (scores || []).map((score) => ({
    course_plan_day_id: String(score.course_plan_day_id),
    exam_set_id: String(score.exam_set_id),
    exam_part_id: String(score.exam_part_id),
    exam_subpart_id: score.exam_subpart_id ? String(score.exam_subpart_id) : null,
    purpose: String(score.purpose) as "class_practice" | "homework",
    percentage: Number(score.percentage),
    updated_at: score.updated_at || null,
  }));
  const assignments: ScoreAssignment[] = items.flatMap((item): ScoreAssignment[] => {
    const exam = exams.find((candidate) => candidate.id === String(item.exam_set_id));
    if (!exam) return [];
    const selection: CoursePlanSelection = {
      exam_set_id: String(item.exam_set_id),
      exam_part_id: item.exam_part_id ? String(item.exam_part_id) : null,
      exam_subpart_id: item.exam_subpart_id ? String(item.exam_subpart_id) : null,
      purpose: String(item.purpose) as CoursePlanSelection["purpose"],
      selection_scope: String(item.selection_scope) as CoursePlanSelection["selection_scope"],
    };
    const expanded = expandSelections([selection], [exam]);
    if (selection.selection_scope === "part") {
      return expanded.map((part) => {
        const score = scoreRows.find((row) =>
          row.course_plan_day_id === String(item.course_plan_day_id) &&
          (row.exam_subpart_id || row.exam_part_id) === part.id &&
          row.purpose === selection.purpose
        );
        return {
          course_plan_day_id: String(item.course_plan_day_id),
          exam_set_id: String(item.exam_set_id),
          exam_part_id: part.parent_part_id || part.id,
          exam_subpart_id: part.parent_part_id ? part.id : null,
          selection_scope: "part" as const,
          purpose: selection.purpose,
          exam_number: exam.exam_number,
          exam_title: exam.title || null,
          skill: String(part.part_type),
          skill_label: getHomeworkSkillLabel(context.levelName, part.part_type),
          part_label: part.label || null,
          part_number: part.part_number || null,
          percentage: score?.percentage ?? null,
          updated_at: score?.updated_at || null,
        };
      });
    }

    const groups = new Map<string, any[]>();
    for (const part of expanded) {
      const parentId = String(part.parent_part_id || part.id);
      groups.set(parentId, [...(groups.get(parentId) || []), part]);
    }
    return Array.from(groups.entries()).map(([parentId, parts]) => {
      const aggregateScore = scoreRows.find((row) =>
        row.course_plan_day_id === String(item.course_plan_day_id) &&
        row.exam_part_id === parentId &&
        !row.exam_subpart_id &&
        row.purpose === selection.purpose
      );
      const legacyScores = parts
        .map((part) => scoreRows.find((row) =>
          row.course_plan_day_id === String(item.course_plan_day_id) &&
          (row.exam_subpart_id || row.exam_part_id) === part.id &&
          row.purpose === selection.purpose
        )?.percentage)
        .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
      const percentage = aggregateScore?.percentage ?? (legacyScores.length
        ? legacyScores.reduce((sum, value) => sum + value, 0) / legacyScores.length
        : null);
      const first = parts[0];
      return {
        course_plan_day_id: String(item.course_plan_day_id),
        exam_set_id: String(item.exam_set_id),
        exam_part_id: parentId,
        exam_subpart_id: null,
        selection_scope: "skill" as const,
        purpose: selection.purpose,
        exam_number: exam.exam_number,
        exam_title: exam.title || null,
        skill: String(first.part_type),
        skill_label: getHomeworkSkillLabel(context.levelName, first.part_type),
        part_label: "All parts",
        part_number: null,
        percentage,
        updated_at: aggregateScore?.updated_at || null,
      };
    });
  });
  const skillGroups = new Map<string, { percentages: any[]; parts: any[] }>();
  for (const assignment of assignments) {
    const key = String(assignment.skill);
    const current = skillGroups.get(key) || { percentages: [], parts: [] };
    const scorePartId = assignment.exam_subpart_id || assignment.exam_part_id;
    current.percentages.push({ exam_part_id: scorePartId, percentage: assignment.percentage });
    current.parts.push({ id: scorePartId, exam_set_id: assignment.exam_set_id, part_type: assignment.skill });
    skillGroups.set(key, current);
  }
  const skillAverages = Array.from(skillGroups.entries()).map(([skill, group]) => ({
    skill,
    label: getHomeworkSkillLabel(context.levelName, skill),
    percentage: skillAverage(group.percentages, group.parts),
  }));
  const testGroups = new Map<string, any[]>();
  for (const assignment of assignments) {
    const key = `${assignment.course_plan_day_id}:${assignment.exam_set_id}`;
    const exam = exams.find((candidate) => candidate.id === assignment.exam_set_id);
    const coveredParts = assignment.selection_scope === "skill"
      ? (exam?.parts || []).filter((part) => String(part.parent_part_id || part.id) === assignment.exam_part_id)
      : [{ id: assignment.exam_subpart_id || assignment.exam_part_id }];
    testGroups.set(key, [
      ...(testGroups.get(key) || []),
      ...coveredParts.map((part) => ({ exam_part_id: part.id, percentage: assignment.percentage })),
    ]);
  }
  const testPercentages = Array.from(testGroups.entries()).map(([key, values]) => {
    const [, examSetId] = key.split(":");
    const exam = exams.find((candidate) => candidate.id === examSetId)!;
    return {
      course_plan_day_id: key.split(":")[0],
      exam_set_id: examSetId,
      exam_number: exam.exam_number,
      percentage: testPercentage(values, exam),
    };
  });
  return { student_id: studentId, assignments, skill_averages: skillAverages, test_percentages: testPercentages };
}

export async function saveCoursePlanExamScore(
  context: CoursePlanningContext,
  body: unknown
) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new CoursePlanningError("Invalid exam score request.", 400);
  }
  const record = body as Record<string, unknown>;
  const allowed = new Set(["student_id", "course_plan_day_id", "exam_set_id", "exam_part_id", "exam_subpart_id", "purpose", "percentage"]);
  if (Object.keys(record).some((key) => !allowed.has(key))) throw new CoursePlanningError("Invalid exam score request.", 400);
  const studentId = requireUuid(record.student_id, "A valid student");
  const dayId = requireUuid(record.course_plan_day_id, "A valid lesson");
  const examSetId = requireUuid(record.exam_set_id, "A valid exam");
  const examPartId = requireUuid(record.exam_part_id, "A valid exam part");
  const examSubpartId = record.exam_subpart_id ? requireUuid(record.exam_subpart_id, "A valid exam subpart") : null;
  const purpose = String(record.purpose || "") as "class_practice" | "homework";
  if (purpose !== "class_practice" && purpose !== "homework") throw new CoursePlanningError("Choose Classwork or Homework.", 422);
  const percentage = Number(record.percentage);
  if (!Number.isFinite(percentage) || percentage < 0 || percentage > 100) throw new CoursePlanningError("Percentage must be between 0 and 100.", 422);
  await assertEnrolled(context, studentId);
  const { data: day, error: dayError } = await supabaseAdmin
    .from("course_plan_days")
    .select("id, course_plan_id, course_plans!inner(class_id)")
    .eq("id", dayId)
    .eq("course_plans.class_id", context.classId)
    .maybeSingle();
  if (dayError) throw dayError;
  if (!day) throw new CoursePlanningError("The planned lesson was not found.", 404);
  const { data: items, error: itemError } = await supabaseAdmin
    .from("course_plan_exam_items")
        .select("exam_set_id, exam_part_id, exam_subpart_id, purpose, selection_scope")
    .eq("course_plan_day_id", dayId);
  if (itemError) throw itemError;
  const { data: parts, error: partError } = await supabaseAdmin
    .from("cambridge_exam_parts")
    .select("id, exam_set_id, part_type")
    .eq("exam_set_id", examSetId);
  if (partError) throw partError;
  const subpartResult = await supabaseAdmin.from("cambridge_exam_subparts").select("id, exam_part_id, part_number, label").in("exam_part_id", (parts || []).map((part) => String(part.id)));
  if (subpartResult.error && !["42P01", "PGRST205"].includes(String(subpartResult.error.code || ""))) throw subpartResult.error;
  const byParent = new Map<string, any[]>();
  for (const row of subpartResult.data || []) byParent.set(String(row.exam_part_id), [...(byParent.get(String(row.exam_part_id)) || []), row]);
  const exam = { id: examSetId, exam_number: 0, parts: flattenExamParts((parts || []).map((part) => ({ id: String(part.id), exam_set_id: String(part.exam_set_id), part_type: String(part.part_type), subparts: byParent.get(String(part.id)) || [] }))) };
  if (!parts?.some((part) => String(part.id) === examPartId && isEligibleExamPart(part))) {
    throw new CoursePlanningError("Speaking and unassigned exam parts cannot be scored.", 422);
  }
  const selections = (items || []).map((item) => ({
    exam_set_id: String(item.exam_set_id),
    exam_part_id: item.exam_part_id ? String(item.exam_part_id) : null,
    exam_subpart_id: item.exam_subpart_id ? String(item.exam_subpart_id) : null,
    purpose: String(item.purpose) as CoursePlanSelection["purpose"],
    selection_scope: String(item.selection_scope) as CoursePlanSelection["selection_scope"],
  }));
  const expanded = expandSelections(selections.filter((item) => item.exam_set_id === examSetId), [exam]);
  const selected = expanded.find((part) => part.id === (examSubpartId || examPartId) && part.purpose === purpose);
  const aggregateSelected = !examSubpartId && selections.some((selection) =>
    selection.exam_set_id === examSetId &&
    selection.purpose === purpose &&
    ((selection.selection_scope === "skill" && selection.exam_part_id === examPartId) ||
      (selection.selection_scope === "full_exam" && parts.some((part) => String(part.id) === examPartId && isEligibleExamPart(part))))
  );
  if (!selected && !aggregateSelected) throw new CoursePlanningError("That exam part is not assigned to this activity.", 422);
  const scoreValues = {
    class_id: context.classId,
    exam_set_id: examSetId,
    exam_part_id: examPartId,
    exam_subpart_id: examSubpartId,
    purpose,
    percentage,
    updated_by: context.actorId,
  };
  let existingScoreQuery = supabaseAdmin
    .from("course_plan_exam_scores")
    .select("id")
    .eq("course_plan_day_id", dayId)
    .eq("student_id", studentId)
    .eq("exam_part_id", examPartId)
    .eq("purpose", purpose);
  existingScoreQuery = examSubpartId
    ? existingScoreQuery.eq("exam_subpart_id", examSubpartId)
    : existingScoreQuery.is("exam_subpart_id", null);
  const { data: existingScore, error: existingScoreError } = await existingScoreQuery.maybeSingle();
  if (existingScoreError) throw existingScoreError;
  const scoreWrite = existingScore
    ? supabaseAdmin
        .from("course_plan_exam_scores")
        .update(scoreValues)
        .eq("id", existingScore.id)
    : supabaseAdmin
        .from("course_plan_exam_scores")
        .insert({
          course_plan_day_id: dayId,
          student_id: studentId,
          created_by: context.actorId,
          ...scoreValues,
        });
  const { error } = await scoreWrite;
  if (error) throw error;
  const { error: historyError } = await supabaseAdmin
    .from("course_plan_exam_score_history")
    .insert({
      course_plan_day_id: dayId,
      class_id: context.classId,
      student_id: studentId,
      exam_set_id: examSetId,
      exam_part_id: examPartId,
      exam_subpart_id: examSubpartId,
      purpose,
      percentage,
      recorded_by: context.actorId,
    });
  if (historyError && !["42P01", "PGRST205"].includes(String(historyError.code || ""))) throw historyError;
  return loadCoursePlanExamScores(context, studentId);
}
