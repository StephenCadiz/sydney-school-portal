import { NextRequest, NextResponse } from "next/server";

import { supabaseAdmin } from "../../../../../../lib/supabaseAdmin";

const cambridgeLevels = new Set(["B1", "B2", "C1", "C2"]);
const maximumPasswordLength = 256;

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

function normalizeEmail(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function logFailure(
  stage: string,
  actorId: string,
  targetId: string,
  targetRole?: string
) {
  console.error("Admin password update failed:", {
    stage,
    actorId,
    targetId,
    targetRole,
  });
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  let actorId = "";
  let targetId = "";
  let targetRole = "";

  try {
    const authorization = request.headers.get("authorization");
    const token = authorization?.startsWith("Bearer ")
      ? authorization.slice("Bearer ".length)
      : "";

    if (!token) {
      return jsonError("Authentication required.", 401);
    }

    const {
      data: { user: actor },
      error: actorError,
    } = await supabaseAdmin.auth.getUser(token);

    if (actorError || !actor) {
      return jsonError("Authentication required.", 401);
    }

    actorId = actor.id;

    const { data: actorProfile, error: actorProfileError } = await supabaseAdmin
      .from("profiles")
      .select("role")
      .eq("id", actorId)
      .single();

    if (actorProfileError) {
      logFailure("actor-profile-lookup", actorId, "");
      return jsonError("Unable to update the password right now.", 500);
    }

    if (actorProfile?.role !== "admin") {
      return jsonError("Admin access required.", 403);
    }

    targetId = (await context.params).id;
    if (!targetId) {
      return jsonError("Portal account not found.", 404);
    }

    const { data: targetProfile, error: targetProfileError } =
      await supabaseAdmin
        .from("profiles")
        .select("id, email, first_name, last_name, role")
        .eq("id", targetId)
        .single();

    if (targetProfileError || !targetProfile) {
      return jsonError("Portal account not found.", 404);
    }

    targetRole = String(targetProfile.role || "");
    if (!["teacher", "student", "admin"].includes(targetRole)) {
      return jsonError("This account is not eligible for password changes.", 403);
    }

    if (targetRole === "student") {
      const { data: enrolment, error: enrolmentError } = await supabaseAdmin
        .from("class_enrolments")
        .select("class_id")
        .eq("student_id", targetId)
        .limit(1)
        .maybeSingle();

      if (enrolmentError) {
        logFailure("student-enrolment-lookup", actorId, targetId, targetRole);
        return jsonError("Unable to update the password right now.", 500);
      }

      if (!enrolment?.class_id) {
        return jsonError("This student does not have a portal account.", 404);
      }

      const { data: classroom, error: classError } = await supabaseAdmin
        .from("classes")
        .select("is_cambridge, level_id")
        .eq("id", enrolment.class_id)
        .single();

      if (classError || !classroom) {
        return jsonError("This student is not eligible for password changes.", 403);
      }

      if (classroom.is_cambridge !== true || !classroom.level_id) {
        return jsonError("This student is not eligible for password changes.", 403);
      }

      const { data: level, error: levelError } = await supabaseAdmin
        .from("levels")
        .select("name")
        .eq("id", classroom.level_id)
        .single();

      if (
        levelError ||
        !level?.name ||
        !cambridgeLevels.has(String(level.name).trim().toUpperCase())
      ) {
        return jsonError("This student is not eligible for password changes.", 403);
      }
    }

    const {
      data: { user: targetAuthUser },
      error: targetAuthError,
    } = await supabaseAdmin.auth.admin.getUserById(targetId);

    if (targetAuthError || !targetAuthUser) {
      return jsonError("Portal login account not found.", 404);
    }

    const profileEmail = normalizeEmail(targetProfile.email);
    const authEmail = normalizeEmail(targetAuthUser.email);

    if (!profileEmail || !authEmail || profileEmail !== authEmail) {
      return jsonError("Account requires reconciliation.", 409);
    }

    const body = await request.json();
    const password =
      typeof body.password === "string" ? body.password : undefined;
    const confirmation =
      typeof body.confirm_password === "string"
        ? body.confirm_password
        : undefined;

    if (!password || confirmation === undefined || confirmation === "") {
      return jsonError("Password and confirmation are required.", 400);
    }

    if (
      password.length > maximumPasswordLength ||
      confirmation.length > maximumPasswordLength
    ) {
      return jsonError("Password is too long.", 422);
    }

    if (password.length < 6) {
      return jsonError("Password must contain at least 6 characters.", 422);
    }

    if (password !== confirmation) {
      return jsonError("Passwords do not match.", 422);
    }

    const { error: updateError } =
      await supabaseAdmin.auth.admin.updateUserById(targetId, { password });

    if (updateError) {
      logFailure("auth-password-update", actorId, targetId, targetRole);
      const status =
        typeof updateError === "object" &&
        updateError &&
        "status" in updateError &&
        updateError.status === 429
          ? 429
          : 500;
      return jsonError(
        status === 429
          ? "Too many requests. Please wait and try again."
          : "Unable to update the password right now.",
        status
      );
    }

    return NextResponse.json({
      success: true,
      message: "Password updated successfully.",
    });
  } catch {
    logFailure("unexpected", actorId, targetId, targetRole);
    return jsonError("Unable to update the password right now.", 500);
  }
}
