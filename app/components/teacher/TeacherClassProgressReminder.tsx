"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { supabase } from "../../../lib/supabase";

type ClassProgressReminder = {
  class_id: string;
  class_name: string;
  level: string;
  lesson_date: string;
  scheduled_start_time: string;
  scheduled_end_time: string;
  is_overdue: boolean;
};

const DISMISS_PREFIX = "teacher-class-progress-dismissed:";

function reminderKey(reminder: ClassProgressReminder) {
  return `${reminder.class_id}:${reminder.lesson_date}:${reminder.scheduled_start_time}`;
}

function isDismissed(reminder: ClassProgressReminder) {
  try {
    return sessionStorage.getItem(`${DISMISS_PREFIX}${reminderKey(reminder)}`) === "1";
  } catch {
    return false;
  }
}

function dismiss(reminder: ClassProgressReminder) {
  try {
    sessionStorage.setItem(`${DISMISS_PREFIX}${reminderKey(reminder)}`, "1");
  } catch {
    // Session storage is optional; reminders remain available on the dashboard.
  }
}

function displayTime(value: string) {
  return value.slice(0, 5);
}

export default function TeacherClassProgressReminder() {
  const router = useRouter();
  const [reminders, setReminders] = useState<ClassProgressReminder[]>([]);
  const [activeReminder, setActiveReminder] = useState<ClassProgressReminder | null>(
    null
  );

  const loadReminders = useCallback(async () => {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setReminders([]);
        setActiveReminder(null);
        return;
      }
      const response = await fetch("/api/teacher/class-progress/reminders", {
        headers: { Authorization: `Bearer ${session.access_token}` },
        cache: "no-store",
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || "Unable to load reminders.");
      const nextReminders = Array.isArray(payload?.reminders)
        ? (payload.reminders as ClassProgressReminder[])
        : [];
      setReminders(nextReminders);
      setActiveReminder(nextReminders.find((reminder) => !isDismissed(reminder)) || null);
    } catch (error) {
      console.error("Unable to load Class Progress reminders:", error);
    }
  }, []);

  useEffect(() => {
    void loadReminders();
    const interval = window.setInterval(() => void loadReminders(), 60_000);
    const refresh = () => void loadReminders();
    window.addEventListener("teacher-class-progress-updated", refresh);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("teacher-class-progress-updated", refresh);
    };
  }, [loadReminders]);

  function completeNow(reminder: ClassProgressReminder) {
    router.push(
      `/teacher/class?id=${encodeURIComponent(reminder.class_id)}&tab=class-progress&lessonDate=${encodeURIComponent(
        reminder.lesson_date
      )}&startTime=${encodeURIComponent(reminder.scheduled_start_time)}`
    );
  }

  if (!activeReminder || !reminders.length) return null;

  return (
    <div className="teacher-class-progress-reminder-backdrop" role="presentation">
      <section
        className="teacher-class-progress-reminder-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="class-progress-reminder-heading"
      >
        <div className="teacher-class-progress-reminder-icon" aria-hidden="true">✓</div>
        <p className="teacher-class-progress-reminder-eyebrow">
          {activeReminder.is_overdue ? "Class Progress overdue" : "Lesson ending soon"}
        </p>
        <h2 id="class-progress-reminder-heading">Complete Class Progress</h2>
        <p>
          {activeReminder.class_name} · {activeReminder.level} · {displayTime(
            activeReminder.scheduled_start_time
          )}–{displayTime(activeReminder.scheduled_end_time)}
        </p>
        <div className="teacher-class-progress-reminder-actions">
          <button type="button" onClick={() => completeNow(activeReminder)}>
            Complete now
          </button>
          <button
            type="button"
            className="is-secondary"
            onClick={() => {
              dismiss(activeReminder);
              setActiveReminder(
                reminders.find(
                  (reminder) =>
                    reminderKey(reminder) !== reminderKey(activeReminder) &&
                    !isDismissed(reminder)
                ) || null
              );
            }}
          >
            Dismiss for now
          </button>
        </div>
      </section>
    </div>
  );
}
