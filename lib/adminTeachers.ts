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
  class_name: string | null;
  course_type: string | null;
  days: string | null;
  start_time: string | null;
  end_time: string | null;
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
}> {
  const [teachersResult, classesResult] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, email, first_name, last_name, role")
      .eq("role", "teacher"),
    supabase
      .from("classes")
      .select(
        "id, teacher_id, class_name, course_type, days, start_time, end_time"
      ),
  ]);

  if (teachersResult.error) throw teachersResult.error;
  if (classesResult.error) throw classesResult.error;

  return {
    teachers: (teachersResult.data || []) as AdminTeacher[],
    classes: (classesResult.data || []) as AdminTeacherClass[],
  };
}
