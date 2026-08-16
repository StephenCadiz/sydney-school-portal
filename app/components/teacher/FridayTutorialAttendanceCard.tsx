"use client";

import { useEffect, useState } from "react";

import { supabase } from "../../../lib/supabase";

function formatFriday(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Madrid",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(`${value}T12:00:00Z`));
}

export default function FridayTutorialAttendanceCard() {
  const [attendance, setAttendance] = useState<any | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadAttendance() {
      try {
        const { data } = await supabase.auth.getSession();
        if (!data.session?.access_token) {
          setHidden(true);
          return;
        }
        const response = await fetch("/api/teacher/friday-tutorial-attendance", {
          headers: { Authorization: `Bearer ${data.session.access_token}` },
          cache: "no-store",
        });
        const result = await response.json().catch(() => ({}));
        if (response.status === 404 || response.status === 403) {
          setHidden(true);
          return;
        }
        if (!response.ok) throw new Error(result.error || "Unable to load Friday Tutorial attendance.");
        setAttendance(result.attendance);
        setValues(Object.fromEntries((result.attendance?.students || []).map((student: any) => [
          student.session_student_id,
          student.student_attended_status || "choose",
        ])));
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Unable to load Friday Tutorial attendance.");
      } finally {
        setLoading(false);
      }
    }
    void loadAttendance();
  }, []);

  async function saveAttendance() {
    setMessage("");
    setError("");
    const students = attendance?.students || [];
    if (students.some((student: any) => !["yes", "no"].includes(values[student.session_student_id]))) {
      setError("Choose Yes or No for every student.");
      return;
    }
    setSaving(true);
    try {
      const { data } = await supabase.auth.getSession();
      if (!data.session?.access_token) throw new Error("Your session has expired.");
      const response = await fetch("/api/teacher/friday-tutorial-attendance", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${data.session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          attendance: students.map((student: any) => ({
            session_student_id: student.session_student_id,
            student_attended_status: values[student.session_student_id],
          })),
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Unable to save Friday Tutorial attendance.");
      setMessage("Attendance saved");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to save Friday Tutorial attendance.");
    } finally {
      setSaving(false);
    }
  }

  if (hidden) return null;

  if (loading) {
    return (
      <section className="teacher-dashboard-section teacher-dashboard-attendance">
        <p className="teacher-dashboard-attendance-state">Loading Friday Tutorial attendance...</p>
      </section>
    );
  }

  if (error && !attendance) {
    return (
      <section className="teacher-dashboard-section teacher-dashboard-attendance">
        <div className="teacher-dashboard-section-title"><h2>Friday Tutorial Attendance</h2></div>
        <p className="teacher-dashboard-attendance-error" role="alert">{error}</p>
      </section>
    );
  }

  if (!attendance) return null;

  const dutyLabel = Array.isArray(attendance.duty_labels)
    ? attendance.duty_labels.join(" + ")
    : attendance.tutorial_group_label;
  const responsibilityLevels = Array.isArray(attendance.responsibility_levels)
    ? attendance.responsibility_levels
    : [];

  return (
    <section className="teacher-dashboard-section teacher-dashboard-attendance">
      <div className="teacher-dashboard-section-title teacher-dashboard-attendance-header">
        <div>
          <h2>Friday Tutorial Attendance</h2>
          <p>{formatFriday(attendance.session_date)} · {attendance.start_time}–{attendance.end_time}</p>
          {responsibilityLevels.length > 0 && (
            <p className="teacher-dashboard-attendance-levels">
              {responsibilityLevels.join(" · ")}
            </p>
          )}
        </div>
        <span className="teacher-dashboard-attendance-group">{dutyLabel}</span>
      </div>

      {attendance.note && (
        <p className="teacher-dashboard-attendance-note">
          <strong>Note:</strong> {attendance.note}
        </p>
      )}

      {!attendance.open ? (
        <p className="teacher-dashboard-attendance-state">Friday Tutorial attendance opens at 18:00.</p>
      ) : attendance.students.length === 0 ? (
        <p className="teacher-dashboard-attendance-state">No students are on today&apos;s assigned Friday Tutorial list.</p>
      ) : (
        <>
          {message && <div className="teacher-dashboard-attendance-success" role="status"><span aria-hidden="true">✓</span>{message}</div>}
          {error && <div className="teacher-dashboard-attendance-error" role="alert">{error}</div>}
          <div className="teacher-dashboard-attendance-table-wrap">
            <table className="teacher-dashboard-attendance-table">
              <colgroup><col className="is-student" /><col className="is-level" /><col className="is-present" /></colgroup>
              <thead><tr><th>Student</th><th>Level</th><th>Present</th></tr></thead>
              <tbody>
                {attendance.students.map((student: any) => {
                  const studentLabelId = `friday-attendance-student-${student.session_student_id}`;
                  return (
                  <tr key={student.session_student_id}>
                    <th scope="row" id={studentLabelId}>{student.student_name}</th>
                    <td><span className="teacher-dashboard-attendance-level">{student.level_name}</span></td>
                    <td>
                      <div className="teacher-dashboard-attendance-choice" role="group" aria-labelledby={studentLabelId}>
                        {[["yes", "Yes"], ["no", "No"]].map(([value, label]) => (
                          <button key={value} type="button" aria-pressed={values[student.session_student_id] === value} className={`${value === "yes" ? "is-yes" : "is-no"} ${values[student.session_student_id] === value ? "is-selected" : ""}`} onClick={() => setValues((current) => ({ ...current, [student.session_student_id]: value }))}>{label}</button>
                        ))}
                      </div>
                    </td>
                  </tr>
                )})}
              </tbody>
            </table>
          </div>
          <div className="teacher-dashboard-attendance-actions">
            <button type="button" disabled={saving} onClick={() => void saveAttendance()}>{saving ? "Saving..." : "Save Attendance"}</button>
          </div>
        </>
      )}
    </section>
  );
}
