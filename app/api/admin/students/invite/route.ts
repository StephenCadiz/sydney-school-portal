import { NextRequest, NextResponse } from "next/server";

import { supabaseAdmin } from "../../../../../lib/supabaseAdmin";

const cambridgeLevelNames = ["B1", "B2", "C1", "C2"];

function normalizeLevelName(levelName: string | null | undefined) {
  return String(levelName || "").trim().toUpperCase();
}

function formatError(error: unknown) {
  if (!error) {
    return "Unknown error object received from Supabase/Auth.";
  }

  const parts: string[] = [];

  if (typeof error === "object") {
    const errorObject = error as {
      message?: unknown;
      details?: unknown;
      hint?: unknown;
      code?: unknown;
    };

    if (errorObject.message) {
      parts.push(`Message: ${String(errorObject.message)}`);
    }

    if (errorObject.details) {
      parts.push(`Details: ${String(errorObject.details)}`);
    }

    if (errorObject.hint) {
      parts.push(`Hint: ${String(errorObject.hint)}`);
    }

    if (errorObject.code) {
      parts.push(`Code: ${String(errorObject.code)}`);
    }

    try {
      const json = JSON.stringify(error);

      if (json && json !== "{}") {
        parts.push(`Raw: ${json}`);
      }
    } catch {
      // Ignore JSON formatting failures and fall back below.
    }
  }

  if (parts.length > 0) {
    return parts.join("\n");
  }

  const stringValue = String(error);

  if (stringValue && stringValue !== "[object Object]") {
    return stringValue;
  }

  return "Unknown error object received from Supabase/Auth.";
}

function getInviteErrorDiagnostics(error: unknown) {
  const fallback =
    "Invitation email could not be sent. Check Supabase Authentication Logs and SMTP settings.";

  if (!error || typeof error !== "object") {
    return {
      details: error ? String(error) : fallback,
      raw: {
        message: error ? String(error) : fallback,
      },
    };
  }

  const errorObject = error as {
    message?: unknown;
    name?: unknown;
    status?: unknown;
    code?: unknown;
    cause?: unknown;
  };

  const raw = {
    message: errorObject.message ? String(errorObject.message) : undefined,
    name: errorObject.name ? String(errorObject.name) : undefined,
    status: errorObject.status,
    code: errorObject.code ? String(errorObject.code) : undefined,
    cause: errorObject.cause ? String(errorObject.cause) : undefined,
  };

  const details = [
    raw.message,
    raw.name ? `Name: ${raw.name}` : null,
    raw.status ? `Status: ${raw.status}` : null,
    raw.code ? `Code: ${raw.code}` : null,
    raw.cause ? `Cause: ${raw.cause}` : null,
    "Check Supabase Authentication Logs and SMTP settings.",
  ]
    .filter(Boolean)
    .join("\n");

  return {
    details: details || fallback,
    raw,
  };
}

function logStepError(label: string, error: unknown) {
  const details = formatError(error);
  console.error(`${label}:`, details);
  return details;
}

function jsonError(message: string, status: number, details?: string) {
  return NextResponse.json(
    {
      error: message,
      ...(details ? { details } : {}),
    },
    {
      status,
    }
  );
}

function jsonInviteEmailError(error: unknown) {
  const diagnostics = getInviteErrorDiagnostics(error);

  return NextResponse.json(
    {
      error: "Invitation email could not be sent.",
      details: diagnostics.details,
      raw: diagnostics.raw,
    },
    {
      status: 500,
    }
  );
}

function getInviteRedirectUrl() {
  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "http://localhost:3000";

  return `${siteUrl.replace(/\/$/, "")}/set-password`;
}

export async function POST(request: NextRequest) {
  try {
    const authorization = request.headers.get("authorization");
    const token = authorization?.startsWith("Bearer ")
      ? authorization.replace("Bearer ", "")
      : "";

    if (!token) {
      return jsonError("Missing authorization token.", 401);
    }

    const {
      data: { user },
      error: userError,
    } = await supabaseAdmin.auth.getUser(token);

    if (userError || !user) {
      const details = logStepError("Admin auth getUser failed", userError);
      return jsonError("Invalid authorization token.", 401, details);
    }

    const { data: profile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (profileError) {
      const details = logStepError(
        "Admin profile lookup failed",
        profileError
      );
      return jsonError("Unable to verify admin user.", 500, details);
    }

    if (profile?.role !== "admin") {
      return jsonError("Only admins can invite students.", 403);
    }

    const body = await request.json();
    const firstName = body.first_name?.trim();
    const lastName = body.last_name?.trim();
    const email = body.email?.trim();
    const classId = body.class_id?.trim();

    if (!firstName || !lastName || !email || !classId) {
      return jsonError(
        "First name, last name, email, and class are required.",
        400
      );
    }

    const { data: existingProfiles, error: existingProfileError } =
      await supabaseAdmin
        .from("profiles")
        .select("id")
        .eq("email", email)
        .limit(1);

    if (existingProfileError) {
      const details = logStepError(
        "Existing profile lookup failed",
        existingProfileError
      );
      return jsonError("Unable to check existing users.", 500, details);
    }

    if (existingProfiles && existingProfiles.length > 0) {
      return jsonError("A user with this email already exists.", 400);
    }

    const { data: classroom, error: classError } = await supabaseAdmin
      .from("classes")
      .select("*")
      .eq("id", classId)
      .single();

    if (classError || !classroom) {
      const details = logStepError("Class lookup failed", classError);
      return jsonError("Selected class was not found.", 404, details);
    }

    if (classroom.is_cambridge !== true) {
      return jsonError("Selected class is not a Cambridge class.", 400);
    }

    const { data: level, error: levelError } = await supabaseAdmin
      .from("levels")
      .select("name")
      .eq("id", classroom.level_id)
      .single();

    if (levelError || !level?.name) {
      const details = logStepError("Class level lookup failed", levelError);
      return jsonError(
        "Unable to verify selected class level.",
        500,
        details
      );
    }

    if (!cambridgeLevelNames.includes(normalizeLevelName(level.name))) {
      return jsonError("Selected class is not a Cambridge class.", 400);
    }

    const { data: inviteData, error: inviteError } =
      await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
        redirectTo: getInviteRedirectUrl(),
      });

    if (inviteError || !inviteData.user) {
      const diagnostics = getInviteErrorDiagnostics(inviteError);
      console.error("inviteUserByEmail failed:", diagnostics);
      return jsonInviteEmailError(inviteError);
    }

    const studentId = inviteData.user.id;

    const { data: existingEnrolments, error: enrolmentLookupError } =
      await supabaseAdmin
        .from("class_enrolments")
        .select("student_id")
        .eq("student_id", studentId)
        .limit(1);

    if (enrolmentLookupError) {
      const details = logStepError(
        "Student enrolment lookup failed",
        enrolmentLookupError
      );
      return jsonError(
        "Student was invited, but enrolment setup could not be checked.",
        500,
        details
      );
    }

    if (existingEnrolments && existingEnrolments.length > 0) {
      return jsonError("This student is already assigned to a class.", 400);
    }

    const { error: profileUpsertError } = await supabaseAdmin
      .from("profiles")
      .upsert({
        id: studentId,
        email,
        first_name: firstName,
        last_name: lastName,
        role: "student",
      });

    if (profileUpsertError) {
      const details = logStepError(
        "profile insert/upsert failed",
        profileUpsertError
      );
      return jsonError(
        "Student was invited, but profile setup failed.",
        500,
        details
      );
    }

    const { error: enrolmentInsertError } = await supabaseAdmin
      .from("class_enrolments")
      .insert([
        {
          student_id: studentId,
          class_id: classId,
        },
      ]);

    if (enrolmentInsertError) {
      const details = logStepError(
        "class_enrolment insert failed",
        enrolmentInsertError
      );
      return jsonError(
        "Student was invited, but class assignment failed.",
        500,
        details
      );
    }

    return NextResponse.json({
      success: true,
      message: "Student invite sent.",
      student: {
        id: studentId,
        email,
        first_name: firstName,
        last_name: lastName,
        role: "student",
        class_id: classId,
      },
    });
  } catch (error) {
    const details = logStepError("unexpected route error", error);
    return jsonError("Unable to invite student.", 500, details);
  }
}
