import { NextRequest, NextResponse } from "next/server";

import {
  authenticateAdminRequest,
  isDuplicateAuthEmailError,
  isUuid,
  isValidEmail,
  loadAdminProfileAndAuthUser,
  loadAdminTimeRegistrationStatus,
  logAdminStaffAccountFailure,
  normalizeEmail,
  setAdminTimeRegistrationRequirement,
} from "../../../../../lib/adminStaffAccountsServer";
import { getMadridDate, isIsoDate } from "../../../../../lib/staffTime";
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
        [
          "first_name",
          "last_name",
          "email",
          "requires_time_registration",
          "time_registration_effective_from",
        ].includes(key)
      )
    ) {
      return jsonError("The request contains unsupported fields.", 400);
    }

    const firstName =
      typeof record.first_name === "string" ? record.first_name.trim() : "";
    const lastName =
      typeof record.last_name === "string" ? record.last_name.trim() : "";
    const email = normalizeEmail(record.email);
    const hasTrackingSetting = Object.prototype.hasOwnProperty.call(
      record,
      "requires_time_registration"
    );
    const hasTrackingEffectiveDate = Object.prototype.hasOwnProperty.call(
      record,
      "time_registration_effective_from"
    );
    if (hasTrackingEffectiveDate && !hasTrackingSetting) {
      return jsonError(
        "A time-registration effective date requires an enrollment setting.",
        400
      );
    }
    if (
      hasTrackingSetting &&
      typeof record.requires_time_registration !== "boolean"
    ) {
      return jsonError("Choose a valid time-registration setting.", 400);
    }
    const requiresTimeRegistration = hasTrackingSetting
      ? record.requires_time_registration === true
      : false;
    const trackingEffectiveFrom =
      typeof record.time_registration_effective_from === "string"
        ? record.time_registration_effective_from.trim()
        : getMadridDate();
    if (
      hasTrackingSetting &&
      (!isIsoDate(trackingEffectiveFrom) || trackingEffectiveFrom !== getMadridDate())
    ) {
      return jsonError("Time-registration changes must take effect today.", 422);
    }

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

    const previousTracking = await loadAdminTimeRegistrationStatus(targetId);
    const trackingChanged =
      hasTrackingSetting &&
      previousTracking.requires_time_registration !== requiresTimeRegistration;
    if (trackingChanged && auth.actorId === targetId && !requiresTimeRegistration) {
      return jsonError(
        "A tracked Admin cannot disable their own time-registration requirement. Ask another Admin to make this change.",
        403
      );
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

    let tracking = previousTracking;
    if (trackingChanged) {
      try {
        const enrollment = await setAdminTimeRegistrationRequirement({
          actorId: auth.actorId,
          adminId: targetId,
          required: requiresTimeRegistration,
          effectiveFrom: trackingEffectiveFrom,
        });
        tracking = {
          requires_time_registration: enrollment.requires_time_registration,
          time_registration_effective_from: enrollment.effective_from,
          time_registration_changed_at: enrollment.changed_at,
        };
      } catch (trackingError) {
        const { error: profileRollbackError } = await supabaseAdmin
          .from("profiles")
          .update({
            first_name: profile.first_name,
            last_name: profile.last_name,
            email: previousAuthEmail,
          })
          .eq("id", targetId)
          .eq("role", "admin");
        const authRestored = authEmailChanged
          ? await restoreAuthEmail(targetId, previousAuthEmail)
          : true;
        logAdminStaffAccountFailure("time-registration-update", {
          targetId,
          trackingError,
          profileRollbackError,
          authRestored,
        });
        const rollbackSucceeded = !profileRollbackError && authRestored;
        return jsonError(
          rollbackSucceeded
            ? "Unable to update the time-registration requirement. No account changes were retained."
            : "Unable to update the time-registration requirement and fully restore the account. Review the Admin account before retrying.",
          rollbackSucceeded ? 500 : 502
        );
      }
    }

    const currentAccountChanged = auth.actorId === targetId && authEmailChanged;
    return NextResponse.json({
      success: true,
      message: trackingChanged
        ? requiresTimeRegistration
          ? "Admin account updated. Sign-in and sign-out are now required."
          : "Admin account updated. Time registration is now disabled; history was retained."
        : currentAccountChanged
        ? "Admin account and login email updated. Use the new email the next time you sign in."
        : authEmailChanged
        ? "Admin account and login email updated."
        : "Admin account updated.",
      account: { ...account, auth_linked: true, ...tracking },
    });
  } catch (error) {
    logAdminStaffAccountFailure("update", { targetId, error });
    return jsonError("Unable to update the Admin account.", 500);
  }
}
