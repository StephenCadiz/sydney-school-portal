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

function isMissingAuthUser(error: unknown) {
  const candidate = error as { status?: number; code?: string; message?: string } | null;
  return (
    candidate?.status === 404 ||
    candidate?.code === "user_not_found" ||
    /user\s+(was\s+)?not\s+found/i.test(candidate?.message || "")
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

    if (teacherId === user.id) {
      return jsonError("You cannot delete your own account.", 403);
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
        `This teacher still has ${assignedClasses.length} assigned ${
          assignedClasses.length === 1 ? "class" : "classes"
        }. Reassign ${
          assignedClasses.length === 1 ? "it" : "them"
        } in Classes before deleting the account.`,
        400
      );
    }

    const {
      data: authUserResult,
      error: authLookupError,
    } = await supabaseAdmin.auth.admin.getUserById(teacherId);

    if (authLookupError && !isMissingAuthUser(authLookupError)) {
      console.error("Teacher auth lookup failed:", authLookupError);
      return jsonError("Unable to verify teacher login account.", 500);
    }

    if (!authUserResult?.user) {
      const [senderMessagesResult, receiverMessagesResult, fridayDutiesResult] =
        await Promise.all([
          supabaseAdmin
            .from("messages")
            .select("id")
            .eq("sender_id", teacherId),
          supabaseAdmin
            .from("messages")
            .select("id")
            .eq("receiver_id", teacherId),
          supabaseAdmin
            .from("friday_at_6_duties")
            .select("id, teacher_id, b1_teacher_id")
            .eq("teacher_id", teacherId),
        ]);

      if (
        senderMessagesResult.error ||
        receiverMessagesResult.error ||
        fridayDutiesResult.error
      ) {
        console.error("Orphan teacher dependency lookup failed:", {
          senderMessagesError: senderMessagesResult.error,
          receiverMessagesError: receiverMessagesResult.error,
          fridayDutiesError: fridayDutiesResult.error,
        });
        return jsonError("Unable to check teacher dependencies.", 500);
      }

      const senderMessages = senderMessagesResult.data || [];
      const receiverMessages = receiverMessagesResult.data || [];
      const fridayDuties = fridayDutiesResult.data || [];

      if (
        senderMessages.length !== 1 ||
        receiverMessages.length !== 0 ||
        fridayDuties.length !== 1 ||
        fridayDuties[0]?.b1_teacher_id === teacherId
      ) {
        return jsonError(
          "This teacher has unexpected dependent records. Review them before deleting the account.",
          409
        );
      }

      const { error: orphanCleanupError } = await supabaseAdmin.rpc(
        "delete_orphan_teacher_with_dependencies",
        {
          p_actor_id: user.id,
          p_teacher_id: teacherId,
          p_message_id: senderMessages[0].id,
          p_friday_duty_id: fridayDuties[0].id,
        }
      );

      if (orphanCleanupError) {
        console.error("Orphan teacher cleanup failed:", orphanCleanupError);
        return jsonError(
          "Unable to safely remove the teacher profile and its confirmed dependencies.",
          409
        );
      }

      return NextResponse.json({
        success: true,
        message: "Teacher deleted successfully.",
      });
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
