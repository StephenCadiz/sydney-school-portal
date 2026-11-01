import { NextRequest, NextResponse } from "next/server";

import { supabaseAdmin } from "../../../../lib/supabaseAdmin";
import { sendPortalPush } from "../../../../lib/pushNotificationsServer";
import {
  authenticateTeacherMessageRequest,
  loadTeacherAuthorisedStudentClassInfo,
  logTeacherStudentMessageFailure,
  type StudentClassInfo,
} from "../../../../lib/teacherStudentMessagesServer";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
// Keep the mailbox readable while an older linked database is waiting for the
// conversation migration. The response falls back to the message id until the
// conversation_id column is available.
const MESSAGE_COLUMNS = "*";

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

function safeMessage(
  message: any,
  student: StudentClassInfo,
  context: { folder: "inbox" | "sent"; teacherId: string; teacherName: string }
) {
  const sent = context.folder === "sent";
  return {
    id: String(message.id),
    sender_id: sent ? context.teacherId : student.studentId,
    sender_name: sent ? context.teacherName : student.name,
    sender_role: sent ? "teacher" : "student",
    receiver_id: sent ? student.studentId : context.teacherId,
    receiver_name: sent ? student.name : context.teacherName,
    receiver_role: sent ? "student" : "teacher",
    class_id: student.classId,
    class_name: student.className,
    level_name: student.levelName,
    course_type: student.courseType,
    subject: message.subject ? String(message.subject) : "",
    message: message.message ? String(message.message) : "",
    attachment_link: message.attachment_link
      ? String(message.attachment_link)
      : null,
    attachments: Array.isArray(message.attachments) ? message.attachments : [],
    created_at: message.created_at || null,
    read_at: message.read_at || null,
    conversation_id: message.conversation_id || message.id,
    folder: context.folder,
  };
}

async function loadAuthorisedStudentMessage(
  teacherId: string,
  messageId: string
) {
  const { data: message, error } = await supabaseAdmin
    .from("messages")
    .select(MESSAGE_COLUMNS)
    .eq("id", messageId)
    .eq("receiver_id", teacherId)
    .is("recipient_group", null)
    .is("recipient_deleted_at", null)
    .maybeSingle();
  if (error) throw error;
  if (!message) return { message: null, student: null, response: jsonError("Message not found.", 404) };

  const students = await loadTeacherAuthorisedStudentClassInfo(teacherId, [
    String(message.sender_id),
  ]);
  const student = students.get(String(message.sender_id)) || null;
  if (!student) {
    return {
      message: null,
      student: null,
      response: jsonError("You are not allowed to access this message.", 403),
    };
  }

  return { message, student, response: null };
}

function isOnlyAllowedKeys(record: Record<string, unknown>, keys: string[]) {
  return Object.keys(record).every((key) => keys.includes(key));
}

export async function GET(request: NextRequest) {
  const auth = await authenticateTeacherMessageRequest(request);
  if (auth.error) return jsonError(auth.error.message, auth.error.status);

  try {
    const [inboxResult, sentResult, teacherResult] = await Promise.all([
      supabaseAdmin
        .from("messages")
        .select(MESSAGE_COLUMNS)
        .eq("receiver_id", auth.teacherId)
        .is("recipient_group", null)
        .is("recipient_deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(500),
      supabaseAdmin
        .from("messages")
        .select(MESSAGE_COLUMNS)
        .eq("sender_id", auth.teacherId)
        .is("recipient_group", null)
        .is("sender_deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(500),
      supabaseAdmin
        .from("profiles")
        .select("id, first_name, last_name")
        .eq("id", auth.teacherId)
        .maybeSingle(),
    ]);
    if (inboxResult.error) throw inboxResult.error;
    if (sentResult.error) throw sentResult.error;
    if (teacherResult.error) throw teacherResult.error;

    const inboxStudentInfoById = await loadTeacherAuthorisedStudentClassInfo(
      auth.teacherId,
      (inboxResult.data || []).map((message) => String(message.sender_id || ""))
    );
    const sentStudentInfoById = await loadTeacherAuthorisedStudentClassInfo(
      auth.teacherId,
      (sentResult.data || []).map((message) => String(message.receiver_id || ""))
    );
    const teacherName = `${teacherResult.data?.first_name || ""} ${teacherResult.data?.last_name || ""}`.trim() || "Teacher";
    const safeInbox = (inboxResult.data || [])
      .map((message) => {
        const student = inboxStudentInfoById.get(String(message.sender_id));
        return student
          ? safeMessage(message, student, { folder: "inbox", teacherId: auth.teacherId, teacherName })
          : null;
      })
      .filter((message): message is NonNullable<typeof message> => message !== null);
    const safeSent = (sentResult.data || [])
      .map((message) => {
        const student = sentStudentInfoById.get(String(message.receiver_id));
        return student
          ? safeMessage(message, student, { folder: "sent", teacherId: auth.teacherId, teacherName })
          : null;
      })
      .filter((message): message is NonNullable<typeof message> => message !== null);

    return NextResponse.json(
      {
        inbox: safeInbox,
        sent: safeSent,
        // Keep this alias for older unread-count refresh callers.
        messages: safeInbox,
        unread_count: safeInbox.filter((message) => !message.read_at).length,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    logTeacherStudentMessageFailure("list", error);
    return jsonError("Unable to load student messages.", 500);
  }
}

export async function PATCH(request: NextRequest) {
  const auth = await authenticateTeacherMessageRequest(request);
  if (auth.error) return jsonError(auth.error.message, auth.error.status);

  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return jsonError("Invalid message read request.", 400);
    }
    const record = body as Record<string, unknown>;
    if (!isOnlyAllowedKeys(record, ["message_id"])) {
      return jsonError("The request contains unsupported fields.", 400);
    }
    const messageId = String(record.message_id || "").trim();
    if (!UUID.test(messageId)) return jsonError("Choose a valid message.", 400);

    const loaded = await loadAuthorisedStudentMessage(auth.teacherId, messageId);
    if (loaded.response || !loaded.message || !loaded.student) {
      return loaded.response || jsonError("Message not found.", 404);
    }

    if (loaded.message.read_at) {
      return NextResponse.json({ message: safeMessage(loaded.message, loaded.student, { folder: "inbox", teacherId: auth.teacherId, teacherName: "Teacher" }) });
    }

    const { data: updated, error: updateError } = await supabaseAdmin
      .from("messages")
      .update({ read_at: new Date().toISOString() })
      .eq("id", messageId)
      .eq("receiver_id", auth.teacherId)
      .is("read_at", null)
      .select(MESSAGE_COLUMNS)
      .maybeSingle();
    if (updateError) throw updateError;
    if (!updated) return jsonError("Message not found.", 404);

    return NextResponse.json({ message: safeMessage(updated, loaded.student, { folder: "inbox", teacherId: auth.teacherId, teacherName: "Teacher" }) });
  } catch (error) {
    logTeacherStudentMessageFailure("mark-read", error);
    return jsonError("Unable to mark the message as read.", 500);
  }
}

export async function POST(request: NextRequest) {
  const auth = await authenticateTeacherMessageRequest(request);
  if (auth.error) return jsonError(auth.error.message, auth.error.status);

  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return jsonError("Invalid reply request.", 400);
    }
    const record = body as Record<string, unknown>;
    if (!isOnlyAllowedKeys(record, ["student_id", "reply_to_message_id", "subject", "message", "attachment_link", "attachments"])) {
      return jsonError("The request contains unsupported fields.", 400);
    }

    const studentId = String(record.student_id || "").trim();
    const replyToMessageId = String(record.reply_to_message_id || "").trim();
    const subject = String(record.subject || "").trim();
    const message = String(record.message || "").trim();
    const attachmentLink =
      record.attachment_link === undefined || record.attachment_link === null
        ? null
        : typeof record.attachment_link === "string"
        ? record.attachment_link.trim() || null
        : null;
    if (!UUID.test(studentId)) return jsonError("Choose a valid student.", 400);
    if (!subject) return jsonError("Subject is required.", 400);
    if (!message) return jsonError("Message is required.", 400);
    if (record.attachment_link !== undefined && record.attachment_link !== null && typeof record.attachment_link !== "string") {
      return jsonError("Attachment link must be text.", 400);
    }
    if (record.attachments !== undefined && !Array.isArray(record.attachments)) {
      return jsonError("Attachments must be an array.", 400);
    }
    const attachments = Array.isArray(record.attachments) ? record.attachments : [];

    const students = await loadTeacherAuthorisedStudentClassInfo(
      auth.teacherId,
      [studentId]
    );
    if (!students.has(studentId)) {
      return jsonError("You are not allowed to message this student.", 403);
    }

    let conversationId: string | null = null;
    if (replyToMessageId) {
      if (!UUID.test(replyToMessageId)) return jsonError("The reply source is invalid.", 400);
      const { data: sourceMessage, error: sourceError } = await supabaseAdmin
        .from("messages")
        .select("*")
        .eq("id", replyToMessageId)
        .maybeSingle();
      if (sourceError) throw sourceError;
      if (
        !sourceMessage ||
        sourceMessage.recipient_deleted_at ||
        sourceMessage.sender_id !== studentId ||
        sourceMessage.receiver_id !== auth.teacherId
      ) {
        return jsonError("The message being replied to was not found.", 404);
      }
      // The conversation migration is additive. Older production databases do
      // not return `conversation_id` from `select("*")`, so do not include the
      // missing column in the reply insert. When the column is present, use the
      // source message as the thread root for legacy rows with a null value.
      const hasConversationColumn = Object.prototype.hasOwnProperty.call(
        sourceMessage,
        "conversation_id"
      );
      conversationId = hasConversationColumn
        ? sourceMessage.conversation_id || sourceMessage.id
        : null;
    }

    const { data: reply, error: insertError } = await supabaseAdmin
      .from("messages")
      .insert({
        sender_id: auth.teacherId,
        receiver_id: studentId,
        recipient_group: null,
        ...(conversationId ? { conversation_id: conversationId } : {}),
        subject,
        message,
        attachment_link: attachmentLink,
        attachments,
      })
      .select("id, receiver_id, subject, message, attachment_link, attachments, created_at")
      .maybeSingle();
    if (insertError) throw insertError;
    if (!reply) return jsonError("Unable to send reply.", 500);

    await sendPortalPush([studentId], {
      eventKey: `message:${reply.id}`,
      title: "New message",
      body: "You have a new message from your teacher.",
      url: "/student/messages",
      tag: `message:${reply.id}`,
      deliveryPolicy: "direct_message",
    });

    return NextResponse.json({
      reply: {
        id: String(reply.id),
        receiver_id: String(reply.receiver_id),
        subject: String(reply.subject || ""),
        message: String(reply.message || ""),
        attachment_link: reply.attachment_link ? String(reply.attachment_link) : null,
        attachments: Array.isArray(reply.attachments) ? reply.attachments : [],
        created_at: reply.created_at || null,
      },
    });
  } catch (error) {
    logTeacherStudentMessageFailure("reply", error);
    return jsonError("Unable to send reply.", 500);
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await authenticateTeacherMessageRequest(request);
  if (auth.error) return jsonError(auth.error.message, auth.error.status);

  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return jsonError("Invalid message delete request.", 400);
    }
    const record = body as Record<string, unknown>;
    if (!isOnlyAllowedKeys(record, ["message_id"])) {
      return jsonError("The request contains unsupported fields.", 400);
    }
    const messageId = String(record.message_id || "").trim();
    if (!UUID.test(messageId)) return jsonError("Choose a valid message.", 400);

    const loaded = await loadAuthorisedStudentMessage(auth.teacherId, messageId);
    if (loaded.response || !loaded.message) {
      return loaded.response || jsonError("Message not found.", 404);
    }
    if (!loaded.message.read_at) {
      return jsonError("Open this message before removing it from your inbox.", 400);
    }

    const { data: hiddenMessage, error: hideError } = await supabaseAdmin
      .from("messages")
      .update({ recipient_deleted_at: new Date().toISOString() })
      .eq("id", messageId)
      .eq("receiver_id", auth.teacherId)
      .is("recipient_group", null)
      .is("recipient_deleted_at", null)
      .select("id")
      .maybeSingle();
    if (hideError) throw hideError;
    if (!hiddenMessage) return jsonError("Message not found.", 404);

    return NextResponse.json({ hidden: true, id: messageId });
  } catch (error) {
    logTeacherStudentMessageFailure("hide", error);
    return jsonError("Unable to remove the message from your inbox.", 500);
  }
}
