"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../../lib/supabase";

type Option = { id: string | number; first_name?: string; last_name?: string; name?: string; class_name?: string; level_id?: number; teacher_id?: string };
type RecordRow = { id: string; student_name?: string; class_name?: string; level_name?: string; teacher_name?: string; reason: string; feedback_due_on: string; status: string; feedback?: any };

function nameOf(item: Option) { return item.name || `${item.first_name || ""} ${item.last_name || ""}`.trim(); }

export default function StudentMonitoringPage() {
  const [options, setOptions] = useState<{ students: Option[]; classes: Option[]; levels: Option[] }>({ students: [], classes: [], levels: [] });
  const [records, setRecords] = useState<RecordRow[]>([]);
  const [form, setForm] = useState({ student_id: "", class_id: "", level_id: "", reason: "", feedback_due_on: "" });
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [decision, setDecision] = useState<Record<string, string>>({});

  async function authHeaders(): Promise<Record<string, string>> {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token ? { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" } : { "Content-Type": "application/json" };
  }
  async function load() {
    setLoading(true);
    try {
      const headers = await authHeaders();
      const [optionsResponse, recordsResponse] = await Promise.all([fetch("/api/admin/student-monitoring?options=1", { headers, cache: "no-store" }), fetch("/api/admin/student-monitoring", { headers, cache: "no-store" })]);
      const optionsPayload = await optionsResponse.json(); const recordsPayload = await recordsResponse.json();
      if (!optionsResponse.ok || !recordsResponse.ok) throw new Error(optionsPayload.error || recordsPayload.error || "Unable to load monitoring.");
      setOptions(optionsPayload); setRecords(recordsPayload.records || []);
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to load monitoring."); } finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);
  const selectedClass = options.classes.find((item) => String(item.id) === form.class_id);
  const levels = useMemo(() => options.levels, [options.levels]);
  async function createRecord(event: React.FormEvent) {
    event.preventDefault(); setError(""); setStatus("");
    try {
      const response = await fetch("/api/admin/student-monitoring", { method: "POST", headers: await authHeaders(), body: JSON.stringify(form) });
      const payload = await response.json(); if (!response.ok) throw new Error(payload.error || "Unable to create monitoring record.");
      setStatus("Student monitoring created successfully."); setForm({ student_id: "", class_id: "", level_id: "", reason: "", feedback_due_on: "" }); await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to create monitoring record."); }
  }
  async function saveDecision(record: RecordRow) {
    const value = decision[record.id];
    if (!value) return;
    setError(""); setStatus("");
    try {
      const response = await fetch(`/api/admin/student-monitoring/${record.id}`, { method: "PATCH", headers: await authHeaders(), body: JSON.stringify({ decision: value }) });
      const payload = await response.json(); if (!response.ok) throw new Error(payload.error || "Unable to save decision.");
      setStatus("Monitoring decision saved successfully."); await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to save decision."); }
  }
  return <div className="admin-student-monitoring-page">
    <section className="admin-page-card">
      <h1>Student Monitoring</h1><p>Track support decisions, teacher feedback, deadlines, and outcomes.</p>
      <form onSubmit={createRecord} className="admin-student-monitoring-form">
        <label>Student<select required value={form.student_id} onChange={(e) => setForm({ ...form, student_id: e.target.value })}><option value="">Select student</option>{options.students.map((item) => <option key={String(item.id)} value={String(item.id)}>{nameOf(item)}</option>)}</select></label>
        <label>Class<select required value={form.class_id} onChange={(e) => { const cls = options.classes.find((item) => String(item.id) === e.target.value); setForm({ ...form, class_id: e.target.value, level_id: cls?.level_id ? String(cls.level_id) : "" }); }}><option value="">Select class</option>{options.classes.map((item) => <option key={String(item.id)} value={String(item.id)}>{item.class_name || nameOf(item)}</option>)}</select></label>
        <label>Level<select required value={form.level_id} onChange={(e) => setForm({ ...form, level_id: e.target.value })}><option value="">Select level</option>{levels.map((item) => <option key={String(item.id)} value={String(item.id)}>{item.name || nameOf(item)}</option>)}</select></label>
        <label>Feedback deadline<input required type="date" value={form.feedback_due_on} onChange={(e) => setForm({ ...form, feedback_due_on: e.target.value })} /></label>
        <label className="admin-student-monitoring-wide">Reason<textarea required value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} /></label>
        <p className="admin-student-monitoring-teacher">Assigned teacher: {selectedClass?.teacher_id ? "Assigned from class" : "Select a class"}</p>
        <button type="submit">Create monitoring record</button>
      </form>
      {status && <p role="status" className="success-message">{status}</p>}{error && <p role="alert" className="error-message">{error}</p>}
    </section>
    <section className="admin-page-card"><h2>Monitoring history</h2>{loading ? <p>Loading monitoring records…</p> : records.length === 0 ? <p>No monitoring records yet.</p> : <div className="admin-monitoring-list">{records.map((record) => <article key={record.id} className="admin-monitoring-row"><div><strong>{record.student_name || "Student"}</strong><span>{record.class_name} · {record.level_name} · {record.teacher_name}</span><span>{record.reason}</span>{record.feedback && <details><summary>Teacher feedback</summary><p>{String(record.feedback.observations || "")}</p>{record.feedback.strengths && <p>Strengths: {String(record.feedback.strengths)}</p>}{record.feedback.difficulties && <p>Difficulties: {String(record.feedback.difficulties)}</p>}</details>}</div><div><strong className={`monitoring-status monitoring-status-${record.status}`}>{record.status.replaceAll("_", " ")}</strong><span>Due {record.feedback_due_on}</span>{record.status === "feedback_submitted" && <div className="admin-monitoring-decision"><select aria-label={`Decision for ${record.student_name || "student"}`} value={decision[record.id] || ""} onChange={(e) => setDecision({ ...decision, [record.id]: e.target.value })}><option value="">Choose outcome</option><option value="kept">Keep level</option><option value="moved_up">Move up</option><option value="moved_down">Move down</option><option value="continued">Continue monitoring</option><option value="closed">Close monitoring</option></select><button type="button" onClick={() => void saveDecision(record)} disabled={!decision[record.id]}>Save outcome</button></div>}</div></article>)}</div>}</section>
  </div>;
}
