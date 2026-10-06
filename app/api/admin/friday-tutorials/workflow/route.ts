import { NextRequest, NextResponse } from "next/server";

import {
  calculateUpcomingFridayTutorials,
  getTutorialGroupLabel,
} from "../../../../../lib/fridayTutorialRotation";
import { loadFridayTutorialRotationContext } from "../../../../../lib/fridayTutorialRotationServer";
import { getMadridSchoolDate } from "../../../../../lib/schoolClosures";
import {
  examBankJsonError,
  requireExamBankAdmin,
} from "../../../../../lib/cambridgeExamBankServer";
import { supabaseAdmin } from "../../../../../lib/supabaseAdmin";

const STATUS_FIELDS = [
  "reason",
  "whatsapp_sent_status",
  "parent_confirmed_status",
  "material_received_status",
  "student_attended_status",
  "comment",
] as const;
const STATUS_VALUES = new Set(["choose", "yes", "no"]);
const NOTIFICATION_SUBJECT = "Friday Tutorial: prepare activities";

function noStore(payload: unknown, status = 200) {
  return NextResponse.json(payload, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function madridWeekday(value: string) {
  return new Date(`${value}T12:00:00Z`).getUTCDay();
}

function fullName(row: any) {
  return `${row?.first_name || ""} ${row?.last_name || ""}`.trim() || "Student";
}

async function getMondayReminder() {
  const today = getMadridSchoolDate();
  const weekday = madridWeekday(today);
  if (weekday === 0 || weekday === 6) {
    return { show: false, today_madrid: today };
  }

  const rotation = await loadFridayTutorialRotationContext();
  if (!rotation.settings) return { show: false, today_madrid: today };

  const upcoming = calculateUpcomingFridayTutorials(
    rotation.settings,
    12,
    rotation.closures
  ).find((entry) => entry.session_date >= today);
  if (!upcoming?.tutorial_group) {
    return { show: false, today_madrid: today };
  }

  const { data: session, error: sessionError } = await supabaseAdmin
    .from("friday_tutorial_sessions")
    .select("id, session_date, tutorial_group, start_time, end_time")
    .eq("session_date", upcoming.session_date)
    .eq("tutorial_group", upcoming.tutorial_group)
    .maybeSingle();
  if (sessionError) throw sessionError;
  if (!session) {
    const { data: approvedStudents, error: approvedError } = await supabaseAdmin
      .from("friday_tutorial_students")
      .select("id")
      .eq("approval_status", "approved")
      .eq("active", true)
      .eq("tutorial_group", upcoming.tutorial_group);
    if (approvedError) throw approvedError;
    const totalStudents = (approvedStudents || []).length;
    return {
      show: totalStudents > 0,
      today_madrid: today,
      session_date: upcoming.session_date,
      session_id: null,
      tutorial_group: upcoming.tutorial_group,
      tutorial_group_label: upcoming.tutorial_group_label,
      total_students: totalStudents,
      completed_students: 0,
      incomplete_students: totalStudents,
    };
  }

  const { data: rows, error: rowsError } = await supabaseAdmin
    .from("friday_tutorial_session_students")
    .select(
      "id, whatsapp_sent_status, parent_confirmed_status, material_received_status"
    )
    .eq("session_id", session.id);
  if (rowsError) throw rowsError;
  const list = rows || [];
  if (list.length === 0) return { show: false, today_madrid: today };

  const complete = list.filter(
    (row) =>
      row.whatsapp_sent_status === "yes" &&
      (row.parent_confirmed_status === "no" ||
        (row.parent_confirmed_status === "yes" &&
          row.material_received_status === "yes"))
  ).length;

  return {
    show: complete < list.length,
    today_madrid: today,
    session_date: session.session_date,
    session_id: session.id,
    tutorial_group: session.tutorial_group,
    tutorial_group_label: getTutorialGroupLabel(session.tutorial_group),
    total_students: list.length,
    completed_students: complete,
    incomplete_students: list.length - complete,
  };
}

async function notifyYoungLearnerTeacher(
  adminId: string,
  sessionStudent: any,
  session: any,
  tutorialStudent: any
) {
  if (tutorialStudent?.student_type !== "young_learner" || !tutorialStudent.teacher_id) {
    return false;
  }

  const [{ data: student, error: studentError }, { data: classRow, error: classError }] =
    await Promise.all([
      supabaseAdmin
        .from("young_learners")
        .select("first_name, last_name")
        .eq("id", tutorialStudent.young_learner_id)
        .maybeSingle(),
      supabaseAdmin
        .from("classes")
        .select("id, name, days, start_time, end_time, level_id")
        .eq("id", tutorialStudent.class_id)
        .maybeSingle(),
    ]);
  if (studentError) throw studentError;
  if (classError) throw classError;

  const { data: level, error: levelError } = classRow?.level_id
    ? await supabaseAdmin
        .from("levels")
        .select("name")
        .eq("id", classRow.level_id)
        .maybeSingle()
    : { data: null, error: null };
  if (levelError) throw levelError;

  const studentName = fullName(student);
  const marker = `[friday-tutorial-parent-confirmed:${sessionStudent.id}]`;
  const details = [
    `${studentName} (${level?.name || "Young Learner"}${classRow?.name ? `, ${classRow.name}` : ""})`,
    `Friday ${session.session_date} ${String(session.start_time || "18:00").slice(0, 5)}–${String(session.end_time || "19:00").slice(0, 5)}`,
    "Instruction: prepare activities for the student and send them to Admin as soon as possible.",
    marker,
  ].join("\n");

  const { data: existing, error: existingError } = await supabaseAdmin
    .from("messages")
    .select("id, message")
    .eq("receiver_id", tutorialStudent.teacher_id)
    .eq("subject", NOTIFICATION_SUBJECT)
    .order("created_at", { ascending: false })
    .limit(100);
  if (existingError) throw existingError;
  if ((existing || []).some((message) => String(message.message || "").includes(marker))) {
    return false;
  }

  const { error: insertError } = await supabaseAdmin.from("messages").insert({
    sender_id: adminId,
    receiver_id: tutorialStudent.teacher_id,
    recipient_group: null,
    subject: NOTIFICATION_SUBJECT,
    message: details,
  });
  if (insertError) throw insertError;
  return true;
}

export async function GET(request: NextRequest) {
  try {
    const admin = await requireExamBankAdmin(request);
    if (admin.response) return admin.response;
    return noStore(await getMondayReminder());
  } catch (error) {
    console.error("Friday Tutorial workflow reminder failed:", error);
    return examBankJsonError("Unable to load the Friday Tutorial reminder.", 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    const admin = await requireExamBankAdmin(request);
    if (admin.response) return admin.response;
    const body = await request.json().catch(() => null);
    const sessionStudentId = String(body?.session_student_id || "").trim();
    const updates = body?.updates;
    if (!sessionStudentId || !updates || typeof updates !== "object" || Array.isArray(updates)) {
      return examBankJsonError("Invalid weekly register update.", 400);
    }
    const keys = Object.keys(updates);
    if (keys.some((key) => !(STATUS_FIELDS as readonly string[]).includes(key))) {
      return examBankJsonError("The request contains unsupported fields.", 400);
    }
    for (const field of ["whatsapp_sent_status", "parent_confirmed_status", "material_received_status", "student_attended_status"]) {
      if (field in updates && !STATUS_VALUES.has(String(updates[field]))) {
        return examBankJsonError("Invalid weekly register status.", 422);
      }
    }

    const { data: current, error: currentError } = await supabaseAdmin
      .from("friday_tutorial_session_students")
      .select("id, session_id, parent_confirmed_status, tutorial_student_id")
      .eq("id", sessionStudentId)
      .maybeSingle();
    if (currentError) throw currentError;
    if (!current) return examBankJsonError("Weekly register row not found.", 404);

    let updateQuery = supabaseAdmin
      .from("friday_tutorial_session_students")
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq("id", sessionStudentId);
    if (updates.parent_confirmed_status === "yes") {
      updateQuery = updateQuery.or(
        "parent_confirmed_status.neq.yes,parent_confirmed_status.is.null"
      );
    }
    const { data: updated, error: updateError } = await updateQuery
      .select("*")
      .maybeSingle();
    if (updateError) throw updateError;
    if (!updated) {
      if (updates.parent_confirmed_status !== "yes") {
        return examBankJsonError("Weekly register row was not updated.", 409);
      }
    }

    let notificationCreated = false;
    if (updates.parent_confirmed_status === "yes") {
      const [{ data: session, error: sessionError }, { data: tutorialStudent, error: tutorialError }] =
        await Promise.all([
          supabaseAdmin
            .from("friday_tutorial_sessions")
            .select("session_date, start_time, end_time")
            .eq("id", current.session_id)
            .single(),
          supabaseAdmin
            .from("friday_tutorial_students")
            .select("student_type, young_learner_id, teacher_id, class_id")
            .eq("id", current.tutorial_student_id)
            .single(),
        ]);
      if (sessionError) throw sessionError;
      if (tutorialError) throw tutorialError;
      notificationCreated = await notifyYoungLearnerTeacher(
        admin.userId,
        current,
        session,
        tutorialStudent
      );
    }

    return noStore({
      success: true,
      row: updated || current,
      notification_created: notificationCreated,
    });
  } catch (error) {
    console.error("Friday Tutorial workflow update failed:", error);
    return examBankJsonError("Unable to update the weekly Friday Tutorial row.", 500);
  }
}
