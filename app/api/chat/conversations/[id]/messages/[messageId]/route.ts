import { NextRequest, NextResponse } from "next/server";
import { authenticateChatActor, deleteChatMessage, editChatMessage, isChatMessageActionsSchemaUnavailable } from "../../../../../../../lib/chatServer";

type Context = { params: Promise<{ id: string; messageId: string }> };

function responseForError(error: any) {
  const message = String(error?.message || "");
  const schemaUnavailable = isChatMessageActionsSchemaUnavailable(error);
  const status = schemaUnavailable ? 503 : message === "You do not have access to this conversation." ? 403 : message === "Message not found." ? 404 : message === "You can only manage your own messages." ? 403 : 400;
  const safe = [
    "You do not have access to this conversation.",
    "Message not found.",
    "You can only manage your own messages.",
    "Deleted messages cannot be edited.",
    "Enter a message before saving.",
    "Messages must be 10,000 characters or fewer.",
  ].includes(message) ? message : schemaUnavailable ? "Message actions are not available until the chat update is applied." : "Unable to update chat message.";
  return NextResponse.json({ error: safe }, { status });
}

export async function PATCH(request: NextRequest, context: Context) {
  const actor = await authenticateChatActor(request);
  if (!actor) return NextResponse.json({ error: "Staff chat access required." }, { status: 403 });
  const { id, messageId } = await context.params;
  const body = await request.json().catch(() => null);
  try {
    const message = await editChatMessage(actor, id, messageId, typeof body?.body === "string" ? body.body : "");
    return NextResponse.json({ success: true, message }, { headers: { "Cache-Control": "no-store" } });
  } catch (error: any) {
    return responseForError(error);
  }
}

export async function DELETE(request: NextRequest, context: Context) {
  const actor = await authenticateChatActor(request);
  if (!actor) return NextResponse.json({ error: "Staff chat access required." }, { status: 403 });
  const { id, messageId } = await context.params;
  try {
    const message = await deleteChatMessage(actor, id, messageId);
    return NextResponse.json({ success: true, message }, { headers: { "Cache-Control": "no-store" } });
  } catch (error: any) {
    return responseForError(error);
  }
}
