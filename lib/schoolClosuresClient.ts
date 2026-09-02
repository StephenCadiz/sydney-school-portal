import { supabase } from "./supabase";

export async function isSchoolClosedClient(date: string) {
  const { data, error } = await supabase.rpc("is_school_closed", {
    p_date: date,
  });
  if (error) throw error;
  return data === true;
}
