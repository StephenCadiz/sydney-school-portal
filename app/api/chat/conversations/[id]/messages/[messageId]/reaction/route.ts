import { NextRequest, NextResponse } from "next/server";
import { authenticateChatActor, toggleChatReaction } from "../../../../../../../../lib/chatServer";

async function handle(request: NextRequest, context: { params: Promise<{ id: string; messageId: string }> }, add: boolean) {
  const actor = await authenticateChatActor(request);
  if (!actor) return NextResponse.json({ error: "Staff chat access required." }, { status: 403 });
  const { id, messageId } = await context.params;
  try {
    const reactions = await toggleChatReaction(actor, id, messageId, add);
    return NextResponse.json({ success: true, reactions }, { headers: { "Cache-Control": "no-store" } });
  } catch (error: any) {
    const schemaUnavailable = error?.code === "42P01" || error?.code === "PGRST205";
    const status = schemaUnavailable ? 503 : error?.message === "You do not have access to this conversation." ? 403 : error?.message === "Message not found." ? 404 : 400;
    const safe = schemaUnavailable ? "Thumbs-up reactions are not available yet." : ["You do not have access to this conversation.", "Message not found."].includes(error?.message) ? error.message : "Unable to update message reaction.";
    return NextResponse.json({ error: safe }, { status });
  }
}

export async function POST(request: NextRequest, context: { params: Promise<{ id: string; messageId: string }> }) {
  return handle(request, context, true);
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string; messageId: string }> }) {
  return handle(request, context, false);
}
