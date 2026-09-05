"use client";

import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Clock3,
  LogIn,
  LogOut,
  ShieldCheck,
} from "lucide-react";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

import {
  formatMadridTime,
  formatMinutes,
  getMadridMinutes,
  minutesBetween,
  normalizeTime,
  plannedIntervalLabel,
  shouldShowFinishReminder,
  shouldShowStartReminder,
  type StaffTimeTeacherDay,
} from "../../../lib/staffTime";
import { supabase } from "../../../lib/supabase";

type Feedback = { type: "success" | "error"; message: string };

async function accessToken() {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.access_token || "";
}

function displayDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(new Date(`${value}T12:00:00Z`));
}

export default function TeacherWorkingDayPanel({
  endpoint = "/api/teacher/staff-time",
  hideWhenUnavailable = false,
}: {
  endpoint?: string;
  hideWhenUnavailable?: boolean;
} = {}) {
  const [day, setDay] = useState<StaffTimeTeacherDay | null>(null);
  const [hidden, setHidden] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [correctionOpen, setCorrectionOpen] = useState(false);
  const [correctionBusy, setCorrectionBusy] = useState(false);
  const [correctionType, setCorrectionType] = useState("forgot_sign_in");
  const [correctionSessionId, setCorrectionSessionId] = useState("");
  const [signInTime, setSignInTime] = useState("");
  const [signOutTime, setSignOutTime] = useState("");
  const [reason, setReason] = useState("");
  const [now, setNow] = useState(() => new Date());

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const token = await accessToken();
      if (!token) return;
      const response = await fetch(endpoint, {
        cache: "no-store",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.status === 204 && hideWhenUnavailable) {
        setHidden(true);
        setDay(null);
        return;
      }
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Unable to load your working day.");
      setHidden(false);
      setDay(payload as StaffTimeTeacherDay);
    } catch (error) {
      if (!quiet) {
        setFeedback({
          type: "error",
          message: error instanceof Error ? error.message : "Unable to load your working day.",
        });
      }
    } finally {
      if (!quiet) setLoading(false);
    }
  }, [endpoint, hideWhenUnavailable]);

  useEffect(() => {
    void load();
    const interval = window.setInterval(() => {
      setNow(new Date());
      void load(true);
    }, 60_000);
    return () => window.clearInterval(interval);
  }, [load]);

  const openSession = day?.sessions.find((session) => !session.effective_sign_out_at) || null;
  const completedMinutes = useMemo(
    () =>
      (day?.sessions || []).reduce(
        (sum, session) =>
          sum + minutesBetween(session.effective_sign_in_at, session.effective_sign_out_at),
        0
      ),
    [day]
  );
  const firstStart = day?.planned_intervals[0]
    ? Number(normalizeTime(day.planned_intervals[0].start_time).slice(0, 2)) * 60 +
      Number(normalizeTime(day.planned_intervals[0].start_time).slice(3))
    : null;
  const lastFinish = day?.planned_intervals.at(-1)
    ? Number(normalizeTime(day.planned_intervals.at(-1)!.end_time).slice(0, 2)) * 60 +
      Number(normalizeTime(day.planned_intervals.at(-1)!.end_time).slice(3))
    : null;
  const madridMinutes = getMadridMinutes(now);
  const startReminder =
    firstStart !== null &&
    Boolean(day) &&
    shouldShowStartReminder(madridMinutes, firstStart, Boolean(day?.sessions.length));
  const finishReminder =
    lastFinish !== null && shouldShowFinishReminder(madridMinutes, lastFinish, Boolean(openSession));
  const configured = Boolean(day?.employment);
  const remoteException =
    day?.remote_authorised &&
    day.employment?.clocking_location_policy === "school_or_authorised_remote";
  const mayAttemptClock =
    Boolean(day?.employment?.time_recording_enabled) &&
    (!day?.closure || remoteException);

  async function clock(action: "sign_in" | "sign_out") {
    setBusy(true);
    setFeedback(null);
    try {
      const token = await accessToken();
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ action }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "The clock action could not be recorded.");
      setDay(payload.working_day as StaffTimeTeacherDay);
      setFeedback({
        type: "success",
        message:
          action === "sign_in"
            ? `Signed in at ${formatMadridTime(payload.result?.occurred_at)}.`
            : `Signed out at ${formatMadridTime(payload.result?.occurred_at)}.`,
      });
    } catch (error) {
      setFeedback({
        type: "error",
        message: error instanceof Error ? error.message : "The clock action could not be recorded.",
      });
    } finally {
      setBusy(false);
    }
  }

  async function submitCorrection(event: FormEvent) {
    event.preventDefault();
    if (!day) return;
    setCorrectionBusy(true);
    setFeedback(null);
    try {
      const token = await accessToken();
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "request_correction",
          work_date: day.date,
          session_id: correctionSessionId || null,
          sign_in_time: signInTime || null,
          sign_out_time: signOutTime || null,
          request_type: correctionType,
          reason,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Unable to submit the correction.");
      setFeedback({ type: "success", message: "Correction request sent for Admin review." });
      setCorrectionOpen(false);
      setCorrectionSessionId("");
      setSignInTime("");
      setSignOutTime("");
      setReason("");
      await load(true);
    } catch (error) {
      setFeedback({
        type: "error",
        message: error instanceof Error ? error.message : "Unable to submit the correction.",
      });
    } finally {
      setCorrectionBusy(false);
    }
  }

  if (hidden) return null;

  if (loading && !day) {
    if (hideWhenUnavailable) return null;
    return (
      <section className="staff-time-teacher-panel is-loading" aria-label="Working Day">
        <div className="staff-time-loading-line" />
        <div className="staff-time-loading-line is-short" />
      </section>
    );
  }

  return (
    <section className="staff-time-teacher-panel" aria-labelledby="working-day-title">
      <header className="staff-time-teacher-header">
        <div>
          <span className="staff-time-eyebrow">Employment time record</span>
          <h2 id="working-day-title">Working Day</h2>
          <p>{day ? displayDate(day.date) : "Today"}</p>
        </div>
        <div className={`staff-time-status-mark is-${day?.status || "not_due"}`}>
          <Clock3 aria-hidden="true" size={18} />
          <span>{day?.status_label || "Unavailable"}</span>
        </div>
      </header>

      {day?.closure && !remoteException ? (
        <div className="staff-time-closure-state">
          <ShieldCheck aria-hidden="true" size={23} />
          <div>
            <strong>School closed today</strong>
            <span>{day.closure.name}</span>
            <small>No time registration is required.</small>
          </div>
        </div>
      ) : (
        <div className="staff-time-teacher-grid">
          <div className="staff-time-schedule-block">
            <span>Planned schedule</span>
            <strong>{plannedIntervalLabel(day?.planned_intervals || [])}</strong>
            <small>
              {day?.planned_intervals.length
                ? "For reminders and comparison only"
                : "No planned work intervals today"}
            </small>
          </div>

          <div className="staff-time-current-block">
            {openSession ? (
              <>
                <span>Signed in</span>
                <strong>{formatMadridTime(openSession.effective_sign_in_at)}</strong>
                <small>
                  {openSession.clocking_mode === "authorised_remote"
                    ? "Authorised remote work"
                    : "School network verified"}
                </small>
              </>
            ) : day?.sessions.length ? (
              <>
                <span>Recorded today</span>
                <strong>{formatMinutes(completedMinutes)}</strong>
                <small>{day.sessions.length} completed session{day.sessions.length === 1 ? "" : "s"}</small>
              </>
            ) : (
              <>
                <span>Actual record</span>
                <strong>Not signed in</strong>
                <small>Your actual action time will be recorded</small>
              </>
            )}
          </div>
        </div>
      )}

      {startReminder && !day?.closure && (
        <div className="staff-time-reminder">
          <Clock3 aria-hidden="true" size={20} />
          <div>
            <strong>Your working day starts at {normalizeTime(day?.planned_intervals[0]?.start_time)}</strong>
            <span>Remember to sign in when you start working.</span>
          </div>
        </div>
      )}
      {finishReminder && (
        <div className="staff-time-reminder">
          <Clock3 aria-hidden="true" size={20} />
          <div>
            <strong>Your scheduled finish is {normalizeTime(day?.planned_intervals.at(-1)?.end_time)}</strong>
            <span>Remember to sign out when you finish.</span>
          </div>
        </div>
      )}

      {feedback && (
        <div className={`staff-time-feedback is-${feedback.type}`} role="status">
          {feedback.type === "error" ? (
            <AlertTriangle aria-hidden="true" size={18} />
          ) : (
            <CheckCircle2 aria-hidden="true" size={18} />
          )}
          <div>
            {feedback.type === "error" && <strong>Sign-in unavailable</strong>}
            <span>{feedback.message}</span>
          </div>
        </div>
      )}

      {!configured ? (
        <p className="staff-time-setup-note">
          Your official employment time record has not yet been configured. Contact Admin before clocking.
        </p>
      ) : (
        <div className="staff-time-teacher-actions">
          {openSession ? (
            <button type="button" className="staff-time-primary-action" disabled={busy || !mayAttemptClock} onClick={() => void clock("sign_out")}>
              <LogOut aria-hidden="true" size={20} />
              {busy ? "Recording…" : "Sign Out"}
            </button>
          ) : (
            <button type="button" className="staff-time-primary-action" disabled={busy || !mayAttemptClock} onClick={() => void clock("sign_in")}>
              <LogIn aria-hidden="true" size={20} />
              {busy ? "Recording…" : day?.sessions.length ? "Sign In — New Session" : "Sign In"}
            </button>
          )}
          <button type="button" className="staff-time-secondary-action" onClick={() => setCorrectionOpen((open) => !open)} aria-expanded={correctionOpen}>
            Request a correction
            <ChevronDown aria-hidden="true" size={17} />
          </button>
        </div>
      )}

      {day?.unavailable_reason && configured && !day.clocking_available && !day.closure && (
        <p className="staff-time-network-note">
          <ShieldCheck aria-hidden="true" size={16} />
          {day.unavailable_reason}
        </p>
      )}

      {correctionOpen && day && (
        <form className="staff-time-correction-form" onSubmit={submitCorrection}>
          <div className="staff-time-form-heading">
            <strong>Correction request</strong>
            <span>Original records remain unchanged. Admin reviews the requested effective time.</span>
          </div>
          <div className="staff-time-correction-grid">
            <label>
              Reason type
              <select value={correctionType} onChange={(event) => setCorrectionType(event.target.value)}>
                <option value="forgot_sign_in">Forgot to sign in</option>
                <option value="forgot_sign_out">Forgot to sign out</option>
                <option value="incorrect_clock_action">Incorrect clock action</option>
                <option value="technical_problem">Technical problem</option>
                <option value="other">Other</option>
              </select>
            </label>
            <label>
              Related session
              <select value={correctionSessionId} onChange={(event) => setCorrectionSessionId(event.target.value)}>
                <option value="">Missing / no existing session</option>
                {day.sessions
                  .filter((session) => !session.id.startsWith("correction-"))
                  .map((session, index) => (
                    <option key={session.id} value={session.id}>
                      Session {index + 1} · {formatMadridTime(session.original_sign_in_at)}–{formatMadridTime(session.original_sign_out_at)}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Requested sign-in
              <input type="time" value={signInTime} onChange={(event) => setSignInTime(event.target.value)} />
            </label>
            <label>
              Requested sign-out
              <input type="time" value={signOutTime} onChange={(event) => setSignOutTime(event.target.value)} />
            </label>
          </div>
          <label>
            Explanation
            <textarea value={reason} onChange={(event) => setReason(event.target.value)} maxLength={2000} required placeholder="Explain what happened and the time that should be reviewed." />
          </label>
          <div className="staff-time-form-actions">
            <button type="button" onClick={() => setCorrectionOpen(false)} disabled={correctionBusy}>Cancel</button>
            <button type="submit" disabled={correctionBusy || (!signInTime && !signOutTime)}>
              {correctionBusy ? "Sending…" : "Send for review"}
            </button>
          </div>
        </form>
      )}

      <details className="staff-time-privacy-notice">
        <summary>Time Registration &amp; Network Verification</summary>
        <p>
          This system records your actual clock-action timestamps for statutory working-time registration. At each Sign In or Sign Out, the server checks the request network/IP; it does not continuously track location and does not use GPS. Records are retained according to legal requirements and may be accessed by authorised Admin users, professional advisers, or an inspection. If a record is missing or incorrect, use the audited correction process above.
        </p>
      </details>
    </section>
  );
}
