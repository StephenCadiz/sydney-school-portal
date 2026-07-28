"use client";

import { useCallback, useEffect, useState } from "react";

import { supabase } from "../../../lib/supabase";

type Resource = {
  type: "paper" | "audio" | "key" | "sample_writing";
  audience: "student" | "teacher";
  label: string;
  url: string;
};

type Homework = {
  id: string;
  source: "assignment" | "legacy";
  release_date: string | null;
  due_date: string | null;
  status: "Current" | "Overdue";
  resources: Resource[];
  exam?: { number: number; title: string | null };
  part?: { label: string };
  week_number?: string | number;
  title?: string | null;
  description?: string | null;
  skill?: string;
};

function formatDate(value: string | null) {
  if (!value) return "—";
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return value;
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))));
}

function itemTitle(item: Homework) {
  return item.source === "assignment"
    ? `Exam ${item.exam?.number} · ${item.part?.label}`
    : item.title || `Week ${item.week_number} Homework`;
}

export default function TeacherHomework({ classId }: { classId: string }) {
  const [homework, setHomework] = useState<Homework[]>([]);
  const [supported, setSupported] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!classId) return;
    setLoading(true);
    setError("");
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error("Your session has expired.");
      const response = await fetch(`/api/teacher/classes/${classId}/homework`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Unable to load homework.");
      setHomework(payload.homework || []);
      setSupported(payload.class?.supported !== false);
    } catch (caught) {
      setHomework([]);
      setError(caught instanceof Error ? caught.message : "Unable to load homework.");
    } finally {
      setLoading(false);
    }
  }, [classId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) return <div className="teacher-homework-state">Loading homework...</div>;
  if (error) {
    return (
      <div className="teacher-homework-state is-error" role="alert">
        <p>{error}</p>
        <button type="button" onClick={() => void load()}>Retry</button>
      </div>
    );
  }
  if (!supported) {
    return (
      <div className="teacher-homework-state">
        Assignment homework is available for B1, B2, C1 and C2 Cambridge classes.
      </div>
    );
  }
  if (!homework.length) {
    return <div className="teacher-homework-state">No released homework for this class.</div>;
  }

  return (
    <section className="teacher-homework-directory">
      <div className="teacher-homework-heading">
        <div>
          <span>Class Workspace</span>
          <h2>Homework</h2>
        </div>
        <p>{homework.length} released item{homework.length === 1 ? "" : "s"}</p>
      </div>
      <div className="teacher-homework-grid">
        {homework.map((item) => {
          const studentResources = item.resources.filter(
            (resource) => resource.audience === "student"
          );
          const teacherResources = item.resources.filter(
            (resource) => resource.audience === "teacher"
          );
          return (
            <article key={`${item.source}-${item.id}`} className="teacher-homework-card">
              <div className="teacher-homework-card-header">
                <div>
                  <span>{item.source === "assignment" ? "Assigned Exam" : "Legacy history"}</span>
                  <h3>{itemTitle(item)}</h3>
                  {item.source === "assignment" && item.exam?.title && <p>{item.exam.title}</p>}
                  {item.source === "legacy" && item.description && <p>{item.description}</p>}
                </div>
                <strong className={`teacher-homework-status is-${item.status.toLowerCase()}`}>
                  {item.status}
                </strong>
              </div>
              <dl className="teacher-homework-dates">
                <div><dt>Release</dt><dd>{formatDate(item.release_date)}</dd></div>
                <div><dt>Due</dt><dd>{formatDate(item.due_date)}</dd></div>
              </dl>
              <div className="teacher-homework-resource-groups">
                <div>
                  <h4>Student resources</h4>
                  <div className="teacher-homework-links">
                    {studentResources.length ? studentResources.map((resource) => (
                      <a key={resource.type} href={resource.url} target="_blank" rel="noreferrer">
                        {resource.label}
                      </a>
                    )) : <span>None</span>}
                  </div>
                </div>
                {teacherResources.length > 0 && (
                  <div>
                    <h4>Teacher resources</h4>
                    <div className="teacher-homework-links">
                      {teacherResources.map((resource) => (
                        <a key={resource.type} href={resource.url} target="_blank" rel="noreferrer">
                          {resource.label}
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
