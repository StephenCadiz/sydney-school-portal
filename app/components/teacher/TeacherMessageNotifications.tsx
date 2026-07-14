"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useMessageRealtimeRefresh } from "../../hooks/useMessageRealtimeRefresh";
import {
  formatMessageDateTime,
  getUnreadTeacherStaffMessages,
} from "../../../lib/messages";

type TeacherMessageNotificationsProps = {
  teacherId: string;
};

const TEACHER_MESSAGES_CHANGED_EVENT = "teacher-unread-messages-changed";

function previewText(value?: string | null) {
  if (!value) return "";

  return value.length > 90 ? `${value.slice(0, 90)}...` : value;
}

function getSenderName(message: any) {
  if (message.sender_role === "admin") {
    return message.sender_name || "Admin";
  }

  return message.sender_name || "Unknown sender";
}

export default function TeacherMessageNotifications({
  teacherId,
}: TeacherMessageNotificationsProps) {
  const [messages, setMessages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const mountedRef = useRef(false);
  const loadedRef = useRef(false);
  const loadErrorLoggedRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
    };
  }, []);

  const loadUnreadMessages = useCallback(async () => {
    if (!teacherId) return;

    if (!loadedRef.current) {
      setLoading(true);
    }

    try {
      const data = await getUnreadTeacherStaffMessages(teacherId);

      if (mountedRef.current) {
        setMessages(data);
        loadedRef.current = true;
        loadErrorLoggedRef.current = false;
      }
    } catch (error) {
      if (!loadErrorLoggedRef.current) {
        loadErrorLoggedRef.current = true;
        console.error("Unable to load unread teacher messages:", error);
      }
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  }, [teacherId]);

  useMessageRealtimeRefresh({
    onRefresh: loadUnreadMessages,
    enabled: Boolean(teacherId),
    intervalMs: 60000,
    customEventName: TEACHER_MESSAGES_CHANGED_EVENT,
    channelName: "teacher-dashboard-messages",
  });

  if (loading || messages.length === 0) {
    return null;
  }

  const latestMessages = messages.slice(0, 3);

  return (
    <section
      style={{
        background: "#ffffff",
        border: "1px solid #dbe3f0",
        borderRadius: "12px",
        padding: "18px",
        marginBottom: "18px",
        boxShadow: "0 8px 22px rgba(31, 60, 136, 0.08)",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: "16px",
          alignItems: "flex-start",
          marginBottom: "14px",
        }}
      >
        <div>
          <h2
            style={{
              color: "#1f3c88",
              fontSize: "18px",
              margin: "0 0 4px",
            }}
          >
            Messages
          </h2>
          <p style={{ color: "#5f6f89", margin: 0, fontSize: "14px" }}>
            {messages.length} unread message{messages.length === 1 ? "" : "s"}
          </p>
        </div>

        <Link
          href="/teacher/messages"
          style={{
            color: "#1f3c88",
            fontWeight: 700,
            textDecoration: "none",
            fontSize: "14px",
            whiteSpace: "nowrap",
          }}
        >
          Open Messages →
        </Link>
      </div>

      <div style={{ display: "grid", gap: "10px" }}>
        {latestMessages.map((message) => (
          <Link
            href="/teacher/messages"
            key={message.id}
            style={{
              display: "block",
              border: "1px solid #edf1f7",
              borderRadius: "10px",
              padding: "12px",
              background: "#f8fafd",
              textDecoration: "none",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: "12px",
                marginBottom: "4px",
              }}
            >
              <strong style={{ color: "#1f3c88", fontSize: "14px" }}>
                {getSenderName(message)}
              </strong>
              <span style={{ color: "#718096", fontSize: "12px" }}>
                {formatMessageDateTime(message.created_at)}
              </span>
            </div>
            <div style={{ color: "#334155", fontWeight: 700, fontSize: "14px" }}>
              {message.subject || "No subject"}
            </div>
            <p style={{ color: "#475569", fontSize: "13px", margin: "6px 0 0" }}>
              {previewText(message.message)}
            </p>
          </Link>
        ))}
      </div>
    </section>
  );
}
