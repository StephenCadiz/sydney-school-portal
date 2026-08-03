import { supabase } from "./supabase";

export type TeacherStudentMessage = {
  id: string;
  sender_id: string;
  sender_name: string;
  class_id: string;
  class_name: string;
  level_name: string;
  course_type: string;
  subject: string;
  message: string;
  attachment_link: string | null;
  created_at: string | null;
  read_at: string | null;
};

export type TeacherStudentMessagesPayload = {
  messages: TeacherStudentMessage[];
  unread_count: number;
};

async function getAccessToken() {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    throw new Error("Authentication required.");
  }

  return session.access_token;
}

async function request(path: string, init: RequestInit = {}) {
  const accessToken = await getAccessToken();
  const response = await fetch(path, {
    ...init,
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(init.headers || {}),
    },
  });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload?.error || "Unable to load student messages.");
  }

  return payload;
}

export async function getTeacherStudentMessages(): Promise<TeacherStudentMessagesPayload> {
  const payload = await request("/api/teacher/student-messages");

  return {
    messages: Array.isArray(payload?.messages) ? payload.messages : [],
    unread_count: Number(payload?.unread_count || 0),
  };
}

export async function markTeacherStudentMessageAsRead(messageId: string) {
  const payload = await request("/api/teacher/student-messages", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message_id: messageId }),
  });

  return payload?.message as TeacherStudentMessage;
}

export async function replyToTeacherStudentMessage(input: {
  studentId: string;
  subject: string;
  message: string;
  attachmentLink?: string | null;
}) {
  return request("/api/teacher/student-messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      student_id: input.studentId,
      subject: input.subject,
      message: input.message,
      attachment_link: input.attachmentLink || null,
    }),
  });
}

export async function hideTeacherStudentMessage(messageId: string) {
  return request("/api/teacher/student-messages", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message_id: messageId }),
  });
}
