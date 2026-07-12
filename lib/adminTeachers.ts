import { supabase } from "./supabase";

export async function getTeachers() {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, email, first_name, last_name, role")
    .eq("role", "teacher")
    .order("first_name");

  if (error) throw error;

  return data || [];
}
