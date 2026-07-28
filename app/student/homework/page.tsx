"use client";

import { useCallback, useEffect, useState } from "react";

import StudentMenu from "../StudentMenu";
import { getHomeworkSkillLabel } from "../../../lib/homework";
import { supabase } from "../../../lib/supabase";
import {
  markAssignmentHomeworkAsViewed,
  markHomeworkAsViewed,
} from "../../../lib/studentNotifications";

type HomeworkResource = {
  type: "paper" | "audio";
  label: "Question Paper" | "Audio";
  url: string;
};

type HomeworkResult = {
  id: string;
  percentage: number | null;
  title: string | null;
} | null;

type AssignmentHomework = {
  id: string;
  source: "assignment";
  exam: { id: string; number: number; title: string | null };
  part: { id: string; type: string; label: string };
  release_date: string | null;
  due_date: string | null;
  resources: HomeworkResource[];
  viewed: boolean;
  result: HomeworkResult;
  status: "Current" | "Overdue" | "Complete";
};

type LegacyHomework = {
  id: string;
  source: "legacy";
  week_number: string | number;
  title: string | null;
  description: string | null;
  skill: string;
  release_date: string | null;
  due_date: string | null;
  resources: HomeworkResource[];
  viewed: boolean;
  result: HomeworkResult;
  status: "Current" | "Past" | "Complete";
};

type HomeworkItem = AssignmentHomework | LegacyHomework;

function formatDateShort(date: string | null) {
  if (!date) return "—";
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) return date;
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))));
}

function title(item: HomeworkItem) {
  return item.source === "assignment"
    ? `Exam ${item.exam.number} · ${item.part.label}`
    : item.title?.trim() || `Week ${item.week_number} Homework`;
}

function resultLabel(item: HomeworkItem) {
  return item.result?.percentage === null || item.result?.percentage === undefined
    ? "Not graded"
    : `${Math.round(item.result.percentage)}%`;
}

function statusClass(status: string) {
  return status === "Overdue" ? "past" : status.toLowerCase();
}

export default function HomeworkPage() {
  const [homework, setHomework] = useState<HomeworkItem[]>([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [level, setLevel] = useState("");
  const [readContext, setReadContext] = useState<{
    token: string;
    studentId: string;
  } | null>(null);

  const loadHomework = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      const studentId = data.session?.user.id;
      if (!token || !studentId) throw new Error("Your session has expired.");

      const response = await fetch("/api/student/homework", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Unable to load homework.");
      const rows: HomeworkItem[] = payload.homework || [];
      setHomework(rows);
      setLevel(String(payload.class?.level || ""));
      setReadContext({ token, studentId });
    } catch (caught) {
      console.error(caught);
      setHomework([]);
      setError(caught instanceof Error ? caught.message : "Unable to load homework.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadHomework();
  }, [loadHomework]);

  useEffect(() => {
    if (loading || error || !readContext || homework.length === 0) return;
    const assignmentIds = homework
      .filter((item): item is AssignmentHomework => item.source === "assignment")
      .map((item) => item.id);
    const legacyIds = homework
      .filter((item): item is LegacyHomework => item.source === "legacy")
      .map((item) => item.id);
    const updates: Promise<unknown>[] = [];
    if (assignmentIds.length) {
      updates.push(markAssignmentHomeworkAsViewed(readContext.token, assignmentIds));
    }
    if (legacyIds.length) {
      updates.push(markHomeworkAsViewed(readContext.studentId, legacyIds));
    }
    void Promise.all(updates).catch((readError) => {
      console.error("Unable to mark homework as viewed:", readError);
    });
  }, [error, homework, loading, readContext]);

  function resources(item: HomeworkItem) {
    if (!item.resources.length) return <span className="student-homework-muted">—</span>;
    return (
      <div className="student-homework-resources">
        {item.resources.map((resource) => (
          <a
            key={`${item.id}-${resource.type}`}
            className="student-homework-resource-link"
            href={resource.url}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`${resource.label} for ${title(item)}`}
          >
            {resource.type === "audio" ? "Play Audio" : "Question Paper"}
          </a>
        ))}
      </div>
    );
  }

  function skillLabel(item: HomeworkItem) {
    return item.source === "assignment"
      ? item.part.label
      : getHomeworkSkillLabel(level, item.skill) ||
          item.skill.charAt(0).toUpperCase() + item.skill.slice(1);
  }

  function status(item: HomeworkItem) {
    return (
      <span className={`student-homework-status is-${statusClass(item.status)}`}>
        {item.status}
      </span>
    );
  }

  return (
    <div className="student-layout-shell">
      <div className="student-mobile-topbar">
        <div className="student-mobile-topbar-title">Sydney School / Student</div>
        <button type="button" className="mobile-menu-button" aria-label="Open student menu" onClick={() => setMenuOpen(true)}>Menu</button>
      </div>
      {menuOpen && <button type="button" aria-label="Close student menu" className="student-mobile-drawer-overlay" onClick={() => setMenuOpen(false)} />}
      <div className={`student-mobile-drawer ${menuOpen ? "open" : ""}`}>
        <button type="button" className="student-mobile-drawer-close" onClick={() => setMenuOpen(false)}>Close</button>
        <StudentMenu mobileMode onClose={() => setMenuOpen(false)} />
      </div>
      <aside className="student-desktop-sidebar"><StudentMenu /></aside>

      <main className="student-main-content student-homework-page">
        <header className="student-homework-header-block">
          <h1 className="student-homework-header">Homework</h1>
          <p className="student-homework-subtitle">View your released homework, resources and results.</p>
        </header>
        <section className="student-homework-directory" aria-labelledby="student-homework-directory-title">
          <div className="student-homework-directory-header">
            <div>
              <h2 id="student-homework-directory-title">Released Homework</h2>
              <p>Current and past homework for your class, ordered by due date.</p>
            </div>
            <div className="student-homework-summary" aria-live="polite">
              {homework.length} released homework item{homework.length === 1 ? "" : "s"}
            </div>
          </div>

          {loading && <div className="student-homework-state" role="status">Loading homework...</div>}
          {!loading && error && (
            <div className="student-homework-state is-error" role="alert">
              <p>{error}</p>
              <button type="button" onClick={() => void loadHomework()}>Retry</button>
            </div>
          )}
          {!loading && !error && homework.length === 0 && (
            <div className="student-homework-state">No homework has been released yet.</div>
          )}
          {!loading && !error && homework.length > 0 && (
            <>
              <div className="student-homework-table-wrap">
                <table className="student-homework-table">
                  <caption className="student-homework-table-caption">Released homework, resources and results</caption>
                  <thead><tr><th>Homework</th><th>Skill</th><th>Release</th><th>Due</th><th>Status</th><th>Result</th><th>Resources</th></tr></thead>
                  <tbody>
                    {homework.map((item) => (
                      <tr key={`${item.source}-${item.id}`}>
                        <td>
                          <strong>{title(item)}</strong>
                          {item.source === "assignment" && item.exam.title && <span>{item.exam.title}</span>}
                          {item.source === "legacy" && <span>Week {item.week_number}{item.description ? ` · ${item.description}` : ""}</span>}
                        </td>
                        <td>{skillLabel(item)}</td>
                        <td>{formatDateShort(item.release_date)}</td>
                        <td>{formatDateShort(item.due_date)}</td>
                        <td>{status(item)}</td>
                        <td><span className={`student-homework-result ${item.result ? "is-graded" : "is-not-graded"}`}>{resultLabel(item)}</span></td>
                        <td>{resources(item)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="student-homework-mobile-list">
                {homework.map((item, index) => (
                  <article key={`${item.source}-${item.id}`} className="student-homework-mobile-card">
                    <div className="student-homework-mobile-card-header"><span>#{index + 1}</span>{status(item)}</div>
                    <h3>{title(item)}</h3>
                    {item.source === "assignment" && item.exam.title && <p>{item.exam.title}</p>}
                    {item.source === "legacy" && item.description && <p>{item.description}</p>}
                    <dl>
                      {item.source === "legacy" && <div><dt>Week</dt><dd>Week {item.week_number}</dd></div>}
                      <div><dt>Skill</dt><dd>{skillLabel(item)}</dd></div>
                      <div><dt>Release</dt><dd>{formatDateShort(item.release_date)}</dd></div>
                      <div><dt>Due</dt><dd>{formatDateShort(item.due_date)}</dd></div>
                      <div><dt>Result</dt><dd>{resultLabel(item)}</dd></div>
                    </dl>
                    <div className="student-homework-mobile-resources"><span>Resources</span>{resources(item)}</div>
                  </article>
                ))}
              </div>
            </>
          )}
        </section>
      </main>
    </div>
  );
}
