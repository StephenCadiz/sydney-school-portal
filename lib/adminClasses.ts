import { supabase } from "./supabase";

function prepareClassData(classData: any) {
  if (classData.course_type === "online") {
    return {
      ...classData,
      classroom_id: null,
      meet_link: String(classData.meet_link || "").trim(),
    };
  }

  return {
    ...classData,
    meet_link: null,
  };
}

export async function getAdminClasses() {
  const { data, error } = await supabase
    .from("classes")
    .select("*");

  if (error) {
    console.error("getAdminClasses Supabase error:", error);
    throw error;
  }

  return data || [];
}

export async function getLevels() {
  const { data, error } = await supabase
    .from("levels")
    .select("id, name, catagory")
    .order("name");

  if (error) {
    console.error("getLevels Supabase error:", error);
    throw error;
  }

  return data || [];
}

export async function getTeachers() {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, first_name, last_name")
    .eq("role", "teacher")
    .order("first_name");

  if (error) {
    console.error("getTeachers Supabase error:", error);
    throw error;
  }

  return data || [];
}

export async function getClassrooms() {
  const { data, error } = await supabase
    .from("classrooms")
    .select("id, name")
    .order("name");

  if (error) {
    console.error("getClassrooms Supabase error:", error);
    throw error;
  }

  return data || [];
}

export async function createClass(classData: any) {
  const { error } = await supabase
    .from("classes")
    .insert([prepareClassData(classData)]);

  if (error) {
    console.error("createClass Supabase error:", error);
    throw error;
  }
}

export async function updateClass(id: string, classData: any) {
  const { error } = await supabase
    .from("classes")
    .update(prepareClassData(classData))
    .eq("id", id);

  if (error) {
    console.error("updateClass Supabase error:", error);
    throw error;
  }
}
