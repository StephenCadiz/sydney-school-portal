import { NextRequest, NextResponse } from "next/server";

import { requireExamBankAdmin } from "../../../../../lib/cambridgeExamBankServer";
import { sendPortalPush } from "../../../../../lib/pushNotificationsServer";
import { supabaseAdmin } from "../../../../../lib/supabaseAdmin";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i;

function errorResponse(error: string, status = 400) {
  return NextResponse.json({ success: false, error }, { status, headers: { "Cache-Control": "no-store" } });
}

function validAttachments(value: unknown) {
  return value === undefined || value === null || (Array.isArray(value) && value.length <= 10 && value.every((item) => item && typeof item === "object" && typeof item.id === "string" && typeof item.path === "string"));
}

function logFailure(stage: string, error: any, extra: Record<string, unknown> = {}) {
  console.error("Admin message send failed:", {
    stage,
    message: error?.message || null,
    code: error?.code || null,
    details: error?.details || null,
    hint: error?.hint || null,
    ...extra,
  });
}

export async function POST(request: NextRequest) {
  const admin = await requireExamBankAdmin(request);
  if (admin.response) return admin.response;
  const body = await request.json().catch(() => null);
  const candidateTeacherIds = (Array.isArray(body?.teacherIds) ? body.teacherIds : [body?.teacherId])
    .map((value: unknown) => String(value || "").trim())
    .filter((value: string) => UUID.test(value));
  const teacherIds: string[] = Array.from(new Set<string>(candidateTeacherIds));
  const subject = String(body?.subject || "").trim();
  const message = String(body?.message || "").trim();
  const senderIdentity = body?.senderIdentity === "rosa" ? "rosa" : "admin";
  const attachmentLink = typeof body?.attachment_link === "string" ? body.attachment_link.trim() || null : null;
  const attachments = body?.attachments === undefined || body?.attachments === null ? [] : body.attachments;
  if (!teacherIds.length) {
    logFailure("validation", null, { reason: "missing-recipient" });
    return errorResponse("Please select a teacher recipient.");
  }
  if (!subject) {
    logFailure("validation", null, { reason: "missing-subject" });
    return errorResponse("Subject is required.");
  }
  if (!message) {
    logFailure("validation", null, { reason: "missing-message" });
    return errorResponse("Message is required.");
  }
  if (!validAttachments(attachments)) {
    logFailure("validation", null, { reason: "invalid-attachments" });
    return errorResponse("One or more attachments are invalid.");
  }

  const { data: sender, error: senderError } = await supabaseAdmin.from("profiles").select("id, first_name, last_name, role").eq("id", admin.userId).single();
  if (senderError) {
    logFailure("sender-lookup", senderError, { actorId: admin.userId });
    return errorResponse("Unable to verify Admin access.", 500);
  }
  if (sender?.role !== "admin") return errorResponse("Admin access required.", 403);
  const isRosa = String(sender.first_name || "").trim().toLowerCase() === "rosa" && String(sender.last_name || "").trim().toLowerCase().includes("vara");
  if (senderIdentity === "rosa" && !isRosa) return errorResponse("Only Rosa Vara can send messages as Rosa Vara.", 403);

  const { data: teachers, error: teacherError } = await supabaseAdmin.from("profiles").select("id, role").in("id", teacherIds);
  if (teacherError) {
    logFailure("teacher-lookup", teacherError, { recipientCount: teacherIds.length });
    return errorResponse("Unable to verify the teacher recipient.", 500);
  }
  if ((teachers || []).length !== teacherIds.length || (teachers || []).some((teacher) => teacher.role !== "teacher")) {
    logFailure("validation", null, { reason: "invalid-teacher-recipient", recipientCount: teacherIds.length });
    return errorResponse("Please select a teacher recipient.", 400);
  }

  const sharedAdminIdentity = isRosa && senderIdentity === "admin";
  const recentCutoff = new Date(Date.now() - 15_000).toISOString();
  const { data: recentMessages, error: recentError } = await supabaseAdmin
    .from("messages")
    .select("id, receiver_id")
    .eq("sender_id", admin.userId)
    .in("receiver_id", teacherIds)
    .eq("subject", subject)
    .eq("message", message)
    .gte("created_at", recentCutoff);
  if (recentError) logFailure("duplicate-check", recentError, { recipientCount: teacherIds.length });
  const alreadySentTo = new Set<string>((recentMessages || []).map((row) => String(row.receiver_id)));
  const rows = teacherIds
    .filter((teacherId) => !alreadySentTo.has(teacherId))
    .map((teacherId) => ({ sender_id: admin.userId, receiver_id: teacherId, subject, message, recipient_group: sharedAdminIdentity ? "admin" : null, ...(attachmentLink ? { attachment_link: attachmentLink } : {}), ...(attachments.length ? { attachments } : {}) }));
  if (!rows.length) {
    return NextResponse.json({ success: true, duplicate: true, count: 0, ids: [], message: "Message already sent." }, { headers: { "Cache-Control": "no-store" } });
  }
  const { data: inserted, error: insertError } = await supabaseAdmin.from("messages").insert(rows).select("id, receiver_id");
  if (insertError) {
    logFailure("message-insert", insertError, { recipientCount: rows.length });
    return errorResponse("Unable to send message.", 500);
  }
  let pushSent = 0;
  let pushUnavailable = false;
  for (const row of inserted || []) {
    try {
      const result = await sendPortalPush([String(row.receiver_id)], { eventKey: `message:${row.id}`, title: "New message from Admin", body: "You have a new message from Admin.", url: "/teacher/messages", tag: `message:${row.id}` });
      pushSent += result.sent;
      pushUnavailable ||= result.skipped;
    } catch (error: any) {
      pushUnavailable = true;
      logFailure("push-dispatch", error, { recipientCount: 1 });
    }
  }
  return NextResponse.json({
    success: true,
    count: rows.length,
    ids: (inserted || []).map((row) => row.id),
    push: { sent: pushSent, unavailable: pushUnavailable },
    ...(pushUnavailable ? { message: "Message sent; push notification unavailable." } : {}),
  }, { headers: { "Cache-Control": "no-store" } });
}
