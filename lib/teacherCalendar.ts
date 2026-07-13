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

type TeacherPersonalReminderPayload = {
  title: string;
  event_date: string;
  start_time?: string | null;
  end_time?: string | null;
  description?: string | null;
};

type TeacherPersonalReminderUpdate = Partial<TeacherPersonalReminderPayload> & {
  completed?: boolean;
};

const teacherCalendarEventSelect =
  "id, title, event_date, start_time, end_time, description, audience, teacher_id, created_by, created_at, completed";

async function getAuthenticatedTeacherId() {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.user?.id) {
    throw new Error("You must be logged in as a teacher.");
  }

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", session.user.id)
    .single();

  if (error || profile?.role !== "teacher") {
    throw new Error("You must be logged in as a teacher.");
  }

  return session.user.id;
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
    .select(teacherCalendarEventSelect)
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

export async function createTeacherPersonalReminder(
  reminder: TeacherPersonalReminderPayload
): Promise<TeacherCalendarEvent> {
  const teacherId = await getAuthenticatedTeacherId();

  const { data, error } = await supabase
    .from("teacher_calendar_events")
    .insert([
      {
        title: reminder.title,
        event_date: reminder.event_date,
        start_time: reminder.start_time || null,
        end_time: reminder.end_time || null,
        description: reminder.description || null,
        audience: "personal",
        teacher_id: teacherId,
        created_by: teacherId,
        completed: false,
      },
    ])
    .select(teacherCalendarEventSelect)
    .single();

  if (error) {
    console.error("createTeacherPersonalReminder Supabase error:", error);
    throw new Error("Unable to create reminder.");
  }

  return data as TeacherCalendarEvent;
}

export async function updateTeacherPersonalReminder(
  id: string,
  updates: TeacherPersonalReminderUpdate
): Promise<TeacherCalendarEvent> {
  await getAuthenticatedTeacherId();

  const payload: TeacherPersonalReminderUpdate = {};

  if ("title" in updates) payload.title = updates.title;
  if ("event_date" in updates) payload.event_date = updates.event_date;
  if ("start_time" in updates) payload.start_time = updates.start_time || null;
  if ("end_time" in updates) payload.end_time = updates.end_time || null;
  if ("description" in updates) {
    payload.description = updates.description || null;
  }
  if ("completed" in updates) payload.completed = updates.completed;

  const { data, error } = await supabase
    .from("teacher_calendar_events")
    .update(payload)
    .eq("id", id)
    .select(teacherCalendarEventSelect)
    .single();

  if (error) {
    console.error("updateTeacherPersonalReminder Supabase error:", error);
    throw new Error("Unable to update reminder.");
  }

  return data as TeacherCalendarEvent;
}

export async function setTeacherPersonalReminderCompleted(
  id: string,
  completed: boolean
): Promise<TeacherCalendarEvent> {
  await getAuthenticatedTeacherId();

  const { data, error } = await supabase
    .from("teacher_calendar_events")
    .update({ completed })
    .eq("id", id)
    .select(teacherCalendarEventSelect)
    .single();

  if (error) {
    console.error(
      "setTeacherPersonalReminderCompleted Supabase error:",
      error
    );
    throw new Error("Unable to update reminder status.");
  }

  return data as TeacherCalendarEvent;
}

export async function deleteTeacherPersonalReminder(id: string) {
  await getAuthenticatedTeacherId();

  const { error } = await supabase
    .from("teacher_calendar_events")
    .delete()
    .eq("id", id);

  if (error) {
    console.error("deleteTeacherPersonalReminder Supabase error:", error);
    throw new Error("Unable to delete reminder.");
  }

  return { success: true };
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
