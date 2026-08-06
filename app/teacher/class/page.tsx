"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
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
import YoungLearnerResultsSummary from "./YoungLearnerResultsSummary";
import ClassPointsTab from "./ClassPointsTab";
import ClassProgressTab from "./ClassProgressTab";
import CoursePlanningTab from "./CoursePlanningTab";
import SharedResourcesTab from "./SharedResourcesTab";
import OfficialResourcesTab from "./OfficialResourcesTab";
import ClassResourcesTab, { type ClassResource } from "./ClassResourcesTab";
import GoogleMeetTab, { type GoogleMeetState } from "./GoogleMeetTab";
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
import { deleteTeacherClassAnnouncement } from "../../../lib/announcements";
import { isClassProgressEligible } from "../../../lib/classProgressEligibility";
import { isCoursePlanningEligible } from "../../../lib/coursePlanningEligibility";

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

const cambridgeClassTabs = [
  { id: "students", label: "Students" },
  { id: "homework", label: "Homework" },
  { id: "results", label: "Results" },
  { id: "resources", label: "Class Resources" },
  { id: "shared-resources", label: "Shared Resources" },
  { id: "official-resources", label: "Official Resources" },
  { id: "announcements", label: "Announcements" },
];

const youngLearnerRemovedTabIds = new Set([
  "resources",
  "shared-resources",
  "official-resources",
  "homework",
  "class-exams",
  "unit-exam-results",
  "notes",
  "messages",
  "follow-up",
  "progress",
  "announcements",
]);

const youngLearnerClassTabs = [
  ...tabs.filter((tab) => !youngLearnerRemovedTabIds.has(tab.id)),
  { id: "class-points", label: "Class Points" },
];

const googleMeetTab = { id: "google-meet", label: "Google Meet" };
const classProgressTab = { id: "class-progress", label: "Class Progress" };
const coursePlanningTab = { id: "course-planning", label: "Course Planning" };

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

function canDeleteTeacherClassAnnouncement(
  announcement: any,
  classId: string,
  teacherId: string,
  assignedTeacherId: string
) {
  const audienceType = String(announcement?.audience_type || "")
    .trim()
    .toLowerCase();

  return (
    Boolean(classId) &&
    Boolean(teacherId) &&
    classId === String(announcement?.classes_id || "") &&
    teacherId === assignedTeacherId &&
    String(announcement?.created_by || "") === teacherId &&
    (audienceType === "" || audienceType === "class") &&
    !String(announcement?.target_level || "").trim()
  );
}

function getPanelSectionForAction(
  action: ClassStudentShortcutAction
): StudentWorkspaceSection | null {
  if (action === "notes") return "notes";
  if (action === "homework") return "homework";
  if (action === "friday-tutorial") return "friday-tutorial";
  if (action === "mock-exams") return "mocks";
  if (action === "progress") return "progress";
  if (action === "follow-up") return "follow-up";
  if (action === "message") return "message";

  return null;
}

function ClassPageContent() {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();

  const [classData, setClassData] = useState<any>(null);
  const [levelName, setLevelName] = useState("");
  const [teacherId, setTeacherId] = useState("");
  const [actorRole, setActorRole] = useState("");
  const [students, setStudents] = useState<any[]>([]);
  const [youngLearners, setYoungLearners] = useState<any[]>([]);
  const [resources, setResources] = useState<ClassResource[]>([]);
  const [announcements, setAnnouncements] = useState<any[]>([]);
  const [googleMeet, setGoogleMeet] = useState<GoogleMeetState>({
    classId: "",
    loading: false,
    error: "",
    supported: false,
    meetLink: null,
  });

  const [activeTab, setActiveTab] = useState("students");

  const [announcementTitle, setAnnouncementTitle] = useState("");
  const [announcementContent, setAnnouncementContent] = useState("");
  const [announcementMessage, setAnnouncementMessage] = useState("");
  const [announcementError, setAnnouncementError] = useState("");
  const [pendingAnnouncementDeleteId, setPendingAnnouncementDeleteId] =
    useState("");
  const [deletingAnnouncementId, setDeletingAnnouncementId] = useState("");
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
    if (session?.user.id) {
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", session.user.id)
        .maybeSingle();

      if (profileError) {
        console.error("Unable to load class workspace role:", profileError);
      }
      setActorRole(String(profile?.role || "").trim().toLowerCase());
    } else {
      setActorRole("");
    }

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

    if (classResult.data?.is_cambridge === true) {
      const resourceResult = await supabase
        .from("resources")
        .select("id, title, description, resource_url, class_id, active")
        .eq("class_id", classId);

      if (resourceResult.error) {
        console.error("Unable to load class resources:", resourceResult.error);
        setResources([]);
      } else {
        setResources((resourceResult.data || []) as ClassResource[]);
      }
    } else {
      setResources([]);
    }

    if (classResult.data?.is_cambridge === true) {
      const announcementResult = await supabase
        .from("announcements")
        .select("*")
        .eq("classes_id", classId)
        .order("created_at", { ascending: false });

      setAnnouncements(announcementResult.data || []);
    } else {
      setAnnouncements([]);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  const requestedClassId = String(searchParams.get("id") || "").trim();
  const loadGoogleMeet = useCallback(async () => {
    if (!requestedClassId) {
      setGoogleMeet({
        classId: "",
        loading: false,
        error: "",
        supported: false,
        meetLink: null,
      });
      return;
    }

    setGoogleMeet((current) => ({
      classId: requestedClassId,
      loading: true,
      error: "",
      supported:
        current.classId === requestedClassId ? current.supported : false,
      meetLink: null,
    }));

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error("AUTHENTICATION_REQUIRED");

      const response = await fetch(
        `/api/teacher/classes/${encodeURIComponent(
          requestedClassId
        )}/google-meet`,
        {
          headers: { Authorization: `Bearer ${session.access_token}` },
          cache: "no-store",
        }
      );
      const payload = await response.json().catch(() => ({}));

      if (response.status === 404) {
        setGoogleMeet({
          classId: requestedClassId,
          loading: false,
          error: "",
          supported: false,
          meetLink: null,
        });
        return;
      }
      if (!response.ok) throw new Error("GOOGLE_MEET_LOAD_FAILED");

      setGoogleMeet({
        classId: requestedClassId,
        loading: false,
        error: "",
        supported:
          payload?.class?.id === requestedClassId &&
          payload?.class?.course_type === "online",
        meetLink:
          typeof payload?.class?.meet_link === "string"
            ? payload.class.meet_link
            : null,
      });
    } catch (error) {
      console.error("Google Meet information load failed:", error);
      setGoogleMeet((current) => ({
        classId: requestedClassId,
        loading: false,
        error: "Google Meet information could not be loaded. Please try again.",
        supported:
          current.classId === requestedClassId && current.supported,
        meetLink: null,
      }));
    }
  }, [requestedClassId]);

  useEffect(() => {
    void loadGoogleMeet();
  }, [loadGoogleMeet]);

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

  async function handleDeleteClassAnnouncement() {
    const classId = String(classData?.id || "");
    if (!classId || !pendingAnnouncementDeleteId) return;

    setDeletingAnnouncementId(pendingAnnouncementDeleteId);
    setAnnouncementMessage("");
    setAnnouncementError("");

    try {
      await deleteTeacherClassAnnouncement(classId, pendingAnnouncementDeleteId);
      setAnnouncements((current) =>
        current.filter(
          (announcement) => announcement.id !== pendingAnnouncementDeleteId
        )
      );
      setPendingAnnouncementDeleteId("");
      setAnnouncementMessage("Class announcement deleted successfully.");
    } catch (error: any) {
      console.error("Unable to delete class announcement:", error);
      setAnnouncementError(
        error?.message || "Unable to delete the class announcement."
      );
    } finally {
      setDeletingAnnouncementId("");
    }
  }

  const totalStudentCount = students.length + youngLearners.length;
  const showClassExamsTab = isClassExamLevel(levelName);
  const showUnitExamResultsTab = isUnitExamLevel(levelName);
  const showFridayTutorialResultsTab =
    classData?.is_cambridge === true && isFridayTutorialCambridgeLevel(levelName);
  const isCambridgeClass = classData?.is_cambridge === true;
  const isYoungLearnerClass = classData?.is_cambridge === false;
  const canManageClassResources =
    actorRole === "admin" ||
    (actorRole === "teacher" &&
      Boolean(teacherId) &&
      teacherId === String(classData?.teacher_id || ""));
  const showResultsTab =
    isCambridgeClass &&
    ["B1", "B2", "C1", "C2"].includes(normalizeLevelName(levelName));
  const isSupportClass = normalizeLevelName(levelName) === "SUPPORT CLASSES";
  const showClassProgressTab = isClassProgressEligible({
    isCambridge: isCambridgeClass,
    levelName,
    courseType: classData?.course_type,
  });
  const showCoursePlanningTab = isCoursePlanningEligible({
    isCambridge: isCambridgeClass,
    levelName,
    courseType: classData?.course_type,
  });
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
      student?.student_type === "young_learner" &&
      student.id &&
      classData?.id &&
      isYoungLearnerClass
    ) {
      router.push(
        `/teacher/class/young-learner/${encodeURIComponent(
          student.id
        )}?classId=${encodeURIComponent(classData.id)}`
      );
      return;
    }

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
      selectTab("students");
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
    selectTab(targetTab);
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
  const googleMeetIsVisible =
    googleMeet.classId === requestedClassId && googleMeet.supported;
  const baseClassTabs = (
    isCambridgeClass
      ? cambridgeClassTabs
      : isYoungLearnerClass
      ? youngLearnerClassTabs
      : tabs
  );
  const classTabs = [
    ...baseClassTabs,
    ...(showClassProgressTab ? [classProgressTab] : []),
    ...(showCoursePlanningTab ? [coursePlanningTab] : []),
  ].flatMap(
    (tab) =>
      tab.id === "students" && googleMeetIsVisible
        ? [tab, googleMeetTab]
        : [tab]
  );
  const visibleTabs = classTabs
    .filter(
      (tab) =>
        tab.id !== "results" ||
        (isCambridgeClass ? showResultsTab : !isSupportClass)
    )
    .filter((tab) => tab.id !== "class-exams" || showClassExamsTab)
    .filter(
      (tab) => tab.id !== "unit-exam-results" || showUnitExamResultsTab
    )
    .filter(
      (tab) =>
        tab.id !== "friday-tutorial-results" ||
        showFridayTutorialResultsTab
    );
  const visibleTabIds = visibleTabs.map((tab) => tab.id).join("|");
  const requestedTab = String(searchParams.get("tab") || "").trim();
  const resultsTabIsVisible = visibleTabs.some((tab) => tab.id === "results");

  function selectTab(tabId: string) {
    const nextTab = visibleTabs.some((tab) => tab.id === tabId)
      ? tabId
      : "students";
    if (activeTab === nextTab && requestedTab === nextTab) return;
    setActiveTab(nextTab);
    if (requestedTab === nextTab) return;
    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.set("tab", nextTab);
    router.replace(`${pathname}?${nextParams.toString()}`, { scroll: false });
  }

  useEffect(() => {
    if (!classData) return;
    const nextTab =
      requestedTab && visibleTabs.some((tab) => tab.id === requestedTab)
        ? requestedTab
        : "students";
    setActiveTab((current) => (current === nextTab ? current : nextTab));

    if (
      (isYoungLearnerClass || isCambridgeClass) &&
      requestedTab &&
      requestedTab !== nextTab
    ) {
      const nextParams = new URLSearchParams(searchParams.toString());
      nextParams.set("tab", nextTab);
      router.replace(`${pathname}?${nextParams.toString()}`, {
        scroll: false,
      });
    }
  }, [
    classData,
    isCambridgeClass,
    isYoungLearnerClass,
    pathname,
    requestedTab,
    router,
    searchParams,
    visibleTabIds,
  ]);

  return (
   <TeacherLayout>
    <div className="teacher-class-workspace">
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
      <nav
        className="teacher-class-workspace-nav"
        aria-label="Class workspace sections"
        role="tablist"
      >
        {visibleTabs.map((tab) => {
          const isActive = activeTab === tab.id;

          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              aria-controls="teacher-class-workspace-content"
              className={`teacher-class-workspace-nav-button ${
                isActive ? "is-active" : ""
              }`}
              onClick={() => selectTab(tab.id)}
            >
              {tab.label}
            </button>
          );
        })}
      </nav>

      <section
        id="teacher-class-workspace-content"
        className="teacher-class-workspace-content"
        role="tabpanel"
      >

      {activeTab === "students" && (
        <ClassStudentsControlSheet
          students={controlSheetStudents}
          isCambridgeClass={isCambridgeClass}
          isSupportClass={isSupportClass}
          showClassExams={isCambridgeClass && showClassExamsTab}
          showUnitExamResults={isCambridgeClass && showUnitExamResultsTab}
          showFridayTutorialResults={showFridayTutorialResultsTab}
          onShortcut={openStudentShortcut}
        />
      )}

      {activeTab === "google-meet" &&
        googleMeetIsVisible &&
        classData && (
          <GoogleMeetTab state={googleMeet} onRetry={loadGoogleMeet} />
        )}

      {activeTab === "resources" && isCambridgeClass && (
        <ClassResourcesTab
          classId={String(classData?.id || requestedClassId)}
          resources={resources}
          canManage={canManageClassResources}
          onResourcesChange={setResources}
        />
      )}

      {activeTab === "shared-resources" && isCambridgeClass && classData && (
        <SharedResourcesTab
          levelId={classData.level_id}
          levelName={levelName}
        />
      )}

      {activeTab === "official-resources" && isCambridgeClass && classData && (
        <OfficialResourcesTab
          classId={classData.id}
          levelId={classData.level_id}
          levelName={levelName}
        />
      )}

     {activeTab === "homework" && isCambridgeClass && (
  <TeacherHomework
    classId={classData?.id ?? ""}
  />
)}

      {activeTab === "course-planning" && showCoursePlanningTab && classData && (
        <CoursePlanningTab
          classId={String(classData.id)}
          adminMode={actorRole === "admin"}
        />
      )}

      {activeTab === "class-exams" && !isYoungLearnerClass && showClassExamsTab && (
  <ClassExamsTab levelName={levelName} />
)}

      {activeTab === "unit-exam-results" &&
        !isYoungLearnerClass &&
        showUnitExamResultsTab &&
        classData && (
  <UnitExamResultsTab
    classId={classData.id}
    teacherId={teacherId}
    levelName={levelName}
    youngLearners={youngLearners}
  />
)}

      {activeTab === "announcements" && isCambridgeClass && (
        <>
          <h3>Announcements</h3>

          {announcementMessage && (
            <p
              role="status"
              style={{
                color: "#166534",
                fontWeight: 700,
                margin: "0 0 12px",
              }}
            >
              {announcementMessage}
            </p>
          )}

          {announcementError && (
            <p
              role="alert"
              style={{
                color: "#b42318",
                fontWeight: 700,
                margin: "0 0 12px",
              }}
            >
              {announcementError}
            </p>
          )}

          {announcements.map((announcement) => (
            <div key={announcement.id}>
              <strong>{announcement.title}</strong>
              <br />
              {announcement.content}
              <br />
              {canDeleteTeacherClassAnnouncement(
                announcement,
                String(classData?.id || ""),
                teacherId,
                String(classData?.teacher_id || "")
              ) &&
                (pendingAnnouncementDeleteId === announcement.id ? (
                  <div
                    role="alertdialog"
                    aria-label="Delete class announcement"
                    style={{
                      border: "1px solid #f1c6c6",
                      borderRadius: "8px",
                      marginTop: "10px",
                      maxWidth: "440px",
                      padding: "12px",
                    }}
                  >
                    <p style={{ color: "#5e6b7d", margin: "0 0 10px" }}>
                      Delete this class announcement permanently?
                    </p>
                    <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                      <button
                        type="button"
                        onClick={() => {
                          setPendingAnnouncementDeleteId("");
                          setAnnouncementError("");
                        }}
                        disabled={deletingAnnouncementId === announcement.id}
                        style={{
                          background: "#ffffff",
                          border: "1px solid #c7d3e3",
                          borderRadius: "8px",
                          color: "#24446f",
                          cursor: "pointer",
                          fontWeight: 800,
                          padding: "8px 11px",
                        }}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={handleDeleteClassAnnouncement}
                        disabled={deletingAnnouncementId === announcement.id}
                        style={{
                          background: "#b42318",
                          border: "1px solid #b42318",
                          borderRadius: "8px",
                          color: "#ffffff",
                          cursor: "pointer",
                          fontWeight: 800,
                          padding: "8px 11px",
                        }}
                      >
                        {deletingAnnouncementId === announcement.id
                          ? "Deleting..."
                          : "Delete Announcement"}
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setPendingAnnouncementDeleteId(announcement.id);
                      setAnnouncementMessage("");
                      setAnnouncementError("");
                    }}
                    style={{
                      background: "#ffffff",
                      color: "#b00020",
                      border: "1px solid #f1c6c6",
                      borderRadius: "8px",
                      padding: "8px 11px",
                      cursor: "pointer",
                      fontWeight: 800,
                      marginTop: "10px",
                    }}
                  >
                    Delete
                  </button>
                ))}
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

      {activeTab === "results" && isYoungLearnerClass && classData && (
        <YoungLearnerResultsSummary
          classId={classData.id}
          levelName={levelName}
          youngLearners={youngLearners}
        />
      )}

      {activeTab === "class-points" && isYoungLearnerClass && classData && (
        <ClassPointsTab classId={classData.id} />
      )}

      {activeTab === "class-progress" && showClassProgressTab && classData && (
        <ClassProgressTab
          classId={classData.id}
          initialLessonDate={searchParams.get("lessonDate")}
          initialStartTime={searchParams.get("startTime")}
        />
      )}

      {activeTab === "results" &&
        isCambridgeClass &&
        resultsTabIsVisible &&
        classData && (
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

      {activeTab === "notes" && !isYoungLearnerClass && (
  <TeacherNotesTab
  classId={classData?.id}
    students={students}
    initialStudentId={notesShortcut?.studentId || null}
    shortcutRequestKey={notesShortcut?.key || 0}
  />
)}

      {activeTab === "messages" && !isYoungLearnerClass && (
  <ClassMessagesTab
    students={students}
    teacherId={teacherId}
    initialStudentId={messagesShortcut?.studentId || null}
    shortcutRequestKey={messagesShortcut?.key || 0}
  />
)}

      {activeTab === "follow-up" && !isYoungLearnerClass && classData && (
  <FollowUpsTab
    classId={classData.id}
    students={followUpStudents}
    teacherId={teacherId}
    initialStudentId={followUpShortcut?.studentId || null}
    initialStudentType={followUpShortcut?.studentType || null}
    shortcutRequestKey={followUpShortcut?.key || 0}
  />
)}

      {activeTab === "progress" && !isYoungLearnerClass && classData && (
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
          showFridayTutorial={showFridayTutorialResultsTab}
          showProgress={showFridayTutorialResultsTab}
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
