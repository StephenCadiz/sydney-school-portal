"use client";

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

type ActionConfig = {
  action: ClassStudentShortcutAction;
  header: string;
  label: string;
  mobileLabel: string;
  title: (studentName: string) => string;
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

function getActionConfigs({
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
}): ActionConfig[] {
  if (isCambridgeClass) {
    return [
      {
        action: "notes",
        header: "Notes",
        label: "Open",
        mobileLabel: "Notes",
        title: (studentName) => `Open notes for ${studentName}`,
      },
      {
        action: "homework",
        header: "Homework",
        label: "Enter/Edit",
        mobileLabel: "Homework",
        title: (studentName) => `Open homework results for ${studentName}`,
      },
      ...(showFridayTutorialResults
        ? [
            {
              action: "friday-tutorial" as const,
              header: "Friday Tutorial",
              label: "Enter/Edit",
              mobileLabel: "Friday",
              title: (studentName: string) =>
                `Open Friday Tutorial sheet for ${studentName}`,
            },
          ]
        : []),
      {
        action: "mock-exams",
        header: "Mock Exams",
        label: "Enter/Edit",
        mobileLabel: "Mocks",
        title: (studentName) => `Open mock exams for ${studentName}`,
      },
      {
        action: "progress",
        header: "Progress",
        label: "View",
        mobileLabel: "Progress",
        title: (studentName) => `View progress for ${studentName}`,
      },
      {
        action: "follow-up",
        header: "Follow-up",
        label: "Open",
        mobileLabel: "Follow-up",
        title: (studentName) => `Open follow-up for ${studentName}`,
      },
      {
        action: "message",
        header: "Message",
        label: "Message",
        mobileLabel: "Message",
        title: (studentName) => `Message ${studentName}`,
      },
    ];
  }

  if (isSupportClass) {
    return [
      {
        action: "follow-up",
        header: "Follow-up",
        label: "Open",
        mobileLabel: "Follow-up",
        title: (studentName) => `Open follow-up for ${studentName}`,
      },
    ];
  }

  return [
    ...(showClassExams
      ? [
          {
            action: "class-exams" as const,
            header: "Class Exams",
            label: "Open",
            mobileLabel: "Class Exams",
            title: (studentName: string) =>
              `Open class exams for ${studentName}`,
          },
        ]
      : []),
    ...(showUnitExamResults
      ? [
          {
            action: "unit-exams" as const,
            header: "Unit Exams",
            label: "Enter/Edit",
            mobileLabel: "Unit Exams",
            title: (studentName: string) =>
              `Open unit exams for ${studentName}`,
          },
        ]
      : []),
    {
      action: "follow-up",
      header: "Follow-up",
      label: "Open",
      mobileLabel: "Follow-up",
      title: (studentName) => `Open follow-up for ${studentName}`,
    },
  ];
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
  const visibleStudents = students
    .filter((student) => student.active !== false)
    .sort(compareStudents);
  const actionConfigs = getActionConfigs({
    isCambridgeClass,
    isSupportClass,
    showClassExams,
    showUnitExamResults,
    showFridayTutorialResults,
  });
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
        <div>
          <h3>Class Students</h3>
          <p>Open student workspaces without leaving this class.</p>
        </div>

        {toolbarActions.length > 0 && (
          <div
            className="teacher-class-students-toolbar"
            aria-label="Class workflows"
          >
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
        )}
      </header>

      {visibleStudents.length === 0 ? (
        <div className="teacher-class-students-empty">
          No students have been added to this class yet.
        </div>
      ) : (
        <>
          <div className="teacher-class-students-table-wrap">
            <table className="teacher-class-students-table">
              <thead>
                <tr>
                  <th>Student</th>
                  {actionConfigs.map((item) => (
                    <th key={item.action}>{item.header}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visibleStudents.map((student) => {
                  const studentName = getStudentName(student);

                  return (
                    <tr key={`${student.student_type}-${student.id}`}>
                      <td>
                        <strong>{studentName}</strong>
                      </td>
                      {actionConfigs.map((item) => (
                        <td key={item.action}>
                          <button
                            type="button"
                            className="teacher-student-control-button"
                            onClick={() => onShortcut(item.action, student)}
                            aria-label={item.title(studentName)}
                            title={item.title(studentName)}
                          >
                            {item.label}
                          </button>
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="teacher-class-students-mobile-list">
            {visibleStudents.map((student) => {
              const studentName = getStudentName(student);

              return (
                <article
                  className="teacher-class-students-mobile-card"
                  key={`${student.student_type}-${student.id}`}
                >
                  <h4>{studentName}</h4>
                  <div className="teacher-class-students-mobile-actions">
                    {actionConfigs.map((item) => (
                      <button
                        key={item.action}
                        type="button"
                        className="teacher-student-control-button"
                        onClick={() => onShortcut(item.action, student)}
                        aria-label={item.title(studentName)}
                        title={item.title(studentName)}
                      >
                        {item.mobileLabel}
                      </button>
                    ))}
                  </div>
                </article>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
