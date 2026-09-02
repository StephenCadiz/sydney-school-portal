"use client";

import { AlertCircle, ClipboardCheck, Clock3 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import {
  CLASS_REGISTER_CHANGED_EVENT,
  type ClassRegisterReminder,
} from "../../../lib/classRegister";
import { supabase } from "../../../lib/supabase";

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

export default function TeacherClassRegisterDashboardReminders() {
  const router = useRouter();
  const [reminders, setReminders] = useState<ClassRegisterReminder[]>([]);

  const loadReminders = useCallback(async () => {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setReminders([]);
        return;
      }
      const response = await fetch("/api/teacher/class-register/reminders", {
        headers: { Authorization: `Bearer ${session.access_token}` },
        cache: "no-store",
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error || "Unable to load register reminders.");
      }
      setReminders(Array.isArray(payload.reminders) ? payload.reminders : []);
    } catch (error) {
      console.error("Unable to load Class Register reminders:", error);
    }
  }, []);

  useEffect(() => {
    void loadReminders();
    const interval = window.setInterval(() => void loadReminders(), 60_000);
    const refresh = () => void loadReminders();
    window.addEventListener(CLASS_REGISTER_CHANGED_EVENT, refresh);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener(CLASS_REGISTER_CHANGED_EVENT, refresh);
    };
  }, [loadReminders]);

  if (!reminders.length) return null;

  const overdueCount = reminders.filter((reminder) => reminder.is_overdue).length;
  return (
    <section className="teacher-register-reminders" aria-labelledby="teacher-register-reminders-title">
      <div className="teacher-register-reminders-heading">
        <div className="teacher-register-reminders-title">
          <ClipboardCheck aria-hidden="true" size={22} />
          <div>
            <h2 id="teacher-register-reminders-title">Class Register</h2>
            <p>
              {reminders.length} lesson{reminders.length === 1 ? "" : "s"} awaiting attendance
            </p>
          </div>
        </div>
        {overdueCount > 0 && (
          <span className="teacher-register-overdue-count">
            {overdueCount} overdue
          </span>
        )}
      </div>

      <div className="teacher-register-reminder-list">
        {reminders.map((reminder) => (
          <article
            key={`${reminder.class_id}-${reminder.lesson_date}-${reminder.scheduled_start_time}`}
            className={reminder.is_overdue ? "is-overdue" : "is-current"}
          >
            <div className="teacher-register-reminder-status" aria-hidden="true">
              {reminder.is_overdue ? (
                <AlertCircle size={19} />
              ) : (
                <Clock3 size={19} />
              )}
            </div>
            <div className="teacher-register-reminder-copy">
              <strong>{reminder.class_name}</strong>
              <span>
                {displayDate(reminder.lesson_date)} · {displayTime(reminder.scheduled_start_time)}–
                {displayTime(reminder.scheduled_end_time)}
              </span>
              <small>
                {reminder.is_overdue
                  ? "Register not completed"
                  : "Lesson has started"}
              </small>
            </div>
            <button
              type="button"
              onClick={() =>
                router.push(
                  `/teacher/class?id=${encodeURIComponent(
                    reminder.class_id
                  )}&tab=class-register&lessonDate=${encodeURIComponent(
                    reminder.lesson_date
                  )}&startTime=${encodeURIComponent(
                    reminder.scheduled_start_time
                  )}`
                )
              }
            >
              {reminder.register_started ? "Continue Register" : "Take Register"}
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}
