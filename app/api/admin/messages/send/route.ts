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

export async function POST(request: NextRequest) {
  const admin = await requireExamBankAdmin(request);
  if (admin.response) return admin.response;
  const body = await request.json().catch(() => null);
  const teacherIds = Array.from(new Set((Array.isArray(body?.teacherIds) ? body.teacherIds : [body?.teacherId]).map((value: unknown) => String(value || "").trim()).filter((value: string) => UUID.test(value))));
  const subject = String(body?.subject || "").trim();
  const message = String(body?.message || "").trim();
  const senderIdentity = body?.senderIdentity === "rosa" ? "rosa" : "admin";
  const attachmentLink = typeof body?.attachment_link === "string" ? body.attachment_link.trim() || null : null;
  const attachments = body?.attachments === undefined || body?.attachments === null ? [] : body.attachments;
  if (!teacherIds.length) return errorResponse("Please select a teacher recipient.");
  if (!subject) return errorResponse("Subject is required.");
  if (!message) return errorResponse("Message is required.");
  if (!validAttachments(attachments)) return errorResponse("One or more attachments are invalid.");

  const { data: sender, error: senderError } = await supabaseAdmin.from("profiles").select("id, first_name, last_name, role").eq("id", admin.userId).single();
  if (senderError || sender?.role !== "admin") return errorResponse("Admin access required.", 403);
  const isRosa = String(sender.first_name || "").trim().toLowerCase() === "rosa" && String(sender.last_name || "").trim().toLowerCase().includes("vara");
  if (senderIdentity === "rosa" && !isRosa) return errorResponse("Only Rosa Vara can send messages as Rosa Vara.", 403);

  const { data: teachers, error: teacherError } = await supabaseAdmin.from("profiles").select("id, role").in("id", teacherIds);
  if (teacherError) return errorResponse("Unable to verify the teacher recipient.", 500);
  if ((teachers || []).length !== teacherIds.length || (teachers || []).some((teacher) => teacher.role !== "teacher")) return errorResponse("Please select a teacher recipient.", 400);

  const sharedAdminIdentity = isRosa && senderIdentity === "admin";
  const rows = teacherIds.map((teacherId) => ({ sender_id: admin.userId, receiver_id: teacherId, subject, message, recipient_group: sharedAdminIdentity ? "admin" : null, ...(attachmentLink ? { attachment_link: attachmentLink } : {}), ...(attachments.length ? { attachments } : {}) }));
  const { data: inserted, error: insertError } = await supabaseAdmin.from("messages").insert(rows).select("id, receiver_id");
  if (insertError) return errorResponse(insertError.message || "Unable to send message.", 500);
  for (const row of inserted || []) {
    await sendPortalPush([String(row.receiver_id)], { eventKey: `message:${row.id}`, title: "New message from Admin", body: "You have a new message from Admin.", url: "/teacher/messages", tag: `message:${row.id}` });
  }
  return NextResponse.json({ success: true, count: rows.length, ids: (inserted || []).map((row) => row.id) });
}
