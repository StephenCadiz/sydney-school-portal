import { NextRequest, NextResponse } from "next/server";

import { resolveProfileIdForAuthUser } from "../../../../lib/cambridgeStudentAccessServer";
import { supabaseAdmin } from "../../../../lib/supabaseAdmin";
import { sendPortalPush } from "../../../../lib/pushNotificationsServer";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function errorResponse(message: string, status: number, code?: string) {
  return NextResponse.json({ error: message, ...(code ? { code } : {}) }, { status });
}

function tokenFrom(request: NextRequest) {
  const value = request.headers.get("authorization") || "";
  return value.startsWith("Bearer ") ? value.slice(7) : "";
}

function logFailure(stage: string, error: any) {
  console.error("Student message request failed:", {
    stage,
    message: error?.message || null,
    code: error?.code || null,
    details: error?.details || null,
    hint: error?.hint || null,
  });
}

function allowedKeys(record: Record<string, unknown>) {
  return Object.keys(record).every((key) =>
    ["receiver_id", "subject", "message", "attachment_link", "attachments"].includes(key)
  );
}

function madridDateOnly() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Madrid",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

async function authenticateStudent(request: NextRequest) {
  const token = tokenFrom(request);
  if (!token) throw Object.assign(new Error("Authentication required."), { status: 401 });

  const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(token);
  if (authError || !authData.user) {
    logFailure("authentication", authError);
    throw Object.assign(new Error("Authentication required."), { status: 401 });
  }

  const studentId = await resolveProfileIdForAuthUser(authData.user.id);
  const { data: profile, error: profileError } = await supabaseAdmin
    .from("profiles")
    .select("id, role, active")
    .eq("id", studentId)
    .maybeSingle();
  if (profileError) throw profileError;
  if (!profile || profile.role !== "student" || profile.active === false) {
    throw Object.assign(new Error("Student access is required."), { status: 403 });
  }

  return studentId;
}

async function loadAssignedTeacherIds(studentId: string) {
  const { data: enrolments, error: enrolmentError } = await supabaseAdmin
    .from("current_class_enrolments")
    .select("class_id, classes!inner(id, teacher_id)")
    .eq("student_id", studentId);
  if (enrolmentError) throw enrolmentError;

  const teacherIds = new Set<string>();
  for (const row of enrolments || []) {
    const classroom = Array.isArray(row?.classes) ? row.classes[0] : row?.classes;
    const teacherId = classroom?.teacher_id;
    if (typeof teacherId === "string" && UUID.test(teacherId)) teacherIds.add(teacherId);
  }

  // Keep the server authorization usable for a legacy enrolment while the
  // current-enrolment view catches up. The date filter prevents ended/future
  // class assignments from becoming message recipients.
  if (teacherIds.size === 0) {
    const today = madridDateOnly();
    const { data: periods, error: periodError } = await supabaseAdmin
      .from("class_enrolment_periods")
      .select("class_id, starts_on, ends_before, cancelled_at, classes!inner(teacher_id)")
      .eq("student_type", "profile")
      .eq("profile_student_id", studentId)
      .is("cancelled_at", null);
    if (periodError) throw periodError;
    for (const row of periods || []) {
      const startsOn = String(row?.starts_on || "");
      const endsBefore = row?.ends_before ? String(row.ends_before) : "";
      const classroom = Array.isArray(row?.classes) ? row.classes[0] : row?.classes;
      const teacherId = classroom?.teacher_id;
      if (
        startsOn <= today &&
        (!endsBefore || endsBefore > today) &&
        typeof teacherId === "string" &&
        UUID.test(teacherId)
      ) {
        teacherIds.add(teacherId);
      }
    }
  }

  return Array.from(teacherIds);
}

async function handleStudentRouteError(error: any) {
  logFailure("student-route", error);
  const status = Number(error?.status) || (error?.code === "42501" ? 403 : 500);
  const message = error?.code === "42501"
    ? "You are not authorized to access these messages."
    : error?.message || "Unable to access messages.";
  return errorResponse(message, status, error?.code);
}

export async function GET(request: NextRequest) {
  try {
    const studentId = await authenticateStudent(request);
    const teacherIds = await loadAssignedTeacherIds(studentId);
    if (teacherIds.length === 0) {
      return NextResponse.json(
        { inbox: [], sent: [] },
        { headers: { "Cache-Control": "no-store" } }
      );
    }

    const [inboxResult, sentResult] = await Promise.all([
      supabaseAdmin
        .from("messages")
        .select("*")
        .eq("receiver_id", studentId)
        .in("sender_id", teacherIds)
        .order("created_at", { ascending: false }),
      supabaseAdmin
        .from("messages")
        .select("*")
        .eq("sender_id", studentId)
        .in("receiver_id", teacherIds)
        .order("created_at", { ascending: false }),
    ]);
    if (inboxResult.error) throw inboxResult.error;
    if (sentResult.error) throw sentResult.error;

    return NextResponse.json(
      { inbox: inboxResult.data || [], sent: sentResult.data || [] },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error: any) {
    return handleStudentRouteError(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const studentId = await authenticateStudent(request);
    const body = await request.json().catch(() => null);
    const messageId = String(body?.message_id || "").trim();
    if (!UUID.test(messageId)) return errorResponse("A valid message is required.", 400);

    const { data: updated, error: updateError } = await supabaseAdmin
      .from("messages")
      .update({ read_at: new Date().toISOString() })
      .eq("id", messageId)
      .eq("receiver_id", studentId)
      .is("read_at", null)
      .select("id, read_at")
      .maybeSingle();
    if (updateError) throw updateError;
    if (!updated) return errorResponse("Message not found.", 404);
    return NextResponse.json({ success: true, ...updated });
  } catch (error: any) {
    return handleStudentRouteError(error);
  }
}

export async function POST(request: NextRequest) {
  const token = tokenFrom(request);
  if (!token) return errorResponse("Authentication required.", 401);

  const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(token);
  if (authError || !authData.user) {
    logFailure("authentication", authError);
    return errorResponse("Authentication required.", 401);
  }

  try {
    const studentId = await resolveProfileIdForAuthUser(authData.user.id);
    const { data: profile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("id, role, active")
      .eq("id", studentId)
      .maybeSingle();
    if (profileError) throw profileError;
    if (!profile || profile.role !== "student" || profile.active === false) {
      return errorResponse("Student access is required to send a message.", 403);
    }

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return errorResponse("Invalid message request.", 400);
    }
    const record = body as Record<string, unknown>;
    if (!allowedKeys(record)) {
      return errorResponse("The request contains unsupported fields.", 400);
    }

    const receiverId = String(record.receiver_id || "").trim();
    const subject = String(record.subject || "").trim();
    const message = String(record.message || "").trim();
    if (!UUID.test(receiverId)) return errorResponse("Choose a valid teacher recipient.", 400);
    if (!subject) return errorResponse("Subject is required.", 400);
    if (!message) return errorResponse("Message is required.", 400);
    if (record.attachment_link !== undefined && record.attachment_link !== null && typeof record.attachment_link !== "string") {
      return errorResponse("Attachment link must be text.", 400);
    }
    if (record.attachments !== undefined && !Array.isArray(record.attachments)) {
      return errorResponse("Attachments must be an array.", 400);
    }

    const teacherIds = await loadAssignedTeacherIds(studentId);
    if (!teacherIds.includes(receiverId)) {
      return errorResponse(
        "You can only message a teacher assigned to your current class.",
        403,
        "TEACHER_NOT_ASSIGNED"
      );
    }

    const { data: teacher, error: teacherError } = await supabaseAdmin
      .from("profiles")
      .select("id, role, active")
      .eq("id", receiverId)
      .maybeSingle();
    if (teacherError) throw teacherError;
    if (!teacher || teacher.role !== "teacher" || teacher.active === false) {
      return errorResponse("The selected teacher is not available.", 403);
    }

    const attachmentLink =
      record.attachment_link === undefined || record.attachment_link === null
        ? null
        : String(record.attachment_link).trim() || null;
    const attachments = Array.isArray(record.attachments) ? record.attachments : [];

    // The client disables repeat submissions. This short-window lookup also makes
    // a retried request return the existing exact message instead of inserting a
    // second copy when the first request already committed.
    const recentCutoff = new Date(Date.now() - 15_000).toISOString();
    const { data: existing, error: existingError } = await supabaseAdmin
      .from("messages")
      .select("id, created_at")
      .eq("sender_id", studentId)
      .eq("receiver_id", receiverId)
      .eq("subject", subject)
      .eq("message", message)
      .gte("created_at", recentCutoff)
      .order("created_at", { ascending: false })
      .limit(1);
    if (existingError) throw existingError;
    if (existing?.[0]) return NextResponse.json({ success: true, duplicate: true, id: existing[0].id });

    const { data: inserted, error: insertError } = await supabaseAdmin
      .from("messages")
      .insert({
        sender_id: studentId,
        receiver_id: receiverId,
        recipient_group: null,
        subject,
        message,
        attachment_link: attachmentLink,
        attachments,
      })
      .select("id, created_at")
      .single();
    if (insertError) throw insertError;

    await sendPortalPush([receiverId], {
      eventKey: `message:${inserted.id}`,
      title: "New message",
      body: "You have a new message from a student.",
      url: "/teacher/messages",
      tag: `message:${inserted.id}`,
    });

    return NextResponse.json({ success: true, id: inserted.id, created_at: inserted.created_at });
  } catch (error: any) {
    logFailure("send", error);
    const message = error?.code === "42501"
      ? "You are not authorized to message that recipient."
      : error?.message || "Unable to send message.";
    return errorResponse(message, error?.code === "42501" ? 403 : 500, error?.code);
  }
}
