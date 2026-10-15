import { NextRequest, NextResponse } from "next/server";

import {
  MESSAGE_ATTACHMENT_MAX_COUNT,
  type MessageAttachment,
} from "../../../../../lib/messageAttachmentConfig";
import { authenticateTeacherMessageRequest } from "../../../../../lib/teacherStudentMessagesServer";
import { sendPortalPush } from "../../../../../lib/pushNotificationsServer";
import { supabaseAdmin } from "../../../../../lib/supabaseAdmin";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ADMIN_GROUP = "admin-group";

function jsonError(message: string, status = 400, code?: string) {
  return NextResponse.json(
    { success: false, error: message, ...(code ? { code } : {}) },
    { status, headers: { "Cache-Control": "no-store" } }
  );
}

function profileName(profile: any, fallback = "Staff member") {
  return `${profile?.first_name || ""} ${profile?.last_name || ""}`.trim() || fallback;
}

function isRosa(profile: any) {
  return (
    profile?.role === "admin" &&
    String(profile?.first_name || "").trim().toLowerCase().startsWith("rosa") &&
    String(profile?.last_name || "").trim().toLowerCase() === "vara"
  );
}

async function loadStaffProfiles(teacherId: string) {
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("id, email, first_name, last_name, role")
    .in("role", ["admin", "teacher"])
    .neq("id", teacherId)
    .order("role")
    .order("first_name");
  if (error) throw error;
  return (data || []).filter((profile) => UUID.test(String(profile.id || "")));
}

async function enrich(messages: any[], profiles: any[]) {
  const byId = new Map((profiles || []).map((profile) => [String(profile.id), profile]));
  return messages.map((message) => {
    const sender = byId.get(String(message.sender_id || ""));
    const receiver = byId.get(String(message.receiver_id || ""));
    const sharedAdmin = message.recipient_group === "admin" && !message.receiver_id;
    return {
      ...message,
      sender_name: profileName(sender, "Staff member"),
      sender_role: sender?.role || "",
      receiver_name: sharedAdmin ? "Admin" : profileName(receiver, "Staff member"),
      receiver_role: sharedAdmin ? "admin" : receiver?.role || "",
    };
  });
}

function recipientPayload(profiles: any[]) {
  const admins = profiles.filter((profile) => profile.role === "admin");
  return {
    admins: [
      {
        id: ADMIN_GROUP,
        first_name: "Admin",
        last_name: "",
        email: "",
        role: "admin",
        is_group: true,
      },
      ...admins.map((profile) => ({ ...profile, is_rosa: isRosa(profile) })),
    ],
    teachers: profiles.filter((profile) => profile.role === "teacher"),
  };
}

async function loadMailbox(teacherId: string) {
  const profiles = await loadStaffProfiles(teacherId);
  const staffIds = profiles.map((profile) => String(profile.id));

  const [inboxResult, directSentResult, groupSentResult] = await Promise.all([
    supabaseAdmin
      .from("messages")
      .select("*")
      .eq("receiver_id", teacherId)
      .in("sender_id", staffIds.length ? staffIds : ["00000000-0000-0000-0000-000000000000"])
      .is("recipient_deleted_at", null)
      .order("created_at", { ascending: false }),
    supabaseAdmin
      .from("messages")
      .select("*")
      .eq("sender_id", teacherId)
      .in("receiver_id", staffIds.length ? staffIds : ["00000000-0000-0000-0000-000000000000"])
      .is("sender_deleted_at", null),
    supabaseAdmin
      .from("messages")
      .select("*")
      .eq("sender_id", teacherId)
      .eq("recipient_group", "admin")
      .is("sender_deleted_at", null),
  ]);

  if (inboxResult.error) throw inboxResult.error;
  if (directSentResult.error) throw directSentResult.error;
  if (groupSentResult.error) throw groupSentResult.error;

  const sent = [...(directSentResult.data || []), ...(groupSentResult.data || [])]
    .sort((first, second) =>
      new Date(second.created_at || 0).getTime() - new Date(first.created_at || 0).getTime()
    );
  const messageProfiles = profiles;

  return {
    inbox: await enrich(inboxResult.data || [], messageProfiles),
    sent: await enrich(sent, messageProfiles),
    recipients: recipientPayload(profiles),
  };
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

function logFailure(stage: string, error: any) {
  console.error("Teacher staff message request failed:", {
    stage,
    message: error?.message || null,
    code: error?.code || null,
    details: error?.details || null,
    hint: error?.hint || null,
  });
}

export async function GET(request: NextRequest) {
  const auth = await authenticateTeacherMessageRequest(request);
  if (auth.error) return jsonError(auth.error.message, auth.error.status, "TEACHER_AUTHORIZATION_FAILED");

  try {
    return NextResponse.json(await loadMailbox(auth.teacherId), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    logFailure("load", error);
    return jsonError("Unable to load staff messages.", 500, "STAFF_MESSAGES_LOAD_FAILED");
  }
}

export async function PATCH(request: NextRequest) {
  const auth = await authenticateTeacherMessageRequest(request);
  if (auth.error) return jsonError(auth.error.message, auth.error.status, "TEACHER_AUTHORIZATION_FAILED");

  const body = await request.json().catch(() => null);
  const messageId = String(body?.message_id || "").trim();
  if (!UUID.test(messageId)) return jsonError("A valid message is required.", 400, "MESSAGE_REQUIRED");

  const { data: updated, error } = await supabaseAdmin
    .from("messages")
    .update({ read_at: new Date().toISOString() })
    .eq("id", messageId)
    .eq("receiver_id", auth.teacherId)
    .is("read_at", null)
    .select("id, read_at")
    .maybeSingle();
  if (error) {
    logFailure("mark-read", error);
    return jsonError("Unable to mark this message as read.", 500, "MESSAGE_READ_FAILED");
  }
  if (!updated) return jsonError("Message not found.", 404, "MESSAGE_NOT_FOUND");
  return NextResponse.json({ success: true, ...updated }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: NextRequest) {
  const auth = await authenticateTeacherMessageRequest(request);
  if (auth.error) return jsonError(auth.error.message, auth.error.status, "TEACHER_AUTHORIZATION_FAILED");

  const body = await request.json().catch(() => null);
  const subject = typeof body?.subject === "string" ? body.subject.trim() : "";
  const message = typeof body?.message === "string" ? body.message.trim() : "";
  const recipient = body?.recipient;
  if (!subject) return jsonError("Subject is required.");
  if (!message) return jsonError("Message is required.");
  if (!recipient || typeof recipient !== "object") return jsonError("Please select a staff recipient.");

  const attachments = Array.isArray(body?.attachments) ? body.attachments : [];
  if (attachments.length > MESSAGE_ATTACHMENT_MAX_COUNT || attachments.some((item: unknown) => !validAttachment(item, auth.teacherId))) {
    return jsonError("One or more attachments are invalid.");
  }
  const attachmentLink = typeof body?.attachment_link === "string" ? body.attachment_link.trim() || null : null;

  let receiverId: string | null = null;
  let recipientGroup: "admin" | null = null;
  if (recipient.type === "admin_group") {
    recipientGroup = "admin";
  } else {
    receiverId = String(recipient.teacherId || recipient.staffId || "").trim();
    if (!UUID.test(receiverId) || receiverId === auth.teacherId) return jsonError("Please select a valid staff recipient.");
    const { data: receiver, error: receiverError } = await supabaseAdmin
      .from("profiles")
      .select("id, role, active")
      .eq("id", receiverId)
      .maybeSingle();
    if (receiverError) {
      logFailure("recipient-lookup", receiverError);
      return jsonError("Unable to verify the staff recipient.", 500);
    }
    const expectedRole = recipient.type === "teacher" ? "teacher" : "admin";
    if (!receiver || receiver.active === false || receiver.role !== expectedRole) {
      return jsonError("The selected staff recipient is not available.", 403, "STAFF_RECIPIENT_UNAVAILABLE");
    }
  }

  const recentCutoff = new Date(Date.now() - 15_000).toISOString();
  let duplicateQuery = supabaseAdmin
    .from("messages")
    .select("id")
    .eq("sender_id", auth.teacherId)
    .eq("subject", subject)
    .eq("message", message)
    .gte("created_at", recentCutoff)
    .limit(1);
  duplicateQuery = receiverId
    ? duplicateQuery.eq("receiver_id", receiverId).is("recipient_group", null)
    : duplicateQuery.is("receiver_id", null).eq("recipient_group", "admin");
  const { data: existing, error: duplicateError } = await duplicateQuery;
  if (duplicateError) {
    logFailure("duplicate-check", duplicateError);
    return jsonError("Unable to send message.", 500);
  }
  if (existing?.[0]) return NextResponse.json({ success: true, duplicate: true, id: existing[0].id });

  const { data: inserted, error: insertError } = await supabaseAdmin
    .from("messages")
    .insert({
      sender_id: auth.teacherId,
      receiver_id: receiverId,
      recipient_group: recipientGroup,
      subject,
      message,
      ...(attachmentLink ? { attachment_link: attachmentLink } : {}),
      ...(attachments.length ? { attachments } : {}),
    })
    .select("id, receiver_id")
    .single();
  if (insertError) {
    logFailure("insert", insertError);
    return jsonError("Unable to send message.", 500, insertError.code);
  }

  try {
    const recipients = receiverId
      ? [receiverId]
      : (await supabaseAdmin.from("profiles").select("id").eq("role", "admin")).data?.map((profile) => String(profile.id)) || [];
    if (recipients.length) {
      await sendPortalPush(recipients, {
        eventKey: `message:${inserted.id}`,
        title: "New staff message",
        body: "You have a new staff message.",
        url: "/teacher/messages",
        tag: `message:${inserted.id}`,
        deliveryPolicy: "direct_message",
      });
    }
  } catch (error) {
    logFailure("push", error);
  }

  return NextResponse.json({ success: true, id: inserted.id }, { headers: { "Cache-Control": "no-store" } });
}
