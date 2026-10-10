import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";

import { requireExamBankAdmin } from "../../../../../lib/cambridgeExamBankServer";
import { sendPortalPush } from "../../../../../lib/pushNotificationsServer";
import { supabaseAdmin } from "../../../../../lib/supabaseAdmin";

// RFC 4122 UUIDs are 8-4-4-4-12.  The variant group contains one
// constrained nibble followed by three more hex characters (not twelve).
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function errorResponse(error: string, status = 400) {
  return NextResponse.json({ success: false, error }, { status, headers: { "Cache-Control": "no-store" } });
}

function pushUnavailableMessage(reason: string | null) {
  switch (reason) {
    case "vapid_not_configured":
      return "Message sent; push notifications are not configured on this server.";
    case "no_subscriptions":
      return "Message sent; the recipient has no active push subscription.";
    case "subscription_store_unavailable":
      return "Message sent; push subscription storage is unavailable.";
    case "delivery_failed":
      return "Message sent; the push provider did not accept delivery.";
    default:
      return "Message sent; push notification unavailable.";
  }
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

function recipientIdValues(body: any) {
  const values: unknown[] = [];
  for (const key of ["teacherIds", "teacherId", "teacher_id", "recipientId", "recipient_id"]) {
    const value = body?.[key];
    if (Array.isArray(value)) values.push(...value);
    else if (value !== undefined && value !== null) values.push(value);
  }
  return values;
}

function recipientKeysPresent(body: any) {
  return ["teacherIds", "teacherId", "teacher_id", "recipientId", "recipient_id"].filter(
    (key) => body?.[key] !== undefined && body?.[key] !== null
  );
}

function recipientIdValue(value: unknown, depth = 0): string {
  if (depth > 2) return "";

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return "";

    // Accept the documented profile:<uuid> alias and JSON-encoded legacy
    // values emitted by older form serializers, while still validating the
    // final value against the UUID allow-list below.
    const profileAlias = trimmed.match(/^profile:(.+)$/i)?.[1]?.trim();
    if (profileAlias) return recipientIdValue(profileAlias, depth + 1);

    if (
      (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'"))
    ) {
      const unquoted = trimmed.slice(1, -1).trim();
      return recipientIdValue(unquoted, depth + 1);
    }

    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
      try {
        return recipientIdValue(JSON.parse(trimmed), depth + 1);
      } catch {
        return trimmed;
      }
    }

    return trimmed;
  }

  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return recipientIdValue(
      record.id || record.profileId || record.teacherId || record.value || "",
      depth + 1
    );
  }

  return "";
}

function recipientValueShapes(values: unknown[]) {
  return values.map((value) => {
    const normalized = recipientIdValue(value);
    const raw = typeof value === "string" ? value.trim() : "";
    const category = UUID.test(normalized)
      ? "uuid"
      : raw.startsWith("profile:")
        ? "profile-wrapper"
        : raw.startsWith("{") || raw.startsWith("[")
          ? "json-wrapper"
          : /\s/.test(normalized)
            ? "text-or-whitespace"
            : /^[0-9a-f-]{36}$/i.test(normalized)
              ? "uuid-shape-invalid"
              : "other";
    return {
      type: Array.isArray(value) ? "array" : value === null ? "null" : typeof value,
      length: normalized.length,
      category,
      uuidLike: UUID.test(normalized),
    };
  });
}

export async function POST(request: NextRequest) {
  const correlationId = request.headers.get("x-correlation-id")?.trim().slice(0, 80) || randomUUID();
  const admin = await requireExamBankAdmin(request);
  if (admin.response) return admin.response;
  const body = await request.json().catch(() => null);
  const rawRecipientValues = recipientIdValues(body);
  const normalizedRecipientValues = rawRecipientValues.map(recipientIdValue);
  const candidateTeacherIds = normalizedRecipientValues.filter((value: string) => UUID.test(value));
  const teacherIds: string[] = Array.from(new Set<string>(candidateTeacherIds));
  const subject = String(body?.subject || "").trim();
  const message = String(body?.message || "").trim();
  const senderIdentity = body?.senderIdentity === "rosa" ? "rosa" : "admin";
  const attachmentLink = typeof body?.attachment_link === "string" ? body.attachment_link.trim() || null : null;
  const attachments = body?.attachments === undefined || body?.attachments === null ? [] : body.attachments;
  if (!teacherIds.length) {
    const hasRecipientValue = normalizedRecipientValues.some(Boolean);
    const reason = hasRecipientValue ? "invalid-recipient-format" : "missing-recipient";
    logFailure("validation", null, {
      reason,
      recipientKeyCount: rawRecipientValues.length,
      recipientKeys: recipientKeysPresent(body),
      recipientValueShapes: recipientValueShapes(rawRecipientValues),
      correlationId,
    });
    return errorResponse(
      hasRecipientValue
        ? "The selected teacher recipient is invalid. Please choose a teacher again."
        : "Please select a teacher recipient."
    );
  }
  if (!subject) {
    logFailure("validation", null, { reason: "missing-subject", correlationId });
    return errorResponse("Subject is required.");
  }
  if (!message) {
    logFailure("validation", null, { reason: "missing-message", correlationId });
    return errorResponse("Message is required.");
  }
  if (!validAttachments(attachments)) {
    logFailure("validation", null, { reason: "invalid-attachments", correlationId });
    return errorResponse("One or more attachments are invalid.");
  }

  const { data: sender, error: senderError } = await supabaseAdmin.from("profiles").select("id, first_name, last_name, role").eq("id", admin.userId).single();
  if (senderError) {
    logFailure("sender-lookup", senderError, { actorId: admin.userId, correlationId });
    return errorResponse("Unable to verify Admin access.", 500);
  }
  if (sender?.role !== "admin") return errorResponse("Admin access required.", 403);
  const isRosa = String(sender.first_name || "").trim().toLowerCase() === "rosa" && String(sender.last_name || "").trim().toLowerCase().includes("vara");
  if (senderIdentity === "rosa" && !isRosa) return errorResponse("Only Rosa Vara can send messages as Rosa Vara.", 403);

  const { data: teachers, error: teacherError } = await supabaseAdmin.from("profiles").select("id, role").in("id", teacherIds);
  if (teacherError) {
    logFailure("teacher-lookup", teacherError, { recipientCount: teacherIds.length, correlationId });
    return errorResponse("Unable to verify the teacher recipient.", 500);
  }
  if ((teachers || []).length !== teacherIds.length) {
    logFailure("validation", null, { reason: "teacher-not-found", recipientCount: teacherIds.length, correlationId });
    return errorResponse("The selected teacher recipient could not be found.", 404);
  }
  if ((teachers || []).some((teacher) => String(teacher.role || "").trim().toLowerCase() !== "teacher")) {
    logFailure("validation", null, { reason: "invalid-teacher-recipient", recipientCount: teacherIds.length, correlationId });
    return errorResponse("The selected recipient is not an authorized teacher.", 403);
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
  if (recentError) logFailure("duplicate-check", recentError, { recipientCount: teacherIds.length, correlationId });
  const alreadySentTo = new Set<string>((recentMessages || []).map((row) => String(row.receiver_id)));
  const rows = teacherIds
    .filter((teacherId) => !alreadySentTo.has(teacherId))
    .map((teacherId) => ({ sender_id: admin.userId, receiver_id: teacherId, subject, message, recipient_group: sharedAdminIdentity ? "admin" : null, ...(attachmentLink ? { attachment_link: attachmentLink } : {}), ...(attachments.length ? { attachments } : {}) }));
  if (!rows.length) {
    return NextResponse.json({ success: true, duplicate: true, count: 0, ids: [], message: "Message already sent." }, { headers: { "Cache-Control": "no-store" } });
  }
  const { data: inserted, error: insertError } = await supabaseAdmin.from("messages").insert(rows).select("id, receiver_id");
  if (insertError) {
    logFailure("message-insert", insertError, { recipientCount: rows.length, correlationId });
    return errorResponse("Unable to send message.", 500);
  }
  let pushSent = 0;
  let pushUnavailable = false;
  let pushReason: string | null = null;
  for (const row of inserted || []) {
    try {
      const result = await sendPortalPush([String(row.receiver_id)], { eventKey: `message:${row.id}`, title: "New message from Admin", body: "You have a new message from Admin.", url: "/teacher/messages", tag: `message:${row.id}`, deliveryPolicy: "direct_message" });
      pushSent += result.sent;
      pushUnavailable ||= result.skipped;
      if (result.skipped) {
        pushReason = result.reason || "unavailable";
        logFailure("push-dispatch", null, { reason: pushReason, recipientCount: 1, correlationId });
      }
    } catch (error: any) {
      pushUnavailable = true;
      pushReason = "delivery_failed";
      logFailure("push-dispatch", error, { recipientCount: 1, correlationId });
    }
  }
  return NextResponse.json({
    success: true,
    count: rows.length,
    ids: (inserted || []).map((row) => row.id),
    push: { sent: pushSent, unavailable: pushUnavailable, reason: pushReason },
    ...(pushUnavailable ? { message: pushUnavailableMessage(pushReason) } : {}),
  }, { headers: { "Cache-Control": "no-store" } });
}
