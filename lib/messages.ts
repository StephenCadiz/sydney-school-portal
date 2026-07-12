import { supabase } from "./supabase";

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
          .from("class_enrolments")
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
        sender_name: senderName || "Admin",
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

    return {
      ...message,
      [`${prefix}_name`]:
        name || (profile?.role === "admin" ? "Admin" : "Unknown user"),
      [`${prefix}_role`]: profile?.role || "",
    };
  });
}

function isStaffRole(role?: string | null) {
  return role === "admin" || role === "teacher";
}

export const TEACHER_ADMIN_RECIPIENT_VALUE = "admin-group";

type TeacherStaffMessageRecipient =
  | {
      type: "admin_group";
    }
  | {
      type: "teacher";
      teacherId: string;
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

  try {
    const profiles = await getStaffProfiles(teacherId);

    return {
      admins: [
        {
          id: TEACHER_ADMIN_RECIPIENT_VALUE,
          first_name: "Admin",
          last_name: "",
          email: "",
          role: "admin",
        },
      ],
      teachers: profiles.filter((profile) => profile.role === "teacher"),
    };
  } catch (error) {
    console.error("Unable to load teacher staff recipients:", error);
    throw new Error("Unable to load staff recipients.");
  }
}

export async function getTeacherStaffInboxMessages(teacherId: string) {
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
    .is("recipient_deleted_at", null)
    .order("created_at", { ascending: false });

  if (error) throw error;

  return enrichMessagesWithProfile(data || [], "sender_id", "sender");
}

export async function getTeacherStaffSentMessages(teacherId: string) {
  if (!teacherId) {
    return [];
  }

  const staffProfiles = await getStaffProfiles(teacherId);
  const staffIds = staffProfiles.map((profile) => profile.id);

  const oneToOneQuery =
    staffIds.length > 0
      ? supabase
          .from("messages")
          .select("*")
          .eq("sender_id", teacherId)
          .in("receiver_id", staffIds)
          .is("sender_deleted_at", null)
      : Promise.resolve({ data: [], error: null });

  const sharedAdminQuery = supabase
    .from("messages")
    .select("*")
    .eq("sender_id", teacherId)
    .eq("recipient_group", "admin")
    .is("sender_deleted_at", null);

  const [
    { data: oneToOneData, error: oneToOneError },
    { data: sharedAdminData, error: sharedAdminError },
  ] = await Promise.all([oneToOneQuery, sharedAdminQuery]);

  if (oneToOneError) throw oneToOneError;
  if (sharedAdminError) throw sharedAdminError;

  const oneToOneMessages = await enrichMessagesWithProfile(
    oneToOneData || [],
    "receiver_id",
    "receiver"
  );

  const sharedAdminMessages = (sharedAdminData || []).map((message) => ({
    ...message,
    receiver_name: "Admin",
    receiver_role: "admin",
  }));

  return [...oneToOneMessages, ...sharedAdminMessages].sort((first, second) => {
    const firstTime = first.created_at ? new Date(first.created_at).getTime() : 0;
    const secondTime = second.created_at ? new Date(second.created_at).getTime() : 0;

    return secondTime - firstTime;
  });
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

export async function sendTeacherStaffMessage({
  senderId,
  recipient,
  subject,
  message,
  attachment_link,
}: {
  senderId: string;
  recipient: TeacherStaffMessageRecipient;
  subject: string;
  message: string;
  attachment_link?: string | null;
}) {
  if (!senderId) {
    throw new Error("Unable to identify the logged-in teacher.");
  }

  if (!recipient) {
    throw new Error("Please select a staff recipient.");
  }

  const profileIds =
    recipient.type === "teacher" ? [senderId, recipient.teacherId] : [senderId];

  const { data: profiles, error: profilesError } = await supabase
    .from("profiles")
    .select("id, role")
    .in("id", profileIds);

  if (profilesError) throw profilesError;

  const senderProfile = profiles?.find((profile) => profile.id === senderId);

  if (senderProfile?.role !== "teacher") {
    throw new Error("Only teachers can send staff messages from this page.");
  }

  const payload: any = {
    sender_id: senderId,
    subject,
    message,
  };

  if (recipient.type === "admin_group") {
    payload.receiver_id = null;
    payload.recipient_group = "admin";
  } else {
    if (!recipient.teacherId) {
      throw new Error("Please select a teacher recipient.");
    }

    if (senderId === recipient.teacherId) {
      throw new Error("You cannot send a message to yourself.");
    }

    const receiverProfile = profiles?.find(
      (profile) => profile.id === recipient.teacherId
    );

    if (receiverProfile?.role !== "teacher") {
      throw new Error("Please select a teacher recipient.");
    }

    payload.receiver_id = recipient.teacherId;
    payload.recipient_group = null;
  }

  if (attachment_link) {
    payload.attachment_link = attachment_link;
  }

  const { error } = await supabase.from("messages").insert([payload]);

  if (error) throw error;

  return {
    success: true,
  };
}

export async function markTeacherStaffMessageAsRead(
  messageId: string,
  teacherId: string
) {
  const { data: message, error: messageError } = await supabase
    .from("messages")
    .select("id, sender_id")
    .eq("id", messageId)
    .eq("receiver_id", teacherId)
    .single();

  if (messageError) throw messageError;

  const { data: senderProfile, error: profileError } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", message.sender_id)
    .single();

  if (profileError) throw profileError;

  if (!isStaffRole(senderProfile?.role)) {
    throw new Error("This is not a staff message.");
  }

  await markMessageAsRead(messageId, teacherId);
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

  const { data, error } = await supabase.rpc("hide_sent_staff_message", {
    p_message_id: messageId,
  });

  if (error) {
    throw new Error(error.message || "Unable to remove message from sent.");
  }

  return data || { success: true };
}

export async function sendMessage(message: any) {
  const { error } = await supabase
    .from("messages")
    .insert([message]);

  if (error) throw error;
}

export async function getAdminInboxMessages(adminId: string) {
  const { data, error } = await supabase
    .from("messages")
    .select("*")
    .or(`receiver_id.eq.${adminId},recipient_group.eq.admin`)
    .order("created_at", { ascending: false });

  if (error) throw error;

  return enrichMessagesWithProfile(data || [], "sender_id", "sender");
}

export async function getAdminSentMessages(adminId: string) {
  const { data, error } = await supabase
    .from("messages")
    .select("*")
    .eq("sender_id", adminId)
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
}: {
  adminId: string;
  teacherId: string;
  subject: string;
  message: string;
  attachment_link?: string;
}) {
  const payload: any = {
    sender_id: adminId,
    receiver_id: teacherId,
    subject,
    message,
  };

  if (attachment_link) {
    payload.attachment_link = attachment_link;
  }

  const { error } = await supabase.from("messages").insert([payload]);

  if (error) throw error;
}

export async function sendAdminMessageToAllTeachers({
  adminId,
  teachers,
  subject,
  message,
  attachment_link,
}: {
  adminId: string;
  teachers: any[];
  subject: string;
  message: string;
  attachment_link?: string;
}) {
  const rows = (teachers || [])
    .filter((teacher) => teacher?.id)
    .map((teacher) => {
      const payload: any = {
        sender_id: adminId,
        receiver_id: teacher.id,
        subject,
        message,
      };

      if (attachment_link) {
        payload.attachment_link = attachment_link;
      }

      return payload;
    });

  if (rows.length === 0) {
    throw new Error("No valid teachers found.");
  }

  const { error } = await supabase.from("messages").insert(rows);

  if (error) throw error;

  return rows.length;
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
  const { error } = await supabase
    .from("messages")
    .update({
      read_at: new Date().toISOString(),
    })
    .eq("id", messageId)
    .eq("receiver_id", receiverId)
    .is("read_at", null);

  if (error) throw error;
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
