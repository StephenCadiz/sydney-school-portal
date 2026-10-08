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

    const { data: enrolments, error: enrolmentError } = await supabaseAdmin
      .from("current_class_enrolments")
      .select("class_id, classes!inner(id, teacher_id)")
      .eq("student_id", studentId);
    if (enrolmentError) throw enrolmentError;

    const teacherIds = Array.from(
      new Set(
        (enrolments || [])
          .map((row: any) => row?.classes?.teacher_id)
          .filter((value: unknown): value is string => typeof value === "string" && UUID.test(value))
      )
    );
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
