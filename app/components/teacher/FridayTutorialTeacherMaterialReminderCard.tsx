"use client";

import { useEffect, useMemo, useState } from "react";

type Reminder = {
  id: string;
  student_name: string;
  session_date: string;
  start_time: string | null;
  end_time: string | null;
  level_name: string;
  class_name: string;
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

export default function FridayTutorialTeacherMaterialReminderCard({
  reminders,
}: {
  reminders: Reminder[];
}) {
  const [dismissed, setDismissed] = useState<Record<string, boolean>>({});
  const ids = useMemo(() => reminders.map((reminder) => reminder.id).join("|"), [reminders]);

  useEffect(() => {
    const next: Record<string, boolean> = {};
    reminders.forEach((reminder) => {
      next[reminder.id] = window.localStorage.getItem(
        `teacher-friday-tutorial-material-dismissed:${reminder.id}`
      ) === "true";
    });
    setDismissed(next);
  }, [ids]);

  const visible = reminders.filter((reminder) => !dismissed[reminder.id]);
  if (!visible.length) return null;

  return (
    <section className="teacher-dashboard-section teacher-dashboard-friday-material" aria-labelledby="teacher-friday-material-title">
      <div className="teacher-dashboard-section-title">
        <div>
          <p className="teacher-dashboard-duty-reminder-eyebrow">TEACHER TASK</p>
          <h2 id="teacher-friday-material-title">Friday Tutorial material</h2>
          <p>Prepare activities and send them to Admin as soon as possible.</p>
        </div>
      </div>
      <div className="teacher-dashboard-friday-material-list">
        {visible.map((reminder) => (
          <article key={reminder.id} className="teacher-dashboard-friday-material-row">
            <div>
              <strong>{reminder.student_name}</strong>
              <p>
                {reminder.level_name}{reminder.class_name ? ` · ${reminder.class_name}` : ""} · {formatDate(reminder.session_date)} · {reminder.start_time || "18:00"}–{reminder.end_time || "19:00"}
              </p>
              <p>Student is attending. Prepare activities for the student and send them to Admin as soon as possible.</p>
            </div>
            <button
              type="button"
              onClick={() => {
                window.localStorage.setItem(`teacher-friday-tutorial-material-dismissed:${reminder.id}`, "true");
                setDismissed((current) => ({ ...current, [reminder.id]: true }));
              }}
            >
              Acknowledge
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}
