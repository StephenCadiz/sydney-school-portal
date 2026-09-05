import { NextRequest, NextResponse } from "next/server";

import { supabaseAdmin } from "../../../../../lib/supabaseAdmin";
import { getMadridDate, isIsoDate } from "../../../../../lib/staffTime";

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
    console.error("Manual admin staff create auth failed:", formatError(userError));
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
      "Manual admin staff create admin lookup failed:",
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
      error: jsonError("Only admins can create admin staff.", 403),
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
    const password = body.password;
    const requiresTimeRegistration = body.requires_time_registration === true;
    if (
      body.requires_time_registration !== undefined &&
      typeof body.requires_time_registration !== "boolean"
    ) {
      return jsonError("Choose a valid time-registration setting.", 400);
    }
    const hasTrackingEffectiveDate = Object.prototype.hasOwnProperty.call(
      body,
      "time_registration_effective_from"
    );
    if (hasTrackingEffectiveDate && !requiresTimeRegistration) {
      return jsonError(
        "A time-registration effective date only applies when enrollment is enabled.",
        400
      );
    }
    const trackingEffectiveFrom = hasTrackingEffectiveDate
      ? String(body.time_registration_effective_from).trim()
      : getMadridDate();
    if (
      requiresTimeRegistration &&
      (!isIsoDate(trackingEffectiveFrom) || trackingEffectiveFrom !== getMadridDate())
    ) {
      return jsonError("Time registration must take effect today.", 400);
    }

    if (!firstName || !lastName || !email || !password) {
      return jsonError(
        "First name, last name, email, and password are required.",
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
        "Manual admin staff duplicate profile lookup failed:",
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

    const { data: authData, error: authError } =
      await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });

    if (authError || !authData.user) {
      console.error("Manual admin staff Auth create failed:", formatError(authError));
      return jsonError(
        authError?.message || "Unable to create admin staff account.",
        500,
        formatError(authError)
      );
    }

    const adminStaffId = authData.user.id;

    const { error: profileUpsertError } = await supabaseAdmin
      .from("profiles")
      .upsert({
        id: adminStaffId,
        email,
        first_name: firstName,
        last_name: lastName,
        role: "admin",
      });

    if (profileUpsertError) {
      console.error(
        "Manual admin staff profile upsert failed:",
        formatError(profileUpsertError)
      );

      const { error: cleanupError } =
        await supabaseAdmin.auth.admin.deleteUser(adminStaffId);

      if (cleanupError) {
        console.error(
          "Manual admin staff Auth cleanup failed:",
          formatError(cleanupError)
        );
      }

      return jsonError(
        "Admin staff login was created, but profile setup failed.",
        500,
        formatError(profileUpsertError)
      );
    }

    if (requiresTimeRegistration) {
      const { error: enrollmentError } = await supabaseAdmin.rpc(
        "set_staff_time_admin_enrollment",
        {
          p_actor_id: adminCheck.user.id,
          p_admin_id: adminStaffId,
          p_requires_time_registration: true,
          p_effective_from: trackingEffectiveFrom,
        }
      );
      if (enrollmentError) {
        console.error(
          "Manual admin staff time enrollment failed:",
          formatError(enrollmentError)
        );
        const { error: cleanupError } =
          await supabaseAdmin.auth.admin.deleteUser(adminStaffId);
        if (cleanupError) {
          console.error(
            "Manual admin staff enrollment cleanup failed:",
            formatError(cleanupError)
          );
          return jsonError(
            "Admin staff setup failed and account cleanup could not be confirmed. Review the Admin account before retrying.",
            502
          );
        }
        return jsonError(
          "Admin staff setup failed while enabling time registration. The account was not retained.",
          500
        );
      }
    }

    return NextResponse.json({
      success: true,
      message: requiresTimeRegistration
        ? "Admin staff account created with sign-in and sign-out required."
        : "Admin staff account created successfully. Time registration is disabled.",
    });
  } catch (error) {
    console.error("Manual admin staff create route failed:", formatError(error));
    return jsonError(
      "Unable to create admin staff account.",
      500,
      formatError(error)
    );
  }
}
