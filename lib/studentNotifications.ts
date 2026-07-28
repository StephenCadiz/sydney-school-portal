import { supabase } from "./supabase";

export async function getUnreadHomeworkForStudent(
  studentId: string,
  homeworkIds: string[]
) {
  if (homeworkIds.length === 0) {
    return [];
  }

  const { data, error } = await supabase
    .from("student_homework_reads")
    .select("homework_id")
    .eq("student_id", studentId)
    .in("homework_id", homeworkIds);

  if (error) {
    console.error("getUnreadHomeworkForStudent Supabase error:", error);
    throw error;
  }

  const viewedHomeworkIds = new Set(
    (data || []).map((item) => item.homework_id)
  );

  return homeworkIds.filter(
    (homeworkId) => !viewedHomeworkIds.has(homeworkId)
  );
}

export async function markHomeworkAsViewed(
  studentId: string,
  homeworkIds: string[]
) {
  if (homeworkIds.length === 0) {
    return;
  }

  const rows = homeworkIds.map((homeworkId) => ({
    student_id: studentId,
    homework_id: homeworkId,
    viewed_at: new Date().toISOString(),
  }));

  const { error } = await supabase
    .from("student_homework_reads")
    .upsert(rows, {
      onConflict: "student_id,homework_id",
      ignoreDuplicates: true,
    });

  if (error) {
    console.error("markHomeworkAsViewed Supabase error:", error);
    throw error;
  }
}

export async function markAssignmentHomeworkAsViewed(
  accessToken: string,
  assignmentIds: string[]
) {
  if (assignmentIds.length === 0) return;
  const response = await fetch("/api/student/homework/read", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ assignment_ids: assignmentIds }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || "Unable to mark assignment homework as viewed.");
  }
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

  if (error) {
    console.error("getUnreadMessagesForStudent Supabase error:", error);
    throw error;
  }

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

  if (error) {
    console.error("markTeacherMessagesAsRead Supabase error:", error);
    throw error;
  }
}
