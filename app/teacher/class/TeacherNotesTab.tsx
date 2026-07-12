"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../../lib/supabase";

export default function TeacherNotesTab({
  classId,
  students,
}: {
  classId: string;
  students: any[];
}) {
  const [studentId, setStudentId] = useState("");
  const [note, setNote] = useState("");
  const [notes, setNotes] = useState<any[]>([]);

  async function loadNotes() {
    const { data, error } = await supabase
      .from("teacher_notes")
      .select("*")
      .eq("class_id", classId)
      .order("created_at", {
        ascending: false,
      });

    if (error) {
      console.error(error);
      return;
    }

    setNotes(data || []);
  }

  async function saveNote() {
    if (!studentId) {
      alert("Select a student");
      return;
    }

    if (!note.trim()) {
      alert("Enter a note");
      return;
    }

    const {
      data: { session },
    } = await supabase.auth.getSession();

    const { error } = await supabase
      .from("teacher_notes")
      .insert([
        {
          class_id: classId,
          student_id: studentId,
          teacher_id: session?.user.id,
          note,
        },
      ]);

    if (error) {
      alert(error.message);
      return;
    }

    alert("Note saved");

    setNote("");

    loadNotes();
  }

  async function deleteNote(id: string) {
  const confirmed = confirm(
    "Delete this note?"
  );

  if (!confirmed) return;

  const { error } = await supabase
    .from("teacher_notes")
    .delete()
    .eq("id", id);

  if (error) {
    alert(error.message);
    return;
  }

  loadNotes();
}


  useEffect(() => {
    if (classId) {
      loadNotes();
    }
  }, [classId]);

  return (
    <div>
      <h3>Teacher Notes</h3>

      <select
        value={studentId}
        onChange={(e) =>
          setStudentId(e.target.value)
        }
      >
        <option value="">
          Select Student
        </option>

        {students.map((student) => (
          <option
            key={student.id}
            value={student.id}
          >
            {student.first_name}{" "}
            {student.last_name}
          </option>
        ))}
      </select>

      <br />
      <br />

      <textarea
        rows={5}
        value={note}
        onChange={(e) =>
          setNote(e.target.value)
        }
        placeholder="Teacher note..."
        style={{
          width: "100%",
          maxWidth: "600px",
          padding: "12px",
          border: "1px solid #ccc",
          borderRadius: "8px",
          color: "#333",
          background: "#fff",
        }}
      />

      <br />
      <br />

      <button onClick={saveNote}>
        Save Note
      </button>

      <hr />

      <h3>Existing Notes</h3>

      {notes.length === 0 ? (
        <p>No notes yet</p>
      ) : (
        notes.map((item) => (
          <div
            key={item.id}
            style={{
              border: "1px solid #ccc",
              padding: "15px",
              marginBottom: "15px",
            }}
          >
            <strong>
              {
                students.find(
                  (s) =>
                    s.id === item.student_id
                )?.first_name
              }{" "}
              {
                students.find(
                  (s) =>
                    s.id === item.student_id
                )?.last_name
              }
            </strong>

            <br />
            <br />

            {item.note}

            <br />
            <br />

            <small>
  {new Date(
    item.created_at
  ).toLocaleDateString()}
</small>

<br />
<br />

<button
  onClick={() => deleteNote(item.id)}
>
  Delete
</button>

</div>
        ))
      )}
    </div>
  );
}