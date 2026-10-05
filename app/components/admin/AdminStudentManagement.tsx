"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { madridEnrolmentDate } from "../../../lib/classEnrolment";
import { supabase } from "../../../lib/supabase";

type Period = {
  id: string;
  class_id: string;
  class_name: string;
  level_name?: string;
  starts_on: string;
  ends_before: string | null;
  cancelled_at: string | null;
};

type ClassOption = {
  id: string;
  class_name: string;
  level_name: string;
  days: string | null;
  start_time: string | null;
  end_time: string | null;
  classroom_name: string | null;
  teacher_name: string | null;
};

type Props = {
  studentId: string;
  studentType: "profile" | "young_learner";
  studentName?: string;
  studentLevel?: string;
  studentClass?: string;
  studentSchedule?: string;
  studentTeacher?: string;
  onChanged?: () => Promise<void> | void;
};

async function request(url: string, body?: Record<string, unknown>) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error("Your Admin session has expired.");
  const response = await fetch(url, {
    method: body ? "POST" : "GET",
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "Unable to save Student Management change.");
  return payload;
}

function formatPeriodStatus(period: Period, today: string) {
  if (period.cancelled_at) return "Cancelled";
  if (period.starts_on > today) return "Future re-enrolment";
  if (period.ends_before && period.ends_before <= today) return "Withdrawn";
  return "Active";
}

function formatSchedule(option: ClassOption | undefined) {
  if (!option) return "Schedule not available";
  const time = [option.start_time, option.end_time].filter(Boolean).map(value => String(value).slice(0, 5)).join("–");
  return [option.days, time].filter(Boolean).join(" · ") || "Schedule not available";
}

function formatClassOptionLabel(option: ClassOption) {
  const time = [option.start_time, option.end_time]
    .filter(Boolean)
    .map(value => String(value).slice(0, 5))
    .join("–");
  return [
    option.classroom_name || option.class_name || "Class name unavailable",
    option.level_name || "Level unavailable",
    option.teacher_name || "Teacher not assigned",
    option.days || "Days not set",
    time || "Time not set",
  ].join(" · ");
}

export default function AdminStudentManagement({ studentId, studentType, studentName, studentLevel, studentClass, studentSchedule, studentTeacher, onChanged }: Props) {
  const [periods, setPeriods] = useState<Period[]>([]);
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [today, setToday] = useState(madridEnrolmentDate());
  const [portalActive, setPortalActive] = useState<boolean | null>(studentType === "profile" ? null : false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [transferClass, setTransferClass] = useState("");
  const [transferDate, setTransferDate] = useState(madridEnrolmentDate());
  const [withdrawDate, setWithdrawDate] = useState(madridEnrolmentDate());
  const [withdrawReason, setWithdrawReason] = useState("");
  const [readdClass, setReaddClass] = useState("");
  const [readdDate, setReaddDate] = useState(madridEnrolmentDate());
  const [confirmAction, setConfirmAction] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await request(`/api/admin/class-enrolments?student_type=${studentType}&student_id=${studentId}`);
      setPeriods(Array.isArray(data.periods) ? data.periods : []);
      setClasses(Array.isArray(data.classes) ? data.classes : []);
      if (data.today_madrid) setToday(data.today_madrid);
      if (studentType === "profile") {
        const access = await request(`/api/admin/students/${encodeURIComponent(studentId)}/access-control`);
        const effectiveToday = String(data.today_madrid || madridEnrolmentDate());
        const currentPeriod = (Array.isArray(data.periods) ? data.periods : []).some((period: Period) =>
          !period.cancelled_at && period.starts_on <= effectiveToday && (!period.ends_before || effectiveToday < period.ends_before)
        );
        setPortalActive(Boolean(access.auth_confirmed && currentPeriod));
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to load Student Management.");
    } finally {
      setLoading(false);
    }
  }, [studentId, studentType]);

  useEffect(() => { void load(); }, [load]);

  const activePeriod = useMemo(() => periods.find(period =>
    !period.cancelled_at && period.starts_on <= today && (!period.ends_before || today < period.ends_before)
  ), [periods, today]);
  const activeClass = classes.find(option => option.id === activePeriod?.class_id);
  const compatibleClasses = classes.filter(option => option.id !== activePeriod?.class_id);
  const statusLabel = activePeriod
    ? "Active"
    : periods.some(period => period.starts_on > today && !period.cancelled_at)
      ? "Future re-enrolment"
      : "Withdrawn";

  async function save(action: "transfer" | "withdraw" | "enrol") {
    if (busy) return;
    const targetClass = action === "transfer" ? transferClass : action === "enrol" ? readdClass : activePeriod?.class_id;
    const startsOn = action === "transfer" ? transferDate : action === "enrol" ? readdDate : activePeriod?.starts_on;
    const endsBefore = action === "withdraw" ? withdrawDate : null;
    if (!targetClass || !startsOn || (action === "withdraw" && !withdrawReason.trim())) {
      setError(action === "withdraw" ? "Choose a withdrawal date and reason." : "Choose a class and effective date.");
      return;
    }
    if (action !== "enrol" && !activePeriod) {
      setError("There is no active enrolment to change.");
      return;
    }
    if (confirmAction !== action) {
      setConfirmAction(action);
      return;
    }
    setBusy(true); setError(""); setMessage("");
    try {
      await request("/api/admin/class-enrolments", {
        student_type: studentType,
        student_id: studentId,
        action,
        class_id: targetClass,
        starts_on: startsOn,
        ends_before: endsBefore,
        period_id: action === "enrol" ? null : activePeriod?.id,
        reason: action === "withdraw" ? withdrawReason.trim() : null,
      });
      setConfirmAction("");
      setMessage(action === "withdraw" ? "Student withdrawn while preserving the full history." : action === "enrol" ? "Student re-enrolled successfully." : "Class changed successfully.");
      await load();
      await onChanged?.();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to save Student Management change.");
    } finally { setBusy(false); }
  }

  return (
    <section className="admin-student-management" aria-labelledby="student-management-title">
      <header className="admin-student-management-header">
        <div className="admin-student-management-header-copy">
          <p className="admin-student-management-eyebrow">ADMIN MANAGEMENT</p>
          <h3 id="student-management-title">Student Management</h3>
          <p>Manage placement and school status while preserving the complete student history.</p>
          <div className="admin-student-management-identity" aria-label="Student summary">
            <strong>{studentName || "Student"}</strong>
            <span>{studentType === "profile" ? "Cambridge" : "Young Learner"}</span>
            <span>{studentLevel || "Level not available"}</span>
            <span>{studentClass || "Class not available"}</span>
            <span>{studentSchedule || "Timetable not available"}</span>
            <span>{studentTeacher || "Teacher not assigned"}</span>
          </div>
        </div>
        <div className="admin-student-management-status" aria-label="Student status">
          <span className={`admin-student-management-status-badge ${statusLabel === "Active" ? "is-active" : statusLabel === "Withdrawn" ? "is-withdrawn" : "is-future"}`}>{statusLabel}</span>
          <span className="admin-student-management-portal-status">{studentType === "profile" ? portalActive === null ? "Portal status loading…" : portalActive ? "Portal access active" : "Portal access inactive" : "Young Learner portal access not applicable"}</span>
        </div>
      </header>
      {error && <p className="admin-student-management-error" role="alert">{error}</p>}
      {message && <p className="admin-student-management-success" role="status">{message}</p>}
      {loading ? <p>Loading enrolment history…</p> : (
        <>
          <section className="admin-student-management-card admin-student-management-placement"><div className="admin-student-management-card-heading"><div><p className="admin-student-management-eyebrow">CURRENT RECORD</p><h4>Current placement</h4></div><span className="admin-student-management-card-icon" aria-hidden="true">⌂</span></div>{activePeriod ? <div className="admin-student-management-grid"><div><span>Class</span><strong>{activePeriod.class_name}</strong></div><div><span>Level</span><strong>{activePeriod.level_name || activeClass?.level_name || "Level"}</strong></div><div><span>Schedule</span><strong>{formatSchedule(activeClass)}</strong></div><div><span>Teacher</span><strong>{activeClass?.teacher_name || "Teacher not assigned"}</strong></div><div><span>Enrolled from</span><strong>{activePeriod.starts_on}</strong></div><div><span>Until</span><strong>{activePeriod.ends_before || "Current"}</strong></div></div> : <p className="admin-student-management-muted">No current active enrolment.</p>}</section>
          <section className="admin-student-management-card admin-student-management-action-card"><div className="admin-student-management-card-heading"><div><p className="admin-student-management-eyebrow">PLACEMENT</p><h4>Change class</h4></div><span className="admin-student-management-card-number">01</span></div><p>Move the student to a new class from a specific Madrid-local date. The current period closes the day before.</p><div className="admin-student-management-form"><label>New class<select aria-label="New class" value={transferClass} onChange={event => setTransferClass(event.target.value)}><option value="">Choose a class</option>{compatibleClasses.map(option => <option key={option.id} value={option.id}>{formatClassOptionLabel(option)}</option>)}</select></label><label>Effective Madrid date<input aria-label="Effective Madrid date" type="date" value={transferDate} onChange={event => setTransferDate(event.target.value)} /></label><button type="button" disabled={busy || !activePeriod} onClick={() => void save("transfer")}>{busy ? "Saving…" : "Change class"}</button></div></section>
          <section className="admin-student-management-card admin-student-management-action-card is-warning"><div className="admin-student-management-card-heading"><div><p className="admin-student-management-eyebrow">STATUS CHANGE</p><h4>Remove from school</h4></div><span className="admin-student-management-card-number">02</span></div><p>End the active enrolment from the selected date. Future-dated withdrawals preserve access until that date.</p><div className="admin-student-management-form"><label>Withdrawal date<input aria-label="Withdrawal date" type="date" value={withdrawDate} onChange={event => setWithdrawDate(event.target.value)} /></label><label>Reason<span className="admin-student-management-required">Required</span><textarea aria-label="Withdrawal reason" value={withdrawReason} onChange={event => setWithdrawReason(event.target.value)} maxLength={500} rows={3} placeholder="Reason for withdrawal" /></label><button type="button" className="admin-student-management-danger" disabled={busy || !activePeriod || !withdrawReason.trim()} onClick={() => void save("withdraw")}>{busy ? "Saving…" : "Remove from school"}</button></div></section>
          <section className="admin-student-management-card admin-student-management-action-card"><div className="admin-student-management-card-heading"><div><p className="admin-student-management-eyebrow">RETURN</p><h4>Re-add student</h4></div><span className="admin-student-management-card-number">03</span></div><p>Start a new enrolment and restore Student Portal access from the re-enrolment date.</p><div className="admin-student-management-form"><label>Class<select aria-label="Re-enrolment class" value={readdClass} onChange={event => setReaddClass(event.target.value)}><option value="">Choose a class</option>{classes.map(option => <option key={option.id} value={option.id}>{formatClassOptionLabel(option)}</option>)}</select></label><label>Re-enrolment date<input aria-label="Re-enrolment date" type="date" value={readdDate} onChange={event => setReaddDate(event.target.value)} /></label><button type="button" disabled={busy || Boolean(activePeriod)} onClick={() => void save("enrol")}>{busy ? "Saving…" : "Re-add student"}</button></div></section>
          {confirmAction && <div className="admin-student-management-confirm" role="alertdialog" aria-modal="true" aria-label="Confirm student management change"><div><strong>Confirm this change?</strong><p>This action is recorded against the Admin account and preserves historical records.</p></div><div className="admin-student-management-confirm-actions"><button type="button" onClick={() => setConfirmAction("")}>Cancel</button><button type="button" onClick={() => { const action = confirmAction as "transfer" | "withdraw" | "enrol"; void save(action); }}>Confirm</button></div></div>}
          <section className="admin-student-management-card admin-student-management-history"><div className="admin-student-management-card-heading"><div><p className="admin-student-management-eyebrow">AUDIT TRAIL</p><h4>Enrolment history</h4></div><span className="admin-student-management-card-icon" aria-hidden="true">↗</span></div><div className="admin-student-management-timeline">{periods.map(period => <div key={period.id}><span className="admin-student-management-timeline-dot" aria-hidden="true" /><div><strong>{period.class_name}</strong><span>{period.starts_on} → {period.ends_before || "Open-ended"}</span></div><em className={formatPeriodStatus(period, today) === "Active" ? "is-active" : ""}>{formatPeriodStatus(period, today)}</em></div>)}{!periods.length && <p className="admin-student-management-muted">No enrolment history.</p>}</div></section>
        </>
      )}
    </section>
  );
}
