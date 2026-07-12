import { supabase } from "./supabase";

function formatExamKeyError(action: string, error: any) {
  return [
    `Cambridge exam key ${action} failed: ${
      error?.message || "Unknown Supabase error"
    }`,
    error?.details ? `Details: ${error.details}` : null,
    error?.hint ? `Hint: ${error.hint}` : null,
    error?.code ? `Code: ${error.code}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

export async function getCambridgeExamKey(
  level: string,
  courseType: string,
  examNumber: number
) {
  const { data, error } = await supabase
    .from("cambridge_exam_keys")
    .select("*")
    .eq("level", level)
    .eq("course_type", courseType)
    .eq("exam_number", examNumber)
    .maybeSingle();

  if (error) {
    throw new Error(formatExamKeyError("load", error));
  }

  return data;
}

export async function getCambridgeExamKeys(
  level: string,
  courseType: string
) {
  const { data, error } = await supabase
    .from("cambridge_exam_keys")
    .select("*")
    .eq("level", level)
    .eq("course_type", courseType)
    .order("exam_number", { ascending: true });

  if (error) {
    throw new Error(formatExamKeyError("load", error));
  }

  return data || [];
}

export async function upsertCambridgeExamKey(
  level: string,
  courseType: string,
  examNumber: number,
  keyUrl: string | null | undefined
) {
  const safeKeyUrl = keyUrl?.trim();

  if (!safeKeyUrl) {
    return;
  }

  const { error } = await supabase
    .from("cambridge_exam_keys")
    .upsert(
      {
        level,
        course_type: courseType,
        exam_number: examNumber,
        key_url: safeKeyUrl,
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: "level,course_type,exam_number",
      }
    );

  if (error) {
    throw new Error(formatExamKeyError("save", error));
  }
}
