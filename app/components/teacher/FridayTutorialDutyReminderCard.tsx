"use client";

import { useEffect, useMemo, useState } from "react";

type DutyReminder = {
  duty_id: string;
  session_date: string;
  phase: "wednesday" | "thursday" | "friday";
  duty_labels?: string[];
  start_time?: string;
  end_time?: string;
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Madrid",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(`${value}T12:00:00Z`));
}

export default function FridayTutorialDutyReminderCard({
  reminder,
}: {
  reminder: DutyReminder | null;
}) {
  const [dismissed, setDismissed] = useState(false);
  const storageKey = useMemo(
    () =>
      reminder
        ? `teacher-friday-tutorial-duty-dismissed:${reminder.duty_id}:${reminder.phase}`
        : "",
    [reminder]
  );

  useEffect(() => {
    if (!storageKey) {
      setDismissed(false);
      return;
    }
    setDismissed(window.localStorage.getItem(storageKey) === "true");
  }, [storageKey]);

  if (!reminder || dismissed) return null;

  function dismiss() {
    window.localStorage.setItem(storageKey, "true");
    setDismissed(true);
  }

  const labels = reminder.duty_labels?.join(" + ") || "Friday Tutorial duty";
  const phaseLabel = reminder.phase.charAt(0).toUpperCase() + reminder.phase.slice(1);

  return (
    <section
      className="teacher-dashboard-section teacher-dashboard-friday-duty-reminder"
      aria-labelledby="teacher-friday-duty-reminder-title"
    >
      <div className="teacher-dashboard-section-title">
        <div>
          <p className="teacher-dashboard-duty-reminder-eyebrow">TEACHER TASK</p>
          <h2 id="teacher-friday-duty-reminder-title">Friday Tutorial duty</h2>
          <p>
            {formatDate(reminder.session_date)} · {reminder.start_time || "18:00"}–{reminder.end_time || "19:00"}
          </p>
        </div>
        <span className="teacher-dashboard-attendance-group">{labels}</span>
      </div>
      <p className="teacher-dashboard-duty-reminder-copy">
        You are assigned to this Friday Tutorial duty. Please review the list and complete attendance for every student on Friday.
      </p>
      <button type="button" className="teacher-dashboard-duty-reminder-dismiss" onClick={dismiss}>
        Dismiss {phaseLabel} reminder
      </button>
    </section>
  );
}
