"use client";

import TeacherLayout from "../components/layout/TeacherLayout";
import Image from "next/image";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";
import TodaySchedule from "../components/dashboard/TodaySchedule";
import TeacherCalendarAgenda from "../components/teacher/TeacherCalendarAgenda";
import TeacherMessageNotifications from "../components/teacher/TeacherMessageNotifications";
import TeacherAnnouncementBanner from "../components/teacher/TeacherAnnouncementBanner";
import FridayExamPracticeCard from "../components/teacher/FridayExamPracticeCard";
import FridayAt6DutyCard from "../components/teacher/FridayAt6DutyCard";
import {
  getFridayAt6DutyForDate,
  getFridayExamPracticeSessionsForDate,
} from "../../lib/fridayExamPractice";

function getLocalDateString(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function TeacherDashboardIcon({
  name,
}: {
  name: "classes" | "status";
}) {
  const commonProps = {
    "aria-hidden": true,
    width: 24,
    height: 24,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };

  if (name === "classes") {
    return (
      <svg {...commonProps}>
        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
        <path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15Z" />
        <path d="M9 7h6" />
        <path d="M9 11h6" />
      </svg>
    );
  }

  return (
    <svg {...commonProps}>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
      <path d="m9 12 2 2 4-5" />
    </svg>
  );
}

export default function TeacherPage() {
  const router = useRouter();

  const [classes, setClasses] = useState<any[]>([]);
  const [teacherName, setTeacherName] = useState("");
  const [teacherId, setTeacherId] = useState("");
  const [fridayExamPracticeSessions, setFridayExamPracticeSessions] =
    useState<any[]>([]);
  const [fridayAt6Duty, setFridayAt6Duty] = useState<any | null>(null);

  useEffect(() => {
    async function loadData() {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        router.push("/login");
        return;
      }

      const profile = await supabase
        .from("profiles")
        .select("*")
        .eq("id", session.user.id)
        .single();

      if (profile.data?.role !== "teacher") {
        router.push("/login");
        return;
      }

      setTeacherName(
        `${profile.data.first_name || ""} ${
          profile.data.last_name || ""
        }`
      );
      setTeacherId(session.user.id);

      const teacherClasses = await supabase
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
  .eq("teacher_id", session.user.id);

if (teacherClasses.error) {
  console.error("Unable to load teacher classes:", teacherClasses.error);
}

console.log("Teacher Classes:", teacherClasses.data);

const classData = teacherClasses.data || [];
let classesWithLevels = classData;

if (!teacherClasses.error && classData.length > 0) {
  const levelIds = Array.from(
    new Map(
      classData
        .map((item) => item.level_id)
        .filter((levelId) => levelId !== null && levelId !== undefined)
        .map((levelId) => [String(levelId), levelId])
    ).values()
  );

  if (levelIds.length > 0) {
    const { data: levels, error: levelsError } = await supabase
      .from("levels")
      .select("id, name")
      .in("id", levelIds);

    if (levelsError) {
      console.error("Unable to load teacher class levels:", levelsError);
    } else {
      const levelNameById = new Map(
        (levels || []).map((level) => [String(level.id), level.name])
      );

      classesWithLevels = classData.map((item) => ({
        ...item,
        level_name:
          levelNameById.get(String(item.level_id)) || item.level_name,
      }));
    }
  }
}

setClasses(classesWithLevels);

      try {
        const today = getLocalDateString();
        const [examPracticeSessions, duty] = await Promise.all([
          getFridayExamPracticeSessionsForDate(today),
          getFridayAt6DutyForDate(today),
        ]);

        setFridayExamPracticeSessions(examPracticeSessions);
        setFridayAt6Duty(
          duty?.teacher_id === session.user.id ? duty : null
        );
      } catch (error) {
        console.error("Unable to load Friday @ 6 dashboard items:", error);
        setFridayExamPracticeSessions([]);
        setFridayAt6Duty(null);
      }

    }

    loadData();
  }, [router]);

  const classroomName = classes[0]?.classrooms?.name || "-";
  const classroomLogo = classes[0]?.classrooms?.logo || "/Emu Logo.png";

  return (
  <TeacherLayout>
     
     <div className="teacher-dashboard-page">
      <section
        className="teacher-dashboard-overview"
        aria-label="Teacher overview"
      >
        <article className="teacher-dashboard-card teacher-dashboard-welcome-card">
          <div>
            <p className="teacher-dashboard-card-label">Welcome back</p>
            <h2 className="teacher-dashboard-teacher-name">{teacherName}</h2>
          </div>

          <p className="teacher-dashboard-welcome-text">
            <span className="teacher-dashboard-welcome-long-text">
              Ready for another great day of teaching.
            </span>
            <span className="teacher-dashboard-welcome-short-text">
              Ready to teach.
            </span>
          </p>
        </article>

        <article className="teacher-dashboard-card teacher-dashboard-classroom-card">
          <p className="teacher-dashboard-card-label">Classroom</p>
          <div className="teacher-dashboard-classroom-content">
            <span className="teacher-dashboard-classroom-image">
              <Image
                src={classroomLogo}
                alt={`${classroomName} classroom`}
                width={62}
                height={62}
              />
            </span>
            <strong>{classroomName}</strong>
          </div>
        </article>

        <article className="teacher-dashboard-card teacher-dashboard-kpi-card">
          <span className="teacher-dashboard-card-icon">
            <TeacherDashboardIcon name="classes" />
          </span>
          <div>
            <p className="teacher-dashboard-card-label">Assigned Classes</p>
            <strong className="teacher-dashboard-kpi-value">
              {classes.length}
            </strong>
          </div>
        </article>

        <article className="teacher-dashboard-card teacher-dashboard-kpi-card">
          <span className="teacher-dashboard-card-icon teacher-dashboard-status-icon">
            <TeacherDashboardIcon name="status" />
          </span>
          <div>
            <p className="teacher-dashboard-card-label">Account Status</p>
            <strong className="teacher-dashboard-status-value">Active</strong>
          </div>
        </article>
      </section>

     <TeacherAnnouncementBanner teacherId={teacherId} />

     <TeacherMessageNotifications teacherId={teacherId} />

     <FridayAt6DutyCard duty={fridayAt6Duty} />

     <FridayExamPracticeCard sessions={fridayExamPracticeSessions} />

     <TeacherCalendarAgenda />

     <TodaySchedule classes={classes} /> 
     </div>
    </TeacherLayout>
  );
}
