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

function getDisplayDate(date = new Date()) {
  return date.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
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

console.log("Teacher Classes:", teacherClasses.data);

setClasses(teacherClasses.data || []);

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

  async function handleLogout() {
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  const classroomName = classes[0]?.classrooms?.name || "-";
  const classroomLogo = classes[0]?.classrooms?.logo || "/Emu Logo.png";
  const classroomThemeColour =
    classes[0]?.classrooms?.theme_colour || "#1f3c88";

  return (
  <TeacherLayout>
     
     <div className="teacher-dashboard-page">
      <section
        className="teacher-dashboard-hero"
        style={{
          background: "#ffffff",
          padding: "25px 30px",
          borderRadius: "12px",
          marginBottom: "30px",
          display: "none",
          justifyContent: "space-between",
          alignItems: "center",
          boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
        }}
      >
        <Image
          className="teacher-dashboard-hero-logo"
          src="/LOGO and NAME.png"
          alt="Sydney School"
          width={220}
          height={70}
          style={{
            height: "auto",
            width: "auto",
          }}
        />

        <div className="teacher-dashboard-hero-text">
          <h1
            style={{
              margin: 0,
              color: "#1f3c88",
            }}
          >
            Teacher Dashboard
          </h1>

          <p
            style={{
              margin: "6px 0 0 0",
              color: "#666",
            }}
          >
            Sydney School Portal
          </p>

          <p
            style={{
              margin: "10px 0 0 0",
              color: "#666",
              fontWeight: 600,
            }}
          >
            {getDisplayDate()}
          </p>
        </div>
      </section>

      <section
        className="teacher-dashboard-stats-grid"
        style={{
          display: "grid",
          gridTemplateColumns: "2fr 1fr 1fr 1fr",
          gap: "20px",
          marginBottom: "30px",
        }}
      >
        <div
          className="teacher-dashboard-stat-card"
          style={{
            background: "#ffffff",
            padding: "25px",
            borderRadius: "12px",
            boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
          }}
        >
          <p
            style={{
              color: "#888",
              marginBottom: "8px",
            }}
          >
            Welcome back
          </p>

          <h2
            style={{
              margin: 0,
              color: "#1f3c88",
            }}
          >
            {teacherName}
          </h2>

          <p
            className="teacher-dashboard-welcome-text"
            style={{
              marginTop: "15px",
              color: "#666",
            }}
          >
            <span className="teacher-dashboard-welcome-long-text">
              Ready for another great day of teaching.
            </span>
            <span className="teacher-dashboard-welcome-short-text">
              Ready to teach.
            </span>
          </p>
        </div>

        <div
          className="teacher-dashboard-stat-card"
          style={{
            background: "#ffffff",
            padding: "20px",
            borderRadius: "12px",
            textAlign: "center",
            borderTop: `4px solid ${classroomThemeColour}`,
            boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
          }}
        >
          <h3
            style={{
              marginTop: 0,
              color: "#1f3c88",
            }}
          >
            Classroom
          </h3>

          <div
            style={{
              minHeight: "58px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              marginBottom: "10px",
            }}
          >
            <Image
              src={classroomLogo}
              alt={`${classroomName} classroom`}
              width={58}
              height={58}
              style={{
                objectFit: "contain",
              }}
            />
          </div>

          <div
            style={{
              fontSize: "24px",
              fontWeight: 700,
              color: "#1f3c88",
              lineHeight: 1.2,
            }}
          >
            {classroomName}
          </div>
        </div>

        <div
          className="teacher-dashboard-stat-card"
          style={{
            background: "#ffffff",
            padding: "20px",
            borderRadius: "12px",
            textAlign: "center",
            boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
          }}
        >
          <h3
            style={{
              marginTop: 0,
              color: "#1f3c88",
            }}
          >
            Classes
          </h3>

          <div
            style={{
              fontSize: "32px",
              fontWeight: 700,
              color: "#1f3c88",
            }}
          >
            {classes.length}
          </div>
        </div>

        <div
          className="teacher-dashboard-stat-card"
          style={{
            background: "#ffffff",
            padding: "20px",
            borderRadius: "12px",
            textAlign: "center",
            boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
          }}
        >
          <h3
            style={{
              marginTop: 0,
              color: "#1f3c88",
            }}
          >
            Status
          </h3>

          <div
            style={{
              color: "#2e7d32",
              fontWeight: 700,
              fontSize: "22px",
            }}
          >
            Active
          </div>
        </div>
      </section>

     <TeacherAnnouncementBanner teacherId={teacherId} />

     <TeacherMessageNotifications teacherId={teacherId} />

     <FridayAt6DutyCard duty={fridayAt6Duty} />

     <FridayExamPracticeCard sessions={fridayExamPracticeSessions} />

     <TeacherCalendarAgenda />

     <TodaySchedule classes={classes} /> 

      {/* LOGOUT */}

      <button
        onClick={handleLogout}
        style={{
          background: "#d32f2f",
          color: "#ffffff",
          border: "none",
          padding: "10px 20px",
          borderRadius: "8px",
          cursor: "pointer",
          fontWeight: 600,
          marginTop: "10px",
        }}
      >
        Logout
      </button>
     </div>
    </TeacherLayout>
  );
}
