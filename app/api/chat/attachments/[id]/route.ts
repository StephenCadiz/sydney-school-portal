import { NextRequest, NextResponse } from "next/server";
import { authenticateChatActor, getChatAttachmentUrl } from "../../../../../lib/chatServer";

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const actor = await authenticateChatActor(request);
  if (!actor) return NextResponse.json({ error: "Staff chat access required." }, { status: 403 });
  try {
    const { id } = await context.params;
    return NextResponse.json(await getChatAttachmentUrl(actor, id), { headers: { "Cache-Control": "no-store" } });
  } catch (error: any) {
    const status = error?.message?.includes("access") ? 403 : error?.message === "Attachment not found." ? 404 : 500;
    return NextResponse.json({ error: status === 403 || status === 404 ? error.message : "Unable to open attachment." }, { status });
  }
}
