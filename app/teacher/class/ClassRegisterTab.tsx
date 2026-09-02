"use client";

import {
  AlertCircle,
  CalendarDays,
  Check,
  CheckCircle2,
  Clock3,
  UserCheck,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  CLASS_REGISTER_CHANGED_EVENT,
  type ClassAttendanceStatus,
  type ClassRegisterLesson,
  type ClassRegisterSnapshot,
  type ClassRegisterUnavailableResponse,
  isClassRegisterUnavailableResponse,
} from "../../../lib/classRegister";
import { supabase } from "../../../lib/supabase";

type Props = {
  classId: string;
  initialLessonDate?: string | null;
  initialStartTime?: string | null;
};

function displayTime(value: string | null | undefined) {
  return String(value || "").slice(0, 5);
}

function displayDate(value: string, includeWeekday = true) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Madrid",
    ...(includeWeekday ? { weekday: "long" as const } : {}),
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(`${value}T12:00:00Z`));
}

function displayCompletedTime(value: string | null) {
  if (!value) return "";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Madrid",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(value));
}

function getLessonStatusText(lesson: ClassRegisterLesson) {
  if (lesson.status === "completed") {
    return `${lesson.present_count} Present · ${lesson.absent_count} Absent`;
  }
  if (lesson.status === "in_progress") {
    return `${lesson.unmarked_count} student${
      lesson.unmarked_count === 1 ? "" : "s"
    } still unmarked`;
  }
  if (lesson.status === "upcoming") {
    return "Available at the scheduled start time";
  }
  return "Register not completed";
}

export default function ClassRegisterTab({
  classId,
  initialLessonDate,
  initialStartTime,
}: Props) {
  const [snapshot, setSnapshot] = useState<ClassRegisterSnapshot | null>(null);
  const [unavailable, setUnavailable] =
    useState<ClassRegisterUnavailableResponse | null>(null);
  const [attendance, setAttendance] = useState<
    Record<string, ClassAttendanceStatus>
  >({});
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const handledInitialLesson = useRef(false);

  const getToken = useCallback(async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error("Your session has expired.");
    return session.access_token;
  }, []);

  const applySnapshot = useCallback((next: ClassRegisterSnapshot) => {
    setUnavailable(null);
    setSnapshot(next);
    setAttendance(
      Object.fromEntries(
        (next.selected_register?.entries || []).map((entry) => [
          entry.id,
          entry.attendance_status,
        ])
      )
    );
  }, []);

  const requestSnapshot = useCallback(
    async (lesson?: { date: string; start: string } | null) => {
      const token = await getToken();
      const search = lesson
        ? `?lessonDate=${encodeURIComponent(
            lesson.date
          )}&startTime=${encodeURIComponent(lesson.start)}`
        : "";
      const response = await fetch(
        `/api/teacher/classes/${encodeURIComponent(classId)}/register${search}`,
        {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        }
      );
      const payload = await response.json().catch(() => ({}));
      if (isClassRegisterUnavailableResponse(payload)) return payload;
      if (!response.ok) {
        throw new Error(payload.error || "Unable to load Class Register.");
      }
      return payload as ClassRegisterSnapshot;
    },
    [classId, getToken]
  );

  const openLesson = useCallback(
    async (lesson: Pick<ClassRegisterLesson, "lesson_date" | "scheduled_start_time">) => {
      setWorking(true);
      setError("");
      setMessage("");
      try {
        const token = await getToken();
        const response = await fetch(
          `/api/teacher/classes/${encodeURIComponent(classId)}/register`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              action: "open",
              lesson_date: lesson.lesson_date,
              scheduled_start_time: lesson.scheduled_start_time,
            }),
          }
        );
        const payload = await response.json().catch(() => ({}));
        if (isClassRegisterUnavailableResponse(payload)) {
          setUnavailable(payload);
          setSnapshot(null);
          return;
        }
        if (!response.ok) {
          throw new Error(payload.error || "Unable to open Class Register.");
        }
        applySnapshot(payload as ClassRegisterSnapshot);
      } catch (caught) {
        setError(
          caught instanceof Error
            ? caught.message
            : "Unable to open Class Register."
        );
      } finally {
        setWorking(false);
      }
    },
    [applySnapshot, classId, getToken]
  );

  const loadInitialSnapshot = useCallback(async () => {
    setLoading(true);
    setError("");
    setUnavailable(null);
    try {
      const requestedLesson =
        initialLessonDate && initialStartTime
          ? { date: initialLessonDate, start: initialStartTime }
          : null;
      const next = await requestSnapshot(requestedLesson);
      if (isClassRegisterUnavailableResponse(next)) {
        setUnavailable(next);
        setSnapshot(null);
        setAttendance({});
        return;
      }
      applySnapshot(next);

      if (
        requestedLesson &&
        !handledInitialLesson.current &&
        next.selected_lesson?.is_available &&
        !next.selected_register
      ) {
        handledInitialLesson.current = true;
        await openLesson({
          lesson_date: requestedLesson.date,
          scheduled_start_time: requestedLesson.start,
        });
      }
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to load Class Register."
      );
    } finally {
      setLoading(false);
    }
  }, [
    applySnapshot,
    initialLessonDate,
    initialStartTime,
    openLesson,
    requestSnapshot,
  ]);

  useEffect(() => {
    void loadInitialSnapshot();
  }, [loadInitialSnapshot]);

  const selectedRegister = snapshot?.selected_register || null;
  const entries = selectedRegister?.entries || [];
  const liveCounts = useMemo(() => {
    const values = entries.map((entry) => attendance[entry.id] ?? null);
    const present = values.filter((value) => value === "present").length;
    const absent = values.filter((value) => value === "absent").length;
    return {
      present,
      absent,
      unmarked: values.length - present - absent,
    };
  }, [attendance, entries]);
  const allMarked = liveCounts.unmarked === 0;

  async function saveRegister(complete: boolean) {
    if (!selectedRegister) return;
    if (complete && !allMarked) {
      setError("Mark every student Present or Absent before completing the register.");
      return;
    }

    setWorking(true);
    setError("");
    setMessage("");
    try {
      const token = await getToken();
      const response = await fetch(
        `/api/teacher/classes/${encodeURIComponent(classId)}/register`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            action: "save",
            register_id: selectedRegister.id,
            complete,
            entries: entries.map((entry) => ({
              entry_id: entry.id,
              attendance_status: attendance[entry.id] ?? null,
            })),
          }),
        }
      );
      const payload = await response.json().catch(() => ({}));
      if (isClassRegisterUnavailableResponse(payload)) {
        setUnavailable(payload);
        setSnapshot(null);
        return;
      }
      if (!response.ok) {
        throw new Error(payload.error || "Unable to save Class Register.");
      }
      applySnapshot(payload as ClassRegisterSnapshot);
      setMessage(
        selectedRegister.completed_at
          ? "Attendance correction saved."
          : complete
            ? "Class Register completed."
            : "Register progress saved."
      );
      window.dispatchEvent(new Event(CLASS_REGISTER_CHANGED_EVENT));
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to save Class Register."
      );
    } finally {
      setWorking(false);
    }
  }

  function renderLessonAction(lesson: ClassRegisterLesson) {
    if (!lesson.is_available) {
      return <span className="class-register-available-note">At start time</span>;
    }
    return (
      <button
        type="button"
        className="class-register-secondary-button"
        onClick={() => void openLesson(lesson)}
        disabled={working}
      >
        {lesson.status === "completed"
          ? "View / Edit"
          : lesson.status === "in_progress"
            ? "Continue"
            : "Take Register"}
      </button>
    );
  }

  if (loading) {
    return (
      <div className="class-register-state" role="status">
        Loading Class Register...
      </div>
    );
  }

  if (unavailable) {
    return (
      <div className="class-register-page">
        <section
          className="class-register-unavailable"
          aria-labelledby="class-register-unavailable-title"
        >
          <span className="class-register-unavailable-icon" aria-hidden="true">
            <AlertCircle size={20} />
          </span>
          <div>
            <p className="class-register-eyebrow">Attendance setup</p>
            <h2 id="class-register-unavailable-title">
              Class Register unavailable
            </h2>
            <p>{unavailable.message}</p>
            <button
              type="button"
              className="class-register-secondary-button"
              onClick={() => void loadInitialSnapshot()}
            >
              Check again
            </button>
          </div>
        </section>
      </div>
    );
  }

  if (!snapshot) {
    return (
      <div className="class-register-state is-error" role="alert">
        <p>{error || "Class Register could not be loaded."}</p>
        <button type="button" onClick={() => void loadInitialSnapshot()}>
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="class-register-page">
      <header className="class-register-page-header">
        <div>
          <p className="class-register-eyebrow">Attendance</p>
          <h2>Class Register</h2>
          <p>
            Record Present or Absent for each scheduled lesson. Unmarked students
            never count as absent.
          </p>
        </div>
        <div className="class-register-class-context">
          <strong>{snapshot.class.name}</strong>
          <span>
            {snapshot.class.days} · {displayTime(snapshot.class.scheduled_start_time)}–
            {displayTime(snapshot.class.scheduled_end_time)}
          </span>
        </div>
      </header>

      {message && (
        <div className="class-register-message is-success" role="status">
          {message}
        </div>
      )}
      {error && (
        <div className="class-register-message is-error" role="alert">
          {error}
        </div>
      )}

      {selectedRegister && snapshot.selected_lesson ? (
        <section className="class-register-editor" aria-labelledby="register-editor-title">
          <div className="class-register-editor-header">
            <div>
              <button
                type="button"
                className="class-register-back-button"
                onClick={() => {
                  setSnapshot((current) =>
                    current
                      ? {
                          ...current,
                          selected_lesson: null,
                          selected_register: null,
                        }
                      : current
                  );
                  setMessage("");
                  setError("");
                }}
              >
                Back to register overview
              </button>
              <h3 id="register-editor-title">
                {displayDate(selectedRegister.lesson_date)}
              </h3>
              <p>
                {displayTime(selectedRegister.scheduled_start_time)}–
                {displayTime(selectedRegister.scheduled_end_time)} · {entries.length} student
                {entries.length === 1 ? "" : "s"}
              </p>
            </div>
            <div
              className={`class-register-completion-badge ${
                selectedRegister.completed_at ? "is-complete" : "is-open"
              }`}
            >
              {selectedRegister.completed_at ? (
                <CheckCircle2 aria-hidden="true" size={17} />
              ) : (
                <Clock3 aria-hidden="true" size={17} />
              )}
              <span>
                {selectedRegister.completed_at
                  ? `Completed ${displayCompletedTime(selectedRegister.completed_at)}`
                  : "Not completed"}
              </span>
            </div>
          </div>

          <div className="class-register-toolbar">
            <div className="class-register-live-counts" aria-live="polite">
              <span><strong>{liveCounts.present}</strong> Present</span>
              <span><strong>{liveCounts.absent}</strong> Absent</span>
              <span><strong>{liveCounts.unmarked}</strong> Unmarked</span>
            </div>
            {entries.length > 0 && (
              <button
                type="button"
                className="class-register-mark-all-button"
                onClick={() =>
                  setAttendance(
                    Object.fromEntries(entries.map((entry) => [entry.id, "present"]))
                  )
                }
                disabled={working}
              >
                <UserCheck aria-hidden="true" size={17} />
                Mark All Present
              </button>
            )}
          </div>

          {entries.length === 0 ? (
            <div className="class-register-empty-roster">
              <UserCheck aria-hidden="true" size={24} />
              <div>
                <strong>No students currently assigned</strong>
                <p>This lesson has an empty roster. No attendance entries will be created.</p>
              </div>
            </div>
          ) : (
            <div className="class-register-roster" role="list">
              {entries.map((entry, index) => {
                const status = attendance[entry.id] ?? null;
                return (
                  <div className="class-register-student-row" role="listitem" key={entry.id}>
                    <div className="class-register-student-name">
                      <span aria-hidden="true">{index + 1}</span>
                      <strong>{entry.full_name}</strong>
                    </div>
                    <div className="class-register-attendance-control" aria-label={`Attendance for ${entry.full_name}`}>
                      <button
                        type="button"
                        className={status === "present" ? "is-present" : ""}
                        aria-pressed={status === "present"}
                        aria-label={`Mark ${entry.full_name} Present`}
                        onClick={() =>
                          setAttendance((current) => ({
                            ...current,
                            [entry.id]: "present",
                          }))
                        }
                      >
                        <Check aria-hidden="true" size={18} />
                        Present
                      </button>
                      <button
                        type="button"
                        className={status === "absent" ? "is-absent" : ""}
                        aria-pressed={status === "absent"}
                        aria-label={`Mark ${entry.full_name} Absent`}
                        onClick={() =>
                          setAttendance((current) => ({
                            ...current,
                            [entry.id]: "absent",
                          }))
                        }
                      >
                        <X aria-hidden="true" size={18} />
                        Absent
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <footer className="class-register-editor-footer">
            <div>
              {!allMarked && (
                <p>
                  <AlertCircle aria-hidden="true" size={16} />
                  {liveCounts.unmarked} student{liveCounts.unmarked === 1 ? "" : "s"} still need attendance.
                </p>
              )}
              {allMarked && (
                <p className="is-ready">
                  <CheckCircle2 aria-hidden="true" size={16} />
                  Every student has been marked.
                </p>
              )}
            </div>
            <div className="class-register-footer-actions">
              {!selectedRegister.completed_at && (
                <button
                  type="button"
                  className="class-register-secondary-button"
                  onClick={() => void saveRegister(false)}
                  disabled={working}
                >
                  {working ? "Saving..." : "Save Progress"}
                </button>
              )}
              <button
                type="button"
                className="class-register-primary-button"
                onClick={() => void saveRegister(true)}
                disabled={working || !allMarked}
              >
                {working
                  ? "Saving..."
                  : selectedRegister.completed_at
                    ? "Save Corrections"
                    : "Complete Register"}
              </button>
            </div>
          </footer>
        </section>
      ) : (
        <>
          <section className="class-register-today" aria-labelledby="class-register-today-title">
            <div className="class-register-section-heading">
              <div>
                <p>Today</p>
                <h3 id="class-register-today-title">
                  {displayDate(snapshot.today_madrid, false)}
                </h3>
              </div>
              <CalendarDays aria-hidden="true" size={22} />
            </div>

            {snapshot.today_lesson ? (
              <div className="class-register-today-lesson">
                <div className="class-register-lesson-time">
                  <Clock3 aria-hidden="true" size={19} />
                  <strong>
                    {displayTime(snapshot.today_lesson.scheduled_start_time)}–
                    {displayTime(snapshot.today_lesson.scheduled_end_time)}
                  </strong>
                </div>
                <div className="class-register-lesson-summary">
                  <strong>{snapshot.class.name}</strong>
                  <span>{getLessonStatusText(snapshot.today_lesson)}</span>
                </div>
                {renderLessonAction(snapshot.today_lesson)}
              </div>
            ) : (
              <p className="class-register-no-lesson">No class lesson is scheduled today.</p>
            )}
          </section>

          <section className="class-register-history" aria-labelledby="class-register-history-title">
            <div className="class-register-section-heading">
              <div>
                <p>History</p>
                <h3 id="class-register-history-title">Recent Registers</h3>
              </div>
            </div>
            {snapshot.recent_registers.length === 0 ? (
              <p className="class-register-no-lesson">No earlier scheduled lessons are available yet.</p>
            ) : (
              <div className="class-register-history-list">
                {snapshot.recent_registers.map((lesson) => (
                  <article
                    key={`${lesson.lesson_date}-${lesson.scheduled_start_time}`}
                    className="class-register-history-row"
                  >
                    <div>
                      <strong>{displayDate(lesson.lesson_date, false)}</strong>
                      <span>
                        {displayTime(lesson.scheduled_start_time)}–
                        {displayTime(lesson.scheduled_end_time)}
                      </span>
                    </div>
                    <div className={`class-register-history-status is-${lesson.status}`}>
                      {lesson.status === "completed" ? (
                        <CheckCircle2 aria-hidden="true" size={16} />
                      ) : (
                        <AlertCircle aria-hidden="true" size={16} />
                      )}
                      <span>{getLessonStatusText(lesson)}</span>
                    </div>
                    {renderLessonAction(lesson)}
                  </article>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
