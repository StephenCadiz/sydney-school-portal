import { supabaseAdmin } from "./supabaseAdmin";
import { getTeacherAuthorisedStudentUnreadCount } from "./teacherStudentMessagesServer";

export async function getTeacherUnreadStaffMessageCount(teacherId: string) {
  const { data: staffProfiles, error: staffProfilesError } = await supabaseAdmin
    .from("profiles")
    .select("id")
    .in("role", ["admin", "teacher"])
    .neq("id", teacherId);
  if (staffProfilesError) throw staffProfilesError;

  const staffIds = (staffProfiles || []).map((profile) => String(profile.id));
  if (!staffIds.length) return 0;

  const { data: messages, error: messagesError } = await supabaseAdmin
    .from("messages")
    .select("id")
    .eq("receiver_id", teacherId)
    .in("sender_id", staffIds)
    .is("recipient_group", null)
    .is("read_at", null)
    .is("recipient_deleted_at", null);
  if (messagesError) throw messagesError;

  return (messages || []).length;
}

export async function getTeacherCombinedUnreadMessageCount(teacherId: string) {
  const [staffUnread, studentUnread] = await Promise.all([
    getTeacherUnreadStaffMessageCount(teacherId),
    getTeacherAuthorisedStudentUnreadCount(teacherId),
  ]);

  return {
    staffUnread,
    studentUnread,
    totalUnread: staffUnread + studentUnread,
  };
}
