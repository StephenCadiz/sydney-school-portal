"use client";

import { useCallback, useEffect, useState } from "react";

import { formatMessageDateTime } from "../../../lib/messages";
import {
  getTeacherStudentMessages,
  hideTeacherStudentMessage,
  markTeacherStudentMessageAsRead,
  replyToTeacherStudentMessage,
  type TeacherStudentMessage,
} from "../../../lib/teacherStudentMessages";

type TeacherStudentMessagesInboxProps = {
  onUnreadCountChange: (count: number) => void;
};

const TEACHER_MESSAGES_CHANGED_EVENT = "teacher-unread-messages-changed";

function previewText(value: string) {
  return value.length > 120 ? `${value.slice(0, 120)}...` : value;
}

function getReplySubject(subject: string) {
  if (!subject) return "Re: Message";

  return subject.toLowerCase().startsWith("re:") ? subject : `Re: ${subject}`;
}

function classDetails(message: TeacherStudentMessage) {
  return [message.class_name, message.level_name, message.course_type]
    .filter(Boolean)
    .join(" · ");
}

export default function TeacherStudentMessagesInbox({
  onUnreadCountChange,
}: TeacherStudentMessagesInboxProps) {
  const [messages, setMessages] = useState<TeacherStudentMessage[]>([]);
  const [selectedMessage, setSelectedMessage] =
    useState<TeacherStudentMessage | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [replyMessage, setReplyMessage] = useState("");
  const [attachmentLink, setAttachmentLink] = useState("");
  const [sending, setSending] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const updateUnreadCount = useCallback(
    (currentMessages: TeacherStudentMessage[]) => {
      onUnreadCountChange(
        currentMessages.filter((message) => !message.read_at).length
      );
    },
    [onUnreadCountChange]
  );

  const loadMessages = useCallback(async () => {
    setLoading(true);
    setErrorMessage("");

    try {
      const payload = await getTeacherStudentMessages();
      setMessages(payload.messages);
      onUnreadCountChange(payload.unread_count);

      setSelectedMessage((currentSelectedMessage) => {
        if (!currentSelectedMessage) return null;

        return (
          payload.messages.find(
            (message) => message.id === currentSelectedMessage.id
          ) || null
        );
      });
    } catch (error: any) {
      console.error("Unable to load teacher student messages:", error);
      setErrorMessage(error?.message || "Unable to load student messages.");
    } finally {
      setLoading(false);
    }
  }, [onUnreadCountChange]);

  useEffect(() => {
    void loadMessages();
  }, [loadMessages]);

  async function openMessage(item: TeacherStudentMessage) {
    setSelectedMessage(item);
    setReplyMessage("");
    setAttachmentLink("");
    setStatusMessage("");
    setErrorMessage("");

    if (item.read_at) return;

    try {
      const updatedMessage = await markTeacherStudentMessageAsRead(item.id);
      const nextMessages = messages.map((message) =>
        message.id === item.id ? updatedMessage : message
      );

      setMessages(nextMessages);
      setSelectedMessage(updatedMessage);
      updateUnreadCount(nextMessages);
      window.dispatchEvent(new Event(TEACHER_MESSAGES_CHANGED_EVENT));
    } catch (error: any) {
      console.error("Unable to mark student message as read:", error);
      setErrorMessage(
        error?.message || "Unable to mark this student message as read."
      );
    }
  }

  async function handleReply() {
    if (!selectedMessage) return;

    setStatusMessage("");
    setErrorMessage("");

    if (!replyMessage.trim()) {
      setErrorMessage("Please enter a reply message.");
      return;
    }

    setSending(true);

    try {
      await replyToTeacherStudentMessage({
        studentId: selectedMessage.sender_id,
        subject: getReplySubject(selectedMessage.subject),
        message: replyMessage.trim(),
        attachmentLink: attachmentLink.trim() || null,
      });
      setReplyMessage("");
      setAttachmentLink("");
      setStatusMessage("Reply sent successfully.");
    } catch (error: any) {
      console.error("Unable to send student reply:", error);
      setErrorMessage(error?.message || "Unable to send reply.");
    } finally {
      setSending(false);
    }
  }

  async function handleHide() {
    if (!selectedMessage || !selectedMessage.read_at) {
      setErrorMessage("Open this message before removing it from your inbox.");
      return;
    }

    const confirmed = window.confirm(
      "Remove this message from your Inbox? It will only be hidden from your view. The student will still keep their Sent copy."
    );
    if (!confirmed) return;

    setStatusMessage("");
    setErrorMessage("");
    setDeleting(true);

    try {
      await hideTeacherStudentMessage(selectedMessage.id);
      const nextMessages = messages.filter(
        (message) => message.id !== selectedMessage.id
      );
      setMessages(nextMessages);
      setSelectedMessage(null);
      updateUnreadCount(nextMessages);
      setStatusMessage("Message removed from your Inbox.");
      window.dispatchEvent(new Event(TEACHER_MESSAGES_CHANGED_EVENT));
    } catch (error: any) {
      console.error("Unable to remove student message:", error);
      setErrorMessage(error?.message || "Unable to remove message from Inbox.");
    } finally {
      setDeleting(false);
    }
  }

  if (loading) {
    return (
      <section className="teacher-student-messages teacher-student-messages-state">
        Loading student messages...
      </section>
    );
  }

  if (selectedMessage) {
    return (
      <section className="teacher-student-messages teacher-student-messages-detail">
        <button
          type="button"
          className="teacher-student-messages-back"
          onClick={() => {
            setSelectedMessage(null);
            setReplyMessage("");
            setAttachmentLink("");
            setStatusMessage("");
            setErrorMessage("");
          }}
        >
          ← Back to student messages
        </button>

        <div className="teacher-student-messages-detail-header">
          <div>
            <p className="teacher-student-messages-eyebrow">From</p>
            <h2>{selectedMessage.sender_name}</h2>
            <p className="teacher-student-messages-class">
              {classDetails(selectedMessage)}
            </p>
          </div>
          <time dateTime={selectedMessage.created_at || undefined}>
            {formatMessageDateTime(selectedMessage.created_at)}
          </time>
        </div>

        <h3 className="teacher-student-messages-subject">
          {selectedMessage.subject || "No subject"}
        </h3>
        <p className="teacher-student-messages-body">{selectedMessage.message}</p>

        {selectedMessage.attachment_link && (
          <a
            className="teacher-student-messages-attachment"
            href={selectedMessage.attachment_link}
            target="_blank"
            rel="noopener noreferrer"
          >
            Open attachment
          </a>
        )}

        {selectedMessage.read_at && (
          <button
            type="button"
            className="teacher-student-messages-delete"
            onClick={handleHide}
            disabled={deleting}
          >
            {deleting ? "Removing..." : "Delete from Inbox"}
          </button>
        )}

        <div className="teacher-student-messages-reply">
          <h3>Reply</h3>

          {statusMessage && (
            <p className="teacher-student-messages-success" role="status">
              {statusMessage}
            </p>
          )}
          {errorMessage && (
            <p className="teacher-student-messages-error" role="alert">
              {errorMessage}
            </p>
          )}

          <label htmlFor="teacher-student-message-reply">Message</label>
          <textarea
            id="teacher-student-message-reply"
            className="teacher-student-messages-input"
            value={replyMessage}
            onChange={(event) => setReplyMessage(event.target.value)}
            placeholder="Write your reply..."
            rows={5}
          />

          <label htmlFor="teacher-student-message-attachment">
            Attachment or resource link
          </label>
          <input
            id="teacher-student-message-attachment"
            className="teacher-student-messages-input"
            value={attachmentLink}
            onChange={(event) => setAttachmentLink(event.target.value)}
          />

          <button
            type="button"
            className="teacher-student-messages-send"
            onClick={handleReply}
            disabled={sending}
          >
            {sending ? "Sending..." : "Send Reply"}
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="teacher-student-messages teacher-student-messages-list">
      {errorMessage && (
        <p className="teacher-student-messages-error" role="alert">
          {errorMessage}
        </p>
      )}
      {statusMessage && (
        <p className="teacher-student-messages-success" role="status">
          {statusMessage}
        </p>
      )}

      {!errorMessage && messages.length === 0 && (
        <div className="teacher-student-messages-empty">
          No student messages in your inbox yet.
        </div>
      )}

      {!errorMessage &&
        messages.map((message) => (
          <div
            className={`teacher-student-messages-row${
              !message.read_at ? " is-unread" : ""
            }`}
            key={message.id}
          >
            <button
              type="button"
              className="teacher-student-messages-row-open"
              onClick={() => void openMessage(message)}
            >
              <div className="teacher-student-messages-row-content">
                <div className="teacher-student-messages-row-meta">
                  {!message.read_at && <span>New</span>}
                  <strong>From: {message.sender_name}</strong>
                </div>
                <p className="teacher-student-messages-row-class">
                  {classDetails(message)}
                </p>
                <p className="teacher-student-messages-row-subject">
                  {message.subject || "No subject"}
                </p>
                <p className="teacher-student-messages-row-preview">
                  {previewText(message.message)}
                </p>
              </div>
            </button>
            <div className="teacher-student-messages-row-actions">
              {message.attachment_link && (
                <a
                  href={message.attachment_link}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Open attachment
                </a>
              )}
              <time dateTime={message.created_at || undefined}>
                {formatMessageDateTime(message.created_at)}
              </time>
            </div>
          </div>
        ))}
    </section>
  );
}
