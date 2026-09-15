import { NextRequest, NextResponse } from "next/server";

import { supabaseAdmin } from "../../../../../../lib/supabaseAdmin";

const BUCKET = "message-attachments";

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ messageId: string; attachmentId: string }> }
) {
  const value = request.headers.get("authorization") || "";
  const token = value.startsWith("Bearer ") ? value.slice(7) : "";
  if (!token) return jsonError("Authentication required.", 401);
  const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(token);
  if (authError || !authData.user) return jsonError("Authentication required.", 401);
  const { data: profile, error: profileError } = await supabaseAdmin
    .from("profiles")
    .select("id, role")
    .eq("id", authData.user.id)
    .maybeSingle();
  if (profileError || !profile) return jsonError("Unable to verify account access.", 500);

  const { messageId, attachmentId } = await context.params;
  const { data: message, error: messageError } = await supabaseAdmin
    .from("messages")
    .select("id, sender_id, receiver_id, recipient_group, attachments, admin_deleted_at, sender_deleted_at, recipient_deleted_at")
    .eq("id", messageId)
    .maybeSingle();
  if (messageError || !message) return jsonError("Message not found.", 404);

  const allowed =
    (message.sender_id === authData.user.id && !message.sender_deleted_at) ||
    (message.receiver_id === authData.user.id && !message.recipient_deleted_at) ||
    (profile.role === "admin" && message.recipient_group === "admin" && !message.admin_deleted_at);
  if (!allowed) return jsonError("You are not allowed to access this attachment.", 403);

  const attachment = (Array.isArray(message.attachments) ? message.attachments : [])
    .find((item: any) => String(item?.id || "") === attachmentId);
  if (!attachment || typeof attachment.path !== "string") return jsonError("Attachment not found.", 404);
  if (!attachment.path.startsWith(`${String(message.sender_id)}/`)) return jsonError("Attachment not found.", 404);

  const { data, error } = await supabaseAdmin.storage.from(BUCKET).createSignedUrl(attachment.path, 120);
  if (error || !data?.signedUrl) return jsonError("Unable to open attachment.", 500);
  return NextResponse.json({ signedUrl: data.signedUrl, expiresIn: 120 }, { headers: { "Cache-Control": "no-store" } });
}
