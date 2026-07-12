"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import {
  getUnreadStudentAnnouncements,
  markAnnouncementAsRead,
} from "../../../lib/announcements";

type Props = {
  userId: string;
  studentLevel: string;
  classId: string;
};

function formatDate(value?: string | null) {
  if (!value) return "";

  return new Date(value).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function getPreview(content?: string | null) {
  if (!content) return "";

  return content.length > 180
    ? `${content.slice(0, 180).trim()}...`
    : content;
}

export default function StudentAnnouncementBanner({
  userId,
  studentLevel,
  classId,
}: Props) {
  const [announcements, setAnnouncements] = useState<any[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function loadAnnouncements() {
      if (!userId || !classId) return;

      setLoading(true);

      try {
        const data = await getUnreadStudentAnnouncements(
          userId,
          studentLevel,
          classId
        );
        setAnnouncements(data);
      } catch (error) {
        console.error("Unable to load unread announcements:", error);
      } finally {
        setLoading(false);
      }
    }

    loadAnnouncements();
  }, [userId, studentLevel, classId]);

  async function handleMarkAsRead() {
    const currentAnnouncement = announcements[0];

    if (!currentAnnouncement || !userId) return;

    setSaving(true);

    try {
      await markAnnouncementAsRead(currentAnnouncement.id, userId);
      setAnnouncements((current) => current.slice(1));
      setExpanded(false);
    } catch (error) {
      console.error("Unable to mark announcement as read:", error);
    } finally {
      setSaving(false);
    }
  }

  if (loading || announcements.length === 0) {
    return null;
  }

  const announcement = announcements[0];
  const remainingCount = announcements.length - 1;

  return (
    <section
      style={{
        background: "#ffffff",
        border: "1px solid #dbe6fb",
        borderLeft: "6px solid #1f3c88",
        borderRadius: "14px",
        padding: "22px",
        marginBottom: "24px",
        boxShadow: "0 8px 24px rgba(31,60,136,0.08)",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: "18px",
          alignItems: "flex-start",
        }}
      >
        <div style={{ flex: 1 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "10px",
              marginBottom: "10px",
            }}
          >
            <h2
              style={{
                color: "#1f3c88",
                margin: 0,
                fontSize: "20px",
              }}
            >
              New Announcement
            </h2>

            <span
              style={{
                background: "#eaf0fb",
                color: "#1f3c88",
                borderRadius: "999px",
                padding: "4px 10px",
                fontSize: "12px",
                fontWeight: 800,
              }}
            >
              New
            </span>
          </div>

          <h3
            style={{
              color: "#333",
              margin: "0 0 8px",
              fontSize: "18px",
            }}
          >
            {announcement.title || "Announcement"}
          </h3>

          <p
            style={{
              color: "#555",
              lineHeight: 1.55,
              margin: "0 0 10px",
              whiteSpace: "pre-line",
            }}
          >
            {expanded
              ? announcement.content || ""
              : getPreview(announcement.content)}
          </p>

          {announcement.created_at && (
            <div
              style={{
                color: "#667085",
                fontSize: "13px",
                fontWeight: 600,
              }}
            >
              Posted {formatDate(announcement.created_at)}
            </div>
          )}

          {remainingCount > 0 && (
            <div
              style={{
                color: "#667085",
                fontSize: "13px",
                marginTop: "8px",
              }}
            >
              {remainingCount} more unread announcement
              {remainingCount === 1 ? "" : "s"}
            </div>
          )}
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "10px",
            alignItems: "flex-end",
          }}
        >
          {!expanded && (
            <button
              type="button"
              onClick={() => setExpanded(true)}
              style={{
                background: "#1f3c88",
                color: "#ffffff",
                border: "none",
                borderRadius: "8px",
                padding: "10px 14px",
                cursor: "pointer",
                fontWeight: 800,
                whiteSpace: "nowrap",
              }}
            >
              Read Announcement
            </button>
          )}

          {expanded && (
            <button
              type="button"
              disabled={saving}
              onClick={handleMarkAsRead}
              style={{
                background: "#1f3c88",
                color: "#ffffff",
                border: "none",
                borderRadius: "8px",
                padding: "10px 14px",
                cursor: saving ? "not-allowed" : "pointer",
                fontWeight: 800,
                whiteSpace: "nowrap",
              }}
            >
              {saving ? "Saving..." : "Mark as Read"}
            </button>
          )}

          <Link
            href="/student/announcements"
            style={{
              color: "#1f3c88",
              fontWeight: 800,
              textDecoration: "none",
              fontSize: "14px",
              whiteSpace: "nowrap",
            }}
          >
            View All Announcements →
          </Link>
        </div>
      </div>
    </section>
  );
}
