import { supabase } from "./supabase";

export async function getStudentResults(studentId: string) {
  const { data, error } = await supabase
    .from("results")
    .select("*")
    .eq("student_id", studentId);

  if (error) throw error;

  return data || [];
}
