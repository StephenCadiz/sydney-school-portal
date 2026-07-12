import { NextRequest, NextResponse } from "next/server";

import { supabaseAdmin } from "../../../../../lib/supabaseAdmin";

function formatError(error: unknown) {
  if (!error) {
    return "Unknown error from Supabase.";
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
    : "Unknown error from Supabase.";
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
    console.error("Young Learner create auth failed:", formatError(userError));
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
      "Young Learner create admin lookup failed:",
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
      error: jsonError("Only admins can create Young Learners.", 403),
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
    const classId = body.class_id?.trim();

    if (!firstName || !lastName || !classId) {
      return jsonError("First name, last name, and class are required.", 400);
    }

    const { data: classroom, error: classError } = await supabaseAdmin
      .from("classes")
      .select("id, is_cambridge")
      .eq("id", classId)
      .single();

    if (classError || !classroom) {
      console.error("Young Learner class lookup failed:", formatError(classError));
      return jsonError("Selected class was not found.", 404, formatError(classError));
    }

    if (classroom.is_cambridge === true) {
      return jsonError(
        "Young Learners must be assigned to a non-Cambridge class.",
        400
      );
    }

    const { error: insertError } = await supabaseAdmin
      .from("young_learners")
      .insert([
        {
          first_name: firstName,
          last_name: lastName,
          class_id: classId,
          active: true,
        },
      ]);

    if (insertError) {
      console.error("Young Learner insert failed:", formatError(insertError));
      return jsonError(
        "Unable to create Young Learner.",
        500,
        formatError(insertError)
      );
    }

    return NextResponse.json({
      success: true,
      message: "Young Learner added successfully.",
    });
  } catch (error) {
    console.error("Young Learner create route failed:", formatError(error));
    return jsonError(
      "Unable to create Young Learner.",
      500,
      formatError(error)
    );
  }
}
