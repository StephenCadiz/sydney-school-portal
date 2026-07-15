import { NextRequest, NextResponse } from "next/server";

import { supabaseAdmin } from "../../../../../lib/supabaseAdmin";

const maxNameLength = 80;

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

function jsonError(message: string, status: number) {
  return NextResponse.json(
    {
      error: message,
    },
    {
      status,
    }
  );
}

function normalizeRequiredString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function validateName(label: string, value: string) {
  if (!value) {
    return `${label} is required.`;
  }

  if (value.length > maxNameLength) {
    return `${label} must be ${maxNameLength} characters or fewer.`;
  }

  return "";
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
    console.error("Young Learner update auth failed:", formatError(userError));
    return {
      error: jsonError("Invalid authorization token.", 401),
    };
  }

  const { data: profile, error: profileError } = await supabaseAdmin
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profileError) {
    console.error(
      "Young Learner update admin lookup failed:",
      formatError(profileError)
    );
    return {
      error: jsonError("Unable to verify admin user.", 500),
    };
  }

  if (profile?.role !== "admin") {
    return {
      error: jsonError("Only admins can update Young Learners.", 403),
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
    const youngLearnerId = normalizeRequiredString(body.young_learner_id);
    const firstName = normalizeRequiredString(body.first_name);
    const lastName = normalizeRequiredString(body.last_name);
    const classId = normalizeRequiredString(body.class_id);

    if (!youngLearnerId) {
      return jsonError("Young Learner is required.", 400);
    }

    const firstNameError = validateName("First name", firstName);

    if (firstNameError) {
      return jsonError(firstNameError, 400);
    }

    const lastNameError = validateName("Last name", lastName);

    if (lastNameError) {
      return jsonError(lastNameError, 400);
    }

    if (!classId) {
      return jsonError("Class is required.", 400);
    }

    const { data: youngLearner, error: youngLearnerError } = await supabaseAdmin
      .from("young_learners")
      .select("id")
      .eq("id", youngLearnerId)
      .single();

    if (youngLearnerError || !youngLearner) {
      console.error(
        "Young Learner update lookup failed:",
        formatError(youngLearnerError)
      );
      return jsonError("Young Learner not found.", 404);
    }

    const { data: classroom, error: classError } = await supabaseAdmin
      .from("classes")
      .select("id, is_cambridge")
      .eq("id", classId)
      .single();

    if (classError) {
      console.error(
        "Young Learner update class validation failed:",
        formatError(classError)
      );
      return jsonError("The selected Young Learner class is not valid.", 400);
    }

    if (!classroom || classroom.is_cambridge === true) {
      return jsonError("The selected Young Learner class is not valid.", 400);
    }

    const { data: updatedLearner, error: updateError } = await supabaseAdmin
      .from("young_learners")
      .update({
        first_name: firstName,
        last_name: lastName,
        class_id: classId,
      })
      .eq("id", youngLearnerId)
      .select("id, first_name, last_name, class_id, active, created_at")
      .single();

    if (updateError || !updatedLearner) {
      console.error(
        "Young Learner update failed:",
        formatError(updateError)
      );
      return jsonError("Unable to update Young Learner.", 500);
    }

    return NextResponse.json({
      success: true,
      message: "Young Learner updated successfully.",
      young_learner: updatedLearner,
    });
  } catch (error) {
    console.error("Young Learner update route failed:", formatError(error));
    return jsonError("Unable to update Young Learner.", 500);
  }
}
