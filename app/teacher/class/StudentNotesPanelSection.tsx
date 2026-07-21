"use client";

import { useEffect, useState } from "react";

import { supabase } from "../../../lib/supabase";

type StudentNotesPanelSectionProps = {
  classId: string;
  studentId: string;
  studentName: string;
};

function formatDate(value: string | null | undefined) {
  if (!value) return "";

  return new Date(value).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default function StudentNotesPanelSection({
  classId,
  studentId,
  studentName,
}: StudentNotesPanelSectionProps) {
  const [note, setNote] = useState("");
  const [notes, setNotes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  async function loadNotes() {
    if (!classId || !studentId) {
      setNotes([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setErrorMessage("");

    const { data, error } = await supabase
      .from("teacher_notes")
      .select("*")
      .eq("class_id", classId)
      .eq("student_id", studentId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Unable to load student notes:", error);
      setNotes([]);
      setErrorMessage("Unable to load notes.");
      setLoading(false);
      return;
    }

    setNotes(data || []);
    setLoading(false);
  }

  useEffect(() => {
    loadNotes();
  }, [classId, studentId]);

  async function saveNote() {
    setMessage("");
    setErrorMessage("");

    if (!note.trim()) {
      setErrorMessage("Enter a note.");
      return;
    }

    setSaving(true);

    const {
      data: { session },
    } = await supabase.auth.getSession();

    const { error } = await supabase.from("teacher_notes").insert([
      {
        class_id: classId,
        student_id: studentId,
        teacher_id: session?.user.id,
        note: note.trim(),
      },
    ]);

    if (error) {
      console.error("Unable to save student note:", error);
      setErrorMessage("Unable to save note.");
      setSaving(false);
      return;
    }

    setNote("");
    setMessage("Note saved.");
    setSaving(false);
    await loadNotes();
  }

  async function deleteNote(id: string) {
    const confirmed = confirm("Delete this note?");

    if (!confirmed) return;

    setMessage("");
    setErrorMessage("");

    const { error } = await supabase.from("teacher_notes").delete().eq("id", id);

    if (error) {
      console.error("Unable to delete student note:", error);
      setErrorMessage("Unable to delete note.");
      return;
    }

    setMessage("Note deleted.");
    await loadNotes();
  }

  return (
    <section className="student-workspace-section">
      <div className="student-workspace-section-header">
        <h3>Notes</h3>
        <p>Private teacher notes for {studentName}.</p>
      </div>

      {message && (
        <div className="student-workspace-success" role="status">
          {message}
        </div>
      )}

      {errorMessage && (
        <div className="student-workspace-error" role="alert">
          {errorMessage}
        </div>
      )}

      <div className="student-workspace-form-card">
        <label className="student-workspace-field">
          <span>New note</span>
          <textarea
            rows={5}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Teacher note..."
          />
        </label>

        <button
          type="button"
          className="student-workspace-primary-button"
          onClick={saveNote}
          disabled={saving}
        >
          {saving ? "Saving..." : "Save Note"}
        </button>
      </div>

      <div className="student-workspace-list">
        <h4>Existing Notes</h4>

        {loading ? (
          <p className="student-workspace-muted">Loading notes...</p>
        ) : notes.length === 0 ? (
          <p className="student-workspace-muted">No notes yet.</p>
        ) : (
          notes.map((item) => (
            <article className="student-workspace-item" key={item.id}>
              <div className="student-workspace-item-header">
                <strong>{formatDate(item.created_at) || "Saved note"}</strong>
                <button
                  type="button"
                  className="student-workspace-danger-button"
                  onClick={() => deleteNote(item.id)}
                >
                  Delete
                </button>
              </div>
              <p>{item.note}</p>
            </article>
          ))
        )}
      </div>
    </section>
  );
}
