import { NextRequest, NextResponse } from "next/server";
import { authenticateChatActor, listChatMessages, sendChatMessage, uploadChatFiles } from "../../../../../../lib/chatServer";

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const actor = await authenticateChatActor(request);
  if (!actor) return NextResponse.json({ error: "Staff chat access required." }, { status: 403 });
  const { id } = await context.params;
  try {
    const messages = await listChatMessages(actor, id, Number(request.nextUrl.searchParams.get("limit") || 50), request.nextUrl.searchParams.get("before") || undefined);
    return NextResponse.json({ messages }, { headers: { "Cache-Control": "no-store" } });
  } catch (error: any) {
    const status = error?.message === "You do not have access to this conversation." ? 403 : 500;
    return NextResponse.json({ error: status === 403 ? error.message : "Unable to load chat history." }, { status });
  }
}

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const actor = await authenticateChatActor(request);
  if (!actor) return NextResponse.json({ error: "Staff chat access required." }, { status: 403 });
  const { id } = await context.params;
  const isMultipart = (request.headers.get("content-type") || "").includes("multipart/form-data");
  const formData = isMultipart ? await request.formData() : null;
  const body = isMultipart ? null : await request.json().catch(() => null);
  const text = isMultipart ? String(formData?.get("body") || "") : typeof body?.body === "string" ? body.body : "";
  const idempotencyKey = isMultipart ? String(formData?.get("idempotencyKey") || "") : typeof body?.idempotencyKey === "string" ? body.idempotencyKey : "";
  const files = isMultipart ? formData?.getAll("files").filter((value): value is File => value instanceof File) || [] : [];
  let uploaded: Awaited<ReturnType<typeof uploadChatFiles>> = [];
  try {
    uploaded = await uploadChatFiles(actor, files);
    const message = await sendChatMessage(actor, id, text, idempotencyKey, uploaded);
    return NextResponse.json({ success: true, message }, { headers: { "Cache-Control": "no-store" } });
  } catch (error: any) {
    if (uploaded.length) await (await import("../../../../../../lib/supabaseAdmin")).supabaseAdmin.storage.from("message-attachments").remove(uploaded.map((item) => item.storagePath)).catch(() => undefined);
    const status = error?.message === "You do not have access to this conversation." ? 403 : 400;
    const safe = ["You do not have access to this conversation.", "Enter a message before sending.", "A valid message request key is required."].includes(error?.message) ? error.message : "Unable to send chat message.";
    return NextResponse.json({ error: safe }, { status });
  }
}
