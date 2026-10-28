"use client";

import { useState } from "react";

import { supabase } from "../../../lib/supabase";
import { formatClockTime } from "../../../lib/timeDisplay";

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
  const [completed, setCompleted] = useState<Record<string, boolean>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const visible = reminders.filter((reminder) => !completed[reminder.id]);
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
      {error ? <p role="alert" className="teacher-dashboard-inline-error">{error}</p> : null}
      <div className="teacher-dashboard-friday-material-list">
        {visible.map((reminder) => (
          <article key={reminder.id} className="teacher-dashboard-friday-material-row">
            <div>
              <strong>{reminder.student_name}</strong>
              <p>
                {reminder.level_name}{reminder.class_name ? ` · ${reminder.class_name}` : ""} · {formatDate(reminder.session_date)} · {formatClockTime(reminder.start_time, "18:00")}–{formatClockTime(reminder.end_time, "19:00")}
              </p>
              <p>Student is attending. Prepare activities for the student and send them to Admin as soon as possible.</p>
            </div>
            <button
              type="button"
              disabled={savingId === reminder.id}
              onClick={async () => {
                setSavingId(reminder.id);
                setError("");
                try {
                  const { data: { session } } = await supabase.auth.getSession();
                  if (!session?.access_token) throw new Error("Your session has expired. Please sign in again.");
                  const response = await fetch("/api/teacher/friday-tutorial-notices", {
                    method: "PATCH",
                    headers: {
                      Authorization: `Bearer ${session.access_token}`,
                      "Content-Type": "application/json",
                    },
                    body: JSON.stringify({ session_student_id: reminder.id }),
                  });
                  const payload = await response.json().catch(() => ({}));
                  if (!response.ok) throw new Error(payload.error || "Unable to update this reminder.");
                  setCompleted((current) => ({ ...current, [reminder.id]: true }));
                } catch (requestError: any) {
                  setError(requestError?.message || "Unable to update this reminder.");
                } finally {
                  setSavingId(null);
                }
              }}
            >
              {savingId === reminder.id ? "Saving…" : "Material Sent to Admin"}
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}
