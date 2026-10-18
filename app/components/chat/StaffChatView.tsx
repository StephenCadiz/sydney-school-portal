"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Check, CheckCheck, MessageCircle, Plus, Search, Send, Users, X } from "lucide-react";
import { supabase } from "../../../lib/supabase";
import { clearStaffChatCache, getCachedContacts, getCachedConversations, getCachedMessages, saveCachedContacts, saveCachedConversations, saveCachedMessages } from "../../../lib/staffChatCache";

type ChatParticipant = { id: string; name: string; role: string; avatar_url?: string | null; identity_key?: string };
type Conversation = { id: string; kind: "direct" | "group"; name?: string | null; display_name: string; unread_count: number; avatar_url?: string | null; last_message?: { body: string; created_at: string } | null; participants?: ChatParticipant[] };
type ChatMessage = { id: string; conversation_id?: string; sender_id: string; sender_name: string; body: string; created_at: string; read?: boolean; attachments?: Array<{ id: string; file_name: string; mime_type: string; byte_size: number }> };
type Recipient = { id: string; name: string; role: string; avatar_url?: string | null; identity_key?: string };
type ViewerProfile = { id: string; name: string; role: string; avatar_url?: string | null };
type DesktopChatNotice = { conversationId: string; displayName: string; preview: string; isGroup: boolean };

const SCHOOL_CHAT_AVATAR = "/icons/icon-192.png";
const EMAIL_ONLY_ADMIN_STAFF_PROFILE_ID = "850da38b-97df-4c67-939b-0dd9c2e8036b";

function visibleStaffConversations(conversations: Conversation[]) {
  return conversations.filter((conversation) => !(conversation.kind === "direct" && conversation.participants?.some((participant) => participant.id === EMAIL_ONLY_ADMIN_STAFF_PROFILE_ID)));
}

function ChatAvatar({ conversation, accountId }: { conversation: Conversation; accountId?: string }) {
  const participants = conversation.participants || [];
  const hasAdmin = participants.some((participant) => participant.role === "admin");
  const directParticipant = participants.find((participant) => participant.id !== accountId) || participants[0];
  const avatarUrl = conversation.kind === "group"
    ? (hasAdmin ? SCHOOL_CHAT_AVATAR : participants.find((participant) => participant.role === "teacher")?.avatar_url || SCHOOL_CHAT_AVATAR)
    : directParticipant?.avatar_url || conversation.avatar_url || SCHOOL_CHAT_AVATAR;
  const fallbackText = conversation.display_name.slice(0, 1).toUpperCase();
  return <span className="staff-chat-avatar" aria-hidden="true"><img src={avatarUrl} alt="" onError={(event) => { if (event.currentTarget.src.endsWith(SCHOOL_CHAT_AVATAR)) return; event.currentTarget.src = SCHOOL_CHAT_AVATAR; }} /><span className="staff-chat-avatar-fallback">{fallbackText}</span></span>;
}

function displayTime(value?: string) { if (!value) return ""; return new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Madrid", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(value)); }
function displayDate(value: string) { return new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Madrid", weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date(value)); }
function dateKey(value: string) { return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value)); }
function chatNoticePreview(value?: string) { const preview = String(value || "").replace(/\s+/g, " ").trim(); return preview ? `${preview.slice(0, 160)}${preview.length > 160 ? "…" : ""}` : "New message"; }
async function authHeaders() { const { data: { session } } = await supabase.auth.getSession(); return session?.access_token ? { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" } : null; }

export default function StaffChatView() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [composer, setComposer] = useState("");
  const [search, setSearch] = useState("");
  const [recipientSearch, setRecipientSearch] = useState("");
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [contacts, setContacts] = useState<Recipient[]>([]);
  const [selectedRecipients, setSelectedRecipients] = useState<Recipient[]>([]);
  const [groupName, setGroupName] = useState("");
  const [newChatOpen, setNewChatOpen] = useState(false);
  const [newChatKind, setNewChatKind] = useState<"direct" | "group">("direct");
  const [manageOpen, setManageOpen] = useState(false);
  const [manageSearch, setManageSearch] = useState("");
  const [manageRecipients, setManageRecipients] = useState<Recipient[]>([]);
  const [sending, setSending] = useState(false);
  const [attachmentFiles, setAttachmentFiles] = useState<File[]>([]);
  const [error, setError] = useState("");
  const [accountId, setAccountId] = useState("");
  const [viewer, setViewer] = useState<ViewerProfile | null>(null);
  const [offline, setOffline] = useState(false);
  const [installedPwa, setInstalledPwa] = useState(false);
  const [pwaThreadOpen, setPwaThreadOpen] = useState(false);
  const [desktopNotice, setDesktopNotice] = useState<DesktopChatNotice | null>(null);
  const accountIdRef = useRef("");
  const messageLoadTokenRef = useRef(0);
  const installedPwaRef = useRef(false);
  const conversationSnapshotRef = useRef(new Map<string, { unreadCount: number; lastMessageAt: string }>());
  const conversationSyncReadyRef = useRef(false);

  useLayoutEffect(() => {
    const element = document.querySelector<HTMLTextAreaElement>(".staff-chat-pwa-composer textarea");
    if (!element) return;
    const maxHeight = 132;
    element.style.height = "auto";
    const nextHeight = Math.min(element.scrollHeight, maxHeight);
    element.style.height = `${nextHeight}px`;
    element.style.overflowY = element.scrollHeight > maxHeight ? "auto" : "hidden";
  }, [composer, installedPwa, pwaThreadOpen]);

  useEffect(() => { const update = () => { const nextInstalledPwa = window.matchMedia("(display-mode: standalone)").matches || Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone); installedPwaRef.current = nextInstalledPwa; setInstalledPwa(nextInstalledPwa); if (nextInstalledPwa) setDesktopNotice(null); }; update(); window.addEventListener("resize", update); return () => window.removeEventListener("resize", update); }, []);
  useEffect(() => { setOffline(!navigator.onLine); const online = () => setOffline(false); const offlineEvent = () => setOffline(true); window.addEventListener("online", online); window.addEventListener("offline", offlineEvent); return () => { window.removeEventListener("online", online); window.removeEventListener("offline", offlineEvent); }; }, []);
  useEffect(() => { if (!desktopNotice) return; const timer = window.setTimeout(() => setDesktopNotice(null), 8000); return () => window.clearTimeout(timer); }, [desktopNotice]);
  useEffect(() => { const { data: listener } = supabase.auth.onAuthStateChange((event) => { if (event === "SIGNED_OUT") { accountIdRef.current = ""; setAccountId(""); setViewer(null); setConversations([]); setContacts([]); setMessages([]); setDesktopNotice(null); conversationSnapshotRef.current.clear(); conversationSyncReadyRef.current = false; void clearStaffChatCache(); try { window.sessionStorage.removeItem("staff-chat-account"); window.localStorage.removeItem("staff-chat-account"); window.localStorage.removeItem("staff-chat-viewer"); } catch { /* storage unavailable */ } } }); return () => listener.subscription.unsubscribe(); }, []);

  function storedAccountId() {
    try { return window.sessionStorage.getItem("staff-chat-account") || window.localStorage.getItem("staff-chat-account") || accountIdRef.current; } catch { return accountIdRef.current; }
  }

  function rememberAccountId(id: string) {
    accountIdRef.current = id;
    setAccountId(id);
    try { window.sessionStorage.setItem("staff-chat-account", id); window.localStorage.setItem("staff-chat-account", id); } catch { /* storage unavailable */ }
  }

  function storedViewer() {
    try {
      const value = window.localStorage.getItem("staff-chat-viewer");
      if (!value) return null;
      const parsed = JSON.parse(value) as ViewerProfile;
      return parsed?.id && parsed?.name && parsed?.role ? parsed : null;
    } catch { return null; }
  }

  function rememberViewer(nextViewer: ViewerProfile | null) {
    setViewer(nextViewer);
    try {
      if (nextViewer) window.localStorage.setItem("staff-chat-viewer", JSON.stringify(nextViewer));
      else window.localStorage.removeItem("staff-chat-viewer");
    } catch { /* storage unavailable */ }
  }

  useEffect(() => {
    const conversationId = new URLSearchParams(window.location.search).get("conversation");
    if (!conversationId) return;
    setSelectedId(conversationId);
    if (installedPwa) setPwaThreadOpen(true);
  }, [installedPwa]);

  const loadConversations = useCallback(async () => {
    const knownAccount = storedAccountId();

    const cachedViewer = storedViewer();
    if (cachedViewer && (!knownAccount || cachedViewer.id === knownAccount)) setViewer(cachedViewer);

    // Hydrate first. Network refresh happens below and never blocks the cached UI.
    if (knownAccount) {
      rememberAccountId(knownAccount);
      const cached = visibleStaffConversations((await getCachedConversations(knownAccount)) as Conversation[]);
      if (cached.length) {
        setConversations(cached);
        setSelectedId((current) => current || cached[0]?.id || "");
      }
    }
    if (!navigator.onLine) return;
    const headers = await authHeaders(); if (!headers) return;
    const response = await fetch("/api/chat/conversations", { headers, cache: "no-store" }); const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "Unable to load chat.");
    const resolvedAccount = String(payload.viewer_profile_id || ""); if (!resolvedAccount) throw new Error("Unable to resolve your staff account.");
    if (knownAccount && knownAccount !== resolvedAccount) { await clearStaffChatCache(); setContacts([]); rememberViewer(null); setDesktopNotice(null); conversationSnapshotRef.current.clear(); conversationSyncReadyRef.current = false; }
    rememberAccountId(resolvedAccount);
    rememberViewer((payload.viewer || null) as ViewerProfile | null);
    const nextConversations = visibleStaffConversations((payload.conversations || []) as Conversation[]);
    const previousSnapshot = conversationSnapshotRef.current;
    if (conversationSyncReadyRef.current && !installedPwaRef.current) {
      const freshConversation = nextConversations
        .filter((conversation) => { const previous = previousSnapshot.get(conversation.id); return Boolean(previous && conversation.unread_count > previous.unreadCount); })
        .sort((left, right) => new Date(right.last_message?.created_at || 0).getTime() - new Date(left.last_message?.created_at || 0).getTime())[0];
      if (freshConversation) setDesktopNotice({ conversationId: freshConversation.id, displayName: freshConversation.display_name, preview: chatNoticePreview(freshConversation.last_message?.body), isGroup: freshConversation.kind === "group" });
    }
    conversationSnapshotRef.current = new Map(nextConversations.map((conversation) => [conversation.id, { unreadCount: conversation.unread_count, lastMessageAt: conversation.last_message?.created_at || "" }]));
    conversationSyncReadyRef.current = true;
    setConversations(nextConversations);
    void saveCachedConversations(resolvedAccount, nextConversations);
    setSelectedId((current) => current || nextConversations[0]?.id || "");
  }, []);

  const loadContacts = useCallback(async () => {
    if (!installedPwa) return;
    const knownAccount = storedAccountId();
    if (knownAccount) {
      const cached = (await getCachedContacts(knownAccount)) as Recipient[];
      if (cached.length) setContacts(cached);
    }
    if (!navigator.onLine) return;
    const headers = await authHeaders(); if (!headers) return;
    const response = await fetch("/api/chat/recipients?all=1", { headers, cache: "no-store" }); const payload = await response.json().catch(() => ({}));
    if (response.ok) {
      const nextContacts = (payload.recipients || []) as Recipient[];
      setContacts(nextContacts);
      const resolvedAccount = accountIdRef.current || storedAccountId();
      if (resolvedAccount) void saveCachedContacts(resolvedAccount, nextContacts);
    }
  }, [installedPwa]);

  const loadMessages = useCallback(async (conversationId: string) => {
    const requestToken = ++messageLoadTokenRef.current;
    setMessages([]);
    if (!conversationId) return;
    const currentAccount = accountIdRef.current || storedAccountId();
    const cached = currentAccount ? ((await getCachedMessages(currentAccount, conversationId)) as ChatMessage[]) : [];
    if (requestToken !== messageLoadTokenRef.current) return;
    // An empty cache is a valid state: show the composer and empty state immediately.
    setMessages(cached);
    if (!navigator.onLine) return;
    const headers = await authHeaders(); if (!headers) return;
    try {
      const latest = cached[cached.length - 1]?.created_at; const query = latest ? `?after=${encodeURIComponent(latest)}&limit=100` : "?limit=50";
      const response = await fetch(`/api/chat/conversations/${conversationId}/messages${query}`, { headers, cache: "no-store" }); const payload = await response.json().catch(() => ({})); if (!response.ok) throw new Error(payload.error || "Unable to load chat history.");
      const incoming = (payload.messages || []) as ChatMessage[]; const merged = Array.from(new Map([...cached, ...incoming].map((message) => [message.id, message])).values()).sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      if (requestToken !== messageLoadTokenRef.current) return;
      setMessages(merged); if (currentAccount) void saveCachedMessages(currentAccount, conversationId, merged);
      await fetch(`/api/chat/conversations/${conversationId}/read`, { method: "POST", headers }); setConversations((current) => current.map((conversation) => conversation.id === conversationId ? { ...conversation, unread_count: 0 } : conversation)); window.dispatchEvent(new Event("staff-chat-unread-changed"));
    } catch (loadError: any) { if (requestToken === messageLoadTokenRef.current) setError(loadError?.message || "Unable to load chat history."); }
  }, []);

  const loadOlderMessages = useCallback(async () => {
    if (!selectedId || !messages.length || !navigator.onLine) return; const headers = await authHeaders(); if (!headers) return; const before = messages[0]?.created_at;
    const response = await fetch(`/api/chat/conversations/${selectedId}/messages?before=${encodeURIComponent(before)}&limit=50`, { headers, cache: "no-store" }); const payload = await response.json().catch(() => ({})); if (!response.ok) { setError(payload.error || "Unable to load older messages."); return; }
    const older = (payload.messages || []) as ChatMessage[]; const merged = Array.from(new Map([...older, ...messages].map((message) => [message.id, message])).values()).sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()); setMessages(merged); const currentAccount = accountIdRef.current || storedAccountId(); if (currentAccount) void saveCachedMessages(currentAccount, selectedId, merged);
  }, [messages, selectedId]);

  useEffect(() => { void loadConversations().catch((loadError: any) => setError(loadError?.message || "Unable to load chat.")); const interval = window.setInterval(() => void loadConversations().catch(() => undefined), 30_000); return () => window.clearInterval(interval); }, [loadConversations]);
  useEffect(() => { void loadContacts(); }, [loadContacts]);
  useEffect(() => { void loadMessages(selectedId); }, [loadMessages, selectedId]);
  useEffect(() => { if (recipientSearch.trim().length < 2) { setRecipients([]); return; } const timer = window.setTimeout(async () => { const headers = await authHeaders(); if (!headers) return; const response = await fetch(`/api/chat/recipients?q=${encodeURIComponent(recipientSearch)}`, { headers, cache: "no-store" }); const payload = await response.json().catch(() => ({})); if (response.ok) setRecipients(payload.recipients || []); }, 250); return () => window.clearTimeout(timer); }, [recipientSearch]);
  useEffect(() => { if (!manageOpen || manageSearch.trim().length < 2) { setManageRecipients([]); return; } const timer = window.setTimeout(async () => { const headers = await authHeaders(); if (!headers) return; const response = await fetch(`/api/chat/recipients?q=${encodeURIComponent(manageSearch)}`, { headers, cache: "no-store" }); const payload = await response.json().catch(() => ({})); if (response.ok) setManageRecipients(payload.recipients || []); }, 250); return () => window.clearTimeout(timer); }, [manageOpen, manageSearch]);

  const visibleConversations = useMemo(() => conversations.filter((conversation) => conversation.display_name.toLocaleLowerCase().includes(search.toLocaleLowerCase())), [conversations, search]);
    const pwaRows = useMemo(() => { const rows: Array<{ conversation: Conversation; contact: Recipient | null }> = []; const identityIndex = new Map<string, number>(); const addRow = (row: { conversation: Conversation; contact: Recipient | null }) => { if (row.conversation.kind !== "direct") { rows.push(row); return; } const identity = row.contact?.identity_key || row.conversation.participants?.find((participant) => participant.id !== accountId)?.identity_key || row.conversation.display_name.toLocaleLowerCase(); const existingIndex = identityIndex.get(identity); if (existingIndex === undefined) { identityIndex.set(identity, rows.length); rows.push(row); return; } const existing = rows[existingIndex]; const existingTarget = existing.conversation.participants?.find((participant) => participant.id !== accountId); const nextTarget = row.conversation.participants?.find((participant) => participant.id !== accountId); if (existingTarget?.role !== "teacher" && nextTarget?.role === "teacher") rows[existingIndex] = row; }; for (const conversation of visibleConversations) addRow({ conversation, contact: null }); const knownContactIds = new Set(conversations.flatMap((conversation) => conversation.kind === "direct" ? (conversation.participants || []).map((participant) => participant.id) : [])); for (const contact of contacts) if (!knownContactIds.has(contact.id) && contact.name.toLocaleLowerCase().includes(search.toLocaleLowerCase())) addRow({ conversation: { id: `contact:${contact.id}`, kind: "direct", display_name: contact.name, unread_count: 0, avatar_url: contact.avatar_url, participants: [{ id: contact.id, name: contact.name, role: contact.role, avatar_url: contact.avatar_url, identity_key: contact.identity_key }] }, contact }); return rows; }, [accountId, contacts, conversations, search, visibleConversations]);
  const selectedConversation = conversations.find((conversation) => conversation.id === selectedId);

  async function createConversation() { const headers = await authHeaders(); if (!headers || !selectedRecipients.length) return; setError(""); const response = await fetch("/api/chat/conversations", { method: "POST", headers, body: JSON.stringify({ kind: newChatKind, name: groupName, participantIds: selectedRecipients.map((recipient) => recipient.id) }) }); const payload = await response.json().catch(() => ({})); if (!response.ok) { setError(payload.error || "Unable to create chat."); return; } setNewChatOpen(false); setSelectedRecipients([]); setRecipientSearch(""); setGroupName(""); await loadConversations(); setSelectedId(payload.conversationId); setPwaThreadOpen(true); }
  async function openPwaRow(row: { conversation: Conversation; contact: Recipient | null }) { if (!row.contact) { setSelectedId(row.conversation.id); setPwaThreadOpen(true); return; } const headers = await authHeaders(); if (!headers) return; const response = await fetch("/api/chat/conversations", { method: "POST", headers, body: JSON.stringify({ kind: "direct", participantIds: [row.contact.id] }) }); const payload = await response.json().catch(() => ({})); if (!response.ok) { setError(payload.error || "Unable to open conversation."); return; } await loadConversations(); setSelectedId(payload.conversationId); setPwaThreadOpen(true); }
  function closePwaThread() { setPwaThreadOpen(false); setSelectedId(""); setMessages([]); setError(""); }
  async function sendMessage() { if (!selectedId || !composer.trim() || sending || offline) return; const headers = await authHeaders(); if (!headers) return; setSending(true); setError(""); try { const formData = new FormData(); formData.set("body", composer); formData.set("idempotencyKey", crypto.randomUUID()); attachmentFiles.forEach((file) => formData.append("files", file)); const response = await fetch(`/api/chat/conversations/${selectedId}/messages`, { method: "POST", headers: { Authorization: headers.Authorization }, body: formData }); const payload = await response.json().catch(() => ({})); if (!response.ok) throw new Error(payload.error || "Unable to send chat message."); setComposer(""); setAttachmentFiles([]); await loadMessages(selectedId); await loadConversations(); } catch (sendError: any) { setError(sendError?.message || "Unable to send chat message."); } finally { setSending(false); } }
  async function changeParticipant(participantId: string, action: "add" | "remove") { if (!selectedId) return; const headers = await authHeaders(); if (!headers) return; const response = await fetch(`/api/chat/conversations/${selectedId}/participants${action === "remove" ? `?participantId=${encodeURIComponent(participantId)}` : ""}`, { method: action === "remove" ? "DELETE" : "POST", headers, ...(action === "add" ? { body: JSON.stringify({ participantId }) } : {}) }); const payload = await response.json().catch(() => ({})); if (!response.ok) { setError(payload.error || "Unable to update participants."); return; } setManageSearch(""); setManageRecipients([]); await loadConversations(); }
  function openDesktopNotice() { if (!desktopNotice) return; const conversationId = desktopNotice.conversationId; setDesktopNotice(null); if (selectedId === conversationId) void loadMessages(conversationId); else setSelectedId(conversationId); }

  const renderAttachment = (attachment: NonNullable<ChatMessage["attachments"]>[number]) => <button type="button" key={attachment.id} onClick={async () => { const headers = await authHeaders(); if (!headers) return; const response = await fetch(`/api/chat/attachments/${attachment.id}`, { headers }); const payload = await response.json().catch(() => ({})); if (response.ok && payload.url) window.open(payload.url, "_blank", "noopener,noreferrer"); }} aria-label={`Open attachment ${attachment.file_name}`}>{attachment.file_name}</button>;
  const renderDialogs = () => <>
    {newChatOpen && <div className="staff-chat-dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setNewChatOpen(false); }}><section className="staff-chat-dialog" role="dialog" aria-modal="true" aria-labelledby="new-chat-title"><button type="button" className="staff-chat-dialog-close" aria-label="Close new chat" onClick={() => setNewChatOpen(false)}><X size={18} /></button><h2 id="new-chat-title">New chat</h2><div className="staff-chat-mode-buttons"><button type="button" className={newChatKind === "direct" ? "is-active" : ""} onClick={() => setNewChatKind("direct")}>Direct</button><button type="button" className={newChatKind === "group" ? "is-active" : ""} onClick={() => setNewChatKind("group")}><Users size={15} /> Group</button></div>{newChatKind === "group" && <input value={groupName} onChange={(event) => setGroupName(event.target.value)} placeholder="Group name" aria-label="Group name" />}{selectedRecipients.length > 0 && <div className="staff-chat-recipient-chips">{selectedRecipients.map((recipient) => <button type="button" key={recipient.id} onClick={() => setSelectedRecipients((current) => current.filter((item) => item.id !== recipient.id))}>{recipient.name} ×</button>)}</div>}<input value={recipientSearch} onChange={(event) => setRecipientSearch(event.target.value)} placeholder="Search Teachers and Admin staff" aria-label="Search Teachers and Admin staff" />{recipients.length > 0 && <div className="staff-chat-recipient-results">{recipients.map((recipient) => <button type="button" key={recipient.id} onClick={() => { if (newChatKind === "direct") setSelectedRecipients([recipient]); else setSelectedRecipients((current) => current.some((item) => item.id === recipient.id) ? current : [...current, recipient]); setRecipients([]); setRecipientSearch(""); }}>{recipient.name}<small>{recipient.role}</small></button>)}</div>}<button type="button" className="staff-chat-primary" disabled={!selectedRecipients.length || (newChatKind === "group" && !groupName.trim())} onClick={() => void createConversation()}>Create conversation</button></section></div>}
    {manageOpen && selectedConversation?.kind === "group" && <div className="staff-chat-dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setManageOpen(false); }}><section className="staff-chat-dialog" role="dialog" aria-modal="true" aria-labelledby="manage-chat-title"><button type="button" className="staff-chat-dialog-close" aria-label="Close participant manager" onClick={() => setManageOpen(false)}><X size={18} /></button><h2 id="manage-chat-title">Manage participants</h2><div className="staff-chat-participant-list">{selectedConversation.participants?.map((participant) => <div key={participant.id}><span>{participant.name}<small>{participant.role}</small></span><button type="button" onClick={() => void changeParticipant(participant.id, "remove")}>Remove</button></div>)}</div><input value={manageSearch} onChange={(event) => setManageSearch(event.target.value)} placeholder="Search staff to add" aria-label="Search staff to add" />{manageRecipients.length > 0 && <div className="staff-chat-recipient-results">{manageRecipients.map((recipient) => <button type="button" key={recipient.id} onClick={() => void changeParticipant(recipient.id, "add")}>{recipient.name}<small>{recipient.role}</small></button>)}</div>}</section></div>}
  </>;

  const renderDesktop = () => <section className="staff-chat-page" aria-label="Staff chat">{desktopNotice && <aside className="staff-chat-desktop-notice" role="status" aria-live="polite"><button type="button" className="staff-chat-desktop-notice-content" onClick={openDesktopNotice}><strong>New chat message</strong><span>{desktopNotice.isGroup ? `Message in ${desktopNotice.displayName}` : desktopNotice.displayName}</span><small>{desktopNotice.preview}</small></button><button type="button" className="staff-chat-desktop-notice-close" aria-label="Dismiss chat notification" onClick={() => setDesktopNotice(null)}>×</button></aside>}<header className="staff-chat-header"><div><span className="staff-chat-eyebrow">STAFF COMMUNICATION</span><h1>Chat</h1><p>Private conversations for Teachers and Admin staff.</p></div><button type="button" className="staff-chat-primary" onClick={() => setNewChatOpen(true)}><Plus size={17} aria-hidden="true" /> New chat</button></header>{error && <p className="staff-chat-error" role="alert">{error}</p>}<div className="staff-chat-shell"><aside className="staff-chat-conversations" aria-label="Conversations"><label className="staff-chat-search"><Search size={17} aria-hidden="true" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search conversations" aria-label="Search conversations" /></label>{visibleConversations.length === 0 ? <p className="staff-chat-empty"><MessageCircle size={24} aria-hidden="true" />No conversations yet.</p> : visibleConversations.map((conversation) => <button type="button" key={conversation.id} className={`staff-chat-conversation${conversation.id === selectedId ? " is-selected" : ""}`} onClick={() => setSelectedId(conversation.id)}><ChatAvatar conversation={conversation} accountId={accountId} /><span className="staff-chat-conversation-copy"><strong>{conversation.display_name}</strong><small>{conversation.last_message?.body || "No messages yet"}</small></span><span className="staff-chat-conversation-meta"><time>{displayTime(conversation.last_message?.created_at)}</time>{conversation.unread_count > 0 && <b>{conversation.unread_count}</b>}</span></button>)}</aside><section className="staff-chat-thread" aria-label={selectedConversation?.display_name || "Chat conversation"}>{!selectedConversation ? <div className="staff-chat-thread-empty"><MessageCircle size={34} aria-hidden="true" /><h2>Select a conversation</h2><p>Choose a chat or start a new one.</p></div> : <><header className="staff-chat-thread-header"><ChatAvatar conversation={selectedConversation} accountId={accountId} /><div><h2>{selectedConversation.display_name}</h2><small>{selectedConversation.kind === "group" ? "Group conversation" : "Direct conversation"}</small></div>{selectedConversation.kind === "group" && <button type="button" className="staff-chat-manage" onClick={() => setManageOpen(true)}>Manage participants</button>}</header><div className="staff-chat-messages" aria-live="polite">{messages.length === 0 ? <p className="staff-chat-empty">No messages yet. Start the conversation.</p> : messages.map((message) => { const own = message.sender_id === accountId; const bubbleStyle = own ? { alignSelf: "flex-end", background: "#1f5f9f", borderColor: "#174b7e", borderRadius: "13px 13px 4px 13px" } : undefined; return <article className={`staff-chat-message${own ? " is-own" : ""}`} style={bubbleStyle} key={message.id}><div className="staff-chat-message-meta" style={own ? { color: "#d9edff" } : undefined}><strong>{message.sender_name}</strong><time>{displayTime(message.created_at)}</time></div><p style={own ? { color: "#ffffff" } : undefined}>{message.body}</p>{message.attachments?.length ? <div className="staff-chat-message-attachments">{message.attachments.map(renderAttachment)}</div> : null}</article>; })}</div><form className="staff-chat-composer" onSubmit={(event) => { event.preventDefault(); void sendMessage(); }}><textarea value={composer} onChange={(event) => setComposer(event.target.value)} placeholder="Write a message…" aria-label="Chat message" rows={2} /><div className="staff-chat-composer-controls"><label className="staff-chat-attach"><input type="file" multiple onChange={(event) => setAttachmentFiles(Array.from(event.target.files || []))} />Attach files</label>{attachmentFiles.length > 0 && <small>{attachmentFiles.map((file) => file.name).join(", ")}</small>}<button type="submit" className="staff-chat-primary" disabled={sending || (!composer.trim() && attachmentFiles.length === 0)}><Send size={17} aria-hidden="true" />{sending ? "Sending…" : "Send"}</button></div></form></>}</section></div>{renderDialogs()}</section>;

    const renderPwa = () => { let previousDate = ""; const renderedMessages = messages.map((message) => { const currentDate = dateKey(message.created_at); const showDate = currentDate !== previousDate; previousDate = currentDate; const own = message.sender_id === accountId; return <div key={message.id} className="staff-chat-pwa-message-wrap">{showDate && <div className="staff-chat-pwa-date" role="separator">{displayDate(message.created_at)}</div>}<article className={`staff-chat-pwa-message${own ? " is-own" : ""}`}><p>{message.body}</p>{message.attachments?.length ? <div className="staff-chat-pwa-attachments">{message.attachments.map(renderAttachment)}</div> : null}<footer><time>{displayTime(message.created_at).split(", ").pop()}</time>{own && (message.read ? <span aria-label="Read"><CheckCheck size={14} aria-hidden="true" /></span> : <span aria-label="Sent"><Check size={14} aria-hidden="true" /></span>)}</footer></article></div>; }); const threadHeader = pwaThreadOpen && selectedConversation ? <div className="staff-chat-pwa-brand"><ChatAvatar conversation={selectedConversation} accountId={accountId} /><div><span className="staff-chat-eyebrow">STAFF CHAT</span><h1>{selectedConversation.display_name}</h1></div></div> : <div className="staff-chat-pwa-brand staff-chat-pwa-brand-school"><img className="staff-chat-pwa-school-mark" src="/icons/icon-192.png" alt="" /></div>; return <section className="staff-chat-pwa-page" aria-label="Staff chat"><header className="staff-chat-pwa-header">{threadHeader}<button type="button" className="staff-chat-pwa-new" onClick={() => setNewChatOpen(true)} aria-label="Start a new chat"><Plus size={20} aria-hidden="true" /></button></header>{offline && <div className="staff-chat-pwa-offline" role="status">Offline · read-only. Previously loaded messages are available.</div>}{error && <p className="staff-chat-error" role="alert">{error}</p>}{!pwaThreadOpen ? <div className="staff-chat-pwa-list"><label className="staff-chat-pwa-search"><Search size={18} aria-hidden="true" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search staff and conversations" aria-label="Search staff and conversations" /></label>{pwaRows.length === 0 ? <p className="staff-chat-empty">No staff conversations yet.</p> : pwaRows.map((row) => <button type="button" key={row.conversation.id} className={`staff-chat-pwa-contact${row.conversation.id === selectedId ? " is-selected" : ""}`} onClick={() => void openPwaRow(row)}><ChatAvatar conversation={row.conversation} accountId={accountId} /><span className="staff-chat-pwa-contact-copy"><strong>{row.conversation.display_name}</strong><small>{row.conversation.last_message?.body || "Start a conversation"}</small></span><span className="staff-chat-pwa-contact-meta"><time>{displayTime(row.conversation.last_message?.created_at)}</time>{row.conversation.unread_count > 0 && <b>{row.conversation.unread_count}</b>}</span></button>)}</div> : <div className="staff-chat-pwa-thread"><button type="button" className="staff-chat-pwa-back" onClick={closePwaThread}><ArrowLeft size={18} aria-hidden="true" /> All messages</button>{selectedConversation?.kind === "group" && <button type="button" className="staff-chat-pwa-group" onClick={() => setManageOpen(true)}>Participants</button>}<div className="staff-chat-pwa-messages" aria-live="polite">{messages.length > 0 && <button type="button" className="staff-chat-pwa-older" onClick={() => void loadOlderMessages()} disabled={offline}>{"Load older messages"}</button>}{messages.length ? renderedMessages : <p className="staff-chat-empty">No messages yet. Start the conversation.</p>}</div><form className="staff-chat-pwa-composer" onSubmit={(event) => { event.preventDefault(); void sendMessage(); }}><textarea value={composer} onChange={(event) => setComposer(event.target.value)} placeholder={offline ? "Offline · sending unavailable" : "Message"} aria-label="Chat message" rows={1} disabled={offline || sending} /><label className="staff-chat-pwa-attach"><input type="file" multiple disabled={offline || sending} onChange={(event) => setAttachmentFiles(Array.from(event.target.files || []))} /><span aria-hidden="true">＋</span><span className="sr-only">Attach files</span></label><button type="submit" disabled={offline || sending || !composer.trim()} aria-label="Send message"><Send size={19} aria-hidden="true" /></button></form></div>}{renderDialogs()}</section>; };

  return installedPwa ? renderPwa() : renderDesktop();
}
