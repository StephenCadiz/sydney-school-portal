"use client";

import { useEffect, useRef, useState } from "react";

import AssignmentHomeworkResultsSection from "./AssignmentHomeworkResultsSection";
import StudentMockResultsSection from "./StudentMockResultsSection";

const cardStyle = {
  background: "#ffffff",
  border: "1px solid #e6eaf2",
  borderRadius: "14px",
  padding: "22px",
  boxShadow: "0 6px 18px rgba(31,60,136,0.06)",
} as const;

const inputStyle = {
  width: "100%",
  padding: "11px 12px",
  border: "1px solid #d9e2ef",
  borderRadius: "9px",
  background: "#ffffff",
  color: "#333333",
  fontSize: "14px",
  boxSizing: "border-box" as const,
};

const labelStyle = {
  color: "#333333",
  fontWeight: 700,
  fontSize: "13px",
  marginBottom: "6px",
  display: "block",
} as const;

type Props = {
  classId: string;
  students: any[];
  levelName?: string;
  courseType?: string;
  classDays?: string;
  teacherId?: string;
  initialStudentId?: string | null;
  initialSection?: "homework" | "mock" | null;
  shortcutRequestKey?: number;
};

export default function ResultsTab({
  classId,
  students,
  levelName = "",
  teacherId = "",
  initialStudentId = null,
  initialSection = null,
  shortcutRequestKey = 0,
}: Props) {
  const [selectedStudentId, setSelectedStudentId] = useState("");
  const [shortcutSection, setShortcutSection] = useState<
    "homework" | "mock" | ""
  >("");
  const homeworkSectionRef = useRef<HTMLDivElement | null>(null);
  const mockSectionRef = useRef<HTMLDivElement | null>(null);
  const selectedStudent = students.find(
    (student) => student.id === selectedStudentId
  );

  useEffect(() => {
    if (!students.some((student) => student.id === selectedStudentId)) {
      setSelectedStudentId("");
    }
  }, [students, selectedStudentId]);

  useEffect(() => {
    const requestedSection =
      initialSection === "homework" || initialSection === "mock"
        ? initialSection
        : "";

    if (
      initialStudentId &&
      students.some((student) => student.id === initialStudentId)
    ) {
      setSelectedStudentId(initialStudentId);
    }
    if (requestedSection) setShortcutSection(requestedSection);
  }, [initialStudentId, initialSection, shortcutRequestKey, students]);

  useEffect(() => {
    if (!shortcutSection) return;

    const scrollTimer = window.setTimeout(() => {
      const target =
        shortcutSection === "mock"
          ? mockSectionRef.current
          : homeworkSectionRef.current;
      target?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 80);
    const highlightTimer = window.setTimeout(
      () => setShortcutSection(""),
      2400
    );

    return () => {
      window.clearTimeout(scrollTimer);
      window.clearTimeout(highlightTimer);
    };
  }, [shortcutSection, selectedStudentId, shortcutRequestKey]);

  const studentName = selectedStudent
    ? `${selectedStudent.first_name || ""} ${
        selectedStudent.last_name || ""
      }`.trim()
    : "";

  return (
    <div style={{ display: "grid", gap: "22px" }}>
      <section style={cardStyle}>
        <h2
          style={{
            color: "#1f3c88",
            margin: "0 0 6px",
            fontSize: "24px",
          }}
        >
          Results
        </h2>
        <p style={{ color: "#667085", margin: "0 0 18px" }}>
          Select a student to grade assigned homework and manage Mock Exam
          results.
        </p>

        {students.length === 0 ? (
          <p style={{ color: "#333333", margin: 0 }}>
            No students found in this class.
          </p>
        ) : (
          <div style={{ maxWidth: "420px" }}>
            <label style={labelStyle}>Student</label>
            <select
              value={selectedStudentId}
              onChange={(event) => setSelectedStudentId(event.target.value)}
              style={inputStyle}
            >
              <option value="">Select student</option>
              {students.map((student) => (
                <option key={student.id} value={student.id}>
                  {student.first_name} {student.last_name}
                </option>
              ))}
            </select>
          </div>
        )}
      </section>

      {!selectedStudent && students.length > 0 && (
        <section style={cardStyle}>
          <p style={{ color: "#667085", margin: 0 }}>
            Choose a student to open their results workspace.
          </p>
        </section>
      )}

      {selectedStudent && (
        <>
          <section style={{ ...cardStyle, background: "#f8fafd" }}>
            <p
              style={{
                color: "#667085",
                margin: "0 0 5px",
                fontWeight: 700,
                fontSize: "13px",
              }}
            >
              Selected Student
            </p>
            <h3
              style={{
                color: "#1f3c88",
                margin: 0,
                fontSize: "22px",
              }}
            >
              {studentName}
            </h3>
          </section>

          <div
            ref={homeworkSectionRef}
            className={
              shortcutSection === "homework"
                ? "teacher-shortcut-focus"
                : undefined
            }
          >
            <AssignmentHomeworkResultsSection
              classId={classId}
              studentId={selectedStudent.id}
              studentName={studentName}
            />
          </div>

          <div
            ref={mockSectionRef}
            className={
              shortcutSection === "mock" ? "teacher-shortcut-focus" : undefined
            }
            style={cardStyle}
          >
            <StudentMockResultsSection
              classId={classId}
              studentId={selectedStudent.id}
              studentName={studentName}
              levelName={levelName}
              teacherId={teacherId}
            />
          </div>
        </>
      )}
    </div>
  );
}
