import "server-only";

import { NextRequest } from "next/server";
import { randomUUID } from "crypto";
import { supabaseAdmin } from "./supabaseAdmin";
import { sendPortalPush } from "./pushNotificationsServer";
import { MESSAGE_ATTACHMENT_MAX_COUNT, validateMessageFile } from "./messageAttachmentConfig";

export type ChatActor = { authUserId: string; profileId: string; role: "admin" | "teacher" };
export type ChatAttachmentInput = { storagePath: string; fileName: string; mimeType: string; byteSize: number };

function tokenFromRequest(request: NextRequest) {
  const value = request.headers.get("authorization") || "";
  return value.startsWith("Bearer ") ? value.slice(7).trim() : "";
}

export async function authenticateChatActor(request: NextRequest): Promise<ChatActor | null> {
  const token = tokenFromRequest(request);
  if (!token) return null;
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) return null;
  const authUser = data.user;
  const direct = await supabaseAdmin
    .from("profiles")
    .select("id, role, active, email")
    .eq("id", authUser.id)
    .maybeSingle();
  let profile = direct.data;
  if (!profile && authUser.email) {
    const byEmail = await supabaseAdmin
      .from("profiles")
      .select("id, role, active, email")
      .ilike("email", authUser.email)
      .limit(2);
    if (!byEmail.error && byEmail.data?.length === 1) profile = byEmail.data[0];
  }
  if (!profile || !["admin", "teacher"].includes(String(profile.role)) || profile.active === false) return null;
  return { authUserId: authUser.id, profileId: String(profile.id), role: profile.role as ChatActor["role"] };
}

export function chatError(message: string, status = 400) {
  return { success: false, error: message, status };
}

function profileName(profile: any) {
  return `${profile?.first_name || ""} ${profile?.last_name || ""}`.trim() || "Staff member";
}

export async function searchChatRecipients(actor: ChatActor, query: string) {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];
  const pattern = `%${trimmed.replace(/[%_,]/g, " ")}%`;
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("id, first_name, last_name, role, active")
    .in("role", ["admin", "teacher"])
    .or("active.is.null,active.eq.true")
    .neq("id", actor.profileId)
    .or(`first_name.ilike.${pattern},last_name.ilike.${pattern}`)
    .order("first_name")
    .limit(20);
  if (error) throw error;
  return (data || []).filter((profile) => profile.active !== false).map((profile) => ({ id: profile.id, name: profileName(profile), role: profile.role }));
}

async function getParticipantIds(conversationId: string) {
  const { data, error } = await supabaseAdmin.from("chat_participants").select("profile_id, left_at").eq("conversation_id", conversationId);
  if (error) throw error;
  return (data || []).filter((item) => !item.left_at).map((item) => String(item.profile_id));
}

async function assertParticipant(actor: ChatActor, conversationId: string) {
  const { data, error } = await supabaseAdmin
    .from("chat_participants")
    .select("conversation_id")
    .eq("conversation_id", conversationId)
    .eq("profile_id", actor.profileId)
    .is("left_at", null)
    .maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

export async function listChatConversations(actor: ChatActor) {
  const { data: memberships, error: membershipError } = await supabaseAdmin
    .from("chat_participants")
    .select("conversation_id, last_read_at")
    .eq("profile_id", actor.profileId)
    .is("left_at", null);
  if (membershipError) throw membershipError;
  const ids = (memberships || []).map((row) => String(row.conversation_id));
  if (!ids.length) return [];
  const { data: conversations, error: conversationError } = await supabaseAdmin
    .from("chat_conversations")
    .select("id, kind, name, created_by, created_at, updated_at, last_message_at")
    .in("id", ids)
    .order("last_message_at", { ascending: false, nullsFirst: false });
  if (conversationError) throw conversationError;
  const { data: participants, error: participantError } = await supabaseAdmin
    .from("chat_participants")
    .select("conversation_id, profile_id")
    .in("conversation_id", ids)
    .is("left_at", null);
  if (participantError) throw participantError;
  const otherIds = Array.from(new Set((participants || []).map((row) => String(row.profile_id)).filter((id) => id !== actor.profileId)));
  const { data: profiles, error: profileError } = otherIds.length
    ? await supabaseAdmin.from("profiles").select("id, first_name, last_name, role").in("id", otherIds)
    : { data: [], error: null };
  if (profileError) throw profileError;
  const { data: messages, error: messageError } = await supabaseAdmin
    .from("chat_messages")
    .select("id, conversation_id, sender_id, body, created_at")
    .in("conversation_id", ids)
    .order("created_at", { ascending: false });
  if (messageError) throw messageError;
  const profileById = new Map((profiles || []).map((profile) => [String(profile.id), profile]));
  const memberByConversation = new Map<string, string[]>();
  for (const participant of participants || []) memberByConversation.set(String(participant.conversation_id), [...(memberByConversation.get(String(participant.conversation_id)) || []), String(participant.profile_id)]);
  const membershipByConversation = new Map((memberships || []).map((membership) => [String(membership.conversation_id), membership]));
  const latestByConversation = new Map<string, any>();
  for (const message of messages || []) if (!latestByConversation.has(String(message.conversation_id))) latestByConversation.set(String(message.conversation_id), message);
  return (conversations || []).map((conversation) => {
    const memberIds = memberByConversation.get(String(conversation.id)) || [];
    const names = memberIds.filter((id) => id !== actor.profileId).map((id) => profileName(profileById.get(id))).filter(Boolean);
    const latest = latestByConversation.get(String(conversation.id));
    const lastReadAt = membershipByConversation.get(String(conversation.id))?.last_read_at;
    const unreadCount = (messages || []).filter((message) => String(message.conversation_id) === String(conversation.id) && message.sender_id !== actor.profileId && (!lastReadAt || new Date(message.created_at).getTime() > new Date(lastReadAt).getTime())).length;
    return { ...conversation, display_name: conversation.name || names.join(", ") || "Conversation", participants: memberIds.map((id) => ({ id, name: profileName(profileById.get(id)), role: profileById.get(id)?.role || "" })), last_message: latest ? { body: latest.body, created_at: latest.created_at } : null, unread_count: unreadCount };
  });
}

export async function createChatConversation(actor: ChatActor, input: { kind: "direct" | "group"; name?: string; participantIds: string[] }) {
  const participantIds = Array.from(new Set([actor.profileId, ...input.participantIds.filter(Boolean)]));
  if (input.kind === "direct" && participantIds.length !== 2) throw new Error("A direct chat needs one other staff member.");
  if (input.kind === "group" && participantIds.length < 2) throw new Error("Choose at least one other staff member.");
  if (input.kind === "group" && !input.name?.trim()) throw new Error("Group name is required.");
  const { data: profiles, error: profileError } = await supabaseAdmin.from("profiles").select("id, role, active").in("id", participantIds);
  if (profileError) throw profileError;
  if ((profiles || []).length !== participantIds.length || (profiles || []).some((profile) => profile.active === false || !["admin", "teacher"].includes(String(profile.role)))) throw new Error("One or more selected participants are unavailable.");
  const directKey = input.kind === "direct" ? [...participantIds].sort().join(":") : null;
  if (directKey) {
    const existing = await supabaseAdmin.from("chat_conversations").select("id").eq("direct_key", directKey).maybeSingle();
    if (existing.error) throw existing.error;
    if (existing.data) return existing.data.id;
  }
  const { data: conversation, error: conversationError } = await supabaseAdmin.from("chat_conversations").insert({ kind: input.kind, direct_key: directKey, name: input.kind === "group" ? input.name?.trim() : null, created_by: actor.profileId, updated_at: new Date().toISOString() }).select("id").single();
  if (conversationError) {
    if (conversationError.code === "23505" && directKey) {
      const retry = await supabaseAdmin.from("chat_conversations").select("id").eq("direct_key", directKey).single();
      if (retry.data) return retry.data.id;
    }
    throw conversationError;
  }
  const { error: participantError } = await supabaseAdmin.from("chat_participants").insert(participantIds.map((profileId) => ({ conversation_id: conversation.id, profile_id: profileId })));
  if (participantError) {
    await supabaseAdmin.from("chat_conversations").delete().eq("id", conversation.id);
    throw participantError;
  }
  return conversation.id;
}

export async function updateChatParticipants(actor: ChatActor, conversationId: string, action: "add" | "remove", participantId: string) {
  const { data: conversation, error: conversationError } = await supabaseAdmin.from("chat_conversations").select("id, kind, created_by").eq("id", conversationId).maybeSingle();
  if (conversationError) throw conversationError;
  if (!conversation || conversation.kind !== "group") throw new Error("Only group conversations support participant changes.");
  if (!(await assertParticipant(actor, conversationId))) throw new Error("You do not have access to this conversation.");
  if (conversation.created_by !== actor.profileId && actor.role !== "admin") throw new Error("Only the group owner or an Admin can manage participants.");
  if (action === "remove" && participantId === String(conversation.created_by)) throw new Error("The group owner cannot be removed.");
  const profile = await supabaseAdmin.from("profiles").select("id, role, active").eq("id", participantId).maybeSingle();
  if (profile.error) throw profile.error;
  if (!profile.data || profile.data.active === false || !["admin", "teacher"].includes(String(profile.data.role))) throw new Error("That staff member is unavailable.");
  if (action === "add") {
    const { error } = await supabaseAdmin.from("chat_participants").upsert({ conversation_id: conversationId, profile_id: participantId, left_at: null }, { onConflict: "conversation_id,profile_id" });
    if (error) throw error;
  } else {
    const { error } = await supabaseAdmin.from("chat_participants").update({ left_at: new Date().toISOString() }).eq("conversation_id", conversationId).eq("profile_id", participantId);
    if (error) throw error;
  }
}

export async function listChatMessages(actor: ChatActor, conversationId: string, limit = 50, before?: string) {
  if (!(await assertParticipant(actor, conversationId))) throw new Error("You do not have access to this conversation.");
  let query = supabaseAdmin.from("chat_messages").select("id, conversation_id, sender_id, body, created_at").eq("conversation_id", conversationId).order("created_at", { ascending: false }).limit(Math.min(Math.max(limit, 1), 100));
  if (before) query = query.lt("created_at", before);
  const { data, error } = await query;
  if (error) throw error;
  const messageIds = (data || []).map((message) => String(message.id));
  const { data: attachments, error: attachmentError } = messageIds.length
    ? await supabaseAdmin.from("chat_attachments").select("id, message_id, file_name, mime_type, byte_size").in("message_id", messageIds)
    : { data: [], error: null };
  if (attachmentError) throw attachmentError;
  const attachmentsByMessage = new Map<string, any[]>();
  for (const attachment of attachments || []) attachmentsByMessage.set(String(attachment.message_id), [...(attachmentsByMessage.get(String(attachment.message_id)) || []), attachment]);
  const senderIds = Array.from(new Set((data || []).map((message) => String(message.sender_id))));
  const profiles = senderIds.length ? await supabaseAdmin.from("profiles").select("id, first_name, last_name, role").in("id", senderIds) : { data: [], error: null };
  if (profiles.error) throw profiles.error;
  const profileById = new Map((profiles.data || []).map((profile) => [String(profile.id), profile]));
  return (data || []).reverse().map((message) => ({ ...message, sender_name: profileName(profileById.get(String(message.sender_id))), sender_role: profileById.get(String(message.sender_id))?.role || "", attachments: attachmentsByMessage.get(String(message.id)) || [] }));
}

export async function sendChatMessage(actor: ChatActor, conversationId: string, body: string, idempotencyKey: string, attachments: ChatAttachmentInput[] = []) {
  if (!(await assertParticipant(actor, conversationId))) throw new Error("You do not have access to this conversation.");
  const trimmed = body.trim();
  if (!trimmed) throw new Error("Enter a message before sending.");
  if (!idempotencyKey || idempotencyKey.length > 120) throw new Error("A valid message request key is required.");
  if (attachments.length > MESSAGE_ATTACHMENT_MAX_COUNT) throw new Error("You can attach up to 10 files.");
  const existing = await supabaseAdmin.from("chat_messages").select("id, conversation_id, sender_id, body, created_at").eq("conversation_id", conversationId).eq("sender_id", actor.profileId).eq("idempotency_key", idempotencyKey).maybeSingle();
  if (existing.error) throw existing.error;
  if (existing.data) return existing.data;
  const { data: inserted, error } = await supabaseAdmin.from("chat_messages").insert({ conversation_id: conversationId, sender_id: actor.profileId, body: trimmed, idempotency_key: idempotencyKey }).select("id, conversation_id, sender_id, body, created_at").single();
  if (error) {
    if (error.code === "23505") {
      const retry = await supabaseAdmin.from("chat_messages").select("id, conversation_id, sender_id, body, created_at").eq("conversation_id", conversationId).eq("sender_id", actor.profileId).eq("idempotency_key", idempotencyKey).single();
      if (retry.data) return retry.data;
    }
    throw error;
  }
  if (attachments.length) {
    const { error: attachmentError } = await supabaseAdmin.from("chat_attachments").insert(attachments.map((attachment) => ({ message_id: inserted.id, storage_path: attachment.storagePath, file_name: attachment.fileName, mime_type: attachment.mimeType, byte_size: attachment.byteSize })));
    if (attachmentError) throw attachmentError;
  }
  await supabaseAdmin.from("chat_conversations").update({ updated_at: new Date().toISOString(), last_message_at: inserted.created_at }).eq("id", conversationId);
  const recipients = (await getParticipantIds(conversationId)).filter((id) => id !== actor.profileId);
  if (recipients.length) {
    const { data: recipientProfiles } = await supabaseAdmin.from("profiles").select("id, role").in("id", recipients);
    for (const recipient of recipientProfiles || []) {
      await sendPortalPush([String(recipient.id)], { eventKey: `chat:${inserted.id}`, title: "New chat message", body: "You have a new staff chat message.", url: `${recipient.role === "admin" ? "/admin/chat" : "/teacher/chat"}?conversation=${conversationId}`, tag: `chat:${conversationId}` });
    }
  }
  return inserted;
}

export async function uploadChatFiles(actor: ChatActor, files: File[]) {
  if (!files.length) return [];
  if (files.length > MESSAGE_ATTACHMENT_MAX_COUNT) throw new Error("You can attach up to 10 files.");
  const uploaded: ChatAttachmentInput[] = [];
  try {
    for (const file of files) {
      const validation = validateMessageFile({ name: file.name, type: file.type, size: file.size });
      if (validation) throw new Error(validation);
      const id = randomUUID();
      const storagePath = `chat/${actor.profileId}/${id}`;
      const { error } = await supabaseAdmin.storage.from("message-attachments").upload(storagePath, file, { cacheControl: "3600", contentType: file.type, upsert: false });
      if (error) throw error;
      uploaded.push({ storagePath, fileName: file.name.normalize("NFKC").replace(/[^a-zA-Z0-9._ -]/g, "_").slice(0, 120) || "attachment", mimeType: file.type, byteSize: file.size });
    }
    return uploaded;
  } catch (error) {
    if (uploaded.length) await supabaseAdmin.storage.from("message-attachments").remove(uploaded.map((item) => item.storagePath)).catch(() => undefined);
    throw error;
  }
}

export async function getChatAttachmentUrl(actor: ChatActor, attachmentId: string) {
  const { data: attachment, error } = await supabaseAdmin.from("chat_attachments").select("id, message_id, storage_path, file_name").eq("id", attachmentId).maybeSingle();
  if (error) throw error;
  if (!attachment) throw new Error("Attachment not found.");
  const { data: message, error: messageError } = await supabaseAdmin.from("chat_messages").select("conversation_id").eq("id", attachment.message_id).maybeSingle();
  if (messageError) throw messageError;
  if (!message || !(await assertParticipant(actor, String(message.conversation_id)))) throw new Error("You do not have access to this attachment.");
  const signed = await supabaseAdmin.storage.from("message-attachments").createSignedUrl(String(attachment.storage_path), 120);
  if (signed.error || !signed.data?.signedUrl) throw signed.error || new Error("Unable to open attachment.");
  return { url: signed.data.signedUrl, fileName: attachment.file_name };
}

export async function markChatRead(actor: ChatActor, conversationId: string) {
  if (!(await assertParticipant(actor, conversationId))) throw new Error("You do not have access to this conversation.");
  const now = new Date().toISOString();
  const { error } = await supabaseAdmin.from("chat_participants").update({ last_read_at: now }).eq("conversation_id", conversationId).eq("profile_id", actor.profileId);
  if (error) throw error;
  const { data: messages, error: messageError } = await supabaseAdmin.from("chat_messages").select("id").eq("conversation_id", conversationId).neq("sender_id", actor.profileId).lte("created_at", now);
  if (messageError) throw messageError;
  if (messages?.length) await supabaseAdmin.from("chat_message_reads").upsert(messages.map((message) => ({ message_id: message.id, reader_id: actor.profileId, read_at: now })), { onConflict: "message_id,reader_id" });
}

export function newChatIdempotencyKey() { return randomUUID(); }
