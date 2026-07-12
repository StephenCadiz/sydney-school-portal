import { supabase } from "./supabase";

export async function getTeacherProfile(userId: string) {
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .single();

  if (error) throw error;

  return data;
}

export async function getTeacherClasses(userId: string) {
  const { data, error } = await supabase
    .from("classes")
    .select(`
      *,
      classrooms (
        id,
        name,
        logo,
        theme_colour
      )
    `)
    .eq("teacher_id", userId);

  if (error) throw error;

  return data || [];
}