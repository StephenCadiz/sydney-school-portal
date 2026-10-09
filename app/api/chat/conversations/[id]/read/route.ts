import { NextRequest, NextResponse } from "next/server";
import { authenticateChatActor, markChatRead } from "../../../../../../lib/chatServer";

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const actor = await authenticateChatActor(request);
  if (!actor) return NextResponse.json({ error: "Staff chat access required." }, { status: 403 });
  const { id } = await context.params;
  try {
    await markChatRead(actor, id);
    return NextResponse.json({ success: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error: any) {
    const status = error?.message === "You do not have access to this conversation." ? 403 : 500;
    return NextResponse.json({ error: status === 403 ? error.message : "Unable to update chat read status." }, { status });
  }
}
