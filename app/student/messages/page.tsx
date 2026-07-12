"use client";

import { useEffect, useState } from "react";

import StudentMenu from "../StudentMenu";
import {
  getInboxMessages,
  getSentMessages,
  markMessageAsRead,
  sendMessage,
} from "../../../lib/messages";
import {
  getCurrentTeacher,
  getCurrentUser,
} from "../../../lib/user";

const inputStyle = {
  width: "100%",
  padding: "12px",
  border: "1px solid #d9d9d9",
  borderRadius: "8px",
  color: "#333",
  background: "#ffffff",
  boxSizing: "border-box" as const,
};

const cardStyle = {
  background: "#ffffff",
  border: "1px solid #e6eaf2",
  borderRadius: "12px",
  padding: "20px",
  boxShadow: "0 6px 18px rgba(31,60,136,0.06)",
};

function formatDate(date: string | null | undefined) {
  if (!date) return "";

  return new Date(date).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function getPreview(message: string) {
  if (!message) return "";

  return message.length > 110
    ? `${message.slice(0, 110)}...`
    : message;
}

export default function StudentMessagesPage() {
  const [studentId, setStudentId] = useState("");
  const [teacher, setTeacher] = useState<any>(null);
  const [inboxMessages, setInboxMessages] = useState<any[]>([]);
  const [sentMessages, setSentMessages] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState("inbox");
  const [openMessage, setOpenMessage] = useState<any>(null);
  const [openMessageType, setOpenMessageType] = useState<
    "inbox" | "sent"
  >("inbox");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [attachmentLink, setAttachmentLink] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  async function loadMessages(
    currentStudentId = studentId,
    currentTeacher = teacher
  ) {
    if (!currentStudentId || !currentTeacher?.id) return;

    const [inbox, sent] = await Promise.all([
      getInboxMessages(currentStudentId, currentTeacher.id),
      getSentMessages(currentStudentId, currentTeacher.id),
    ]);

    setInboxMessages(inbox);
    setSentMessages(sent);
  }

  useEffect(() => {
    async function loadInitialMessages() {
      try {
        const user = await getCurrentUser();
        const currentTeacher = await getCurrentTeacher();

        setStudentId(user.id);
        setTeacher(currentTeacher);

        await loadMessages(user.id, currentTeacher);
      } catch (error) {
        console.error("LOAD MESSAGES ERROR:", error);
        setErrorMessage("Unable to load messages.");
      } finally {
        setLoading(false);
      }
    }

    loadInitialMessages();
  }, []);

  async function openInboxMessage(item: any) {
    setOpenMessage(item);
    setOpenMessageType("inbox");

    if (!item.read_at && studentId) {
      try {
        await markMessageAsRead(item.id, studentId);
        setInboxMessages((current) =>
          current.map((messageItem) =>
            messageItem.id === item.id
              ? {
                  ...messageItem,
                  read_at: new Date().toISOString(),
                }
              : messageItem
          )
        );
        setOpenMessage({
          ...item,
          read_at: new Date().toISOString(),
        });
      } catch (error) {
        console.error("Unable to mark message as read:", error);
      }
    }
  }

  function openSentMessage(item: any) {
    setOpenMessage(item);
    setOpenMessageType("sent");
  }

  function startReply(item: any) {
    const replySubject = item.subject?.startsWith("Re:")
      ? item.subject
      : `Re: ${item.subject || "Message"}`;

    setSubject(replySubject);
    setMessage("");
    setAttachmentLink("");
    setOpenMessage(null);
    setStatusMessage("");
    setErrorMessage("");
    setActiveTab("new");
  }

  async function handleSendMessage(event: React.FormEvent) {
    event.preventDefault();
    setStatusMessage("");
    setErrorMessage("");

    if (!teacher?.id) {
      setErrorMessage("Teacher not found.");
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
      await sendMessage({
        sender_id: studentId,
        receiver_id: teacher.id,
        subject: subject.trim(),
        message: message.trim(),
        attachment_link: attachmentLink.trim() || null,
      });

      setSubject("");
      setMessage("");
      setAttachmentLink("");
      setStatusMessage("Message sent successfully.");
      await loadMessages();
      setActiveTab("sent");
    } catch (error) {
      console.error("Unable to send message:", error);
      setErrorMessage("Unable to send message.");
    } finally {
      setSending(false);
    }
  }

  function renderMessageList(
    items: any[],
    type: "inbox" | "sent"
  ) {
    if (items.length === 0) {
      return (
        <p style={{ color: "#667085", margin: 0 }}>
          {type === "inbox"
            ? "No inbox messages yet."
            : "No sent messages yet."}
        </p>
      );
    }

    return (
      <div style={{ display: "grid", gap: "12px" }}>
        {items.map((item) => (
          <button
            key={item.id}
            onClick={() =>
              type === "inbox"
                ? openInboxMessage(item)
                : openSentMessage(item)
            }
            style={{
              ...cardStyle,
              cursor: "pointer",
              textAlign: "left",
              border:
                type === "inbox" && !item.read_at
                  ? "1px solid #b8c7ee"
                  : "1px solid #e6eaf2",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: "14px",
                marginBottom: "8px",
              }}
            >
              <strong style={{ color: "#1f3c88", fontSize: "16px" }}>
                {item.subject || "No subject"}
              </strong>

              <span
                style={{
                  color: "#667085",
                  fontSize: "13px",
                  whiteSpace: "nowrap",
                }}
              >
                {formatDate(item.created_at)}
              </span>
            </div>

            {type === "inbox" && !item.read_at && (
              <span
                style={{
                  display: "inline-block",
                  background: "#eef3ff",
                  color: "#1f3c88",
                  borderRadius: "999px",
                  padding: "4px 9px",
                  fontWeight: 700,
                  fontSize: "12px",
                  marginBottom: "8px",
                }}
              >
                New
              </span>
            )}

            <p
              style={{
                color: "#5f6b7a",
                margin: 0,
                lineHeight: 1.5,
              }}
            >
              {getPreview(item.message)}
            </p>
          </button>
        ))}
      </div>
    );
  }

  return (
    <div
      style={{
        display: "flex",
        minHeight: "100vh",
        background: "#f5f7fa",
      }}
    >
      <StudentMenu />

      <main
        style={{
          flex: 1,
          padding: "40px",
        }}
      >
        <header style={{ marginBottom: "28px" }}>
          <h1
            style={{
              color: "#1f3c88",
              margin: 0,
              fontSize: "34px",
            }}
          >
            Messages
          </h1>

          <p style={{ color: "#667085", marginTop: "8px" }}>
            School messages between you and your class teacher.
          </p>
        </header>

        {loading ? (
          <div style={cardStyle}>Loading messages...</div>
        ) : openMessage ? (
          <section style={cardStyle}>
            <button
              onClick={() => setOpenMessage(null)}
              style={{ marginBottom: "18px" }}
            >
              Back
            </button>

            <h2
              style={{
                color: "#1f3c88",
                margin: "0 0 12px",
              }}
            >
              {openMessage.subject || "No subject"}
            </h2>

            <p style={{ color: "#667085", marginTop: 0 }}>
              {openMessageType === "inbox"
                ? `From: ${teacher?.first_name || ""} ${
                    teacher?.last_name || ""
                  }`
                : `To: ${teacher?.first_name || ""} ${
                    teacher?.last_name || ""
                  }`}
              <br />
              {formatDate(openMessage.created_at)}
            </p>

            <p
              style={{
                color: "#333",
                lineHeight: 1.65,
                whiteSpace: "pre-wrap",
              }}
            >
              {openMessage.message}
            </p>

            {openMessage.attachment_link && (
              <a
                href={openMessage.attachment_link}
                target="_blank"
                rel="noreferrer"
                style={{
                  color: "#1f3c88",
                  fontWeight: 700,
                  textDecoration: "none",
                }}
              >
                Open attachment
              </a>
            )}

            {openMessageType === "inbox" && (
              <div style={{ marginTop: "22px" }}>
                <button onClick={() => startReply(openMessage)}>
                  Reply
                </button>
              </div>
            )}
          </section>
        ) : (
          <>
            <div
              style={{
                display: "flex",
                gap: "10px",
                marginBottom: "22px",
              }}
            >
              {["inbox", "sent", "new"].map((tab) => (
                <button
                  key={tab}
                  onClick={() => {
                    setActiveTab(tab);
                    setStatusMessage("");
                    setErrorMessage("");
                  }}
                  style={{
                    background:
                      activeTab === tab ? "#1f3c88" : "#ffffff",
                    color: activeTab === tab ? "#ffffff" : "#1f3c88",
                    border: "1px solid #d8e2fb",
                    borderRadius: "8px",
                    padding: "10px 16px",
                    cursor: "pointer",
                    fontWeight: 700,
                  }}
                >
                  {tab === "inbox"
                    ? "Inbox"
                    : tab === "sent"
                    ? "Sent"
                    : "New Message"}
                </button>
              ))}
            </div>

            {errorMessage && (
              <div
                style={{
                  ...cardStyle,
                  color: "#b00020",
                  marginBottom: "18px",
                  fontWeight: 600,
                }}
              >
                {errorMessage}
              </div>
            )}

            {statusMessage && (
              <div
                style={{
                  ...cardStyle,
                  color: "#287a45",
                  marginBottom: "18px",
                  fontWeight: 600,
                }}
              >
                {statusMessage}
              </div>
            )}

            {activeTab === "inbox" && (
              <section>{renderMessageList(inboxMessages, "inbox")}</section>
            )}

            {activeTab === "sent" && (
              <section>{renderMessageList(sentMessages, "sent")}</section>
            )}

            {activeTab === "new" && (
              <form onSubmit={handleSendMessage} style={cardStyle}>
                <h2
                  style={{
                    color: "#1f3c88",
                    marginTop: 0,
                  }}
                >
                  New Message
                </h2>

                <p style={{ color: "#667085" }}>
                  To:{" "}
                  <strong>
                    {teacher
                      ? `${teacher.first_name || ""} ${
                          teacher.last_name || ""
                        }`.trim()
                      : "Class teacher"}
                  </strong>
                </p>

                <label>Subject</label>
                <input
                  value={subject}
                  onChange={(event) => setSubject(event.target.value)}
                  style={{ ...inputStyle, margin: "6px 0 14px" }}
                />

                <label>Message</label>
                <textarea
                  rows={8}
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                  style={{ ...inputStyle, margin: "6px 0 14px" }}
                />

                <label>Attachment / resource link</label>
                <input
                  value={attachmentLink}
                  onChange={(event) =>
                    setAttachmentLink(event.target.value)
                  }
                  placeholder="Optional"
                  style={{ ...inputStyle, margin: "6px 0 18px" }}
                />

                <button
                  type="submit"
                  disabled={sending}
                  style={{
                    background: "#1f3c88",
                    color: "#ffffff",
                    border: "none",
                    borderRadius: "8px",
                    padding: "12px 20px",
                    cursor: sending ? "not-allowed" : "pointer",
                    fontWeight: 700,
                  }}
                >
                  {sending ? "Sending..." : "Send Message"}
                </button>
              </form>
            )}
          </>
        )}
      </main>
    </div>
  );
}
