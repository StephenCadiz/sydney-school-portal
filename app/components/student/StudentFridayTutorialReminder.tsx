"use client";

import { useEffect, useState } from "react";
import { CalendarDays } from "lucide-react";

import { supabase } from "../../../lib/supabase";

type ReminderSession = {
  id: string;
  session_date: string;
  level: string;
  activity_type: string;
  exam_part: string | null;
};

type Reminder = {
  stage: "monday" | "thursday";
  heading: string;
  fridayDate: string;
  level: string;
  sessions: ReminderSession[];
};

function formatFridayDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return value;

  const date = new Date(
    Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12)
  );

  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Madrid",
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(date);
}

function getSessionLabel(session: ReminderSession) {
  return [session.activity_type, session.exam_part].filter(Boolean).join(" · ");
}

async function getAccessToken() {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token || "";
}

export default function StudentFridayTutorialReminder() {
  const [reminder, setReminder] = useState<Reminder | null>(null);
  const [saving, setSaving] = useState(false);
  const [dismissError, setDismissError] = useState("");

  useEffect(() => {
    let active = true;

    async function loadReminder() {
      try {
        const token = await getAccessToken();
        if (!token) return;

        const response = await fetch("/api/student/friday-tutorial-reminder", {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        });

        if (!response.ok) return;

        const payload = await response.json();
        if (active) setReminder(payload.reminder || null);
      } catch (error) {
        console.error("Unable to load Friday Tutorial reminder:", error);
      }
    }

    loadReminder();
    return () => {
      active = false;
    };
  }, []);

  async function dismissReminder() {
    if (!reminder) return;

    setSaving(true);
    setDismissError("");

    try {
      const token = await getAccessToken();
      if (!token) throw new Error("Missing student session.");

      const response = await fetch("/api/student/friday-tutorial-reminder", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          stage: reminder.stage,
          sessionIds: reminder.sessions.map((session) => session.id),
        }),
      });

      if (!response.ok) throw new Error("Dismissal request failed.");
      setReminder(null);
    } catch (error) {
      console.error("Unable to dismiss Friday Tutorial reminder:", error);
      setDismissError("Couldn’t dismiss — try again.");
    } finally {
      setSaving(false);
    }
  }

  if (!reminder) return null;

  return (
    <section
      className={`student-friday-tutorial-reminder${
        reminder.stage === "thursday" ? " is-thursday" : ""
      }`}
      aria-labelledby="student-friday-tutorial-reminder-heading"
    >
      <div className="student-friday-tutorial-reminder-icon" aria-hidden="true">
        <CalendarDays size={22} strokeWidth={2} />
      </div>

      <div className="student-friday-tutorial-reminder-content">
        <h2 id="student-friday-tutorial-reminder-heading">
          {reminder.heading}
        </h2>
        <p className="student-friday-tutorial-reminder-meta">
          <strong>{reminder.level}</strong>
          <span aria-hidden="true">·</span>
          {formatFridayDate(reminder.fridayDate)}
        </p>

        <ul className="student-friday-tutorial-reminder-sessions">
          {reminder.sessions.map((session) => (
            <li key={session.id}>{getSessionLabel(session)}</li>
          ))}
        </ul>

        {dismissError && (
          <p
            className="student-friday-tutorial-reminder-error"
            aria-live="polite"
          >
            {dismissError}
          </p>
        )}
      </div>

      <button
        type="button"
        className="student-friday-tutorial-reminder-button"
        onClick={dismissReminder}
        disabled={saving}
      >
        {saving ? "Saving…" : "Got it"}
      </button>
    </section>
  );
}
