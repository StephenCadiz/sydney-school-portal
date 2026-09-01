"use client";

import { useEffect, useMemo, useState } from "react";

import AdminLayout from "../../components/layout/AdminLayout";
import { getCambridgeReadingSkillLabel } from "../../../lib/homework";
import {
  calculateMockResultAverage,
  getMockResultStatusLabel,
  toMockScore,
  type AdminMockReviewRow,
  type MockResultReviewStatus,
} from "../../../lib/mockResultWorkflow";
import { supabase } from "../../../lib/supabase";

type StatusFilter = "all" | MockResultReviewStatus;
type AdminEditAction =
  | "save_changes"
  | "save_and_publish"
  | "save_published";

type AdminEditForm = {
  reading: string;
  writing: string;
  listening: string;
  speaking: string;
  comments: string;
};

const emptyEditForm: AdminEditForm = {
  reading: "",
  writing: "",
  listening: "",
  speaking: "",
  comments: "",
};

const statusFilters: Array<{ value: StatusFilter; label: string }> = [
  { value: "awaiting_review", label: "Awaiting Admin Review" },
  { value: "changes_required", label: "Changes Required" },
  { value: "published", label: "Published" },
  { value: "all", label: "All" },
];

function formatScore(value: number | null) {
  if (value === null || !Number.isFinite(Number(value))) return "-";
  const rounded = Math.round(Number(value) * 10) / 10;
  return `${Number.isInteger(rounded) ? rounded : rounded.toFixed(1)}%`;
}

function formatDateTime(value: string | null) {
  if (!value) return "-";
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

function normalized(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

function uniqueOptions(
  rows: AdminMockReviewRow[],
  value: (row: AdminMockReviewRow) => string,
  label: (row: AdminMockReviewRow) => string
) {
  const options = new Map<string, string>();
  rows.forEach((row) => {
    const optionValue = value(row);
    if (optionValue && !options.has(optionValue)) {
      options.set(optionValue, label(row));
    }
  });
  return Array.from(options, ([optionValue, optionLabel]) => ({
    value: optionValue,
    label: optionLabel,
  })).sort((first, second) =>
    first.label.localeCompare(second.label, undefined, {
      numeric: true,
      sensitivity: "base",
    })
  );
}

export default function AdminMockResultsReviewPage() {
  const [rows, setRows] = useState<AdminMockReviewRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [statusFilter, setStatusFilter] =
    useState<StatusFilter>("awaiting_review");
  const [levelFilter, setLevelFilter] = useState("all");
  const [classFilter, setClassFilter] = useState("all");
  const [teacherFilter, setTeacherFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [reviewingId, setReviewingId] = useState("");
  const [reviewingAction, setReviewingAction] = useState<
    "publish" | "return" | AdminEditAction | ""
  >("");
  const [returningId, setReturningId] = useState("");
  const [returnNote, setReturnNote] = useState("");
  const [editingId, setEditingId] = useState("");
  const [editForm, setEditForm] = useState<AdminEditForm>(emptyEditForm);

  const editAverage = useMemo(
    () =>
      calculateMockResultAverage([
        editForm.reading,
        editForm.writing,
        editForm.listening,
        editForm.speaking,
      ]),
    [editForm]
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

  async function loadRows() {
    setLoading(true);
    setError("");
    try {
      const payload = await request("/api/admin/mock-results");
      setRows((payload.results || []) as AdminMockReviewRow[]);
    } catch (loadError) {
      console.error("Unable to load Admin Mock Result reviews:", loadError);
      setRows([]);
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Unable to load Mock Results for review."
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadRows();
  }, []);

  const counts = useMemo(() => {
    return rows.reduce<Record<MockResultReviewStatus, number>>(
      (summary, row) => ({
        ...summary,
        [row.status]: summary[row.status] + 1,
      }),
      { draft: 0, awaiting_review: 0, changes_required: 0, published: 0 }
    );
  }, [rows]);
  const levelOptions = useMemo(
    () => uniqueOptions(rows, (row) => row.level_id, (row) => row.level_name),
    [rows]
  );
  const classOptions = useMemo(
    () =>
      uniqueOptions(
        rows,
        (row) => row.class_id,
        (row) =>
          row.academic_year_label
            ? `${row.class_name} · ${row.academic_year_label}`
            : row.class_name
      ),
    [rows]
  );
  const teacherOptions = useMemo(
    () => uniqueOptions(rows, (row) => row.teacher_id, (row) => row.teacher_name),
    [rows]
  );
  const visibleRows = useMemo(() => {
    const query = normalized(search);
    return rows.filter((row) => {
      const matchesStatus =
        statusFilter === "all" || row.status === statusFilter;
      const matchesLevel =
        levelFilter === "all" || row.level_id === levelFilter;
      const matchesClass =
        classFilter === "all" || row.class_id === classFilter;
      const matchesTeacher =
        teacherFilter === "all" || row.teacher_id === teacherFilter;
      const matchesSearch =
        !query ||
        normalized(row.student_name).includes(query) ||
        normalized(row.teacher_name).includes(query) ||
        normalized(row.class_name).includes(query);
      return (
        matchesStatus &&
        matchesLevel &&
        matchesClass &&
        matchesTeacher &&
        matchesSearch
      );
    });
  }, [rows, statusFilter, levelFilter, classFilter, teacherFilter, search]);

  async function reviewResult(
    resultId: string,
    action: "publish" | "return"
  ) {
    if (action === "publish") {
      const confirmed = window.confirm(
        "Publish this Mock Result to the Student Portal?"
      );
      if (!confirmed) return;
    } else if (!returnNote.trim()) {
      setError("Add a correction note for the Teacher.");
      return;
    }

    setReviewingId(resultId);
    setReviewingAction(action);
    setError("");
    setMessage("");
    try {
      const payload = await request("/api/admin/mock-results", {
        method: "POST",
        body: JSON.stringify({
          result_id: resultId,
          action,
          review_note: action === "return" ? returnNote.trim() : null,
        }),
      });
      setMessage(payload.message || "Mock Result review updated.");
      setReturningId("");
      setReturnNote("");
      await loadRows();
    } catch (reviewError) {
      setError(
        reviewError instanceof Error
          ? reviewError.message
          : "Unable to update the Mock Result review."
      );
    } finally {
      setReviewingId("");
      setReviewingAction("");
    }
  }

  function openEditor(row: AdminMockReviewRow) {
    if (row.status !== "awaiting_review" && row.status !== "published") {
      return;
    }

    setEditingId(row.id);
    setEditForm({
      reading: row.reading === null ? "" : String(row.reading),
      writing: row.writing === null ? "" : String(row.writing),
      listening: row.listening === null ? "" : String(row.listening),
      speaking: row.speaking === null ? "" : String(row.speaking),
      comments: row.comments || "",
    });
    setReturningId("");
    setReturnNote("");
    setError("");
    setMessage("");
  }

  function closeEditor() {
    setEditingId("");
    setEditForm(emptyEditForm);
  }

  async function saveAdminEdit(
    row: AdminMockReviewRow,
    action: AdminEditAction
  ) {
    const scores = {
      reading: toMockScore(editForm.reading),
      writing: toMockScore(editForm.writing),
      listening: toMockScore(editForm.listening),
      speaking: toMockScore(editForm.speaking),
    };
    if (
      Object.values(scores).some(
        (score) => score === null || score < 0 || score > 100
      )
    ) {
      setError("Enter all four Mock Exam scores between 0 and 100.");
      return;
    }

    if (action === "save_published") {
      const confirmed = window.confirm(
        "This result is currently visible to the student. Saving changes will update the published result immediately."
      );
      if (!confirmed) return;
    }

    if (action === "save_and_publish") {
      const confirmed = window.confirm(
        "Save these Admin changes and publish the corrected result to the Student Portal?"
      );
      if (!confirmed) return;
    }

    setReviewingId(row.id);
    setReviewingAction(action);
    setError("");
    setMessage("");
    try {
      const payload = await request("/api/admin/mock-results", {
        method: "POST",
        body: JSON.stringify({
          result_id: row.id,
          reading: scores.reading,
          writing: scores.writing,
          listening: scores.listening,
          speaking: scores.speaking,
          comments: editForm.comments,
          action,
        }),
      });
      setMessage(payload.message || "Admin changes saved.");
      closeEditor();
      await loadRows();
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Unable to save the Admin changes."
      );
    } finally {
      setReviewingId("");
      setReviewingAction("");
    }
  }

  return (
    <AdminLayout>
      <div className="admin-mock-review-page">
        <header className="admin-mock-review-header">
          <div>
            <p className="admin-mock-review-eyebrow">Cambridge Programme</p>
            <h1>Mock Results Review</h1>
            <p>
              Review Teacher-entered Mock Exam marks and comments before they
              become visible to students.
            </p>
          </div>
          <div className="admin-mock-review-count">
            <span>Awaiting review</span>
            <strong>{counts.awaiting_review}</strong>
          </div>
        </header>

        {message && (
          <div className="admin-mock-review-message is-success" role="status">
            {message}
          </div>
        )}
        {error && (
          <div className="admin-mock-review-message is-error" role="alert">
            {error}
          </div>
        )}

        <section className="admin-mock-review-controls" aria-label="Review filters">
          <div className="admin-mock-review-status-tabs">
            {statusFilters.map((filter) => (
              <button
                type="button"
                key={filter.value}
                className={statusFilter === filter.value ? "is-active" : ""}
                onClick={() => setStatusFilter(filter.value)}
              >
                {filter.label}
                {filter.value !== "all" && (
                  <span>{counts[filter.value]}</span>
                )}
              </button>
            ))}
          </div>

          <div className="admin-mock-review-filter-grid">
            <label>
              <span>Search student</span>
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Student name"
              />
            </label>
            <label>
              <span>Level</span>
              <select
                value={levelFilter}
                onChange={(event) => setLevelFilter(event.target.value)}
              >
                <option value="all">All levels</option>
                {levelOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Class</span>
              <select
                value={classFilter}
                onChange={(event) => setClassFilter(event.target.value)}
              >
                <option value="all">All classes</option>
                {classOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Teacher</span>
              <select
                value={teacherFilter}
                onChange={(event) => setTeacherFilter(event.target.value)}
              >
                <option value="all">All teachers</option>
                {teacherOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </section>

        <section className="admin-mock-review-list" aria-live="polite">
          {loading ? (
            <div className="admin-mock-review-empty">Loading Mock Results...</div>
          ) : visibleRows.length === 0 ? (
            <div className="admin-mock-review-empty">
              No Mock Results match these filters.
            </div>
          ) : (
            visibleRows.map((row) => {
              const readingLabel = getCambridgeReadingSkillLabel(row.level_name);
              const isReviewing = reviewingId === row.id;
              const isReturning = returningId === row.id;
              const isEditing = editingId === row.id;
              const isSavingEdit =
                isReviewing &&
                (reviewingAction === "save_changes" ||
                  reviewingAction === "save_and_publish" ||
                  reviewingAction === "save_published");

              return (
                <article
                  className={`admin-mock-review-row${
                    isEditing ? " is-editing" : ""
                  }`}
                  key={row.id}
                >
                  <div className="admin-mock-review-row-heading">
                    <div>
                      <div className="admin-mock-review-title-line">
                        <h2>{row.student_name}</h2>
                        <span
                          className={`admin-mock-review-badge is-${row.status.replace(
                            "_",
                            "-"
                          )}`}
                        >
                          {getMockResultStatusLabel(row.status)}
                        </span>
                      </div>
                      <p>
                        {row.level_name} · {row.class_name} · {row.teacher_name}
                        {row.academic_year_label
                          ? ` · ${row.academic_year_label}`
                          : ""}
                      </p>
                    </div>
                    <div className="admin-mock-review-mock-number">
                      <span>Mock Exam</span>
                      <strong>{row.mock_number}</strong>
                    </div>
                  </div>

                  {isEditing ? (
                    <>
                      <div className="admin-mock-review-score-grid admin-mock-review-edit-score-grid">
                        {[
                          {
                            key: "reading" as const,
                            label: readingLabel,
                          },
                          { key: "writing" as const, label: "Writing" },
                          { key: "listening" as const, label: "Listening" },
                          { key: "speaking" as const, label: "Speaking" },
                        ].map((field) => (
                          <label
                            className="admin-mock-review-edit-score-card"
                            key={field.key}
                          >
                            <span>{field.label}</span>
                            <span className="admin-mock-review-edit-score-control">
                              <input
                                type="number"
                                inputMode="decimal"
                                min={0}
                                max={100}
                                step="any"
                                value={editForm[field.key]}
                                onChange={(event) =>
                                  setEditForm((current) => ({
                                    ...current,
                                    [field.key]: event.target.value,
                                  }))
                                }
                              />
                              <span aria-hidden="true">%</span>
                            </span>
                          </label>
                        ))}

                        <div className="admin-mock-review-edit-average is-average">
                          <span>Average</span>
                          <output aria-live="polite">
                            {formatScore(editAverage)}
                          </output>
                        </div>
                      </div>

                      {row.status === "published" && (
                        <div
                          className="admin-mock-review-published-warning"
                          role="note"
                        >
                          This result is currently visible to the student.
                          Saving changes will update the published result
                          immediately.
                        </div>
                      )}

                      <label
                        className="admin-mock-review-edit-comment"
                        htmlFor={`admin-mock-comment-${row.id}`}
                      >
                        <span>Teacher comment</span>
                        <textarea
                          id={`admin-mock-comment-${row.id}`}
                          rows={5}
                          maxLength={5000}
                          value={editForm.comments}
                          onChange={(event) =>
                            setEditForm((current) => ({
                              ...current,
                              comments: event.target.value,
                            }))
                          }
                        />
                      </label>

                      <div className="admin-mock-review-edit-actions">
                        <button
                          type="button"
                          className="is-cancel"
                          onClick={closeEditor}
                          disabled={isSavingEdit}
                        >
                          Cancel
                        </button>
                        {row.status === "awaiting_review" ? (
                          <>
                            <button
                              type="button"
                              className="is-save"
                              onClick={() =>
                                void saveAdminEdit(row, "save_changes")
                              }
                              disabled={isReviewing}
                            >
                              {reviewingAction === "save_changes"
                                ? "Saving..."
                                : "Save Changes"}
                            </button>
                            <button
                              type="button"
                              className="is-publish"
                              onClick={() =>
                                void saveAdminEdit(row, "save_and_publish")
                              }
                              disabled={isReviewing}
                            >
                              {reviewingAction === "save_and_publish"
                                ? "Saving & Publishing..."
                                : "Save & Publish"}
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            className="is-save"
                            onClick={() =>
                              void saveAdminEdit(row, "save_published")
                            }
                            disabled={isReviewing}
                          >
                            {reviewingAction === "save_published"
                              ? "Saving..."
                              : "Save Changes"}
                          </button>
                        )}
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="admin-mock-review-score-grid">
                        {[
                          { label: readingLabel, value: row.reading },
                          { label: "Writing", value: row.writing },
                          { label: "Listening", value: row.listening },
                          { label: "Speaking", value: row.speaking },
                          {
                            label: "Average",
                            value: row.overall,
                            emphasized: true,
                          },
                        ].map((score) => (
                          <div
                            key={score.label}
                            className={score.emphasized ? "is-average" : ""}
                          >
                            <span>{score.label}</span>
                            <strong>{formatScore(score.value)}</strong>
                          </div>
                        ))}
                      </div>

                      <div className="admin-mock-review-comment">
                        <span>Teacher comment</span>
                        <p>{row.comments || "No Teacher comment was added."}</p>
                      </div>

                      {row.review_note && (
                        <div className="admin-mock-review-correction-note">
                          <span>Admin correction note</span>
                          <p>{row.review_note}</p>
                        </div>
                      )}

                      <div className="admin-mock-review-row-footer">
                        <div className="admin-mock-review-dates">
                          {row.updated_at && (
                            <span>Updated {formatDateTime(row.updated_at)}</span>
                          )}
                          {row.submitted_at && (
                            <span>
                              Submitted {formatDateTime(row.submitted_at)}
                            </span>
                          )}
                          {row.published_at && (
                            <span>
                              {row.status === "published"
                                ? "Published"
                                : "Previous approved version published"}{" "}
                              {formatDateTime(row.published_at)}
                            </span>
                          )}
                        </div>

                        {row.status === "awaiting_review" && (
                          <div className="admin-mock-review-actions">
                            <button
                              type="button"
                              className="is-edit"
                              onClick={() => openEditor(row)}
                              disabled={isReviewing}
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              className="is-return"
                              onClick={() => {
                                closeEditor();
                                setReturningId(isReturning ? "" : row.id);
                                setReturnNote("");
                              }}
                              disabled={isReviewing}
                            >
                              Return for Correction
                            </button>
                            <button
                              type="button"
                              className="is-publish"
                              onClick={() =>
                                void reviewResult(row.id, "publish")
                              }
                              disabled={isReviewing}
                            >
                              {isReviewing && reviewingAction === "publish"
                                ? "Publishing..."
                                : "Publish"}
                            </button>
                          </div>
                        )}

                        {row.status === "published" && (
                          <div className="admin-mock-review-actions">
                            <button
                              type="button"
                              className="is-edit"
                              onClick={() => openEditor(row)}
                              disabled={isReviewing}
                            >
                              Edit
                            </button>
                          </div>
                        )}
                      </div>
                    </>
                  )}

                  {isReturning && (
                    <div className="admin-mock-review-return-form">
                      <label htmlFor={`return-note-${row.id}`}>
                        Correction note for {row.teacher_name}
                      </label>
                      <textarea
                        id={`return-note-${row.id}`}
                        rows={3}
                        maxLength={1000}
                        value={returnNote}
                        onChange={(event) => setReturnNote(event.target.value)}
                        placeholder="Explain what needs to be checked or corrected."
                      />
                      <div>
                        <button
                          type="button"
                          onClick={() => {
                            setReturningId("");
                            setReturnNote("");
                          }}
                          disabled={isReviewing}
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          className="is-return"
                          onClick={() => void reviewResult(row.id, "return")}
                          disabled={isReviewing || !returnNote.trim()}
                        >
                          {isReviewing && reviewingAction === "return"
                            ? "Returning..."
                            : "Return to Teacher"}
                        </button>
                      </div>
                    </div>
                  )}
                </article>
              );
            })
          )}
        </section>
      </div>
    </AdminLayout>
  );
}
