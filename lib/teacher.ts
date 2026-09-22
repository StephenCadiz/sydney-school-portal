import { supabase } from "./supabase";
import { getCurrentAcademicYear } from "./academicYears";
import { filterClassesForCurrentTeaching } from "./academicYearRules";
import { sortClassesByGlobalOrder } from "./classOrdering";

function logSupabaseError(context: string, error: any) {
  console.error(`${context} Supabase error:`, {
    message: error?.message || "",
    code: error?.code || "",
    details: error?.details || "",
    hint: error?.hint || "",
  });
}

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

  if (error) {
    logSupabaseError("getTeacherClasses", error);
    throw error;
  }

  const levelIds = [...new Set((data || []).map((classroom: any) => classroom.level_id).filter((id: unknown) => id != null))];
  const { data: levels, error: levelsError } = levelIds.length
    ? await supabase.from("levels").select("id, name").in("id", levelIds)
    : { data: [], error: null };

  if (levelsError) {
    logSupabaseError("getTeacherClasses levels", levelsError);
    throw levelsError;
  }

  const levelById = new Map((levels || []).map((level: any) => [String(level.id), level]));
  const classesWithLevels = (data || []).map((classroom: any) => ({
    ...classroom,
    level_name: levelById.get(String(classroom.level_id))?.name || null,
    levels: levelById.get(String(classroom.level_id)) || null,
  }));

  const currentAcademicYear = await getCurrentAcademicYear();

  return sortClassesByGlobalOrder(
    filterClassesForCurrentTeaching(classesWithLevels, currentAcademicYear?.id)
  );
}
