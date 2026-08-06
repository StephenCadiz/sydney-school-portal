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

function displayTime(value: string) {
  return value.slice(0, 5);
}

function displayDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Madrid",
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(new Date(`${value}T12:00:00Z`));
}

export default function TeacherClassProgressDashboardReminders() {
  const router = useRouter();
  const [reminders, setReminders] = useState<ClassProgressReminder[]>([]);

  const loadReminders = useCallback(async () => {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setReminders([]);
        return;
      }
      const response = await fetch("/api/teacher/class-progress/reminders", {
        headers: { Authorization: `Bearer ${session.access_token}` },
        cache: "no-store",
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || "Unable to load reminders.");
      setReminders(Array.isArray(payload?.reminders) ? payload.reminders : []);
    } catch (error) {
      console.error("Unable to load Class Progress dashboard reminders:", error);
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

  if (!reminders.length) return null;

  return (
    <section className="teacher-class-progress-dashboard" aria-labelledby="class-progress-dashboard-heading">
      <div className="teacher-dashboard-section-title">
        <div>
          <h2 id="class-progress-dashboard-heading">Class Progress</h2>
          <p>
            {reminders.length} lesson{reminders.length === 1 ? "" : "s"} awaiting completion
          </p>
        </div>
        <span>{reminders.filter((reminder) => reminder.is_overdue).length} overdue</span>
      </div>
      <div className="teacher-class-progress-dashboard-list">
        {reminders.map((reminder) => (
          <article key={`${reminder.class_id}:${reminder.lesson_date}:${reminder.scheduled_start_time}`}>
            <div>
              <strong>{reminder.class_name}</strong>
              <span>
                {reminder.level} · {displayDate(reminder.lesson_date)} · {displayTime(
                  reminder.scheduled_start_time
                )}–{displayTime(reminder.scheduled_end_time)}
              </span>
            </div>
            <button
              type="button"
              onClick={() =>
                router.push(
                  `/teacher/class?id=${encodeURIComponent(reminder.class_id)}&tab=class-progress&lessonDate=${encodeURIComponent(
                    reminder.lesson_date
                  )}&startTime=${encodeURIComponent(reminder.scheduled_start_time)}`
                )
              }
            >
              Complete now
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}
