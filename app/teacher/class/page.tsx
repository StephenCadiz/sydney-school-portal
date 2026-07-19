"use client";

import { Suspense, useEffect, useState } from "react";
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
  const classStudentList = [
    ...students.map((student) => ({
      id: `cambridge-${student.id}`,
      first_name: student.first_name,
      last_name: student.last_name,
    })),
    ...youngLearners.map((student) => ({
      id: `young-learner-${student.id}`,
      first_name: student.first_name,
      last_name: student.last_name,
    })),
  ].sort((first, second) =>
    `${first.first_name || ""} ${first.last_name || ""}`.localeCompare(
      `${second.first_name || ""} ${second.last_name || ""}`
    )
  );
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
        <div
          style={{
            display: "grid",
            gap: "16px",
          }}
        >
          <h3
            style={{
              color: "var(--ss-blue-dark)",
              margin: 0,
              fontSize: "20px",
            }}
          >
            Class Students
          </h3>

          {classStudentList.length === 0 ? (
            <div
              style={{
                background: "#f8fafd",
                border: "1px dashed var(--ss-border)",
                borderRadius: "12px",
                padding: "20px",
                color: "#667085",
              }}
            >
              No students have been added to this class yet.
            </div>
          ) : (
            <div
              style={{
                display: "grid",
                gap: "10px",
              }}
            >
              {classStudentList.map((student) => {
                const studentName = `${student.first_name || ""} ${
                  student.last_name || ""
                }`.trim() || "Unnamed student";

                return (
                  <div
                    key={student.id}
                    style={{
                      background: "#ffffff",
                      border: "1px solid var(--ss-border)",
                      borderRadius: "10px",
                      padding: "12px 14px",
                      color: "#111827",
                      fontWeight: 700,
                      boxShadow: "0 2px 8px rgba(31,60,136,0.04)",
                    }}
                  >
                    {studentName}
                  </div>
                );
              })}
            </div>
          )}
        </div>
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
  />
)}

      {activeTab === "friday-tutorial-results" &&
        showFridayTutorialResultsTab &&
        classData && (
  <FridayTutorialResultsTab
    classId={classData.id}
    levelName={levelName}
  />
)}

      {activeTab === "notes" && (
  <TeacherNotesTab
  classId={classData?.id}
    students={students}
  />
)}

      {activeTab === "messages" && (
  <ClassMessagesTab
    students={students}
    teacherId={teacherId}
  />
)}

      {activeTab === "follow-up" && classData && (
  <FollowUpsTab
    classId={classData.id}
    students={followUpStudents}
    teacherId={teacherId}
  />
)}

      {activeTab === "progress" && classData && (
  <StudentProgressTab
    classId={classData.id}
    students={students}
  />
)}
      </section>
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
