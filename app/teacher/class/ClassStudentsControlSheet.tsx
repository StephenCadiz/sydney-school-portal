"use client";

import { useMemo, useState } from "react";

export type ClassStudentShortcutAction =
  | "notes"
  | "homework"
  | "friday-tutorial"
  | "mock-exams"
  | "progress"
  | "follow-up"
  | "message"
  | "class-exams"
  | "unit-exams";

export type ClassStudentControlStudent = {
  id: string;
  first_name?: string | null;
  last_name?: string | null;
  student_type: "cambridge" | "young_learner";
  active?: boolean | null;
};

type ToolbarAction = {
  action: ClassStudentShortcutAction;
  label: string;
  title: string;
};

type Props = {
  students: ClassStudentControlStudent[];
  isCambridgeClass: boolean;
  isSupportClass: boolean;
  showClassExams: boolean;
  showUnitExamResults: boolean;
  showFridayTutorialResults: boolean;
  onShortcut: (
    action: ClassStudentShortcutAction,
    student?: ClassStudentControlStudent
  ) => void;
};

function getStudentName(student: ClassStudentControlStudent) {
  return `${student.first_name || ""} ${student.last_name || ""}`.trim() ||
    "Unnamed student";
}

function compareStudents(
  first: ClassStudentControlStudent,
  second: ClassStudentControlStudent
) {
  const lastNameComparison = String(first.last_name || "").localeCompare(
    String(second.last_name || ""),
    undefined,
    { sensitivity: "base" }
  );

  if (lastNameComparison !== 0) {
    return lastNameComparison;
  }

  const firstNameComparison = String(first.first_name || "").localeCompare(
    String(second.first_name || ""),
    undefined,
    { sensitivity: "base" }
  );

  if (firstNameComparison !== 0) {
    return firstNameComparison;
  }

  return String(first.id || "").localeCompare(String(second.id || ""));
}

function getToolbarActions({
  isCambridgeClass,
  isSupportClass,
  showClassExams,
  showUnitExamResults,
  showFridayTutorialResults,
}: {
  isCambridgeClass: boolean;
  isSupportClass: boolean;
  showClassExams: boolean;
  showUnitExamResults: boolean;
  showFridayTutorialResults: boolean;
}): ToolbarAction[] {
  if (isCambridgeClass) {
    return [
      {
        action: "homework",
        label: "Homework Results",
        title: "Open homework result entry",
      },
      ...(showFridayTutorialResults
        ? [
            {
              action: "friday-tutorial" as const,
              label: "Friday Tutorial Sheet",
              title: "Open the Friday Tutorial class sheet",
            },
          ]
        : []),
      {
        action: "mock-exams",
        label: "Mock Exam Results",
        title: "Open mock exam result entry",
      },
    ];
  }

  if (isSupportClass) {
    return [];
  }

  return [
    ...(showClassExams
      ? [
          {
            action: "class-exams" as const,
            label: "Class Exams",
            title: "Open class exam files",
          },
        ]
      : []),
    ...(showUnitExamResults
      ? [
          {
            action: "unit-exams" as const,
            label: "Unit Exam Results",
            title: "Open Unit Exam result entry",
          },
        ]
      : []),
  ];
}

export default function ClassStudentsControlSheet({
  students,
  isCambridgeClass,
  isSupportClass,
  showClassExams,
  showUnitExamResults,
  showFridayTutorialResults,
  onShortcut,
}: Props) {
  const [searchQuery, setSearchQuery] = useState("");
  const visibleStudents = useMemo(
    () => students
      .filter((student) => student.active !== false)
      .sort(compareStudents),
    [students]
  );
  const filteredStudents = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLocaleLowerCase();
    if (!normalizedQuery) return visibleStudents;

    return visibleStudents.filter((student) =>
      getStudentName(student).toLocaleLowerCase().includes(normalizedQuery)
    );
  }, [searchQuery, visibleStudents]);
  const toolbarActions = getToolbarActions({
    isCambridgeClass,
    isSupportClass,
    showClassExams,
    showUnitExamResults,
    showFridayTutorialResults,
  });

  return (
    <div className="teacher-class-students-sheet">
      <header className="teacher-class-students-header">
        <div className="teacher-class-students-heading">
          <h3>Class Students</h3>
          <span>{visibleStudents.length} {visibleStudents.length === 1 ? "student" : "students"}</span>
          <p>Manage individual student records and progress.</p>
        </div>

        {toolbarActions.length > 0 && (
          <div className="teacher-class-students-actions">
            <span>Class actions</span>
            <div className="teacher-class-students-toolbar" aria-label="Class actions">
              {toolbarActions.map((item) => (
                <button
                  key={item.action}
                  type="button"
                  className="teacher-class-students-toolbar-button"
                  onClick={() => onShortcut(item.action)}
                  title={item.title}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </header>

      {visibleStudents.length === 0 ? (
        <div className="teacher-class-students-empty">
          No students have been added to this class yet.
        </div>
      ) : (
        <>
          <div className="teacher-class-students-search">
            <label htmlFor="teacher-class-student-search">Search students</label>
            <input
              id="teacher-class-student-search"
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search students..."
              autoComplete="off"
            />
          </div>

          {filteredStudents.length === 0 ? (
            <div className="teacher-class-students-empty">No students found.</div>
          ) : (
            <div className="teacher-class-students-list">
              {filteredStudents.map((student) => {
                const studentName = getStudentName(student);

                return (
                  <button
                    type="button"
                    className="teacher-class-student-row"
                    key={`${student.student_type}-${student.id}`}
                    onClick={() => onShortcut(
                      student.student_type === "cambridge" ? "notes" : "follow-up",
                      student
                    )}
                    aria-label={`Open ${studentName}`}
                  >
                    <strong>{studentName}</strong>
                    <span aria-hidden="true">›</span>
                  </button>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
