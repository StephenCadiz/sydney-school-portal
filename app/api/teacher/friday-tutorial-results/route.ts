import { NextRequest, NextResponse } from "next/server";

import { supabaseAdmin } from "../../../../lib/supabaseAdmin";
import {
  formatFridayTutorialPracticeKey,
  formatFridayTutorialPracticeLabel,
  isFridayTutorialCambridgeLevel,
  normalizeCambridgeLevel,
  normalizeFridayTutorialPercentage,
  type FridayTutorialResultSheet,
  type FridayTutorialTeacherSheetStudentRow,
} from "../../../../lib/fridayTutorialResults";

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

function formatError(error: any) {
  if (!error) {
    return "Unknown error.";
  }

  return [
    error.message ? `Message: ${error.message}` : "",
    error.details ? `Details: ${error.details}` : "",
    error.hint ? `Hint: ${error.hint}` : "",
    error.code ? `Code: ${error.code}` : "",
  ]
    .filter(Boolean)
    .join("\n") || String(error);
}

function getBearerToken(request: NextRequest) {
  const authorization = request.headers.get("authorization");

  return authorization?.startsWith("Bearer ")
    ? authorization.replace("Bearer ", "")
    : "";
}

function getMadridDateString(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Madrid",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value || "";
  const month = parts.find((part) => part.type === "month")?.value || "";
  const day = parts.find((part) => part.type === "day")?.value || "";

  return `${year}-${month}-${day}`;
}

function getStudentName(profile: any) {
  return `${profile?.first_name || ""} ${profile?.last_name || ""}`.trim();
}

function sortStudentRows<T extends { first_name: string; last_name: string }>(
  rows: T[]
) {
  return [...rows].sort((first, second) => {
    const lastNameComparison = first.last_name.localeCompare(
      second.last_name,
      undefined,
      { sensitivity: "base" }
    );

    if (lastNameComparison !== 0) {
      return lastNameComparison;
    }

    return first.first_name.localeCompare(second.first_name, undefined, {
      sensitivity: "base",
    });
  });
}

async function getAuthenticatedActor(request: NextRequest) {
  const token = getBearerToken(request);

  if (!token) {
    return {
      user: null,
      role: "",
      response: jsonError("Missing authorization token.", 401),
    };
  }

  const {
    data: { user },
    error: userError,
  } = await supabaseAdmin.auth.getUser(token);

  if (userError || !user) {
    console.error("Friday tutorial result auth failed:", formatError(userError));
    return {
      user: null,
      role: "",
      response: jsonError("Invalid authorization token.", 401),
    };
  }

  const { data: profile, error: profileError } = await supabaseAdmin
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profileError || !profile?.role) {
    console.error(
      "Friday tutorial result profile lookup failed:",
      formatError(profileError)
    );
    return {
      user: null,
      role: "",
      response: jsonError("Unable to verify user profile.", 500),
    };
  }

  if (profile.role !== "teacher" && profile.role !== "admin") {
    return {
      user: null,
      role: profile.role,
      response: jsonError("Only teachers and admins can manage tutorial results.", 403),
    };
  }

  return {
    user,
    role: profile.role,
    response: null,
  };
}

async function getClassContext(classId: string) {
  const { data: classRow, error: classError } = await supabaseAdmin
    .from("classes")
    .select("id, teacher_id, level_id, is_cambridge")
    .eq("id", classId)
    .single();

  if (classError || !classRow) {
    return {
      classRow: null,
      levelName: "",
      response: jsonError("Class was not found.", 404),
    };
  }

  const { data: level, error: levelError } = await supabaseAdmin
    .from("levels")
    .select("id, name")
    .eq("id", classRow.level_id)
    .single();

  if (levelError || !level) {
    console.error(
      "Friday tutorial result level lookup failed:",
      formatError(levelError)
    );
    return {
      classRow: null,
      levelName: "",
      response: jsonError("Unable to verify the class level.", 500),
    };
  }

  const levelName = normalizeCambridgeLevel(level.name);

  if (classRow.is_cambridge !== true || !isFridayTutorialCambridgeLevel(levelName)) {
    return {
      classRow: null,
      levelName,
      response: jsonError(
        "Friday @ 6 tutorial results are only available for Cambridge B1, B2, C1 and C2 classes.",
        400
      ),
    };
  }

  return {
    classRow,
    levelName,
    response: null,
  };
}

function verifyClassAccess(
  actorId: string,
  role: string,
  classRow: any
) {
  if (role === "admin") {
    return null;
  }

  if (String(classRow.teacher_id || "") !== actorId) {
    return jsonError("You can only manage results for your own classes.", 403);
  }

  return null;
}

function sanitizeSession(
  session: any,
  todayMadrid: string,
  sheet?: FridayTutorialResultSheet | null
) {
  const practiceKey = formatFridayTutorialPracticeKey(
    session.level_name,
    session.activity_type,
    session.exam_part
  );
  const practiceLabel = formatFridayTutorialPracticeLabel(
    session.level_name,
    session.activity_type,
    session.exam_part
  );
  const sessionDate = String(session.session_date || "");

  return {
    id: session.id,
    session_date: sessionDate,
    level_name: normalizeCambridgeLevel(session.level_name),
    activity_type: session.activity_type || "",
    exam_part: session.exam_part || null,
    pdf_url: session.pdf_url || null,
    audio_url: session.audio_url || null,
    note: session.note || null,
    active: session.active !== false,
    result_sheet_id: sheet?.id || null,
    results_submitted: Boolean(sheet?.id),
    sheet_submitted_at: sheet?.submitted_at || null,
    sheet_updated_at: sheet?.updated_at || null,
    is_future: sessionDate > todayMadrid,
    practice_key: practiceKey,
    practice_label: practiceLabel,
  };
}

async function getMatchingSessions(levelName: string) {
  const { data, error } = await supabaseAdmin
    .from("friday_exam_practice_sessions")
    .select(
      "id, session_date, level_name, activity_type, exam_part, pdf_url, audio_url, note, active"
    )
    .eq("active", true)
    .order("session_date", { ascending: false })
    .order("level_name", { ascending: true });

  if (error) {
    console.error("Friday tutorial sessions load failed:", formatError(error));
    throw new Error("Unable to load Friday @ 6 sessions.");
  }

  return (data || []).filter(
    (session) => normalizeCambridgeLevel(session.level_name) === levelName
  );
}

async function getResultSheetsForClass(sessionIds: string[], classId: string) {
  if (sessionIds.length === 0) {
    return new Map<string, FridayTutorialResultSheet>();
  }

  const { data, error } = await supabaseAdmin
    .from("friday_tutorial_result_sheets")
    .select(
      "id, tutorial_session_id, class_id, submitted_at, submitted_by, updated_at, updated_by"
    )
    .eq("class_id", classId)
    .in("tutorial_session_id", sessionIds);

  if (error) {
    console.error("Friday tutorial sheet load failed:", formatError(error));
    throw new Error("Unable to load submitted result sheets.");
  }

  return new Map(
    ((data || []) as FridayTutorialResultSheet[]).map((sheet) => [
      String(sheet.tutorial_session_id),
      sheet,
    ])
  );
}

async function getResultSheetForSession(
  tutorialSessionId: string,
  classId: string
) {
  const { data, error } = await supabaseAdmin
    .from("friday_tutorial_result_sheets")
    .select(
      "id, tutorial_session_id, class_id, submitted_at, submitted_by, updated_at, updated_by"
    )
    .eq("tutorial_session_id", tutorialSessionId)
    .eq("class_id", classId)
    .maybeSingle();

  if (error) {
    console.error("Friday tutorial sheet lookup failed:", formatError(error));
    throw new Error("Unable to load the submitted result sheet.");
  }

  return (data || null) as FridayTutorialResultSheet | null;
}

async function getStudentProfiles(studentIds: string[]) {
  if (studentIds.length === 0) {
    return [];
  }

  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("id, first_name, last_name, role")
    .in("id", studentIds)
    .eq("role", "student");

  if (error) {
    console.error("Friday tutorial student profile load failed:", formatError(error));
    throw new Error("Unable to load student details.");
  }

  return data || [];
}

async function getCurrentEligibleStudentRows(
  classId: string,
  sessionDate: string
): Promise<FridayTutorialTeacherSheetStudentRow[]> {
  const { data: enrolments, error } = await supabaseAdmin
    .from("class_enrolments")
    .select("student_id, enrolled_at")
    .eq("class_id", classId)
    .lte("enrolled_at", sessionDate);

  if (error) {
    console.error("Friday tutorial enrolment load failed:", formatError(error));
    throw new Error("Unable to load class enrolments.");
  }

  const studentIds = Array.from(
    new Set((enrolments || []).map((enrolment) => enrolment.student_id).filter(Boolean))
  );
  const profiles = await getStudentProfiles(studentIds);

  return sortStudentRows(
    profiles.map((profile) => ({
      student_id: profile.id,
      first_name: profile.first_name || "",
      last_name: profile.last_name || "",
      percentage: null,
      attended: false,
      saved_result_id: null,
      result_updated_at: null,
    }))
  );
}

async function getSavedResultStudentRows(
  resultSheetId: string
): Promise<FridayTutorialTeacherSheetStudentRow[]> {
  const { data: results, error } = await supabaseAdmin
    .from("friday_tutorial_results")
    .select("id, student_id, percentage, attended, updated_at")
    .eq("result_sheet_id", resultSheetId)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("Friday tutorial saved result load failed:", formatError(error));
    throw new Error("Unable to load saved tutorial results.");
  }

  if (!results || results.length === 0) {
    return [];
  }

  const profiles = await getStudentProfiles(
    results.map((result) => result.student_id).filter(Boolean)
  );
  const profileById = new Map(profiles.map((profile) => [profile.id, profile]));

  return sortStudentRows(
    results.map((result) => {
      const profile = profileById.get(result.student_id);
      const [firstName, ...lastNameParts] = getStudentName(profile).split(" ");

      return {
        student_id: result.student_id,
        first_name: profile?.first_name || firstName || "",
        last_name: profile?.last_name || lastNameParts.join(" ") || "",
        percentage:
          result.percentage === null || result.percentage === undefined
            ? null
            : Number(result.percentage),
        attended: result.attended === true,
        saved_result_id: result.id,
        result_updated_at: result.updated_at || null,
      };
    })
  );
}

async function verifyCurrentStudentEnrolment(
  classId: string,
  studentId: string
) {
  const [{ data: enrolment, error: enrolmentError }, { data: profile, error: profileError }] =
    await Promise.all([
      supabaseAdmin
        .from("class_enrolments")
        .select("student_id, enrolled_at")
        .eq("class_id", classId)
        .eq("student_id", studentId)
        .limit(1)
        .maybeSingle(),
      supabaseAdmin
        .from("profiles")
        .select("id, role")
        .eq("id", studentId)
        .maybeSingle(),
    ]);

  if (enrolmentError || profileError) {
    console.error(
      "Friday tutorial student enrolment verification failed:",
      formatError(enrolmentError || profileError)
    );
    throw new Error("Unable to verify the selected student.");
  }

  return enrolment && profile?.role === "student" ? enrolment : null;
}

async function getStudentWorkspaceSessions(
  sessions: any[],
  sheetBySessionId: Map<string, FridayTutorialResultSheet>,
  studentId: string,
  todayMadrid: string
) {
  const sheetIds = Array.from(sheetBySessionId.values()).map((sheet) => sheet.id);
  const { data: savedResults, error: savedResultsError } =
    sheetIds.length > 0
      ? await supabaseAdmin
          .from("friday_tutorial_results")
          .select("id, result_sheet_id, percentage, attended, updated_at")
          .eq("student_id", studentId)
          .in("result_sheet_id", sheetIds)
      : { data: [], error: null };

  if (savedResultsError) {
    console.error(
      "Friday tutorial student history load failed:",
      formatError(savedResultsError)
    );
    throw new Error("Unable to load the student's tutorial history.");
  }

  const resultBySheetId = new Map(
    (savedResults || []).map((result) => [String(result.result_sheet_id), result])
  );

  return sessions.map((session) => {
    const sessionId = String(session.id);
    const sheet = sheetBySessionId.get(sessionId) || null;
    const result = sheet ? resultBySheetId.get(String(sheet.id)) || null : null;

    return {
      ...sanitizeSession(session, todayMadrid, sheet),
      result: result
        ? {
            id: result.id,
            percentage:
              result.percentage === null ? null : Number(result.percentage),
            attended: result.attended === true,
            updated_at: result.updated_at || null,
          }
        : null,
    };
  });
}

async function getCurrentClassStudentIds(classId: string) {
  const { data: enrolments, error: enrolmentError } = await supabaseAdmin
    .from("class_enrolments")
    .select("student_id")
    .eq("class_id", classId);
  if (enrolmentError) {
    console.error(
      "Friday tutorial current class enrolment load failed:",
      formatError(enrolmentError)
    );
    throw new Error("Unable to load current class enrolments.");
  }

  const ids = Array.from(
    new Set(
      (enrolments || []).map((row) => String(row.student_id || "")).filter(Boolean)
    )
  );
  if (ids.length === 0) return [];

  const { data: profiles, error: profileError } = await supabaseAdmin
    .from("profiles")
    .select("id")
    .in("id", ids)
    .eq("role", "student");
  if (profileError) {
    console.error(
      "Friday tutorial current student profile load failed:",
      formatError(profileError)
    );
    throw new Error("Unable to load current class students.");
  }

  return (profiles || []).map((profile) => String(profile.id));
}

function normalizePostResults(results: any) {
  if (!Array.isArray(results)) {
    return {
      error: "Please submit a complete result sheet.",
      results: [],
    };
  }

  const normalizedResults = [];

  for (const row of results) {
    const studentId = String(row?.student_id || "").trim();
    const percentage = normalizeFridayTutorialPercentage(row?.percentage);

    if (!studentId) {
      return {
        error: "Every submitted result row must include a student.",
        results: [],
      };
    }

    if (percentage.error) {
      return {
        error: percentage.error,
        results: [],
      };
    }

    normalizedResults.push({
      student_id: studentId,
      percentage: percentage.value,
    });
  }

  return {
    error: "",
    results: normalizedResults,
  };
}

function friendlyRpcMessage(error: any) {
  const message = String(error?.message || "");

  const messages: Record<string, string> = {
    unauthorized: "You are not allowed to save these results.",
    class_not_found: "Class was not found.",
    class_not_cambridge: "Friday @ 6 results are only available for Cambridge classes.",
    unsupported_class_level:
      "Friday @ 6 results are only available for Cambridge B1, B2, C1 and C2 classes.",
    teacher_not_assigned_to_class: "You can only save results for your own classes.",
    session_not_found: "Friday @ 6 session was not found.",
    inactive_session: "This Friday @ 6 session is inactive.",
    future_session: "Future Friday @ 6 sessions cannot be submitted yet.",
    session_level_mismatch: "This session does not match the selected class level.",
    invalid_results_payload: "Please submit a valid result sheet.",
    percentage_out_of_range: "Percentages must be between 0 and 100.",
    duplicate_students: "Each student can appear only once in the result sheet.",
    no_eligible_students: "No eligible students were found for this class and session.",
    submitted_student_count_mismatch:
      "The submitted result sheet does not match the expected class list.",
    unexpected_students:
      "The submitted result sheet contains a student who is not eligible for this session.",
    missing_students: "The submitted result sheet is missing one or more eligible students.",
  };

  return messages[message] || "Unable to save Friday @ 6 tutorial results.";
}

export async function GET(request: NextRequest) {
  try {
    const { user, role, response } = await getAuthenticatedActor(request);

    if (response || !user) {
      return response;
    }

    const { searchParams } = new URL(request.url);
    const classId = String(searchParams.get("class_id") || "").trim();
    const tutorialSessionId = String(
      searchParams.get("tutorial_session_id") || ""
    ).trim();
    const studentId = String(searchParams.get("student_id") || "").trim();

    if (!classId) {
      return jsonError("Class is required.", 400);
    }

    const classContext = await getClassContext(classId);

    if (classContext.response || !classContext.classRow) {
      return classContext.response;
    }

    const accessResponse = verifyClassAccess(user.id, role, classContext.classRow);

    if (accessResponse) {
      return accessResponse;
    }

    const todayMadrid = getMadridDateString();
    const sessions = await getMatchingSessions(classContext.levelName);
    const sheetBySessionId = await getResultSheetsForClass(
      sessions.map((session) => session.id).filter(Boolean),
      classId
    );
    const sanitizedSessions = sessions.map((session) =>
      sanitizeSession(
        session,
        todayMadrid,
        sheetBySessionId.get(String(session.id)) || null
      )
    );

    if (studentId) {
      const enrolment = await verifyCurrentStudentEnrolment(classId, studentId);
      if (!enrolment) {
        return jsonError(
          "The selected student is not enrolled in this class.",
          403
        );
      }

      return NextResponse.json({
        sessions: await getStudentWorkspaceSessions(
          sessions,
          sheetBySessionId,
          studentId,
          todayMadrid
        ),
      });
    }

    if (!tutorialSessionId) {
      return NextResponse.json({
        sessions: sanitizedSessions,
        students: [],
      });
    }

    const selectedSession = sessions.find(
      (session) => String(session.id) === tutorialSessionId
    );

    if (!selectedSession) {
      return jsonError("Friday @ 6 session was not found for this class level.", 404);
    }

    const selectedSheet =
      sheetBySessionId.get(tutorialSessionId) ||
      (await getResultSheetForSession(tutorialSessionId, classId));
    const savedRows = selectedSheet
      ? await getSavedResultStudentRows(selectedSheet.id)
      : [];
    const students =
      savedRows.length > 0
        ? savedRows
        : await getCurrentEligibleStudentRows(
            classId,
            String(selectedSession.session_date || "")
          );

    return NextResponse.json({
      sessions: sanitizedSessions,
      selected_session: sanitizeSession(
        selectedSession,
        todayMadrid,
        selectedSheet
      ),
      result_sheet: selectedSheet,
      students,
      snapshot_locked: Boolean(selectedSheet),
    });
  } catch (error: any) {
    console.error("Friday tutorial result GET failed:", formatError(error));
    return jsonError("Unable to load Friday @ 6 tutorial results.", 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    const { user, role, response } = await getAuthenticatedActor(request);

    if (response || !user) {
      return response;
    }

    const body = await request.json();
    const tutorialSessionId = String(body?.tutorial_session_id || "").trim();
    const classId = String(body?.class_id || "").trim();
    const studentId = String(body?.student_id || "").trim();

    if (!tutorialSessionId || !classId) {
      return jsonError("Session and class are required.", 400);
    }

    const classContext = await getClassContext(classId);

    if (classContext.response || !classContext.classRow) {
      return classContext.response;
    }

    const accessResponse = verifyClassAccess(user.id, role, classContext.classRow);

    if (accessResponse) {
      return accessResponse;
    }

    if (studentId) {
      if (
        typeof body?.percentage !== "number" ||
        !Number.isFinite(body.percentage) ||
        body.percentage < 0 ||
        body.percentage > 100
      ) {
        return jsonError("Percentage must be a number between 0 and 100.", 400);
      }

      const enrolment = await verifyCurrentStudentEnrolment(classId, studentId);
      if (!enrolment) {
        return jsonError(
          "The selected student is not enrolled in this class.",
          403
        );
      }

      const sessions = await getMatchingSessions(classContext.levelName);
      const selectedSession = sessions.find(
        (session) => String(session.id) === tutorialSessionId
      );
      if (!selectedSession) {
        return jsonError(
          "Friday @ 6 session was not found for this class level.",
          404
        );
      }
      if (String(selectedSession.session_date || "") > getMadridDateString()) {
        return jsonError("Future Friday @ 6 sessions cannot be graded.", 400);
      }

      let selectedSheet = await getResultSheetForSession(
        tutorialSessionId,
        classId
      );

      if (!selectedSheet) {
        const { data: createdSheet, error: createSheetError } =
          await supabaseAdmin
            .from("friday_tutorial_result_sheets")
            .insert({
              tutorial_session_id: tutorialSessionId,
              class_id: classId,
              submitted_by: user.id,
              updated_by: user.id,
            })
            .select(
              "id, tutorial_session_id, class_id, submitted_at, submitted_by, updated_at, updated_by"
            )
            .single();

        if (createSheetError?.code === "23505") {
          selectedSheet = await getResultSheetForSession(
            tutorialSessionId,
            classId
          );
        } else if (createSheetError) {
          console.error(
            "Friday tutorial student result sheet create failed:",
            formatError(createSheetError)
          );
          return jsonError("Unable to save the Friday Tutorial result.", 500);
        } else {
          selectedSheet = createdSheet as FridayTutorialResultSheet;
        }
      }

      if (!selectedSheet) {
        return jsonError("Unable to save the Friday Tutorial result.", 500);
      }

      const currentStudentIds = await getCurrentClassStudentIds(classId);
      const { error: snapshotError } = await supabaseAdmin
        .from("friday_tutorial_results")
        .upsert(
          currentStudentIds.map((currentStudentId) => ({
            result_sheet_id: selectedSheet.id,
            student_id: currentStudentId,
            percentage: null,
            attended: false,
          })),
          {
            onConflict: "result_sheet_id,student_id",
            ignoreDuplicates: true,
          }
        );
      if (snapshotError) {
        console.error(
          "Friday tutorial current class snapshot create failed:",
          formatError(snapshotError)
        );
        return jsonError("Unable to save the Friday Tutorial result.", 500);
      }

      const { data: savedResult, error: savedResultError } =
        await supabaseAdmin
          .from("friday_tutorial_results")
          .upsert(
            {
              result_sheet_id: selectedSheet.id,
              student_id: studentId,
              percentage: body.percentage,
              attended: true,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "result_sheet_id,student_id" }
          )
          .select("id, percentage, attended, updated_at")
          .single();
      if (savedResultError || !savedResult) {
        console.error(
          "Friday tutorial student result save failed:",
          formatError(savedResultError)
        );
        return jsonError("Unable to save the Friday Tutorial result.", 500);
      }

      const { error: sheetUpdateError } = await supabaseAdmin
        .from("friday_tutorial_result_sheets")
        .update({
          updated_at: new Date().toISOString(),
          updated_by: user.id,
        })
        .eq("id", selectedSheet.id);
      if (sheetUpdateError) {
        console.error(
          "Friday tutorial result sheet timestamp update failed:",
          formatError(sheetUpdateError)
        );
      }

      return NextResponse.json({
        success: true,
        result_sheet_id: selectedSheet.id,
        result: {
          id: savedResult.id,
          percentage: Number(savedResult.percentage),
          attended: savedResult.attended === true,
          updated_at: savedResult.updated_at || null,
        },
      });
    }

    const normalized = normalizePostResults(body?.results);

    if (normalized.error) {
      return jsonError(normalized.error, 400);
    }

    const { data, error } = await supabaseAdmin.rpc(
      "save_friday_tutorial_result_sheet",
      {
        p_actor_id: user.id,
        p_tutorial_session_id: tutorialSessionId,
        p_class_id: classId,
        p_results: normalized.results,
      }
    );

    if (error) {
      console.error("Friday tutorial result RPC failed:", formatError(error));
      return jsonError(friendlyRpcMessage(error), 400);
    }

    const result = Array.isArray(data) ? data[0] : data;

    return NextResponse.json({
      success: true,
      result_sheet_id: result?.result_sheet_id || "",
      created_or_updated_count: result?.created_or_updated_count || 0,
      attended_count: result?.attended_count || 0,
      absent_count: result?.absent_count || 0,
      first_submission: result?.first_submission === true,
    });
  } catch (error: any) {
    console.error("Friday tutorial result POST failed:", formatError(error));
    return jsonError("Unable to save Friday @ 6 tutorial results.", 500);
  }
}
