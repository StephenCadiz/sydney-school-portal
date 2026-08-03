import { supabase } from "./supabase";

export type TeacherUnreadMessageCount = {
  staff_unread: number;
  student_unread: number;
  total_unread: number;
};

export async function getTeacherUnreadMessageCount(): Promise<TeacherUnreadMessageCount> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    throw new Error("Authentication required.");
  }

  const response = await fetch("/api/teacher/messages/unread-count", {
    cache: "no-store",
    headers: { Authorization: `Bearer ${session.access_token}` },
  });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload?.error || "Unable to load unread message count.");
  }

  const staffUnread = Number(payload?.staff_unread || 0);
  const studentUnread = Number(payload?.student_unread || 0);
  const totalUnread = Number(payload?.total_unread || 0);

  return {
    staff_unread: Number.isFinite(staffUnread) ? staffUnread : 0,
    student_unread: Number.isFinite(studentUnread) ? studentUnread : 0,
    total_unread: Number.isFinite(totalUnread) ? totalUnread : 0,
  };
}
