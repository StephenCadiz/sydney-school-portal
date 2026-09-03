import "server-only";

import {
  assignEffectiveFridayTutorialDutyDates,
  buildFridayTutorialReconciliationPlan,
  type FridayTutorialRotationSettings,
} from "./fridayTutorialRotation";
import { getMadridSchoolDate } from "./schoolClosures";
import { loadSchoolClosures } from "./schoolClosuresServer";
import { supabaseAdmin } from "./supabaseAdmin";

export async function loadFridayTutorialRotationContext(options: {
  endDate?: string;
} = {}) {
  const { data: settings, error } = await supabaseAdmin
    .from("friday_tutorial_settings")
    .select("id, first_friday_date, first_session_type, created_at, updated_at")
    .eq("id", 1)
    .maybeSingle();
  if (error) throw error;

  const firstDate = String(settings?.first_friday_date || "");
  const closures = firstDate
    ? await loadSchoolClosures({
        startDate: firstDate,
        endDate: options.endDate,
      })
    : [];

  return {
    settings: (settings || null) as FridayTutorialRotationSettings | null,
    closures,
  };
}

export async function loadEffectiveFridayTutorialDutyForDate(date: string) {
  const rotation = await loadFridayTutorialRotationContext({ endDate: date });
  if (!rotation.settings?.first_friday_date) return null;

  const { data: duties, error } = await supabaseAdmin
    .from("friday_at_6_duties")
    .select("id, session_date, teacher_id, b1_teacher_id, note, active")
    .eq("active", true)
    .gte("session_date", rotation.settings.first_friday_date)
    .lte("session_date", date)
    .order("session_date", { ascending: true });
  if (error) throw error;

  return (
    assignEffectiveFridayTutorialDutyDates(
      rotation.settings,
      rotation.closures,
      duties || []
    ).find((duty) => duty.effective_session_date === date) || null
  );
}

function reconciliationError(action: string, error: unknown) {
  const detail =
    error && typeof error === "object" && "message" in error
      ? String((error as { message?: unknown }).message || "")
      : "";
  return new Error(
    `Unable to ${action} future Friday Tutorial scheduling${detail ? `: ${detail}` : "."}`
  );
}

export async function reconcileFutureFridayTutorialSessions() {
  const todayMadrid = getMadridSchoolDate();
  const { data: sessions, error: sessionsError } = await supabaseAdmin
    .from("friday_tutorial_sessions")
    .select("id, session_date, tutorial_group")
    .gte("session_date", todayMadrid)
    .order("session_date", { ascending: true });
  if (sessionsError) throw reconciliationError("load", sessionsError);

  const futureSessions = sessions || [];
  if (futureSessions.length === 0) {
    return { updated: 0, removed: 0, preserved: 0 };
  }

  const lastDate = String(futureSessions.at(-1)?.session_date || todayMadrid);
  const { settings, closures } = await loadFridayTutorialRotationContext({
    endDate: lastDate,
  });
  if (!settings) return { updated: 0, removed: 0, preserved: futureSessions.length };

  const sessionIds = futureSessions.map((session) => String(session.id));
  const { data: attendanceRows, error: attendanceError } = await supabaseAdmin
    .from("friday_tutorial_session_students")
    .select("session_id, student_attended_status")
    .in("session_id", sessionIds)
    .in("student_attended_status", ["yes", "no"]);
  if (attendanceError) {
    throw reconciliationError("verify completed attendance for", attendanceError);
  }

  const completedSessionIds = new Set(
    (attendanceRows || []).map((row) => String(row.session_id))
  );
  const plan = buildFridayTutorialReconciliationPlan(
    settings,
    closures,
    futureSessions,
    completedSessionIds,
    todayMadrid
  );

  let updated = 0;
  let removed = 0;
  for (const action of plan.actions) {
    const { error: membershipError } = await supabaseAdmin
      .from("friday_tutorial_session_students")
      .delete()
      .eq("session_id", action.id);
    if (membershipError) {
      throw reconciliationError("clear the obsolete roster from", membershipError);
    }

    if (action.action === "delete") {
      const { error } = await supabaseAdmin
        .from("friday_tutorial_sessions")
        .delete()
        .eq("id", action.id);
      if (error) throw reconciliationError("remove", error);
      removed += 1;
      continue;
    }

    const { error } = await supabaseAdmin
      .from("friday_tutorial_sessions")
      .update({
        tutorial_group: action.tutorial_group,
        updated_at: new Date().toISOString(),
      })
      .eq("id", action.id);
    if (error) throw reconciliationError("update", error);
    updated += 1;
  }

  return {
    updated,
    removed,
    preserved: plan.preservedSessionIds.length,
  };
}
