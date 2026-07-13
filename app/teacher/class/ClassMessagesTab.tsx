"use client";

import { useEffect, useState } from "react";

import {
  formatMessageDateTime,
  getTeacherSentMessagesForClass,
  sendMessage,
} from "../../../lib/messages";

type Props = {
  students: any[];
  teacherId: string;
};

const inputStyle = {
  width: "100%",
  padding: "10px",
  border: "1px solid #ccc",
  borderRadius: "8px",
  color: "#333",
  background: "#fff",
  boxSizing: "border-box" as const,
};

function getPreview(message: string) {
  if (!message) return "";

  return message.length > 120
    ? `${message.slice(0, 120)}...`
    : message;
}

export default function ClassMessagesTab({
  students,
  teacherId,
}: Props) {
  const [selectedStudentId, setSelectedStudentId] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [attachmentLink, setAttachmentLink] = useState("");
  const [sentMessages, setSentMessages] = useState<any[]>([]);
  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [sending, setSending] = useState(false);

  function getStudentName(studentId: string) {
    const student = students.find((item) => item.id === studentId);

    if (!student) return "Unknown Student";

    return `${student.first_name || ""} ${
      student.last_name || ""
    }`.trim();
  }

  async function loadSentMessages() {
    if (!teacherId || students.length === 0) {
      setSentMessages([]);
      return;
    }

    try {
      const data = await getTeacherSentMessagesForClass(
        teacherId,
        students.map((student) => student.id)
      );
      setSentMessages(data);
    } catch (error) {
      console.error("Unable to load sent messages:", error);
      setErrorMessage("Unable to load sent messages.");
    }
  }

  useEffect(() => {
    loadSentMessages();
  }, [teacherId, students]);

  async function handleSendMessage() {
    setStatusMessage("");
    setErrorMessage("");

    if (!selectedStudentId) {
      setErrorMessage("Please select a student.");
      return;
    }

    const selectedStudent = students.find(
      (student) => student.id === selectedStudentId
    );

    if (!selectedStudent) {
      setErrorMessage("Selected student is not in this class.");
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

    if (!teacherId) {
      setErrorMessage("Unable to identify the logged-in teacher.");
      return;
    }

    setSending(true);

    try {
      await sendMessage({
        sender_id: teacherId,
        receiver_id: selectedStudentId,
        subject: subject.trim(),
        message: message.trim(),
        attachment_link: attachmentLink.trim() || null,
      });

      setSubject("");
      setMessage("");
      setAttachmentLink("");
      setStatusMessage("Message sent successfully.");
      await loadSentMessages();
    } catch (error) {
      console.error("Unable to send class message:", error);
      setErrorMessage("Unable to send message.");
    } finally {
      setSending(false);
    }
  }

  if (students.length === 0) {
    return (
      <div>
        <h3>Messages</h3>
        <p>No students found in this class.</p>
      </div>
    );
  }

  return (
    <div>
      <h3>Messages</h3>

      <p
        style={{
          color: "#555",
          maxWidth: "680px",
        }}
      >
        Send a message to a student in this class.
      </p>

      <div
        style={{
          background: "#ffffff",
          border: "1px solid #ddd",
          borderRadius: "10px",
          padding: "20px",
          maxWidth: "760px",
          marginBottom: "28px",
        }}
      >
        {statusMessage && (
          <p style={{ color: "#2e7d32", fontWeight: 600 }}>
            {statusMessage}
          </p>
        )}

        {errorMessage && (
          <p style={{ color: "#b00020", fontWeight: 600 }}>
            {errorMessage}
          </p>
        )}

        <label
          style={{
            display: "block",
            color: "#333",
            fontWeight: 600,
            marginBottom: "6px",
          }}
        >
          Student
        </label>

        <select
          value={selectedStudentId}
          onChange={(event) =>
            setSelectedStudentId(event.target.value)
          }
          style={{ ...inputStyle, marginBottom: "14px" }}
        >
          <option value="">Select Student</option>
          {students.map((student) => (
            <option key={student.id} value={student.id}>
              {student.first_name} {student.last_name}
            </option>
          ))}
        </select>

        <label
          style={{
            display: "block",
            color: "#333",
            fontWeight: 600,
            marginBottom: "6px",
          }}
        >
          Subject
        </label>

        <input
          value={subject}
          onChange={(event) => setSubject(event.target.value)}
          placeholder="Message subject"
          style={{ ...inputStyle, marginBottom: "14px" }}
        />

        <label
          style={{
            display: "block",
            color: "#333",
            fontWeight: 600,
            marginBottom: "6px",
          }}
        >
          Message
        </label>

        <textarea
          rows={6}
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          placeholder="Write your message..."
          style={{ ...inputStyle, marginBottom: "14px" }}
        />

        <label
          style={{
            display: "block",
            color: "#333",
            fontWeight: 600,
            marginBottom: "6px",
          }}
        >
          Attachment / resource link
        </label>

        <input
          value={attachmentLink}
          onChange={(event) => setAttachmentLink(event.target.value)}
          placeholder="Optional"
          style={{ ...inputStyle, marginBottom: "18px" }}
        />

        <button
          onClick={handleSendMessage}
          disabled={sending}
          style={{
            background: "#1f3c88",
            color: "#ffffff",
            border: "none",
            borderRadius: "8px",
            padding: "12px 20px",
            cursor: sending ? "not-allowed" : "pointer",
            fontWeight: 600,
          }}
        >
          {sending ? "Sending..." : "Send Message"}
        </button>
      </div>

      <section>
        <h3>Sent Messages</h3>

        {sentMessages.length === 0 ? (
          <p>No sent messages yet.</p>
        ) : (
          <div style={{ display: "grid", gap: "12px" }}>
            {sentMessages.map((item) => (
              <div
                key={item.id}
                style={{
                  background: "#ffffff",
                  border: "1px solid #ddd",
                  borderRadius: "10px",
                  padding: "16px",
                  maxWidth: "760px",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: "12px",
                    marginBottom: "8px",
                  }}
                >
                  <strong style={{ color: "#1f3c88" }}>
                    {item.subject || "No subject"}
                  </strong>

                  <span style={{ color: "#667085", fontSize: "13px" }}>
                    {formatMessageDateTime(item.created_at)}
                  </span>
                </div>

                <p style={{ color: "#333", margin: "0 0 8px" }}>
                  To: {getStudentName(item.receiver_id)}
                </p>

                <p
                  style={{
                    color: "#555",
                    margin: 0,
                    lineHeight: 1.5,
                  }}
                >
                  {getPreview(item.message)}
                </p>

                {item.attachment_link && (
                  <a
                    href={item.attachment_link}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      display: "inline-block",
                      color: "#1f3c88",
                      fontWeight: 700,
                      marginTop: "10px",
                      textDecoration: "none",
                    }}
                  >
                    Open attachment
                  </a>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
