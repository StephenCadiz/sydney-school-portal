"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import TeacherLayout from "../../../../components/layout/TeacherLayout";
import StudentFollowUpPanelSection from "../../StudentFollowUpPanelSection";
import { supabase } from "../../../../../lib/supabase";

type WorkspaceTab = "information" | "notes" | "unit-results" | "follow-up" | "progress";

const tabs: Array<{ id: WorkspaceTab; label: string }> = [
  { id: "information", label: "Student Information" },
  { id: "notes", label: "Notes" },
  { id: "unit-results", label: "Unit Exam Results" },
  { id: "follow-up", label: "Follow Up" },
  { id: "progress", label: "Progress" },
];

function formatDateTime(value?: string | null) {
  if (!value) return "";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Madrid",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatTime(value?: string | null) {
  return value ? value.slice(0, 5) : "";
}

function fullName(student: any) {
  return `${student?.first_name || ""} ${student?.last_name || ""}`.trim() || "Young Learner";
}

function scoreItems(result: any) {
  return [
    ["Reading/Writing", result.reading_writing],
    ["Reading", result.reading],
    ["Writing", result.writing],
    ["Listening", result.listening],
    ["Speaking", result.speaking],
  ].filter(([, value]) => value !== null && value !== undefined);
}

export default function YoungLearnerStudentWorkspacePage() {
  const params = useParams<{ studentId: string }>();
  const searchParams = useSearchParams();
  const studentId = String(params.studentId || "");
  const classId = String(searchParams.get("classId") || "");
  const [activeTab, setActiveTab] = useState<WorkspaceTab>("information");
  const [workspace, setWorkspace] = useState<any>(null);
  const [teacherId, setTeacherId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [noteText, setNoteText] = useState("");
  const [editingNoteId, setEditingNoteId] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const [noteMessage, setNoteMessage] = useState("");
  const [noteError, setNoteError] = useState("");

  const getToken = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session?.access_token) throw new Error("Your session has expired.");
    setTeacherId(data.session.user.id);
    return data.session.access_token;
  }, []);

  const endpoint = `/api/teacher/young-learners/${encodeURIComponent(
    studentId
  )}/workspace?classId=${encodeURIComponent(classId)}`;

  const loadWorkspace = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const token = await getToken();
      const response = await fetch(endpoint, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Unable to load the Young Learner workspace.");
      setWorkspace(payload);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to load the Young Learner workspace.");
    } finally {
      setLoading(false);
    }
  }, [endpoint, getToken]);

  useEffect(() => {
    void loadWorkspace();
  }, [loadWorkspace]);

  const studentName = fullName(workspace?.student);
  const schedule = [
    workspace?.class?.days,
    [formatTime(workspace?.class?.start_time), formatTime(workspace?.class?.end_time)]
      .filter(Boolean)
      .join("–"),
  ]
    .filter(Boolean)
    .join(" · ");

  const editingNote = useMemo(
    () => workspace?.notes?.find((note: any) => note.id === editingNoteId) || null,
    [editingNoteId, workspace?.notes]
  );

  async function saveNote() {
    setNoteMessage("");
    setNoteError("");
    if (!noteText.trim()) {
      setNoteError("Enter a note.");
      return;
    }
    setSavingNote(true);
    try {
      const token = await getToken();
      const response = await fetch(endpoint, {
        method: editingNote ? "PATCH" : "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ note_id: editingNote?.id, note: noteText.trim() }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Unable to save the note.");
      setNoteText("");
      setEditingNoteId("");
      setNoteMessage(editingNote ? "Note updated." : "Note saved.");
      await loadWorkspace();
    } catch (caught) {
      setNoteError(caught instanceof Error ? caught.message : "Unable to save the note.");
    } finally {
      setSavingNote(false);
    }
  }

  async function deleteNote(noteId: string) {
    if (!confirm("Delete this note?")) return;
    setNoteMessage("");
    setNoteError("");
    try {
      const token = await getToken();
      const response = await fetch(`${endpoint}&noteId=${encodeURIComponent(noteId)}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Unable to delete the note.");
      setNoteMessage("Note deleted.");
      await loadWorkspace();
    } catch (caught) {
      setNoteError(caught instanceof Error ? caught.message : "Unable to delete the note.");
    }
  }

  if (loading) {
    return <TeacherLayout><main className="young-learner-workspace-state">Loading Young Learner workspace...</main></TeacherLayout>;
  }

  if (error || !workspace) {
    return (
      <TeacherLayout>
        <main className="young-learner-workspace-state is-error">
          <h1>Young Learner Workspace</h1>
          <p>{error || "Workspace not found."}</p>
          <Link href={`/teacher/class?id=${encodeURIComponent(classId)}`}>Back to Class</Link>
        </main>
      </TeacherLayout>
    );
  }

  return (
    <TeacherLayout>
      <main className="young-learner-workspace-page">
        <Link className="young-learner-workspace-back" href={`/teacher/class?id=${encodeURIComponent(classId)}&tab=students`}>
          ← Back to {workspace.class.name}
        </Link>

        <header className="young-learner-workspace-header student-workspace-header">
          <div className="student-workspace-title">
            <p className="student-workspace-eyebrow">Young Learner Student Workspace</p>
            <h1>{studentName}</h1>
            <p>{workspace.class.level} · {workspace.class.name}</p>
          </div>
          <div className="young-learner-workspace-header-details">
            <span>{workspace.class.teacher}</span>
            {schedule && <span>{schedule}</span>}
            {workspace.class.classroom && <span>{workspace.class.classroom}</span>}
          </div>
        </header>

        <nav className="student-workspace-nav young-learner-workspace-tabs" aria-label="Young Learner workspace sections" role="tablist">
          {tabs.map((tab) => (
            <button key={tab.id} type="button" role="tab" aria-selected={activeTab === tab.id}
              className={`student-workspace-nav-button ${activeTab === tab.id ? "is-active" : ""}`}
              onClick={() => setActiveTab(tab.id)}>
              {tab.label}
            </button>
          ))}
        </nav>

        <section className="young-learner-workspace-content" role="tabpanel">
          {activeTab === "information" && (
            <section className="student-workspace-section">
              <div className="student-workspace-section-header"><h3>Student Information</h3><p>Current class information for {studentName}.</p></div>
              <div className="young-learner-information-grid">
                {[
                  ["Full name", studentName], ["Level", workspace.class.level], ["Class", workspace.class.name],
                  ["Teacher", workspace.class.teacher], ["Class schedule", schedule || "Not recorded"],
                  ["Classroom", workspace.class.classroom || "Not recorded"],
                  ["Academic year", workspace.class.academic_year || "Not recorded"],
                  ["Status", workspace.student.active ? "Active" : "Inactive"],
                ].map(([label, value]) => <article key={label}><span>{label}</span><strong>{value}</strong></article>)}
              </div>
            </section>
          )}

          {activeTab === "notes" && (
            <section className="student-workspace-section">
              <div className="student-workspace-section-header"><h3>Notes</h3><p>Internal observations visible only to authorized staff.</p></div>
              {noteMessage && <div className="student-workspace-success" role="status">{noteMessage}</div>}
              {noteError && <div className="student-workspace-error" role="alert">{noteError}</div>}
              <div className="student-workspace-form-card">
                <label className="student-workspace-field"><span>{editingNote ? "Edit note" : "New note"}</span>
                  <textarea rows={5} maxLength={4000} value={noteText} onChange={(event) => setNoteText(event.target.value)} /></label>
                <div className="student-workspace-actions">
                  <button className="student-workspace-primary-button" type="button" disabled={savingNote} onClick={saveNote}>{savingNote ? "Saving..." : editingNote ? "Update Note" : "Add Note"}</button>
                  {editingNote && <button className="student-workspace-secondary-button" type="button" onClick={() => { setEditingNoteId(""); setNoteText(""); }}>Cancel</button>}
                </div>
              </div>
              <div className="student-workspace-list">
                {workspace.notes.length === 0 ? <p className="student-workspace-muted">No notes yet.</p> : workspace.notes.map((note: any) => (
                  <article className="student-workspace-item" key={note.id}>
                    <div className="student-workspace-item-header"><div><strong>{note.created_by_name}</strong><span>{formatDateTime(note.created_at)}{note.updated_at !== note.created_at ? ` · Updated ${formatDateTime(note.updated_at)}` : ""}</span></div>
                    {note.can_edit && <div className="student-workspace-actions is-compact"><button className="student-workspace-secondary-button" type="button" onClick={() => { setEditingNoteId(note.id); setNoteText(note.note); }}>Edit</button><button className="student-workspace-danger-button" type="button" onClick={() => void deleteNote(note.id)}>Delete</button></div>}</div>
                    <p>{note.note}</p>
                  </article>
                ))}
              </div>
            </section>
          )}

          {activeTab === "unit-results" && (
            <section className="student-workspace-section">
              <div className="student-workspace-section-header"><h3>Unit Exam Results</h3><p>Existing Unit Exam records, newest unit first.</p></div>
              <div className="student-workspace-list">
                {workspace.unit_exam_results.length === 0 ? <p className="student-workspace-muted">No Unit Exam results are available.</p> : workspace.unit_exam_results.map((result: any) => (
                  <article className="student-workspace-item" key={result.id}>
                    <div className="student-workspace-item-header"><div><strong>Unit Exam {result.unit_exam_number}</strong><span>{formatDateTime(result.created_at)}</span></div><span className={`student-workspace-badge ${result.completed ? "is-published" : "is-draft"}`}>{result.completed ? "Completed" : "Pending"}</span></div>
                    <div className="student-workspace-score-grid">{scoreItems(result).map(([label, value]) => <div key={String(label)}><span>{label}</span><strong>{String(value)}</strong></div>)}{result.percentage !== null && <div><span>Average</span><strong>{result.percentage}%</strong></div>}</div>
                    {result.comments && <p>{result.comments}</p>}
                  </article>
                ))}
              </div>
            </section>
          )}

          {activeTab === "follow-up" && <StudentFollowUpPanelSection classId={classId} teacherId={teacherId} studentId={studentId} studentName={studentName} studentType="young_learner" />}

          {activeTab === "progress" && (
            <section className="student-workspace-section">
              <div className="student-workspace-section-header"><h3>Progress</h3><p>A concise overview based on current Young Learner records.</p></div>
              <div className="student-workspace-stat-grid">
                <div><span>Unit Exam average</span><strong>{workspace.progress.unit_exam_average === null ? "—" : `${workspace.progress.unit_exam_average}%`}</strong></div>
                <div><span>Completed Unit Exams</span><strong>{workspace.progress.completed_unit_exams}</strong></div>
                <div><span>Pending Unit Exams</span><strong>{workspace.progress.pending_unit_exams}</strong></div>
                <div><span>Internal notes</span><strong>{workspace.progress.note_count}</strong></div>
              </div>
              <article className="student-workspace-item"><div className="student-workspace-item-header"><strong>Latest Follow Up</strong><span>{workspace.progress.latest_follow_up_status || "No follow-up recorded"}</span></div></article>
              <div className="student-workspace-context-note">Class progress records will appear here once lesson progress tracking is available.</div>
            </section>
          )}
        </section>
      </main>
    </TeacherLayout>
  );
}
