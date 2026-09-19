"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../../../lib/supabase";

type MonitoringStatus =
  | "awaiting_teacher_feedback"
  | "monitoring_continued"
  | "overdue"
  | "feedback_submitted"
  | string;

type Monitoring = {
  id: string;
  student_name?: string;
  programme?: string;
  class_name?: string;
  class_id: string;
  level_name?: string;
  days?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  teacher_name?: string;
  reason: string;
  feedback_due_on: string;
  status: MonitoringStatus;
};

type MonitoringAction = "feedback" | "continue";

type TeacherStudentMonitoringTasksProps = {
  openRequested?: boolean;
  onOpenRequestHandled?: () => void;
};

const FEEDBACK_FIELDS = [
  ["observations", "Overall observation"],
  ["strengths", "Strengths"],
  ["difficulties", "Difficulties"],
  ["level_suitability", "Level suitability"],
  ["recommendation", "Recommendation"],
] as const;

function statusLabel(status: MonitoringStatus) {
  switch (status) {
    case "awaiting_teacher_feedback":
      return "Needs feedback";
    case "monitoring_continued":
      return "Monitoring continued";
    case "overdue":
      return "Overdue";
    case "feedback_submitted":
      return "Feedback submitted";
    default:
      return status.replaceAll("_", " ") || "Monitoring task";
  }
}

function formatTime(value?: string | null) {
  return value ? value.slice(0, 5) : "Time not set";
}

function formatSchedule(record: Monitoring) {
  return `${record.days || "Days not set"} · ${formatTime(record.start_time)}-${formatTime(record.end_time)}`;
}

function isOpenTeacherTask(record: Monitoring) {
  return [
    "awaiting_teacher_feedback",
    "monitoring_continued",
    "overdue",
  ].includes(record.status);
}

function uniqueRecords(records: Monitoring[]) {
  return records.filter(
    (record, index, all) =>
      all.findIndex((candidate) => candidate.id === record.id) === index
  );
}

export default function TeacherStudentMonitoringTasks({
  openRequested = false,
  onOpenRequestHandled,
}: TeacherStudentMonitoringTasksProps) {
  const pathname = usePathname();
  const params = useSearchParams();
  const router = useRouter();
  const scopeClassId =
    pathname === "/teacher/class" ? params.get("id") || "" : "";
  const [records, setRecords] = useState<Monitoring[]>([]);
  const [active, setActive] = useState<Monitoring | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [error, setError] = useState("");
  const [loadError, setLoadError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState({
    observations: "",
    strengths: "",
    difficulties: "",
    level_suitability: "",
    recommendation: "",
  });
  const [activeAction, setActiveAction] = useState<MonitoringAction | null>(
    null
  );
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const modalRef = useRef<HTMLElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const requestRef = useRef(0);

  const load = useCallback(async () => {
    const requestId = requestRef.current + 1;
    requestRef.current = requestId;
    setLoading(true);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) {
        if (requestId === requestRef.current) setRecords([]);
        return;
      }

      const response = await fetch(
        `/api/teacher/student-monitoring${
          scopeClassId ? `?class_id=${encodeURIComponent(scopeClassId)}` : ""
        }`,
        {
          headers: { Authorization: `Bearer ${session.access_token}` },
          cache: "no-store",
        }
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error || "Unable to load monitoring tasks.");
      }

      if (requestId !== requestRef.current) return;
      setRecords(uniqueRecords(payload.records || []));
      setLoadError("");
    } catch (loadFailure) {
      if (requestId !== requestRef.current) return;
      setLoadError(
        loadFailure instanceof Error
          ? loadFailure.message
          : "Unable to load monitoring tasks."
      );
    } finally {
      if (requestId === requestRef.current) setLoading(false);
    }
  }, [scopeClassId]);

  useEffect(() => {
    void load();
    const interval = window.setInterval(() => void load(), 60_000);
    window.addEventListener("teacher-student-monitoring-updated", load);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("teacher-student-monitoring-updated", load);
    };
  }, [load]);

  const closeWindow = useCallback(() => {
    if (saving) return;
    setModalOpen(false);
    setActive(null);
    setActiveAction(null);
    setError("");
    window.setTimeout(() => returnFocusRef.current?.focus(), 0);
  }, [saving]);

  const openWindow = useCallback(() => {
    if (!modalOpen) {
      returnFocusRef.current =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;
    }
    setError("");
    setModalOpen(true);
    void load();
    onOpenRequestHandled?.();
  }, [load, modalOpen, onOpenRequestHandled]);

  useEffect(() => {
    if (openRequested) openWindow();
  }, [openRequested, openWindow]);

  useEffect(() => {
    if (!modalOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeWindow();
        return;
      }
      if (event.key !== "Tab" || !modalRef.current) return;

      const focusable = Array.from(
        modalRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), a[href]'
        )
      );
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [closeWindow, modalOpen]);

  const inlineRecords = useMemo(() => {
    const visible =
      pathname === "/teacher"
        ? records.filter((record) => record.status !== "monitoring_continued")
        : records;
    return uniqueRecords(visible.filter(isOpenTeacherTask));
  }, [pathname, records]);

  const groupedRecords = useMemo(
    () => [
      {
        key: "needs-feedback",
        title: "Needs feedback",
        records: records.filter(
          (record) => record.status === "awaiting_teacher_feedback"
        ),
      },
      {
        key: "continued",
        title: "Monitoring continued",
        records: records.filter(
          (record) => record.status === "monitoring_continued"
        ),
      },
      {
        key: "overdue",
        title: "Overdue",
        records: records.filter((record) => record.status === "overdue"),
      },
      {
        key: "submitted",
        title: "Feedback submitted",
        records: records.filter(
          (record) => record.status === "feedback_submitted"
        ),
      },
    ],
    [records]
  );

  const populatedGroups = useMemo(
    () => groupedRecords.filter((group) => group.records.length > 0),
    [groupedRecords]
  );

  function openTask(record: Monitoring, mode: MonitoringAction) {
    if (!modalOpen) {
      returnFocusRef.current =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;
    }
    setError("");
    setActiveAction(mode);
    setActive(record);
    setModalOpen(true);
  }

  function openClass(record: Monitoring) {
    closeWindow();
    router.push(`/teacher/class?id=${encodeURIComponent(record.class_id)}`);
  }

  async function submit(action: MonitoringAction) {
    if (!active || saving) return;
    setSaving(true);
    setError("");

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const response = await fetch(`/api/teacher/student-monitoring/${active.id}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session?.access_token || ""}`,
          "Content-Type": "application/json",
        },
        body:
          action === "continue"
            ? JSON.stringify({ action })
            : JSON.stringify({ action, ...feedback }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error || "Unable to save monitoring task.");
      }

      setActive(null);
      setActiveAction(null);
      setFeedback({
        observations: "",
        strengths: "",
        difficulties: "",
        level_suitability: "",
        recommendation: "",
      });
      await load();
      window.dispatchEvent(new Event("teacher-student-monitoring-updated"));
    } catch (submitFailure) {
      setError(
        submitFailure instanceof Error
          ? submitFailure.message
          : "Unable to save monitoring task."
      );
    } finally {
      setSaving(false);
    }
  }

  function renderRecord(record: Monitoring, inModal = false) {
    const overdue = record.status === "overdue";
    const feedbackAvailable = isOpenTeacherTask(record);
    const programme = record.programme || "Programme";
    const status = statusLabel(record.status);

    return (
      <article
        key={record.id}
        className={
          inModal
            ? "teacher-monitoring-modal-record"
          : "teacher-monitoring-task-entry"
        }
      >
        <header className="teacher-monitoring-record-header">
          <div className="teacher-monitoring-record-identity">
            <strong>{record.student_name || "Student"}</strong>
            <span className="teacher-monitoring-programme-badge">{programme}</span>
          </div>
          <span
            className={`teacher-monitoring-status-badge${overdue ? " teacher-monitoring-status-overdue" : ""}`}
          >
            {status}
          </span>
        </header>
        <dl className="teacher-monitoring-record-details">
          <div>
            <dt>Level</dt>
            <dd>{record.level_name || "Level not set"}</dd>
          </div>
          <div>
            <dt>Class</dt>
            <dd>{record.class_name || "Class not set"}</dd>
          </div>
          <div>
            <dt>Schedule</dt>
            <dd>{formatSchedule(record)}</dd>
          </div>
          <div>
            <dt>Teacher</dt>
            <dd>{record.teacher_name || "Teacher not set"}</dd>
          </div>
          <div>
            <dt>Reason</dt>
            <dd>{record.reason || "Not specified"}</dd>
          </div>
          <div>
            <dt>Feedback deadline</dt>
            <dd className={overdue ? "monitoring-overdue" : ""}>
              {record.feedback_due_on}
            </dd>
          </div>
        </dl>
        <div
          className={
            inModal
              ? "teacher-monitoring-modal-actions"
              : "teacher-monitoring-task-actions"
          }
        >
          {feedbackAvailable && (
            <button
              type="button"
              className="teacher-monitoring-action-primary"
              onClick={() => openTask(record, "feedback")}
            >
              Complete feedback
            </button>
          )}
          {feedbackAvailable && !overdue && (
            <button
              type="button"
              className="teacher-monitoring-action-secondary"
              onClick={() => openTask(record, "continue")}
            >
              Continue monitoring
            </button>
          )}
          <button
            type="button"
            className="teacher-monitoring-action-tertiary"
            onClick={() => openClass(record)}
          >
            Open class
          </button>
        </div>
      </article>
    );
  }

  if (pathname !== "/teacher" && pathname !== "/teacher/class" && !modalOpen) {
    // The component remains mounted in TeacherLayout so the sidebar can open
    // the monitoring window on every Teacher route.
    return null;
  }

  return (
    <>
      {(pathname === "/teacher" || pathname === "/teacher/class") &&
        (inlineRecords.length ? (
          <section
            id="student-monitoring"
            className="teacher-monitoring-task-cards"
            aria-label="Student Monitoring tasks"
          >
            <header>
              <div>
                <h2>Student Monitoring</h2>
                <p>
                  {inlineRecords.length} student
                  {inlineRecords.length === 1 ? "" : "s"} requiring attention
                </p>
              </div>
              <span className="teacher-monitoring-alert-count">
                {inlineRecords.length}
              </span>
            </header>
            {inlineRecords.map((record) => renderRecord(record))}
          </section>
        ) : null)}

      {modalOpen && (
        <div
          className="teacher-monitoring-modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeWindow();
          }}
        >
          <section
            ref={modalRef}
            className="teacher-monitoring-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="teacher-monitoring-dialog-title"
          >
            <button
              ref={closeButtonRef}
              className="teacher-monitoring-close"
              type="button"
              onClick={closeWindow}
              aria-label="Close Student Monitoring"
            >
              ×
            </button>
            <header className="teacher-monitoring-modal-header">
              <p className="teacher-monitoring-modal-eyebrow">TEACHER TASKS</p>
              <h2 id="teacher-monitoring-dialog-title">Student Monitoring</h2>
              <p>
                Review monitoring tasks for your assigned classes.
              </p>
            </header>

            {loadError && (
              <div className="teacher-monitoring-modal-error" role="alert">
                {loadError}
                <button type="button" onClick={() => void load()}>
                  Retry
                </button>
              </div>
            )}

            {active ? (
              <div className="teacher-monitoring-form-view">
                <button
                  type="button"
                  className="teacher-monitoring-back"
                  onClick={() => {
                    if (!saving) {
                      setActive(null);
                      setActiveAction(null);
                      setError("");
                    }
                  }}
                >
                  ← Back to monitoring tasks
                </button>
                <div className="teacher-monitoring-form-summary">
                  <strong>{active.student_name || "Student"}</strong>
                  <span>
                    {active.programme || "Programme"} · {active.level_name || "Level"} · {active.class_name || "Class"}
                  </span>
                  <span>
                    {formatSchedule(active)} · Due {active.feedback_due_on}
                  </span>
                </div>
                {error && (
                  <p className="teacher-monitoring-modal-error" role="alert">
                    {error}
                  </p>
                )}
                {activeAction === "continue" ? (
                  <div className="teacher-monitoring-form">
                    <p>
                      The existing deadline of{" "}
                      <strong>{active.feedback_due_on}</strong> will be preserved.
                    </p>
                    <button
                      type="button"
                      disabled={saving || active.status === "overdue"}
                      onClick={() => void submit("continue")}
                    >
                      {saving ? "Saving…" : "Continue monitoring"}
                    </button>
                  </div>
                ) : (
                  <div className="teacher-monitoring-form">
                    {FEEDBACK_FIELDS.map(([field, label]) => (
                      <label key={field}>
                        {label}
                        <textarea
                          required={field === "observations"}
                          value={feedback[field]}
                          onChange={(event) =>
                            setFeedback((current) => ({
                              ...current,
                              [field]: event.target.value,
                            }))
                          }
                        />
                      </label>
                    ))}
                    <button
                      type="button"
                      disabled={saving || !feedback.observations.trim()}
                      onClick={() => void submit("feedback")}
                    >
                      {saving ? "Saving…" : "Submit feedback"}
                    </button>
                  </div>
                )}
              </div>
            ) : loading ? (
              <p className="teacher-monitoring-modal-state">
                Loading monitoring tasks…
              </p>
            ) : populatedGroups.length === 0 ? (
              <p className="teacher-monitoring-empty-state">
                No student monitoring tasks require your attention.
              </p>
            ) : (
              <div className="teacher-monitoring-modal-list">
                {populatedGroups.map((group) => (
                  <section
                    key={group.key}
                    className="teacher-monitoring-modal-group"
                  >
                    <header className="teacher-monitoring-group-header">
                      <div>
                        <h3>{group.title}</h3>
                        <p>
                          {group.key === "needs-feedback"
                            ? "Feedback is required for these assigned classes."
                            : group.key === "continued"
                              ? "These tasks remain active under continued monitoring."
                              : group.key === "overdue"
                                ? "These deadlines have passed and need immediate attention."
                                : "Previously submitted feedback retained for your history."}
                        </p>
                      </div>
                      <span className="teacher-monitoring-group-count">
                        {group.records.length}
                      </span>
                    </header>
                    <div className="teacher-monitoring-group-records">
                      {group.records.map((record) => renderRecord(record, true))}
                    </div>
                  </section>
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </>
  );
}
