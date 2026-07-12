"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import TeacherLayout from "../../components/layout/TeacherLayout";
import { supabase } from "../../../lib/supabase";
import {
  getTeacherStaffInboxMessages,
  getTeacherStaffRecipients,
  getTeacherStaffSentMessages,
  hideTeacherReceivedStaffMessage,
  hideTeacherSentStaffMessage,
  markTeacherStaffMessageAsRead,
  sendTeacherStaffMessage,
  TEACHER_ADMIN_RECIPIENT_VALUE,
} from "../../../lib/messages";

const tabs = ["Inbox", "Sent", "New Message"];

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
  background: "#ffffff",
};

const deleteButtonStyle = {
  background: "#ffffff",
  color: "#b91c1c",
  border: "1px solid #fecaca",
  borderRadius: "8px",
  padding: "10px 14px",
  fontWeight: 700,
  cursor: "pointer",
};

function formatDate(value?: string | null) {
  if (!value) return "";

  return new Date(value).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function previewText(value?: string | null) {
  if (!value) return "";

  return value.length > 120 ? `${value.slice(0, 120)}...` : value;
}

function getReplySubject(subject?: string | null) {
  if (!subject) return "Re: Message";

  return subject.toLowerCase().startsWith("re:") ? subject : `Re: ${subject}`;
}

function roleLabel(role?: string | null) {
  if (role === "admin") return "Admin";
  if (role === "teacher") return "Teacher";

  return "Staff";
}

function getProfileName(profile: any) {
  const name = `${profile?.first_name || ""} ${profile?.last_name || ""}`.trim();

  return name || profile?.email || "Staff member";
}

function getMessageName(message: any, type: "inbox" | "sent") {
  if (type === "inbox") {
    return message.sender_name || "Staff member";
  }

  return message.receiver_name || "Staff member";
}

function getMessageRole(message: any, type: "inbox" | "sent") {
  return type === "inbox" ? message.sender_role : message.receiver_role;
}

function MessageRow({
  item,
  type,
  onClick,
}: {
  item: any;
  type: "inbox" | "sent";
  onClick: () => void;
}) {
  const unread = type === "inbox" && !item.read_at;

  return (
    <button
      onClick={onClick}
      style={{
        width: "100%",
        textAlign: "left",
        background: unread ? "#f8fafd" : "#ffffff",
        border: "none",
        borderBottom: "1px solid #edf1f7",
        padding: "16px 18px",
        cursor: "pointer",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: "14px",
          alignItems: "flex-start",
          flexWrap: "wrap",
        }}
      >
        <div style={{ minWidth: 0, flex: "1 1 260px" }}>
          <div
            style={{
              display: "flex",
              gap: "8px",
              alignItems: "center",
              marginBottom: "5px",
              flexWrap: "wrap",
            }}
          >
            {unread && (
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
                New
              </span>
            )}
            <strong style={{ color: "#1f3c88" }}>
              {type === "inbox" ? "From" : "To"}: {getMessageName(item, type)}
            </strong>
            <span style={{ color: "#64748b", fontSize: "13px" }}>
              {roleLabel(getMessageRole(item, type))}
            </span>
          </div>
          <div
            style={{
              color: "#334155",
              fontWeight: 700,
              marginBottom: "4px",
            }}
          >
            {item.subject || "No subject"}
          </div>
          <div style={{ color: "#475569", fontSize: "14px" }}>
            {previewText(item.message)}
          </div>
        </div>

        <span
          style={{
            color: "#718096",
            fontSize: "12px",
            whiteSpace: "nowrap",
          }}
        >
          {formatDate(item.created_at)}
        </span>
      </div>
    </button>
  );
}

export default function TeacherMessagesPage() {
  const router = useRouter();
  const mountedRef = useRef(false);

  const [teacherId, setTeacherId] = useState("");
  const [activeTab, setActiveTab] = useState("Inbox");
  const [inboxMessages, setInboxMessages] = useState<any[]>([]);
  const [sentMessages, setSentMessages] = useState<any[]>([]);
  const [recipients, setRecipients] = useState<{
    admins: any[];
    teachers: any[];
  }>({
    admins: [],
    teachers: [],
  });
  const [selectedMessage, setSelectedMessage] = useState<any | null>(null);
  const [receiverId, setReceiverId] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [attachmentLink, setAttachmentLink] = useState("");
  const [replyMessage, setReplyMessage] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [recipientsLoading, setRecipientsLoading] = useState(false);
  const [recipientsLoaded, setRecipientsLoaded] = useState(false);
  const [recipientsError, setRecipientsError] = useState("");
  const [sending, setSending] = useState(false);
  const [deletingMessageId, setDeletingMessageId] = useState("");

  const hasStaffRecipients =
    recipients.admins.length > 0 || recipients.teachers.length > 0;

  async function loadMessages(currentTeacherId: string) {
    const [inboxData, sentData] = await Promise.all([
      getTeacherStaffInboxMessages(currentTeacherId),
      getTeacherStaffSentMessages(currentTeacherId),
    ]);

    if (!mountedRef.current) return;

    setInboxMessages(inboxData);
    setSentMessages(sentData);
  }

  async function loadStaffMessages(currentTeacherId: string) {
    if (!mountedRef.current) return;

    setLoading(true);

    try {
      await loadMessages(currentTeacherId);
    } catch (error) {
      console.error("Unable to load teacher staff messages:", error);
      if (!mountedRef.current) return;
      setErrorMessage("Unable to load messages.");
    } finally {
      if (!mountedRef.current) return;
      setLoading(false);
    }
  }

  async function loadRecipients(currentTeacherId: string) {
    if (!mountedRef.current) return;

    setRecipientsLoading(true);
    setRecipientsLoaded(false);
    setRecipientsError("");

    try {
      const staffRecipients = await getTeacherStaffRecipients(currentTeacherId);
      if (!mountedRef.current) return;
      setRecipients(staffRecipients);
      setRecipientsLoaded(true);
    } catch (error) {
      console.error("Unable to load teacher staff recipients:", error);
      if (!mountedRef.current) return;
      setRecipients({
        admins: [],
        teachers: [],
      });
      setRecipientsError("Unable to load staff recipients. Please try again.");
    } finally {
      if (!mountedRef.current) return;
      setRecipientsLoading(false);
    }
  }

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

        if (profile?.role !== "teacher") {
          router.push("/login");
          return;
        }

        if (!mountedRef.current) return;

        setTeacherId(session.user.id);
        void loadStaffMessages(session.user.id);
        void loadRecipients(session.user.id);
      } catch (error) {
        console.error("Unable to load teacher messages:", error);
        if (!mountedRef.current) return;
        setErrorMessage("Unable to load messages.");
        setLoading(false);
        setRecipientsLoading(false);
      }
    }

    loadPage();

    return () => {
      mountedRef.current = false;
    };
  }, [router]);

  async function openInboxMessage(item: any) {
    setStatusMessage("");
    setErrorMessage("");
    setSelectedMessage(item);
    setReplyMessage("");

    if (!item.read_at && teacherId) {
      try {
        await markTeacherStaffMessageAsRead(item.id, teacherId);

        const readAt = new Date().toISOString();
        const updatedMessage = { ...item, read_at: readAt };

        setSelectedMessage(updatedMessage);
        setInboxMessages((currentMessages) =>
          currentMessages.map((messageItem) =>
            messageItem.id === item.id ? updatedMessage : messageItem
          )
        );
      } catch (error) {
        console.error("Unable to mark staff message as read:", error);
      }
    }
  }

  function openSentMessage(item: any) {
    setStatusMessage("");
    setErrorMessage("");
    setSelectedMessage(item);
    setReplyMessage("");
  }

  function resetComposer() {
    setReceiverId("");
    setSubject("");
    setMessage("");
    setAttachmentLink("");
  }

  async function handleSend() {
    setStatusMessage("");
    setErrorMessage("");

    if (!receiverId) {
      if (recipientsLoading) {
        setErrorMessage("Staff recipients are still loading.");
        return;
      }

      if (recipientsError) {
        setErrorMessage("Unable to load staff recipients. Please try again.");
        return;
      }

      if (!hasStaffRecipients) {
        setErrorMessage("No other staff recipients are available.");
        return;
      }

      setErrorMessage("Please select a staff recipient.");
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

    setSending(true);

    try {
      await sendTeacherStaffMessage({
        senderId: teacherId,
        recipient:
          receiverId === TEACHER_ADMIN_RECIPIENT_VALUE
            ? { type: "admin_group" }
            : { type: "teacher", teacherId: receiverId },
        subject: subject.trim(),
        message: message.trim(),
        attachment_link: attachmentLink.trim() || null,
      });

      resetComposer();
      setStatusMessage("Message sent successfully.");
      await loadMessages(teacherId);
      setActiveTab("Sent");
    } catch (error: any) {
      console.error("Unable to send staff message:", error);
      setErrorMessage(error?.message || "Unable to send message.");
    } finally {
      setSending(false);
    }
  }

  async function handleReply() {
    setStatusMessage("");
    setErrorMessage("");

    if (!selectedMessage || !teacherId) {
      setErrorMessage("Unable to send reply.");
      return;
    }

    if (!replyMessage.trim()) {
      setErrorMessage("Please enter a reply message.");
      return;
    }

    setSending(true);

    try {
      await sendTeacherStaffMessage({
        senderId: teacherId,
        recipient:
          selectedMessage.sender_role === "admin"
            ? { type: "admin_group" }
            : { type: "teacher", teacherId: selectedMessage.sender_id },
        subject: getReplySubject(selectedMessage.subject),
        message: replyMessage.trim(),
      });

      setReplyMessage("");
      setStatusMessage("Reply sent successfully.");
      await loadMessages(teacherId);
    } catch (error: any) {
      console.error("Unable to send staff reply:", error);
      setErrorMessage(error?.message || "Unable to send reply.");
    } finally {
      setSending(false);
    }
  }

  async function handleDeleteFromInbox(item: any) {
    setStatusMessage("");
    setErrorMessage("");

    if (!item?.id || !item.read_at) {
      setErrorMessage("Open this message before removing it from your inbox.");
      return;
    }

    const confirmed = confirm(
      "Remove this message from your Inbox? It will only be hidden from your view. The sender will still keep their copy."
    );

    if (!confirmed) return;

    setDeletingMessageId(item.id);

    try {
      await hideTeacherReceivedStaffMessage(item.id);
      setInboxMessages((currentMessages) =>
        currentMessages.filter((messageItem) => messageItem.id !== item.id)
      );
      setSelectedMessage(null);
      setStatusMessage("Message removed from your Inbox.");
    } catch (error: any) {
      console.error("Unable to remove inbox message:", error);
      setErrorMessage("Unable to remove message from Inbox.");
    } finally {
      setDeletingMessageId("");
    }
  }

  async function handleDeleteFromSent(item: any) {
    setStatusMessage("");
    setErrorMessage("");

    if (!item?.id) {
      setErrorMessage("Unable to identify the message.");
      return;
    }

    const confirmed = confirm(
      "Remove this message from your Sent view? This does not recall the message or remove it from the recipient's Inbox."
    );

    if (!confirmed) return;

    setDeletingMessageId(item.id);

    try {
      await hideTeacherSentStaffMessage(item.id);
      setSentMessages((currentMessages) =>
        currentMessages.filter((messageItem) => messageItem.id !== item.id)
      );
      setSelectedMessage(null);
      setStatusMessage("Message removed from your Sent view.");
    } catch (error: any) {
      console.error("Unable to remove sent message:", error);
      setErrorMessage("Unable to remove message from Sent.");
    } finally {
      setDeletingMessageId("");
    }
  }

  function renderEmptyState(type: "Inbox" | "Sent") {
    return (
      <div style={{ padding: "22px", color: "#334155" }}>
        {type === "Inbox"
          ? "No staff messages in your inbox yet."
          : "No sent staff messages yet."}
      </div>
    );
  }

  return (
    <TeacherLayout>
      <div
        style={{
          background: "#f5f7fa",
          minHeight: "100vh",
          padding: "24px",
        }}
      >
        <div style={{ maxWidth: "980px", margin: "0 auto" }}>
          <header style={{ marginBottom: "22px" }}>
            <h1 style={{ color: "#1f3c88", margin: "0 0 6px" }}>Messages</h1>
            <p style={{ color: "#5f6f89", margin: 0 }}>
              Send and receive staff messages with admin and other teachers.
            </p>
          </header>

          <div
            style={{
              display: "flex",
              gap: "10px",
              flexWrap: "wrap",
              marginBottom: "18px",
            }}
          >
            {tabs.map((tab) => {
              const active = activeTab === tab;

              return (
                <button
                  key={tab}
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
                  {tab}
                </button>
              );
            })}
          </div>

          {loading && (
            <section style={{ ...cardStyle, padding: "18px", color: "#334155" }}>
              Loading messages...
            </section>
          )}

          {!loading && errorMessage && !selectedMessage && (
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

          {!loading && statusMessage && !selectedMessage && (
            <div
              style={{
                background: "#f0fdf4",
                border: "1px solid #bbf7d0",
                borderRadius: "10px",
                padding: "12px",
                color: "#166534",
                fontWeight: 700,
                marginBottom: "16px",
              }}
            >
              {statusMessage}
            </div>
          )}

          {!loading && activeTab === "Inbox" && selectedMessage && (
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
                ← Back to inbox
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
                <span>From: {selectedMessage.sender_name || "Staff member"}</span>
                <span>Role: {roleLabel(selectedMessage.sender_role)}</span>
                <span>Date: {formatDate(selectedMessage.created_at)}</span>
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

              {selectedMessage.read_at && (
                <button
                  onClick={() => handleDeleteFromInbox(selectedMessage)}
                  disabled={deletingMessageId === selectedMessage.id}
                  style={{
                    ...deleteButtonStyle,
                    cursor:
                      deletingMessageId === selectedMessage.id
                        ? "not-allowed"
                        : "pointer",
                    opacity: deletingMessageId === selectedMessage.id ? 0.7 : 1,
                    marginBottom: "20px",
                  }}
                >
                  {deletingMessageId === selectedMessage.id
                    ? "Removing..."
                    : "Delete from Inbox"}
                </button>
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

          {!loading && activeTab === "Sent" && selectedMessage && (
            <section style={{ ...cardStyle, padding: "22px" }}>
              <button
                onClick={() => {
                  setSelectedMessage(null);
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
                ← Back to sent
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
                <span>To: {selectedMessage.receiver_name || "Staff member"}</span>
                <span>Role: {roleLabel(selectedMessage.receiver_role)}</span>
                <span>Date: {formatDate(selectedMessage.created_at)}</span>
              </div>

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
                  }}
                >
                  Open attachment
                </a>
              )}

              <button
                onClick={() => handleDeleteFromSent(selectedMessage)}
                disabled={deletingMessageId === selectedMessage.id}
                style={{
                  ...deleteButtonStyle,
                  cursor:
                    deletingMessageId === selectedMessage.id
                      ? "not-allowed"
                      : "pointer",
                  opacity: deletingMessageId === selectedMessage.id ? 0.7 : 1,
                }}
              >
                {deletingMessageId === selectedMessage.id
                  ? "Removing..."
                  : "Delete from Sent"}
              </button>
            </section>
          )}

          {!loading &&
            activeTab === "Inbox" &&
            !selectedMessage &&
            !errorMessage && (
              <section style={{ ...cardStyle, overflow: "hidden" }}>
                {inboxMessages.length === 0
                  ? renderEmptyState("Inbox")
                  : inboxMessages.map((item) => (
                      <MessageRow
                        key={item.id}
                        item={item}
                        type="inbox"
                        onClick={() => openInboxMessage(item)}
                      />
                    ))}
              </section>
            )}

          {!loading &&
            activeTab === "Sent" &&
            !selectedMessage &&
            !errorMessage && (
              <section style={{ ...cardStyle, overflow: "hidden" }}>
                {sentMessages.length === 0
                  ? renderEmptyState("Sent")
                  : sentMessages.map((item) => (
                      <MessageRow
                        key={item.id}
                        item={item}
                        type="sent"
                        onClick={() => openSentMessage(item)}
                      />
                    ))}
              </section>
            )}

          {!loading && activeTab === "New Message" && (
            <section style={{ ...cardStyle, padding: "22px" }}>
              <h2 style={{ color: "#1f3c88", margin: "0 0 6px" }}>
                New Staff Message
              </h2>
              <p style={{ color: "#64748b", margin: "0 0 18px" }}>
                Send an email-style message to one admin user or teacher.
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
                {recipientsLoading && (
                  <div
                    style={{
                      background: "#f8fafc",
                      border: "1px solid #dbe3f0",
                      borderRadius: "10px",
                      padding: "12px",
                      color: "#334155",
                    }}
                  >
                    Loading staff recipients…
                  </div>
                )}

                {!recipientsLoading && recipientsError && (
                  <div
                    style={{
                      background: "#fff5f5",
                      border: "1px solid #fecaca",
                      borderRadius: "10px",
                      padding: "12px",
                      color: "#b91c1c",
                      fontWeight: 700,
                    }}
                  >
                    {recipientsError}
                  </div>
                )}

                {!recipientsLoading &&
                  !recipientsError &&
                  recipientsLoaded &&
                  !hasStaffRecipients && (
                    <div
                      style={{
                        background: "#f8fafc",
                        border: "1px solid #dbe3f0",
                        borderRadius: "10px",
                        padding: "12px",
                        color: "#334155",
                      }}
                    >
                      No other staff recipients are available.
                    </div>
                  )}

                {!recipientsLoading && !recipientsError && hasStaffRecipients && (
                  <div>
                    <label style={{ color: "#334155", fontWeight: 700 }}>
                      Recipient
                    </label>
                    <select
                      value={receiverId}
                      onChange={(event) => setReceiverId(event.target.value)}
                      style={{ ...inputStyle, marginTop: "6px" }}
                    >
                      <option value="">Select staff member</option>
                      {recipients.admins.length > 0 && (
                        <optgroup label="Admin">
                          {recipients.admins.map((admin) => (
                            <option key={admin.id} value={admin.id}>
                              {getProfileName(admin)}
                            </option>
                          ))}
                        </optgroup>
                      )}
                      {recipients.teachers.length > 0 && (
                        <optgroup label="Teachers">
                          {recipients.teachers.map((teacher) => (
                            <option key={teacher.id} value={teacher.id}>
                              {getProfileName(teacher)}
                            </option>
                          ))}
                        </optgroup>
                      )}
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
                    style={{
                      ...inputStyle,
                      marginTop: "6px",
                      resize: "vertical",
                    }}
                  />
                </div>

                <div>
                  <label style={{ color: "#334155", fontWeight: 700 }}>
                    Attachment or resource link
                  </label>
                  <input
                    value={attachmentLink}
                    onChange={(event) => setAttachmentLink(event.target.value)}
                    style={{ ...inputStyle, marginTop: "6px" }}
                  />
                </div>

                <button
                  onClick={handleSend}
                  disabled={
                    sending ||
                    recipientsLoading ||
                    Boolean(recipientsError) ||
                    !hasStaffRecipients
                  }
                  style={{
                    background: "#1f3c88",
                    color: "#ffffff",
                    border: "none",
                    borderRadius: "8px",
                    padding: "12px 18px",
                    fontWeight: 700,
                    cursor:
                      sending ||
                      recipientsLoading ||
                      Boolean(recipientsError) ||
                      !hasStaffRecipients
                        ? "not-allowed"
                        : "pointer",
                    opacity:
                      sending ||
                      recipientsLoading ||
                      Boolean(recipientsError) ||
                      !hasStaffRecipients
                        ? 0.7
                        : 1,
                    width: "fit-content",
                  }}
                >
                  {sending ? "Sending..." : "Send Message"}
                </button>
              </div>
            </section>
          )}
        </div>
      </div>
    </TeacherLayout>
  );
}
