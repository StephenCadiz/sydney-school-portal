import { supabase } from "./supabase";

export async function getClassHomework(
  level: string,
  courseType: string
) {
  const today = new Date().toISOString().split("T")[0];

  const { data, error } = await supabase
    .from("cambridge_homework")
    .select("*")
    .eq("level", level)
   .eq("course_type", courseType)
    .eq("active", true)
    .lte("release_date", today)
    .order("homework_order", { ascending: true });

  

  if (error) throw error;

  return data || [];
}