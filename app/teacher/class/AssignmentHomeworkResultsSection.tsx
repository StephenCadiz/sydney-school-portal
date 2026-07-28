"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { supabase } from "../../../lib/supabase";

type Assignment = {
  id: string;
  source: "assignment";
  exam: { number: number; title: string | null };
  part: { type: string; label: string };
  due_date: string | null;
  status: "Current" | "Overdue";
};

function formatDate(value: string | null) {
  if (!value) return "—";
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : value;
}

export default function AssignmentHomeworkResultsSection({
  classId,
  studentId,
  studentName,
}: {
  classId: string;
  studentId: string;
  studentName: string;
}) {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [results, setResults] = useState<any[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [percentage, setPercentage] = useState("");
  const [comments, setComments] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const errorRef = useRef<HTMLDivElement | null>(null);
  const mutationBusy = saving || Boolean(deletingId);

  const load = useCallback(async () => {
    if (!classId || !studentId) {
      setAssignments([]);
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error("Your session has expired.");
      const headers = { Authorization: `Bearer ${token}` };
      const [homeworkResponse, resultsResponse] = await Promise.all([
        fetch(`/api/teacher/classes/${classId}/homework`, { headers }),
        fetch(
          `/api/teacher/classes/${classId}/homework/results?student_id=${encodeURIComponent(
            studentId
          )}`,
          { headers }
        ),
      ]);
      const [homeworkPayload, resultsPayload] = await Promise.all([
        homeworkResponse.json().catch(() => ({})),
        resultsResponse.json().catch(() => ({})),
      ]);
      if (!homeworkResponse.ok) {
        throw new Error(homeworkPayload.error || "Unable to load assigned homework.");
      }
      if (!resultsResponse.ok) {
        throw new Error(resultsPayload.error || "Unable to load assignment results.");
      }
      setAssignments(
        (homeworkPayload.homework || []).filter(
          (item: any) => item.source === "assignment"
        )
      );
      setResults(resultsPayload.results || []);
    } catch (caught) {
      setAssignments([]);
      setResults([]);
      setError(caught instanceof Error ? caught.message : "Unable to load assignment results.");
    } finally {
      setLoading(false);
    }
  }, [classId, studentId]);

  useEffect(() => {
    setSelectedId("");
    setPercentage("");
    setComments("");
    void load();
  }, [load]);

  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);

  const resultByAssignment = useMemo(
    () =>
      new Map(
        results.map((result) => [
          String(result.cambridge_exam_assignment_id),
          result,
        ])
      ),
    [results]
  );

  function edit(assignment: Assignment) {
    const result = resultByAssignment.get(assignment.id);
    setSelectedId(assignment.id);
    setPercentage(
      result?.percentage === null || result?.percentage === undefined
        ? ""
        : String(result.percentage)
    );
    setComments(String(result?.comments || ""));
    setError("");
    setMessage("");
  }

  async function request(method: "POST" | "DELETE", assignmentId: string) {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new Error("Your session has expired.");
    const body =
      method === "POST"
        ? {
            student_id: studentId,
            assignment_id: assignmentId,
            percentage: Number(percentage),
            comments,
          }
        : { student_id: studentId, assignment_id: assignmentId };
    const response = await fetch(
      `/api/teacher/classes/${classId}/homework/results`,
      {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      }
    );
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "Unable to update assignment result.");
  }

  async function save() {
    if (mutationBusy) return;
    const score = Number(percentage);
    if (!selectedId || percentage.trim() === "" || !Number.isFinite(score) || score < 0 || score > 100) {
      setError("Select an assignment and enter a percentage from 0 to 100.");
      return;
    }
    setSaving(true);
    setError("");
    setMessage("");
    try {
      await request("POST", selectedId);
      setMessage("Assignment result saved.");
      setSelectedId("");
      setPercentage("");
      setComments("");
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to save assignment result.");
    } finally {
      setSaving(false);
    }
  }

  async function remove(assignmentId: string) {
    if (mutationBusy) return;
    if (!confirm("Delete this assignment result?")) return;
    setError("");
    setMessage("");
    setDeletingId(assignmentId);
    try {
      await request("DELETE", assignmentId);
      setMessage("Assignment result deleted.");
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to delete assignment result.");
    } finally {
      setDeletingId("");
    }
  }

  return (
    <section className="assignment-homework-results">
      <div className="assignment-homework-results-heading">
        <div>
          <span>Assignment era</span>
          <h3>Assigned Exam Homework</h3>
          <p>Grade released Exam Bank assignments for {studentName}.</p>
        </div>
        <button type="button" onClick={() => void load()} disabled={loading || mutationBusy}>Refresh</button>
      </div>
      {error && (
        <div
          className="student-workspace-error"
          role="alert"
          ref={errorRef}
          tabIndex={-1}
        >
          {error}
        </div>
      )}
      {message && <div className="student-workspace-success" role="status">{message}</div>}
      {loading ? (
        <p>Loading assigned homework...</p>
      ) : assignments.length === 0 ? (
        <p>No released assignment homework for this class.</p>
      ) : (
        <div className="assignment-homework-result-list">
          {assignments.map((assignment) => {
            const result = resultByAssignment.get(assignment.id);
            return (
              <div key={assignment.id} className="assignment-homework-result-row">
                <div>
                  <strong>Exam {assignment.exam.number} · {assignment.part.label}</strong>
                  <span>
                    Due {formatDate(assignment.due_date)} · {assignment.status}
                  </span>
                </div>
                <div>
                  <strong>{result ? `${Math.round(Number(result.percentage))}%` : "Not graded"}</strong>
                  {result?.comments && <span>{result.comments}</span>}
                </div>
                <div>
                  <button
                    type="button"
                    onClick={() => edit(assignment)}
                    disabled={saving || Boolean(deletingId)}
                  >
                    {result ? "Edit" : "Grade"}
                  </button>
                  {result && (
                    <button
                      type="button"
                      onClick={() => void remove(assignment.id)}
                      disabled={saving || Boolean(deletingId)}
                    >
                      {deletingId === assignment.id ? "Deleting..." : "Delete"}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
      {selectedId && (
        <div className="assignment-homework-result-form">
          <label>
            Percentage
            <input
              type="number"
              min="0"
              max="100"
              step="0.1"
              value={percentage}
              onChange={(event) => setPercentage(event.target.value)}
              disabled={mutationBusy}
            />
          </label>
          <label>
            Comments
            <textarea
              rows={3}
              value={comments}
              onChange={(event) => setComments(event.target.value)}
              disabled={mutationBusy}
            />
          </label>
          <div>
            <button type="button" onClick={() => void save()} disabled={mutationBusy}>
              {saving ? "Saving..." : "Save Result"}
            </button>
            <button
              type="button"
              onClick={() => setSelectedId("")}
              disabled={saving || Boolean(deletingId)}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
