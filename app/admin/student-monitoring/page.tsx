"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../../../lib/supabase";
import AdminLayout from "../../components/layout/AdminLayout";

type Student = { id: string; student_type: "profile" | "young_learner"; first_name: string | null; last_name: string | null; email: string | null; enrolments?: Enrolment[] };
type Enrolment = { class_id: string; class_name: string; level_id: number; level_name: string; days: string | null; start_time: string | null; end_time: string | null; teacher_id: string; teacher_name: string; starts_on: string; ends_before: string | null };
type RecordRow = { id: string; student_name?: string; programme?: string; class_name?: string; level_name?: string; days?: string | null; start_time?: string | null; end_time?: string | null; teacher_name?: string; reason: string; feedback_due_on: string; status: string; submitted_at?: string | null; admin_notes?: string | null; decision?: string | null; feedback?: { observations?: string | null; strengths?: string | null; difficulties?: string | null; level_suitability?: string | null; recommendation?: string | null; notes?: string | null } | null };

const fullName = (student: Student) => `${student.first_name || ""} ${student.last_name || ""}`.trim() || "Student";
const time = (value: string | null) => value ? String(value).slice(0, 5) : "—";

export default function StudentMonitoringPage() {
  const [records, setRecords] = useState<RecordRow[]>([]);
  const [search, setSearch] = useState("");
  const [matches, setMatches] = useState<Student[]>([]);
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [enrolments, setEnrolments] = useState<Enrolment[]>([]);
  const [selectedClassId, setSelectedClassId] = useState("");
  const [form, setForm] = useState({ reason: "", feedback_due_on: "" });
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [loadingEnrolments, setLoadingEnrolments] = useState(false);
  const [decision, setDecision] = useState<Record<string, string>>({});
  const [decisionNotes, setDecisionNotes] = useState<Record<string, string>>({});
  const [decisionDeadlines, setDecisionDeadlines] = useState<Record<string, string>>({});
  const [savingDecision, setSavingDecision] = useState<Record<string, boolean>>({});
  const searchRequest = useRef(0);
  const enrolmentRequest = useRef(0);

  async function authHeaders(): Promise<Record<string, string>> {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token ? { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" } : { "Content-Type": "application/json" };
  }
  async function loadRecords() {
    setLoading(true);
    try {
      const response = await fetch("/api/admin/student-monitoring", { headers: await authHeaders(), cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Unable to load monitoring.");
      setRecords(payload.records || []);
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to load monitoring."); } finally { setLoading(false); }
  }
  useEffect(() => { void loadRecords(); }, []);

  useEffect(() => {
    const term = search.trim();
    if (!term || term.length < 2 || selectedStudent) { setMatches([]); setSearching(false); return; }
    const request = ++searchRequest.current;
    const timer = window.setTimeout(async () => {
      setSearching(true); setError("");
      try {
        const response = await fetch(`/api/admin/student-monitoring/students?q=${encodeURIComponent(term)}`, { headers: await authHeaders(), cache: "no-store" });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "Unable to search students.");
        if (request === searchRequest.current) setMatches(payload.students || []);
      } catch (e) { if (request === searchRequest.current) setError(e instanceof Error ? e.message : "Unable to search students."); }
      finally { if (request === searchRequest.current) setSearching(false); }
    }, 250);
    return () => window.clearTimeout(timer);
  }, [search, selectedStudent]);

  async function selectStudent(student: Student) {
    const request = ++enrolmentRequest.current;
    setSelectedStudent(student); setSearch(fullName(student)); setMatches([]); setEnrolments([]); setSelectedClassId(""); setLoadingEnrolments(true); setError("");
    try {
      const response = await fetch(`/api/admin/student-monitoring/students/${encodeURIComponent(student.id)}?student_type=${encodeURIComponent(student.student_type)}`, { headers: await authHeaders(), cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Unable to load active enrolment.");
      const loaded = payload.enrolments || [];
      if (request !== enrolmentRequest.current) return;
      setEnrolments(loaded); if (loaded.length === 1) setSelectedClassId(loaded[0].class_id);
      if (!loaded.length) setError("This student has no active enrolment.");
    } catch (e) { if (request === enrolmentRequest.current) setError(e instanceof Error ? e.message : "Unable to load active enrolment."); }
    finally { if (request === enrolmentRequest.current) setLoadingEnrolments(false); }
  }
  const selectedEnrolment = useMemo(() => enrolments.find((item) => item.class_id === selectedClassId) || null, [enrolments, selectedClassId]);
  function clearStudent() { setSelectedStudent(null); setSearch(""); setMatches([]); setEnrolments([]); setSelectedClassId(""); }
  async function createRecord(event: React.FormEvent) {
    event.preventDefault(); setError(""); setStatus("");
    if (!selectedStudent || !selectedEnrolment || !form.reason.trim() || !form.feedback_due_on) { setError("Select a student with an active class, then provide a reason and deadline."); return; }
    try {
      const response = await fetch("/api/admin/student-monitoring", { method: "POST", headers: await authHeaders(), body: JSON.stringify({ student_id: selectedStudent.id, student_type: selectedStudent.student_type, class_id: selectedEnrolment.class_id, reason: form.reason, feedback_due_on: form.feedback_due_on }) });
      const payload = await response.json(); if (!response.ok) throw new Error(payload.error || "Unable to create monitoring record.");
      setStatus("Student monitoring created successfully."); setForm({ reason: "", feedback_due_on: "" }); clearStudent(); await loadRecords();
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to create monitoring record."); }
  }
  async function saveDecision(record: RecordRow) {
    const value = decision[record.id];
    if (!value || savingDecision[record.id]) return;
    if (value === "continued" && !decisionDeadlines[record.id]) {
      setError("Add a new deadline before continuing monitoring.");
      return;
    }
    setSavingDecision((current) => ({ ...current, [record.id]: true }));
    setError(""); setStatus("");
    try {
      const response = await fetch(`/api/admin/student-monitoring/${record.id}`, { method: "PATCH", headers: await authHeaders(), body: JSON.stringify({ decision: value, admin_notes: decisionNotes[record.id] || null, new_deadline: value === "continued" ? decisionDeadlines[record.id] : null }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Unable to save decision.");
      setStatus("Monitoring outcome saved successfully.");
      window.dispatchEvent(new Event("admin-student-monitoring-changed"));
      await loadRecords();
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to save decision."); }
    finally { setSavingDecision((current) => ({ ...current, [record.id]: false })); }
  }

  return <AdminLayout><div className="admin-student-monitoring-page">
    <section className="admin-page-card">
      <h1>Student Monitoring</h1><p>Track support decisions, teacher feedback, deadlines, and outcomes.</p>
      <form onSubmit={createRecord} className="admin-student-monitoring-form">
        <div className="admin-monitoring-combobox-wrap admin-student-monitoring-wide">
          <label htmlFor="monitoring-student-search">Student</label>
          <div className="admin-monitoring-combobox">
            <input id="monitoring-student-search" role="combobox" aria-expanded={matches.length > 0} aria-haspopup="listbox" aria-controls="monitoring-student-results" type="search" autoComplete="off" value={search} placeholder="Search student by first name or surname" onChange={(event) => { setSearch(event.target.value); if (selectedStudent) clearStudent(); }} aria-autocomplete="list" />
            {selectedStudent && <button type="button" className="admin-monitoring-clear" onClick={clearStudent} aria-label="Clear selected student">×</button>}
          </div>
          {searching && <p className="admin-monitoring-search-state" role="status">Searching…</p>}
          {!searching && search.trim().length >= 2 && !selectedStudent && matches.length === 0 && <p className="admin-monitoring-search-state">No matching students.</p>}
          {matches.length > 0 && <ul id="monitoring-student-results" className="admin-monitoring-combobox-results" role="listbox">{matches.map((student) => {
            const isSelected = selectedStudent?.id === student.id && selectedStudent.student_type === student.student_type;
            return <li key={`${student.student_type}:${student.id}`} role="option" aria-selected={isSelected}><button type="button" className={isSelected ? "is-selected" : undefined} onClick={() => void selectStudent(student)}><strong>{fullName(student)}</strong><span className="admin-monitoring-result-programme">Programme: {student.student_type === "young_learner" ? "Young Learner" : "Cambridge"} · {student.email || "No email"}</span>{student.enrolments?.length ? student.enrolments.length === 1 ? <span className="admin-monitoring-result-enrolment">{student.enrolments[0].level_name} · {student.enrolments[0].class_name} · {student.enrolments[0].days || "Days not set"} · {time(student.enrolments[0].start_time)}–{time(student.enrolments[0].end_time)} · {student.enrolments[0].teacher_name}</span> : <span className="admin-monitoring-result-enrolment">{student.enrolments.length} active enrolments · choose a class after selecting</span> : <span className="admin-monitoring-result-enrolment">No active enrolment</span>}</button></li>;
          })}</ul>}
        </div>
        {selectedStudent && <div className="admin-monitoring-enrolment-panel admin-student-monitoring-wide">
          <h3>{fullName(selectedStudent)} · Active enrolment</h3>
          {loadingEnrolments ? <p role="status">Loading active enrolment…</p> : enrolments.length === 0 ? <p role="alert">No active enrolment is available.</p> : <>
            {enrolments.length > 1 && <label>Class/enrolment<select value={selectedClassId} onChange={(event) => setSelectedClassId(event.target.value)}><option value="">Select class</option>{enrolments.map((item) => <option key={item.class_id} value={item.class_id}>{item.class_name} · {item.level_name}</option>)}</select></label>}
            {selectedEnrolment && <dl className="admin-monitoring-enrolment-details"><div><dt>Programme</dt><dd>{selectedStudent.student_type === "young_learner" ? "Young Learner" : "Cambridge"}</dd></div><div><dt>Level</dt><dd>{selectedEnrolment.level_name}</dd></div><div><dt>Class</dt><dd>{selectedEnrolment.class_name}</dd></div><div><dt>Days</dt><dd>{selectedEnrolment.days || "—"}</dd></div><div><dt>Time</dt><dd>{time(selectedEnrolment.start_time)}–{time(selectedEnrolment.end_time)}</dd></div><div><dt>Assigned teacher</dt><dd>{selectedEnrolment.teacher_name}</dd></div></dl>}
          </>}
        </div>}
        <label className="admin-student-monitoring-wide">Reason<textarea required value={form.reason} onChange={(event) => setForm({ ...form, reason: event.target.value })} /></label>
        <label>Feedback deadline<input required type="date" value={form.feedback_due_on} onChange={(event) => setForm({ ...form, feedback_due_on: event.target.value })} /></label>
        <button type="submit" disabled={!selectedStudent || !selectedEnrolment || !form.reason.trim() || !form.feedback_due_on || loadingEnrolments}>Create monitoring record</button>
      </form>
      {status && <p role="status" className="success-message">{status}</p>}{error && <p role="alert" className="error-message">{error}</p>}
    </section>
    <section className="admin-page-card" aria-labelledby="monitoring-history-title"><h2 id="monitoring-history-title">Monitoring history</h2>{loading ? <p>Loading monitoring records…</p> : records.length === 0 ? <p>No monitoring records yet.</p> : <div className="admin-monitoring-list">{records.map((record) => {
      const feedback = record.feedback;
      const statusLabel: Record<string, string> = { awaiting_teacher_feedback: "Awaiting teacher feedback", feedback_submitted: "Admin decision pending", overdue: "Overdue", monitoring_continued: "Continued monitoring", kept: "Kept at level", moved_up: "Moved up", moved_down: "Moved down", continued: "Continued monitoring", closed: "Closed" };
      const schedule = [record.days, record.start_time || record.end_time ? `${time(record.start_time || null)}–${time(record.end_time || null)}` : null].filter(Boolean).join(" · ");
      const isSaving = Boolean(savingDecision[record.id]);
      return <article key={record.id} className="admin-monitoring-record-card">
        <header className="admin-monitoring-record-header"><div><p className="admin-monitoring-eyebrow">{record.programme || "Cambridge"}</p><h3>{record.student_name || "Student"}</h3><p className="admin-monitoring-record-meta">{record.class_name || "Class"} · {record.level_name || "Level"}{schedule ? ` · ${schedule}` : ""} · {record.teacher_name || "Teacher"}</p></div><span className={`monitoring-status-badge monitoring-status-${record.status}`}>{statusLabel[record.status] || record.status.replaceAll("_", " ")}</span></header>
        <div className="admin-monitoring-record-details"><div><span>Feedback deadline</span><strong>{record.feedback_due_on}</strong></div><div><span>Feedback submitted</span><strong>{record.submitted_at ? new Date(record.submitted_at).toLocaleDateString("en-GB") : "Not submitted"}</strong></div><div><span>Reason</span><strong>{record.reason}</strong></div></div>
        {feedback && <section className="admin-monitoring-record-section"><h4>Teacher feedback</h4><dl className="admin-monitoring-feedback-grid"><div><dt>Overall observation</dt><dd>{feedback.observations || "Not provided"}</dd></div><div><dt>Strengths</dt><dd>{feedback.strengths || "Not provided"}</dd></div><div><dt>Difficulties</dt><dd>{feedback.difficulties || "Not provided"}</dd></div><div><dt>Recommended level/action</dt><dd>{feedback.level_suitability || feedback.recommendation || "Not provided"}</dd></div><div><dt>Teacher notes</dt><dd>{feedback.notes || "Not provided"}</dd></div></dl></section>}
        {record.status === "feedback_submitted" && <section className="admin-monitoring-record-section admin-monitoring-decision-panel"><h4>Admin decision</h4><div className="admin-monitoring-decision-fields"><label>Decision<select aria-label={`Decision for ${record.student_name || "student"}`} value={decision[record.id] || ""} onChange={(event) => setDecision((current) => ({ ...current, [record.id]: event.target.value }))} disabled={isSaving}><option value="">Choose outcome</option><option value="kept">Keep level</option><option value="moved_up">Move up</option><option value="moved_down">Move down</option><option value="continued">Continue monitoring</option><option value="closed">Close monitoring</option></select></label><label>Admin notes<textarea rows={3} value={decisionNotes[record.id] || record.admin_notes || ""} onChange={(event) => setDecisionNotes((current) => ({ ...current, [record.id]: event.target.value }))} disabled={isSaving} placeholder="Add notes for the record" /></label>{decision[record.id] === "continued" && <label>New deadline<input type="date" value={decisionDeadlines[record.id] || ""} onChange={(event) => setDecisionDeadlines((current) => ({ ...current, [record.id]: event.target.value }))} disabled={isSaving} required /></label>}<button type="button" onClick={() => void saveDecision(record)} disabled={!decision[record.id] || isSaving}>{isSaving ? "Saving…" : "Save outcome"}</button></div></section>}
      </article>;
    })}</div>}</section>
  </div></AdminLayout>;
}
