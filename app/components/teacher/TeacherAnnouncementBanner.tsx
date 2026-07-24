"use client";

import { useEffect, useState } from "react";

import {
  getUnreadTeacherAnnouncements,
  markAnnouncementAsRead,
} from "../../../lib/announcements";

type Props = {
  teacherId: string;
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

export default function TeacherAnnouncementBanner({ teacherId }: Props) {
  const [announcements, setAnnouncements] = useState<any[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function loadAnnouncements() {
      if (!teacherId) return;

      setLoading(true);

      try {
        const data = await getUnreadTeacherAnnouncements(teacherId);
        setAnnouncements(data);
      } catch (error) {
        console.error("Unable to load staff announcements:", error);
      } finally {
        setLoading(false);
      }
    }

    loadAnnouncements();
  }, [teacherId]);

  async function handleMarkAsRead() {
    const currentAnnouncement = announcements[0];

    if (!currentAnnouncement || !teacherId) return;

    setSaving(true);

    try {
      await markAnnouncementAsRead(currentAnnouncement.id, teacherId);
      setAnnouncements((current) => current.slice(1));
      setExpanded(false);
    } catch (error) {
      console.error("Unable to mark staff announcement as read:", error);
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
    <section className="teacher-dashboard-section teacher-dashboard-announcement">
      <div className="teacher-dashboard-section-title">
        <h2>Announcements</h2>
        <span>New</span>
      </div>
      <div className="teacher-dashboard-announcement-content">
        <div>
          <h3>{announcement.title || "Announcement"}</h3>
          <p>
            {expanded
              ? announcement.content || ""
              : getPreview(announcement.content)}
          </p>

          {announcement.created_at && (
            <small>
              Posted {formatDate(announcement.created_at)}
            </small>
          )}

          {remainingCount > 0 && (
            <small>
              {remainingCount} more unread staff announcement
              {remainingCount === 1 ? "" : "s"}
            </small>
          )}
        </div>

        <div className="teacher-dashboard-announcement-action">
          {!expanded ? (
            <button
              type="button"
              onClick={() => setExpanded(true)}
            >
              Read Announcement
            </button>
          ) : (
            <button
              type="button"
              disabled={saving}
              onClick={handleMarkAsRead}
            >
              {saving ? "Saving..." : "Mark as Read"}
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
