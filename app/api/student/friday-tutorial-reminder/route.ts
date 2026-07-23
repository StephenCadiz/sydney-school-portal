import { NextRequest, NextResponse } from "next/server";

import { supabaseAdmin } from "../../../../lib/supabaseAdmin";

type ReminderStage = "monday" | "thursday";

type ReminderSession = {
  id: string;
  session_date: string;
  level: string;
  activity_type: string;
  exam_part: string | null;
};

type ReminderContext = {
  studentId: string;
  stage: ReminderStage;
  fridayDate: string;
  level: string;
  sessions: ReminderSession[];
};

const eligibleLevels = new Set(["B1", "B2", "C1", "C2"]);
const eligibleCourseTypes = new Set(["regular", "intensive", "express"]);
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function jsonError(error: string, status: number) {
  return NextResponse.json({ error }, { status });
}

function formatError(error: any) {
  return [
    error?.message,
    error?.details,
    error?.hint,
    error?.code,
  ].filter(Boolean).join(" ") || String(error || "Unknown error");
}

function getBearerToken(request: NextRequest) {
  const authorization = request.headers.get("authorization") || "";
  return authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
}

function normalizeLevel(value: unknown) {
  return String(value ?? "").trim().toUpperCase();
}

function normalizeCourseType(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function getMadridCalendarParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Madrid",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "long",
  }).formatToParts(date);
  const values = Object.fromEntries(
    parts.map((part) => [part.type, part.value])
  );

  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    weekday: values.weekday || "",
  };
}

function addDaysToDateOnly(
  year: number,
  month: number,
  day: number,
  daysToAdd: number
) {
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + daysToAdd);

  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0"),
  ].join("-");
}

function getCurrentReminderWindow(date = new Date()) {
  const madrid = getMadridCalendarParts(date);
  const schedule: Record<string, { stage: ReminderStage; daysToFriday: number }> = {
    Monday: { stage: "monday", daysToFriday: 4 },
    Tuesday: { stage: "monday", daysToFriday: 3 },
    Wednesday: { stage: "monday", daysToFriday: 2 },
    Thursday: { stage: "thursday", daysToFriday: 1 },
  };
  const current = schedule[madrid.weekday];

  if (!current) return null;

  return {
    stage: current.stage,
    fridayDate: addDaysToDateOnly(
      madrid.year,
      madrid.month,
      madrid.day,
      current.daysToFriday
    ),
  };
}

async function authenticateStudent(request: NextRequest) {
  const token = getBearerToken(request);
  if (!token) {
    return {
      studentId: "",
      response: jsonError("Authentication required.", 401),
    };
  }

  const { data: authData, error: authError } =
    await supabaseAdmin.auth.getUser(token);

  if (authError || !authData.user) {
    console.error("Friday tutorial reminder auth failed:", formatError(authError));
    return {
      studentId: "",
      response: jsonError("Invalid authentication token.", 401),
    };
  }

  const { data: profile, error: profileError } = await supabaseAdmin
    .from("profiles")
    .select("id, role")
    .eq("id", authData.user.id)
    .single();

  if (profileError || profile?.role !== "student") {
    console.error(
      "Friday tutorial reminder profile verification failed:",
      formatError(profileError)
    );
    return {
      studentId: "",
      response: jsonError("Student access required.", 403),
    };
  }

  return { studentId: authData.user.id, response: null };
}

async function resolveReminderContext(
  studentId: string
): Promise<ReminderContext | null> {
  const window = getCurrentReminderWindow();
  if (!window) return null;

  const { data: enrolments, error: enrolmentError } = await supabaseAdmin
    .from("class_enrolments")
    .select("class_id")
    .eq("student_id", studentId);

  if (enrolmentError) throw enrolmentError;

  const classIds = Array.from(
    new Set((enrolments || []).map((row) => String(row.class_id || "")).filter(Boolean))
  );
  if (classIds.length !== 1) return null;

  const { data: classes, error: classError } = await supabaseAdmin
    .from("classes")
    .select("id, level_id, is_cambridge, course_type")
    .in("id", classIds);

  if (classError) throw classError;
  if (!classes || classes.length !== 1) return null;

  const classRow = classes[0];
  if (classRow.is_cambridge !== true) return null;

  const courseType = normalizeCourseType(classRow.course_type);
  if (!eligibleCourseTypes.has(courseType)) return null;

  const levelId = String(classRow.level_id || "");
  if (!levelId) return null;

  const { data: levelRow, error: levelError } = await supabaseAdmin
    .from("levels")
    .select("name")
    .eq("id", levelId)
    .single();

  if (levelError) throw levelError;

  const level = normalizeLevel(levelRow?.name);
  if (!eligibleLevels.has(level)) return null;

  const { data: sessionRows, error: sessionError } = await supabaseAdmin
    .from("friday_exam_practice_sessions")
    .select("id, session_date, level_name, activity_type, exam_part")
    .eq("active", true)
    .eq("session_date", window.fridayDate)
    .ilike("level_name", level)
    .order("activity_type", { ascending: true })
    .order("exam_part", { ascending: true });

  if (sessionError) throw sessionError;

  const sessions: ReminderSession[] = (sessionRows || [])
    .filter((session) =>
      eligibleLevels.has(normalizeLevel(session.level_name)) &&
      normalizeLevel(session.level_name) === level
    )
    .map((session) => ({
      id: String(session.id),
      session_date: String(session.session_date || ""),
      level,
      activity_type: String(session.activity_type || "").trim(),
      exam_part: session.exam_part
        ? String(session.exam_part).trim()
        : null,
    }));

  if (sessions.length === 0) return null;

  return {
    studentId,
    stage: window.stage,
    fridayDate: window.fridayDate,
    level,
    sessions,
  };
}

export async function GET(request: NextRequest) {
  const auth = await authenticateStudent(request);
  if (auth.response) return auth.response;

  try {
    const context = await resolveReminderContext(auth.studentId);
    if (!context) return NextResponse.json({ reminder: null });

    const sessionIds = context.sessions.map((session) => session.id);
    const { data: dismissals, error: dismissalError } = await supabaseAdmin
      .from("friday_tutorial_reminder_reads")
      .select("session_id")
      .eq("student_id", context.studentId)
      .eq("reminder_stage", context.stage)
      .in("session_id", sessionIds);

    if (dismissalError) throw dismissalError;

    const dismissedIds = new Set(
      (dismissals || []).map((row) => String(row.session_id))
    );
    const sessions = context.sessions.filter(
      (session) => !dismissedIds.has(session.id)
    );

    if (sessions.length === 0) {
      return NextResponse.json({ reminder: null });
    }

    return NextResponse.json({
      reminder: {
        stage: context.stage,
        heading:
          context.stage === "thursday"
            ? "Friday Tutorial tomorrow"
            : "Friday Tutorial this week",
        fridayDate: context.fridayDate,
        level: context.level,
        sessions,
      },
    });
  } catch (error) {
    console.error("Friday tutorial reminder GET failed:", formatError(error));
    return jsonError("Unable to load Friday Tutorial reminder.", 500);
  }
}

export async function POST(request: NextRequest) {
  const auth = await authenticateStudent(request);
  if (auth.response) return auth.response;

  try {
    const body = await request.json().catch(() => ({}));
    const requestedStage = String(body?.stage || "");
    const requestedSessionIds: string[] = Array.from(
      new Set<string>(
        (Array.isArray(body?.sessionIds) ? body.sessionIds : ([] as unknown[]))
          .map((value: unknown) => String(value || "").trim())
          .filter((value: string) => uuidPattern.test(value))
      )
    );
    const context = await resolveReminderContext(auth.studentId);

    if (!context) {
      return jsonError("This reminder is no longer available.", 409);
    }

    if (requestedStage !== context.stage) {
      return jsonError("The reminder stage is no longer current.", 409);
    }

    if (requestedSessionIds.length === 0) {
      return jsonError("No valid reminder sessions were supplied.", 400);
    }

    const eligibleIds = new Set(context.sessions.map((session) => session.id));
    if (requestedSessionIds.some((id) => !eligibleIds.has(id))) {
      return jsonError("One or more reminder sessions are not eligible.", 403);
    }

    const dismissedAt = new Date().toISOString();
    const rows = requestedSessionIds.map((sessionId) => ({
      student_id: context.studentId,
      session_id: sessionId,
      reminder_stage: context.stage,
      dismissed_at: dismissedAt,
    }));
    const { error: upsertError } = await supabaseAdmin
      .from("friday_tutorial_reminder_reads")
      .upsert(rows, {
        onConflict: "student_id,session_id,reminder_stage",
      });

    if (upsertError) throw upsertError;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Friday tutorial reminder POST failed:", formatError(error));
    return jsonError("Unable to dismiss Friday Tutorial reminder.", 500);
  }
}
