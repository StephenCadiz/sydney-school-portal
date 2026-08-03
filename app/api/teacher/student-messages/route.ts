import { NextRequest, NextResponse } from "next/server";

import { supabaseAdmin } from "../../../../lib/supabaseAdmin";
import {
  authenticateTeacherMessageRequest,
  loadTeacherAuthorisedStudentClassInfo,
  logTeacherStudentMessageFailure,
  type StudentClassInfo,
} from "../../../../lib/teacherStudentMessagesServer";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MESSAGE_COLUMNS =
  "id, sender_id, receiver_id, recipient_group, subject, message, attachment_link, created_at, read_at, recipient_deleted_at";

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

function safeMessage(message: any, student: StudentClassInfo) {
  return {
    id: String(message.id),
    sender_id: student.studentId,
    sender_name: student.name,
    class_id: student.classId,
    class_name: student.className,
    level_name: student.levelName,
    course_type: student.courseType,
    subject: message.subject ? String(message.subject) : "",
    message: message.message ? String(message.message) : "",
    attachment_link: message.attachment_link
      ? String(message.attachment_link)
      : null,
    created_at: message.created_at || null,
    read_at: message.read_at || null,
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
    const { data: messages, error: messagesError } = await supabaseAdmin
      .from("messages")
      .select(MESSAGE_COLUMNS)
      .eq("receiver_id", auth.teacherId)
      .is("recipient_group", null)
      .is("recipient_deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(500);
    if (messagesError) throw messagesError;

    const studentInfoById = await loadTeacherAuthorisedStudentClassInfo(
      auth.teacherId,
      (messages || []).map((message) => String(message.sender_id || ""))
    );
    const safeMessages = (messages || [])
      .map((message) => {
        const student = studentInfoById.get(String(message.sender_id));
        return student ? safeMessage(message, student) : null;
      })
      .filter((message): message is NonNullable<typeof message> => message !== null);

    return NextResponse.json(
      {
        messages: safeMessages,
        unread_count: safeMessages.filter((message) => !message.read_at).length,
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
      return NextResponse.json({ message: safeMessage(loaded.message, loaded.student) });
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

    return NextResponse.json({ message: safeMessage(updated, loaded.student) });
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
    if (!isOnlyAllowedKeys(record, ["student_id", "subject", "message", "attachment_link"])) {
      return jsonError("The request contains unsupported fields.", 400);
    }

    const studentId = String(record.student_id || "").trim();
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

    const students = await loadTeacherAuthorisedStudentClassInfo(
      auth.teacherId,
      [studentId]
    );
    if (!students.has(studentId)) {
      return jsonError("You are not allowed to message this student.", 403);
    }

    const { data: reply, error: insertError } = await supabaseAdmin
      .from("messages")
      .insert({
        sender_id: auth.teacherId,
        receiver_id: studentId,
        recipient_group: null,
        subject,
        message,
        attachment_link: attachmentLink,
      })
      .select("id, receiver_id, subject, message, attachment_link, created_at")
      .maybeSingle();
    if (insertError) throw insertError;
    if (!reply) return jsonError("Unable to send reply.", 500);

    return NextResponse.json({
      reply: {
        id: String(reply.id),
        receiver_id: String(reply.receiver_id),
        subject: String(reply.subject || ""),
        message: String(reply.message || ""),
        attachment_link: reply.attachment_link ? String(reply.attachment_link) : null,
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
