import { NextRequest, NextResponse } from "next/server";

import {
  authenticateAdminRequest,
  isDuplicateAuthEmailError,
  isUuid,
  isValidEmail,
  loadAdminProfileAndAuthUser,
  logAdminStaffAccountFailure,
  normalizeEmail,
} from "../../../../../lib/adminStaffAccountsServer";
import { supabaseAdmin } from "../../../../../lib/supabaseAdmin";

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

async function restoreAuthEmail(targetId: string, previousEmail: string) {
  const { data, error } = await supabaseAdmin.auth.admin.updateUserById(
    targetId,
    { email: previousEmail, email_confirm: true }
  );

  return !error && normalizeEmail(data.user?.email) === previousEmail;
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateAdminRequest(request);
  if (auth.error) return jsonError(auth.error.message, auth.error.status);

  const targetId = String((await context.params).id || "").trim();
  if (!isUuid(targetId)) return jsonError("Admin account not found.", 404);

  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return jsonError("Invalid Admin account update.", 400);
    }

    const record = body as Record<string, unknown>;
    if (
      !Object.keys(record).every((key) =>
        ["first_name", "last_name", "email"].includes(key)
      )
    ) {
      return jsonError("The request contains unsupported fields.", 400);
    }

    const firstName =
      typeof record.first_name === "string" ? record.first_name.trim() : "";
    const lastName =
      typeof record.last_name === "string" ? record.last_name.trim() : "";
    const email = normalizeEmail(record.email);

    if (!firstName) return jsonError("First name is required.", 400);
    if (!lastName) return jsonError("Last name is required.", 400);
    if (!email || !isValidEmail(email)) {
      return jsonError("Enter a valid email address.", 422);
    }

    const { profile, authUser, authError } =
      await loadAdminProfileAndAuthUser(targetId);
    if (!profile) return jsonError("Admin account not found.", 404);
    if (profile.role !== "admin") {
      return jsonError("The selected profile is not an Admin account.", 403);
    }
    if (authError || !authUser || authUser.id !== profile.id) {
      return jsonError("The Admin login account could not be found.", 409);
    }

    const previousAuthEmail = normalizeEmail(authUser.email);
    if (!previousAuthEmail) {
      return jsonError("The Admin login account has no email address.", 409);
    }

    const { data: duplicateProfiles, error: duplicateProfileError } =
      await supabaseAdmin
        .from("profiles")
        .select("id")
        .ilike("email", email)
        .neq("id", targetId)
        .limit(1);
    if (duplicateProfileError) {
      logAdminStaffAccountFailure("duplicate-profile-email", duplicateProfileError);
      return jsonError("Unable to verify the new email address.", 500);
    }
    if (duplicateProfiles && duplicateProfiles.length > 0) {
      return jsonError("An account already uses this email address.", 409);
    }

    const authEmailChanged = email !== previousAuthEmail;
    if (authEmailChanged) {
      const { data: authUpdateData, error: authUpdateError } =
        await supabaseAdmin.auth.admin.updateUserById(targetId, {
          email,
          email_confirm: true,
        });
      if (authUpdateError) {
        logAdminStaffAccountFailure("auth-email-update", authUpdateError);
        return jsonError(
          isDuplicateAuthEmailError(authUpdateError)
            ? "An account already uses this email address."
            : "Unable to update the Admin account.",
          isDuplicateAuthEmailError(authUpdateError) ? 409 : 500
        );
      }

      if (normalizeEmail(authUpdateData.user?.email) !== email) {
        const restored = await restoreAuthEmail(targetId, previousAuthEmail);
        if (!restored) {
          logAdminStaffAccountFailure("auth-email-verification-and-rollback", {
            targetId,
          });
          return jsonError("Unable to update the Admin account.", 502);
        }

        return jsonError("Unable to update the Admin account.", 502);
      }
    }

    const { data: account, error: profileUpdateError } = await supabaseAdmin
      .from("profiles")
      .update({
        first_name: firstName,
        last_name: lastName,
        email,
      })
      .eq("id", targetId)
      .eq("role", "admin")
      .select("id, email, first_name, last_name, role")
      .maybeSingle();

    if (profileUpdateError || !account) {
      if (authEmailChanged) {
        const restored = await restoreAuthEmail(targetId, previousAuthEmail);
        if (!restored) {
          logAdminStaffAccountFailure("profile-update-and-auth-rollback", {
            targetId,
            profileUpdateError,
          });
          return jsonError("Unable to update the Admin account.", 502);
        }
      }

      logAdminStaffAccountFailure("profile-update", profileUpdateError);
      return jsonError("Unable to update the Admin account.", 500);
    }

    const currentAccountChanged = auth.actorId === targetId && authEmailChanged;
    return NextResponse.json({
      success: true,
      message: currentAccountChanged
        ? "Admin account and login email updated. Use the new email the next time you sign in."
        : authEmailChanged
        ? "Admin account and login email updated."
        : "Admin account updated.",
      account: { ...account, auth_linked: true },
    });
  } catch (error) {
    logAdminStaffAccountFailure("update", { targetId, error });
    return jsonError("Unable to update the Admin account.", 500);
  }
}
