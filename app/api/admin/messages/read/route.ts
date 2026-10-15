import { NextRequest, NextResponse } from "next/server";

import { requireExamBankAdmin } from "../../../../../lib/cambridgeExamBankServer";
import { supabaseAdmin } from "../../../../../lib/supabaseAdmin";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function jsonError(message: string, status = 400, code?: string) {
  return NextResponse.json(
    { success: false, error: message, ...(code ? { code } : {}) },
    { status, headers: { "Cache-Control": "no-store" } }
  );
}

export async function PATCH(request: NextRequest) {
  const admin = await requireExamBankAdmin(request);
  if (admin.response) return admin.response;

  const body = await request.json().catch(() => null);
  const messageId = typeof body?.message_id === "string" ? body.message_id.trim() : "";
  if (!UUID.test(messageId)) return jsonError("A valid message is required.", 400, "MESSAGE_REQUIRED");

  const { data: source, error: sourceError } = await supabaseAdmin
    .from("messages")
    .select("id, receiver_id, recipient_group")
    .eq("id", messageId)
    .maybeSingle();
  if (sourceError) return jsonError("Unable to verify the message.", 500, "MESSAGE_LOOKUP_FAILED");
  if (!source || !(
    source.receiver_id === admin.userId ||
    (source.recipient_group === "admin" && source.receiver_id == null)
  )) {
    return jsonError("Message not found.", 404, "MESSAGE_NOT_FOUND");
  }

  const { data: updated, error: updateError } = await supabaseAdmin
    .from("messages")
    .update({ read_at: new Date().toISOString() })
    .eq("id", messageId)
    .is("read_at", null)
    .select("id, read_at")
    .maybeSingle();
  if (updateError) return jsonError("Unable to mark this message as read.", 500, "MESSAGE_READ_FAILED");
  return NextResponse.json({ success: true, ...(updated || { id: messageId }) }, { headers: { "Cache-Control": "no-store" } });
}
