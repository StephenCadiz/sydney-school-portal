import { NextRequest, NextResponse } from "next/server";

import { supabaseAdmin } from "../../../lib/supabaseAdmin";
import {
  buildFridayTutorialProgressSummary,
  getEmptyFridayTutorialProgressSummary,
  type FridayTutorialProgressSourceRow,
} from "../../../lib/fridayTutorialResults";

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

function formatError(error: any) {
  if (!error) {
    return "Unknown error.";
  }

  return (
    [
      error.message ? `Message: ${error.message}` : "",
      error.details ? `Details: ${error.details}` : "",
      error.hint ? `Hint: ${error.hint}` : "",
      error.code ? `Code: ${error.code}` : "",
    ]
      .filter(Boolean)
      .join("\n") || String(error)
  );
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

async function getAuthenticatedProfile(request: NextRequest) {
  const token = getBearerToken(request);

  if (!token) {
    return {
      userId: "",
      role: "",
      response: jsonError("Missing authorization token.", 401),
    };
  }

  const {
    data: { user },
    error: userError,
  } = await supabaseAdmin.auth.getUser(token);

  if (userError || !user) {
    console.error("Friday tutorial progress auth failed:", formatError(userError));
    return {
      userId: "",
      role: "",
      response: jsonError("Invalid authorization token.", 401),
    };
  }

  const { data: profile, error: profileError } = await supabaseAdmin
    .from("profiles")
    .select("id, role")
    .eq("id", user.id)
    .single();

  if (profileError || !profile?.role) {
    console.error(
      "Friday tutorial progress profile lookup failed:",
      formatError(profileError)
    );
    return {
      userId: "",
      role: "",
      response: jsonError("Unable to verify user profile.", 403),
    };
  }

  return {
    userId: user.id,
    role: profile.role,
    response: null,
  };
}

async function resolveTargetStudentId(
  request: NextRequest,
  userId: string,
  role: string
) {
  const { searchParams } = new URL(request.url);
  const requestedStudentId = String(searchParams.get("student_id") || "").trim();

  if (role === "teacher") {
    return {
      studentId: "",
      response: jsonError("Teachers cannot access this progress endpoint.", 403),
    };
  }

  if (role === "student") {
    if (requestedStudentId && requestedStudentId !== userId) {
      return {
        studentId: "",
        response: jsonError("Students can only view their own progress.", 403),
      };
    }

    return {
      studentId: userId,
      response: null,
    };
  }

  if (role !== "admin") {
    return {
      studentId: "",
      response: jsonError("You are not allowed to view this progress.", 403),
    };
  }

  if (!requestedStudentId) {
    return {
      studentId: "",
      response: jsonError("Student is required.", 400),
    };
  }

  const { data: targetProfile, error } = await supabaseAdmin
    .from("profiles")
    .select("id, role")
    .eq("id", requestedStudentId)
    .eq("role", "student")
    .single();

  if (error || !targetProfile) {
    console.error(
      "Friday tutorial progress target student lookup failed:",
      formatError(error)
    );
    return {
      studentId: "",
      response: jsonError("Student was not found.", 404),
    };
  }

  return {
    studentId: targetProfile.id,
    response: null,
  };
}

async function loadProgressRows(studentId: string) {
  const todayMadrid = getMadridDateString();

  const { data: resultRows, error: resultError } = await supabaseAdmin
    .from("friday_tutorial_results")
    .select("id, result_sheet_id, percentage, attended")
    .eq("student_id", studentId);

  if (resultError) {
    console.error(
      "Friday tutorial progress result load failed:",
      formatError(resultError)
    );
    throw new Error("Unable to load Friday tutorial progress.");
  }

  if (!resultRows || resultRows.length === 0) {
    return [];
  }

  const sheetIds = Array.from(
    new Set(
      resultRows
        .map((result) => String(result.result_sheet_id || "").trim())
        .filter(Boolean)
    )
  );

  const { data: sheets, error: sheetError } =
    sheetIds.length > 0
      ? await supabaseAdmin
          .from("friday_tutorial_result_sheets")
          .select("id, tutorial_session_id")
          .in("id", sheetIds)
      : { data: [], error: null };

  if (sheetError) {
    console.error(
      "Friday tutorial progress sheet load failed:",
      formatError(sheetError)
    );
    throw new Error("Unable to load Friday tutorial progress.");
  }

  const sessionIds = Array.from(
    new Set(
      (sheets || [])
        .map((sheet) => String(sheet.tutorial_session_id || "").trim())
        .filter(Boolean)
    )
  );

  const { data: sessions, error: sessionError } =
    sessionIds.length > 0
      ? await supabaseAdmin
          .from("friday_exam_practice_sessions")
          .select("id, session_date, level_name, activity_type, exam_part, active")
          .in("id", sessionIds)
          .eq("active", true)
          .lte("session_date", todayMadrid)
      : { data: [], error: null };

  if (sessionError) {
    console.error(
      "Friday tutorial progress session load failed:",
      formatError(sessionError)
    );
    throw new Error("Unable to load Friday tutorial progress.");
  }

  const sheetById = new Map((sheets || []).map((sheet) => [sheet.id, sheet]));
  const sessionById = new Map(
    (sessions || []).map((session) => [session.id, session])
  );

  return resultRows
    .map((result) => {
      const sheet = sheetById.get(result.result_sheet_id);
      const session = sheet
        ? sessionById.get(sheet.tutorial_session_id)
        : null;

      if (!sheet || !session) {
        return null;
      }

      return {
        id: result.id,
        result_sheet_id: result.result_sheet_id,
        percentage:
          result.percentage === null || result.percentage === undefined
            ? null
            : Number(result.percentage),
        attended: result.attended === true,
        tutorial_session_id: session.id,
        session_date: session.session_date || "",
        level_name: session.level_name || "",
        activity_type: session.activity_type || "",
        exam_part: session.exam_part || null,
      };
    })
    .filter(Boolean) as FridayTutorialProgressSourceRow[];
}

export async function GET(request: NextRequest) {
  try {
    const { userId, role, response } = await getAuthenticatedProfile(request);

    if (response) {
      return response;
    }

    const target = await resolveTargetStudentId(request, userId, role);

    if (target.response) {
      return target.response;
    }

    const rows = await loadProgressRows(target.studentId);

    return NextResponse.json({
      summary:
        rows.length > 0
          ? buildFridayTutorialProgressSummary(rows)
          : getEmptyFridayTutorialProgressSummary(),
    });
  } catch (error) {
    console.error("Friday tutorial progress API failed:", formatError(error));
    return jsonError("Unable to load Friday tutorial progress.", 500);
  }
}
