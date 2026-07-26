import { supabase } from "./supabase";

export type AdminTeacher = {
  id: string;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  role: string;
};

export type AdminTeacherClass = {
  id: string;
  teacher_id: string | null;
  level_id: string | null;
  class_name: string | null;
  course_type: string | null;
  is_cambridge: boolean | null;
  days: string | null;
  start_time: string | null;
  end_time: string | null;
  level_name: string | null;
};

export async function getTeachers() {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, email, first_name, last_name, role")
    .eq("role", "teacher")
    .order("first_name");

  if (error) throw error;

  return data || [];
}

export async function getTeacherManagementData(): Promise<{
  teachers: AdminTeacher[];
  classes: AdminTeacherClass[];
  classRecordsAvailable: boolean;
  classLabelsAvailable: boolean;
}> {
  const teachersResult = await supabase
    .from("profiles")
    .select("id, email, first_name, last_name, role")
    .eq("role", "teacher");

  if (teachersResult.error) throw teachersResult.error;

  const classesResult = await supabase
    .from("classes")
    .select(
      "id, teacher_id, level_id, class_name, course_type, is_cambridge, days, start_time, end_time"
    );

  if (classesResult.error) {
    console.error(
      "Unable to load Admin Teachers class information:",
      classesResult.error
    );
    return {
      teachers: (teachersResult.data || []) as AdminTeacher[],
      classes: [],
      classRecordsAvailable: false,
      classLabelsAvailable: false,
    };
  }

  const classRows = classesResult.data || [];
  const levelIds = Array.from(
    new Set(
      classRows
        .map((classroom) => classroom.level_id)
        .filter((levelId): levelId is string => Boolean(levelId))
    )
  );
  let levelNames = new Map<string, string>();
  let classLabelsAvailable = true;

  if (levelIds.length > 0) {
    const levelsResult = await supabase
      .from("levels")
      .select("id, name")
      .in("id", levelIds);

    if (levelsResult.error) {
      classLabelsAvailable = false;
      console.error(
        "Unable to enrich Admin Teachers classes with level names:",
        levelsResult.error
      );
    } else {
      levelNames = new Map(
        (levelsResult.data || []).map((level) => [
          String(level.id),
          String(level.name || "").trim(),
        ])
      );
    }
  }

  return {
    teachers: (teachersResult.data || []) as AdminTeacher[],
    classes: classRows.map((classroom) => ({
      ...classroom,
      level_name: classroom.level_id
        ? levelNames.get(String(classroom.level_id)) || null
        : null,
    })) as AdminTeacherClass[],
    classRecordsAvailable: true,
    classLabelsAvailable,
  };
}
