"use client";

import { useCallback, useEffect, useState } from "react";
import { Inbox } from "lucide-react";
import MessageAttachmentPicker from "../../components/messages/MessageAttachmentPicker";
import MessageAttachments from "../../components/messages/MessageAttachments";
import {
  cleanupMessageAttachments,
  uploadMessageAttachments,
  type MessageAttachment,
} from "../../../lib/messageAttachments";

import { formatMessageDateTime, getMessageThread } from "../../../lib/messages";
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
  const [inboxMessages, setInboxMessages] = useState<TeacherStudentMessage[]>([]);
  const [sentMessages, setSentMessages] = useState<TeacherStudentMessage[]>([]);
  const [activeFolder, setActiveFolder] = useState<"Inbox" | "Sent">("Inbox");
  const [selectedMessage, setSelectedMessage] =
    useState<TeacherStudentMessage | null>(null);
  const [selectedFolder, setSelectedFolder] = useState<"Inbox" | "Sent">("Inbox");
  const [threadMessages, setThreadMessages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [replyMessage, setReplyMessage] = useState("");
  const [attachmentLink, setAttachmentLink] = useState("");
  const [attachmentFiles, setAttachmentFiles] = useState<File[]>([]);
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
      const nextInbox = payload.inbox || payload.messages || [];
      const nextSent = payload.sent || [];
      setInboxMessages(nextInbox);
      setSentMessages(nextSent);
      onUnreadCountChange(payload.unread_count);

      setSelectedMessage((currentSelectedMessage) => {
        if (!currentSelectedMessage) return null;

        return (
          [...nextInbox, ...nextSent].find(
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

  async function openMessage(item: TeacherStudentMessage, folder: "Inbox" | "Sent") {
    setSelectedMessage(item);
    setSelectedFolder(folder);
    setThreadMessages([item]);
    setReplyMessage("");
    setAttachmentLink("");
    setAttachmentFiles([]);
    setStatusMessage("");
    setErrorMessage("");

    void getMessageThread(String(item.id))
      .then((thread) => setThreadMessages(thread.messages))
      .catch((error) => console.error("Unable to load student message history:", error));

    if (folder === "Sent" || item.read_at) return;

    try {
      const updatedMessage = await markTeacherStudentMessageAsRead(item.id);
      const nextMessages = inboxMessages.map((message) =>
        message.id === item.id ? updatedMessage : message
      );

      setInboxMessages(nextMessages);
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

    let uploadedAttachments: MessageAttachment[] = [];
    try {
      if (attachmentFiles.length) setStatusMessage("Uploading attachments...");
      uploadedAttachments = await uploadMessageAttachments(attachmentFiles);
      await replyToTeacherStudentMessage({
        studentId: selectedMessage.sender_id,
        messageId: selectedMessage.id,
        subject: getReplySubject(selectedMessage.subject),
        message: replyMessage.trim(),
        attachmentLink: attachmentLink.trim() || null,
        attachments: uploadedAttachments,
      });
      setReplyMessage("");
      setAttachmentLink("");
      setAttachmentFiles([]);
      setStatusMessage("Reply sent successfully.");
      await loadMessages();
      const thread = await getMessageThread(String(selectedMessage.id));
      setThreadMessages(thread.messages);
    } catch (error: any) {
      if (uploadedAttachments.length) await cleanupMessageAttachments(uploadedAttachments);
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
      const nextMessages = inboxMessages.filter(
        (message) => message.id !== selectedMessage.id
      );
      setInboxMessages(nextMessages);
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
    const isInboxMessage = selectedFolder === "Inbox";
    return (
      <section className="teacher-student-messages teacher-student-messages-detail">
        <button
          type="button"
          className="teacher-student-messages-back"
          onClick={() => {
            setSelectedMessage(null);
            setThreadMessages([]);
            setReplyMessage("");
            setAttachmentLink("");
            setStatusMessage("");
            setErrorMessage("");
          }}
        >
          ← Back to student {isInboxMessage ? "Inbox" : "Sent"}
        </button>

        <div className="teacher-student-messages-detail-header">
          <div>
            <p className="teacher-student-messages-eyebrow">{isInboxMessage ? "From" : "To"}</p>
            <h2>{isInboxMessage ? selectedMessage.sender_name : selectedMessage.receiver_name}</h2>
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
        <div className="teacher-student-messages-thread" aria-label="Full student message history">
          {(threadMessages.length ? threadMessages : [selectedMessage]).map((threadMessage) => (
            <article className="teacher-student-messages-thread-message" key={threadMessage.id}>
              <div className="teacher-student-messages-thread-meta">
                <strong>{threadMessage.sender_name || "User"}</strong>
                <time dateTime={threadMessage.created_at || undefined}>{formatMessageDateTime(threadMessage.created_at)}</time>
              </div>
              <p className="teacher-student-messages-body">{threadMessage.message}</p>
              {threadMessage.attachment_link && (
                <a className="teacher-student-messages-attachment" href={threadMessage.attachment_link} target="_blank" rel="noopener noreferrer">
                  Open attachment
                </a>
              )}
              <MessageAttachments messageId={String(threadMessage.id)} attachments={threadMessage.attachments} />
            </article>
          ))}
        </div>

        {isInboxMessage && selectedMessage.read_at && (
          <button
            type="button"
            className="teacher-student-messages-delete"
            onClick={handleHide}
            disabled={deleting}
          >
            {deleting ? "Removing..." : "Delete from Inbox"}
          </button>
        )}

        {isInboxMessage && <div className="teacher-student-messages-reply">
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
          <MessageAttachmentPicker files={attachmentFiles} onChange={setAttachmentFiles} disabled={sending} />

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
        </div>}
      </section>
    );
  }

  const isSentFolder = activeFolder === "Sent";
  const visibleMessages = isSentFolder ? sentMessages : inboxMessages;

  return (
    <section className="teacher-student-messages teacher-student-messages-list">
      <nav className="teacher-student-messages-primary-nav" aria-label="Student message folders">
        {(["Inbox", "Sent"] as const).map((folder) => (
          <button
            key={folder}
            type="button"
            className={activeFolder === folder ? "is-active" : ""}
            onClick={() => {
              setActiveFolder(folder);
              setSelectedMessage(null);
              setThreadMessages([]);
              setStatusMessage("");
              setErrorMessage("");
            }}
          >
            {folder}
            {folder === "Inbox" && inboxMessages.some((message) => !message.read_at) && (
              <span className="teacher-student-messages-unread-count">
                {inboxMessages.filter((message) => !message.read_at).length}
              </span>
            )}
          </button>
        ))}
      </nav>
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

      {!errorMessage && visibleMessages.length === 0 && (
        <div className="teacher-student-messages-empty">
          <span className="teacher-student-messages-empty-icon" aria-hidden="true">
            <Inbox size={25} strokeWidth={1.8} />
          </span>
          <h2>{activeFolder === "Inbox" ? "Your student inbox is clear" : "No sent student messages"}</h2>
          <p>{activeFolder === "Inbox" ? "New student messages will appear here." : "Replies you send to students will appear here."}</p>
        </div>
      )}

      {!errorMessage &&
        visibleMessages.map((message) => (
          <div
            className={`teacher-student-messages-row${
              !isSentFolder && !message.read_at ? " is-unread" : ""
            }`}
            key={message.id}
          >
            <button
              type="button"
              className="teacher-student-messages-row-open"
              onClick={() => void openMessage(message, activeFolder)}
            >
              <div className="teacher-student-messages-row-content">
                <div className="teacher-student-messages-row-meta">
                  {!isSentFolder && !message.read_at && <span>New</span>}
                  <strong>{isSentFolder ? "To" : "From"}: {isSentFolder ? message.receiver_name : message.sender_name}</strong>
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
                {Array.isArray(message.attachments) && message.attachments.length > 0 && (
                  <span className="teacher-student-messages-row-attachments">
                    {message.attachments.length} attachment{message.attachments.length === 1 ? "" : "s"}
                  </span>
                )}
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
