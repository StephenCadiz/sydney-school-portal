import { NextRequest, NextResponse } from "next/server";

import { supabaseAdmin } from "../../../../../lib/supabaseAdmin";

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

function normalizeEmail(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isDuplicateAuthEmailError(error: unknown) {
  if (!error || typeof error !== "object") return false;

  const authError = error as { code?: unknown; message?: unknown };
  const code = String(authError.code || "").toLowerCase();
  const message = String(authError.message || "").toLowerCase();

  return (
    code === "email_exists" ||
    code === "user_already_exists" ||
    message.includes("already been registered") ||
    message.includes("email address is already") ||
    message.includes("email already exists")
  );
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const authorization = request.headers.get("authorization");
    const token = authorization?.startsWith("Bearer ")
      ? authorization.slice("Bearer ".length)
      : "";

    if (!token) {
      return jsonError("Missing authorization token.", 401);
    }

    const {
      data: { user },
      error: userError,
    } = await supabaseAdmin.auth.getUser(token);

    if (userError || !user) {
      return jsonError("Invalid authorization token.", 401);
    }

    const { data: callerProfile, error: callerError } = await supabaseAdmin
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (callerError) {
      return jsonError("Unable to verify admin user.", 500);
    }

    if (callerProfile?.role !== "admin") {
      return jsonError("Only admins can edit teachers.", 403);
    }

    const { id: teacherId } = await context.params;

    if (!teacherId) {
      return jsonError("Teacher ID is required.", 400);
    }

    if (teacherId === user.id) {
      return jsonError(
        "You cannot edit your own account through teacher management.",
        403
      );
    }

    const { data: targetProfile, error: targetError } = await supabaseAdmin
      .from("profiles")
      .select("id, email, first_name, last_name, role")
      .eq("id", teacherId)
      .single();

    if (targetError || !targetProfile) {
      return jsonError("Teacher profile not found.", 404);
    }

    if (targetProfile.role !== "teacher") {
      return jsonError("The selected profile is not a teacher.", 400);
    }

    const body = await request.json();
    const firstName =
      typeof body.first_name === "string" ? body.first_name.trim() : "";
    const lastName =
      typeof body.last_name === "string" ? body.last_name.trim() : "";
    const email = normalizeEmail(body.email);

    if (!firstName) {
      return jsonError("First name is required.", 400);
    }

    if (!lastName) {
      return jsonError("Last name is required.", 400);
    }

    if (!email || !isValidEmail(email)) {
      return jsonError("Enter a valid email address.", 422);
    }

    const {
      data: { user: targetAuthUser },
      error: targetAuthError,
    } = await supabaseAdmin.auth.admin.getUserById(teacherId);

    if (targetAuthError || !targetAuthUser) {
      return jsonError(
        "The teacher’s login account could not be found. No changes were made.",
        404
      );
    }

    const previousAuthEmail = normalizeEmail(targetAuthUser.email);

    if (!previousAuthEmail) {
      return jsonError(
        "The teacher’s login account has no email address. No changes were made.",
        409
      );
    }

    const profileEmail = normalizeEmail(targetProfile.email);
    const emailChanged = email !== profileEmail;
    const authEmailChanged = emailChanged && email !== previousAuthEmail;

    if (emailChanged) {
      const { data: duplicateProfiles, error: duplicateProfileError } =
        await supabaseAdmin
          .from("profiles")
          .select("id")
          .ilike("email", email)
          .neq("id", teacherId)
          .limit(1);

      if (duplicateProfileError) {
        return jsonError("Unable to verify the new email address.", 500);
      }

      if (duplicateProfiles && duplicateProfiles.length > 0) {
        return jsonError(
          "Another portal account already uses this email address.",
          409
        );
      }
    }

    if (authEmailChanged) {
      const { data: authUpdateData, error: authUpdateError } =
        await supabaseAdmin.auth.admin.updateUserById(teacherId, {
          email,
          email_confirm: true,
        });

      if (authUpdateError) {
        if (isDuplicateAuthEmailError(authUpdateError)) {
          return jsonError(
            "This email address is already used by another account.",
            409
          );
        }

        return jsonError(
          "The teacher’s login email could not be updated. No changes were made.",
          500
        );
      }

      if (normalizeEmail(authUpdateData.user?.email) !== email) {
        const { data: rollbackData, error: rollbackError } =
          await supabaseAdmin.auth.admin.updateUserById(teacherId, {
            email: previousAuthEmail,
            email_confirm: true,
          });
        const rollbackSucceeded =
          !rollbackError &&
          normalizeEmail(rollbackData.user?.email) === previousAuthEmail;

        if (!rollbackSucceeded) {
          console.error("Teacher email reconciliation failed:", {
            stage: "auth-verification-and-auth-rollback",
            teacherId,
          });
          return NextResponse.json(
            {
              error:
                "The login email could not be verified or restored. Do not retry this email change. Contact portal support.",
              code: "TEACHER_EMAIL_RECONCILIATION_REQUIRED",
            },
            { status: 502 }
          );
        }

        return jsonError(
          "The teacher’s login email could not be verified. The original login email has been restored.",
          502
        );
      }
    }

    const { data: updatedTeacher, error: updateError } = await supabaseAdmin
      .from("profiles")
      .update({
        first_name: firstName,
        last_name: lastName,
        email,
      })
      .eq("id", teacherId)
      .eq("role", "teacher")
      .select("id, email, first_name, last_name, role")
      .single();

    if (updateError || !updatedTeacher) {
      if (authEmailChanged) {
        const { data: rollbackData, error: rollbackError } =
          await supabaseAdmin.auth.admin.updateUserById(teacherId, {
            email: previousAuthEmail,
            email_confirm: true,
          });
        const rollbackSucceeded =
          !rollbackError &&
          normalizeEmail(rollbackData.user?.email) === previousAuthEmail;

        if (!rollbackSucceeded) {
          console.error("Teacher email reconciliation failed:", {
            stage: "profile-update-and-auth-rollback",
            teacherId,
          });
          return NextResponse.json(
            {
              error:
                "The login email changed, but the staff profile could not be synchronized. Do not retry this email change. Contact portal support.",
              code: "TEACHER_EMAIL_RECONCILIATION_REQUIRED",
            },
            { status: 502 }
          );
        }

        console.error("Teacher profile update failed after Auth email update:", {
          stage: "profile-update-auth-rollback-succeeded",
          teacherId,
        });
        return jsonError(
          "The teacher account could not be updated. The original login email has been restored.",
          500
        );
      }

      return jsonError("Unable to update teacher information.", 500);
    }

    return NextResponse.json({
      success: true,
      message: emailChanged
        ? "Teacher information and login email updated."
        : "Teacher information updated.",
      teacher: updatedTeacher,
    });
  } catch {
    return jsonError("Unable to update teacher information.", 500);
  }
}
