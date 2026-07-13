import { supabase } from "./supabase";
import { normalizeCambridgeLevel } from "./homework";

const allowedLevels = ["B1", "B2", "C1"];

const activityOptionsByLevel: Record<string, string[]> = {
  B1: ["Reading", "Listening"],
  B2: ["Use of English", "Reading", "Listening"],
  C1: ["Use of English", "Reading", "Listening"],
};

function formatSupabaseError(action: string, error: any) {
  return [
    `Friday Exam Practice ${action} failed: ${
      error?.message || "Unknown Supabase error"
    }`,
    error?.details ? `Details: ${error.details}` : null,
    error?.hint ? `Hint: ${error.hint}` : null,
    error?.code ? `Code: ${error.code}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

function normalizeLevelName(levelName: string | null | undefined) {
  return normalizeCambridgeLevel(levelName);
}

function normalizeActivityType(activityType: string | null | undefined) {
  return String(activityType || "").trim();
}

function validateFridayExamPracticePayload(payload: any) {
  const levelName = normalizeLevelName(payload.level_name);
  const activityType = normalizeActivityType(payload.activity_type);
  const sessionDate = String(payload.session_date || "").trim();
  const pdfUrl = String(payload.pdf_url || "").trim();
  const audioUrl = String(payload.audio_url || "").trim();
  const keyUrl = String(payload.key_url || "").trim();

  if (!sessionDate) {
    throw new Error("Please choose a session date.");
  }

  if (!allowedLevels.includes(levelName)) {
    throw new Error("Level must be B1, B2 or C1.");
  }

  if (!getActivityOptionsForLevel(levelName).includes(activityType)) {
    throw new Error(`${activityType || "This activity"} is not valid for ${levelName}.`);
  }

  if (!pdfUrl) {
    throw new Error("Please add a PDF link.");
  }

  if (isListeningActivity(activityType) && !audioUrl) {
    throw new Error("Listening activities require an audio link.");
  }

  return {
    session_date: sessionDate,
    level_name: levelName,
    activity_type: activityType,
    pdf_url: pdfUrl,
    audio_url: isListeningActivity(activityType) ? audioUrl : null,
    key_url: keyUrl || null,
    note: payload.note ? String(payload.note).trim() : null,
    active: payload.active ?? true,
  };
}

async function ensureNoDuplicateSessionLevel(
  sessionDate: string,
  levelName: string,
  currentId?: string
) {
  const { data, error } = await supabase
    .from("friday_exam_practice_sessions")
    .select("id")
    .eq("session_date", sessionDate)
    .eq("level_name", levelName)
    .maybeSingle();

  if (error) {
    throw new Error(formatSupabaseError("duplicate check", error));
  }

  if (data && data.id !== currentId) {
    throw new Error("A Friday Exam Practice session already exists for this date and level.");
  }
}

export function getActivityOptionsForLevel(levelName: string) {
  const normalizedLevel = normalizeLevelName(levelName);

  return activityOptionsByLevel[normalizedLevel] || [];
}

export function isListeningActivity(activityType: string) {
  return normalizeActivityType(activityType) === "Listening";
}

export async function getFridayExamPracticeSessions() {
  const { data, error } = await supabase
    .from("friday_exam_practice_sessions")
    .select("*")
    .order("session_date", { ascending: true })
    .order("level_name", { ascending: true });

  if (error) {
    throw new Error(formatSupabaseError("load", error));
  }

  return data || [];
}

export async function getActiveFridayExamPracticeSessions() {
  const { data, error } = await supabase
    .from("friday_exam_practice_sessions")
    .select("*")
    .eq("active", true)
    .order("session_date", { ascending: true })
    .order("level_name", { ascending: true });

  if (error) {
    throw new Error(formatSupabaseError("active load", error));
  }

  return data || [];
}

export async function getFridayExamPracticeSessionsForDate(date: string) {
  const { data, error } = await supabase
    .from("friday_exam_practice_sessions")
    .select("id, session_date, level_name, activity_type, pdf_url, audio_url, key_url, note, active")
    .eq("active", true)
    .eq("session_date", date)
    .order("level_name", { ascending: true });

  if (error) {
    throw new Error(formatSupabaseError("date load", error));
  }

  return data || [];
}

export async function createFridayExamPracticeSession(payload: any) {
  const sessionPayload = validateFridayExamPracticePayload(payload);

  await ensureNoDuplicateSessionLevel(
    sessionPayload.session_date,
    sessionPayload.level_name
  );

  const {
    data: { session },
  } = await supabase.auth.getSession();

  const { error } = await supabase
    .from("friday_exam_practice_sessions")
    .insert([
      {
        ...sessionPayload,
        created_by: session?.user.id || null,
      },
    ]);

  if (error) {
    throw new Error(formatSupabaseError("save", error));
  }
}

export async function updateFridayExamPracticeSession(
  id: string,
  updates: any
) {
  const sessionPayload = validateFridayExamPracticePayload(updates);

  await ensureNoDuplicateSessionLevel(
    sessionPayload.session_date,
    sessionPayload.level_name,
    id
  );

  const { error } = await supabase
    .from("friday_exam_practice_sessions")
    .update({
      ...sessionPayload,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) {
    throw new Error(formatSupabaseError("update", error));
  }
}

export async function deleteFridayExamPracticeSession(id: string) {
  const { error } = await supabase
    .from("friday_exam_practice_sessions")
    .delete()
    .eq("id", id);

  if (error) {
    throw new Error(formatSupabaseError("delete", error));
  }
}

function getTeacherName(profile: any) {
  if (!profile) return "No teacher assigned";

  return `${profile.first_name || ""} ${profile.last_name || ""}`.trim() ||
    "No teacher assigned";
}

async function enrichFridayAt6Duties(duties: any[]) {
  const teacherIds = Array.from(
    new Set(duties.map((duty) => duty.teacher_id).filter(Boolean))
  );

  const { data: teachers, error: teachersError } =
    teacherIds.length > 0
      ? await supabase
          .from("profiles")
          .select("id, first_name, last_name")
          .in("id", teacherIds)
      : { data: [], error: null };

  if (teachersError) {
    throw new Error(formatSupabaseError("duty teacher load", teachersError));
  }

  return duties.map((duty) => {
    const teacher = (teachers || []).find(
      (profile) => profile.id === duty.teacher_id
    );

    return {
      ...duty,
      teacher_name: getTeacherName(teacher),
    };
  });
}

function validateFridayAt6DutyPayload(payload: any) {
  const sessionDate = String(payload.session_date || "").trim();
  const teacherId = String(payload.teacher_id || "").trim();

  if (!sessionDate) {
    throw new Error("Please choose a duty date.");
  }

  if (!teacherId) {
    throw new Error("Please choose a teacher.");
  }

  return {
    session_date: sessionDate,
    teacher_id: teacherId,
    note: payload.note ? String(payload.note).trim() : null,
    active: payload.active ?? true,
  };
}

async function ensureNoDuplicateFridayAt6DutyDate(
  sessionDate: string,
  currentId?: string
) {
  const { data, error } = await supabase
    .from("friday_at_6_duties")
    .select("id")
    .eq("session_date", sessionDate)
    .maybeSingle();

  if (error) {
    throw new Error(formatSupabaseError("duty duplicate check", error));
  }

  if (data && data.id !== currentId) {
    throw new Error("A general tutorial duty already exists for this date.");
  }
}

export async function getFridayAt6Duties() {
  const { data, error } = await supabase
    .from("friday_at_6_duties")
    .select("*")
    .order("session_date", { ascending: true });

  if (error) {
    throw new Error(formatSupabaseError("duty load", error));
  }

  return enrichFridayAt6Duties(data || []);
}

export async function getFridayAt6DutyForDate(date: string) {
  const { data, error } = await supabase
    .from("friday_at_6_duties")
    .select("id, session_date, teacher_id, note, active")
    .eq("session_date", date)
    .eq("active", true)
    .maybeSingle();

  if (error) {
    throw new Error(formatSupabaseError("duty date load", error));
  }

  if (!data) {
    return null;
  }

  const [duty] = await enrichFridayAt6Duties([data]);

  return duty || null;
}

export async function saveFridayAt6Duty(payload: any) {
  const dutyPayload = validateFridayAt6DutyPayload(payload);

  const { data: existingDuty, error: existingError } = await supabase
    .from("friday_at_6_duties")
    .select("id")
    .eq("session_date", dutyPayload.session_date)
    .maybeSingle();

  if (existingError) {
    throw new Error(formatSupabaseError("duty lookup", existingError));
  }

  if (existingDuty?.id) {
    await updateFridayAt6Duty(existingDuty.id, dutyPayload);
    return;
  }

  const { error } = await supabase
    .from("friday_at_6_duties")
    .insert([dutyPayload]);

  if (error) {
    throw new Error(formatSupabaseError("duty save", error));
  }
}

export async function updateFridayAt6Duty(id: string, updates: any) {
  const dutyPayload = validateFridayAt6DutyPayload(updates);

  await ensureNoDuplicateFridayAt6DutyDate(dutyPayload.session_date, id);

  const { error } = await supabase
    .from("friday_at_6_duties")
    .update({
      ...dutyPayload,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) {
    throw new Error(formatSupabaseError("duty update", error));
  }
}

export async function deleteFridayAt6Duty(id: string) {
  const { error } = await supabase
    .from("friday_at_6_duties")
    .delete()
    .eq("id", id);

  if (error) {
    throw new Error(formatSupabaseError("duty delete", error));
  }
}
