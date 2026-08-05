"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import AdminLayout from "../../components/layout/AdminLayout";
import { useMessageRealtimeRefresh } from "../../hooks/useMessageRealtimeRefresh";
import { useStaffMessageSoundPreference } from "../../hooks/useStaffMessageNotifications";
import { Volume2, VolumeX } from "lucide-react";
import { getTeachers } from "../../../lib/adminTeachers";
import {
  formatMessageDateTime,
  markSharedAdminMessageAsRead,
  markMessageAsRead,
  sendAdminMessageToAllTeachers,
  sendAdminMessageToTeacher,
  sendMessage,
} from "../../../lib/messages";
import { supabase } from "../../../lib/supabase";

const tabs = ["New / Active", "Dealt With", "Sent", "New Message"];

type AdminMessageDeleteTarget = {
  id: string;
  section: "sent" | "dealt";
};

const cardStyle = {
  background: "#ffffff",
  border: "1px solid #dbe3f0",
  borderRadius: "12px",
  boxShadow: "0 8px 22px rgba(31, 60, 136, 0.08)",
} as const;

const inputStyle = {
  width: "100%",
  border: "1px solid #cbd5e1",
  borderRadius: "10px",
  padding: "12px",
  fontSize: "14px",
  boxSizing: "border-box" as const,
  color: "#334155",
};

function previewText(value?: string | null) {
  if (!value) return "";

  return value.length > 120 ? `${value.slice(0, 120)}...` : value;
}

function getReplySubject(subject?: string | null) {
  if (!subject) return "Re: Message";

  return subject.toLowerCase().startsWith("re:") ? subject : `Re: ${subject}`;
}

function roleLabel(role?: string | null) {
  if (role === "teacher") return "Teacher";
  if (role === "student") return "Student";
  if (role === "admin") return "Admin";

  return "User";
}

export default function AdminMessagesPage() {
  const router = useRouter();

  const [adminId, setAdminId] = useState("");
  const [activeTab, setActiveTab] = useState("New / Active");
  const [teachers, setTeachers] = useState<any[]>([]);
  const [activeMessages, setActiveMessages] = useState<any[]>([]);
  const [dealtMessages, setDealtMessages] = useState<any[]>([]);
  const [messageCounts, setMessageCounts] = useState({ active: 0, dealt: 0 });
  const [canDeleteAdminMessages, setCanDeleteAdminMessages] = useState(false);
  const [dealtHasMore, setDealtHasMore] = useState(false);
  const [loadingMoreDealt, setLoadingMoreDealt] = useState(false);
  const [sentMessages, setSentMessages] = useState<any[]>([]);
  const [selectedMessage, setSelectedMessage] = useState<any | null>(null);
  const [recipientMode, setRecipientMode] = useState("all");
  const [teacherId, setTeacherId] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [attachmentLink, setAttachmentLink] = useState("");
  const [replyMessage, setReplyMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [pendingDeleteTarget, setPendingDeleteTarget] =
    useState<AdminMessageDeleteTarget | null>(null);
  const [deletingMessageId, setDeletingMessageId] = useState("");
  const mountedRef = useRef(false);
  const messagesRequestRef = useRef(0);
  const selectedMessageRef = useRef<any | null>(null);
  const { soundEnabled, setSoundEnabled } =
    useStaffMessageSoundPreference();

  const loadMessages = useCallback(async (currentAdminId: string) => {
    if (!currentAdminId) return;

    const requestId = messagesRequestRef.current + 1;
    messagesRequestRef.current = requestId;

    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.access_token) {
      throw new Error("Your Admin session has expired.");
    }

    const [queueResponse, sentResponse] = await Promise.all([
      fetch("/api/admin/messages/work-queue", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      }),
      fetch("/api/admin/messages/sent", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      }),
    ]);
    const [queueData, sentData] = await Promise.all([
      queueResponse.json().catch(() => null),
      sentResponse.json().catch(() => null),
    ]);
    if (!queueResponse.ok || !queueData || !sentResponse.ok || !sentData) {
      throw new Error(
        queueData?.error || sentData?.error || "Unable to load Admin messages."
      );
    }

    if (!mountedRef.current || requestId !== messagesRequestRef.current) {
      return;
    }

    setActiveMessages(queueData.active_messages || []);
    setDealtMessages(queueData.dealt_messages || []);
    setMessageCounts(queueData.counts || { active: 0, dealt: 0 });
    setDealtHasMore(Boolean(queueData.dealt_has_more));
    setSentMessages(sentData.sent_messages || []);
    setCanDeleteAdminMessages(
      Boolean(queueData.can_delete_admin_messages) &&
        Boolean(sentData.can_delete_admin_messages)
    );

    const currentSelectedMessage = selectedMessageRef.current;

    if (currentSelectedMessage) {
      const refreshedMessage = [
        ...(queueData.active_messages || []),
        ...(queueData.dealt_messages || []),
        ...(sentData.sent_messages || []),
      ].find((item) => item.id === currentSelectedMessage.id);

      selectedMessageRef.current = refreshedMessage || null;
      setSelectedMessage(refreshedMessage || null);
    }
  }, []);

  useEffect(() => {
    selectedMessageRef.current = selectedMessage;
  }, [selectedMessage]);

  useEffect(() => {
    mountedRef.current = true;

    async function loadPage() {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!session) {
          router.push("/login");
          return;
        }

        const { data: profile, error: profileError } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", session.user.id)
          .single();

        if (profileError) throw profileError;

        if (profile?.role !== "admin") {
          router.push("/login");
          return;
        }

        if (!mountedRef.current) return;

        setAdminId(session.user.id);

        const teacherData = await getTeachers();
        if (!mountedRef.current) return;
        setTeachers(teacherData);
        await loadMessages(session.user.id);
      } catch (error) {
        console.error("Unable to load admin messages:", error);
        if (mountedRef.current) {
          setErrorMessage("Unable to load messages.");
        }
      } finally {
        if (mountedRef.current) {
          setLoading(false);
        }
      }
    }

    loadPage();

    return () => {
      mountedRef.current = false;
      messagesRequestRef.current += 1;
    };
  }, [router, loadMessages]);

  const refreshAdminMessages = useCallback(async () => {
    if (!adminId) return;

    await loadMessages(adminId);
  }, [adminId, loadMessages]);

  useMessageRealtimeRefresh({
    onRefresh: refreshAdminMessages,
    enabled: Boolean(adminId),
    intervalMs: 60000,
    customEventName: "admin-unread-messages-changed",
    channelName: "admin-messages-page",
  });

  async function openInboxMessage(item: any) {
    setSelectedMessage(item);
    setReplyMessage("");
    setStatusMessage("");
    setErrorMessage("");

    if (!item.read_at && adminId) {
      try {
        if (item.recipient_group === "admin" && !item.receiver_id) {
          await markSharedAdminMessageAsRead(item.id);
        } else {
          await markMessageAsRead(item.id, adminId);
        }

        const readAt = new Date().toISOString();
        const updatedMessage = { ...item, read_at: readAt };

        setSelectedMessage(updatedMessage);
        const updateReadAt = (currentMessages: any[]) =>
          currentMessages.map((messageItem) =>
            messageItem.id === item.id ? updatedMessage : messageItem
          );
        setActiveMessages(updateReadAt);
        setDealtMessages(updateReadAt);
        window.dispatchEvent(new Event("admin-unread-messages-changed"));
      } catch (error) {
        console.error("Unable to mark admin message as read:", error);
      }
    }
  }

  async function handleSend() {
    setStatusMessage("");
    setErrorMessage("");

    if (!adminId) {
      setErrorMessage("Unable to identify the logged-in admin.");
      return;
    }

    if (!subject.trim()) {
      setErrorMessage("Please enter a subject.");
      return;
    }

    if (!message.trim()) {
      setErrorMessage("Please enter a message.");
      return;
    }

    if (recipientMode === "individual" && !teacherId) {
      setErrorMessage("Please select a teacher.");
      return;
    }

    if (recipientMode === "all" && teachers.length === 0) {
      setErrorMessage("No teachers found.");
      return;
    }

    setSending(true);

    try {
      const attachment = attachmentLink.trim() || undefined;

      if (recipientMode === "individual") {
        await sendAdminMessageToTeacher({
          adminId,
          teacherId,
          subject: subject.trim(),
          message: message.trim(),
          attachment_link: attachment,
        });

        setStatusMessage("Message sent successfully.");
      } else {
        const count = await sendAdminMessageToAllTeachers({
          adminId,
          teachers,
          subject: subject.trim(),
          message: message.trim(),
          attachment_link: attachment,
        });

        setStatusMessage(`Message sent to ${count} teachers.`);
      }

      setSubject("");
      setMessage("");
      setAttachmentLink("");
      setTeacherId("");
      await loadMessages(adminId);
      setActiveTab("Sent");
    } catch (error) {
      console.error("Unable to send admin message:", error);
      setErrorMessage("Unable to send message.");
    } finally {
      setSending(false);
    }
  }

  async function handleReply() {
    setStatusMessage("");
    setErrorMessage("");

    if (!selectedMessage || !adminId) {
      setErrorMessage("Unable to send reply.");
      return;
    }

    if (!replyMessage.trim()) {
      setErrorMessage("Please enter a reply message.");
      return;
    }

    setSending(true);

    try {
      await sendMessage({
        sender_id: adminId,
        receiver_id: selectedMessage.sender_id,
        subject: getReplySubject(selectedMessage.subject),
        message: replyMessage.trim(),
      });

      setReplyMessage("");
      setStatusMessage("Reply sent successfully.");
      await loadMessages(adminId);
    } catch (error) {
      console.error("Unable to send admin reply:", error);
      setErrorMessage("Unable to send reply.");
    } finally {
      setSending(false);
    }
  }

  async function changeDealtStatus(action: "dealt" | "restore") {
    if (!selectedMessage) return;

    setStatusMessage("");
    setErrorMessage("");
    setSending(true);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) {
        throw new Error("Your Admin session has expired.");
      }

      const response = await fetch("/api/admin/messages/work-queue", {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message_id: selectedMessage.id,
          action,
        }),
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || "Unable to update the message status.");
      }

      setSelectedMessage(null);
      selectedMessageRef.current = null;
      await loadMessages(adminId);
      setActiveTab(action === "dealt" ? "Dealt With" : "New / Active");
      setStatusMessage(
        action === "dealt"
          ? "Message marked as dealt with."
          : "Message moved back to Active."
      );
      window.dispatchEvent(new Event("admin-unread-messages-changed"));
    } catch (error) {
      console.error("Unable to update Admin message status:", error);
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to update the message status."
      );
    } finally {
      setSending(false);
    }
  }

  async function loadMoreDealtMessages() {
    if (loadingMoreDealt || !dealtHasMore) return;

    setLoadingMoreDealt(true);
    setErrorMessage("");

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) {
        throw new Error("Your Admin session has expired.");
      }

      const response = await fetch(
        `/api/admin/messages/work-queue?status=dealt&offset=${dealtMessages.length}`,
        {
          headers: { Authorization: `Bearer ${session.access_token}` },
        }
      );
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || "Unable to load more messages.");
      }

      setDealtMessages((current) => [
        ...current,
        ...(result.dealt_messages || []),
      ]);
      setMessageCounts(result.counts || messageCounts);
      setDealtHasMore(Boolean(result.dealt_has_more));
    } catch (error) {
      console.error("Unable to load more dealt-with messages:", error);
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to load more messages."
      );
    } finally {
      setLoadingMoreDealt(false);
    }
  }

  async function deleteAdminMessage() {
    const target = pendingDeleteTarget;
    if (!target || deletingMessageId || !canDeleteAdminMessages) return;

    setDeletingMessageId(target.id);
    setErrorMessage("");
    setStatusMessage("");

    const wasActive = activeMessages.some((messageItem) => messageItem.id === target.id);
    const wasDealt = dealtMessages.some((messageItem) => messageItem.id === target.id);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) {
        throw new Error("Your Admin session has expired.");
      }

      const response = await fetch(
        `/api/admin/messages/${encodeURIComponent(target.id)}`,
        {
          method: "DELETE",
          headers: { Authorization: `Bearer ${session.access_token}` },
        }
      );
      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.success) {
        throw new Error("Unable to remove this message.");
      }

      const removeMessage = (messages: any[]) =>
        messages.filter((messageItem) => messageItem.id !== target.id);
      setActiveMessages(removeMessage);
      setDealtMessages(removeMessage);
      setSentMessages(removeMessage);
      setMessageCounts((current) => ({
        active: Math.max(0, current.active - (wasActive ? 1 : 0)),
        dealt: Math.max(0, current.dealt - (wasDealt ? 1 : 0)),
      }));
      if (selectedMessageRef.current?.id === target.id) {
        selectedMessageRef.current = null;
        setSelectedMessage(null);
      }
      setPendingDeleteTarget(null);
      setStatusMessage("Message removed from Admin Messages.");
      window.dispatchEvent(new Event("admin-unread-messages-changed"));
    } catch (error) {
      console.error("Unable to remove Admin message:", error);
      setErrorMessage("Unable to remove this message.");
    } finally {
      setDeletingMessageId("");
    }
  }

  const queueMessages =
    activeTab === "Dealt With" ? dealtMessages : activeMessages;
  const isQueueTab =
    activeTab === "New / Active" || activeTab === "Dealt With";

  return (
    <AdminLayout>
      <div style={{ maxWidth: "1100px" }}>
        <header className="staff-messages-page-header">
          <div>
            <h1 style={{ color: "#1f3c88", margin: "0 0 6px" }}>Messages</h1>
            <p style={{ color: "#5f6f89", margin: 0 }}>
              Send messages to teachers and manage school communication.
            </p>
          </div>
          <button
            type="button"
            className={`staff-message-sound-toggle ${
              soundEnabled ? "is-on" : "is-off"
            }`}
            aria-pressed={soundEnabled}
            aria-label={`Turn message sounds ${soundEnabled ? "off" : "on"}`}
            onClick={() => setSoundEnabled(!soundEnabled)}
          >
            {soundEnabled ? (
              <Volume2 size={17} aria-hidden="true" />
            ) : (
              <VolumeX size={17} aria-hidden="true" />
            )}
            <span>Message sounds: {soundEnabled ? "On" : "Off"}</span>
          </button>
        </header>

        <div
          className="admin-message-tabs"
          role="tablist"
          aria-label="Admin message sections"
        >
          {tabs.map((tab) => {
            const active = activeTab === tab;

            return (
              <button
                key={tab}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => {
                  setActiveTab(tab);
                  setSelectedMessage(null);
                  setStatusMessage("");
                  setErrorMessage("");
                }}
                style={{
                  background: active ? "#1f3c88" : "#ffffff",
                  color: active ? "#ffffff" : "#1f3c88",
                  border: active ? "1px solid #1f3c88" : "1px solid #dbe3f0",
                  borderRadius: "999px",
                  padding: "10px 16px",
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                {tab === "New / Active"
                  ? `New / Active (${messageCounts.active})`
                  : tab === "Dealt With"
                  ? `Dealt With (${messageCounts.dealt})`
                  : tab}
              </button>
            );
          })}
        </div>

        {loading && (
          <section style={{ ...cardStyle, padding: "20px", color: "#334155" }}>
            Loading messages...
          </section>
        )}

        {!loading && errorMessage && !selectedMessage && !isQueueTab && (
          <div
            style={{
              background: "#fff5f5",
              border: "1px solid #fecaca",
              borderRadius: "10px",
              padding: "12px",
              color: "#b91c1c",
              marginBottom: "16px",
            }}
          >
            {errorMessage}
          </div>
        )}

        {!loading && isQueueTab && selectedMessage && (
          <section style={{ ...cardStyle, padding: "22px" }}>
            <button
              onClick={() => {
                setSelectedMessage(null);
                setReplyMessage("");
                setStatusMessage("");
                setErrorMessage("");
              }}
              style={{
                background: "transparent",
                border: "none",
                color: "#1f3c88",
                cursor: "pointer",
                fontWeight: 700,
                padding: 0,
                marginBottom: "18px",
              }}
            >
              ← Back to {activeTab}
            </button>

            <h2 style={{ color: "#1f3c88", margin: "0 0 10px" }}>
              {selectedMessage.subject || "No subject"}
            </h2>

            <div
              style={{
                color: "#64748b",
                fontSize: "14px",
                display: "grid",
                gap: "4px",
                marginBottom: "18px",
              }}
            >
              <span>From: {selectedMessage.sender_name}</span>
              <span>Role: {roleLabel(selectedMessage.sender_role)}</span>
              <span>Date: {formatMessageDateTime(selectedMessage.created_at)}</span>
              {selectedMessage.dealt_with_at && (
                <>
                  <span>
                    Dealt with by{" "}
                    {selectedMessage.dealt_with_by_name || "Admin"}
                  </span>
                  <span>
                    {formatMessageDateTime(selectedMessage.dealt_with_at)}
                  </span>
                </>
              )}
            </div>

            <p
              style={{
                color: "#334155",
                lineHeight: 1.6,
                whiteSpace: "pre-wrap",
                marginBottom: "16px",
              }}
            >
              {selectedMessage.message}
            </p>

            {selectedMessage.attachment_link && (
              <a
                href={selectedMessage.attachment_link}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  color: "#1f3c88",
                  fontWeight: 700,
                  display: "inline-block",
                  marginBottom: "20px",
                }}
              >
                Open attachment
              </a>
            )}

            <div className="admin-message-resolution-action">
              <button
                type="button"
                onClick={() =>
                  void changeDealtStatus(
                    selectedMessage.dealt_with_at ? "restore" : "dealt"
                  )
                }
                disabled={sending}
              >
                {sending
                  ? "Updating..."
                  : selectedMessage.dealt_with_at
                  ? "Move Back to Active"
                  : "Mark as Dealt With"}
              </button>
            </div>

            {activeTab === "Dealt With" && canDeleteAdminMessages && (
              <div className="admin-message-delete-detail-action">
                <button
                  type="button"
                  onClick={() =>
                    setPendingDeleteTarget({
                      id: selectedMessage.id,
                      section: "dealt",
                    })
                  }
                  disabled={Boolean(deletingMessageId)}
                >
                  Delete Message
                </button>
              </div>
            )}

            <div
              style={{
                borderTop: "1px solid #edf1f7",
                paddingTop: "18px",
                marginTop: "8px",
              }}
            >
              <h3 style={{ color: "#1f3c88", margin: "0 0 10px" }}>
                Reply
              </h3>

              {statusMessage && (
                <p style={{ color: "#166534", fontWeight: 700 }}>
                  {statusMessage}
                </p>
              )}

              {errorMessage && (
                <p style={{ color: "#b91c1c", fontWeight: 700 }}>
                  {errorMessage}
                </p>
              )}

              <textarea
                value={replyMessage}
                onChange={(event) => setReplyMessage(event.target.value)}
                placeholder="Write your reply..."
                rows={5}
                style={{ ...inputStyle, resize: "vertical" }}
              />

              <button
                onClick={handleReply}
                disabled={sending}
                style={{
                  background: "#1f3c88",
                  color: "#ffffff",
                  border: "none",
                  borderRadius: "8px",
                  padding: "10px 18px",
                  fontWeight: 700,
                  cursor: sending ? "not-allowed" : "pointer",
                  marginTop: "12px",
                }}
              >
                {sending ? "Sending..." : "Send Reply"}
              </button>
            </div>
          </section>
        )}

        {!loading && isQueueTab && !selectedMessage && (
          <section style={{ ...cardStyle, overflow: "hidden" }}>
            {statusMessage && (
              <div className="admin-message-inline-success">{statusMessage}</div>
            )}
            {errorMessage && (
              <div className="admin-message-inline-error">{errorMessage}</div>
            )}
            {queueMessages.length === 0 ? (
              <div style={{ padding: "22px", color: "#334155" }}>
                {activeTab === "Dealt With"
                  ? "No messages have been dealt with yet."
                  : "No active messages."}
              </div>
            ) : (
              queueMessages.map((item) => (
                <div
                  key={item.id}
                  className="admin-message-queue-row"
                >
                  <div
                    onClick={() => openInboxMessage(item)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        openInboxMessage(item);
                      }
                    }}
                    role="button"
                    tabIndex={0}
                    style={{
                      width: "100%",
                      textAlign: "left",
                      background: item.read_at ? "#ffffff" : "#f8fafd",
                      border: "none",
                      padding: "16px 18px",
                      cursor: "pointer",
                      boxSizing: "border-box",
                    }}
                  >
                    <MessageRow
                      badge={!item.read_at ? "New" : ""}
                      name={item.sender_name}
                      meta={roleLabel(item.sender_role)}
                      subject={item.subject}
                      message={item.message}
                      date={item.created_at}
                      attachmentLink={item.attachment_link}
                    />
                    {item.dealt_with_at && (
                      <div className="admin-message-dealt-metadata">
                        Dealt with by {item.dealt_with_by_name || "Admin"} ·{" "}
                        {formatMessageDateTime(item.dealt_with_at)}
                      </div>
                    )}
                  </div>
                  {activeTab === "Dealt With" && canDeleteAdminMessages && (
                    <div className="admin-message-row-delete-action">
                      <button
                        type="button"
                        onClick={() =>
                          setPendingDeleteTarget({
                            id: item.id,
                            section: "dealt",
                          })
                        }
                        disabled={Boolean(deletingMessageId)}
                      >
                        Delete
                      </button>
                    </div>
                  )}
                </div>
              ))
            )}
            {activeTab === "Dealt With" && dealtHasMore && (
              <div className="admin-message-load-more">
                <button
                  type="button"
                  onClick={() => void loadMoreDealtMessages()}
                  disabled={loadingMoreDealt}
                >
                  {loadingMoreDealt ? "Loading..." : "Load More"}
                </button>
              </div>
            )}
          </section>
        )}

        {!loading && activeTab === "Sent" && (
          <section style={{ ...cardStyle, overflow: "hidden" }}>
            {statusMessage && (
              <div className="admin-message-inline-success">{statusMessage}</div>
            )}
            {errorMessage && (
              <div className="admin-message-inline-error">{errorMessage}</div>
            )}
            {sentMessages.length === 0 ? (
              <div style={{ padding: "22px", color: "#334155" }}>
                No sent messages yet.
              </div>
            ) : (
              sentMessages.map((item) => (
                <div
                  key={item.id}
                  style={{
                    borderBottom: "1px solid #edf1f7",
                    padding: "16px 18px",
                    display: "flex",
                    alignItems: "flex-start",
                    gap: "14px",
                  }}
                >
                  <div style={{ flex: "1 1 auto", minWidth: 0 }}>
                    <MessageRow
                      name={item.receiver_name}
                      meta={roleLabel(item.receiver_role)}
                      subject={item.subject}
                      message={item.message}
                      date={item.created_at}
                      attachmentLink={item.attachment_link}
                    />
                  </div>
                  {canDeleteAdminMessages && (
                    <button
                      type="button"
                      className="admin-message-sent-delete-action"
                      onClick={() =>
                        setPendingDeleteTarget({ id: item.id, section: "sent" })
                      }
                      disabled={Boolean(deletingMessageId)}
                    >
                      Delete
                    </button>
                  )}
                </div>
              ))
            )}
          </section>
        )}

        {!loading && activeTab === "New Message" && (
          <section style={{ ...cardStyle, padding: "22px" }}>
            <h2 style={{ color: "#1f3c88", margin: "0 0 6px" }}>
              New Message
            </h2>
            <p style={{ color: "#64748b", margin: "0 0 18px" }}>
              Send an email-style message to one teacher or all teachers.
            </p>

            {statusMessage && (
              <p style={{ color: "#166534", fontWeight: 700 }}>
                {statusMessage}
              </p>
            )}

            {errorMessage && (
              <p style={{ color: "#b91c1c", fontWeight: 700 }}>
                {errorMessage}
              </p>
            )}

            <div style={{ display: "grid", gap: "16px", maxWidth: "760px" }}>
              <div>
                <label style={{ color: "#334155", fontWeight: 700 }}>
                  Recipient
                </label>
                <select
                  value={recipientMode}
                  onChange={(event) => setRecipientMode(event.target.value)}
                  style={{ ...inputStyle, marginTop: "6px" }}
                >
                  <option value="all">All Teachers</option>
                  <option value="individual">Individual Teacher</option>
                </select>
              </div>

              {recipientMode === "individual" && (
                <div>
                  <label style={{ color: "#334155", fontWeight: 700 }}>
                    Teacher
                  </label>
                  <select
                    value={teacherId}
                    onChange={(event) => setTeacherId(event.target.value)}
                    style={{ ...inputStyle, marginTop: "6px" }}
                  >
                    <option value="">Select teacher</option>
                    {teachers.map((teacher) => (
                      <option key={teacher.id} value={teacher.id}>
                        {teacher.first_name} {teacher.last_name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label style={{ color: "#334155", fontWeight: 700 }}>
                  Subject
                </label>
                <input
                  value={subject}
                  onChange={(event) => setSubject(event.target.value)}
                  style={{ ...inputStyle, marginTop: "6px" }}
                />
              </div>

              <div>
                <label style={{ color: "#334155", fontWeight: 700 }}>
                  Message
                </label>
                <textarea
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                  rows={6}
                  style={{ ...inputStyle, marginTop: "6px", resize: "vertical" }}
                />
              </div>

              <div>
                <label style={{ color: "#334155", fontWeight: 700 }}>
                  Attachment / resource link
                </label>
                <input
                  value={attachmentLink}
                  onChange={(event) => setAttachmentLink(event.target.value)}
                  style={{ ...inputStyle, marginTop: "6px" }}
                />
              </div>

              <button
                onClick={handleSend}
                disabled={sending}
                style={{
                  background: "#1f3c88",
                  color: "#ffffff",
                  border: "none",
                  borderRadius: "8px",
                  padding: "12px 18px",
                  fontWeight: 700,
                  cursor: sending ? "not-allowed" : "pointer",
                  width: "fit-content",
                }}
              >
                {sending ? "Sending..." : "Send Message"}
              </button>
            </div>
          </section>
        )}

        {pendingDeleteTarget && (
          <div
            className="admin-message-delete-dialog-backdrop"
            role="presentation"
          >
            <section
              className="admin-message-delete-dialog"
              role="dialog"
              aria-modal="true"
              aria-labelledby="admin-message-delete-dialog-title"
            >
              <h2 id="admin-message-delete-dialog-title">Delete Message</h2>
              <p>
                {pendingDeleteTarget.section === "sent"
                  ? "Remove this sent message from Admin Messages? The recipient’s copy will remain available."
                  : "Remove this dealt-with message from Admin Messages?"}
              </p>
              <div className="admin-message-delete-dialog-actions">
                <button
                  type="button"
                  className="admin-message-delete-cancel"
                  onClick={() => setPendingDeleteTarget(null)}
                  disabled={Boolean(deletingMessageId)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="admin-message-delete-confirm"
                  onClick={() => void deleteAdminMessage()}
                  disabled={Boolean(deletingMessageId)}
                >
                  {deletingMessageId ? "Deleting..." : "Delete Message"}
                </button>
              </div>
            </section>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}

function MessageRow({
  badge,
  name,
  meta,
  subject,
  message,
  date,
  attachmentLink,
}: {
  badge?: string;
  name?: string;
  meta?: string;
  subject?: string | null;
  message?: string | null;
  date?: string | null;
  attachmentLink?: string | null;
}) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        gap: "14px",
        alignItems: "flex-start",
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            display: "flex",
            gap: "8px",
            alignItems: "center",
            marginBottom: "5px",
          }}
        >
          {badge && (
            <span
              style={{
                background: "#1f3c88",
                color: "#ffffff",
                borderRadius: "999px",
                padding: "3px 8px",
                fontSize: "11px",
                fontWeight: 700,
              }}
            >
              {badge}
            </span>
          )}
          <strong style={{ color: "#1f3c88" }}>{name || "Unknown user"}</strong>
          {meta && (
            <span style={{ color: "#64748b", fontSize: "13px" }}>{meta}</span>
          )}
        </div>
        <div
          style={{
            color: "#334155",
            fontWeight: 700,
            marginBottom: "4px",
          }}
        >
          {subject || "No subject"}
        </div>
        <div style={{ color: "#475569", fontSize: "14px" }}>
          {previewText(message)}
        </div>
        {attachmentLink && (
          <a
            href={attachmentLink}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              color: "#1f3c88",
              fontWeight: 700,
              display: "inline-block",
              marginTop: "8px",
              textDecoration: "none",
            }}
            onClick={(event) => event.stopPropagation()}
          >
            Open attachment
          </a>
        )}
      </div>

      <span
        style={{
          color: "#718096",
          fontSize: "12px",
          whiteSpace: "nowrap",
        }}
      >
        {formatMessageDateTime(date)}
      </span>
    </div>
  );
}
