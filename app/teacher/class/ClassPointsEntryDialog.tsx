"use client";

import { useMemo, useState } from "react";

import { supabase } from "../../../lib/supabase";
import YoungLearnerMonsterAvatar from "./YoungLearnerMonsterAvatar";
import type {
  ClassPointsHistoryEntry,
  ClassPointsLearner,
  ClassPointsSnapshot,
} from "./ClassPointsTab";

type ActionValue = boolean | null;

type ActionControlProps = {
  label: string;
  value: ActionValue;
  onChange: (value: ActionValue) => void;
};

type ClassPointsEntryDialogProps = {
  classId: string;
  academicYear: string;
  learner: ClassPointsLearner;
  onClose: () => void;
  onSnapshotUpdate: (snapshot: ClassPointsSnapshot) => void;
};

function formatPoints(points: number) {
  return points > 0 ? `+${points}` : String(points);
}

function formatMadridDateTime(value: string) {
  const timestamp = new Date(value);
  if (Number.isNaN(timestamp.getTime())) return "Date unavailable";

  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Madrid",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(timestamp);
}

function actionDescription(label: string, value: boolean | null) {
  if (value === null) return null;
  return `${label}: ${value ? "Yes" : "No"}`;
}

function ActionControl({ label, value, onChange }: ActionControlProps) {
  return (
    <fieldset className="class-points-action-control">
      <legend>{label}</legend>
      <div role="group" aria-label={label}>
        {[
          { label: "Not recorded", value: null },
          { label: "Yes", value: true },
          { label: "No", value: false },
        ].map((option) => {
          const selected = value === option.value;
          return (
            <button
              key={option.label}
              type="button"
              aria-pressed={selected}
              className={selected ? "is-selected" : ""}
              onClick={() => onChange(option.value)}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

function historySummary(entry: ClassPointsHistoryEntry) {
  return [
    actionDescription("Homework done", entry.homework_done),
    actionDescription("Speaking English", entry.speaking_english),
    actionDescription("Good behaviour", entry.good_behaviour),
    entry.exam_mark === null || entry.exam_mark === undefined
      ? null
      : `Exam mark: ${entry.exam_mark}`,
  ].filter((item): item is string => Boolean(item));
}

export default function ClassPointsEntryDialog({
  classId,
  academicYear,
  learner,
  onClose,
  onSnapshotUpdate,
}: ClassPointsEntryDialogProps) {
  const [homeworkDone, setHomeworkDone] = useState<ActionValue>(null);
  const [speakingEnglish, setSpeakingEnglish] = useState<ActionValue>(null);
  const [goodBehaviour, setGoodBehaviour] = useState<ActionValue>(null);
  const [examMark, setExamMark] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [removingEntryId, setRemovingEntryId] = useState("");
  const [pendingRemovalEntryId, setPendingRemovalEntryId] = useState("");

  const preview = useMemo(() => {
    const actions = [
      { label: "Homework done", value: homeworkDone },
      { label: "Speaking English in class", value: speakingEnglish },
      { label: "Good behaviour", value: goodBehaviour },
    ]
      .filter((action) => action.value !== null)
      .map((action) => ({
        label: action.label,
        points: action.value ? 1 : -1,
      }));
    const selectedMark = examMark ? Number(examMark) : null;
    if (selectedMark !== null) {
      actions.push({ label: "Exam mark", points: selectedMark });
    }

    return {
      actions,
      total: actions.reduce((total, action) => total + action.points, 0),
    };
  }, [examMark, goodBehaviour, homeworkDone, speakingEnglish]);

  async function getAccessToken() {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error("Authentication required.");
    return session.access_token;
  }

  async function saveEntry() {
    if (preview.actions.length === 0 || saving) return;

    setSaving(true);
    setError("");
    try {
      const token = await getAccessToken();
      const response = await fetch(
        `/api/teacher/classes/${encodeURIComponent(classId)}/class-points`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            young_learner_id: learner.id,
            homework_done: homeworkDone,
            speaking_english: speakingEnglish,
            good_behaviour: goodBehaviour,
            exam_mark: examMark ? Number(examMark) : null,
          }),
        }
      );
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.class_points) {
        throw new Error(payload?.error || "Unable to save this points entry.");
      }

      onSnapshotUpdate(payload.class_points as ClassPointsSnapshot);
      setHomeworkDone(null);
      setSpeakingEnglish(null);
      setGoodBehaviour(null);
      setExamMark("");
    } catch (saveError) {
      console.error("Unable to save Class Points entry:", saveError);
      setError("Unable to save this points entry.");
    } finally {
      setSaving(false);
    }
  }

  async function removeEntry(entryId: string) {
    if (!entryId || removingEntryId) return;

    setRemovingEntryId(entryId);
    setError("");
    try {
      const token = await getAccessToken();
      const response = await fetch(
        `/api/teacher/classes/${encodeURIComponent(
          classId
        )}/class-points/${encodeURIComponent(entryId)}`,
        {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.class_points) {
        throw new Error(payload?.error || "Unable to remove this points entry.");
      }

      onSnapshotUpdate(payload.class_points as ClassPointsSnapshot);
      setPendingRemovalEntryId("");
    } catch (removeError) {
      console.error("Unable to remove Class Points entry:", removeError);
      setError("Unable to remove this points entry.");
    } finally {
      setRemovingEntryId("");
    }
  }

  const recentHistory = learner.history.slice(0, 10);

  return (
    <div
      className="class-points-dialog-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !saving && !removingEntryId) {
          onClose();
        }
      }}
    >
      <section
        aria-labelledby="class-points-dialog-title"
        aria-modal="true"
        className="class-points-dialog"
        role="dialog"
      >
        <header className="class-points-dialog-header">
          <div className="class-points-dialog-learner">
            <YoungLearnerMonsterAvatar
              learnerId={learner.id}
              size={64}
              className="class-points-dialog-avatar"
              label={learner.display_name}
            />
            <div>
              <p>Class Points · {academicYear}</p>
              <h2 id="class-points-dialog-title">{learner.display_name}</h2>
              <span>
                Current total <strong>{formatPoints(learner.points_total)}</strong>
              </span>
            </div>
          </div>
          <button
            type="button"
            className="class-points-dialog-close"
            aria-label="Close Class Points dialog"
            onClick={onClose}
            disabled={saving || Boolean(removingEntryId)}
          >
            ×
          </button>
        </header>

        <div className="class-points-dialog-body">
          <section aria-labelledby="class-points-entry-heading">
            <div className="class-points-dialog-section-heading">
              <div>
                <h3 id="class-points-entry-heading">New points entry</h3>
                <p>Record only the actions that apply today.</p>
              </div>
            </div>

            <div className="class-points-actions-grid">
              <ActionControl
                label="Homework done"
                value={homeworkDone}
                onChange={setHomeworkDone}
              />
              <ActionControl
                label="Speaking English in class"
                value={speakingEnglish}
                onChange={setSpeakingEnglish}
              />
              <ActionControl
                label="Good behaviour"
                value={goodBehaviour}
                onChange={setGoodBehaviour}
              />
            </div>

            <label className="class-points-exam-mark">
              <span>Exam mark <small>Optional</small></span>
              <select
                value={examMark}
                onChange={(event) => setExamMark(event.target.value)}
              >
                <option value="">Not recorded</option>
                {Array.from({ length: 10 }, (_, index) => index + 1).map(
                  (mark) => (
                    <option key={mark} value={mark}>
                      {mark}
                    </option>
                  )
                )}
              </select>
            </label>

            <div className="class-points-preview" aria-live="polite">
              <div>
                <span>Points-change preview</span>
                <strong>{formatPoints(preview.total)}</strong>
              </div>
              {preview.actions.length ? (
                <ul>
                  {preview.actions.map((action) => (
                    <li key={action.label}>
                      <span>{action.label}</span>
                      <strong>{formatPoints(action.points)}</strong>
                    </li>
                  ))}
                </ul>
              ) : (
                <p>Select at least one action or exam mark.</p>
              )}
              {preview.actions.length > 0 && (
                <p className="class-points-preview-total">
                  Total for this entry: <strong>{formatPoints(preview.total)}</strong>
                </p>
              )}
            </div>

            {error && <p className="class-points-dialog-error" role="alert">{error}</p>}

            <footer className="class-points-entry-actions">
              <button
                type="button"
                className="class-points-cancel-button"
                onClick={onClose}
                disabled={saving || Boolean(removingEntryId)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="class-points-save-button"
                onClick={() => void saveEntry()}
                disabled={saving || preview.actions.length === 0}
              >
                {saving ? "Saving..." : "Save Points"}
              </button>
            </footer>
          </section>

          <section className="class-points-history" aria-labelledby="class-points-history-heading">
            <div className="class-points-dialog-section-heading">
              <div>
                <h3 id="class-points-history-heading">Recent points history</h3>
                <p>Current academic year only.</p>
              </div>
            </div>

            {recentHistory.length === 0 ? (
              <p className="class-points-history-empty">No points have been recorded yet.</p>
            ) : (
              <ul>
                {recentHistory.map((entry) => {
                  const description = historySummary(entry);
                  const isPending = pendingRemovalEntryId === entry.id;
                  const isRemoving = removingEntryId === entry.id;

                  return (
                    <li key={entry.id}>
                      <div className="class-points-history-entry">
                        <div>
                          <strong>{formatMadridDateTime(entry.created_at)}</strong>
                          <span>{entry.teacher_name}</span>
                        </div>
                        <b>{formatPoints(entry.points_delta)}</b>
                      </div>
                      <p>{description.join(" · ")}</p>
                      {isPending ? (
                        <div
                          className="class-points-remove-confirmation"
                          role="alertdialog"
                          aria-label="Remove Class Points entry"
                        >
                          <p>
                            Remove this Class Points entry? The learner’s total
                            will be recalculated.
                          </p>
                          <div>
                            <button
                              type="button"
                              onClick={() => setPendingRemovalEntryId("")}
                              disabled={isRemoving}
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              onClick={() => void removeEntry(entry.id)}
                              disabled={isRemoving}
                            >
                              {isRemoving ? "Removing..." : "Remove entry"}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          type="button"
                          className="class-points-remove-entry"
                          onClick={() => {
                            setError("");
                            setPendingRemovalEntryId(entry.id);
                          }}
                          disabled={Boolean(removingEntryId)}
                        >
                          Remove
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      </section>
    </div>
  );
}
