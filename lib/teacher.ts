import { supabase } from "./supabase";
import { getCurrentAcademicYear } from "./academicYears";
import { filterClassesForCurrentTeaching } from "./academicYearRules";
import { sortClassesByGlobalOrder } from "./classOrdering";

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
      levels (id, name),
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

  return sortClassesByGlobalOrder(
    filterClassesForCurrentTeaching(data || [], currentAcademicYear?.id)
  );
}
