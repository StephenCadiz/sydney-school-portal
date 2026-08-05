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

function logSentMessageFailure(stage: string, error: unknown) {
  console.error("Admin sent messages request failed:", { stage, error });
}

function profileName(profile: any, fallback: string) {
  return `${profile?.first_name || ""} ${profile?.last_name || ""}`.trim() ||
    fallback;
}

export async function GET(request: NextRequest) {
  try {
    const admin = await requireExamBankAdmin(request);
    if (admin.response) return admin.response;

    const [permissionResult, adminProfilesResult] = await Promise.all([
      hasAdminStaffPermission(
        admin.userId,
        DELETE_ADMIN_MESSAGES_PERMISSION
      ),
      supabaseAdmin
        .from("profiles")
        .select("id")
        .eq("role", "admin"),
    ]);
    if (adminProfilesResult.error) throw adminProfilesResult.error;

    const adminIds = (adminProfilesResult.data || []).map((profile) => profile.id);
    if (adminIds.length === 0) {
      return NextResponse.json({
        sent_messages: [],
        can_delete_admin_messages: permissionResult,
      });
    }

    const { data: messages, error: messagesError } = await supabaseAdmin
      .from("messages")
      .select("*")
      .in("sender_id", adminIds)
      .is("admin_deleted_at", null)
      .order("created_at", { ascending: false });
    if (messagesError) throw messagesError;

    const receiverIds = Array.from(
      new Set(
        (messages || [])
          .map((message) => message.receiver_id)
          .filter((id): id is string => typeof id === "string" && Boolean(id))
      )
    );
    const { data: receivers, error: receiversError } = receiverIds.length
      ? await supabaseAdmin
          .from("profiles")
          .select("id, first_name, last_name, role")
          .in("id", receiverIds)
      : { data: [], error: null };
    if (receiversError) throw receiversError;

    const receiverById = new Map(
      (receivers || []).map((receiver) => [receiver.id, receiver])
    );
    const sentMessages = (messages || []).map((message) => {
      const receiver = receiverById.get(message.receiver_id);
      const isSharedAdminRecipient =
        message.recipient_group === "admin" && !message.receiver_id;

      return {
        ...message,
        receiver_name: isSharedAdminRecipient
          ? "Admin"
          : profileName(receiver, "Unknown user"),
        receiver_role: isSharedAdminRecipient ? "admin" : receiver?.role || "",
      };
    });

    return NextResponse.json(
      {
        sent_messages: sentMessages,
        can_delete_admin_messages: permissionResult,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    logSentMessageFailure("load", error);
    return examBankJsonError("Unable to load Admin messages.", 500);
  }
}
