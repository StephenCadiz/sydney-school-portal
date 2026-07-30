"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { supabase } from "../../../lib/supabase";

type StudentTutorialSession = {
  id: string;
  session_date: string;
  level_name: string;
  activity_type: string;
  exam_part: string | null;
  is_future: boolean;
  practice_label: string;
  result: {
    id: string;
    percentage: number | null;
    attended: boolean;
    updated_at: string | null;
  } | null;
};

function formatDate(value: string, includeWeekday = false) {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, 12));

  if (!value || Number.isNaN(date.getTime())) return "Date not available";

  return new Intl.DateTimeFormat("en-GB", {
    ...(includeWeekday ? { weekday: "long" as const } : {}),
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Europe/Madrid",
  }).format(date);
}

function sessionActivity(session: StudentTutorialSession) {
  return (
    session.practice_label ||
    [session.activity_type, session.exam_part].filter(Boolean).join(" — ")
  );
}

export default function StudentFridayTutorialSection({
  classId,
  studentId,
  studentName,
}: {
  classId: string;
  studentId: string;
  studentName: string;
}) {
  const identity = `${classId}:${studentId}`;
  const [loadedIdentity, setLoadedIdentity] = useState("");
  const [sessions, setSessions] = useState<StudentTutorialSession[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState("");
  const [percentage, setPercentage] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const requestJson = useCallback(async (url: string, init?: RequestInit) => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.access_token) {
      throw new Error("Please sign in again before managing results.");
    }

    const response = await fetch(url, {
      ...init,
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
        ...(init?.headers || {}),
        Authorization: `Bearer ${session.access_token}`,
      },
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload?.error || "Unable to load Friday Tutorials.");
    }
    return payload;
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadedIdentity("");
    setSessions([]);
    setSelectedSessionId("");
    setPercentage("");
    setError("");
    setMessage("");

    try {
      const payload = await requestJson(
        `/api/teacher/friday-tutorial-results?class_id=${encodeURIComponent(
          classId
        )}&student_id=${encodeURIComponent(studentId)}`
      );
      const loadedSessions = Array.isArray(payload.sessions)
        ? payload.sessions
        : [];
      const firstSession = loadedSessions[0] || null;
      setSessions(loadedSessions);
      setSelectedSessionId(firstSession?.id || "");
      setPercentage(
        firstSession?.result?.percentage === null ||
          firstSession?.result?.percentage === undefined
          ? ""
          : String(firstSession.result.percentage)
      );
      setLoadedIdentity(identity);
    } catch (loadError: any) {
      console.error("Student Friday Tutorial load failed:", loadError);
      setError(loadError?.message || "Unable to load Friday Tutorials.");
      setLoadedIdentity(identity);
    } finally {
      setLoading(false);
    }
  }, [classId, identity, requestJson, studentId]);

  useEffect(() => {
    void load();
  }, [load]);

  const selectedSession = useMemo(
    () => sessions.find((session) => session.id === selectedSessionId) || null,
    [selectedSessionId, sessions]
  );

  function chooseSession(sessionId: string) {
    const session = sessions.find((item) => item.id === sessionId) || null;
    setSelectedSessionId(sessionId);
    setPercentage(
      session?.result?.percentage === null ||
        session?.result?.percentage === undefined
        ? ""
        : String(session.result.percentage)
    );
    setError("");
    setMessage("");
  }

  async function saveResult() {
    if (!selectedSession || selectedSession.is_future || saving) return;

    const normalized = Number(percentage);
    if (
      percentage.trim() === "" ||
      !Number.isFinite(normalized) ||
      normalized < 0 ||
      normalized > 100
    ) {
      setError("Enter a percentage between 0 and 100.");
      setMessage("");
      return;
    }

    setSaving(true);
    setError("");
    setMessage("");
    try {
      const payload = await requestJson(
        "/api/teacher/friday-tutorial-results",
        {
          method: "POST",
          body: JSON.stringify({
            class_id: classId,
            student_id: studentId,
            tutorial_session_id: selectedSession.id,
            percentage: normalized,
          }),
        }
      );
      setSessions((current) =>
        current.map((session) =>
          session.id === selectedSession.id
            ? { ...session, result: payload.result }
            : session
        )
      );
      setPercentage(String(payload.result.percentage));
      setMessage("Friday Tutorial result saved.");
    } catch (saveError: any) {
      console.error("Student Friday Tutorial save failed:", saveError);
      setError(saveError?.message || "Unable to save this result.");
    } finally {
      setSaving(false);
    }
  }

  const isCurrentIdentity = loadedIdentity === identity;

  return (
    <section
      className="student-friday-tutorial"
      aria-labelledby="student-friday-tutorial-heading"
    >
      <header>
        <p className="student-workspace-section-eyebrow">Friday Tutorials</p>
        <h3 id="student-friday-tutorial-heading">
          {studentName || "Selected student"}
        </h3>
        <p>Select a scheduled tutorial and save this student&apos;s result.</p>
      </header>

      {loading || !isCurrentIdentity ? (
        <div className="friday-tutorial-results-state">
          Loading Friday Tutorials...
        </div>
      ) : error && sessions.length === 0 ? (
        <div className="friday-tutorial-results-error" role="alert">
          <p>{error}</p>
          <button type="button" onClick={() => void load()}>
            Retry
          </button>
        </div>
      ) : sessions.length === 0 ? (
        <div className="friday-tutorial-results-state">
          No Friday Tutorials are available for this student&apos;s level.
        </div>
      ) : (
        <>
          <section className="friday-tutorial-results-panel">
            <label htmlFor="student-friday-tutorial-session">
              Select Friday Tutorial
            </label>
            <select
              id="student-friday-tutorial-session"
              value={selectedSessionId}
              disabled={saving}
              onChange={(event) => chooseSession(event.target.value)}
            >
              {sessions.map((session) => (
                <option key={session.id} value={session.id}>
                  {formatDate(session.session_date, true)} —{" "}
                  {sessionActivity(session)}
                  {session.is_future ? " — Upcoming" : ""}
                </option>
              ))}
            </select>
          </section>

          {selectedSession && (
            <section className="student-friday-tutorial-form">
              <div>
                <span>Date</span>
                <strong>{formatDate(selectedSession.session_date)}</strong>
              </div>
              <div>
                <span>Activity / Skill</span>
                <strong>{sessionActivity(selectedSession) || "Not specified"}</strong>
              </div>

              {selectedSession.is_future ? (
                <p className="friday-tutorial-results-upcoming">
                  This Friday Tutorial is upcoming. Results can be entered after
                  the session.
                </p>
              ) : (
                <>
                  <label htmlFor="student-friday-tutorial-percentage">
                    Percentage
                  </label>
                  <input
                    id="student-friday-tutorial-percentage"
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    inputMode="decimal"
                    value={percentage}
                    disabled={saving}
                    onChange={(event) => setPercentage(event.target.value)}
                  />
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => void saveResult()}
                  >
                    {saving ? "Saving..." : "Save result"}
                  </button>
                </>
              )}

              {message && (
                <p className="friday-tutorial-results-message" role="status">
                  {message}
                </p>
              )}
              {error && (
                <p className="friday-tutorial-results-error" role="alert">
                  {error}
                </p>
              )}
            </section>
          )}

          <section className="student-friday-tutorial-history">
            <h4>Friday Tutorial history</h4>
            <div>
              {sessions.map((session) => (
                <button
                  key={session.id}
                  type="button"
                  disabled={saving}
                  aria-current={
                    session.id === selectedSessionId ? "true" : undefined
                  }
                  onClick={() => chooseSession(session.id)}
                >
                  <span>
                    {formatDate(session.session_date)} —{" "}
                    {sessionActivity(session)}
                  </span>
                  <strong>
                    {session.is_future
                      ? "Upcoming"
                      : session.result?.percentage !== null &&
                          session.result?.percentage !== undefined
                        ? `${session.result.percentage}%`
                        : "Not graded"}
                  </strong>
                </button>
              ))}
            </div>
          </section>
        </>
      )}
    </section>
  );
}
