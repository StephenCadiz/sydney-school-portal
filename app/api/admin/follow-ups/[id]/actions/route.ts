import { NextRequest, NextResponse } from "next/server";

import {
  authenticatePortalActor,
  tokenFromRequest,
} from "../../../../../../lib/pushNotificationsServer";
import { supabaseAdmin } from "../../../../../../lib/supabaseAdmin";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function jsonError(error: string, status: number) {
  return NextResponse.json(
    { error },
    { status, headers: { "Cache-Control": "no-store" } }
  );
}

export async function POST(
  request: NextRequest,
  routeContext: { params: Promise<{ id: string }> }
) {
  const actor = await authenticatePortalActor(tokenFromRequest(request));
  if (!actor || actor.role !== "admin") {
    return jsonError("Admin access required.", 403);
  }

  const { id } = await routeContext.params;
  if (!UUID_PATTERN.test(id)) {
    return jsonError("A valid follow-up document is required.", 422);
  }

  const body = await request.json().catch(() => null);
  const details = typeof body?.details === "string" ? body.details.trim() : "";
  if (!details || details.length > 10000) {
    return jsonError(
      "Action taken is required and must be 10,000 characters or fewer.",
      422
    );
  }

  try {
    const { data: document, error: documentError } = await supabaseAdmin
      .from("follow_up_documents")
      .select("id, teacher_id")
      .eq("id", id)
      .maybeSingle();

    if (documentError) throw documentError;
    if (!document) return jsonError("Follow-up document not found.", 404);

    const now = new Date().toISOString();
    const { data: entry, error: entryError } = await supabaseAdmin
      .from("follow_up_entries")
      .insert({
        follow_up_document_id: id,
        teacher_id: actor.profileId,
        author_role: "admin",
        details,
        action_plan: null,
      })
      .select("*")
      .single();

    if (entryError) throw entryError;

    const { error: documentUpdateError } = await supabaseAdmin
      .from("follow_up_documents")
      .update({
        last_admin_action_at: now,
        teacher_action_seen_at: null,
        updated_at: now,
      })
      .eq("id", id);

    if (documentUpdateError) throw documentUpdateError;

    return NextResponse.json(
      { success: true, entry, teacher_id: document.teacher_id },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("Admin follow-up action save failed:", error);
    return jsonError("Unable to save the Admin action.", 500);
  }
}
