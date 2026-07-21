"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { supabase } from "../../../lib/supabase";
import {
  formatFridayTutorialPracticeLabel,
  normalizeFridayTutorialPercentage,
  type FridayTutorialResultSheet,
  type FridayTutorialScheduledSessionSummary,
  type FridayTutorialTeacherSheetStudentRow,
} from "../../../lib/fridayTutorialResults";

type FridayTutorialResultsTabProps = {
  classId: string;
  levelName: string;
  initialStudentId?: string | null;
  shortcutRequestKey?: number;
};

function formatDate(value: string | null | undefined) {
  if (!value) {
    return "Date not available";
  }

  const [year, month, day] = String(value).split("-").map(Number);
  const date =
    Number.isFinite(year) && Number.isFinite(month) && Number.isFinite(day)
      ? new Date(Date.UTC(year, month - 1, day, 12, 0, 0))
      : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Date not available";
  }

  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Europe/Madrid",
  }).format(date);
}

function formatPercent(value: number | null) {
  if (value === null) {
    return "";
  }

  return Number.isInteger(value) ? String(value) : String(value);
}

function getStudentName(student: FridayTutorialTeacherSheetStudentRow) {
  return `${student.first_name || ""} ${student.last_name || ""}`.trim() ||
    "Unnamed student";
}

function getSessionLabel(session: FridayTutorialScheduledSessionSummary) {
  return formatFridayTutorialPracticeLabel(
    session.level_name,
    session.activity_type,
    session.exam_part
  );
}

export default function FridayTutorialResultsTab({
  classId,
  levelName,
  initialStudentId = null,
  shortcutRequestKey = 0,
}: FridayTutorialResultsTabProps) {
  const [sessions, setSessions] = useState<FridayTutorialScheduledSessionSummary[]>(
    []
  );
  const [selectedSessionId, setSelectedSessionId] = useState("");
  const [selectedSession, setSelectedSession] =
    useState<FridayTutorialScheduledSessionSummary | null>(null);
  const [resultSheet, setResultSheet] =
    useState<FridayTutorialResultSheet | null>(null);
  const [students, setStudents] = useState<FridayTutorialTeacherSheetStudentRow[]>(
    []
  );
  const [values, setValues] = useState<Record<string, string>>({});
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [loadingSheet, setLoadingSheet] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [focusedStudentId, setFocusedStudentId] = useState("");
  const tableRowRefs = useRef<Record<string, HTMLTableRowElement | null>>({});
  const mobileCardRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const requestJson = useCallback(async (url: string, init?: RequestInit) => {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.access_token) {
      throw new Error("Please sign in again before managing results.");
    }

    const response = await fetch(url, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(init?.headers || {}),
        Authorization: `Bearer ${session.access_token}`,
      },
    });
    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(
        payload?.error || "Unable to load Friday @ 6 tutorial results."
      );
    }

    return payload;
  }, []);

  const loadSessions = useCallback(async () => {
    setLoadingSessions(true);
    setError("");

    try {
      const payload = await requestJson(
        `/api/teacher/friday-tutorial-results?class_id=${encodeURIComponent(
          classId
        )}`
      );
      const loadedSessions = payload.sessions || [];

      setSessions(loadedSessions);
      setSelectedSessionId((current) => {
        if (current && loadedSessions.some((session: any) => session.id === current)) {
          return current;
        }

        return loadedSessions[0]?.id || "";
      });

      if (loadedSessions.length === 0) {
        setSelectedSession(null);
        setResultSheet(null);
        setStudents([]);
        setValues({});
      }
    } catch (loadError: any) {
      console.error(loadError);
      setError(loadError?.message || "Unable to load Friday @ 6 sessions.");
      setSessions([]);
      setSelectedSessionId("");
      setSelectedSession(null);
      setResultSheet(null);
      setStudents([]);
      setValues({});
    } finally {
      setLoadingSessions(false);
    }
  }, [classId, requestJson]);

  const loadSheet = useCallback(
    async (tutorialSessionId: string) => {
      if (!tutorialSessionId) {
        setSelectedSession(null);
        setResultSheet(null);
        setStudents([]);
        setValues({});
        return;
      }

      setLoadingSheet(true);
      setError("");
      setMessage("");

      try {
        const payload = await requestJson(
          `/api/teacher/friday-tutorial-results?class_id=${encodeURIComponent(
            classId
          )}&tutorial_session_id=${encodeURIComponent(tutorialSessionId)}`
        );
        const loadedStudents = payload.students || [];

        setSessions(payload.sessions || []);
        setSelectedSession(payload.selected_session || null);
        setResultSheet(payload.result_sheet || null);
        setStudents(loadedStudents);
        setValues(
          loadedStudents.reduce(
            (
              nextValues: Record<string, string>,
              student: FridayTutorialTeacherSheetStudentRow
            ) => ({
              ...nextValues,
              [student.student_id]: formatPercent(student.percentage),
            }),
            {}
          )
        );
      } catch (loadError: any) {
        console.error(loadError);
        setError(loadError?.message || "Unable to load this result sheet.");
        setSelectedSession(null);
        setResultSheet(null);
        setStudents([]);
        setValues({});
      } finally {
        setLoadingSheet(false);
      }
    },
    [classId, requestJson]
  );

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  useEffect(() => {
    loadSheet(selectedSessionId);
  }, [loadSheet, selectedSessionId]);

  function updateStudentValue(studentId: string, value: string) {
    setValues((current) => ({
      ...current,
      [studentId]: value,
    }));
  }

  useEffect(() => {
    if (
      !initialStudentId ||
      !students.some((student) => student.student_id === initialStudentId)
    ) {
      return;
    }

    setFocusedStudentId(initialStudentId);

    const scrollTimer = window.setTimeout(() => {
      const useMobileTarget = window.matchMedia("(max-width: 768px)").matches;
      const target = useMobileTarget
        ? mobileCardRefs.current[initialStudentId]
        : tableRowRefs.current[initialStudentId];

      target?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }, 80);
    const highlightTimer = window.setTimeout(() => {
      setFocusedStudentId("");
    }, 2800);

    return () => {
      window.clearTimeout(scrollTimer);
      window.clearTimeout(highlightTimer);
    };
  }, [initialStudentId, shortcutRequestKey, students]);

  function buildPayloadResults() {
    const payloadResults = [];

    for (const student of students) {
      const rawValue = values[student.student_id] ?? "";
      const normalized = normalizeFridayTutorialPercentage(rawValue.trim());

      if (normalized.error) {
        return {
          error: `${getStudentName(student)}: ${normalized.error}`,
          results: [],
        };
      }

      payloadResults.push({
        student_id: student.student_id,
        percentage: normalized.value,
      });
    }

    return {
      error: "",
      results: payloadResults,
    };
  }

  async function handleSave() {
    if (!selectedSessionId || !selectedSession || selectedSession.is_future) {
      return;
    }

    const payloadResults = buildPayloadResults();

    if (payloadResults.error) {
      setError(payloadResults.error);
      setMessage("");
      return;
    }

    setSaving(true);
    setError("");
    setMessage("");

    try {
      const payload = await requestJson("/api/teacher/friday-tutorial-results", {
        method: "POST",
        body: JSON.stringify({
          tutorial_session_id: selectedSessionId,
          class_id: classId,
          results: payloadResults.results,
        }),
      });

      const successMessage = `Results saved. ${
        payload.attended_count || 0
      } attended, ${payload.absent_count || 0} absent.`;

      await loadSheet(selectedSessionId);
      await loadSessions();
      setMessage(successMessage);
    } catch (saveError: any) {
      console.error(saveError);
      setError(saveError?.message || "Unable to save Friday @ 6 results.");
    } finally {
      setSaving(false);
    }
  }

  const canSave =
    Boolean(selectedSessionId) &&
    Boolean(selectedSession) &&
    !selectedSession?.is_future &&
    students.length > 0 &&
    !saving &&
    !loadingSheet;

  return (
    <div className="friday-tutorial-results-tab">
      <header className="friday-tutorial-results-header">
        <div>
          <h3>Friday Tutorial Results</h3>
          <p>
            Save Friday @ 6 tutorial scores for Cambridge {levelName || "classes"}.
          </p>
        </div>
      </header>

      {loadingSessions ? (
        <div className="friday-tutorial-results-state">Loading sessions...</div>
      ) : sessions.length === 0 ? (
        <div className="friday-tutorial-results-state">
          No active Friday @ 6 sessions have been added for this level yet.
        </div>
      ) : (
        <>
          <section className="friday-tutorial-results-panel">
            <label htmlFor="friday-tutorial-session-select">
              Friday @ 6 session
            </label>
            <select
              id="friday-tutorial-session-select"
              value={selectedSessionId}
              onChange={(event) => setSelectedSessionId(event.target.value)}
            >
              {sessions.map((session) => (
                <option key={session.id} value={session.id}>
                  {formatDate(session.session_date)} - {getSessionLabel(session)} -{" "}
                  {session.is_future
                    ? "Upcoming"
                    : session.results_submitted
                      ? "Submitted"
                      : "Not submitted"}
                </option>
              ))}
            </select>
          </section>

          {loadingSheet ? (
            <div className="friday-tutorial-results-state">
              Loading result sheet...
            </div>
          ) : selectedSession ? (
            <>
              <section className="friday-tutorial-results-summary">
                <div>
                  <span>Date</span>
                  <strong>{formatDate(selectedSession.session_date)}</strong>
                </div>
                <div>
                  <span>Level</span>
                  <strong>{selectedSession.level_name || levelName || "-"}</strong>
                </div>
                <div>
                  <span>Activity / Skill</span>
                  <strong>{selectedSession.activity_type || "-"}</strong>
                </div>
                <div>
                  <span>Exam Part</span>
                  <strong>{selectedSession.exam_part || "-"}</strong>
                </div>
                <div>
                  <span>Status</span>
                  <strong
                    className={`friday-tutorial-results-status ${
                      selectedSession.results_submitted
                        ? "is-submitted"
                        : selectedSession.is_future
                          ? "is-upcoming"
                          : "is-pending"
                    }`}
                  >
                    {selectedSession.results_submitted
                      ? "Submitted"
                      : selectedSession.is_future
                        ? "Upcoming"
                        : "Not submitted"}
                  </strong>
                </div>
              </section>

              <p className="friday-tutorial-results-note">
                Leave the result blank if the student was absent. Enter 0 for a
                student who attended but scored 0%.
              </p>

              {students.length === 0 ? (
                <div className="friday-tutorial-results-state">
                  No eligible students were found for this session.
                </div>
              ) : (
                <>
                  <div className="friday-tutorial-results-table-wrap">
                    <table className="friday-tutorial-results-table">
                      <thead>
                        <tr>
                          <th>Student</th>
                          <th>Result %</th>
                        </tr>
                      </thead>
                      <tbody>
                        {students.map((student) => (
                          <tr
                            key={student.student_id}
                            ref={(element) => {
                              tableRowRefs.current[student.student_id] = element;
                            }}
                            className={
                              focusedStudentId === student.student_id
                                ? "friday-tutorial-results-focused-row"
                                : undefined
                            }
                          >
                            <td>{getStudentName(student)}</td>
                            <td>
                              <input
                                type="number"
                                min="0"
                                max="100"
                                step="0.01"
                                inputMode="decimal"
                                value={values[student.student_id] ?? ""}
                                onChange={(event) =>
                                  updateStudentValue(
                                    student.student_id,
                                    event.target.value
                                  )
                                }
                                disabled={selectedSession.is_future || saving}
                                aria-label={`${getStudentName(student)} result percentage`}
                                placeholder="Absent"
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="friday-tutorial-results-mobile-list">
                    {students.map((student) => (
                      <div
                        key={student.student_id}
                        ref={(element) => {
                          mobileCardRefs.current[student.student_id] = element;
                        }}
                        className={`friday-tutorial-results-mobile-card ${
                          focusedStudentId === student.student_id
                            ? "friday-tutorial-results-focused-card"
                            : ""
                        }`}
                      >
                        <label>
                          <span>{getStudentName(student)}</span>
                          <input
                            type="number"
                            min="0"
                            max="100"
                            step="0.01"
                            inputMode="decimal"
                            value={values[student.student_id] ?? ""}
                            onChange={(event) =>
                              updateStudentValue(
                                student.student_id,
                                event.target.value
                              )
                            }
                            disabled={selectedSession.is_future || saving}
                            placeholder="Absent"
                          />
                        </label>
                      </div>
                    ))}
                  </div>

                  <div className="friday-tutorial-results-actions">
                    <div>
                      {resultSheet
                        ? "Saved sheets can be corrected and saved again."
                        : "This sheet will become visible to students after saving."}
                    </div>

                    {selectedSession.is_future ? (
                      <span className="friday-tutorial-results-upcoming">
                        Future sessions cannot be submitted yet.
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={handleSave}
                        disabled={!canSave}
                      >
                        {saving ? "Saving..." : "Save Results"}
                      </button>
                    )}
                  </div>
                </>
              )}
            </>
          ) : null}
        </>
      )}

      {message && (
        <div className="friday-tutorial-results-message" role="status">
          {message}
        </div>
      )}

      {error && (
        <div className="friday-tutorial-results-error" role="alert">
          {error}
        </div>
      )}
    </div>
  );
}
