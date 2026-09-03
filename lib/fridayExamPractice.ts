import { supabase } from "./supabase";
import {
  fridayTutorialCambridgeLevels,
  normalizeCambridgeLevel,
} from "./fridayTutorialResults";
import { assignEffectiveFridayTutorialDutyDates } from "./fridayTutorialRotation";
import {
  getFridayTutorialSessionTypeForDate,
  getFridayTutorialRotationContext,
  isB1FridayTutorialSession,
} from "./fridayTutorials";
import { isSchoolClosedClient } from "./schoolClosuresClient";

const allowedLevels = [...fridayTutorialCambridgeLevels];

const activityOptionsByLevel: Record<string, string[]> = {
  B1: ["Reading", "Listening"],
  B2: ["Use of English", "Reading", "Listening"],
  C1: ["Use of English", "Reading", "Listening"],
  C2: ["Use of English", "Reading", "Listening"],
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

async function getAdminAccessToken() {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    throw new Error("Your Admin session has expired.");
  }

  return session.access_token;
}

async function parseAdminResponse(response: Response, fallback: string) {
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(result.error || fallback);
  }
  return result;
}

function validateFridayExamPracticePayload(payload: any) {
  const levelName = normalizeLevelName(payload.level_name);
  const activityType = normalizeActivityType(payload.activity_type);
  const sessionDate = String(payload.session_date || "").trim();
  const pdfUrl = String(payload.pdf_url || "").trim();
  const audioUrl = String(payload.audio_url || "").trim();
  const keyUrl = String(payload.key_url || "").trim();
  const examPart = String(payload.exam_part || "").trim();

  if (!sessionDate) {
    throw new Error("Please choose a session date.");
  }

  if (!allowedLevels.includes(levelName as any)) {
    throw new Error("Level must be B1, B2, C1 or C2.");
  }

  if (!getActivityOptionsForLevel(levelName).includes(activityType)) {
    throw new Error(`${activityType || "This activity"} is not valid for ${levelName}.`);
  }

  if (!examPart) {
    throw new Error("Please add the exam part.");
  }

  return {
    session_date: sessionDate,
    level_name: levelName,
    activity_type: activityType,
    exam_part: examPart,
    pdf_url: pdfUrl,
    audio_url: isListeningActivity(activityType) ? audioUrl : null,
    key_url: keyUrl || null,
    note: payload.note ? String(payload.note).trim() : null,
    active: payload.active ?? true,
    cambridge_exam_part_id: String(
      payload.cambridge_exam_part_id || ""
    ).trim(),
  };
}

export function getActivityOptionsForLevel(levelName: string) {
  const normalizedLevel = normalizeLevelName(levelName);

  return activityOptionsByLevel[normalizedLevel] || [];
}

export function isListeningActivity(activityType: string) {
  return normalizeActivityType(activityType) === "Listening";
}

export async function getFridayExamPracticeSessions() {
  const token = await getAdminAccessToken();
  const response = await fetch("/api/admin/friday-exam-practice/sessions", {
    headers: { Authorization: `Bearer ${token}` },
  });
  const result = await parseAdminResponse(
    response,
    "Unable to load Friday Tutorial sessions."
  );
  return result.sessions || [];
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
  if (await isSchoolClosedClient(date)) return [];
  const { data, error } = await supabase
    .from("friday_exam_practice_sessions")
    .select("id, session_date, level_name, activity_type, exam_part, pdf_url, audio_url, key_url, note, active")
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
  const token = await getAdminAccessToken();
  const response = await fetch("/api/admin/friday-exam-practice/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(sessionPayload),
  });
  return parseAdminResponse(
    response,
    "Unable to save the Friday Tutorial session."
  );
}

export async function updateFridayExamPracticeSession(
  id: string,
  updates: any
) {
  const sessionPayload = validateFridayExamPracticePayload(updates);
  const token = await getAdminAccessToken();
  const response = await fetch("/api/admin/friday-exam-practice/sessions", {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ id, ...sessionPayload }),
  });
  return parseAdminResponse(
    response,
    "Unable to update the Friday Tutorial session."
  );
}

export type FridayExamPracticeDeleteResult =
  | {
      deleted: true;
      deleted_linked_results: boolean;
      linked_result_sheet_count: number;
    }
  | {
      deleted: false;
      requires_delete_linked_results: true;
      linked_result_sheet_count: number;
    };

export async function deleteFridayExamPracticeSession(
  id: string,
  deleteLinkedResults = false
): Promise<FridayExamPracticeDeleteResult> {
  const token = await getAdminAccessToken();
  const response = await fetch("/api/admin/friday-exam-practice/sessions", {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      id,
      delete_linked_results: deleteLinkedResults,
    }),
  });
  const result = await response.json().catch(() => ({}));

  if (
    response.status === 409 &&
    result.requires_delete_linked_results === true
  ) {
    return {
      deleted: false,
      requires_delete_linked_results: true,
      linked_result_sheet_count: Number(result.linked_result_sheet_count) || 0,
    };
  }

  if (!response.ok) {
    throw new Error(result.error || "Unable to delete the Friday Tutorial session.");
  }

  return {
    deleted: true,
    deleted_linked_results: result.deleted_linked_results === true,
    linked_result_sheet_count: Number(result.linked_result_sheet_count) || 0,
  };
}

function getTeacherName(profile: any) {
  if (!profile) return "No teacher assigned";

  return `${profile.first_name || ""} ${profile.last_name || ""}`.trim() ||
    "No teacher assigned";
}

async function enrichFridayAt6Duties(duties: any[]) {
  const teacherIds = Array.from(
    new Set(
      duties
        .flatMap((duty) => [duty.teacher_id, duty.b1_teacher_id])
        .filter(Boolean)
    )
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
    const b1Teacher = (teachers || []).find(
      (profile) => profile.id === duty.b1_teacher_id
    );

    return {
      ...duty,
      teacher_name: getTeacherName(teacher),
      b1_teacher_name: duty.b1_teacher_id
        ? getTeacherName(b1Teacher)
        : "Not assigned",
    };
  });
}

async function validateFridayAt6DutyPayload(payload: any) {
  const sessionDate = String(payload.session_date || "").trim();
  const teacherId = String(payload.teacher_id || "").trim();
  const requestedB1TeacherId = String(payload.b1_teacher_id || "").trim();

  if (!sessionDate) {
    throw new Error("Please choose a duty date.");
  }

  if (!teacherId) {
    throw new Error("Please choose a teacher.");
  }

  if (await isSchoolClosedClient(sessionDate)) {
    throw new Error(
      "School is closed on this date. No Friday Tutorial duty is required."
    );
  }

  const { settings, closures } = await getFridayTutorialRotationContext();
  const sessionType = getFridayTutorialSessionTypeForDate(
    settings || {},
    sessionDate,
    closures
  );

  if (!sessionType) {
    throw new Error("Choose a Friday from the current Friday Tutorial rotation.");
  }

  if (isB1FridayTutorialSession(sessionType) && !requestedB1TeacherId) {
    throw new Error("Please choose the B1 Tutorial Duty teacher.");
  }

  return {
    session_date: sessionDate,
    teacher_id: teacherId,
    b1_teacher_id: isB1FridayTutorialSession(sessionType)
      ? requestedB1TeacherId
      : null,
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

  const enriched = await enrichFridayAt6Duties(data || []);
  const { settings, closures } = await getFridayTutorialRotationContext();
  return settings
    ? assignEffectiveFridayTutorialDutyDates(settings, closures, enriched)
    : enriched.map((duty) => ({
        ...duty,
        original_session_date: duty.session_date,
        effective_session_date: duty.session_date,
        deferred_by_school_closure: false,
      }));
}

export async function saveFridayAt6Duty(payload: any) {
  const dutyPayload = await validateFridayAt6DutyPayload(payload);

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
  const dutyPayload = await validateFridayAt6DutyPayload(updates);

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
