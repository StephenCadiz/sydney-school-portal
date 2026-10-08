import { NextRequest, NextResponse } from "next/server";

import {
  MESSAGE_ATTACHMENT_MAX_COUNT,
  type MessageAttachment,
} from "../../../../../lib/messageAttachmentConfig";
import { authenticateTeacherMessageRequest } from "../../../../../lib/teacherStudentMessagesServer";
import { supabaseAdmin } from "../../../../../lib/supabaseAdmin";
import { sendPortalPush } from "../../../../../lib/pushNotificationsServer";

function jsonError(message: string, status: number) {
  return NextResponse.json(
    { success: false, error: message },
    { status, headers: { "Cache-Control": "no-store" } }
  );
}

function validAttachment(value: unknown, teacherId: string): value is MessageAttachment {
  if (!value || typeof value !== "object") return false;
  const attachment = value as Partial<MessageAttachment>;
  return Boolean(
    attachment.id &&
      attachment.name &&
      attachment.type &&
      Number.isFinite(attachment.size) &&
      typeof attachment.path === "string" &&
      attachment.path.startsWith(`${teacherId}/`)
  );
}

export async function POST(request: NextRequest) {
  const auth = await authenticateTeacherMessageRequest(request);
  if (auth.error) {
    return jsonError(auth.error.message, auth.error.status);
  }

  const body = await request.json().catch(() => null);
  const messageId = typeof body?.messageId === "string" ? body.messageId.trim() : "";
  const subject = typeof body?.subject === "string" ? body.subject.trim() : "";
  const message = typeof body?.message === "string" ? body.message.trim() : "";
  const attachmentLink =
    typeof body?.attachment_link === "string" && body.attachment_link.trim()
      ? body.attachment_link.trim()
      : null;
  const attachments = Array.isArray(body?.attachments) ? body.attachments : [];

  if (!messageId || !subject || !message) {
    return jsonError("A reply message, subject, and source message are required.", 400);
  }

  if (
    attachments.length > MESSAGE_ATTACHMENT_MAX_COUNT ||
    attachments.some((attachment: unknown) => !validAttachment(attachment, auth.teacherId))
  ) {
    return jsonError("One or more attachments are invalid.", 400);
  }

  const { data: sourceMessage, error: sourceError } = await supabaseAdmin
    .from("messages")
    .select("id, sender_id, receiver_id, recipient_group, recipient_deleted_at")
    .eq("id", messageId)
    .maybeSingle();

  if (sourceError) {
    console.error("Teacher reply source lookup failed:", sourceError);
    return jsonError("Unable to verify the message being replied to.", 500);
  }

  if (
    !sourceMessage ||
    sourceMessage.receiver_id !== auth.teacherId ||
    sourceMessage.recipient_deleted_at
  ) {
    return jsonError("Message not found.", 404);
  }

  if (!sourceMessage.sender_id || sourceMessage.sender_id === auth.teacherId) {
    return jsonError("You cannot reply to this message.", 403);
  }

  const { data: senderProfile, error: senderError } = await supabaseAdmin
    .from("profiles")
    .select("id, role")
    .eq("id", sourceMessage.sender_id)
    .maybeSingle();

  if (senderError) {
    console.error("Teacher reply sender lookup failed:", senderError);
    return jsonError("Unable to verify the message sender.", 500);
  }

  if (senderProfile?.role !== "admin" && senderProfile?.role !== "teacher") {
    return jsonError("This message cannot receive a staff reply.", 403);
  }

  const { data: inserted, error: insertError } = await supabaseAdmin
    .from("messages")
    .insert({
      sender_id: auth.teacherId,
      receiver_id: sourceMessage.sender_id,
      recipient_group: null,
      subject,
      message,
      ...(attachmentLink ? { attachment_link: attachmentLink } : {}),
      ...(attachments.length ? { attachments } : {}),
    })
    .select("id, receiver_id, subject")
    .single();

  if (insertError) {
    console.error("Teacher staff reply insert failed:", insertError);
    return jsonError("Unable to send reply.", 500);
  }

  await sendPortalPush([String(inserted.receiver_id)], {
    eventKey: `message:${inserted.id}`,
    title: "New message",
    body: "You have a new message from your teacher.",
    url: "/student/messages",
    tag: `message:${inserted.id}`,
  });

  return NextResponse.json(
    { success: true, message: inserted },
    { headers: { "Cache-Control": "no-store" } }
  );
}
