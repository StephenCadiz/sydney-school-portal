import { NextRequest, NextResponse } from "next/server";
import { authenticateChatActor, getChatUnreadCount } from "../../../../lib/chatServer";

export async function GET(request: NextRequest) {
  const actor = await authenticateChatActor(request);
  if (!actor) return NextResponse.json({ error: "Staff chat access required." }, { status: 403 });
  try {
    return NextResponse.json(
      { unread_count: await getChatUnreadCount(actor) },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("Chat unread count failed:", error);
    return NextResponse.json({ error: "Unable to load unread chat count." }, { status: 500 });
  }
}
