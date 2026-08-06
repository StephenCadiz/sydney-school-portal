"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import TeacherLayout from "../../components/layout/TeacherLayout";
import { useMessageRealtimeRefresh } from "../../hooks/useMessageRealtimeRefresh";
import { useStaffMessageSoundPreference } from "../../hooks/useStaffMessageNotifications";
import { ChevronRight, Inbox, PenLine, Volume2, VolumeX } from "lucide-react";
import { supabase } from "../../../lib/supabase";
import {
  formatMessageDateTime,
  getTeacherStaffInboxMessages,
  getTeacherStaffRecipients,
  getTeacherStaffSentMessages,
  hideTeacherReceivedStaffMessage,
  hideTeacherSentStaffMessage,
  markTeacherStaffMessageAsRead,
  sendTeacherStaffMessage,
  TEACHER_ADMIN_RECIPIENT_VALUE,
} from "../../../lib/messages";
import TeacherStudentMessagesInbox from "./TeacherStudentMessagesInbox";
import { getTeacherStudentMessages } from "../../../lib/teacherStudentMessages";

const tabs = ["Inbox", "Sent"];
const TEACHER_MESSAGES_CHANGED_EVENT = "teacher-unread-messages-changed";

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
      type="button"
      onClick={onClick}
      className={`teacher-messages-row${unread ? " is-unread" : ""}`}
    >
      <span className="teacher-messages-row-content">
        <span className="teacher-messages-row-meta">
            {unread && (
              <span className="teacher-messages-unread-dot" aria-label="Unread" />
            )}
            <strong>
              {type === "inbox" ? "From" : "To"}: {getMessageName(item, type)}
            </strong>
            <span>
              {roleLabel(getMessageRole(item, type))}
            </span>
        </span>
          <span className="teacher-messages-row-subject">
            {item.subject || "No subject"}
          </span>
          <span className="teacher-messages-row-preview">
            {previewText(item.message)}
          </span>
      </span>
      <span className="teacher-messages-row-trailing">
        <time dateTime={item.created_at || undefined}>
          {formatMessageDateTime(item.created_at)}
        </time>
        <ChevronRight size={18} aria-hidden="true" />
      </span>
    </button>
  );
}

export default function TeacherMessagesPage() {
  const router = useRouter();
  const mountedRef = useRef(false);
  const messagesRequestRef = useRef(0);
  const selectedMessageRef = useRef<any | null>(null);

  const [teacherId, setTeacherId] = useState("");
  const [messageArea, setMessageArea] = useState<"staff" | "students">(
    "staff"
  );
  const [studentUnreadCount, setStudentUnreadCount] = useState(0);
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
  const { soundEnabled, setSoundEnabled } =
    useStaffMessageSoundPreference();

  const hasStaffRecipients =
    recipients.admins.length > 0 || recipients.teachers.length > 0;

  const loadMessages = useCallback(async (currentTeacherId: string) => {
    if (!currentTeacherId) return;

    const requestId = messagesRequestRef.current + 1;
    messagesRequestRef.current = requestId;

    const [inboxData, sentData] = await Promise.all([
      getTeacherStaffInboxMessages(currentTeacherId),
      getTeacherStaffSentMessages(currentTeacherId),
    ]);

    if (!mountedRef.current || requestId !== messagesRequestRef.current) {
      return;
    }

    setInboxMessages(inboxData);
    setSentMessages(sentData);

    const currentSelectedMessage = selectedMessageRef.current;

    if (currentSelectedMessage) {
      const refreshedMessage = [...inboxData, ...sentData].find(
        (item) => item.id === currentSelectedMessage.id
      );

      selectedMessageRef.current = refreshedMessage || null;
      setSelectedMessage(refreshedMessage || null);
    }
  }, []);

  const loadStaffMessages = useCallback(async (currentTeacherId: string) => {
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
  }, [loadMessages]);

  const loadStudentUnreadCount = useCallback(async () => {
    try {
      const payload = await getTeacherStudentMessages();
      if (!mountedRef.current) return;
      setStudentUnreadCount(payload.unread_count);
    } catch (error) {
      console.error("Unable to load teacher student message count:", error);
    }
  }, []);

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

        if (profile?.role !== "teacher") {
          router.push("/login");
          return;
        }

        if (!mountedRef.current) return;

        setTeacherId(session.user.id);
        void loadStaffMessages(session.user.id);
        void loadRecipients(session.user.id);
        void loadStudentUnreadCount();
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
      messagesRequestRef.current += 1;
    };
  }, [router, loadStaffMessages, loadStudentUnreadCount]);

  const refreshTeacherMessages = useCallback(async () => {
    if (!teacherId) return;

    await Promise.all([loadMessages(teacherId), loadStudentUnreadCount()]);
  }, [teacherId, loadMessages, loadStudentUnreadCount]);

  useMessageRealtimeRefresh({
    onRefresh: refreshTeacherMessages,
    enabled: Boolean(teacherId),
    intervalMs: 60000,
    customEventName: TEACHER_MESSAGES_CHANGED_EVENT,
    channelName: "teacher-messages-page",
  });

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
        window.dispatchEvent(new Event(TEACHER_MESSAGES_CHANGED_EVENT));
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
      window.dispatchEvent(new Event(TEACHER_MESSAGES_CHANGED_EVENT));
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
      window.dispatchEvent(new Event(TEACHER_MESSAGES_CHANGED_EVENT));
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
      window.dispatchEvent(new Event(TEACHER_MESSAGES_CHANGED_EVENT));
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
      window.dispatchEvent(new Event(TEACHER_MESSAGES_CHANGED_EVENT));
    } catch (error: any) {
      console.error("Unable to remove sent message:", error);
      setErrorMessage("Unable to remove message from Sent.");
    } finally {
      setDeletingMessageId("");
    }
  }

  function renderEmptyState(type: "Inbox" | "Sent") {
    const inbox = type === "Inbox";
    return (
      <div className="teacher-messages-empty-state">
        <span className="teacher-messages-empty-icon" aria-hidden="true">
          <Inbox size={25} strokeWidth={1.8} />
        </span>
        <h2>{inbox ? "Your inbox is clear" : "No sent messages"}</h2>
        <p>
          {inbox
            ? "New staff messages will appear here."
            : "Messages you send will appear here."}
        </p>
        {inbox && (
          <button
            type="button"
            className="teacher-messages-empty-action"
            onClick={() => setActiveTab("New Message")}
          >
            Write a message
          </button>
        )}
      </div>
    );
  }

  return (
    <TeacherLayout>
      <div className="teacher-messages-page">
        <div className="teacher-messages-shell">
          <header className="teacher-messages-header">
            <div>
              <h1>Messages</h1>
              <p>Send and receive messages with administrators, teachers and students.</p>
            </div>
            <button
              type="button"
              className={`teacher-messages-sound-toggle ${
                soundEnabled ? "is-on" : "is-off"
              }`}
              aria-pressed={soundEnabled}
              aria-label={`Turn message sounds ${soundEnabled ? "off" : "on"}`}
              onClick={() => setSoundEnabled(!soundEnabled)}
            >
              {soundEnabled ? <Volume2 size={16} aria-hidden="true" /> : <VolumeX size={16} aria-hidden="true" />}
              <span>Sounds {soundEnabled ? "on" : "off"}</span>
            </button>
          </header>

          <nav className="teacher-messages-area-tabs" aria-label="Message areas">
            <button type="button" className={messageArea === "staff" ? "is-active" : ""} onClick={() => setMessageArea("staff")}>
              Staff Messages
            </button>
            <button type="button" className={messageArea === "students" ? "is-active" : ""} onClick={() => setMessageArea("students")}>
              Student Messages
              {studentUnreadCount > 0 && <span>{studentUnreadCount}</span>}
            </button>
          </nav>

          {messageArea === "staff" && (
            <div className="teacher-messages-toolbar">
              <div className="teacher-messages-folder-tabs" aria-label="Staff message folders">
                {tabs.map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    className={activeTab === tab ? "is-active" : ""}
                    onClick={() => {
                      setActiveTab(tab);
                      setSelectedMessage(null);
                      setStatusMessage("");
                      setErrorMessage("");
                    }}
                  >
                    {tab}
                  </button>
                ))}
              </div>
              <button
                type="button"
                className="teacher-messages-new-button"
                onClick={() => {
                  setActiveTab("New Message");
                  setSelectedMessage(null);
                  setStatusMessage("");
                  setErrorMessage("");
                }}
              >
                <PenLine size={16} aria-hidden="true" />
                New Message
              </button>
            </div>
          )}

          <section className="teacher-messages-content-panel">
            {messageArea === "students" && (
              <TeacherStudentMessagesInbox onUnreadCountChange={setStudentUnreadCount} />
            )}

            {messageArea === "staff" && (
              <>
                {loading && <p className="teacher-messages-loading">Loading messages...</p>}
                {!loading && errorMessage && !selectedMessage && <p className="teacher-messages-notice is-error" role="alert">{errorMessage}</p>}
                {!loading && statusMessage && !selectedMessage && <p className="teacher-messages-notice is-success" role="status">{statusMessage}</p>}

                {!loading && activeTab === "Inbox" && selectedMessage && (
                  <article className="teacher-messages-detail">
                    <button type="button" className="teacher-messages-back" onClick={() => {
                      setSelectedMessage(null);
                      setReplyMessage("");
                      setStatusMessage("");
                      setErrorMessage("");
                    }}>
                      ← Back to inbox
                    </button>
                    <p className="teacher-messages-detail-eyebrow">From · {roleLabel(selectedMessage.sender_role)}</p>
                    <h2>{selectedMessage.subject || "No subject"}</h2>
                    <div className="teacher-messages-detail-meta">
                      <span>{selectedMessage.sender_name || "Staff member"}</span>
                      <time dateTime={selectedMessage.created_at || undefined}>{formatMessageDateTime(selectedMessage.created_at)}</time>
                    </div>
                    <p className="teacher-messages-detail-body">{selectedMessage.message}</p>
                    {selectedMessage.attachment_link && <a className="teacher-messages-attachment" href={selectedMessage.attachment_link} target="_blank" rel="noopener noreferrer">Open attachment</a>}
                    {selectedMessage.read_at && (
                      <button type="button" className="teacher-messages-delete" onClick={() => handleDeleteFromInbox(selectedMessage)} disabled={deletingMessageId === selectedMessage.id}>
                        {deletingMessageId === selectedMessage.id ? "Removing..." : "Delete from Inbox"}
                      </button>
                    )}
                    <div className="teacher-messages-reply">
                      <h3>Reply</h3>
                      {statusMessage && <p className="teacher-messages-notice is-success" role="status">{statusMessage}</p>}
                      {errorMessage && <p className="teacher-messages-notice is-error" role="alert">{errorMessage}</p>}
                      <label htmlFor="teacher-staff-message-reply">Message</label>
                      <textarea id="teacher-staff-message-reply" value={replyMessage} onChange={(event) => setReplyMessage(event.target.value)} placeholder="Write your reply..." rows={5} />
                      <button type="button" className="teacher-messages-primary-button" onClick={handleReply} disabled={sending}>{sending ? "Sending..." : "Send Reply"}</button>
                    </div>
                  </article>
                )}

                {!loading && activeTab === "Sent" && selectedMessage && (
                  <article className="teacher-messages-detail">
                    <button type="button" className="teacher-messages-back" onClick={() => {
                      setSelectedMessage(null);
                      setStatusMessage("");
                      setErrorMessage("");
                    }}>
                      ← Back to sent
                    </button>
                    <p className="teacher-messages-detail-eyebrow">To · {roleLabel(selectedMessage.receiver_role)}</p>
                    <h2>{selectedMessage.subject || "No subject"}</h2>
                    <div className="teacher-messages-detail-meta">
                      <span>{selectedMessage.receiver_name || "Staff member"}</span>
                      <time dateTime={selectedMessage.created_at || undefined}>{formatMessageDateTime(selectedMessage.created_at)}</time>
                    </div>
                    {statusMessage && <p className="teacher-messages-notice is-success" role="status">{statusMessage}</p>}
                    {errorMessage && <p className="teacher-messages-notice is-error" role="alert">{errorMessage}</p>}
                    <p className="teacher-messages-detail-body">{selectedMessage.message}</p>
                    {selectedMessage.attachment_link && <a className="teacher-messages-attachment" href={selectedMessage.attachment_link} target="_blank" rel="noopener noreferrer">Open attachment</a>}
                    <button type="button" className="teacher-messages-delete" onClick={() => handleDeleteFromSent(selectedMessage)} disabled={deletingMessageId === selectedMessage.id}>
                      {deletingMessageId === selectedMessage.id ? "Removing..." : "Delete from Sent"}
                    </button>
                  </article>
                )}

                {!loading && activeTab === "Inbox" && !selectedMessage && !errorMessage && (
                  inboxMessages.length === 0 ? renderEmptyState("Inbox") : inboxMessages.map((item) => <MessageRow key={item.id} item={item} type="inbox" onClick={() => openInboxMessage(item)} />)
                )}
                {!loading && activeTab === "Sent" && !selectedMessage && !errorMessage && (
                  sentMessages.length === 0 ? renderEmptyState("Sent") : sentMessages.map((item) => <MessageRow key={item.id} item={item} type="sent" onClick={() => openSentMessage(item)} />)
                )}

                {!loading && activeTab === "New Message" && (
                  <article className="teacher-messages-compose">
                    <div className="teacher-messages-compose-heading">
                      <h2>New Staff Message</h2>
                      <p>Send an email-style message to one admin user or teacher.</p>
                    </div>
                    {statusMessage && <p className="teacher-messages-notice is-success" role="status">{statusMessage}</p>}
                    {errorMessage && <p className="teacher-messages-notice is-error" role="alert">{errorMessage}</p>}
                    <div className="teacher-messages-compose-fields">
                      {recipientsLoading && <p className="teacher-messages-recipient-state">Loading staff recipients…</p>}
                      {!recipientsLoading && recipientsError && <p className="teacher-messages-notice is-error" role="alert">{recipientsError}</p>}
                      {!recipientsLoading && !recipientsError && recipientsLoaded && !hasStaffRecipients && <p className="teacher-messages-recipient-state">No other staff recipients are available.</p>}
                      {!recipientsLoading && !recipientsError && hasStaffRecipients && (
                        <label>
                          <span>Recipient</span>
                          <select value={receiverId} onChange={(event) => setReceiverId(event.target.value)}>
                            <option value="">Select staff member</option>
                            {recipients.admins.length > 0 && <optgroup label="Admin">{recipients.admins.map((admin) => <option key={admin.id} value={admin.id}>{getProfileName(admin)}</option>)}</optgroup>}
                            {recipients.teachers.length > 0 && <optgroup label="Teachers">{recipients.teachers.map((teacher) => <option key={teacher.id} value={teacher.id}>{getProfileName(teacher)}</option>)}</optgroup>}
                          </select>
                        </label>
                      )}
                      <label><span>Subject</span><input value={subject} onChange={(event) => setSubject(event.target.value)} /></label>
                      <label><span>Message</span><textarea value={message} onChange={(event) => setMessage(event.target.value)} rows={7} /></label>
                      <label><span>Attachment or resource link</span><input value={attachmentLink} onChange={(event) => setAttachmentLink(event.target.value)} /></label>
                      <div className="teacher-messages-compose-actions">
                        <button type="button" className="teacher-messages-primary-button" onClick={handleSend} disabled={sending || recipientsLoading || Boolean(recipientsError) || !hasStaffRecipients}>{sending ? "Sending..." : "Send Message"}</button>
                        <button type="button" className="teacher-messages-cancel-button" onClick={() => {
                          resetComposer();
                          setStatusMessage("");
                          setErrorMessage("");
                          setActiveTab("Inbox");
                        }}>Cancel</button>
                      </div>
                    </div>
                  </article>
                )}
              </>
            )}
          </section>
        </div>
      </div>
    </TeacherLayout>
  );
}
