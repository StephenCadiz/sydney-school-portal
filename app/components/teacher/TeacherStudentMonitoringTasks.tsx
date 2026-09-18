"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../../../lib/supabase";

type Monitoring = { id: string; student_name?: string; class_name?: string; level_name?: string; reason: string; feedback_due_on: string; status: string; class_id: string };

export default function TeacherStudentMonitoringTasks() {
  const pathname = usePathname(); const params = useSearchParams(); const router = useRouter();
  const [records, setRecords] = useState<Monitoring[]>([]); const [active, setActive] = useState<Monitoring | null>(null); const [error, setError] = useState(""); const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState({ observations: "", strengths: "", difficulties: "", level_suitability: "", recommendation: "" });
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const [newDeadline, setNewDeadline] = useState("");
  const scopeClassId = pathname === "/teacher/class" ? params.get("id") || "" : "";
  const load = useCallback(async () => { const { data: { session } } = await supabase.auth.getSession(); if (!session?.access_token) return; const response = await fetch(`/api/teacher/student-monitoring${scopeClassId ? `?class_id=${encodeURIComponent(scopeClassId)}` : ""}`, { headers: { Authorization: `Bearer ${session.access_token}` }, cache: "no-store" }); const payload = await response.json().catch(() => ({})); if (response.ok) setRecords((payload.records || []).filter((item: Monitoring) => ["awaiting_teacher_feedback", "monitoring_continued", "overdue"].includes(item.status))); }, [scopeClassId]);
  useEffect(() => {
    if (pathname !== "/teacher" && pathname !== "/teacher/class") return;
    void load();
    const id = window.setInterval(() => void load(), 60_000);
    return () => window.clearInterval(id);
  }, [load, pathname]);
  useEffect(() => {
    if (active) {
      closeButtonRef.current?.focus();
      const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape" && !saving) setActive(null); };
      window.addEventListener("keydown", onKeyDown);
      return () => window.removeEventListener("keydown", onKeyDown);
    }
    returnFocusRef.current?.focus();
    return undefined;
  }, [active, saving]);
  const grouped = useMemo(() => {
    const visible = pathname === "/teacher"
      ? records.filter((record) => record.status !== "monitoring_continued")
      : records;
    return visible.filter((record, index, all) => all.findIndex((item) => item.id === record.id) === index);
  }, [pathname, records]);
  if (pathname !== "/teacher" && pathname !== "/teacher/class") return null;
  if (!grouped.length) return null;
  function openTask(record: Monitoring, mode: "feedback" | "continue") {
    returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setError(""); setNewDeadline(mode === "continue" ? record.feedback_due_on : ""); setActive(record);
  }
  async function submit(action: "continue" | "feedback") { if (!active || saving) return; setSaving(true); setError(""); const { data: { session } } = await supabase.auth.getSession(); try { const response = await fetch(`/api/teacher/student-monitoring/${active.id}`, { method: "POST", headers: { Authorization: `Bearer ${session?.access_token || ""}`, "Content-Type": "application/json" }, body: JSON.stringify(action === "continue" ? { action, new_deadline: newDeadline } : { action, ...feedback }) }); const payload = await response.json(); if (!response.ok) throw new Error(payload.error || "Unable to save monitoring task."); setActive(null); setFeedback({ observations: "", strengths: "", difficulties: "", level_suitability: "", recommendation: "" }); await load(); window.dispatchEvent(new Event("teacher-student-monitoring-updated")); } catch (e) { setError(e instanceof Error ? e.message : "Unable to save monitoring task."); } finally { setSaving(false); } }
  return <>
    <section id="student-monitoring" className="teacher-monitoring-task-cards" aria-label="Student Monitoring tasks"><header><div><h2>Student Monitoring</h2><p>{grouped.length} student{grouped.length === 1 ? "" : "s"} requiring attention</p></div><span className="teacher-monitoring-alert-count">{grouped.length}</span></header>{grouped.map((record) => <article key={record.id} className="teacher-monitoring-task-entry"><div><strong>{record.student_name || "Student"}</strong><span>{record.class_name} · {record.level_name} · Due {record.feedback_due_on}</span><span>{record.reason}</span><span className={record.status === "overdue" ? "monitoring-overdue" : ""}>{record.status === "overdue" ? "Overdue" : "Needs feedback"}</span></div><div className="teacher-monitoring-task-actions"><button type="button" onClick={() => router.push(`/teacher/class?id=${encodeURIComponent(record.class_id)}`)}>Open class</button><button type="button" onClick={() => openTask(record, "feedback")}>Complete feedback</button><button type="button" disabled={record.status === "overdue"} onClick={() => openTask(record, "continue")}>Continue monitoring</button></div></article>)}</section>
    {active && <div className="teacher-monitoring-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) setActive(null); }}><section className="teacher-monitoring-modal" role="dialog" aria-modal="true" aria-labelledby="teacher-monitoring-dialog-title"><button ref={closeButtonRef} className="teacher-monitoring-close" type="button" onClick={() => !saving && setActive(null)} aria-label="Close">×</button><h2 id="teacher-monitoring-dialog-title">{active.student_name || "Student"} · {active.class_name}</h2><p>{active.level_name} · {active.reason}</p>{error && <p role="alert" className="error-message">{error}</p>}<div className="teacher-monitoring-form">{newDeadline !== "" && <label>New deadline<input type="date" value={newDeadline} onChange={(e) => setNewDeadline(e.target.value)} /></label>}{newDeadline !== "" ? <button type="button" disabled={saving || !newDeadline} onClick={() => void submit("continue")}>{saving ? "Saving…" : "Continue monitoring"}</button> : <><label>Observations<textarea required value={feedback.observations} onChange={(e) => setFeedback({ ...feedback, observations: e.target.value })} /></label><label>Strengths<textarea value={feedback.strengths} onChange={(e) => setFeedback({ ...feedback, strengths: e.target.value })} /></label><label>Difficulties<textarea value={feedback.difficulties} onChange={(e) => setFeedback({ ...feedback, difficulties: e.target.value })} /></label><label>Level suitability<textarea value={feedback.level_suitability} onChange={(e) => setFeedback({ ...feedback, level_suitability: e.target.value })} /></label><label>Recommendation<textarea value={feedback.recommendation} onChange={(e) => setFeedback({ ...feedback, recommendation: e.target.value })} /></label><button type="button" disabled={saving || !feedback.observations.trim()} onClick={() => void submit("feedback")}>{saving ? "Saving…" : "Submit feedback"}</button></>}</div></section></div>}
  </>;
}
