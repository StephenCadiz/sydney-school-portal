import { NextRequest, NextResponse } from "next/server";

import {
  FRIDAY_AT_6_DUTY_LABELS,
  type FridayTutorialSessionType,
  getFridayAt6DutyTypesForTeacher,
  getFridayAt6ResponsibilityLevelLabels,
  getFridayAt6ResponsibilityLevels,
  getFridayTutorialSessionTypeForDate,
  getTutorialGroupLabel,
} from "../../../../lib/fridayTutorials";
import { supabaseAdmin } from "../../../../lib/supabaseAdmin";

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

function logAttendanceError(stage: string, error: unknown) {
  const value = error && typeof error === "object" ? error as Record<string, unknown> : {};
  console.error("Friday Tutorial attendance failure:", {
    stage,
    message: value.message,
    code: value.code,
    details: value.details,
    hint: value.hint,
  });
}

function normalizeLevel(value: unknown) {
  return String(value || "").trim().toUpperCase();
}

function getName(value: any) {
  return `${value?.first_name || ""} ${value?.last_name || ""}`.trim();
}

function getMadridNow(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Madrid",
    weekday: "long",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    date: `${values.year}-${values.month}-${values.day}`,
    weekday: values.weekday,
    minutes: Number(values.hour || 0) * 60 + Number(values.minute || 0),
  };
}

async function requireAssignedTeacher(request: NextRequest) {
  const authorization = request.headers.get("authorization");
  const token = authorization?.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length)
    : "";
  if (!token) return { actorId: "", response: jsonError("Authentication required.", 401) };

  const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(token);
  if (authError || !authData.user) {
    return { actorId: "", response: jsonError("Authentication required.", 401) };
  }
  const { data: profile, error: profileError } = await supabaseAdmin
    .from("profiles")
    .select("role")
    .eq("id", authData.user.id)
    .maybeSingle();
  if (profileError) {
    logAttendanceError("profile", profileError);
    return { actorId: "", response: jsonError("Unable to verify attendance access.", 500) };
  }
  if (profile?.role !== "teacher") {
    return { actorId: "", response: jsonError("Teacher access required.", 403) };
  }
  return { actorId: authData.user.id, response: null };
}

async function getAttendanceContext(request: NextRequest) {
  const actor = await requireAssignedTeacher(request);
  if (actor.response) return { response: actor.response, context: null };

  const now = getMadridNow();
  if (now.weekday !== "Friday") {
    return { response: jsonError("No Friday Tutorial attendance is assigned today.", 404), context: null };
  }

  const { data: duty, error: dutyError } = await supabaseAdmin
    .from("friday_at_6_duties")
    .select("id, session_date, teacher_id, b1_teacher_id, note, active")
    .eq("session_date", now.date)
    .eq("active", true)
    .maybeSingle();
  if (dutyError) {
    logAttendanceError("duty", dutyError);
    return { response: jsonError("Unable to load Friday Tutorial attendance.", 500), context: null };
  }
  if (!duty) {
    return { response: jsonError("Friday Tutorial attendance not found.", 404), context: null };
  }

  const { data: settings, error: settingsError } = await supabaseAdmin
    .from("friday_tutorial_settings")
    .select("first_friday_date, first_session_type")
    .eq("id", 1)
    .maybeSingle();
  if (settingsError) {
    logAttendanceError("settings", settingsError);
    return { response: jsonError("Unable to load Friday Tutorial attendance.", 500), context: null };
  }
  const expectedGroup = getFridayTutorialSessionTypeForDate(
    settings,
    now.date
  );
  if (!expectedGroup) {
    return { response: jsonError("Friday Tutorial attendance not found.", 404), context: null };
  }

  const dutyTypes = getFridayAt6DutyTypesForTeacher(
    duty,
    actor.actorId,
    expectedGroup
  );
  if (dutyTypes.length === 0) {
    return { response: jsonError("Friday Tutorial attendance not found.", 404), context: null };
  }

  const allowedLevels = new Set(
    getFridayAt6ResponsibilityLevels(expectedGroup, dutyTypes)
  );

  return {
    response: null,
    context: {
      actorId: actor.actorId,
      now,
      duty,
      dutyTypes,
      allowedLevels,
      expectedGroup,
      open: now.minutes >= 18 * 60,
    },
  };
}

async function loadEligibleRows(context: any) {
  const { data: session, error: sessionError } = await supabaseAdmin
    .from("friday_tutorial_sessions")
    .select("id, session_date, tutorial_group, start_time, end_time")
    .eq("session_date", context.now.date)
    .eq("tutorial_group", context.expectedGroup)
    .maybeSingle();
  if (sessionError) throw sessionError;
  if (!session) return { session: null, rows: [] };

  const { data: sessionRows, error: rowsError } = await supabaseAdmin
    .from("friday_tutorial_session_students")
    .select("id, tutorial_student_id, student_attended_status")
    .eq("session_id", session.id)
    .order("created_at", { ascending: true });
  if (rowsError) throw rowsError;
  const tutorialIds = (sessionRows || []).map((row) => row.tutorial_student_id).filter(Boolean);
  if (tutorialIds.length === 0) return { session, rows: [] };

  const { data: tutorialStudents, error: studentsError } = await supabaseAdmin
    .from("friday_tutorial_students")
    .select("id, class_id, profile_student_id, young_learner_id, tutorial_group")
    .in("id", tutorialIds);
  if (studentsError) throw studentsError;
  const classIds = Array.from(new Set((tutorialStudents || []).map((row) => row.class_id).filter(Boolean)));
  const { data: classes, error: classesError } = classIds.length
    ? await supabaseAdmin.from("classes").select("id, level_id").in("id", classIds)
    : { data: [], error: null };
  if (classesError) throw classesError;
  const levelIds = Array.from(new Set((classes || []).map((row) => row.level_id).filter(Boolean)));
  const { data: levels, error: levelsError } = levelIds.length
    ? await supabaseAdmin.from("levels").select("id, name").in("id", levelIds)
    : { data: [], error: null };
  if (levelsError) throw levelsError;

  const profileIds = (tutorialStudents || []).map((row) => row.profile_student_id).filter(Boolean);
  const learnerIds = (tutorialStudents || []).map((row) => row.young_learner_id).filter(Boolean);
  const [{ data: profiles, error: profilesError }, { data: learners, error: learnersError }] =
    await Promise.all([
      profileIds.length
        ? supabaseAdmin.from("profiles").select("id, first_name, last_name").in("id", profileIds)
        : Promise.resolve({ data: [], error: null }),
      learnerIds.length
        ? supabaseAdmin.from("young_learners").select("id, first_name, last_name").in("id", learnerIds)
        : Promise.resolve({ data: [], error: null }),
    ]);
  if (profilesError || learnersError) throw profilesError || learnersError;

  const studentMap = new Map((tutorialStudents || []).map((row) => [row.id, row]));
  const classMap = new Map((classes || []).map((row) => [row.id, row]));
  const levelMap = new Map((levels || []).map((row) => [row.id, row]));
  const profileMap = new Map((profiles || []).map((row) => [row.id, row]));
  const learnerMap = new Map((learners || []).map((row) => [row.id, row]));

  const rows = (sessionRows || []).flatMap((row) => {
    const student: any = studentMap.get(row.tutorial_student_id);
    const classRow: any = classMap.get(student?.class_id);
    const level: any = levelMap.get(classRow?.level_id);
    const levelName = normalizeLevel(level?.name);
    if (
      !student ||
      student.tutorial_group !== context.expectedGroup ||
      !context.allowedLevels.has(levelName)
    ) return [];
    const identity = student.profile_student_id
      ? profileMap.get(student.profile_student_id)
      : learnerMap.get(student.young_learner_id);
    return [{
      session_student_id: row.id,
      student_name: getName(identity) || "Unknown student",
      level_name: level?.name || levelName,
      student_attended_status: row.student_attended_status || "choose",
    }];
  });
  return { session, rows };
}

export async function GET(request: NextRequest) {
  try {
    const access = await getAttendanceContext(request);
    if (access.response || !access.context) return access.response;
    const loaded = access.context.open
      ? await loadEligibleRows(access.context)
      : { session: null, rows: [] };
    return NextResponse.json({
      attendance: {
        session_date: access.context.now.date,
        tutorial_group: access.context.expectedGroup,
        tutorial_group_label: getTutorialGroupLabel(
          access.context.expectedGroup
        ),
        duty_types: access.context.dutyTypes,
        duty_labels: access.context.dutyTypes.map(
          (dutyType: keyof typeof FRIDAY_AT_6_DUTY_LABELS) =>
            FRIDAY_AT_6_DUTY_LABELS[dutyType]
        ),
        responsibility_levels: getFridayAt6ResponsibilityLevelLabels(
          access.context.expectedGroup as FridayTutorialSessionType,
          access.context.dutyTypes
        ),
        note: access.context.duty.note || null,
        start_time: loaded.session?.start_time || "18:00",
        end_time: loaded.session?.end_time || "19:00",
        open: access.context.open,
        students: loaded.rows,
      },
    });
  } catch (error) {
    logAttendanceError("get", error);
    return jsonError("Unable to load Friday Tutorial attendance.", 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    const access = await getAttendanceContext(request);
    if (access.response || !access.context) return access.response;
    if (!access.context.open) return jsonError("Friday Tutorial attendance opens at 18:00.", 403);
    const body = await request.json().catch(() => null);
    const submitted = Array.isArray(body?.attendance) ? body.attendance : null;
    if (!submitted) return jsonError("Submit valid Friday Tutorial attendance.", 422);

    const loaded = await loadEligibleRows(access.context);
    if (!loaded.session) return jsonError("Friday Tutorial attendance not found.", 404);
    const sessionId = loaded.session.id;
    const eligibleIds = new Set(loaded.rows.map((row: any) => row.session_student_id));
    const submittedIds = new Set<string>();
    for (const item of submitted) {
      const id = String(item?.session_student_id || "");
      const status = String(item?.student_attended_status || "");
      if (!eligibleIds.has(id) || submittedIds.has(id) || !["yes", "no"].includes(status)) {
        return jsonError("The submitted attendance contains an invalid student or value.", 422);
      }
      submittedIds.add(id);
    }
    if (submittedIds.size !== eligibleIds.size) {
      return jsonError("Record Yes or No for every eligible student.", 422);
    }

    const savedAt = new Date().toISOString();
    const updates = await Promise.all(submitted.map((item: any) =>
      supabaseAdmin
        .from("friday_tutorial_session_students")
        .update({ student_attended_status: item.student_attended_status, updated_at: savedAt })
        .eq("id", item.session_student_id)
        .eq("session_id", sessionId)
        .select("id, student_attended_status")
        .single()
    ));
    const failed = updates.find((result) => result.error);
    if (failed?.error) {
      logAttendanceError("save", failed.error);
      return jsonError("Unable to save Friday Tutorial attendance.", 500);
    }
    return NextResponse.json({
      attendance: updates.map((result) => ({
        session_student_id: result.data?.id,
        student_attended_status: result.data?.student_attended_status,
      })),
    });
  } catch (error) {
    logAttendanceError("post", error);
    return jsonError("Unable to save Friday Tutorial attendance.", 500);
  }
}
