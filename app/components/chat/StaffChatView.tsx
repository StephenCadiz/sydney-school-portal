"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { MessageCircle, Plus, Search, Send, Users, X } from "lucide-react";
import { supabase } from "../../../lib/supabase";

type Conversation = {
  id: string;
  kind: "direct" | "group";
  name?: string | null;
  display_name: string;
  unread_count: number;
  last_message?: { body: string; created_at: string } | null;
  participants?: Array<{ id: string; name: string; role: string }>;
};
type ChatMessage = { id: string; sender_id: string; sender_name: string; body: string; created_at: string; attachments?: Array<{ id: string; file_name: string; mime_type: string; byte_size: number }> };
type Recipient = { id: string; name: string; role: string };

function displayTime(value?: string) {
  if (!value) return "";
  return new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Madrid", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(value));
}

async function authHeaders() {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ? { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" } : null;
}

export default function StaffChatView() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [composer, setComposer] = useState("");
  const [search, setSearch] = useState("");
  const [recipientSearch, setRecipientSearch] = useState("");
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [selectedRecipients, setSelectedRecipients] = useState<Recipient[]>([]);
  const [groupName, setGroupName] = useState("");
  const [newChatOpen, setNewChatOpen] = useState(false);
  const [newChatKind, setNewChatKind] = useState<"direct" | "group">("direct");
  const [manageOpen, setManageOpen] = useState(false);
  const [manageSearch, setManageSearch] = useState("");
  const [manageRecipients, setManageRecipients] = useState<Recipient[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [attachmentFiles, setAttachmentFiles] = useState<File[]>([]);
  const [error, setError] = useState("");

  const loadConversations = useCallback(async () => {
    const headers = await authHeaders();
    if (!headers) return;
    const response = await fetch("/api/chat/conversations", { headers, cache: "no-store" });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "Unable to load chat.");
    setConversations(payload.conversations || []);
    if (!selectedId && payload.conversations?.[0]?.id) setSelectedId(payload.conversations[0].id);
  }, [selectedId]);

  const loadMessages = useCallback(async (conversationId: string) => {
    if (!conversationId) return;
    const headers = await authHeaders();
    if (!headers) return;
    setLoadingMessages(true);
    try {
      const response = await fetch(`/api/chat/conversations/${conversationId}/messages`, { headers, cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Unable to load chat history.");
      setMessages(payload.messages || []);
      await fetch(`/api/chat/conversations/${conversationId}/read`, { method: "POST", headers });
      setConversations((current) => current.map((conversation) => conversation.id === conversationId ? { ...conversation, unread_count: 0 } : conversation));
    } catch (loadError: any) {
      setError(loadError?.message || "Unable to load chat history.");
    } finally {
      setLoadingMessages(false);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    void loadConversations().catch((loadError: any) => setError(loadError?.message || "Unable to load chat." )).finally(() => setLoading(false));
    const interval = window.setInterval(() => void loadConversations().catch(() => undefined), 30_000);
    return () => window.clearInterval(interval);
  }, [loadConversations]);

  useEffect(() => { void loadMessages(selectedId); }, [loadMessages, selectedId]);

  useEffect(() => {
    if (recipientSearch.trim().length < 2) { setRecipients([]); return; }
    const timer = window.setTimeout(async () => {
      const headers = await authHeaders();
      if (!headers) return;
      const response = await fetch(`/api/chat/recipients?q=${encodeURIComponent(recipientSearch)}`, { headers, cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (response.ok) setRecipients(payload.recipients || []);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [recipientSearch]);

  useEffect(() => {
    if (!manageOpen || manageSearch.trim().length < 2) { setManageRecipients([]); return; }
    const timer = window.setTimeout(async () => {
      const headers = await authHeaders();
      if (!headers) return;
      const response = await fetch(`/api/chat/recipients?q=${encodeURIComponent(manageSearch)}`, { headers, cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (response.ok) setManageRecipients(payload.recipients || []);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [manageOpen, manageSearch]);

  const visibleConversations = useMemo(() => conversations.filter((conversation) => conversation.display_name.toLocaleLowerCase().includes(search.toLocaleLowerCase())), [conversations, search]);
  const selectedConversation = conversations.find((conversation) => conversation.id === selectedId);

  async function createConversation() {
    const headers = await authHeaders();
    if (!headers || !selectedRecipients.length) return;
    setError("");
    const response = await fetch("/api/chat/conversations", { method: "POST", headers, body: JSON.stringify({ kind: newChatKind, name: groupName, participantIds: selectedRecipients.map((recipient) => recipient.id) }) });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) { setError(payload.error || "Unable to create chat."); return; }
    setNewChatOpen(false); setSelectedRecipients([]); setRecipientSearch(""); setGroupName("");
    await loadConversations();
    setSelectedId(payload.conversationId);
  }

  async function sendMessage() {
    if (!selectedId || !composer.trim() || sending) return;
    const headers = await authHeaders();
    if (!headers) return;
    setSending(true); setError("");
    try {
      const formData = new FormData();
      formData.set("body", composer);
      formData.set("idempotencyKey", crypto.randomUUID());
      attachmentFiles.forEach((file) => formData.append("files", file));
      const response = await fetch(`/api/chat/conversations/${selectedId}/messages`, { method: "POST", headers: { Authorization: headers.Authorization }, body: formData });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Unable to send chat message.");
      setComposer("");
      setAttachmentFiles([]);
      await loadMessages(selectedId);
      await loadConversations();
    } catch (sendError: any) { setError(sendError?.message || "Unable to send chat message."); }
    finally { setSending(false); }
  }

  async function changeParticipant(participantId: string, action: "add" | "remove") {
    if (!selectedId) return;
    const headers = await authHeaders();
    if (!headers) return;
    const response = await fetch(`/api/chat/conversations/${selectedId}/participants${action === "remove" ? `?participantId=${encodeURIComponent(participantId)}` : ""}`, { method: action === "remove" ? "DELETE" : "POST", headers, ...(action === "add" ? { body: JSON.stringify({ participantId }) } : {}) });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) { setError(payload.error || "Unable to update participants."); return; }
    setManageSearch(""); setManageRecipients([]); await loadConversations();
  }

  return (
    <section className="staff-chat-page" aria-label="Staff chat">
      <header className="staff-chat-header">
        <div><span className="staff-chat-eyebrow">STAFF COMMUNICATION</span><h1>Chat</h1><p>Private conversations for Teachers and Admin staff.</p></div>
        <button type="button" className="staff-chat-primary" onClick={() => setNewChatOpen(true)}><Plus size={17} aria-hidden="true" /> New chat</button>
      </header>
      {error && <p className="staff-chat-error" role="alert">{error}</p>}
      <div className="staff-chat-shell">
        <aside className="staff-chat-conversations" aria-label="Conversations">
          <label className="staff-chat-search"><Search size={17} aria-hidden="true" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search conversations" aria-label="Search conversations" /></label>
          {loading ? <p className="staff-chat-empty">Loading conversations…</p> : visibleConversations.length === 0 ? <p className="staff-chat-empty"><MessageCircle size={24} aria-hidden="true" />No conversations yet.</p> : visibleConversations.map((conversation) => (
            <button type="button" key={conversation.id} className={`staff-chat-conversation${conversation.id === selectedId ? " is-selected" : ""}`} onClick={() => setSelectedId(conversation.id)}>
              <span className="staff-chat-avatar" aria-hidden="true">{conversation.display_name.slice(0, 1).toUpperCase()}</span>
              <span className="staff-chat-conversation-copy"><strong>{conversation.display_name}</strong><small>{conversation.last_message?.body || "No messages yet"}</small></span>
              <span className="staff-chat-conversation-meta"><time>{displayTime(conversation.last_message?.created_at)}</time>{conversation.unread_count > 0 && <b>{conversation.unread_count}</b>}</span>
            </button>
          ))}
        </aside>
        <section className="staff-chat-thread" aria-label={selectedConversation?.display_name || "Chat conversation"}>
          {!selectedConversation ? <div className="staff-chat-thread-empty"><MessageCircle size={34} aria-hidden="true" /><h2>Select a conversation</h2><p>Choose a chat or start a new one.</p></div> : <>
            <header className="staff-chat-thread-header"><span className="staff-chat-avatar" aria-hidden="true">{selectedConversation.display_name.slice(0, 1).toUpperCase()}</span><div><h2>{selectedConversation.display_name}</h2><small>{selectedConversation.kind === "group" ? "Group conversation" : "Direct conversation"}</small></div>{selectedConversation.kind === "group" && <button type="button" className="staff-chat-manage" onClick={() => setManageOpen(true)}>Manage participants</button>}</header>
            <div className="staff-chat-messages" aria-live="polite">{loadingMessages ? <p className="staff-chat-empty">Loading messages…</p> : messages.length === 0 ? <p className="staff-chat-empty">No messages yet. Start the conversation.</p> : messages.map((message) => <article className="staff-chat-message" key={message.id}><div className="staff-chat-message-meta"><strong>{message.sender_name}</strong><time>{displayTime(message.created_at)}</time></div><p>{message.body}</p>{message.attachments?.length ? <div className="staff-chat-message-attachments">{message.attachments.map((attachment) => <button type="button" key={attachment.id} onClick={async () => { const headers = await authHeaders(); if (!headers) return; const response = await fetch(`/api/chat/attachments/${attachment.id}`, { headers }); const payload = await response.json().catch(() => ({})); if (response.ok && payload.url) window.open(payload.url, "_blank", "noopener,noreferrer"); }} aria-label={`Open attachment ${attachment.file_name}`}>{attachment.file_name}</button>)}</div> : null}</article>)}</div>
            <form className="staff-chat-composer" onSubmit={(event) => { event.preventDefault(); void sendMessage(); }}><textarea value={composer} onChange={(event) => setComposer(event.target.value)} placeholder="Write a message…" aria-label="Chat message" rows={2} /><div className="staff-chat-composer-controls"><label className="staff-chat-attach"><input type="file" multiple onChange={(event) => setAttachmentFiles(Array.from(event.target.files || []))} />Attach files</label>{attachmentFiles.length > 0 && <small>{attachmentFiles.map((file) => file.name).join(", ")}</small>}<button type="submit" className="staff-chat-primary" disabled={sending || (!composer.trim() && attachmentFiles.length === 0)}><Send size={17} aria-hidden="true" />{sending ? "Sending…" : "Send"}</button></div></form>
          </>}
        </section>
      </div>
      {newChatOpen && <div className="staff-chat-dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setNewChatOpen(false); }}><section className="staff-chat-dialog" role="dialog" aria-modal="true" aria-labelledby="new-chat-title"><button type="button" className="staff-chat-dialog-close" aria-label="Close new chat" onClick={() => setNewChatOpen(false)}><X size={18} /></button><h2 id="new-chat-title">New chat</h2><div className="staff-chat-mode-buttons"><button type="button" className={newChatKind === "direct" ? "is-active" : ""} onClick={() => setNewChatKind("direct")}>Direct</button><button type="button" className={newChatKind === "group" ? "is-active" : ""} onClick={() => setNewChatKind("group")}><Users size={15} /> Group</button></div>{newChatKind === "group" && <input value={groupName} onChange={(event) => setGroupName(event.target.value)} placeholder="Group name" aria-label="Group name" />}{selectedRecipients.length > 0 && <div className="staff-chat-recipient-chips">{selectedRecipients.map((recipient) => <button type="button" key={recipient.id} onClick={() => setSelectedRecipients((current) => current.filter((item) => item.id !== recipient.id))}>{recipient.name} ×</button>)}</div>}<input value={recipientSearch} onChange={(event) => setRecipientSearch(event.target.value)} placeholder="Search Teachers and Admin staff" aria-label="Search Teachers and Admin staff" />{recipients.length > 0 && <div className="staff-chat-recipient-results">{recipients.map((recipient) => <button type="button" key={recipient.id} onClick={() => { if (newChatKind === "direct") setSelectedRecipients([recipient]); else setSelectedRecipients((current) => current.some((item) => item.id === recipient.id) ? current : [...current, recipient]); setRecipients([]); setRecipientSearch(""); }}>{recipient.name}<small>{recipient.role}</small></button>)}</div>}<button type="button" className="staff-chat-primary" disabled={!selectedRecipients.length || (newChatKind === "group" && !groupName.trim())} onClick={() => void createConversation()}>Create conversation</button></section></div>}
      {manageOpen && selectedConversation?.kind === "group" && <div className="staff-chat-dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setManageOpen(false); }}><section className="staff-chat-dialog" role="dialog" aria-modal="true" aria-labelledby="manage-chat-title"><button type="button" className="staff-chat-dialog-close" aria-label="Close participant manager" onClick={() => setManageOpen(false)}><X size={18} /></button><h2 id="manage-chat-title">Manage participants</h2><div className="staff-chat-participant-list">{selectedConversation.participants?.map((participant) => <div key={participant.id}><span>{participant.name}<small>{participant.role}</small></span><button type="button" onClick={() => void changeParticipant(participant.id, "remove")}>Remove</button></div>)}</div><input value={manageSearch} onChange={(event) => setManageSearch(event.target.value)} placeholder="Search staff to add" aria-label="Search staff to add" />{manageRecipients.length > 0 && <div className="staff-chat-recipient-results">{manageRecipients.map((recipient) => <button type="button" key={recipient.id} onClick={() => void changeParticipant(recipient.id, "add")}>{recipient.name}<small>{recipient.role}</small></button>)}</div>}</section></div>}
    </section>
  );
}
