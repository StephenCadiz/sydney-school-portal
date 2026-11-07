"use client";

import Link from "next/link";
import { useState } from "react";

import { markFollowUpActionRead } from "../../../lib/followUps";

type Reminder = {
  id: string;
  student_name: string;
  class_label: string;
  category: string;
  action_at: string;
  url: string;
};

export default function TeacherFollowUpActionReminderCard({
  reminders,
}: {
  reminders: Reminder[];
}) {
  const [readKeys, setReadKeys] = useState<string[]>([]);
  const [readingId, setReadingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const reminderKey = (reminder: Reminder) => `${reminder.id}:${reminder.action_at}`;
  const visibleReminders = reminders.filter(
    (reminder) => !readKeys.includes(reminderKey(reminder))
  );

  if (!visibleReminders.length) return null;

  async function markAsRead(id: string) {
    setReadingId(id);
    setError("");
    try {
      await markFollowUpActionRead(id);
      const reminder = reminders.find((item) => item.id === id);
      if (reminder) {
        const key = reminderKey(reminder);
        setReadKeys((current) => (current.includes(key) ? current : [...current, key]));
      }
    } catch (readError) {
      setError(
        readError instanceof Error
          ? readError.message
          : "Unable to mark the follow-up update as read."
      );
    } finally {
      setReadingId(null);
    }
  }

  return (
    <section
      className="teacher-dashboard-section teacher-dashboard-follow-up-action"
      aria-labelledby="teacher-follow-up-action-title"
    >
      <div className="teacher-dashboard-section-title">
        <div>
          <p className="teacher-dashboard-duty-reminder-eyebrow">FOLLOW-UP UPDATE</p>
          <h2 id="teacher-follow-up-action-title">Admin action completed</h2>
          <p>Admin has added an action to one of your student follow-ups.</p>
        </div>
      </div>
      {error && <p className="teacher-dashboard-follow-up-action-error" role="alert">{error}</p>}
      <div className="teacher-dashboard-follow-up-action-list">
        {visibleReminders.map((reminder) => (
          <div
            key={reminder.id}
            className="teacher-dashboard-follow-up-action-row"
          >
            <Link className="teacher-dashboard-follow-up-action-link" href={reminder.url}>
              <span>
                <strong>{reminder.student_name}</strong>
                <small>
                  {reminder.category} follow-up
                  {reminder.class_label ? ` · ${reminder.class_label}` : ""}
                </small>
              </span>
              <span aria-hidden="true">Open follow-up&nbsp;›</span>
            </Link>
            <button
              type="button"
              className="teacher-dashboard-follow-up-action-read"
              onClick={() => void markAsRead(reminder.id)}
              disabled={readingId === reminder.id}
            >
              {readingId === reminder.id ? "Saving…" : "Mark as read"}
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}
