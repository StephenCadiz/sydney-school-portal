import { NextRequest, NextResponse } from "next/server";

import { supabaseAdmin } from "../../../../../lib/supabaseAdmin";

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
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

    if (!firstName) {
      return jsonError("First name is required.", 400);
    }

    if (!lastName) {
      return jsonError("Last name is required.", 400);
    }

    const { data: updatedTeacher, error: updateError } = await supabaseAdmin
      .from("profiles")
      .update({
        first_name: firstName,
        last_name: lastName,
      })
      .eq("id", teacherId)
      .eq("role", "teacher")
      .select("id, email, first_name, last_name, role")
      .single();

    if (updateError || !updatedTeacher) {
      return jsonError("Unable to update teacher information.", 500);
    }

    return NextResponse.json({
      success: true,
      message: "Teacher information updated.",
      teacher: updatedTeacher,
    });
  } catch {
    return jsonError("Unable to update teacher information.", 500);
  }
}
