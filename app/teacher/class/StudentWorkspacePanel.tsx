"use client";

import { useEffect, useRef, useState } from "react";

import AssignmentHomeworkResultsSection from "./AssignmentHomeworkResultsSection";
import StudentFollowUpPanelSection from "./StudentFollowUpPanelSection";
import StudentFridayTutorialSection from "./StudentFridayTutorialSection";
import StudentMessagePanelSection from "./StudentMessagePanelSection";
import StudentMockResultsSection from "./StudentMockResultsSection";
import StudentNotesPanelSection from "./StudentNotesPanelSection";
import StudentProgressPanelSection from "./StudentProgressPanelSection";
import TeacherStudentAttendanceSection from "./TeacherStudentAttendanceSection";

export type StudentWorkspaceSection =
  | "notes"
  | "homework"
  | "friday-tutorial"
  | "mocks"
  | "progress"
  | "attendance"
  | "follow-up"
  | "message";

type StudentWorkspacePanelProps = {
  open: boolean;
  classId: string;
  classLevel: string;
  courseType: string;
  classDays: string;
  teacherId: string;
  studentId: string | null;
  studentName: string;
  studentType: "cambridge" | "young_learner" | null;
  initialSection: StudentWorkspaceSection;
  requestKey: number;
  showFridayTutorial: boolean;
  showProgress: boolean;
  onClose: () => void;
};

type StudentWorkspaceNavigationItem = {
  id: StudentWorkspaceSection;
  label: string;
};

const sections: StudentWorkspaceNavigationItem[] = [
  { id: "notes", label: "Notes" },
  { id: "homework", label: "Homework" },
  { id: "friday-tutorial", label: "Friday Tutorials" },
  { id: "mocks", label: "Mock Exams" },
  { id: "progress", label: "Progress" },
  { id: "attendance", label: "Attendance" },
  { id: "follow-up", label: "Follow-up" },
  { id: "message", label: "Message" },
];

function getCourseLabel(level: string, courseType: string) {
  const levelLabel = String(level || "").trim();
  const courseLabel = String(courseType || "").trim();

  return [
    levelLabel,
    courseLabel
      ? courseLabel.charAt(0).toUpperCase() + courseLabel.slice(1)
      : "",
  ]
    .filter(Boolean)
    .join(" ");
}

export default function StudentWorkspacePanel({
  open,
  classId,
  classLevel,
  courseType,
  classDays,
  teacherId,
  studentId,
  studentName,
  studentType,
  initialSection,
  requestKey,
  showFridayTutorial,
  showProgress,
  onClose,
}: StudentWorkspacePanelProps) {
  const [activeSection, setActiveSection] =
    useState<StudentWorkspaceSection>(initialSection);
  const panelRef = useRef<HTMLElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!open) return;

    setActiveSection(initialSection);
  }, [open, initialSection, requestKey]);

  useEffect(() => {
    if (!open) return;

    const focusTimer = window.setTimeout(() => {
      closeButtonRef.current?.focus();
    }, 40);

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onClose]);

  if (!open || !studentId || studentType !== "cambridge") {
    return null;
  }

  const titleId = "student-workspace-panel-title";
  const classLabel = getCourseLabel(classLevel, courseType);

  return (
    <div className="student-workspace-overlay" role="presentation">
      <button
        type="button"
        className="student-workspace-backdrop"
        aria-label="Close student workspace"
        onClick={onClose}
      />

      <section
        ref={panelRef}
        className="student-workspace-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <header className="student-workspace-header">
          <div className="student-workspace-title">
            <p className="student-workspace-eyebrow">Student Workspace</p>
            <h2 id={titleId}>{studentName || "Selected student"}</h2>
            <p>{classLabel || "Class workspace"}</p>
          </div>

          <button
            ref={closeButtonRef}
            type="button"
            className="student-workspace-close"
            onClick={onClose}
            aria-label="Close student workspace"
          >
            Close
          </button>
        </header>

        <nav className="student-workspace-nav" aria-label="Student workspace sections">
          {sections
            .filter(
              (section) =>
                (section.id !== "friday-tutorial" || showFridayTutorial) &&
                (section.id !== "progress" || showProgress)
            )
            .map((section) => {
              const active = activeSection === section.id;

              return (
                <button
                  key={section.id}
                  type="button"
                  className={`student-workspace-nav-button ${active ? "is-active" : ""}`}
                  onClick={() => setActiveSection(section.id)}
                  aria-current={active ? "page" : undefined}
                >
                  {section.label}
                </button>
              );
            })}
        </nav>

        <div className="student-workspace-body">
          {activeSection === "notes" && (
            <StudentNotesPanelSection
              classId={classId}
              studentId={studentId}
              studentName={studentName}
            />
          )}

          {activeSection === "homework" && (
            <AssignmentHomeworkResultsSection
              classId={classId}
              studentId={studentId}
              studentName={studentName}
            />
          )}

          {activeSection === "friday-tutorial" && (
            <StudentFridayTutorialSection
              classId={classId}
              studentId={studentId}
              studentName={studentName}
            />
          )}

          {activeSection === "mocks" && (
            <StudentMockResultsSection
              classId={classId}
              studentId={studentId}
              studentName={studentName}
              levelName={classLevel}
              teacherId={teacherId}
            />
          )}

          {activeSection === "progress" && (
            <StudentProgressPanelSection
              classId={classId}
              studentId={studentId}
              onOpenHomework={() => setActiveSection("homework")}
              onOpenFridayTutorial={() => setActiveSection("friday-tutorial")}
              onOpenMocks={() => setActiveSection("mocks")}
              onOpenFollowUp={() => setActiveSection("follow-up")}
            />
          )}

          {activeSection === "attendance" && (
            <TeacherStudentAttendanceSection
              classId={classId}
              studentId={studentId}
              studentType="profile"
            />
          )}

          {activeSection === "follow-up" && (
            <StudentFollowUpPanelSection
              classId={classId}
              teacherId={teacherId}
              studentId={studentId}
              studentName={studentName}
            />
          )}

          {activeSection === "message" && (
            <StudentMessagePanelSection
              teacherId={teacherId}
              studentId={studentId}
              studentName={studentName}
            />
          )}
        </div>
      </section>
    </div>
  );
}
