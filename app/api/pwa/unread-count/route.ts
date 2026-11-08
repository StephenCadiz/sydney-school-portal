import { NextRequest, NextResponse } from "next/server";

import {
  authenticatePortalActor,
  tokenFromRequest,
} from "../../../../lib/pushNotificationsServer";
import { getChatUnreadCount } from "../../../../lib/chatServer";
import { getTeacherCombinedUnreadMessageCount } from "../../../../lib/teacherMessageUnreadCountServer";
import { resolveStudentHomeworkContext, loadStudentHomework } from "../../../../lib/studentHomeworkServer";
import { getStudentCurrentClassIdsServer } from "../../../../lib/academicYearsServer";
import { getAdminAttendanceAlertCount } from "../../../../lib/adminAttendanceServer";
import { supabaseAdmin } from "../../../../lib/supabaseAdmin";

type UnreadCounts = {
  chat: number;
  messages: number;
  notifications: number;
  homework: number;
};

const EMPTY_COUNTS: UnreadCounts = {
  chat: 0,
  messages: 0,
  notifications: 0,
  homework: 0,
};

function noStore(payload: unknown, status = 200) {
  return NextResponse.json(payload, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

async function countStudentMessages(profileId: string) {
  const { count, error } = await supabaseAdmin
    .from("messages")
    .select("id", { count: "exact", head: true })
    .eq("receiver_id", profileId)
    .is("read_at", null)
    .is("recipient_deleted_at", null)
    .neq("sender_id", profileId);
  if (error) throw error;
  return count || 0;
}

async function countAdminMessages(profileId: string) {
  const { count, error } = await supabaseAdmin
    .from("messages")
    .select("id", { count: "exact", head: true })
    .or(`receiver_id.eq.${profileId},and(recipient_group.eq.admin,receiver_id.is.null)`)
    .is("admin_deleted_at", null)
    .is("dealt_with_at", null)
    .neq("sender_id", profileId);
  if (error) throw error;
  return count || 0;
}

async function countTeacherNotifications(profileId: string) {
  const { data, error } = await supabaseAdmin
    .from("follow_up_documents")
    .select("last_admin_action_at, teacher_action_seen_at")
    .eq("teacher_id", profileId)
    .not("last_admin_action_at", "is", null);
  if (error) throw error;
  return (data || []).filter((document) => {
    if (!document.last_admin_action_at) return false;
    if (!document.teacher_action_seen_at) return true;
    return new Date(document.last_admin_action_at).getTime() > new Date(document.teacher_action_seen_at).getTime();
  }).length;
}

async function countAdminNotifications() {
  const [attendanceCount, monitoringResult] = await Promise.all([
    getAdminAttendanceAlertCount(),
    supabaseAdmin
      .from("student_monitoring_records")
      .select("id", { count: "exact", head: true })
      .in("status", ["feedback_submitted", "overdue"]),
  ]);
  if (monitoringResult.error) throw monitoringResult.error;
  return attendanceCount + (monitoringResult.count || 0);
}

async function countStudentHomework(profileId: string) {
  const resolved = await resolveStudentHomeworkContext(profileId);
  if (!resolved.context) return 0;
  const homework = await loadStudentHomework(resolved.context, false);
  return Math.max(0, Number(homework.unread_count) || 0);
}

async function countStudentNotifications(profileId: string, authUserId: string) {
  const classIds = await getStudentCurrentClassIdsServer(profileId);
  const [{ data: classes, error: classError }, { data: globalAnnouncements, error: globalError }] = await Promise.all([
    classIds.length
      ? supabaseAdmin.from("classes").select("id, level_id").in("id", classIds)
      : Promise.resolve({ data: [], error: null }),
    supabaseAdmin
      .from("announcements")
      .select("id")
      .eq("audience_type", "all_cambridge_students"),
  ]);
  if (classError) throw classError;
  if (globalError) throw globalError;

  const levelIds = Array.from(new Set((classes || []).map((classroom) => classroom.level_id).filter(Boolean)));
  const { data: levels, error: levelError } = levelIds.length
    ? await supabaseAdmin.from("levels").select("id, name").in("id", levelIds)
    : { data: [], error: null };
  if (levelError) throw levelError;

  const [classResult, levelResult] = await Promise.all([
    classIds.length
      ? supabaseAdmin.from("announcements").select("id").in("classes_id", classIds)
      : Promise.resolve({ data: [], error: null }),
    (levels || []).length
      ? supabaseAdmin.from("announcements").select("id").eq("audience_type", "level").in("target_level", (levels || []).map((level) => level.name))
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (classResult.error) throw classResult.error;
  if (levelResult.error) throw levelResult.error;

  const announcementIds = Array.from(new Set([
    ...(globalAnnouncements || []).map((announcement) => String(announcement.id)),
    ...(classResult.data || []).map((announcement) => String(announcement.id)),
    ...(levelResult.data || []).map((announcement) => String(announcement.id)),
  ].filter(Boolean)));
  if (!announcementIds.length) return 0;

  const userIds = Array.from(new Set([profileId, authUserId].filter(Boolean)));
  const { data: reads, error: readsError } = await supabaseAdmin
    .from("announcement_reads")
    .select("announcement_id")
    .in("announcement_id", announcementIds)
    .in("user_id", userIds);
  if (readsError) throw readsError;
  const readIds = new Set((reads || []).map((read) => String(read.announcement_id)));
  return announcementIds.filter((id) => !readIds.has(id)).length;
}

function finiteCount(value: unknown) {
  const count = Number(value);
  return Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
}

export async function GET(request: NextRequest) {
  const actor = await authenticatePortalActor(tokenFromRequest(request));
  if (!actor) return noStore({ error: "Authentication required." }, 401);

  const counts: UnreadCounts = { ...EMPTY_COUNTS };
  const chatPromise = actor.role === "admin"
    ? getChatUnreadCount({ authUserId: actor.authUserId, profileId: actor.profileId, role: "admin", email: null })
    : actor.role === "teacher"
      ? getChatUnreadCount({ authUserId: actor.authUserId, profileId: actor.profileId, role: "teacher", email: null })
      : Promise.resolve(0);

  try {
    if (actor.role === "teacher") {
      const [chat, messages, notifications] = await Promise.allSettled([
        chatPromise,
        getTeacherCombinedUnreadMessageCount(actor.profileId),
        countTeacherNotifications(actor.profileId),
      ]);
      if (chat.status === "fulfilled") counts.chat = finiteCount(chat.value);
      if (messages.status === "fulfilled") counts.messages = finiteCount(messages.value.totalUnread);
      if (notifications.status === "fulfilled") counts.notifications = finiteCount(notifications.value);
    } else if (actor.role === "admin") {
      const [chat, messages, notifications] = await Promise.allSettled([
        chatPromise,
        countAdminMessages(actor.profileId),
        countAdminNotifications(),
      ]);
      if (chat.status === "fulfilled") counts.chat = finiteCount(chat.value);
      if (messages.status === "fulfilled") counts.messages = finiteCount(messages.value);
      if (notifications.status === "fulfilled") counts.notifications = finiteCount(notifications.value);
    } else {
      const [messages, homework, notifications] = await Promise.allSettled([
        countStudentMessages(actor.profileId),
        countStudentHomework(actor.profileId),
        countStudentNotifications(actor.profileId, actor.authUserId),
      ]);
      if (messages.status === "fulfilled") counts.messages = finiteCount(messages.value);
      if (homework.status === "fulfilled") counts.homework = finiteCount(homework.value);
      if (notifications.status === "fulfilled") counts.notifications = finiteCount(notifications.value);
    }
  } catch (error) {
    console.error("PWA unread count failed:", {
      role: actor.role,
      stage: "count",
      message: error instanceof Error ? error.message : String(error),
    });
    // A transient indicator failure must never block the installed app. The
    // next refresh will retry and the underlying inbox/chat pages remain the
    // source of truth.
  }

  const total = counts.chat + counts.messages + counts.notifications + counts.homework;
  return noStore({ ...counts, total });
}
