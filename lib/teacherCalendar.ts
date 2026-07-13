import { supabase } from "./supabase";

export interface TeacherCalendarEvent {
  id: string;
  title: string;
  event_date: string;
  start_time: string | null;
  end_time: string | null;
  description: string | null;
  audience: string;
  teacher_id: string | null;
  created_by: string | null;
  created_at?: string;
  completed: boolean;
}

export async function getTeacherCalendarEvents() {
  const { data, error } = await supabase
    .from("teacher_calendar_events")
    .select("*")
    .order("event_date", { ascending: true })
    .order("start_time", { ascending: true });

  if (error) {
    console.error("getTeacherCalendarEvents Supabase error:", error);
    throw error;
  }

  return data || [];
}

export async function getUpcomingTeacherCalendarEvents() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const today = `${year}-${month}-${day}`;

  const { data, error } = await supabase
    .from("teacher_calendar_events")
    .select("*")
    .gte("event_date", today)
    .order("event_date", { ascending: true })
    .order("start_time", { ascending: true });

  if (error) {
    console.error(
      "getUpcomingTeacherCalendarEvents Supabase error:",
      error
    );
    throw error;
  }

  return data || [];
}

export async function getTeacherCalendarEventsForRange(
  startDate: string,
  endDate: string
): Promise<TeacherCalendarEvent[]> {
  const { data, error } = await supabase
    .from("teacher_calendar_events")
    .select(
      "id, title, event_date, start_time, end_time, description, audience, teacher_id, created_by, created_at, completed"
    )
    .gte("event_date", startDate)
    .lte("event_date", endDate)
    .order("event_date", { ascending: true })
    .order("start_time", { ascending: true });

  if (error) {
    console.error("getTeacherCalendarEventsForRange Supabase error:", error);
    throw error;
  }

  return (data || []) as TeacherCalendarEvent[];
}

export async function createTeacherCalendarEvent(event: any) {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const { error } = await supabase
    .from("teacher_calendar_events")
    .insert([
      {
        title: event.title,
        event_date: event.event_date,
        start_time: event.start_time,
        end_time: event.end_time,
        description: event.description,
        audience: "all_teachers",
        created_by: session?.user.id || null,
      },
    ]);

  if (error) {
    console.error("createTeacherCalendarEvent Supabase error:", error);
    throw error;
  }
}

export async function deleteTeacherCalendarEvent(id: string) {
  const { error } = await supabase
    .from("teacher_calendar_events")
    .delete()
    .eq("id", id);

  if (error) {
    console.error("deleteTeacherCalendarEvent Supabase error:", error);
    throw error;
  }
}
