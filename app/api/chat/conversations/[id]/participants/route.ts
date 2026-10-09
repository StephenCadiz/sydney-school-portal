import { NextRequest, NextResponse } from "next/server";
import { authenticateChatActor, updateChatParticipants } from "../../../../../../lib/chatServer";

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const actor = await authenticateChatActor(request);
  if (!actor) return NextResponse.json({ error: "Staff chat access required." }, { status: 403 });
  const { id } = await context.params;
  const body = await request.json().catch(() => null);
  const participantId = typeof body?.participantId === "string" ? body.participantId : "";
  if (!participantId) return NextResponse.json({ error: "A staff participant is required." }, { status: 400 });
  try {
    await updateChatParticipants(actor, id, "add", participantId);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    const status = error?.message?.includes("access") || error?.message?.includes("owner") || error?.message?.includes("manage") ? 403 : 400;
    return NextResponse.json({ error: error?.message || "Unable to add participant." }, { status });
  }
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const actor = await authenticateChatActor(request);
  if (!actor) return NextResponse.json({ error: "Staff chat access required." }, { status: 403 });
  const { id } = await context.params;
  const participantId = request.nextUrl.searchParams.get("participantId") || "";
  if (!participantId) return NextResponse.json({ error: "A staff participant is required." }, { status: 400 });
  try {
    await updateChatParticipants(actor, id, "remove", participantId);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    const status = error?.message?.includes("access") || error?.message?.includes("owner") || error?.message?.includes("manage") ? 403 : 400;
    return NextResponse.json({ error: error?.message || "Unable to remove participant." }, { status });
  }
}
