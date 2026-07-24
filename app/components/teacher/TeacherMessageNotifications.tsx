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
    <section className="teacher-dashboard-section teacher-dashboard-messages">
      <div className="teacher-dashboard-section-title">
        <div>
          <h2>Messages</h2>
          <p>{messages.length} unread staff message{messages.length === 1 ? "" : "s"}</p>
        </div>

        <Link
          href="/teacher/messages"
          className="teacher-dashboard-section-link"
        >
          Open Messages
        </Link>
      </div>

      <div className="teacher-dashboard-message-list">
        {latestMessages.map((message) => (
          <Link
            href="/teacher/messages"
            key={message.id}
            className="teacher-dashboard-message-row"
          >
            <div>
              <strong>{message.subject || "No subject"}</strong>
              <span>{getSenderName(message)} · {formatMessageDateTime(message.created_at)}</span>
              <p>{previewText(message.message)}</p>
            </div>
            <span aria-hidden="true">›</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
