import { NextRequest, NextResponse } from "next/server";

import {
  MESSAGE_ATTACHMENT_MAX_COUNT,
  type MessageAttachment,
} from "../../../../../lib/messageAttachmentConfig";
import { requireExamBankAdmin } from "../../../../../lib/cambridgeExamBankServer";
import { sendPortalPush } from "../../../../../lib/pushNotificationsServer";
import { supabaseAdmin } from "../../../../../lib/supabaseAdmin";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function jsonError(message: string, status = 400, code?: string) {
  return NextResponse.json(
    { success: false, error: message, ...(code ? { code } : {}) },
    { status, headers: { "Cache-Control": "no-store" } }
  );
}

function validAttachment(value: unknown, adminId: string): value is MessageAttachment {
  if (!value || typeof value !== "object") return false;
  const attachment = value as Partial<MessageAttachment>;
  return Boolean(
    attachment.id &&
      attachment.name &&
      attachment.type &&
      Number.isFinite(attachment.size) &&
      typeof attachment.path === "string" &&
      attachment.path.startsWith(`${adminId}/`)
  );
}

function logFailure(stage: string, error: any) {
  console.error("Admin staff message reply failed:", {
    stage,
    message: error?.message || null,
    code: error?.code || null,
    details: error?.details || null,
    hint: error?.hint || null,
  });
}

export async function POST(request: NextRequest) {
  const admin = await requireExamBankAdmin(request);
  if (admin.response) return admin.response;

  const body = await request.json().catch(() => null);
  const messageId = typeof body?.messageId === "string" ? body.messageId.trim() : "";
  const subject = typeof body?.subject === "string" ? body.subject.trim() : "";
  const message = typeof body?.message === "string" ? body.message.trim() : "";
  const attachments = Array.isArray(body?.attachments) ? body.attachments : [];
  const attachmentLink = typeof body?.attachment_link === "string" ? body.attachment_link.trim() || null : null;

  if (!UUID.test(messageId)) return jsonError("A valid source message is required.", 400, "MESSAGE_REQUIRED");
  if (!subject) return jsonError("Subject is required.");
  if (!message) return jsonError("Message is required.");
  if (attachments.length > MESSAGE_ATTACHMENT_MAX_COUNT || attachments.some((item: unknown) => !validAttachment(item, admin.userId))) {
    return jsonError("One or more attachments are invalid.");
  }

  const { data: sourceMessage, error: sourceError } = await supabaseAdmin
    .from("messages")
    .select("id, sender_id, receiver_id, recipient_group, recipient_deleted_at")
    .eq("id", messageId)
    .maybeSingle();
  if (sourceError) {
    logFailure("source-lookup", sourceError);
    return jsonError("Unable to verify the message being replied to.", 500);
  }
  if (!sourceMessage || sourceMessage.recipient_deleted_at) {
    return jsonError("Message not found.", 404, "MESSAGE_NOT_FOUND");
  }

  const isDirectToAdmin = sourceMessage.receiver_id === admin.userId;
  const isSharedAdminMessage = sourceMessage.recipient_group === "admin" && !sourceMessage.receiver_id;
  if (!isDirectToAdmin && !isSharedAdminMessage) {
    return jsonError("You can only reply to messages addressed to this Admin account.", 403, "MESSAGE_NOT_ADDRESSSED");
  }

  const senderId = String(sourceMessage.sender_id || "");
  if (!UUID.test(senderId) || senderId === admin.userId) {
    return jsonError("This message cannot receive a reply.", 403, "INVALID_REPLY_RECIPIENT");
  }
  const { data: senderProfile, error: senderError } = await supabaseAdmin
    .from("profiles")
    .select("id, role, active")
    .eq("id", senderId)
    .maybeSingle();
  if (senderError) {
    logFailure("sender-lookup", senderError);
    return jsonError("Unable to verify the message sender.", 500);
  }
  if (!senderProfile || senderProfile.active === false || !["admin", "teacher"].includes(senderProfile.role)) {
    return jsonError("This message cannot receive a staff reply.", 403, "INVALID_REPLY_RECIPIENT");
  }

  const recentCutoff = new Date(Date.now() - 15_000).toISOString();
  const { data: existing, error: duplicateError } = await supabaseAdmin
    .from("messages")
    .select("id")
    .eq("sender_id", admin.userId)
    .eq("receiver_id", senderId)
    .eq("subject", subject)
    .eq("message", message)
    .gte("created_at", recentCutoff)
    .limit(1);
  if (duplicateError) {
    logFailure("duplicate-check", duplicateError);
    return jsonError("Unable to send reply.", 500);
  }
  if (existing?.[0]) return NextResponse.json({ success: true, duplicate: true, id: existing[0].id });

  const { data: inserted, error: insertError } = await supabaseAdmin
    .from("messages")
    .insert({
      sender_id: admin.userId,
      receiver_id: senderId,
      recipient_group: null,
      subject,
      message,
      ...(attachmentLink ? { attachment_link: attachmentLink } : {}),
      ...(attachments.length ? { attachments } : {}),
    })
    .select("id, receiver_id")
    .single();
  if (insertError) {
    logFailure("insert", insertError);
    return jsonError("Unable to send reply.", 500, insertError.code);
  }

  try {
    await sendPortalPush([senderId], {
      eventKey: `message:${inserted.id}`,
      title: "New message from Admin",
      body: "You have a new message from Admin.",
      url: senderProfile.role === "teacher" ? "/teacher/messages" : "/admin/messages",
      tag: `message:${inserted.id}`,
      deliveryPolicy: "direct_message",
    });
  } catch (error) {
    logFailure("push", error);
  }

  return NextResponse.json({ success: true, id: inserted.id }, { headers: { "Cache-Control": "no-store" } });
}
