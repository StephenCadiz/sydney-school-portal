import { supabase } from "./supabase";
import { getCurrentAcademicYear } from "./academicYears";
import { filterClassesForCurrentTeaching } from "./academicYearRules";

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

  const currentAcademicYear = await getCurrentAcademicYear();

  return filterClassesForCurrentTeaching(
    data || [],
    currentAcademicYear?.id
  );
}
