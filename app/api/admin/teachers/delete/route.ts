import { NextRequest, NextResponse } from "next/server";

import { supabaseAdmin } from "../../../../../lib/supabaseAdmin";

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

    const { data: adminProfile, error: adminProfileError } =
      await supabaseAdmin
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();

    if (adminProfileError) {
      console.error("Admin profile lookup failed:", adminProfileError);
      return jsonError("Unable to verify admin user.", 500);
    }

    if (adminProfile?.role !== "admin") {
      return jsonError("Only admins can delete teachers.", 403);
    }

    const body = await request.json();
    const teacherId = body.teacher_id;

    if (!teacherId) {
      return jsonError("teacher_id is required.", 400);
    }

    const { data: teacherProfile, error: teacherProfileError } =
      await supabaseAdmin
        .from("profiles")
        .select("id, role")
        .eq("id", teacherId)
        .single();

    if (teacherProfileError || !teacherProfile) {
      console.error("Teacher profile lookup failed:", teacherProfileError);
      return jsonError("Teacher profile not found.", 404);
    }

    if (teacherProfile.role !== "teacher") {
      return jsonError("The selected profile is not a teacher.", 400);
    }

    const { data: assignedClasses, error: classesError } =
      await supabaseAdmin
        .from("classes")
        .select("id")
        .eq("teacher_id", teacherId);

    if (classesError) {
      console.error("Assigned class lookup failed:", classesError);
      return jsonError("Unable to check assigned classes.", 500);
    }

    if (assignedClasses && assignedClasses.length > 0) {
      return jsonError(
        "Cannot delete teacher while classes are assigned.",
        400
      );
    }

    const { error: authDeleteError } =
      await supabaseAdmin.auth.admin.deleteUser(teacherId);

    if (authDeleteError) {
      console.error("Teacher auth delete failed:", authDeleteError);
      return jsonError("Unable to delete teacher login account.", 500);
    }

    const { error: profileDeleteError } = await supabaseAdmin
      .from("profiles")
      .delete()
      .eq("id", teacherId);

    if (profileDeleteError) {
      console.error("Teacher profile delete failed:", profileDeleteError);
      return jsonError(
        "Teacher login was deleted, but profile deletion failed.",
        500
      );
    }

    return NextResponse.json({
      success: true,
      message: "Teacher deleted successfully.",
    });
  } catch (error) {
    console.error("Delete teacher route failed:", error);
    return jsonError("Unable to delete teacher.", 500);
  }
}
