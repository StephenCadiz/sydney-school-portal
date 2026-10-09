import { NextRequest, NextResponse } from "next/server";
import { authenticateChatActor, chatError, createChatConversation, listChatConversations } from "../../../../lib/chatServer";

export async function GET(request: NextRequest) {
  const actor = await authenticateChatActor(request);
  if (!actor) return NextResponse.json(chatError("Staff chat access required.", 403), { status: 403 });
  try {
    const conversations = await listChatConversations(actor);
    return NextResponse.json({ conversations }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Chat conversation list failed:", error);
    return NextResponse.json(chatError("Unable to load chat conversations.", 500), { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const actor = await authenticateChatActor(request);
  if (!actor) return NextResponse.json(chatError("Staff chat access required.", 403), { status: 403 });
  const body = await request.json().catch(() => null);
  const kind = body?.kind === "group" ? "group" : body?.kind === "direct" ? "direct" : "";
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const participantIds = Array.isArray(body?.participantIds) ? body.participantIds.filter((id: unknown): id is string => typeof id === "string" && uuidPattern.test(id)) : [];
  if (!kind) return NextResponse.json(chatError("Choose a direct or group chat.", 400), { status: 400 });
  try {
    const id = await createChatConversation(actor, { kind, name: typeof body?.name === "string" ? body.name : undefined, participantIds });
    return NextResponse.json({ success: true, conversationId: id }, { headers: { "Cache-Control": "no-store" } });
  } catch (error: any) {
    const message = error?.message === "A direct chat needs one other staff member." || error?.message === "Choose at least one other staff member." || error?.message === "Group name is required." || error?.message === "One or more selected participants are unavailable." ? error.message : "Unable to create chat conversation.";
    return NextResponse.json(chatError(message, 400), { status: 400 });
  }
}
