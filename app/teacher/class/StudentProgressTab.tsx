"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../../lib/supabase";

export default function StudentProgressTab({
  classId,
  students,
  initialStudentId = null,
  shortcutRequestKey = 0,
}: {
  classId: string;
  students: any[];
  initialStudentId?: string | null;
  shortcutRequestKey?: number;
}) {
  const [studentId, setStudentId] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [notes, setNotes] = useState<any[]>([]);

  function getMockAverage(result: any) {
    const hasAllScores =
      result.reading !== null &&
      result.reading !== undefined &&
      result.writing !== null &&
      result.writing !== undefined &&
      result.listening !== null &&
      result.listening !== undefined &&
      result.speaking !== null &&
      result.speaking !== undefined;

    if (hasAllScores) {
      return (
        Number(result.reading) +
        Number(result.writing) +
        Number(result.listening) +
        Number(result.speaking)
      ) / 4;
    }

    return result.overall;
  }

  async function loadProgress(selectedId: string) {
    console.log("Student ID:", selectedId);
    if (!selectedId) {
      setResults([]);
      setNotes([]);
      return;
    }

    const { data: resultsData } = await supabase
  .from("results")
  .select("*")
  .eq("student_id", selectedId);

console.log("Results:", resultsData);

setResults(resultsData || []);

    const { data: notesData } = await supabase
  .from("teacher_notes")
  .select("*")
  .eq("student_id", selectedId);

console.log("Notes:", notesData);

setNotes(notesData || []);
  }

  useEffect(() => {
    if (
      !initialStudentId ||
      !students.some((student) => student.id === initialStudentId)
    ) {
      return;
    }

    setStudentId(initialStudentId);
    loadProgress(initialStudentId);
  }, [initialStudentId, shortcutRequestKey, students]);

  return (
    <div>
      <h3>Student Progress History</h3>

      <select
        value={studentId}
        onChange={(e) => {
          setStudentId(e.target.value);
          loadProgress(e.target.value);
        }}
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

      <hr />

      <h3>Results</h3>

      {results.length === 0 ? (
        <p>No results found</p>
      ) : (
        results.map((result) => (
          <div
            key={result.id}
            style={{
              border: "1px solid #ccc",
              padding: "10px",
              marginBottom: "10px",
            }}
          >
            <strong>{result.title}</strong>

            <br />

            {result.result_type}

            <br />

            {result.percentage && (
              <>
                Score: {result.percentage}%
                <br />
              </>
            )}

            {result.result_type === "mock" ? (
              getMockAverage(result) !== null &&
              getMockAverage(result) !== undefined && (
                <>
                  Average: {getMockAverage(result)}
                  <br />
                </>
              )
            ) : (
              result.overall && (
                <>
                  Overall: {result.overall}
                  <br />
                </>
              )
            )}
          </div>
        ))
      )}

      <hr />

      <h3>Teacher Notes</h3>

      {notes.length === 0 ? (
        <p>No notes found</p>
      ) : (
        notes.map((note) => (
          <div
            key={note.id}
            style={{
              border: "1px solid #ccc",
              padding: "10px",
              marginBottom: "10px",
            }}
          >
            {note.note}

            <br />
            <br />

            <small>
              {new Date(
                note.created_at
              ).toLocaleDateString()}
            </small>
          </div>
        ))
      )}
    </div>
  );
}
