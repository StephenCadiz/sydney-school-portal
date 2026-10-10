import { NextRequest, NextResponse } from "next/server";
import { authenticatePortalActor, sendPortalPush, tokenFromRequest } from "../../../../lib/pushNotificationsServer";

const categories = new Set(["announcement", "calendar", "classwork"]);

export async function POST(request: NextRequest) {
  const actor = await authenticatePortalActor(tokenFromRequest(request));
  if (!actor) return NextResponse.json({ error: "Teacher, Student, or Admin authentication is required." }, { status: 401 });
  const body = await request.json().catch(() => null);
  const category = String(body?.category || "");
  const eventKey = String(body?.eventKey || "").trim();
  const url = String(body?.url || "/").trim();
  if (!categories.has(category) || !eventKey || eventKey.length > 180 || !url.startsWith("/")) {
    return NextResponse.json({ error: "Invalid portal notification." }, { status: 400 });
  }
  const labels: Record<string, [string, string]> = {
    announcement: ["New announcement", "You have a new announcement to review."],
    calendar: ["Calendar update", "You have a new calendar reminder."],
    classwork: ["Class update", "You have a new class update to review."],
  };
  const [title, bodyText] = labels[category];
  await sendPortalPush([actor.profileId], { eventKey: `self:${category}:${actor.profileId}:${eventKey}`, title, body: bodyText, url, tag: `self:${category}:${eventKey}` });
  return NextResponse.json({ success: true });
}
