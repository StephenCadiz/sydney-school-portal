import { NextRequest, NextResponse } from "next/server";

import { authenticateTeacherMessageRequest } from "../../../../../../lib/teacherStudentMessagesServer";
import { supabaseAdmin } from "../../../../../../lib/supabaseAdmin";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function jsonError(message: string, status: number, code: string) {
  return NextResponse.json(
    { success: false, error: message, code },
    { status, headers: { "Cache-Control": "no-store" } }
  );
}

function logDeleteFailure(stage: string, error: unknown) {
  console.error("Teacher sent message deletion failed:", { stage, error });
}

export async function DELETE(
  request: NextRequest,
  routeContext: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateTeacherMessageRequest(request);
  if (auth.error) {
    return jsonError(
      auth.error.message,
      auth.error.status,
      "TEACHER_AUTHORIZATION_FAILED"
    );
  }

  const { id } = await routeContext.params;
  if (!UUID_PATTERN.test(id)) {
    return jsonError("Message not found.", 404, "MESSAGE_NOT_FOUND");
  }

  try {
    const { data: message, error: messageError } = await supabaseAdmin
      .from("messages")
      .select(
        "id, sender_id, receiver_id, recipient_group, sender_deleted_at"
      )
      .eq("id", id)
      .maybeSingle();

    if (messageError) {
      logDeleteFailure("message-lookup", messageError);
      return jsonError(
        "Unable to remove this message from Sent.",
        500,
        "MESSAGE_LOOKUP_FAILED"
      );
    }

    if (!message || message.sender_id !== auth.teacherId) {
      return jsonError("Message not found.", 404, "MESSAGE_NOT_FOUND");
    }

    if (message.sender_deleted_at) {
      return NextResponse.json(
        { success: true, id, already_removed: true },
        { headers: { "Cache-Control": "no-store" } }
      );
    }

    const isSharedAdminMessage =
      message.recipient_group === "admin" && message.receiver_id == null;

    if (!isSharedAdminMessage) {
      if (message.recipient_group != null || !message.receiver_id) {
        return jsonError(
          "This message cannot be removed from Teacher Sent.",
          403,
          "NOT_A_STAFF_MESSAGE"
        );
      }

      const { data: receiver, error: receiverError } = await supabaseAdmin
        .from("profiles")
        .select("role")
        .eq("id", message.receiver_id)
        .maybeSingle();

      if (receiverError) {
        logDeleteFailure("receiver-profile", receiverError);
        return jsonError(
          "Unable to remove this message from Sent.",
          500,
          "RECIPIENT_LOOKUP_FAILED"
        );
      }

      if (receiver?.role !== "admin" && receiver?.role !== "teacher") {
        return jsonError(
          "This message cannot be removed from Teacher Sent.",
          403,
          "NOT_A_STAFF_MESSAGE"
        );
      }
    }

    const { error: updateError } = await supabaseAdmin
      .from("messages")
      .update({ sender_deleted_at: new Date().toISOString() })
      .eq("id", id)
      .eq("sender_id", auth.teacherId)
      .is("sender_deleted_at", null);

    if (updateError) {
      logDeleteFailure("soft-delete", updateError);
      return jsonError(
        "Unable to remove this message from Sent.",
        500,
        "SOFT_DELETE_FAILED"
      );
    }

    return NextResponse.json(
      { success: true, id },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    logDeleteFailure("unexpected", error);
    return jsonError(
      "Unable to remove this message from Sent.",
      500,
      "UNEXPECTED_DELETE_FAILURE"
    );
  }
}
