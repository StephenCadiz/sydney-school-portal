import { NextRequest } from "next/server";

import {
  authenticateMessageThreadActor,
  loadMessageThread,
} from "../../../../lib/messageThreadsServer";

export async function GET(request: NextRequest) {
  try {
    const { actor, response } = await authenticateMessageThreadActor(request);
    if (response || !actor) return response || Response.json({ error: "Authentication required." }, { status: 401 });
    const messageId = request.nextUrl.searchParams.get("messageId")?.trim() || "";
    return (await loadMessageThread(messageId, actor)).response;
  } catch (error) {
    console.error("Message thread request failed:", error);
    return Response.json({ error: "Unable to load the message history." }, { status: 500 });
  }
}
