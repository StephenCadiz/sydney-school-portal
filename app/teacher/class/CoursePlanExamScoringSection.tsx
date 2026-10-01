"use client";

import { useCallback, useEffect, useState } from "react";

import { supabase } from "../../../lib/supabase";

type ScoreAssignment = {
  course_plan_day_id: string;
  exam_set_id: string;
  exam_part_id: string;
  exam_subpart_id?: string | null;
  part_label?: string | null;
  part_number?: number | null;
  purpose: "class_practice" | "homework";
  exam_number: number;
  exam_title: string | null;
  skill: string;
  skill_label: string;
  percentage: number | null;
};

type ScoreSnapshot = {
  assignments: ScoreAssignment[];
  skill_averages: Array<{ skill: string; label: string; percentage: number | null }>;
  test_percentages: Array<{ exam_number: number; percentage: number | null }>;
};

export default function CoursePlanExamScoringSection({
  classId,
  studentId,
  studentName,
}: {
  classId: string;
  studentId: string;
  studentName: string;
}) {
  const [snapshot, setSnapshot] = useState<ScoreSnapshot | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [savingKey, setSavingKey] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const { data } = await supabase.auth.getSession();
      if (!data.session?.access_token) throw new Error("Your session has expired.");
      const response = await fetch(
        `/api/teacher/classes/${encodeURIComponent(classId)}/course-planning/scores?student_id=${encodeURIComponent(studentId)}`,
        { headers: { Authorization: `Bearer ${data.session.access_token}` }, cache: "no-store" }
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Unable to load Course Plan scores.");
      const next = payload as ScoreSnapshot;
      setSnapshot(next);
      setValues(Object.fromEntries((next.assignments || []).map((item) => [
        `${item.course_plan_day_id}:${item.exam_subpart_id || item.exam_part_id}:${item.purpose}`,
        item.percentage === null ? "" : String(item.percentage),
      ])));
    } catch (caught) {
      setSnapshot(null);
      setError(caught instanceof Error ? caught.message : "Unable to load Course Plan scores.");
    } finally {
      setLoading(false);
    }
  }, [classId, studentId]);

  useEffect(() => { void load(); }, [load]);

  async function save(item: ScoreAssignment) {
    const key = `${item.course_plan_day_id}:${item.exam_subpart_id || item.exam_part_id}:${item.purpose}`;
    const score = Number(values[key]);
    if (!Number.isFinite(score) || score < 0 || score > 100) {
      setError("Enter a percentage from 0 to 100.");
      return;
    }
    setSavingKey(key);
    setError("");
    setMessage("");
    try {
      const { data } = await supabase.auth.getSession();
      if (!data.session?.access_token) throw new Error("Your session has expired.");
      const response = await fetch(`/api/teacher/classes/${encodeURIComponent(classId)}/course-planning/scores`, {
        method: "POST",
        headers: { Authorization: `Bearer ${data.session.access_token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          student_id: studentId,
          course_plan_day_id: item.course_plan_day_id,
          exam_set_id: item.exam_set_id,
          exam_part_id: item.exam_part_id,
          exam_subpart_id: item.exam_subpart_id || null,
          purpose: item.purpose,
          percentage: score,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Unable to save the exam score.");
      setSnapshot(payload as ScoreSnapshot);
      setMessage("Exam part score saved.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to save the exam score.");
    } finally {
      setSavingKey("");
    }
  }

  return (
    <section className="course-plan-exam-scoring" aria-labelledby="course-plan-exam-scoring-heading">
      <div className="course-plan-exam-scoring-heading">
        <div><span>Express / Intensive</span><h3 id="course-plan-exam-scoring-heading">Cambridge exam-part scores</h3><p>Enter a percentage for each completed non-speaking part for {studentName}.</p></div>
        <button type="button" onClick={() => void load()} disabled={loading || Boolean(savingKey)}>Refresh</button>
      </div>
      {error && <p className="student-workspace-error" role="alert">{error}</p>}
      {message && <p className="student-workspace-success" role="status">{message}</p>}
      {loading ? <p>Loading exam-part scores...</p> : !snapshot?.assignments.length ? <p>No Express or Intensive exam parts are assigned yet.</p> : (
        <>
          <div className="course-plan-exam-score-list">
            {snapshot.assignments.map((item) => {
              const key = `${item.course_plan_day_id}:${item.exam_subpart_id || item.exam_part_id}:${item.purpose}`;
              const busy = savingKey === key;
              return <div className="course-plan-exam-score-row" key={key}>
                <div><strong>Exam {item.exam_number}{item.exam_title ? ` · ${item.exam_title}` : ""}</strong><span>{item.skill_label}{item.part_label ? ` · ${item.part_label}` : ""} · {item.purpose === "homework" ? "Homework" : "Classwork"}</span></div>
                <label><span>Percentage</span><input type="number" min="0" max="100" step="0.1" value={values[key] || ""} onChange={(event) => setValues((current) => ({ ...current, [key]: event.target.value }))} aria-label={`Score for Exam ${item.exam_number} ${item.skill_label}`} disabled={Boolean(savingKey)} /></label>
                <button type="button" onClick={() => void save(item)} disabled={Boolean(savingKey)}>{busy ? "Saving..." : item.percentage === null ? "Save score" : "Update score"}</button>
              </div>;
            })}
          </div>
          <div className="course-plan-exam-score-summaries">
            {snapshot.skill_averages.map((average) => <span key={average.skill}><strong>{average.label}</strong> {average.percentage === null ? "Incomplete" : `${average.percentage.toFixed(1)}%`}</span>)}
            {snapshot.test_percentages.map((test) => <span key={test.exam_number}><strong>Exam {test.exam_number}</strong> {test.percentage === null ? "Incomplete" : `${test.percentage.toFixed(1)}%`}</span>)}
          </div>
        </>
      )}
    </section>
  );
}
