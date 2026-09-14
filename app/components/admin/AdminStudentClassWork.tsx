"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "../../../lib/supabase";

type ClassWorkEntry = {
  id: string;
  class_name: string;
  lesson_date: string;
  scheduled_start_time: string;
  scheduled_end_time: string;
  pupils_book_page: number | null;
  activity_book_page: number | null;
  homework: string | null;
  extra_activities: string | null;
  completed_at: string | null;
  teacher_name: string;
};

function formatDate(value: string) {
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
        timeZone: "Europe/Madrid",
      }).format(date);
}

function formatTime(value: string) {
  return value ? value.slice(0, 5) : "";
}

function formatTimestamp(value: string | null) {
  if (!value) return "Timestamp not available";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Timestamp not available";
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/Madrid",
  }).format(date);
}

function EntryDetails({ entry }: { entry: ClassWorkEntry }) {
  return (
    <div className="admin-student-class-work-details">
      <p>
        <strong>Pages covered:</strong>{" "}
        {entry.pupils_book_page !== null
          ? `Pupil’s Book ${entry.pupils_book_page}`
          : "None recorded"}
        {entry.activity_book_page !== null
          ? ` · Activity Book ${entry.activity_book_page}`
          : ""}
      </p>
      <p>
        <strong>Homework:</strong> {entry.homework || "None assigned"}
      </p>
      <p>
        <strong>Extra activities / notes:</strong>{" "}
        {entry.extra_activities || "None recorded"}
      </p>
    </div>
  );
}

export default function AdminStudentClassWork({
  studentId,
  studentType,
}: {
  studentId: string;
  studentType: string;
}) {
  const [entries, setEntries] = useState<ClassWorkEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadClassWork = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const { data } = await supabase.auth.getSession();
      if (!data.session?.access_token) throw new Error("Authentication required.");
      const params = new URLSearchParams({ studentId, studentType });
      const response = await fetch(`/api/admin/student-information/class-work?${params}`, {
        headers: { Authorization: `Bearer ${data.session.access_token}` },
        cache: "no-store",
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Unable to load Class Work.");
      setEntries(Array.isArray(payload.entries) ? payload.entries : []);
    } catch (caught) {
      setEntries([]);
      setError(caught instanceof Error ? caught.message : "Unable to load Class Work.");
    } finally {
      setLoading(false);
    }
  }, [studentId, studentType]);

  useEffect(() => {
    void loadClassWork();
  }, [loadClassWork]);

  return (
    <section className="admin-student-class-work" aria-labelledby="admin-student-class-work-title">
      <h2 id="admin-student-class-work-title">Class Work</h2>
      {loading && <p className="admin-student-class-work-state">Loading class work…</p>}
      {!loading && error && <p className="admin-student-class-work-state is-error" role="alert">{error}</p>}
      {!loading && !error && entries.length === 0 && (
        <p className="admin-student-class-work-state">No class-work has been recorded for this student.</p>
      )}
      {!loading && !error && entries.length > 0 && (
        <>
          <article className="admin-student-class-work-latest">
            <div className="admin-student-class-work-heading">
              <div>
                <span className="admin-student-class-work-eyebrow">Latest class work</span>
                <h3>{entries[0].class_name}</h3>
                <p>{formatDate(entries[0].lesson_date)} · {formatTime(entries[0].scheduled_start_time)}–{formatTime(entries[0].scheduled_end_time)}</p>
              </div>
              <span className="admin-student-class-work-teacher">{entries[0].teacher_name}</span>
            </div>
            <EntryDetails entry={entries[0]} />
            <small>Completed {formatTimestamp(entries[0].completed_at)}</small>
          </article>
          <div className="admin-student-class-work-history">
            <h3>Previous class work</h3>
            {entries.slice(1).length === 0 ? (
              <p className="admin-student-class-work-state">No previous class-work entries.</p>
            ) : (
              entries.slice(1).map((entry) => (
                <article className="admin-student-class-work-entry" key={entry.id}>
                  <div className="admin-student-class-work-heading">
                    <div>
                      <h4>{entry.class_name}</h4>
                      <p>{formatDate(entry.lesson_date)} · {formatTime(entry.scheduled_start_time)}–{formatTime(entry.scheduled_end_time)}</p>
                    </div>
                    <span className="admin-student-class-work-teacher">{entry.teacher_name}</span>
                  </div>
                  <EntryDetails entry={entry} />
                  <small>Completed {formatTimestamp(entry.completed_at)}</small>
                </article>
              ))
            )}
          </div>
        </>
      )}
    </section>
  );
}
