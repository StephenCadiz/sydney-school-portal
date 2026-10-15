import { supabase } from "./supabase";
import type { MessageAttachment } from "./messageAttachmentConfig";

const messageDateTimeFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Madrid",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

export function formatMessageDateTime(value?: string | null) {
  if (!value) return "";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return messageDateTimeFormatter.format(date);
}

function formatTimeRange(startTime?: string | null, endTime?: string | null) {
  const start = startTime ? startTime.slice(0, 5) : "";
  const end = endTime ? endTime.slice(0, 5) : "";

  if (start && end) {
    return `${start}-${end}`;
  }

  return start || end || "Time not set";
}

async function enrichTeacherMessages(messages: any[]) {
  if (messages.length === 0) {
    return [];
  }

  const senderIds = Array.from(
    new Set(messages.map((message) => message.sender_id).filter(Boolean))
  );

  if (senderIds.length === 0) {
    return messages.map((message) => ({
      ...message,
      sender_name: "Unknown sender",
      sender_role: "",
      student_name: "Unknown sender",
      class_label: "",
    }));
  }

  const { data: profiles, error: profilesError } = await supabase
    .from("profiles")
    .select("id, first_name, last_name, role")
    .in("id", senderIds);

  if (profilesError) throw profilesError;

  const studentIds = Array.from(
    new Set(
      (profiles || [])
        .filter((profile) => profile.role === "student")
        .map((profile) => profile.id)
    )
  );

  const { data: enrolments, error: enrolmentsError } =
    studentIds.length > 0
      ? await supabase
          .from("current_class_enrolments")
          .select("student_id, class_id")
          .in("student_id", studentIds)
      : { data: [], error: null };

  if (enrolmentsError) throw enrolmentsError;

  const classIds = Array.from(
    new Set((enrolments || []).map((enrolment) => enrolment.class_id).filter(Boolean))
  );

  const { data: classes, error: classesError } =
    classIds.length > 0
      ? await supabase.from("classes").select("*").in("id", classIds)
      : { data: [], error: null };

  if (classesError) throw classesError;

  const levelIds = Array.from(
    new Set((classes || []).map((classroom) => classroom.level_id).filter(Boolean))
  );
  const classroomIds = Array.from(
    new Set((classes || []).map((classroom) => classroom.classroom_id).filter(Boolean))
  );

  const { data: levels, error: levelsError } =
    levelIds.length > 0
      ? await supabase.from("levels").select("id, name").in("id", levelIds)
      : { data: [], error: null };

  if (levelsError) throw levelsError;

  const { data: classrooms, error: classroomsError } =
    classroomIds.length > 0
      ? await supabase.from("classrooms").select("id, name").in("id", classroomIds)
      : { data: [], error: null };

  if (classroomsError) throw classroomsError;

  return messages.map((message) => {
    const profile = profiles?.find((item) => item.id === message.sender_id);
    const senderName = `${profile?.first_name || ""} ${
      profile?.last_name || ""
    }`.trim();
    const senderRole = profile?.role || "";

    if (senderRole === "admin") {
      return {
        ...message,
        sender_name:
          message.recipient_group === "admin" ? "Admin" : senderName || "Admin",
        sender_role: "admin",
        student_name: "",
        class_label: "",
      };
    }

    const enrolment = enrolments?.find(
      (item) => item.student_id === message.sender_id
    );
    const studentClass = classes?.find((item) => item.id === enrolment?.class_id);
    const level = levels?.find((item) => item.id === studentClass?.level_id);
    const classroom = classrooms?.find(
      (item) => item.id === studentClass?.classroom_id
    );
    const studentName = `${profile?.first_name || ""} ${
      profile?.last_name || ""
    }`.trim();

    return {
      ...message,
      sender_name: studentName || senderName || "Unknown student",
      sender_role: senderRole || "student",
      student_name: studentName || "Unknown student",
      class_label: studentClass
        ? `${level?.name || "Level not set"} - ${
            studentClass.days || "Days not set"
          } - ${formatTimeRange(
            studentClass.start_time,
            studentClass.end_time
          )} - ${classroom?.name || "No classroom assigned"}`
        : "Class not found",
    };
  });
}

async function enrichMessagesWithProfile(
  messages: any[],
  profileIdField: "sender_id" | "receiver_id",
  prefix: "sender" | "receiver"
) {
  if (messages.length === 0) {
    return [];
  }

  const profileIds = Array.from(
    new Set(messages.map((message) => message[profileIdField]).filter(Boolean))
  );

  if (profileIds.length === 0) {
    return messages.map((message) => ({
      ...message,
      [`${prefix}_name`]: "Unknown user",
      [`${prefix}_role`]: "",
    }));
  }

  const { data: profiles, error } = await supabase
    .from("profiles")
    .select("id, first_name, last_name, role")
    .in("id", profileIds);

  if (error) throw error;

  return messages.map((message) => {
    const profile = profiles?.find(
      (item) => item.id === message[profileIdField]
    );
    const name = `${profile?.first_name || ""} ${
      profile?.last_name || ""
    }`.trim();
    const canonicalName = isRosaProfile(profile) ? "Rosa Vara" : name;

    return {
      ...message,
      [`${prefix}_name`]:
        canonicalName ||
        (profile?.role === "admin" ? "Admin" : "Unknown user"),
      [`${prefix}_role`]: profile?.role || "",
    };
  });
}

function isStaffRole(role?: string | null) {
  return role === "admin" || role === "teacher";
}

export const TEACHER_ADMIN_RECIPIENT_VALUE = "admin-group";
export const ROSA_RECIPIENT_NAME = "Rosa Vara";

export function isRosaProfile(profile: any) {
  const firstName = String(profile?.first_name || "").trim().toLocaleLowerCase();
  const lastName = String(profile?.last_name || "").trim().toLocaleLowerCase();

  return profile?.role === "admin" && firstName.startsWith("rosa") && lastName === "vara";
}

type TeacherStaffMessageRecipient =
  | {
      type: "admin_group";
    }
  | {
      type: "teacher";
      teacherId: string;
    }
  | {
      type: "direct_staff";
      staffId: string;
    };

async function getStaffProfiles(excludeUserId?: string) {
  let query = supabase
    .from("profiles")
    .select("id, email, first_name, last_name, role")
    .in("role", ["admin", "teacher"])
    .order("role")
    .order("first_name");

  if (excludeUserId) {
    query = query.neq("id", excludeUserId);
  }

  const { data, error } = await query;

  if (error) throw error;

  return (data || []).filter((profile) => profile?.id && isStaffRole(profile.role));
}

export async function getMessages(
  senderId: string,
  receiverId: string
) {
  const { data, error } = await supabase
    .from("messages")
    .select("*")
    .or(
      `and(sender_id.eq.${senderId},receiver_id.eq.${receiverId}),and(sender_id.eq.${receiverId},receiver_id.eq.${senderId})`
    )
    .order("created_at");

  if (error) throw error;

  return data || [];
}

export async function getTeacherStaffRecipients(teacherId: string) {
  if (!teacherId) {
    throw new Error("Unable to identify the logged-in teacher.");
  }

  const mailbox = await getTeacherStaffMailbox();
  return mailbox.recipients;
}

export async function getTeacherStaffInboxMessages(teacherId: string) {
  if (!teacherId) {
    return [];
  }
  const mailbox = await getTeacherStaffMailbox();
  return mailbox.inbox;
}

export async function getTeacherStaffSentMessages(teacherId: string) {
  if (!teacherId) {
    return [];
  }
  const mailbox = await getTeacherStaffMailbox();
  return mailbox.sent;
}

async function getTeacherStaffMailbox() {
  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();
  if (sessionError || !session?.access_token) {
    throw new Error("Your session has expired. Please sign in again.");
  }

  const response = await fetch("/api/teacher/messages/staff", {
    headers: { Authorization: `Bearer ${session.access_token}` },
    cache: "no-store",
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.error || "Unable to load staff messages.");
  }

  return {
    inbox: Array.isArray(payload?.inbox) ? payload.inbox : [],
    sent: Array.isArray(payload?.sent) ? payload.sent : [],
    recipients: {
      admins: Array.isArray(payload?.recipients?.admins)
        ? payload.recipients.admins
        : [],
      teachers: Array.isArray(payload?.recipients?.teachers)
        ? payload.recipients.teachers
        : [],
    },
  };
}

export async function getUnreadTeacherStaffMessages(teacherId: string) {
  if (!teacherId) {
    return [];
  }

  const staffProfiles = await getStaffProfiles(teacherId);
  const staffIds = staffProfiles.map((profile) => profile.id);

  if (staffIds.length === 0) {
    return [];
  }

  const { data, error } = await supabase
    .from("messages")
    .select("*")
    .eq("receiver_id", teacherId)
    .in("sender_id", staffIds)
    .is("read_at", null)
    .is("recipient_deleted_at", null)
    .order("created_at", { ascending: false });

  if (error) throw error;

  return enrichMessagesWithProfile(data || [], "sender_id", "sender");
}

export async function getTeacherUnreadStaffMessageCount(teacherId: string) {
  const messages = await getUnreadTeacherStaffMessages(teacherId);

  return messages.length;
}

export async function sendTeacherStaffMessage({
  senderId,
  recipient,
  subject,
  message,
  attachment_link,
  attachments,
}: {
  senderId: string;
  recipient: TeacherStaffMessageRecipient;
  subject: string;
  message: string;
  attachment_link?: string | null;
  attachments?: MessageAttachment[];
}) {
  if (!senderId) {
    throw new Error("Unable to identify the logged-in teacher.");
  }

  if (!recipient) {
    throw new Error("Please select a staff recipient.");
  }

  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();
  if (sessionError || !session?.access_token) {
    throw new Error("Your session has expired. Please sign in again.");
  }

  const response = await fetch("/api/teacher/messages/staff", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      recipient,
      subject,
      message,
      attachment_link: attachment_link || null,
      attachments: attachments || [],
    }),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.error || "Unable to send message.");
  }
  return payload || { success: true };
}

/**
 * Send a reply to the staff member who sent the opened message.
 *
 * Replies use a server-side message-id check so a stale New Message recipient
 * cannot redirect the response to another staff member. The API also keeps
 * the existing RLS-scoped manual recipient flow unchanged.
 */
export async function sendTeacherStaffReply({
  messageId,
  subject,
  message,
  attachment_link,
  attachments,
}: {
  messageId: string;
  subject: string;
  message: string;
  attachment_link?: string | null;
  attachments?: MessageAttachment[];
}) {
  if (!messageId) {
    throw new Error("Unable to identify the message.");
  }

  const { data, error: sessionError } = await supabase.auth.getSession();
  const token = data.session?.access_token;

  if (sessionError || !token) {
    throw new Error("Your session has expired.");
  }

  const response = await fetch("/api/teacher/messages/reply", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messageId,
      subject,
      message,
      attachment_link: attachment_link || null,
      attachments: attachments || [],
    }),
  });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload.error || "Unable to send reply.");
  }

  return payload;
}

export async function markTeacherStaffMessageAsRead(
  messageId: string,
  teacherId: string
) {
  if (!messageId || !teacherId) throw new Error("Unable to identify the message.");
  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();
  if (sessionError || !session?.access_token) {
    throw new Error("Your session has expired. Please sign in again.");
  }
  const response = await fetch("/api/teacher/messages/staff", {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ message_id: messageId }),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.error || "Unable to mark message as read.");
  }
}

export async function hideTeacherReceivedStaffMessage(messageId: string) {
  if (!messageId) {
    throw new Error("Unable to identify the message.");
  }

  const { data, error } = await supabase.rpc("hide_received_staff_message", {
    p_message_id: messageId,
  });

  if (error) {
    throw new Error(error.message || "Unable to remove message from inbox.");
  }

  return data || { success: true };
}

export async function hideTeacherSentStaffMessage(messageId: string) {
  if (!messageId) {
    throw new Error("Unable to identify the message.");
  }

  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();

  if (sessionError || !session?.access_token) {
    throw new Error("Authentication required.");
  }

  const response = await fetch(
    `/api/teacher/messages/sent/${encodeURIComponent(messageId)}`,
    {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${session.access_token}`,
      },
    }
  );
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const error = new Error(
      payload?.error || "Unable to remove message from sent."
    ) as Error & { code?: string; status?: number };
    error.code = payload?.code;
    error.status = response.status;
    throw error;
  }

  return payload || { success: true };
}

export async function sendMessage(message: any) {
  const { error } = await supabase
    .from("messages")
    .insert([message]);

  if (error) throw error;
}

export async function sendStudentMessage(message: {
  receiver_id: string;
  subject: string;
  message: string;
  attachment_link?: string | null;
  attachments?: MessageAttachment[];
}) {
  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();
  if (sessionError || !session?.access_token) {
    throw new Error("Authentication required.");
  }

  const response = await fetch("/api/student/messages", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(message),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(payload?.error || "Unable to send message.") as Error & {
      code?: string;
      status?: number;
    };
    error.code = payload?.code;
    error.status = response.status;
    throw error;
  }
  return payload || { success: true };
}

export async function getStudentMessages() {
  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();
  if (sessionError || !session?.access_token) {
    throw new Error("Authentication required.");
  }

  const response = await fetch("/api/student/messages", {
    headers: { Authorization: `Bearer ${session.access_token}` },
    cache: "no-store",
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(payload?.error || "Unable to load messages.") as Error & {
      code?: string;
      status?: number;
    };
    error.code = payload?.code;
    error.status = response.status;
    throw error;
  }
  return {
    inbox: Array.isArray(payload?.inbox) ? payload.inbox : [],
    sent: Array.isArray(payload?.sent) ? payload.sent : [],
  };
}

export async function markStudentMessageAsRead(messageId: string) {
  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();
  if (sessionError || !session?.access_token) {
    throw new Error("Authentication required.");
  }

  const response = await fetch("/api/student/messages", {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ message_id: messageId }),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(payload?.error || "Unable to mark message as read.") as Error & {
      code?: string;
      status?: number;
    };
    error.code = payload?.code;
    error.status = response.status;
    throw error;
  }
  return payload || { success: true };
}

export async function getAdminInboxMessages(adminId: string) {
  const { data, error } = await supabase
    .from("messages")
    .select("*")
    .or(`receiver_id.eq.${adminId},recipient_group.eq.admin`)
    .is("admin_deleted_at", null)
    .order("created_at", { ascending: false });

  if (error) throw error;

  return enrichMessagesWithProfile(data || [], "sender_id", "sender");
}

/**
 * Count received Admin-inbox messages that still require attention.
 *
 * This deliberately does not inspect read_at: opening a message is not the
 * same as marking it dealt with. The dedicated dealt_with_at field is the
 * only state that clears the Admin dashboard indicator.
 */
export async function getAdminOutstandingMessageCount(adminId: string) {
  if (!adminId) {
    throw new Error("Unable to identify the logged-in admin.");
  }

  const { count, error } = await supabase
    .from("messages")
    .select("id", { count: "exact", head: true })
    .or(`receiver_id.eq.${adminId},and(recipient_group.eq.admin,receiver_id.is.null)`)
    .is("admin_deleted_at", null)
    .is("dealt_with_at", null)
    // A message sent by this Admin is not a received item requiring attention.
    .neq("sender_id", adminId);

  if (error) throw error;

  return count || 0;
}

/** @deprecated Use getAdminOutstandingMessageCount instead. */
export async function getAdminUnreadTeacherMessageCount(adminId: string) {
  return getAdminOutstandingMessageCount(adminId);
}

export async function getAdminSentMessages(adminId: string) {
  const { data, error } = await supabase
    .from("messages")
    .select("*")
    .eq("sender_id", adminId)
    .is("admin_deleted_at", null)
    .order("created_at", { ascending: false });

  if (error) throw error;

  return enrichMessagesWithProfile(data || [], "receiver_id", "receiver");
}

export async function markSharedAdminMessageAsRead(messageId: string) {
  if (!messageId) {
    throw new Error("Unable to identify the message.");
  }

  const { data, error } = await supabase.rpc("mark_shared_admin_message_as_read", {
    p_message_id: messageId,
  });

  if (error) {
    throw new Error(error.message || "Unable to mark admin message as read.");
  }

  return data || { success: true };
}

export async function sendAdminMessageToTeacher({
  adminId,
  teacherId,
  subject,
  message,
  attachment_link,
  attachments,
  senderIdentity = "admin",
}: {
  adminId: string;
  teacherId: string;
  subject: string;
  message: string;
  attachment_link?: string;
  attachments?: MessageAttachment[];
  senderIdentity?: "admin" | "rosa";
}) {
  const { data: senderProfile, error: senderError } = await supabase
    .from("profiles")
    .select("id, first_name, last_name, role")
    .eq("id", adminId)
    .single();

  if (senderError) throw senderError;

  if (senderProfile?.role !== "admin") {
    throw new Error("Only Admin users can send staff messages.");
  }

  if (senderIdentity === "rosa" && !isRosaProfile(senderProfile)) {
    throw new Error("Only Rosa Vara can send messages as Rosa Vara.");
  }

  const payload: any = {
    sender_id: adminId,
    receiver_id: teacherId,
    subject,
    message,
    recipient_group:
      isRosaProfile(senderProfile) && senderIdentity === "admin"
        ? "admin"
        : null,
  };

  if (attachment_link) {
    payload.attachment_link = attachment_link;
  }
  if (attachments?.length) payload.attachments = attachments;

  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error("Your session has expired. Please sign in again.");
  const response = await fetch("/api/admin/messages/send", {
    method: "POST",
    headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ teacherId, subject, message, attachment_link, attachments, senderIdentity }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "Unable to send message.");
  return result || { success: true };
}

export async function sendAdminMessageToAllTeachers({
  adminId,
  teachers,
  subject,
  message,
  attachment_link,
  attachments,
  senderIdentity = "admin",
}: {
  adminId: string;
  teachers: any[];
  subject: string;
  message: string;
  attachment_link?: string;
  attachments?: MessageAttachment[];
  senderIdentity?: "admin" | "rosa";
}) {
  const { data: senderProfile, error: senderError } = await supabase
    .from("profiles")
    .select("id, first_name, last_name, role")
    .eq("id", adminId)
    .single();

  if (senderError) throw senderError;

  if (senderProfile?.role !== "admin") {
    throw new Error("Only Admin users can send staff messages.");
  }

  if (senderIdentity === "rosa" && !isRosaProfile(senderProfile)) {
    throw new Error("Only Rosa Vara can send messages as Rosa Vara.");
  }

  const sharedAdminIdentity =
    isRosaProfile(senderProfile) && senderIdentity === "admin";

  const rows = (teachers || [])
    .filter((teacher) => teacher?.id)
    .map((teacher) => {
      const payload: any = {
        sender_id: adminId,
        receiver_id: teacher.id,
        subject,
        message,
        recipient_group: sharedAdminIdentity ? "admin" : null,
      };

      if (attachment_link) {
        payload.attachment_link = attachment_link;
      }
      if (attachments?.length) payload.attachments = attachments;

      return payload;
    });

  if (rows.length === 0) {
    throw new Error("No valid teachers found.");
  }

  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error("Your session has expired. Please sign in again.");
  const response = await fetch("/api/admin/messages/send", {
    method: "POST",
    headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ teacherIds: rows.map((row) => row.receiver_id), subject, message, attachment_link, attachments, senderIdentity }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "Unable to send message.");
  return result || { success: true, count: rows.length };
}

export async function sendAdminStaffReply({
  messageId,
  subject,
  message,
  attachment_link,
  attachments,
}: {
  messageId: string;
  subject: string;
  message: string;
  attachment_link?: string | null;
  attachments?: MessageAttachment[];
}) {
  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();
  if (sessionError || !session?.access_token) {
    throw new Error("Your Admin session has expired. Please sign in again.");
  }

  const response = await fetch("/api/admin/messages/reply", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messageId,
      subject,
      message,
      attachment_link: attachment_link || null,
      attachments: attachments || [],
    }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "Unable to send reply.");
  return result || { success: true };
}

export async function getInboxMessages(
  userId: string,
  otherUserId: string
) {
  const { data, error } = await supabase
    .from("messages")
    .select("*")
    .eq("receiver_id", userId)
    .eq("sender_id", otherUserId)
    .order("created_at", { ascending: false });

  if (error) throw error;

  return data || [];
}

export async function getSentMessages(
  userId: string,
  otherUserId: string
) {
  const { data, error } = await supabase
    .from("messages")
    .select("*")
    .eq("sender_id", userId)
    .eq("receiver_id", otherUserId)
    .order("created_at", { ascending: false });

  if (error) throw error;

  return data || [];
}

export async function markMessageAsRead(
  messageId: string,
  receiverId: string
) {
  if (!messageId || !receiverId) throw new Error("Unable to identify the message.");
  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();
  if (sessionError || !session?.access_token) {
    throw new Error("Your Admin session has expired. Please sign in again.");
  }
  const response = await fetch("/api/admin/messages/read", {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ message_id: messageId }),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.error || "Unable to mark message as read.");
  }
}

export async function getTeacherSentMessagesForClass(
  teacherId: string,
  studentIds: string[]
) {
  if (studentIds.length === 0) {
    return [];
  }

  const { data, error } = await supabase
    .from("messages")
    .select("*")
    .eq("sender_id", teacherId)
    .in("receiver_id", studentIds)
    .order("created_at", { ascending: false });

  if (error) throw error;

  return data || [];
}

export async function getTeacherInboxMessages(teacherId: string) {
  const { data, error } = await supabase
    .from("messages")
    .select("*")
    .eq("receiver_id", teacherId)
    .order("created_at", { ascending: false });

  if (error) throw error;

  return enrichTeacherMessages(data || []);
}

export async function getUnreadTeacherMessages(teacherId: string) {
  const { data, error } = await supabase
    .from("messages")
    .select("*")
    .eq("receiver_id", teacherId)
    .is("read_at", null)
    .order("created_at", { ascending: false });

  if (error) throw error;

  return enrichTeacherMessages(data || []);
}

export async function getUnreadMessagesForStudent(
  studentId: string,
  teacherId: string
) {
  const { data, error } = await supabase
    .from("messages")
    .select("*")
    .eq("receiver_id", studentId)
    .eq("sender_id", teacherId)
    .is("read_at", null)
    .order("created_at", { ascending: false });

  if (error) throw error;

  return data || [];
}

export async function markTeacherMessagesAsRead(
  studentId: string,
  teacherId: string
) {
  const { error } = await supabase
    .from("messages")
    .update({
      read_at: new Date().toISOString(),
    })
    .eq("receiver_id", studentId)
    .eq("sender_id", teacherId)
    .is("read_at", null);

  if (error) throw error;
}
