"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { supabase } from "../../../lib/supabase";

type ProgressEntry = {
  id: string;
  lesson_date: string;
  scheduled_start_time: string;
  scheduled_end_time: string;
  pupils_book_page: number | null;
  activity_book_page: number | null;
  homework: string | null;
  extra_activities: string | null;
  completed_at: string;
  completing_teacher_name: string;
  last_edited_by_name: string | null;
};

type ScheduledLesson = {
  lesson_date: string;
  scheduled_start_time: string;
  scheduled_end_time: string;
  weekday: string;
  entry: ProgressEntry | null;
};

type SameLevelProgress = {
  class_id: string;
  class_name: string;
  teacher_name: string;
  course_type: string;
  latest_lesson_date: string | null;
  latest_pupils_book_page: number | null;
  latest_activity_book_page: number | null;
  days_since_last_update: number | null;
  is_current_class: boolean;
};

type ClassProgressSnapshot = {
  class: {
    id: string;
    name: string;
    level: string;
    is_cambridge: boolean;
    course_type: string;
    is_young_learner: boolean;
  };
  latest_lesson: ScheduledLesson | null;
  recent_lessons: ScheduledLesson[];
  same_level_progress: SameLevelProgress[];
};

type ProgressForm = {
  pupilsBookPage: string;
  activityBookPage: string;
  homework: string;
  extraActivities: string;
};

const EMPTY_FORM: ProgressForm = {
  pupilsBookPage: "",
  activityBookPage: "",
  homework: "",
  extraActivities: "",
};

function lessonKey(lesson: Pick<ScheduledLesson, "lesson_date" | "scheduled_start_time">) {
  return `${lesson.lesson_date}|${lesson.scheduled_start_time}`;
}

function displayTime(value: string) {
  return value.slice(0, 5);
}

function displayDate(value: string) {
  const date = new Date(`${value}T12:00:00Z`);
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Madrid",
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(date);
}

function sameStartTime(left: string, right: string) {
  return left.slice(0, 5) === right.slice(0, 5);
}

function formFromEntry(entry: ProgressEntry | null): ProgressForm {
  return {
    pupilsBookPage: entry?.pupils_book_page ? String(entry.pupils_book_page) : "",
    activityBookPage: entry?.activity_book_page
      ? String(entry.activity_book_page)
      : "",
    homework: entry?.homework || "",
    extraActivities: entry?.extra_activities || "",
  };
}

function optionalPositiveInteger(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const number = Number(trimmed);
  return Number.isInteger(number) && number > 0 ? number : Number.NaN;
}

function readableCourseType(value: string) {
  const normalized = value.trim().toLowerCase();
  return normalized ? normalized.charAt(0).toUpperCase() + normalized.slice(1) : "";
}

type ClassProgressTabProps = {
  classId: string;
  initialLessonDate?: string | null;
  initialStartTime?: string | null;
};

export default function ClassProgressTab({
  classId,
  initialLessonDate,
  initialStartTime,
}: ClassProgressTabProps) {
  const [snapshot, setSnapshot] = useState<ClassProgressSnapshot | null>(null);
  const [selectedLessonKey, setSelectedLessonKey] = useState("");
  const [form, setForm] = useState<ProgressForm>(EMPTY_FORM);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const loadClassProgress = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error("Authentication required.");
      const response = await fetch(
        `/api/teacher/classes/${encodeURIComponent(classId)}/class-progress`,
        {
          headers: { Authorization: `Bearer ${session.access_token}` },
          cache: "no-store",
        }
      );
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload) {
        throw new Error(payload?.error || "Unable to load Class Progress.");
      }
      setSnapshot(payload as ClassProgressSnapshot);
    } catch (loadError: any) {
      console.error("Unable to load Class Progress:", loadError);
      setSnapshot(null);
      setError(loadError?.message || "Unable to load Class Progress.");
    } finally {
      setLoading(false);
    }
  }, [classId]);

  useEffect(() => {
    void loadClassProgress();
  }, [loadClassProgress]);

  const selectedLesson = useMemo(() => {
    if (!snapshot?.recent_lessons.length) return null;
    return (
      snapshot.recent_lessons.find(
        (lesson) => lessonKey(lesson) === selectedLessonKey
      ) || snapshot.latest_lesson || snapshot.recent_lessons[0]
    );
  }, [selectedLessonKey, snapshot]);

  useEffect(() => {
    if (!snapshot?.recent_lessons.length) return;
    const target = snapshot.recent_lessons.find(
      (lesson) =>
        lesson.lesson_date === initialLessonDate &&
        sameStartTime(lesson.scheduled_start_time, String(initialStartTime || ""))
    );
    const next = target || snapshot.latest_lesson || snapshot.recent_lessons[0];
    setSelectedLessonKey((current) => {
      const currentExists = snapshot.recent_lessons.some(
        (lesson) => lessonKey(lesson) === current
      );
      return currentExists ? current : lessonKey(next);
    });
  }, [initialLessonDate, initialStartTime, snapshot]);

  useEffect(() => {
    if (!selectedLesson) return;
    setForm(formFromEntry(selectedLesson.entry));
    setError("");
  }, [
    selectedLesson?.entry?.id,
    selectedLesson?.lesson_date,
    selectedLesson?.scheduled_start_time,
  ]);

  function selectLesson(lesson: ScheduledLesson) {
    setSelectedLessonKey(lessonKey(lesson));
    setMessage("");
  }

  function updateForm(field: keyof ProgressForm, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function saveProgress(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedLesson || !snapshot) return;
    const pupilsBookPage = optionalPositiveInteger(form.pupilsBookPage);
    const activityBookPage = optionalPositiveInteger(form.activityBookPage);
    if (Number.isNaN(pupilsBookPage) || Number.isNaN(activityBookPage)) {
      setError("Page numbers must be positive whole numbers.");
      return;
    }
    const homework = form.homework.trim();
    const extraActivities = form.extraActivities.trim();
    if (
      pupilsBookPage === null &&
      activityBookPage === null &&
      !homework &&
      !extraActivities
    ) {
      setError("Add at least one completed page, homework item, or extra activity.");
      return;
    }

    setSaving(true);
    setError("");
    setMessage("");
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error("Authentication required.");
      const payload: Record<string, unknown> = {
        pupils_book_page: pupilsBookPage,
        activity_book_page: snapshot.class.is_young_learner ? activityBookPage : null,
        homework: homework || null,
        extra_activities: extraActivities || null,
      };
      const isExistingEntry = Boolean(selectedLesson.entry?.id);
      if (!isExistingEntry) {
        payload.lesson_date = selectedLesson.lesson_date;
        payload.scheduled_start_time = selectedLesson.scheduled_start_time;
        payload.scheduled_end_time = selectedLesson.scheduled_end_time;
      }
      const endpoint = isExistingEntry
        ? `/api/teacher/classes/${encodeURIComponent(classId)}/class-progress/${encodeURIComponent(
            String(selectedLesson.entry?.id)
          )}`
        : `/api/teacher/classes/${encodeURIComponent(classId)}/class-progress`;
      const response = await fetch(endpoint, {
        method: isExistingEntry ? "PATCH" : "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(result?.error || "Unable to save Class Progress.");
      }
      setMessage(isExistingEntry ? "Class Progress updated." : "Class Progress completed.");
      window.dispatchEvent(new Event("teacher-class-progress-updated"));
      await loadClassProgress();
    } catch (saveError: any) {
      console.error("Unable to save Class Progress:", saveError);
      setError(saveError?.message || "Unable to save Class Progress.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <p className="teacher-class-progress-state">Loading Class Progress...</p>;
  }

  if (error && !snapshot) {
    return (
      <div className="teacher-class-progress-state is-error" role="alert">
        <p>{error}</p>
        <button type="button" onClick={() => void loadClassProgress()}>
          Try again
        </button>
      </div>
    );
  }

  if (!snapshot || !selectedLesson) {
    return (
      <p className="teacher-class-progress-state">
        No scheduled lessons are available for Class Progress yet.
      </p>
    );
  }

  const selectedEntry = selectedLesson.entry;
  const isYoungLearner = snapshot.class.is_young_learner;
  const sameLevelTitle = snapshot.class.is_cambridge
    ? `${snapshot.class.level} Regular & Online progress`
    : `${snapshot.class.level} level progress`;

  return (
    <section className="teacher-class-progress" aria-labelledby="class-progress-heading">
      <header className="teacher-class-progress-header">
        <div>
          <p className="teacher-class-progress-eyebrow">Class teaching record</p>
          <h2 id="class-progress-heading">Class Progress</h2>
          <p>
            Record the work completed in each scheduled lesson and keep the
            teaching team aligned.
          </p>
        </div>
        <span className="teacher-class-progress-level">
          {snapshot.class.level}
          {snapshot.class.is_cambridge && snapshot.class.course_type
            ? ` · ${readableCourseType(snapshot.class.course_type)}`
            : ""}
        </span>
      </header>

      <div className="teacher-class-progress-grid">
        <form className="teacher-class-progress-form" onSubmit={saveProgress}>
          <div className="teacher-class-progress-form-heading">
            <div>
              <p>Current or latest scheduled lesson</p>
              <h3>
                {displayDate(selectedLesson.lesson_date)} · {displayTime(selectedLesson.scheduled_start_time)}–
                {displayTime(selectedLesson.scheduled_end_time)}
              </h3>
            </div>
            <span className={selectedEntry ? "is-complete" : "is-pending"}>
              {selectedEntry ? "Completed" : "To complete"}
            </span>
          </div>

          <div className="teacher-class-progress-fields">
            <label>
              <span>Pupil’s Book page</span>
              <input
                type="number"
                inputMode="numeric"
                min="1"
                step="1"
                value={form.pupilsBookPage}
                onChange={(event) => updateForm("pupilsBookPage", event.target.value)}
                placeholder="Optional"
              />
            </label>
            {isYoungLearner && (
              <label>
                <span>Activity Book page</span>
                <input
                  type="number"
                  inputMode="numeric"
                  min="1"
                  step="1"
                  value={form.activityBookPage}
                  onChange={(event) =>
                    updateForm("activityBookPage", event.target.value)
                  }
                  placeholder="Optional"
                />
              </label>
            )}
            <label className="is-wide">
              <span>Homework</span>
              <textarea
                value={form.homework}
                onChange={(event) => updateForm("homework", event.target.value)}
                placeholder="Optional homework set for the class"
                rows={3}
              />
            </label>
            <label className="is-wide">
              <span>Extra activities</span>
              <textarea
                value={form.extraActivities}
                onChange={(event) => updateForm("extraActivities", event.target.value)}
                placeholder="Optional extension or additional activity"
                rows={3}
              />
            </label>
          </div>

          {selectedEntry && (
            <p className="teacher-class-progress-editor-note">
              Completed by {selectedEntry.completing_teacher_name}
              {selectedEntry.last_edited_by_name
                ? ` · Last edited by ${selectedEntry.last_edited_by_name}`
                : ""}
            </p>
          )}
          {error && <p className="teacher-class-progress-form-error" role="alert">{error}</p>}
          {message && <p className="teacher-class-progress-form-success" role="status">{message}</p>}
          <div className="teacher-class-progress-form-actions">
            <button type="submit" disabled={saving}>
              {saving
                ? "Saving..."
                : selectedEntry
                ? "Save changes"
                : "Complete Class Progress"}
            </button>
          </div>
        </form>

        <aside className="teacher-class-progress-recent" aria-labelledby="class-progress-recent-heading">
          <div className="teacher-class-progress-section-heading">
            <div>
              <p>Scheduled teaching record</p>
              <h3 id="class-progress-recent-heading">Recent scheduled lessons</h3>
            </div>
          </div>
          <div className="teacher-class-progress-recent-list">
            {snapshot.recent_lessons.slice(0, 12).map((lesson) => {
              const selected = lessonKey(lesson) === lessonKey(selectedLesson);
              return (
                <button
                  key={lessonKey(lesson)}
                  type="button"
                  className={`teacher-class-progress-recent-row ${
                    selected ? "is-selected" : ""
                  }`}
                  onClick={() => selectLesson(lesson)}
                >
                  <span>
                    <strong>{displayDate(lesson.lesson_date)}</strong>
                    <small>
                      {displayTime(lesson.scheduled_start_time)}–
                      {displayTime(lesson.scheduled_end_time)}
                    </small>
                  </span>
                  <span className={lesson.entry ? "is-complete" : "is-pending"}>
                    {lesson.entry ? "Completed" : "Complete"}
                  </span>
                </button>
              );
            })}
          </div>
        </aside>
      </div>

      <section className="teacher-class-progress-sync" aria-labelledby="class-progress-sync-heading">
        <div className="teacher-class-progress-section-heading">
          <div>
            <p>Read-only teaching rhythm</p>
            <h3 id="class-progress-sync-heading">{sameLevelTitle}</h3>
          </div>
          <span>Individual classes stay separate</span>
        </div>
        <div className="teacher-class-progress-sync-table-wrap">
          <table className="teacher-class-progress-sync-table">
            <thead>
              <tr>
                <th scope="col">Class</th>
                <th scope="col">Teacher</th>
                {snapshot.class.is_cambridge && <th scope="col">Course</th>}
                <th scope="col">Pupil’s Book</th>
                {isYoungLearner && <th scope="col">Activity Book</th>}
                <th scope="col">Last recorded</th>
                <th scope="col">Days since update</th>
              </tr>
            </thead>
            <tbody>
              {snapshot.same_level_progress.map((row) => (
                <tr key={row.class_id} className={row.is_current_class ? "is-current" : ""}>
                  <th scope="row">
                    {row.class_name}
                    {row.is_current_class && <span>Current class</span>}
                  </th>
                  <td>{row.teacher_name}</td>
                  {snapshot.class.is_cambridge && <td>{readableCourseType(row.course_type)}</td>}
                  <td>{row.latest_pupils_book_page ?? "—"}</td>
                  {isYoungLearner && <td>{row.latest_activity_book_page ?? "—"}</td>}
                  <td>{row.latest_lesson_date ? displayDate(row.latest_lesson_date) : "—"}</td>
                  <td>{row.days_since_last_update ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  );
}
