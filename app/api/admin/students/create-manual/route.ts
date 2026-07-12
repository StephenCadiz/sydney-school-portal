import { NextRequest, NextResponse } from "next/server";

import { supabaseAdmin } from "../../../../../lib/supabaseAdmin";

const cambridgeLevelNames = ["B1", "B2", "C1", "C2"];

function normalizeLevelName(levelName: string | null | undefined) {
  return String(levelName || "").trim().toUpperCase();
}

function formatError(error: unknown) {
  if (!error) {
    return "Unknown error from Supabase/Auth.";
  }

  if (typeof error === "object") {
    const errorObject = error as {
      message?: unknown;
      details?: unknown;
      hint?: unknown;
      code?: unknown;
    };
    const parts = [
      errorObject.message ? `Message: ${String(errorObject.message)}` : "",
      errorObject.details ? `Details: ${String(errorObject.details)}` : "",
      errorObject.hint ? `Hint: ${String(errorObject.hint)}` : "",
      errorObject.code ? `Code: ${String(errorObject.code)}` : "",
    ].filter(Boolean);

    if (parts.length > 0) {
      return parts.join("\n");
    }
  }

  const fallback = String(error);
  return fallback && fallback !== "[object Object]"
    ? fallback
    : "Unknown error from Supabase/Auth.";
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

async function verifyAdmin(request: NextRequest) {
  const authorization = request.headers.get("authorization");
  const token = authorization?.startsWith("Bearer ")
    ? authorization.replace("Bearer ", "")
    : "";

  if (!token) {
    return {
      error: jsonError("Missing authorization token.", 401),
    };
  }

  const {
    data: { user },
    error: userError,
  } = await supabaseAdmin.auth.getUser(token);

  if (userError || !user) {
    console.error("Manual student create auth failed:", formatError(userError));
    return {
      error: jsonError(
        "Invalid authorization token.",
        401,
        formatError(userError)
      ),
    };
  }

  const { data: profile, error: profileError } = await supabaseAdmin
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profileError) {
    console.error(
      "Manual student create admin lookup failed:",
      formatError(profileError)
    );
    return {
      error: jsonError(
        "Unable to verify admin user.",
        500,
        formatError(profileError)
      ),
    };
  }

  if (profile?.role !== "admin") {
    return {
      error: jsonError("Only admins can create students.", 403),
    };
  }

  return { user };
}

export async function POST(request: NextRequest) {
  try {
    const adminCheck = await verifyAdmin(request);

    if (adminCheck.error) {
      return adminCheck.error;
    }

    const body = await request.json();
    const firstName = body.first_name?.trim();
    const lastName = body.last_name?.trim();
    const email = body.email?.trim();
    const classId = body.class_id?.trim();
    const password = body.password;

    if (!firstName || !lastName || !email || !classId || !password) {
      return jsonError(
        "First name, last name, email, class, and password are required.",
        400
      );
    }

    if (String(password).length < 6) {
      return jsonError("Password must be at least 6 characters.", 400);
    }

    const { data: existingProfiles, error: existingProfileError } =
      await supabaseAdmin
        .from("profiles")
        .select("id")
        .eq("email", email)
        .limit(1);

    if (existingProfileError) {
      console.error(
        "Manual student duplicate profile lookup failed:",
        formatError(existingProfileError)
      );
      return jsonError(
        "Unable to check existing users.",
        500,
        formatError(existingProfileError)
      );
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
      console.error("Manual student class lookup failed:", formatError(classError));
      return jsonError("Selected class was not found.", 404, formatError(classError));
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
      console.error(
        "Manual student level lookup failed:",
        formatError(levelError)
      );
      return jsonError(
        "Unable to verify selected class level.",
        500,
        formatError(levelError)
      );
    }

    if (!cambridgeLevelNames.includes(normalizeLevelName(level.name))) {
      return jsonError("Selected class is not a Cambridge class.", 400);
    }

    const { data: authData, error: authError } =
      await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });

    if (authError || !authData.user) {
      console.error("Manual student Auth create failed:", formatError(authError));
      return jsonError(
        authError?.message || "Unable to create student account.",
        500,
        formatError(authError)
      );
    }

    const studentId = authData.user.id;

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
      console.error(
        "Manual student profile upsert failed:",
        formatError(profileUpsertError)
      );
      return jsonError(
        "Student login was created, but profile setup failed.",
        500,
        formatError(profileUpsertError)
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
      console.error(
        "Manual student class enrolment insert failed:",
        formatError(enrolmentInsertError)
      );
      return jsonError(
        "Student login was created, but class assignment failed.",
        500,
        formatError(enrolmentInsertError)
      );
    }

    return NextResponse.json({
      success: true,
      message: "Student account created successfully.",
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
    console.error("Manual student create route failed:", formatError(error));
    return jsonError(
      "Unable to create student account.",
      500,
      formatError(error)
    );
  }
}
