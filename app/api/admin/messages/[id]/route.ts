import { NextRequest, NextResponse } from "next/server";

import {
  DELETE_ADMIN_MESSAGES_PERMISSION,
  hasAdminStaffPermission,
} from "../../../../../lib/adminMessagePermissionsServer";
import {
  examBankJsonError,
  requireExamBankAdmin,
} from "../../../../../lib/cambridgeExamBankServer";
import { supabaseAdmin } from "../../../../../lib/supabaseAdmin";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function logDeleteFailure(stage: string, error: unknown) {
  console.error("Admin message deletion failed:", { stage, error });
}

export async function DELETE(
  request: NextRequest,
  routeContext: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await requireExamBankAdmin(request);
    if (admin.response) return admin.response;

    const canDelete = await hasAdminStaffPermission(
      admin.userId,
      DELETE_ADMIN_MESSAGES_PERMISSION
    );
    if (!canDelete) {
      return examBankJsonError("Admin permission required.", 403);
    }

    const { id } = await routeContext.params;
    if (!UUID_PATTERN.test(id)) {
      return examBankJsonError("Admin message not found.", 404);
    }

    const { data: message, error: messageError } = await supabaseAdmin
      .from("messages")
      .select(
        "id, sender_id, receiver_id, recipient_group, dealt_with_at, admin_deleted_at"
      )
      .eq("id", id)
      .is("admin_deleted_at", null)
      .maybeSingle();
    if (messageError) {
      logDeleteFailure("message-lookup", messageError);
      return examBankJsonError("Unable to remove this message.", 500);
    }
    if (!message) {
      return examBankJsonError("Admin message not found.", 404);
    }

    const { data: sender, error: senderError } = await supabaseAdmin
      .from("profiles")
      .select("role")
      .eq("id", message.sender_id)
      .maybeSingle();
    if (senderError) {
      logDeleteFailure("sender-lookup", senderError);
      return examBankJsonError("Unable to remove this message.", 500);
    }

    const isAdminSent = sender?.role === "admin";
    const isAdminDealtWith =
      Boolean(message.dealt_with_at) &&
      (message.receiver_id === admin.userId ||
        message.recipient_group === "admin");
    if (!isAdminSent && !isAdminDealtWith) {
      return examBankJsonError(
        "This message cannot be removed from Admin Messages.",
        403
      );
    }

    const { data: removed, error: updateError } = await supabaseAdmin
      .from("messages")
      .update({
        admin_deleted_at: new Date().toISOString(),
        admin_deleted_by: admin.userId,
      })
      .eq("id", id)
      .is("admin_deleted_at", null)
      .select("id")
      .maybeSingle();
    if (updateError || !removed) {
      logDeleteFailure("soft-delete", updateError);
      return examBankJsonError("Unable to remove this message.", 500);
    }

    return NextResponse.json({ success: true, id });
  } catch (error) {
    logDeleteFailure("unexpected", error);
    return examBankJsonError("Unable to remove this message.", 500);
  }
}
