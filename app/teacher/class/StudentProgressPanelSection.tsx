"use client";

import { useCallback, useEffect, useState } from "react";

import { supabase } from "../../../lib/supabase";
import type { TeacherStudentProgressPayload } from "../../../lib/teacherStudentProgress";

type Props = {
  classId: string;
  studentId: string;
  onOpenHomework: () => void;
  onOpenFridayTutorial: () => void;
  onOpenMocks: () => void;
  onOpenFollowUp: () => void;
};

function formatPercent(value: number | null) {
  return value === null ? "No data" : `${Math.round(value * 10) / 10}%`;
}

function formatScore(value: number | null) {
  return value === null ? "—" : `${Math.round(value * 10) / 10}%`;
}

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return value;
  return new Date(
    Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12)
  ).toLocaleDateString("en-GB", {
    timeZone: "Europe/Madrid",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function TargetContext({
  status,
}: {
  status: { label: string; difference: number } | null;
}) {
  if (!status) return null;
  const points = Math.round(Math.abs(status.difference) * 10) / 10;

  return (
    <span className={status.difference >= 0 ? "is-achieved" : "is-below"}>
      {status.label} · {points} points{" "}
      {status.difference >= 0 ? "above target" : "to target"}
    </span>
  );
}

export default function StudentProgressPanelSection({
  classId,
  studentId,
  onOpenHomework,
  onOpenFridayTutorial,
  onOpenMocks,
  onOpenFollowUp,
}: Props) {
  const [progress, setProgress] =
    useState<TeacherStudentProgressPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadProgress = useCallback(async () => {
    setLoading(true);
    setError("");
    setProgress(null);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error("Missing teacher session.");

      const params = new URLSearchParams({
        class_id: classId,
        student_id: studentId,
      });
      const response = await fetch(`/api/teacher/student-progress?${params}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
        cache: "no-store",
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || "Unable to load student progress.");
      }

      setProgress(payload.progress || null);
    } catch (loadError) {
      console.error("Unable to load student progress:", loadError);
      setError("Unable to load student progress.");
    } finally {
      setLoading(false);
    }
  }, [classId, studentId]);

  useEffect(() => {
    loadProgress();
  }, [loadProgress]);

  if (loading) {
    return (
      <section
        className="teacher-student-progress teacher-student-progress-loading"
        aria-label="Loading student progress"
        aria-busy="true"
      >
        <div className="teacher-student-progress-skeleton is-heading" />
        <div className="teacher-student-progress-skeleton-grid">
          {[1, 2, 3, 4].map((item) => (
            <div className="teacher-student-progress-skeleton" key={item} />
          ))}
        </div>
        <div className="teacher-student-progress-skeleton is-panel" />
      </section>
    );
  }

  if (error || !progress) {
    return (
      <section className="teacher-student-progress teacher-student-progress-state">
        <h3>Unable to load student progress.</h3>
        <p>The Student Workspace remains available. Try loading this overview again.</p>
        <button type="button" onClick={loadProgress}>
          Retry
        </button>
      </section>
    );
  }

  const incompleteAssignments = progress.homework.assignments.filter(
    (item) => item.status !== "completed"
  );

  return (
    <section className="teacher-student-progress">
      <header className="teacher-student-progress-header">
        <div>
          <p>Student Progress Overview</p>
          <h3>{progress.student.name}</h3>
          <span>{progress.student.class_context}</span>
        </div>
        <div className="teacher-student-progress-shortcuts" aria-label="Progress actions">
          <button type="button" onClick={onOpenHomework}>View/Edit Homework</button>
          <button type="button" onClick={onOpenFridayTutorial}>Open Friday Tutorial</button>
          <button type="button" onClick={onOpenMocks}>Open Mock Exams</button>
          <button type="button" onClick={onOpenFollowUp}>Open Follow-up</button>
        </div>
      </header>

      <div className="teacher-student-progress-metrics">
        {[
          {
            label: "Homework",
            value: progress.summary.homework.value,
            context: progress.summary.homework.context,
          },
          {
            label: "Latest Mock",
            value: progress.summary.latest_mock.value,
            context: progress.summary.latest_mock.context,
          },
          {
            label: "Friday Tutorials",
            value: progress.summary.friday_average.value,
            context: progress.summary.friday_average.context,
          },
          {
            label: "Friday Attendance",
            value: progress.summary.friday_attendance.value,
            context: progress.summary.friday_attendance.context,
          },
        ].map((metric) => (
          <article key={metric.label}>
            <span>{metric.label}</span>
            <strong>{formatPercent(metric.value)}</strong>
            <small>{metric.context}</small>
          </article>
        ))}
      </div>

      <section className="teacher-student-progress-attention">
        <div className="teacher-student-progress-section-heading">
          <p>Needs Attention</p>
          <h4>Current academic alerts</h4>
        </div>
        {progress.attention.length ? (
          <ul>
            {progress.attention.map((item) => <li key={item.id}>{item.text}</li>)}
          </ul>
        ) : (
          <p className="teacher-student-progress-calm">No current academic alerts.</p>
        )}
      </section>

      {progress.snapshot.length > 0 && (
        <section className="teacher-student-progress-panel">
          <div className="teacher-student-progress-section-heading">
            <p>Current Academic Picture</p>
            <h4>At a glance</h4>
          </div>
          <ul className="teacher-student-progress-snapshot">
            {progress.snapshot.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </section>
      )}

      <section className="teacher-student-progress-panel">
        <div className="teacher-student-progress-section-heading is-split">
          <div><p>Homework</p><h4>Performance and work status</h4></div>
          <div className="teacher-student-progress-key-result">
            <strong>{formatPercent(progress.homework.overall)}</strong>
            <TargetContext status={progress.homework.target_status} />
          </div>
        </div>

        <div className="teacher-student-progress-skill-grid">
          {progress.homework.skills.map((skill) => (
            <div key={skill.skill}>
              <span>{skill.label}</span>
              <strong>{formatPercent(skill.average)}</strong>
            </div>
          ))}
        </div>

        <h5>Outstanding and pending work</h5>
        {incompleteAssignments.length === 0 ? (
          <p className="teacher-student-progress-muted">No outstanding or pending Homework.</p>
        ) : (
          <div className="teacher-student-progress-table-wrap">
            <table>
              <thead><tr><th>Homework</th><th>Due</th><th>Status</th></tr></thead>
              <tbody>
                {incompleteAssignments.map((item) => (
                  <tr key={item.id}>
                    <th scope="row">{item.title}</th>
                    <td>{formatDate(item.due_date)}</td>
                    <td><span className={`teacher-student-progress-status is-${item.status}`}>{item.status === "outstanding" ? "Outstanding" : "Pending"}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <h5>Homework history</h5>
        {progress.homework.history.length === 0 ? (
          <p className="teacher-student-progress-muted">No Homework results.</p>
        ) : (
          <div className="teacher-student-progress-table-wrap">
            <table>
              <thead><tr><th>Week</th><th>Skill</th><th>Result</th></tr></thead>
              <tbody>
                {progress.homework.history.map((item) => (
                  <tr key={item.id}><th scope="row">Week {item.week}</th><td>{item.skill_label}</td><td>{formatScore(item.percentage)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="teacher-student-progress-panel">
        <div className="teacher-student-progress-section-heading is-split">
          <div><p>Mock Exams</p><h4>Latest performance and progression</h4></div>
          <div className="teacher-student-progress-key-result">
            <strong>{progress.mocks.latest ? `Mock ${progress.mocks.latest.mock_number} · ${formatPercent(progress.mocks.latest.average)}` : "No data"}</strong>
            <TargetContext status={progress.mocks.target_status} />
            {progress.mocks.progression !== null && progress.mocks.previous_mock_number && (
              <span>{progress.mocks.progression >= 0 ? "+" : ""}{progress.mocks.progression} points since Mock {progress.mocks.previous_mock_number}</span>
            )}
          </div>
        </div>
        {progress.mocks.history.length === 0 ? (
          <p className="teacher-student-progress-muted">No Mock results.</p>
        ) : (
          <div className="teacher-student-progress-table-wrap">
            <table>
              <thead><tr><th>Mock</th><th>{progress.student.level === "B1" ? "Reading" : "Reading / UoE"}</th><th>Listening</th><th>Writing</th><th>Speaking</th><th>Average</th><th>Status</th></tr></thead>
              <tbody>
                {progress.mocks.history.map((mock) => (
                  <tr key={mock.id}><th scope="row">Mock {mock.mock_number}</th><td>{formatScore(mock.reading)}</td><td>{formatScore(mock.listening)}</td><td>{formatScore(mock.writing)}</td><td>{formatScore(mock.speaking)}</td><td>{formatScore(mock.average)}</td><td><span className={`teacher-student-progress-status is-${mock.status.toLowerCase()}`}>{mock.status}</span></td></tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="teacher-student-progress-panel">
        <div className="teacher-student-progress-section-heading is-split">
          <div><p>Friday Tutorials</p><h4>Results and tutorial attendance</h4></div>
          <div className="teacher-student-progress-key-result">
            <strong>
              {progress.friday.average === null
                ? "No data"
                : `${formatPercent(progress.friday.average)} average`}
            </strong>
            <span>{progress.friday.attendance.attended_count} attended · {progress.friday.attendance.absent_count} absent</span>
          </div>
        </div>
        {progress.friday.strongest && progress.friday.focus && (
          <div className="teacher-student-progress-insights">
            <p><span>Strongest tutorial area</span><strong>{progress.friday.strongest.label} · {formatPercent(progress.friday.strongest.average)}</strong></p>
            <p><span>Area to focus</span><strong>{progress.friday.focus.label} · {formatPercent(progress.friday.focus.average)}</strong></p>
          </div>
        )}
        {progress.friday.history.length === 0 ? (
          <p className="teacher-student-progress-muted">No submitted Friday Tutorial results.</p>
        ) : (
          <div className="teacher-student-progress-table-wrap">
            <table>
              <thead><tr><th>Date</th><th>Activity / Part</th><th>Result</th><th>Friday Tutorial Attendance</th></tr></thead>
              <tbody>
                {progress.friday.history.map((item) => (
                  <tr key={item.id}><th scope="row">{formatDate(item.session_date)}</th><td>{item.label}</td><td>{item.attended ? formatScore(item.percentage) : "—"}</td><td>{item.attended ? "Attended" : "Absent"}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="teacher-student-progress-panel">
        <div className="teacher-student-progress-section-heading is-split">
          <div><p>Follow-up</p><h4>Recent records</h4></div>
          <span>{progress.follow_ups.counts.open} open · {progress.follow_ups.counts.in_progress} in progress · {progress.follow_ups.counts.resolved} resolved</span>
        </div>
        {progress.follow_ups.recent.length === 0 ? (
          <p className="teacher-student-progress-muted">No follow-up records for this student.</p>
        ) : (
          <div className="teacher-student-progress-follow-ups">
            {progress.follow_ups.recent.map((entry) => (
              <article key={entry.id}>
                <div><strong>{entry.category} · {entry.status}</strong><span>{formatDate(entry.date)} · {entry.teacher_name}</span></div>
                {entry.details && <p>{entry.details}</p>}
                {entry.action_plan && <p><strong>Action plan:</strong> {entry.action_plan}</p>}
                {entry.comment && <p>{entry.comment}</p>}
              </article>
            ))}
          </div>
        )}
      </section>
    </section>
  );
}
