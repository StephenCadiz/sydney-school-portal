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
    .eq("receiver_id", adminId)
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
