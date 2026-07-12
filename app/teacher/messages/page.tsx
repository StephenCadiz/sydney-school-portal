"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import TeacherLayout from "../../components/layout/TeacherLayout";
import { supabase } from "../../../lib/supabase";
import {
  getTeacherInboxMessages,
  markMessageAsRead,
  sendMessage,
} from "../../../lib/messages";

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

function getSenderName(message: any) {
  if (message.sender_role === "admin") {
    return message.sender_name || "Admin";
  }

  return message.student_name || message.sender_name || "Unknown sender";
}

export default function TeacherMessagesPage() {
  const router = useRouter();

  const [teacherId, setTeacherId] = useState("");
  const [messages, setMessages] = useState<any[]>([]);
  const [selectedMessage, setSelectedMessage] = useState<any | null>(null);
  const [replyMessage, setReplyMessage] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  async function loadMessages(currentTeacherId: string) {
    const data = await getTeacherInboxMessages(currentTeacherId);
    setMessages(data);
  }

  useEffect(() => {
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

        setTeacherId(session.user.id);
        await loadMessages(session.user.id);
      } catch (error) {
        console.error("Unable to load teacher messages:", error);
        setErrorMessage("Unable to load messages.");
      } finally {
        setLoading(false);
      }
    }

    loadPage();
  }, [router]);

  async function openMessage(message: any) {
    setStatusMessage("");
    setErrorMessage("");
    setSelectedMessage(message);
    setReplyMessage("");

    if (!message.read_at && teacherId) {
      try {
        await markMessageAsRead(message.id, teacherId);

        const readAt = new Date().toISOString();
        const updatedMessage = { ...message, read_at: readAt };

        setSelectedMessage(updatedMessage);
        setMessages((currentMessages) =>
          currentMessages.map((item) =>
            item.id === message.id ? updatedMessage : item
          )
        );
      } catch (error) {
        console.error("Unable to mark message as read:", error);
      }
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
      await sendMessage({
        sender_id: teacherId,
        receiver_id: selectedMessage.sender_id,
        subject: getReplySubject(selectedMessage.subject),
        message: replyMessage.trim(),
      });

      setReplyMessage("");
      setStatusMessage("Reply sent successfully.");
    } catch (error) {
      console.error("Unable to send reply:", error);
      setErrorMessage("Unable to send reply.");
    } finally {
      setSending(false);
    }
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
              View and reply to messages from students and admin.
            </p>
          </header>

          {loading && (
            <div
              style={{
                background: "#ffffff",
                borderRadius: "12px",
                padding: "18px",
                color: "#334155",
              }}
            >
              Loading messages...
            </div>
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

          {!loading && selectedMessage && (
            <section
              style={{
                background: "#ffffff",
                border: "1px solid #dbe3f0",
                borderRadius: "12px",
                padding: "22px",
                boxShadow: "0 8px 22px rgba(31, 60, 136, 0.08)",
              }}
            >
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
                <span>From: {getSenderName(selectedMessage)}</span>
                {selectedMessage.sender_role === "student" &&
                  selectedMessage.class_label && (
                    <span>Class: {selectedMessage.class_label}</span>
                  )}
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
                  style={{
                    width: "100%",
                    border: "1px solid #cbd5e1",
                    borderRadius: "10px",
                    padding: "12px",
                    fontSize: "14px",
                    resize: "vertical",
                    boxSizing: "border-box",
                  }}
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

          {!loading && !selectedMessage && !errorMessage && (
            <section
              style={{
                background: "#ffffff",
                border: "1px solid #dbe3f0",
                borderRadius: "12px",
                overflow: "hidden",
                boxShadow: "0 8px 22px rgba(31, 60, 136, 0.08)",
              }}
            >
              {messages.length === 0 ? (
                <div style={{ padding: "22px", color: "#334155" }}>
                  No messages yet.
                </div>
              ) : (
                messages.map((message) => (
                  <button
                    key={message.id}
                    onClick={() => openMessage(message)}
                    style={{
                      width: "100%",
                      textAlign: "left",
                      background: message.read_at ? "#ffffff" : "#f8fafd",
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
                          {!message.read_at && (
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
                            {getSenderName(message)}
                          </strong>
                        </div>
                        <div
                          style={{
                            color: "#334155",
                            fontWeight: 700,
                            marginBottom: "4px",
                          }}
                        >
                          {message.subject || "No subject"}
                        </div>
                        {message.sender_role === "student" &&
                          message.class_label && (
                            <div
                              style={{
                                color: "#64748b",
                                fontSize: "13px",
                                marginBottom: "4px",
                              }}
                            >
                              {message.class_label}
                            </div>
                          )}
                        <div style={{ color: "#475569", fontSize: "14px" }}>
                          {previewText(message.message)}
                        </div>
                      </div>

                      <span
                        style={{
                          color: "#718096",
                          fontSize: "12px",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {formatDate(message.created_at)}
                      </span>
                    </div>
                  </button>
                ))
              )}
            </section>
          )}
        </div>
      </div>
    </TeacherLayout>
  );
}
