import { supabase } from "./supabase";

const allowedUnitExamLevels = [
  "KIDS 1",
  "KIDS 2",
  "JUNIOR 1",
  "JUNIOR 2",
  "JUNIOR 3",
  "JUNIOR 4",
  "TEENS 1",
];

function formatSupabaseError(action: string, error: any) {
  return [
    `Unit Exam Results ${action} failed: ${
      error?.message || "Unknown Supabase error"
    }`,
    error?.details ? `Details: ${error.details}` : null,
    error?.hint ? `Hint: ${error.hint}` : null,
    error?.code ? `Code: ${error.code}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

export function normalizeLevelName(levelName: string | null | undefined) {
  return String(levelName || "").trim().toUpperCase();
}

export function isUnitExamLevel(levelName: string | null | undefined) {
  return allowedUnitExamLevels.includes(normalizeLevelName(levelName));
}

export function isTeensUnitExamLevel(levelName: string | null | undefined) {
  return normalizeLevelName(levelName) === "TEENS 1";
}

function toNullableNumber(value: any) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const number = Number(value);

  return Number.isFinite(number) ? number : null;
}

function buildUnitExamResultPayload(payload: any) {
  const levelName = normalizeLevelName(payload.level_name);
  const youngLearnerId = String(payload.young_learner_id || "").trim();
  const classId = String(payload.class_id || "").trim();
  const teacherId = payload.teacher_id
    ? String(payload.teacher_id).trim()
    : null;
  const unitExamNumber = Number(payload.unit_exam_number);

  if (!youngLearnerId) {
    throw new Error("Young Learner is required.");
  }

  if (!classId) {
    throw new Error("Class is required.");
  }

  if (!Number.isFinite(unitExamNumber) || unitExamNumber < 1) {
    throw new Error("Unit Exam number must be 1 or higher.");
  }

  if (!isUnitExamLevel(levelName)) {
    throw new Error("Unit Exam Results are not available for this level.");
  }

  const isTeens = isTeensUnitExamLevel(levelName);

  return {
    young_learner_id: youngLearnerId,
    class_id: classId,
    teacher_id: teacherId,
    unit_exam_number: unitExamNumber,
    reading_writing: isTeens
      ? null
      : toNullableNumber(payload.reading_writing),
    reading: isTeens ? toNullableNumber(payload.reading) : null,
    writing: isTeens ? toNullableNumber(payload.writing) : null,
    listening: toNullableNumber(payload.listening),
    speaking: toNullableNumber(payload.speaking),
    comments: payload.comments ? String(payload.comments).trim() : null,
  };
}

export async function getUnitExamResultsForClass(classId: string) {
  const { data, error } = await supabase
    .from("unit_exam_results")
    .select("*")
    .eq("class_id", classId)
    .order("unit_exam_number", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(formatSupabaseError("load", error));
  }

  return data || [];
}

export async function saveUnitExamResult(payload: any) {
  const resultPayload = buildUnitExamResultPayload(payload);

  const { data: existingResult, error: existingError } = await supabase
    .from("unit_exam_results")
    .select("id")
    .eq("young_learner_id", resultPayload.young_learner_id)
    .eq("class_id", resultPayload.class_id)
    .eq("unit_exam_number", resultPayload.unit_exam_number)
    .maybeSingle();

  if (existingError) {
    throw new Error(formatSupabaseError("lookup", existingError));
  }

  if (existingResult?.id) {
    const { data, error } = await supabase
      .from("unit_exam_results")
      .update({
        ...resultPayload,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existingResult.id)
      .select()
      .single();

    if (error) {
      throw new Error(formatSupabaseError("update", error));
    }

    return data;
  }

  const { data, error } = await supabase
    .from("unit_exam_results")
    .insert([resultPayload])
    .select()
    .single();

  if (error) {
    throw new Error(formatSupabaseError("save", error));
  }

  return data;
}

export async function deleteUnitExamResult(id: string) {
  const { error } = await supabase
    .from("unit_exam_results")
    .delete()
    .eq("id", id);

  if (error) {
    throw new Error(formatSupabaseError("delete", error));
  }
}

export async function getUnitExamResultsGroupedByUnit(classId: string) {
  const results = await getUnitExamResultsForClass(classId);

  return results.reduce((groups: Record<string, any[]>, result) => {
    const key = String(result.unit_exam_number || "Unassigned");

    return {
      ...groups,
      [key]: [...(groups[key] || []), result],
    };
  }, {});
}
