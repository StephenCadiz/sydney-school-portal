import { NextRequest, NextResponse } from "next/server";

import {
  authenticatePortalActor,
  tokenFromRequest,
} from "../../../../../../lib/pushNotificationsServer";
import { supabaseAdmin } from "../../../../../../lib/supabaseAdmin";

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
  if (!actor || actor.role !== "teacher") {
    return jsonError("Teacher access required.", 403);
  }

  const { id } = await routeContext.params;
  try {
    const { data: document, error: documentError } = await supabaseAdmin
      .from("follow_up_documents")
      .select("id, last_admin_action_at")
      .eq("id", id)
      .eq("teacher_id", actor.profileId)
      .maybeSingle();

    if (documentError) throw documentError;
    if (!document) return jsonError("Follow-up document not found.", 404);
    if (!document.last_admin_action_at) {
      return NextResponse.json(
        { success: true },
        { headers: { "Cache-Control": "no-store" } }
      );
    }

    const { error: updateError } = await supabaseAdmin
      .from("follow_up_documents")
      .update({ teacher_action_seen_at: document.last_admin_action_at })
      .eq("id", id)
      .eq("teacher_id", actor.profileId);
    if (updateError) throw updateError;

    return NextResponse.json(
      { success: true },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("Teacher follow-up action notice update failed:", error);
    return jsonError("Unable to mark the follow-up notification as opened.", 500);
  }
}
