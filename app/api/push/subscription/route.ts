import { NextRequest, NextResponse } from "next/server";
import { authenticatePortalActor, removePushSubscription, savePushSubscription, tokenFromRequest } from "../../../../lib/pushNotificationsServer";

function fail(message: string, status = 400) { return NextResponse.json({ error: message }, { status }); }

export async function POST(request: NextRequest) {
  const actor = await authenticatePortalActor(tokenFromRequest(request));
  if (!actor) return fail("Teacher or Student authentication is required.", 401);
  const body = await request.json().catch(() => null);
  try {
    await savePushSubscription(actor, body?.subscription, request.headers.get("user-agent"));
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return fail(error?.message || "Unable to save notification settings.", 400);
  }
}

export async function DELETE(request: NextRequest) {
  const actor = await authenticatePortalActor(tokenFromRequest(request));
  if (!actor) return fail("Teacher or Student authentication is required.", 401);
  const body = await request.json().catch(() => null);
  const endpoint = String(body?.endpoint || "").trim();
  if (!endpoint) return fail("A subscription endpoint is required.");
  try {
    await removePushSubscription(actor.profileId, endpoint);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return fail(error?.message || "Unable to remove notification settings.", 400);
  }
}
