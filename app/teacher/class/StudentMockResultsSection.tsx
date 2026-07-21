"use client";

import { useEffect, useMemo, useState } from "react";

import { getCambridgeReadingSkillLabel } from "../../../lib/homework";
import { supabase } from "../../../lib/supabase";

type StudentMockResultsSectionProps = {
  classId: string;
  studentId: string;
  studentName: string;
  levelName: string;
  teacherId?: string;
};

function toNumber(value: any) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const number = Number(value);

  return Number.isFinite(number) ? number : null;
}

function formatPercent(value: any) {
  const number = toNumber(value);

  if (number === null) {
    return "-";
  }

  return `${Math.round(number)}%`;
}

function getMockAverage(result: any) {
  const reading = toNumber(result.reading);
  const writing = toNumber(result.writing);
  const listening = toNumber(result.listening);
  const speaking = toNumber(result.speaking);

  if (
    reading !== null &&
    writing !== null &&
    listening !== null &&
    speaking !== null
  ) {
    return (reading + writing + listening + speaking) / 4;
  }

  return toNumber(result.overall);
}

function isMockResultPublished(result: any) {
  return Boolean(result?.published_at);
}

function hasCompleteMockScores(result: any) {
  return (
    result.reading !== null &&
    result.reading !== undefined &&
    result.reading !== "" &&
    result.writing !== null &&
    result.writing !== undefined &&
    result.writing !== "" &&
    result.listening !== null &&
    result.listening !== undefined &&
    result.listening !== "" &&
    result.speaking !== null &&
    result.speaking !== undefined &&
    result.speaking !== ""
  );
}

function mockTitle(result: any) {
  if (result.mock_number) {
    return `Mock ${result.mock_number}`;
  }

  return result.title || "Mock Exam";
}

function getMockSortNumber(result: any) {
  const mockNumber = Number(result?.mock_number);

  return Number.isFinite(mockNumber) && mockNumber > 0
    ? mockNumber
    : Number.MAX_SAFE_INTEGER;
}

function compareMockResults(first: any, second: any) {
  const mockDifference = getMockSortNumber(first) - getMockSortNumber(second);

  if (mockDifference !== 0) {
    return mockDifference;
  }

  const titleDifference = String(first?.title || "").localeCompare(
    String(second?.title || "")
  );

  if (titleDifference !== 0) {
    return titleDifference;
  }

  return String(first?.id || "").localeCompare(String(second?.id || ""));
}

function ProgressBar({ value }: { value: any }) {
  const number = toNumber(value);
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
  teacherId = "",
}: StudentMockResultsSectionProps) {
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [resultsLoadFailed, setResultsLoadFailed] = useState(false);
  const [mockNumber, setMockNumber] = useState("1");
  const [reading, setReading] = useState("");
  const [writing, setWriting] = useState("");
  const [listening, setListening] = useState("");
  const [speaking, setSpeaking] = useState("");
  const [comments, setComments] = useState("");
  const [editingMockId, setEditingMockId] = useState("");
  const [saving, setSaving] = useState(false);
  const [publishingMockId, setPublishingMockId] = useState("");
  const [unpublishingMockId, setUnpublishingMockId] = useState("");
  const [pendingUnpublishResult, setPendingUnpublishResult] = useState<any>(null);
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const readingLabel = getCambridgeReadingSkillLabel(levelName);
  const mockAverage = useMemo(() => {
    const values = [reading, writing, listening, speaking].map(toNumber);

    if (values.some((value) => value === null)) {
      return null;
    }

    return (
      (values[0] as number) +
      (values[1] as number) +
      (values[2] as number) +
      (values[3] as number)
    ) / 4;
  }, [reading, writing, listening, speaking]);

  async function loadResults() {
    if (!classId || !studentId) {
      setResults([]);
      setResultsLoadFailed(false);
      return;
    }

    setLoading(true);
    setErrorMessage("");
    setResultsLoadFailed(false);

    const { data, error } = await supabase
      .from("results")
      .select("*")
      .eq("class_id", classId)
      .eq("student_id", studentId);

    if (error) {
      console.error("Failed to load mock results", error);
      setResults([]);
      setResultsLoadFailed(true);
      setErrorMessage("Unable to load mock results.");
      setLoading(false);
      return;
    }

    setResults(
      (data || [])
        .filter((result) => result.result_type === "mock")
        .sort(compareMockResults)
    );
    setResultsLoadFailed(false);
    setLoading(false);
  }

  useEffect(() => {
    loadResults();
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

  async function getSafeTeacherId() {
    if (teacherId) return teacherId;

    const {
      data: { session },
    } = await supabase.auth.getSession();

    return session?.user.id || null;
  }

  async function saveMockResult() {
    const readingScore = toNumber(reading);
    const writingScore = toNumber(writing);
    const listeningScore = toNumber(listening);
    const speakingScore = toNumber(speaking);

    setMessage("");
    setErrorMessage("");

    if (resultsLoadFailed) {
      setErrorMessage(
        "Results cannot be saved until the existing records load successfully."
      );
      return;
    }

    if (
      readingScore === null ||
      writingScore === null ||
      listeningScore === null ||
      speakingScore === null
    ) {
      setErrorMessage("Enter valid scores for all mock exam skills.");
      return;
    }

    setSaving(true);

    const average =
      (readingScore + writingScore + listeningScore + speakingScore) / 4;
    const currentTeacherId = await getSafeTeacherId();
    const wasPublished =
      editingMockId &&
      isMockResultPublished(results.find((result) => result.id === editingMockId));
    const payload: any = {
      class_id: classId,
      student_id: studentId,
      result_type: "mock",
      mock_number: Number(mockNumber) || 1,
      title: `Mock ${Number(mockNumber) || 1}`,
      reading: readingScore,
      writing: writingScore,
      listening: listeningScore,
      speaking: speakingScore,
      overall: average,
      comments,
      published_at: null,
    };

    if (currentTeacherId) {
      payload.teacher_id = currentTeacherId;
    }

    const { error } = editingMockId
      ? await supabase.from("results").update(payload).eq("id", editingMockId)
      : await supabase.from("results").insert([payload]);

    if (error) {
      console.error("Unable to save mock result:", error);
      setErrorMessage(error.message);
      setSaving(false);
      return;
    }

    setMessage(
      editingMockId
        ? wasPublished
          ? "Mock result updated and returned to Draft. Publish it when ready."
          : "Mock exam result updated."
        : "Mock exam result saved as Draft."
    );
    clearForm();
    setSaving(false);
    await loadResults();
  }

  function editMock(result: any) {
    setEditingMockId(result.id);
    setMockNumber(String(result.mock_number || 1));
    setReading(
      result.reading === null || result.reading === undefined
        ? ""
        : String(result.reading)
    );
    setWriting(
      result.writing === null || result.writing === undefined
        ? ""
        : String(result.writing)
    );
    setListening(
      result.listening === null || result.listening === undefined
        ? ""
        : String(result.listening)
    );
    setSpeaking(
      result.speaking === null || result.speaking === undefined
        ? ""
        : String(result.speaking)
    );
    setComments(result.comments || "");
  }

  async function deleteMockResult(id: string) {
    const confirmed = confirm("Delete this mock exam result?");

    if (!confirmed) return;

    setMessage("");
    setErrorMessage("");

    const { error } = await supabase.from("results").delete().eq("id", id);

    if (error) {
      console.error("Unable to delete mock result:", error);
      setErrorMessage(error.message);
      return;
    }

    setMessage("Mock exam result deleted.");
    await loadResults();
  }

  async function publishMockResult(result: any) {
    if (!result?.id || publishingMockId || unpublishingMockId) return;

    setMessage("");
    setErrorMessage("");

    if (!hasCompleteMockScores(result)) {
      setErrorMessage("Complete all four mock scores before publishing.");
      return;
    }

    setPublishingMockId(result.id);

    const { error } = await supabase
      .from("results")
      .update({ published_at: new Date().toISOString() })
      .eq("id", result.id)
      .eq("class_id", classId)
      .eq("result_type", "mock");

    if (error) {
      console.error("Unable to publish mock result:", error);
      setErrorMessage("The mock result could not be published. Please try again.");
      setPublishingMockId("");
      return;
    }

    setMessage("Mock result published successfully.");
    setPublishingMockId("");
    await loadResults();
  }

  function requestUnpublishMockResult(result: any) {
    setMessage("");
    setErrorMessage("");
    setPendingUnpublishResult(result);
  }

  async function confirmUnpublishMockResult() {
    if (!pendingUnpublishResult?.id || unpublishingMockId) return;

    const resultId = pendingUnpublishResult.id;
    setUnpublishingMockId(resultId);
    setMessage("");
    setErrorMessage("");

    const { error } = await supabase
      .from("results")
      .update({ published_at: null })
      .eq("id", resultId)
      .eq("class_id", classId)
      .eq("result_type", "mock");

    if (error) {
      console.error("Unable to unpublish mock result:", error);
      setErrorMessage("The mock result could not be unpublished. Please try again.");
      setUnpublishingMockId("");
      return;
    }

    setMessage("Mock result returned to Draft.");
    setUnpublishingMockId("");
    setPendingUnpublishResult(null);
    await loadResults();
  }

  return (
    <section className="student-workspace-section">
      <div className="student-workspace-section-header">
        <h3>Mock Exams</h3>
        <p>Enter, correct and publish mock exam results for {studentName}.</p>
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
          <span>Comments</span>
          <textarea
            rows={4}
            value={comments}
            onChange={(event) => setComments(event.target.value)}
          />
        </label>

        <div className="student-workspace-actions">
          <button
            type="button"
            className="student-workspace-primary-button"
            onClick={saveMockResult}
            disabled={saving || resultsLoadFailed}
          >
            {saving
              ? "Saving..."
              : editingMockId
              ? "Save Mock Changes"
              : "Save Mock Result"}
          </button>

          {editingMockId && (
            <button
              type="button"
              className="student-workspace-secondary-button"
              onClick={clearForm}
            >
              Cancel
            </button>
          )}
        </div>
      </div>

      <div className="student-workspace-list">
        <h4>Saved Mock Results</h4>

        {loading ? (
          <p className="student-workspace-muted">Loading mock results...</p>
        ) : results.length === 0 ? (
          <p className="student-workspace-muted">No mock exam results yet.</p>
        ) : (
          results.map((result) => {
            const published = isMockResultPublished(result);
            const isPublishing = publishingMockId === result.id;
            const isUnpublishing = unpublishingMockId === result.id;

            return (
              <article className="student-workspace-item" key={result.id}>
                <div className="student-workspace-item-header">
                  <div>
                    <strong>{mockTitle(result)}</strong>
                    <span
                      className={`student-workspace-badge ${
                        published ? "is-published" : "is-draft"
                      }`}
                    >
                      {published ? "Published" : "Draft"}
                    </span>
                  </div>
                  <strong>Average {formatPercent(getMockAverage(result))}</strong>
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

                {result.comments && <p>{result.comments}</p>}

                <div className="student-workspace-action-footer">
                  <span
                    className={`student-workspace-visibility ${
                      published ? "is-visible" : "is-draft"
                    }`}
                  >
                    {published ? "Visible to student" : "Not visible to student"}
                  </span>

                  <div className="student-workspace-actions is-compact">
                    {published ? (
                      <button
                        type="button"
                        className="student-workspace-secondary-button"
                        onClick={() => requestUnpublishMockResult(result)}
                        disabled={isUnpublishing}
                      >
                        {isUnpublishing ? "Unpublishing..." : "Unpublish"}
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="student-workspace-primary-button"
                        onClick={() => publishMockResult(result)}
                        disabled={isPublishing}
                      >
                        {isPublishing ? "Publishing..." : "Publish"}
                      </button>
                    )}

                    <button
                      type="button"
                      className="student-workspace-secondary-button"
                      onClick={() => editMock(result)}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="student-workspace-danger-button"
                      onClick={() => deleteMockResult(result.id)}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </article>
            );
          })
        )}
      </div>

      {pendingUnpublishResult && (
        <div className="student-workspace-confirm-backdrop" role="presentation">
          <div
            className="student-workspace-confirm"
            role="dialog"
            aria-modal="true"
            aria-labelledby="student-workspace-unpublish-title"
          >
            <h4 id="student-workspace-unpublish-title">Unpublish Mock Result?</h4>
            <p>
              The marks will remain saved, but the student will no longer see
              this mock result until it is published again.
            </p>
            <div className="student-workspace-actions">
              <button
                type="button"
                className="student-workspace-secondary-button"
                onClick={() => setPendingUnpublishResult(null)}
                disabled={Boolean(unpublishingMockId)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="student-workspace-danger-button"
                onClick={confirmUnpublishMockResult}
                disabled={Boolean(unpublishingMockId)}
              >
                {unpublishingMockId ? "Unpublishing..." : "Unpublish"}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
