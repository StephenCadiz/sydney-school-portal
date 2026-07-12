"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../../lib/supabase";

export default function MockExamsTab({
  classId,
  students,
}: {
  classId: string;
  students: any[];
}) {
  const [studentId, setStudentId] = useState("");
  const [mockNumber, setMockNumber] = useState("1");

  const [reading, setReading] = useState("");
  const [writing, setWriting] = useState("");
  const [listening, setListening] = useState("");
  const [speaking, setSpeaking] = useState("");
  const [comments, setComments] = useState("");

  const [mockResults, setMockResults] = useState<any[]>([]);
  const [editingId, setEditingId] = useState("");

  async function loadMockResults() {
    const { data, error } = await supabase
      .from("results")
      .select("*")
      .eq("class_id", classId)
      .eq("result_type", "mock");

    if (error) {
      console.error(error);
      return;
    }

    setMockResults(data || []);
  }

  async function deleteResult(id: string) {
    const confirmed = confirm(
      "Delete this mock exam?"
    );

    if (!confirmed) return;

    const { error } = await supabase
      .from("results")
      .delete()
      .eq("id", id);

    if (error) {
      alert(error.message);
      return;
    }

    loadMockResults();
  }

  useEffect(() => {
    if (classId) {
      loadMockResults();
    }
  }, [classId]);

  function getStudentName(studentId: string) {
    const student = students.find(
      (s) => s.id === studentId
    );

    if (!student) return "Unknown Student";

    return `${student.first_name} ${student.last_name}`;
  }

  function calculateAverageFromScores(
    readingScore: string | number,
    writingScore: string | number,
    listeningScore: string | number,
    speakingScore: string | number
  ) {
    return (
      Number(readingScore) +
      Number(writingScore) +
      Number(listeningScore) +
      Number(speakingScore)
    ) / 4;
  }

  function calculateAverage() {
    return calculateAverageFromScores(
      reading,
      writing,
      listening,
      speaking
    );
  }

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
      return calculateAverageFromScores(
        result.reading,
        result.writing,
        result.listening,
        result.speaking
      );
    }

    return result.overall;
  }

  async function deleteMock(id: string) {
  const confirmed = confirm(
    "Delete this mock exam?"
  );

  if (!confirmed) return;

  const { error } = await supabase
    .from("results")
    .delete()
    .eq("id", id);

  if (error) {
    alert(error.message);
    return;
  }

  loadMockResults();
}

function editMock(result: any) {
  setEditingId(result.id);

  setStudentId(result.student_id);

  setMockNumber(
    String(result.mock_number || 1)
  );

  setReading(String(result.reading || ""));
  setWriting(String(result.writing || ""));
  setListening(String(result.listening || ""));
  setSpeaking(String(result.speaking || ""));

  setComments(result.comments || "");
}

async function updateMockExam() {
  const average = calculateAverage();

  const { error } = await supabase
    .from("results")
    .update({
      student_id: studentId,
      mock_number: Number(mockNumber),
      reading: Number(reading),
      writing: Number(writing),
      listening: Number(listening),
      speaking: Number(speaking),
      overall: average,
      comments,
    })
    .eq("id", editingId);

  if (error) {
    alert(error.message);
    return;
  }

  alert("Mock Updated");

  setEditingId("");
  setStudentId("");
  setReading("");
  setWriting("");
  setListening("");
  setSpeaking("");
  setComments("");

  loadMockResults();
}
  async function saveMockExam() {
    if (!studentId) {
      alert("Select a student");
      return;
    }

    const {
      data: { session },
    } = await supabase.auth.getSession();

    const average = calculateAverage();

    const { error } = await supabase
      .from("results")
      .insert([
        {
          class_id: classId,
          student_id: studentId,
          teacher_id: session?.user.id,
          result_type: "mock",
          mock_number: Number(mockNumber),
          title: `Mock ${mockNumber}`,
          reading: Number(reading),
          writing: Number(writing),
          listening: Number(listening),
          speaking: Number(speaking),
          overall: average,
          comments,
        },
      ]);

    if (error) {
      alert(error.message);
      return;
    }

    alert("Mock Exam Saved");

    setReading("");
    setWriting("");
    setListening("");
    setSpeaking("");
    setComments("");

    loadMockResults();
  }

  return (
    <div>
      <h3>Mock Exams</h3>

      <div style={{ marginBottom: "20px" }}>
        <label>Mock Number </label>

        <select
          value={mockNumber}
          onChange={(e) =>
            setMockNumber(e.target.value)
          }
        >
          <option value="1">Mock 1</option>
          <option value="2">Mock 2</option>
          <option value="3">Mock 3</option>
        </select>

        <span style={{ marginLeft: "20px" }}>
          Student
        </span>

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
      </div>

      <div>
        <p>Reading</p>
        <input
          type="number"
          value={reading}
          onChange={(e) =>
            setReading(e.target.value)
          }
        />

        <p>Writing</p>
        <input
          type="number"
          value={writing}
          onChange={(e) =>
            setWriting(e.target.value)
          }
        />

        <p>Listening</p>
        <input
          type="number"
          value={listening}
          onChange={(e) =>
            setListening(e.target.value)
          }
        />

        <p>Speaking</p>
        <input
          type="number"
          value={speaking}
          onChange={(e) =>
            setSpeaking(e.target.value)
          }
        />

        <p>Comments</p>

        <textarea
          rows={5}
          value={comments}
          onChange={(e) =>
            setComments(e.target.value)
          }
        />

        <br />
        <br />

        {editingId ? (
  <button onClick={updateMockExam}>
    Update Mock Exam
  </button>
) : (
  <button onClick={saveMockExam}>
    Save Mock Exam
  </button>
)}
      </div>

      <hr />

      <h3>Existing Mock Exams</h3>

      {mockResults.length === 0 ? (
        <p>No mock exams yet</p>
      ) : (
        mockResults.map((result) => (
          <div
            key={result.id}
            style={{
              border: "1px solid #ccc",
              padding: "15px",
              marginBottom: "15px",
            }}
          >
            <strong>
              Mock {result.mock_number}
            </strong>

            <br />
            <br />

            {getStudentName(result.student_id)}

            <br />
            <br />

            Reading: {result.reading}
            <br />

            Writing: {result.writing}
            <br />

            Listening: {result.listening}
            <br />

            Speaking: {result.speaking}
            <br />

            Average: {getMockAverage(result)}

            <br />
            <br />

            {result.comments}

            <br />
            <br />

            <button
  onClick={() => editMock(result)}
>
  Edit
</button>

<button
  onClick={() => deleteMock(result.id)}
  style={{ marginLeft: "10px" }}
>
  Delete
</button>
          </div>
        ))
      )}
    </div>
  );
}
