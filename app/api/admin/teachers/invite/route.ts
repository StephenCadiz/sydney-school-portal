import { NextRequest, NextResponse } from "next/server";

import { supabaseAdmin } from "../../../../../lib/supabaseAdmin";

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
      return jsonError("Invalid authorization token.", 401);
    }

    const { data: profile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (profileError) {
      console.error("Admin profile lookup failed:", profileError);
      return jsonError("Unable to verify admin user.", 500);
    }

    if (profile?.role !== "admin") {
      return jsonError("Only admins can invite teachers.", 403);
    }

    const body = await request.json();
    const firstName = body.first_name?.trim();
    const lastName = body.last_name?.trim();
    const email = body.email?.trim();

    if (!firstName || !lastName || !email) {
      return jsonError(
        "First name, last name, and email are required.",
        400
      );
    }

    const { data: inviteData, error: inviteError } =
      await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
        redirectTo: getInviteRedirectUrl(),
      });

    if (inviteError || !inviteData.user) {
      const diagnostics = getInviteErrorDiagnostics(inviteError);
      console.error("Teacher invite failed:", diagnostics);
      return jsonInviteEmailError(inviteError);
    }

    const { error: profileUpsertError } = await supabaseAdmin
      .from("profiles")
      .upsert({
        id: inviteData.user.id,
        email,
        first_name: firstName,
        last_name: lastName,
        role: "teacher",
      });

    if (profileUpsertError) {
      console.error("Teacher profile upsert failed:", profileUpsertError);
      return jsonError("Teacher was invited, but profile setup failed.", 500);
    }

    return NextResponse.json({
      success: true,
      message: "Teacher invite sent.",
      teacher: {
        id: inviteData.user.id,
        email,
        first_name: firstName,
        last_name: lastName,
        role: "teacher",
      },
    });
  } catch (error) {
    console.error("Invite teacher route failed:", error);
    return jsonError("Unable to invite teacher.", 500);
  }
}
