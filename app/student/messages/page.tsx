"use client";

import { useEffect, useState } from "react";

import StudentMenu from "../StudentMenu";
import {
  formatMessageDateTime,
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
  const [menuOpen, setMenuOpen] = useState(false);
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
        <p className="student-messages-empty">
          {type === "inbox"
            ? "No inbox messages yet."
            : "No sent messages yet."}
        </p>
      );
    }

    return (
      <div className="student-messages-list">
        {items.map((item) => (
          <button
            key={item.id}
            onClick={() =>
              type === "inbox"
                ? openInboxMessage(item)
                : openSentMessage(item)
            }
            className={`student-messages-card ${
              type === "inbox" && !item.read_at ? "is-unread" : ""
            }`}
          >
            <div className="student-messages-card-header">
              <strong>
                {item.subject || "No subject"}
              </strong>

              <span>
                {formatMessageDateTime(item.created_at)}
              </span>
            </div>

            {type === "inbox" && !item.read_at && (
              <span className="student-messages-new-badge">
                New
              </span>
            )}

            <p className="student-messages-preview">
              {getPreview(item.message)}
            </p>
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className="student-layout-shell">
      <div className="student-mobile-topbar">
        <div className="student-mobile-topbar-title">Sydney School / Student</div>
        <button
          type="button"
          className="mobile-menu-button"
          aria-label="Open student menu"
          onClick={() => setMenuOpen(true)}
        >
          Menu
        </button>
      </div>

      {menuOpen && (
        <button
          type="button"
          aria-label="Close student menu"
          className="student-mobile-drawer-overlay"
          onClick={() => setMenuOpen(false)}
        />
      )}

      <div className={`student-mobile-drawer ${menuOpen ? "open" : ""}`}>
        <button
          type="button"
          className="student-mobile-drawer-close"
          onClick={() => setMenuOpen(false)}
        >
          Close
        </button>
        <StudentMenu mobileMode onClose={() => setMenuOpen(false)} />
      </div>

      <aside className="student-desktop-sidebar">
        <StudentMenu />
      </aside>

      <main className="student-main-content student-messages-page">
        <header className="student-messages-header">
          <h1>Messages</h1>

          <p>School messages between you and your class teacher.</p>
        </header>

        {loading ? (
          <div className="student-messages-state">Loading messages...</div>
        ) : openMessage ? (
          <section className="student-messages-open-card">
            <button
              type="button"
              className="student-messages-secondary-button"
              onClick={() => setOpenMessage(null)}
            >
              Back
            </button>

            <h2>
              {openMessage.subject || "No subject"}
            </h2>

            <p className="student-messages-meta">
              {openMessageType === "inbox"
                ? `From: ${teacher?.first_name || ""} ${
                    teacher?.last_name || ""
                  }`
                : `To: ${teacher?.first_name || ""} ${
                    teacher?.last_name || ""
                  }`}
              <br />
              {formatMessageDateTime(openMessage.created_at)}
            </p>

            <p className="student-messages-body">
              {openMessage.message}
            </p>

            {openMessage.attachment_link && (
              <a
                href={openMessage.attachment_link}
                target="_blank"
                rel="noreferrer"
                className="student-messages-attachment"
              >
                Open attachment
              </a>
            )}

            {openMessageType === "inbox" && (
              <div className="student-messages-actions">
                <button
                  type="button"
                  className="student-messages-primary-button"
                  onClick={() => startReply(openMessage)}
                >
                  Reply
                </button>
              </div>
            )}
          </section>
        ) : (
          <>
            <div className="student-messages-tabs">
              {["inbox", "sent", "new"].map((tab) => (
                <button
                  type="button"
                  key={tab}
                  className={activeTab === tab ? "is-active" : ""}
                  onClick={() => {
                    setActiveTab(tab);
                    setStatusMessage("");
                    setErrorMessage("");
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
              <div className="student-messages-state is-error">
                {errorMessage}
              </div>
            )}

            {statusMessage && (
              <div className="student-messages-state is-success">
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
              <form onSubmit={handleSendMessage} className="student-messages-form">
                <h2>New Message</h2>

                <p>
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
                  className="student-messages-primary-button"
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
