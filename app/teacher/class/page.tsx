"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "../../../lib/supabase";
import TeacherLayout from "../../components/layout/TeacherLayout";
import ResultsTab from "./ResultsTab";
import TeacherNotesTab from "./TeacherNotesTab";
import StudentProgressTab from "./StudentProgressTab";
import FollowUpsTab from "./FollowUpsTab";
import ClassMessagesTab from "./ClassMessagesTab";
import ClassExamsTab from "./ClassExamsTab";
import FridayTutorialResultsTab from "./FridayTutorialResultsTab";
import UnitExamResultsTab from "./UnitExamResultsTab";
import SharedResourcesTab from "./SharedResourcesTab";
import OfficialResourcesTab from "./OfficialResourcesTab";
import ClassStudentsControlSheet, {
  type ClassStudentControlStudent,
  type ClassStudentShortcutAction,
} from "./ClassStudentsControlSheet";
import StudentWorkspacePanel, {
  type StudentWorkspaceSection,
} from "./StudentWorkspacePanel";
import ClassHeader from "../../components/class/ClassHeader";
import TeacherHomework from "../../components/teacher/TeacherHomework";
import { isClassExamLevel } from "../../../lib/classExams";
import { isFridayTutorialCambridgeLevel } from "../../../lib/fridayTutorialResults";
import { isUnitExamLevel } from "../../../lib/unitExamResults";

const tabs = [
  { id: "students", label: "Students" },
  { id: "resources", label: "Resources" },
  { id: "shared-resources", label: "Shared Resources" },
  { id: "official-resources", label: "Official Resources" },
  { id: "homework", label: "Homework" },
  { id: "class-exams", label: "Class Exams" },
  { id: "unit-exam-results", label: "Unit Exam Results" },
  { id: "announcements", label: "Announcements" },
  { id: "results", label: "Results" },
  { id: "friday-tutorial-results", label: "Friday Tutorial Results" },
  { id: "notes", label: "Teacher Notes" },
  { id: "messages", label: "Messages" },
  { id: "follow-up", label: "Follow Up" },
  { id: "progress", label: "Student Progress" },
];

type ShortcutRequest = {
  key: number;
  targetTab: string;
  studentId: string | null;
  studentType: ClassStudentControlStudent["student_type"] | null;
  resultSection: "homework" | "mock" | null;
};

type StudentWorkspacePanelState = {
  open: boolean;
  studentId: string | null;
  studentName: string;
  studentType: ClassStudentControlStudent["student_type"] | null;
  section: StudentWorkspaceSection;
  requestKey: number;
};

function normalizeLevelName(levelName: string | null | undefined) {
  return String(levelName || "").trim().toUpperCase();
}

function getStudentName(student: {
  first_name?: string | null;
  last_name?: string | null;
}) {
  return `${student.first_name || ""} ${student.last_name || ""}`.trim() ||
    "Unnamed student";
}

function getPanelSectionForAction(
  action: ClassStudentShortcutAction
): StudentWorkspaceSection | null {
  if (action === "notes") return "notes";
  if (action === "homework") return "homework";
  if (action === "mock-exams") return "mocks";
  if (action === "follow-up") return "follow-up";
  if (action === "message") return "message";

  return null;
}

function ClassPageContent() {
  const searchParams = useSearchParams();

  const [classData, setClassData] = useState<any>(null);
  const [levelName, setLevelName] = useState("");
  const [teacherId, setTeacherId] = useState("");
  const [students, setStudents] = useState<any[]>([]);
  const [youngLearners, setYoungLearners] = useState<any[]>([]);
  const [resources, setResources] = useState<any[]>([]);
  const [announcements, setAnnouncements] = useState<any[]>([]);

  const [activeTab, setActiveTab] = useState("students");

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [resourceUrl, setResourceUrl] = useState("");

  const [announcementTitle, setAnnouncementTitle] = useState("");
  const [announcementContent, setAnnouncementContent] = useState("");
  const [shortcutRequest, setShortcutRequest] =
    useState<ShortcutRequest | null>(null);
  const [studentPanel, setStudentPanel] = useState<StudentWorkspacePanelState>({
    open: false,
    studentId: null,
    studentName: "",
    studentType: null,
    section: "notes",
    requestKey: 0,
  });
  const shortcutKeyRef = useRef(0);

  async function loadData() {
    const classId = searchParams.get("id");

    if (!classId) return;

    const {
      data: { session },
    } = await supabase.auth.getSession();

    setTeacherId(session?.user.id || "");

    const classResult = await supabase
  .from("classes")
  .select(`
    *,
    classrooms (
      id,
      name,
      logo,
      theme_colour
    )
  `)
  .eq("id", classId)
  .single();


if (classResult.data) {
  const { data: levelData } = await supabase
    .from("levels")
    .select("name")
    .eq("id", classResult.data.level_id)
    .single();

    console.log("LEVEL DATA:", levelData);
  console.log("LEVEL ID:", classResult.data.level_id);

  classResult.data.level_name = levelData?.name;
  setLevelName(levelData?.name || "");
  setClassData(classResult.data);
}

    const enrolments = await supabase
      .from("class_enrolments")
      .select("*")
      .eq("class_id", classId);

    const studentIds =
      enrolments.data?.map((e) => e.student_id) || [];

    if (studentIds.length > 0) {
      const studentResult = await supabase
        .from("profiles")
        .select("*")
        .in("id", studentIds);

      setStudents(studentResult.data || []);
    } else {
      setStudents([]);
    }

    const youngLearnerResult = await supabase
      .from("young_learners")
      .select("id, first_name, last_name, active")
      .eq("class_id", classId)
      .eq("active", true)
      .order("first_name");

    if (youngLearnerResult.error) {
      console.error("Unable to load Young Learners:", youngLearnerResult.error);
      setYoungLearners([]);
    } else {
      setYoungLearners(youngLearnerResult.data || []);
    }

    const resourceResult = await supabase
      .from("resources")
      .select("*")
      .eq("class_id", classId);

    setResources(resourceResult.data || []);

    const announcementResult = await supabase
      .from("announcements")
      .select("*")
      .eq("classes_id", classId)
      .order("created_at", { ascending: false });

    setAnnouncements(announcementResult.data || []);
  }

  useEffect(() => {
    loadData();
  }, []);

  async function handleSaveResource() {
    const classId = searchParams.get("id");

    if (!classId) return;

    const { error } = await supabase
      .from("resources")
      .insert([
        {
          title,
          description,
          resource_url: resourceUrl,
          class_id: classId,
          active: true,
        },
      ]);

    if (error) {
      alert(error.message);
      return;
    }

    setTitle("");
    setDescription("");
    setResourceUrl("");

    loadData();
  }

  async function handleSaveAnnouncement() {
    const classId = searchParams.get("id");

    if (!classId) return;

    const {
      data: { session },
    } = await supabase.auth.getSession();

    const { error } = await supabase
      .from("announcements")
      .insert([
        {
          classes_id: classId,
          title: announcementTitle,
          content: announcementContent,
          created_by: session?.user.id,
        },
      ]);

    if (error) {
      alert(error.message);
      return;
    }

    setAnnouncementTitle("");
    setAnnouncementContent("");

    loadData();
  }

  const totalStudentCount = students.length + youngLearners.length;
  const showClassExamsTab = isClassExamLevel(levelName);
  const showUnitExamResultsTab = isUnitExamLevel(levelName);
  const showFridayTutorialResultsTab =
    classData?.is_cambridge === true && isFridayTutorialCambridgeLevel(levelName);
  const isCambridgeClass = classData?.is_cambridge === true;
  const isSupportClass = normalizeLevelName(levelName) === "SUPPORT CLASSES";
  const controlSheetStudents: ClassStudentControlStudent[] = isCambridgeClass
    ? students.map((student) => ({
        id: student.id,
        first_name: student.first_name,
        last_name: student.last_name,
        student_type: "cambridge",
        active: student.active,
      }))
    : youngLearners.map((student) => ({
        id: student.id,
        first_name: student.first_name,
        last_name: student.last_name,
        student_type: "young_learner",
        active: student.active,
      }));
  const followUpStudents = [
    ...students.map((student) => ({
      id: student.id,
      first_name: student.first_name,
      last_name: student.last_name,
      student_type: "cambridge",
    })),
    ...youngLearners.map((student) => ({
      id: student.id,
      first_name: student.first_name,
      last_name: student.last_name,
      student_type: "young_learner",
    })),
  ];

  function openStudentShortcut(
    action: ClassStudentShortcutAction,
    student?: ClassStudentControlStudent
  ) {
    shortcutKeyRef.current += 1;
    const requestKey = shortcutKeyRef.current;
    const panelSection = getPanelSectionForAction(action);

    if (
      student?.student_type === "cambridge" &&
      panelSection &&
      student.id
    ) {
      setStudentPanel({
        open: true,
        studentId: student.id,
        studentName: getStudentName(student),
        studentType: student.student_type,
        section: panelSection,
        requestKey,
      });
      setActiveTab("students");
      return;
    }

    let targetTab = "students";
    let resultSection: ShortcutRequest["resultSection"] = null;

    if (action === "notes") {
      targetTab = "notes";
    } else if (action === "homework") {
      targetTab = "results";
      resultSection = "homework";
    } else if (action === "friday-tutorial") {
      targetTab = "friday-tutorial-results";
    } else if (action === "mock-exams") {
      targetTab = "results";
      resultSection = "mock";
    } else if (action === "progress") {
      targetTab = "progress";
    } else if (action === "follow-up") {
      targetTab = "follow-up";
    } else if (action === "message") {
      targetTab = "messages";
    } else if (action === "class-exams") {
      targetTab = "class-exams";
    } else if (action === "unit-exams") {
      targetTab = "unit-exam-results";
    }

    setShortcutRequest({
      key: requestKey,
      targetTab,
      studentId: student?.id || null,
      studentType: student?.student_type || null,
      resultSection,
    });
    setStudentPanel((current) => ({
      ...current,
      open: false,
    }));
    setActiveTab(targetTab);
  }

  const resultsShortcut =
    shortcutRequest?.targetTab === "results" ? shortcutRequest : null;
  const fridayTutorialShortcut =
    shortcutRequest?.targetTab === "friday-tutorial-results"
      ? shortcutRequest
      : null;
  const notesShortcut =
    shortcutRequest?.targetTab === "notes" ? shortcutRequest : null;
  const messagesShortcut =
    shortcutRequest?.targetTab === "messages" ? shortcutRequest : null;
  const followUpShortcut =
    shortcutRequest?.targetTab === "follow-up" ? shortcutRequest : null;
  const progressShortcut =
    shortcutRequest?.targetTab === "progress" ? shortcutRequest : null;
  const selectedPanelStudent = studentPanel.studentId
    ? students.find((student) => student.id === studentPanel.studentId)
    : null;
  const selectedPanelStudentName = selectedPanelStudent
    ? getStudentName(selectedPanelStudent)
    : studentPanel.studentName;

  return (
   <TeacherLayout>
    <div
      style={{
        color: "#000000",
      }}
    >
  <ClassHeader
  classData={
    classData
      ? {
          ...classData,
          level_name: levelName,
        }
      : null
  }
  studentCount={totalStudentCount}
/>
      <div
        style={{
          display: "flex",
          gap: "10px",
          flexWrap: "wrap",
          marginBottom: "20px",
        }}
      >
        {tabs
          .filter((tab) => tab.id !== "class-exams" || showClassExamsTab)
          .filter(
            (tab) =>
              tab.id !== "unit-exam-results" || showUnitExamResultsTab
          )
          .filter(
            (tab) =>
              tab.id !== "friday-tutorial-results" ||
              showFridayTutorialResultsTab
          )
          .map((tab) => {
          const isActive = activeTab === tab.id;

          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                background: isActive ? "#1f3c88" : "#ffffff",
                color: isActive ? "#ffffff" : "#1f3c88",
                border: isActive ? "1px solid #1f3c88" : "1px solid #dbe3f0",
                borderRadius: "999px",
                padding: "10px 16px",
                cursor: "pointer",
                fontWeight: 700,
                boxShadow: isActive
                  ? "0 6px 14px rgba(31,60,136,0.18)"
                  : "0 2px 8px rgba(31,60,136,0.04)",
              }}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      <section
        style={{
          background: "#ffffff",
          border: "1px solid #e6eaf2",
          borderRadius: "14px",
          padding: "26px",
          boxShadow: "0 6px 18px rgba(31,60,136,0.06)",
        }}
      >

      {activeTab === "students" && (
        <ClassStudentsControlSheet
          students={controlSheetStudents}
          isCambridgeClass={isCambridgeClass}
          isSupportClass={isSupportClass}
          showClassExams={showClassExamsTab}
          showUnitExamResults={showUnitExamResultsTab}
          showFridayTutorialResults={showFridayTutorialResultsTab}
          onShortcut={openStudentShortcut}
        />
      )}

      {activeTab === "resources" && (
        <>
          <h3>Resources</h3>

          {resources.length === 0 ? (
            <p>No resources yet</p>
          ) : (
            resources.map((resource) => (
              <div key={resource.id}>
                <strong>{resource.title}</strong>
                <br />
                {resource.description}
                <br />
                <a
                  href={resource.resource_url}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open Resource
                </a>
                <br />
                <br />
              </div>
            ))
          )}

          <h3>Add Resource</h3>

          <input
            placeholder="Title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />

          <br />
          <br />

          <input
            placeholder="Description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />

          <br />
          <br />

          <input
            placeholder="Google Drive Link"
            value={resourceUrl}
            onChange={(e) => setResourceUrl(e.target.value)}
          />

          <br />
          <br />

          <button onClick={handleSaveResource}>
            Save Resource
          </button>
        </>
      )}

      {activeTab === "shared-resources" && classData && (
        <SharedResourcesTab
          levelId={classData.level_id}
          levelName={levelName}
        />
      )}

      {activeTab === "official-resources" && classData && (
        <OfficialResourcesTab
          levelId={classData.level_id}
          levelName={levelName}
        />
      )}

     {activeTab === "homework" && (
  <TeacherHomework
    level={classData?.level_name ?? ""}
    courseType={classData?.course_type ?? ""}
  />
)}

      {activeTab === "class-exams" && showClassExamsTab && (
  <ClassExamsTab levelName={levelName} />
)}

      {activeTab === "unit-exam-results" &&
        showUnitExamResultsTab &&
        classData && (
  <UnitExamResultsTab
    classId={classData.id}
    teacherId={teacherId}
    levelName={levelName}
    youngLearners={youngLearners}
  />
)}

      {activeTab === "announcements" && (
        <>
          <h3>Announcements</h3>

          {announcements.map((announcement) => (
            <div key={announcement.id}>
              <strong>{announcement.title}</strong>
              <br />
              {announcement.content}
              <br />
              <br />
            </div>
          ))}

          <h3>Add Announcement</h3>

          <input
            placeholder="Title"
            value={announcementTitle}
            onChange={(e) =>
              setAnnouncementTitle(e.target.value)
            }
          />

          <br />
          <br />

          <textarea
            placeholder="Content"
            value={announcementContent}
            onChange={(e) =>
              setAnnouncementContent(e.target.value)
            }
          />

          <br />
          <br />

          <button onClick={handleSaveAnnouncement}>
            Save Announcement
          </button>
        </>
      )}

      {activeTab === "results" && classData && (
  <ResultsTab
    classId={classData.id}
    students={students}
    levelName={levelName}
    courseType={classData.course_type}
    classDays={classData.days}
    teacherId={teacherId}
    initialStudentId={resultsShortcut?.studentId || null}
    initialSection={resultsShortcut?.resultSection || null}
    shortcutRequestKey={resultsShortcut?.key || 0}
  />
)}

      {activeTab === "friday-tutorial-results" &&
        showFridayTutorialResultsTab &&
        classData && (
  <FridayTutorialResultsTab
    classId={classData.id}
    levelName={levelName}
    initialStudentId={fridayTutorialShortcut?.studentId || null}
    shortcutRequestKey={fridayTutorialShortcut?.key || 0}
  />
)}

      {activeTab === "notes" && (
  <TeacherNotesTab
  classId={classData?.id}
    students={students}
    initialStudentId={notesShortcut?.studentId || null}
    shortcutRequestKey={notesShortcut?.key || 0}
  />
)}

      {activeTab === "messages" && (
  <ClassMessagesTab
    students={students}
    teacherId={teacherId}
    initialStudentId={messagesShortcut?.studentId || null}
    shortcutRequestKey={messagesShortcut?.key || 0}
  />
)}

      {activeTab === "follow-up" && classData && (
  <FollowUpsTab
    classId={classData.id}
    students={followUpStudents}
    teacherId={teacherId}
    initialStudentId={followUpShortcut?.studentId || null}
    initialStudentType={followUpShortcut?.studentType || null}
    shortcutRequestKey={followUpShortcut?.key || 0}
  />
)}

      {activeTab === "progress" && classData && (
  <StudentProgressTab
    classId={classData.id}
    students={students}
    initialStudentId={progressShortcut?.studentId || null}
    shortcutRequestKey={progressShortcut?.key || 0}
  />
)}
      </section>

      {classData && (
        <StudentWorkspacePanel
          open={studentPanel.open}
          classId={classData.id}
          classLevel={levelName}
          courseType={classData.course_type || ""}
          classDays={classData.days || ""}
          teacherId={teacherId}
          studentId={studentPanel.studentId}
          studentName={selectedPanelStudentName}
          studentType={studentPanel.studentType}
          initialSection={studentPanel.section}
          requestKey={studentPanel.requestKey}
          onClose={() =>
            setStudentPanel((current) => ({
              ...current,
              open: false,
            }))
          }
        />
      )}
    </div>
    </TeacherLayout>
  );
}

export default function ClassPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <ClassPageContent />
    </Suspense>
  );
}
