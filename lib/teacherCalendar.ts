import { supabase } from "./supabase";
import type { UpcomingCalendarGroup } from "./calendarGroups";
import {
  getMadridSchoolDate,
  getNextSchoolClosure,
  type SchoolClosureSummary,
} from "./schoolClosures";

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

export type TeacherCalendarClosureNotice = {
  id: string;
  title: string;
  event_date: string;
  start_time: null;
  end_time: null;
  description: string;
  audience: "all_teachers";
  teacher_id: null;
  created_by: null;
  completed: false;
  is_closure_notice: true;
  closure_id: string;
  closure_type: SchoolClosureSummary["closure_type"];
};

export type TeacherCalendarAgendaItem =
  | TeacherCalendarEvent
  | TeacherCalendarClosureNotice
  | UpcomingCalendarGroup;

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
    .eq("audience", "all_teachers")
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
    .eq("audience", "all_teachers")
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

export async function getUpcomingTeacherSchoolClosures(): Promise<SchoolClosureSummary[]> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    throw new Error("You must be logged in as a teacher.");
  }

  const response = await fetch("/api/teacher/calendar/closures", {
    headers: { Authorization: `Bearer ${session.access_token}` },
    cache: "no-store",
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || "Unable to load school closures.");
  }

  return Array.isArray(payload.closures) ? payload.closures : [];
}

export async function getUpcomingCalendarGroups(): Promise<UpcomingCalendarGroup[]> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error("Your session has expired. Please sign in again.");
  const response = await fetch("/api/calendar/upcoming-groups", {
    headers: { Authorization: `Bearer ${session.access_token}` },
    cache: "no-store",
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "Unable to load upcoming calendar groups.");
  return Array.isArray(payload.groups) ? payload.groups : [];
}

function shiftDateKey(dateKey: string, days: number) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, 12));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function formatTeacherCalendarClosureDate(dateKey: string) {
  const date = new Date(`${dateKey}T12:00:00Z`);
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Europe/Madrid",
  }).format(date);
}

export function getTeacherCalendarClosureTypeLabel(closure: SchoolClosureSummary) {
  if (closure.closure_type === "public_holiday") return "Public holiday";
  if (closure.closure_type === "school_holiday") return "School holiday";
  return "School closure";
}

export function formatTeacherCalendarClosureRange(
  closure: Pick<SchoolClosureSummary, "start_date" | "end_date">
) {
  const start = formatTeacherCalendarClosureDate(closure.start_date);
  if (closure.start_date === closure.end_date) return start;
  return `${start} to ${formatTeacherCalendarClosureDate(closure.end_date)}`;
}

/** Future closures are deliberately kept separate from agenda notices so the
 * full list can be browsed without changing the existing three-item agenda. */
export function getFutureTeacherSchoolClosures(
  closures: readonly SchoolClosureSummary[],
  today = getMadridSchoolDate()
) {
  return [...closures]
    .filter((closure) => closure.end_date >= today)
    .sort(
      (a, b) =>
        a.start_date.localeCompare(b.start_date) ||
        a.end_date.localeCompare(b.end_date) ||
        a.name.localeCompare(b.name)
    );
}

export function getNextTeacherSchoolClosure(
  closures: readonly SchoolClosureSummary[],
  today = getMadridSchoolDate()
) {
  return getNextSchoolClosure(closures, today);
}

function closureAlreadyRepresented(
  events: readonly TeacherCalendarEvent[],
  date: string,
  closure: SchoolClosureSummary
) {
  const closureName = closure.name.trim().toLocaleLowerCase();
  return events.some((event) => {
    if (String(event.event_date || "") !== date) return false;
    const title = String(event.title || "").toLocaleLowerCase();
    const description = String(event.description || "").toLocaleLowerCase();
    return title.includes(closureName) || description.includes(closureName);
  });
}

function nextOpenDateAfter(
  endDate: string,
  closures: readonly SchoolClosureSummary[]
) {
  let date = shiftDateKey(endDate, 1);
  for (let index = 0; index < 370; index += 1) {
    const covered = closures.some(
      (closure) => closure.start_date <= date && date <= closure.end_date
    );
    if (!covered) return date;
    date = shiftDateKey(date, 1);
  }
  return date;
}

export function mergeTeacherCalendarEventsWithClosures(
  events: readonly TeacherCalendarEvent[],
  closures: readonly SchoolClosureSummary[],
  today = getMadridSchoolDate()
): TeacherCalendarAgendaItem[] {
  const items: TeacherCalendarAgendaItem[] = [...events];
  const sortedClosures = [...closures].sort((a, b) =>
    a.start_date.localeCompare(b.start_date) || a.end_date.localeCompare(b.end_date)
  );

  for (const closure of sortedClosures) {
    const isSingleDay = closure.start_date === closure.end_date;
    if (isSingleDay) {
      if (closure.start_date < today || closureAlreadyRepresented(events, closure.start_date, closure)) {
        continue;
      }

      items.push({
        id: `closure-${closure.id}`,
        title:
          closure.closure_type === "public_holiday"
            ? `Public holiday: ${closure.name}`
            : `School closed: ${closure.name}`,
        event_date: closure.start_date,
        start_time: null,
        end_time: null,
        description: `${getTeacherCalendarClosureTypeLabel(closure)} on ${formatTeacherCalendarClosureDate(closure.start_date)}.`,
        audience: "all_teachers",
        teacher_id: null,
        created_by: null,
        completed: false,
        is_closure_notice: true,
        closure_id: closure.id,
        closure_type: closure.closure_type,
      });
      continue;
    }

    const beforeDate = shiftDateKey(closure.start_date, -1);
    if (beforeDate >= today && !closureAlreadyRepresented(events, beforeDate, closure)) {
      items.push({
        id: `closure-before-${closure.id}`,
        title: "School closure",
        event_date: beforeDate,
        start_time: null,
        end_time: null,
        description: `School closed from ${formatTeacherCalendarClosureDate(closure.start_date)} to ${formatTeacherCalendarClosureDate(closure.end_date)}.`,
        audience: "all_teachers",
        teacher_id: null,
        created_by: null,
        completed: false,
        is_closure_notice: true,
        closure_id: closure.id,
        closure_type: closure.closure_type,
      });
    }

    const resumeDate = nextOpenDateAfter(closure.end_date, sortedClosures);
    if (resumeDate >= today && !closureAlreadyRepresented(events, resumeDate, closure)) {
      items.push({
        id: `closure-resume-${closure.id}`,
        title: "Classes resume after the break",
        event_date: resumeDate,
        start_time: null,
        end_time: null,
        description: `Classes resume after the ${getTeacherCalendarClosureTypeLabel(closure).toLocaleLowerCase()}.`,
        audience: "all_teachers",
        teacher_id: null,
        created_by: null,
        completed: false,
        is_closure_notice: true,
        closure_id: closure.id,
        closure_type: closure.closure_type,
      });
    }
  }

  return items.sort((a, b) => {
    const dateOrder = String(a.event_date || "").localeCompare(String(b.event_date || ""));
    if (dateOrder !== 0) return dateOrder;
    if ("is_closure_notice" in a && !("is_closure_notice" in b)) return -1;
    if (!("is_closure_notice" in a) && "is_closure_notice" in b) return 1;
    return String(a.start_time || "").localeCompare(String(b.start_time || ""));
  });
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
