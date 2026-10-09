import { NextRequest, NextResponse } from "next/server";
import { authenticateChatActor, searchChatRecipients } from "../../../../lib/chatServer";

export async function GET(request: NextRequest) {
  const actor = await authenticateChatActor(request);
  if (!actor) return NextResponse.json({ error: "Staff chat access required." }, { status: 403 });
  try {
    const recipients = await searchChatRecipients(actor, request.nextUrl.searchParams.get("q") || "", request.nextUrl.searchParams.get("all") === "1");
    return NextResponse.json({ recipients }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Chat recipient search failed:", error);
    return NextResponse.json({ error: "Unable to search staff members." }, { status: 500 });
  }
}
