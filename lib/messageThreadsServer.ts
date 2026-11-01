import "server-only";

import { NextRequest, NextResponse } from "next/server";

import { resolveProfileIdForAuthUser } from "./cambridgeStudentAccessServer";
import { supabaseAdmin } from "./supabaseAdmin";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isConversationColumnMissing(error: any) {
  return error?.code === "42703" && String(error?.message || "").includes("conversation_id");
}

export type MessageThreadActor = {
  id: string;
  role: "admin" | "teacher" | "student";
};

function tokenFrom(request: NextRequest) {
  const value = request.headers.get("authorization") || "";
  return value.startsWith("Bearer ") ? value.slice("Bearer ".length) : "";
}

export async function authenticateMessageThreadActor(
  request: NextRequest
): Promise<{ actor: MessageThreadActor | null; response: NextResponse | null }> {
  const token = tokenFrom(request);
  if (!token) {
    return { actor: null, response: NextResponse.json({ error: "Authentication required." }, { status: 401 }) };
  }

  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) {
    return { actor: null, response: NextResponse.json({ error: "Authentication required." }, { status: 401 }) };
  }

  const profileId = await resolveProfileIdForAuthUser(data.user.id);
  const { data: profile, error: profileError } = await supabaseAdmin
    .from("profiles")
    .select("id, role, active")
    .eq("id", profileId)
    .maybeSingle();
  if (profileError) {
    return { actor: null, response: NextResponse.json({ error: "Unable to verify account access." }, { status: 500 }) };
  }

  const role = String(profile?.role || "").toLowerCase();
  if (!profile || profile.active === false || !["admin", "teacher", "student"].includes(role)) {
    return { actor: null, response: NextResponse.json({ error: "Message access required." }, { status: 403 }) };
  }

  return { actor: { id: String(profile.id), role: role as MessageThreadActor["role"] }, response: null };
}

function profileName(profile: any, fallback = "Unknown user") {
  return `${profile?.first_name || ""} ${profile?.last_name || ""}`.trim() || fallback;
}

function canReadSource(message: any, actor: MessageThreadActor) {
  if (actor.role === "admin") {
    return message.sender_id === actor.id || message.receiver_id === actor.id ||
      (message.recipient_group === "admin" && !message.receiver_id);
  }
  return message.sender_id === actor.id || message.receiver_id === actor.id;
}

export async function loadMessageThread(messageId: string, actor: MessageThreadActor) {
  if (!UUID.test(messageId)) {
    return { response: NextResponse.json({ error: "A valid message is required." }, { status: 400 }) };
  }

  const { data: source, error: sourceError } = await supabaseAdmin
    .from("messages")
    .select("*")
    .eq("id", messageId)
    .maybeSingle();
  if (sourceError) throw sourceError;
  if (!source || !canReadSource(source, actor)) {
    return { response: NextResponse.json({ error: "Message not found." }, { status: 404 }) };
  }

  const conversationId = String(source.conversation_id || source.id);
  const { data: messages, error: messagesError } = await supabaseAdmin
    .from("messages")
    .select("*")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });
  if (messagesError && !isConversationColumnMissing(messagesError)) throw messagesError;

  // Older linked databases do not have conversation_id yet. Return the source
  // message so opening a mailbox still works until the migration is applied.
  const threadRows = messagesError ? [source] : messages || [];

  const visibleMessages = threadRows.filter((message) => {
    if (message.id === source.id) return true;
    if (actor.role === "admin" && source.recipient_group === "admin" && !source.receiver_id) {
      return true;
    }
    return message.sender_id === actor.id || message.receiver_id === actor.id;
  });
  const profileIds = Array.from(new Set(visibleMessages.flatMap((message) => [message.sender_id, message.receiver_id]).filter(Boolean)));
  const { data: profiles, error: profilesError } = profileIds.length
    ? await supabaseAdmin.from("profiles").select("id, first_name, last_name, role").in("id", profileIds)
    : { data: [], error: null };
  if (profilesError) throw profilesError;
  const profilesById = new Map((profiles || []).map((profile) => [String(profile.id), profile]));

  return {
    response: NextResponse.json({
      source_id: source.id,
      conversation_id: conversationId,
      messages: visibleMessages.map((message) => ({
        ...message,
        sender_name: profileName(profilesById.get(String(message.sender_id || ""))),
        sender_role: profilesById.get(String(message.sender_id || ""))?.role || "",
        receiver_name: message.recipient_group === "admin" && !message.receiver_id
          ? "Admin"
          : profileName(profilesById.get(String(message.receiver_id || ""))),
        receiver_role: message.recipient_group === "admin" && !message.receiver_id
          ? "admin"
          : profilesById.get(String(message.receiver_id || ""))?.role || "",
      })),
    }, { headers: { "Cache-Control": "no-store" } }),
  };
}
