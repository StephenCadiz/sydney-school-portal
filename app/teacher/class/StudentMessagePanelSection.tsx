"use client";

import { useEffect, useState } from "react";

import {
  formatMessageDateTime,
  getMessages,
  sendMessage,
} from "../../../lib/messages";

type StudentMessagePanelSectionProps = {
  teacherId: string;
  studentId: string;
  studentName: string;
};

function getPreview(value?: string | null) {
  if (!value) return "";

  return value.length > 160 ? `${value.slice(0, 160)}...` : value;
}

export default function StudentMessagePanelSection({
  teacherId,
  studentId,
  studentName,
}: StudentMessagePanelSectionProps) {
  const [messages, setMessages] = useState<any[]>([]);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [attachmentLink, setAttachmentLink] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  async function loadMessages() {
    if (!teacherId || !studentId) {
      setMessages([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setErrorMessage("");

    try {
      const data = await getMessages(teacherId, studentId);
      setMessages(data);
    } catch (error) {
      console.error("Unable to load student conversation:", error);
      setMessages([]);
      setErrorMessage("Unable to load message history.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadMessages();
  }, [teacherId, studentId]);

  async function handleSendMessage() {
    setStatusMessage("");
    setErrorMessage("");

    if (!teacherId) {
      setErrorMessage("Unable to identify the logged-in teacher.");
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
        sender_id: teacherId,
        receiver_id: studentId,
        subject: subject.trim(),
        message: message.trim(),
        attachment_link: attachmentLink.trim() || null,
      });

      setSubject("");
      setMessage("");
      setAttachmentLink("");
      setStatusMessage("Message sent successfully.");
      await loadMessages();
    } catch (error) {
      console.error("Unable to send student message:", error);
      setErrorMessage("Unable to send message.");
    } finally {
      setSending(false);
    }
  }

  return (
    <section className="student-workspace-section">
      <div className="student-workspace-section-header">
        <h3>Message</h3>
        <p>Send messages to {studentName} from this class workspace.</p>
      </div>

      {statusMessage && (
        <div className="student-workspace-success" role="status">
          {statusMessage}
        </div>
      )}

      {errorMessage && (
        <div className="student-workspace-error" role="alert">
          {errorMessage}
        </div>
      )}

      <div className="student-workspace-form-card">
        <div className="student-workspace-fixed-recipient">
          <span>To</span>
          <strong>{studentName}</strong>
        </div>

        <label className="student-workspace-field">
          <span>Subject</span>
          <input
            value={subject}
            onChange={(event) => setSubject(event.target.value)}
            placeholder="Message subject"
          />
        </label>

        <label className="student-workspace-field">
          <span>Message</span>
          <textarea
            rows={6}
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            placeholder="Write your message..."
          />
        </label>

        <label className="student-workspace-field">
          <span>Attachment / resource link</span>
          <input
            value={attachmentLink}
            onChange={(event) => setAttachmentLink(event.target.value)}
            placeholder="Optional"
          />
        </label>

        <button
          type="button"
          className="student-workspace-primary-button"
          onClick={handleSendMessage}
          disabled={sending}
        >
          {sending ? "Sending..." : "Send Message"}
        </button>
      </div>

      <div className="student-workspace-list">
        <h4>Conversation History</h4>

        {loading ? (
          <p className="student-workspace-muted">Loading messages...</p>
        ) : messages.length === 0 ? (
          <p className="student-workspace-muted">No messages yet.</p>
        ) : (
          messages.map((item) => {
            const sentByTeacher = item.sender_id === teacherId;

            return (
              <article
                className={`student-workspace-message ${
                  sentByTeacher ? "is-teacher" : "is-student"
                }`}
                key={item.id}
              >
                <div className="student-workspace-item-header">
                  <div>
                    <strong>{item.subject || "No subject"}</strong>
                    <span>{sentByTeacher ? "You" : studentName}</span>
                  </div>
                  <time>{formatMessageDateTime(item.created_at)}</time>
                </div>

                <p>{getPreview(item.message)}</p>

                {item.attachment_link && (
                  <a
                    href={item.attachment_link}
                    target="_blank"
                    rel="noreferrer"
                    className="student-workspace-link-button"
                  >
                    Open attachment
                  </a>
                )}
              </article>
            );
          })
        )}
      </div>
    </section>
  );
}
