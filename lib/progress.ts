import { supabase } from "./supabase";

export async function getStudentResults(studentId: string) {
  const { data, error } = await supabase
    .from("results")
    .select("*")
    .eq("student_id", studentId);

  if (error) throw error;

  return (data || []).filter(
    (result) =>
      result.result_type !== "mock" ||
      (result.published_at !== null && result.published_at !== undefined)
  );
}
