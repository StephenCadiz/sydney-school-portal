"use client";

import { useEffect, useMemo, useState } from "react";

import { getCambridgeReadingSkillLabel } from "../../../lib/homework";
import {
  calculateMockResultAverage,
  canTeacherEditMockResult,
  canTeacherRemoveMockResult,
  canTeacherSubmitMockResult,
  getMockResultStatusLabel,
  hasCompleteMockResultScores,
  toMockScore,
  type MockResultWorkflowRow,
} from "../../../lib/mockResultWorkflow";
import { supabase } from "../../../lib/supabase";

type StudentMockResultsSectionProps = {
  classId: string;
  studentId: string;
  studentName: string;
  levelName: string;
  teacherId?: string;
};

function formatPercent(value: unknown) {
  const number = toMockScore(value);
  if (number === null) return "-";
  const rounded = Math.round(number * 10) / 10;
  return `${Number.isInteger(rounded) ? rounded : rounded.toFixed(1)}%`;
}

function formatDateTime(value: string | null) {
  if (!value) return "";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Madrid",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(value));
}

function mockTitle(result: MockResultWorkflowRow) {
  return result.mock_number ? `Mock ${result.mock_number}` : result.title;
}

function compareMockResults(
  first: MockResultWorkflowRow,
  second: MockResultWorkflowRow
) {
  return (
    first.mock_number - second.mock_number || first.id.localeCompare(second.id)
  );
}

function ProgressBar({ value }: { value: unknown }) {
  const number = toMockScore(value);
  const width = number === null ? 0 : Math.max(0, Math.min(100, number));

  return (
    <div className="student-workspace-progress-track">
      <div
        className="student-workspace-progress-fill"
        style={{ width: `${width}%` }}
      />
    </div>
  );
}

export default function StudentMockResultsSection({
  classId,
  studentId,
  studentName,
  levelName,
}: StudentMockResultsSectionProps) {
  const [results, setResults] = useState<MockResultWorkflowRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [resultsLoadFailed, setResultsLoadFailed] = useState(false);
  const [mockNumber, setMockNumber] = useState("1");
  const [reading, setReading] = useState("");
  const [writing, setWriting] = useState("");
  const [listening, setListening] = useState("");
  const [speaking, setSpeaking] = useState("");
  const [comments, setComments] = useState("");
  const [editingMockId, setEditingMockId] = useState("");
  const [savingAction, setSavingAction] = useState<
    "save_draft" | "submit" | ""
  >("");
  const [removingMockId, setRemovingMockId] = useState("");
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const readingLabel = getCambridgeReadingSkillLabel(levelName);
  const mockAverage = useMemo(
    () => calculateMockResultAverage([reading, writing, listening, speaking]),
    [reading, writing, listening, speaking]
  );
  const editingResult = useMemo(
    () => results.find((result) => result.id === editingMockId) || null,
    [editingMockId, results]
  );

  async function request(
    url: string,
    init: RequestInit = {}
  ): Promise<Record<string, any>> {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error("Authentication required.");

    const response = await fetch(url, {
      ...init,
      cache: "no-store",
      headers: {
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...init.headers,
        Authorization: `Bearer ${session.access_token}`,
      },
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.error || "Unable to update the Mock Result.");
    }
    return payload;
  }

  async function loadResults() {
    if (!classId || !studentId) {
      setResults([]);
      setResultsLoadFailed(false);
      return;
    }

    setLoading(true);
    setErrorMessage("");
    setResultsLoadFailed(false);

    try {
      const params = new URLSearchParams({
        class_id: classId,
        student_id: studentId,
      });
      const payload = await request(`/api/teacher/mock-results?${params}`);
      setResults(
        ([...(payload.results || [])] as MockResultWorkflowRow[]).sort(
          compareMockResults
        )
      );
    } catch (error) {
      console.error("Unable to load Mock Results:", error);
      setResults([]);
      setResultsLoadFailed(true);
      setErrorMessage(
        error instanceof Error ? error.message : "Unable to load Mock Results."
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadResults();
  }, [classId, studentId]);

  function clearForm() {
    setMockNumber("1");
    setReading("");
    setWriting("");
    setListening("");
    setSpeaking("");
    setComments("");
    setEditingMockId("");
  }

  function getFormPayload(action: "save_draft" | "submit") {
    const rawScores = [reading, writing, listening, speaking];
    if (
      rawScores.some(
        (value) =>
          value.trim() &&
          (toMockScore(value) === null ||
            (toMockScore(value) as number) < 0 ||
            (toMockScore(value) as number) > 100)
      )
    ) {
      throw new Error("Mock Exam scores must be between 0 and 100.");
    }

    const payload = {
      result_id: editingMockId || null,
      class_id: classId,
      student_id: studentId,
      mock_number: Number(mockNumber),
      reading: toMockScore(reading),
      writing: toMockScore(writing),
      listening: toMockScore(listening),
      speaking: toMockScore(speaking),
      comments,
      action,
    };

    if (!Number.isInteger(payload.mock_number) || payload.mock_number < 1) {
      throw new Error("Mock number must be a positive whole number.");
    }
    if (action === "submit" && !hasCompleteMockResultScores(payload)) {
      throw new Error(
        "Enter all four Mock Exam scores before submitting for Admin review."
      );
    }
    return payload;
  }

  async function saveMockResult(action: "save_draft" | "submit") {
    setMessage("");
    setErrorMessage("");
    if (resultsLoadFailed) {
      setErrorMessage(
        "Results cannot be saved until the existing records load successfully."
      );
      return;
    }

    try {
      const body = getFormPayload(action);
      setSavingAction(action);
      const payload = await request("/api/teacher/mock-results", {
        method: "POST",
        body: JSON.stringify(body),
      });
      setResults(
        ([...(payload.results || [])] as MockResultWorkflowRow[]).sort(
          compareMockResults
        )
      );
      setMessage(
        action === "submit"
          ? "Mock Result submitted for Admin review."
          : editingMockId
            ? "Mock Result draft updated."
            : "Mock Result saved as Draft."
      );
      clearForm();
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Unable to save the Mock Result."
      );
    } finally {
      setSavingAction("");
    }
  }

  async function submitExisting(result: MockResultWorkflowRow) {
    setMessage("");
    setErrorMessage("");
    if (!hasCompleteMockResultScores(result)) {
      setErrorMessage("Complete all four scores before submitting for review.");
      return;
    }

    try {
      setSavingAction("submit");
      const payload = await request("/api/teacher/mock-results", {
        method: "POST",
        body: JSON.stringify({
          result_id: result.id,
          class_id: classId,
          student_id: studentId,
          mock_number: result.mock_number,
          reading: result.reading,
          writing: result.writing,
          listening: result.listening,
          speaking: result.speaking,
          comments: result.comments || "",
          action: "submit",
        }),
      });
      setResults(
        ([...(payload.results || [])] as MockResultWorkflowRow[]).sort(
          compareMockResults
        )
      );
      setMessage("Mock Result submitted for Admin review.");
      clearForm();
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to submit the Mock Result."
      );
    } finally {
      setSavingAction("");
    }
  }

  function editMock(result: MockResultWorkflowRow) {
    if (!canTeacherEditMockResult(result.status)) return;
    setEditingMockId(result.id);
    setMockNumber(String(result.mock_number || 1));
    setReading(result.reading === null ? "" : String(result.reading));
    setWriting(result.writing === null ? "" : String(result.writing));
    setListening(result.listening === null ? "" : String(result.listening));
    setSpeaking(result.speaking === null ? "" : String(result.speaking));
    setComments(result.comments || "");
    setMessage("");
    setErrorMessage("");
  }

  async function removeMockResult(result: MockResultWorkflowRow) {
    const discardingRevision = result.approved_version_available;
    const confirmed = window.confirm(
      discardingRevision
        ? "Discard these unapproved changes and keep the last published result?"
        : "Delete this Mock Result draft?"
    );
    if (!confirmed) return;

    setRemovingMockId(result.id);
    setMessage("");
    setErrorMessage("");
    try {
      const payload = await request("/api/teacher/mock-results", {
        method: "DELETE",
        body: JSON.stringify({
          result_id: result.id,
          class_id: classId,
          student_id: studentId,
        }),
      });
      setResults(
        ([...(payload.results || [])] as MockResultWorkflowRow[]).sort(
          compareMockResults
        )
      );
      setMessage(
        discardingRevision
          ? "Unapproved changes discarded. The published result is unchanged."
          : "Mock Result draft deleted."
      );
      if (editingMockId === result.id) clearForm();
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to remove the Mock Result."
      );
    } finally {
      setRemovingMockId("");
    }
  }

  return (
    <section className="student-workspace-section mock-result-workflow-section">
      <div className="student-workspace-section-header">
        <h3>Mock Exams</h3>
        <p>
          Enter results for {studentName}. Admin publishes approved results to
          the Student Portal.
        </p>
      </div>

      {message && (
        <div className="student-workspace-success" role="status">
          {message}
        </div>
      )}
      {errorMessage && (
        <div className="student-workspace-error" role="alert">
          {errorMessage}
        </div>
      )}

      <div className="student-workspace-form-card">
        {resultsLoadFailed && (
          <p className="student-workspace-muted">
            Results cannot be saved until the existing records load successfully.
          </p>
        )}

        {editingResult?.approved_version_available && (
          <div className="student-workspace-context-note is-existing">
            Saving changes creates an unapproved revision. The last Admin-approved
            result remains visible to the student until the revision is published.
          </div>
        )}

        {editingResult?.status === "changes_required" &&
          editingResult.review_note && (
            <div className="mock-result-workflow-review-note">
              <strong>Admin correction note</strong>
              <p>{editingResult.review_note}</p>
            </div>
          )}

        <div className="student-workspace-form-grid">
          <label className="student-workspace-field">
            <span>Mock number</span>
            <input
              type="number"
              min={1}
              value={mockNumber}
              onChange={(event) => setMockNumber(event.target.value)}
            />
          </label>

          {[
            { label: readingLabel, value: reading, setter: setReading },
            { label: "Writing", value: writing, setter: setWriting },
            { label: "Listening", value: listening, setter: setListening },
            { label: "Speaking", value: speaking, setter: setSpeaking },
          ].map((field) => (
            <label className="student-workspace-field" key={field.label}>
              <span>{field.label}</span>
              <input
                type="number"
                min={0}
                max={100}
                value={field.value}
                onChange={(event) => field.setter(event.target.value)}
              />
            </label>
          ))}

          <label className="student-workspace-field">
            <span>Average</span>
            <output>{formatPercent(mockAverage)}</output>
          </label>
        </div>

        <label className="student-workspace-field">
          <span>Teacher comment</span>
          <textarea
            rows={4}
            maxLength={5000}
            value={comments}
            onChange={(event) => setComments(event.target.value)}
          />
        </label>

        <div className="student-workspace-actions">
          <button
            type="button"
            className="student-workspace-secondary-button"
            onClick={() => void saveMockResult("save_draft")}
            disabled={Boolean(savingAction) || resultsLoadFailed}
          >
            {savingAction === "save_draft" ? "Saving..." : "Save Draft"}
          </button>
          <button
            type="button"
            className="student-workspace-primary-button"
            onClick={() => void saveMockResult("submit")}
            disabled={Boolean(savingAction) || resultsLoadFailed}
          >
            {savingAction === "submit"
              ? "Submitting..."
              : "Submit for Admin Review"}
          </button>
          {editingMockId && (
            <button
              type="button"
              className="student-workspace-secondary-button"
              onClick={clearForm}
              disabled={Boolean(savingAction)}
            >
              Cancel
            </button>
          )}
        </div>
      </div>

      <div className="student-workspace-list">
        <h4>Saved Mock Results</h4>
        {loading ? (
          <p className="student-workspace-muted">Loading Mock Results...</p>
        ) : results.length === 0 ? (
          <p className="student-workspace-muted">No Mock Exam results yet.</p>
        ) : (
          results.map((result) => {
            const canEdit = canTeacherEditMockResult(result.status);
            const canSubmit = canTeacherSubmitMockResult(result.status);
            const canRemove = canTeacherRemoveMockResult(result.status);
            const submittedDate = formatDateTime(result.submitted_at);

            return (
              <article className="student-workspace-item" key={result.id}>
                <div className="student-workspace-item-header">
                  <div>
                    <strong>{mockTitle(result)}</strong>
                    <span
                      className={`student-workspace-badge is-${result.status.replace(
                        "_",
                        "-"
                      )}`}
                    >
                      {getMockResultStatusLabel(result.status)}
                    </span>
                  </div>
                  <strong>Average {formatPercent(result.overall)}</strong>
                </div>

                <div className="student-workspace-score-grid">
                  {[
                    { label: readingLabel, value: result.reading },
                    { label: "Writing", value: result.writing },
                    { label: "Listening", value: result.listening },
                    { label: "Speaking", value: result.speaking },
                  ].map((item) => (
                    <div key={item.label}>
                      <span>{item.label}</span>
                      <strong>{formatPercent(item.value)}</strong>
                      <ProgressBar value={item.value} />
                    </div>
                  ))}
                </div>

                {result.comments && (
                  <div className="mock-result-workflow-comment">
                    <strong>Teacher comment</strong>
                    <p>{result.comments}</p>
                  </div>
                )}

                {result.review_note && (
                  <div className="mock-result-workflow-review-note">
                    <strong>Admin correction note</strong>
                    <p>{result.review_note}</p>
                  </div>
                )}

                {result.status === "awaiting_review" && submittedDate && (
                  <p className="mock-result-workflow-date">
                    Submitted {submittedDate}
                  </p>
                )}

                <div className="student-workspace-action-footer">
                  <span
                    className={`student-workspace-visibility ${
                      result.status === "published"
                        ? "is-visible"
                        : "is-draft"
                    }`}
                  >
                    {result.status === "published"
                      ? "Visible to student"
                      : result.approved_version_available
                        ? "Previous approved version remains visible"
                        : "Not visible to student"}
                  </span>

                  <div className="student-workspace-actions is-compact">
                    {canSubmit && (
                      <button
                        type="button"
                        className="student-workspace-primary-button"
                        onClick={() => void submitExisting(result)}
                        disabled={Boolean(savingAction)}
                      >
                        {savingAction === "submit"
                          ? "Submitting..."
                          : "Submit for Admin Review"}
                      </button>
                    )}
                    {canEdit && (
                      <button
                        type="button"
                        className="student-workspace-secondary-button"
                        onClick={() => editMock(result)}
                      >
                        Edit Result
                      </button>
                    )}
                    {canRemove && (
                      <button
                        type="button"
                        className="student-workspace-danger-button"
                        onClick={() => void removeMockResult(result)}
                        disabled={removingMockId === result.id}
                      >
                        {removingMockId === result.id
                          ? "Removing..."
                          : result.approved_version_available
                            ? "Discard Changes"
                            : "Delete Draft"}
                      </button>
                    )}
                  </div>
                </div>
              </article>
            );
          })
        )}
      </div>
    </section>
  );
}
