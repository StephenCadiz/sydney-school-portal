"use client";

import { useCallback, useEffect, useState } from "react";
import { madridEnrolmentDate } from "../../../lib/classEnrolment";
import { supabase } from "../../../lib/supabase";

type Period = { id: string; class_id: string; class_name: string; student_type: string; starts_on: string; ends_before: string | null; cancelled_at: string | null };
type Props = {
  studentId: string;
  studentType: "profile" | "young_learner";
  classes: { id: string; label: string }[];
  onChanged: () => Promise<void>;
};

async function enrolmentRequest(url: string, body?: object) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Sign in as an Admin to manage enrolment.");
  const response = await fetch(url, {
    method: body ? "POST" : "GET",
    headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Unable to load enrolment.");
  return data;
}

export default function AdminClassEnrolments({ studentId, studentType, classes, onChanged }: Props) {
  const [periods, setPeriods] = useState<Period[]>([]);
  const [today, setToday] = useState(madridEnrolmentDate);
  const [action, setAction] = useState("enrol");
  const [periodId, setPeriodId] = useState("");
  const [classId, setClassId] = useState("");
  const [start, setStart] = useState(madridEnrolmentDate);
  const [end, setEnd] = useState("");
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [message, setMessage] = useState("");
  const selected = periods.find(period => period.id === periodId);

  const load = useCallback(async () => {
    const data = await enrolmentRequest(`/api/admin/class-enrolments?student_type=${studentType}&student_id=${studentId}`);
    setPeriods(data.periods);
    setToday(data.today_madrid);
    setReady(true);
  }, [studentId, studentType]);

  useEffect(() => {
    void Promise.resolve().then(load).catch(error => setMessage(error.message));
  }, [load]);

  function choosePeriod(id: string) {
    const period = periods.find(item => item.id === id);
    setPeriodId(id);
    if (period) {
      setStart(action === "transfer" ? today : period.starts_on);
      setEnd(action === "withdraw" ? today : period.ends_before || "");
    }
  }

  async function save() {
    if (action !== "enrol" && !selected) return setMessage("Choose the enrolment period to change.");
    const targetClass = ["withdraw", "correct", "cancel"].includes(action) ? selected!.class_id : classId;
    if (!targetClass || !start || (action === "withdraw" && !end)) return setMessage("Choose a class and provide the required dates.");
    if (!window.confirm("Confirm that these dates are supported by the student's registration, withdrawal or transfer records for this specific class. If historical dates are uncertain, cancel and obtain Admin evidence first; do not substitute profile, course or academic-year start dates. Save this change? Attendance outside the resulting periods will be excluded, but historical records will remain stored.")) return;
    setBusy(true);
    setMessage("");
    try {
      await enrolmentRequest("/api/admin/class-enrolments", {
        student_type: studentType, student_id: studentId, action, class_id: targetClass,
        starts_on: start, ends_before: ["withdraw", "correct", "cancel"].includes(action) ? end || null : null,
        period_id: action === "enrol" ? null : periodId,
      });
      await load();
      await onChanged();
      setPeriodId("");
      setMessage("Enrolment saved. Historical attendance records were preserved.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to save enrolment.");
    } finally { setBusy(false); }
  }

  return <section className="enrolment-panel" aria-label="Class enrolment">
    <h3>Class enrolment</h3>
    <p>{studentType === "profile" ? "Cambridge student" : "Young Learner"} · Dates use Europe/Madrid. The start is included; the first non-enrolled day is excluded.</p>
    <p>Use verified dates for this specific class. If a historical joining or leaving date is uncertain, stop and obtain supporting registration, withdrawal or transfer records before saving. A course, academic-year or profile creation date is not proof of enrolment.</p>
    <div className="enrolment-history">
      <table>
        <thead><tr><th>Class</th><th>First enrolled day</th><th>First non-enrolled day</th><th>Status</th></tr></thead>
        <tbody>{periods.map(period => <tr key={period.id}>
          <td>{period.class_name}</td><td>{period.starts_on}</td><td>{period.ends_before || "—"}</td>
          <td>{period.cancelled_at ? "Cancelled before start" : period.starts_on > today ? "Scheduled" : period.ends_before && period.ends_before <= today ? "Ended" : "Open period"}</td>
        </tr>)}</tbody>
      </table>
      {ready && !periods.length && <p>No class enrolment periods.</p>}
    </div>
    <fieldset disabled={busy || !ready}>
      <label>Operation<select value={action} onChange={event => {
        setAction(event.target.value); setPeriodId(""); setStart(today); setEnd("");
      }}>
        <option value="enrol">Enrol / re-enrol in a class</option>
        <option value="transfer">Transfer to another class</option>
        <option value="withdraw">Withdraw from a class</option>
        <option value="correct">Correct period dates</option>
        <option value="cancel">Cancel a future enrolment</option>
      </select></label>
      {action !== "enrol" && <label>Existing period<select value={periodId} onChange={event => choosePeriod(event.target.value)}>
        <option value="">Choose a period</option>
        {periods.filter(period => !period.cancelled_at && (action !== "cancel" || period.starts_on > today)).map(period => <option key={period.id} value={period.id}>{period.class_name} · {period.starts_on} → {period.ends_before || "open"}</option>)}
      </select></label>}
      {(action === "enrol" || action === "transfer") && <label>{action === "transfer" ? "New class" : "Class"}<select value={classId} onChange={event => setClassId(event.target.value)}>
        <option value="">Choose a class</option>
        {classes.map(classroom => <option key={classroom.id} value={classroom.id}>{classroom.label}</option>)}
      </select></label>}
      <label>{action === "transfer" ? "Effective transfer date" : "Enrolment start date"}<input type="date" value={start} readOnly={action === "withdraw" || action === "cancel"} onChange={event => setStart(event.target.value)} /></label>
      {action === "cancel" && <p>The future assignment stays in history but never counts as enrolment. An assignment that has already started cannot be cancelled.</p>}
      {(action === "withdraw" || action === "correct") && <label>First non-enrolled day{action === "correct" ? " (leave blank for open-ended)" : ""}<input type="date" value={end} onChange={event => setEnd(event.target.value)} /></label>}
      <button type="button" className="admin-students-secondary-button" onClick={() => void save()}>{busy ? "Saving enrolment…" : "Save enrolment change"}</button>
    </fieldset>
    {message && <p role="status">{message}</p>}
    <style jsx>{`
      .enrolment-panel { border-top: 1px solid #e2e8f0; margin-top: 20px; padding-top: 20px; }
      h3 { margin: 0 0 8px; color: #142b49; } p { font-size: 13px; color: #526176; line-height: 1.5; }
      .enrolment-history { overflow-x: auto; margin: 16px 0; } table { width: 100%; border-collapse: collapse; font-size: 12px; }
      th, td { text-align: left; padding: 10px 8px; border-bottom: 1px solid #e2e8f0; } th { color: #526176; font-weight: 600; }
      fieldset { border: 0; padding: 0; display: grid; gap: 12px; grid-template-columns: repeat(auto-fit,minmax(210px,1fr)); }
      label { display: grid; gap: 6px; font-size: 13px; color: #263b54; } select, input { min-width: 0; width: 100%; border: 1px solid #cbd5e1; border-radius: 8px; padding: 10px; background: #fff; }
      button { align-self: end; } @media(max-width: 540px) { fieldset { grid-template-columns: 1fr; } }
    `}</style>
  </section>;
}
