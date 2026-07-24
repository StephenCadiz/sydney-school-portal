"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import TeacherLayout from "../components/layout/TeacherLayout";
import TeacherCalendarAgenda from "../components/teacher/TeacherCalendarAgenda";
import TeacherMessageNotifications from "../components/teacher/TeacherMessageNotifications";
import TeacherAnnouncementBanner from "../components/teacher/TeacherAnnouncementBanner";
import FridayExamPracticeCard from "../components/teacher/FridayExamPracticeCard";
import FridayAt6DutyCard from "../components/teacher/FridayAt6DutyCard";
import { supabase } from "../../lib/supabase";
import {
  getFridayAt6DutyForDate,
  getFridayExamPracticeSessionsForDate,
} from "../../lib/fridayExamPractice";

const tools = [
  {
    icon: "users",
    title: "Aqadem",
    description: "Student administration platform",
    href: "https://sydneyschool.aqadem.com/profesores",
    external: true,
  },
  {
    icon: "book",
    title: "Cambridge One",
    description: "Cambridge course materials and digital resources",
    href: "https://www.cambridgeone.org/",
    external: true,
  },
  {
    icon: "folder",
    title: "Teacher Resources",
    description: "Teaching materials and shared resources",
    href: "/teacher/resources",
    external: false,
  },
];

function ToolIcon({ name }: { name: string }) {
  const commonProps = {
    "aria-hidden": true,
    width: 18,
    height: 18,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };

  if (name === "users") {
    return (
      <svg {...commonProps}>
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    );
  }

  if (name === "book") {
    return (
      <svg {...commonProps}>
        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
        <path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15Z" />
      </svg>
    );
  }

  return (
    <svg {...commonProps}>
      <path d="M3 7h5l2 2h11v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" />
      <path d="M3 7V5a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v2" />
    </svg>
  );
}

function getLocalDateString(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getMadridHeader(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Madrid",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const hour = Number(values.hour || 12);
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  return {
    greeting,
    date: `${values.weekday || ""}, ${values.day || ""} ${values.month || ""} ${
      values.year || ""
    }`.trim(),
  };
}

export default function TeacherPage() {
  const router = useRouter();
  const [teacherName, setTeacherName] = useState("");
  const [teacherId, setTeacherId] = useState("");
  const [classroom, setClassroom] = useState<{
    name: string;
    logo: string;
  } | null>(null);
  const [fridayExamPracticeSessions, setFridayExamPracticeSessions] =
    useState<any[]>([]);
  const [fridayAt6Duty, setFridayAt6Duty] = useState<any | null>(null);
  const [currentTime, setCurrentTime] = useState(() => new Date());
  const header = getMadridHeader(currentTime);

  useEffect(() => {
    const timer = window.setInterval(() => setCurrentTime(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

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
        .select("first_name, last_name, role")
        .eq("id", session.user.id)
        .single();

      if (profile.data?.role !== "teacher") {
        router.push("/login");
        return;
      }

      setTeacherName(
        `${profile.data.first_name || ""} ${profile.data.last_name || ""}`.trim()
      );
      setTeacherId(session.user.id);

      const teacherClasses = await supabase
        .from("classes")
        .select(`
          id,
          classrooms (
            id,
            name,
            logo,
            theme_colour
          )
        `)
        .eq("teacher_id", session.user.id);

      if (teacherClasses.error) {
        console.error(
          "Unable to load teacher classroom identity:",
          teacherClasses.error
        );
        setClassroom(null);
      } else {
        const assignedClassroom = (teacherClasses.data?.[0] as any)?.classrooms;
        setClassroom(
          assignedClassroom?.name && assignedClassroom?.logo
            ? {
                name: assignedClassroom.name,
                logo: assignedClassroom.logo,
              }
            : null
        );
      }

      try {
        const today = getLocalDateString();
        const [examPracticeSessions, duty] = await Promise.all([
          getFridayExamPracticeSessionsForDate(today),
          getFridayAt6DutyForDate(today),
        ]);

        setFridayExamPracticeSessions(examPracticeSessions);
        setFridayAt6Duty(duty?.teacher_id === session.user.id ? duty : null);
      } catch (error) {
        console.error("Unable to load Friday @ 6 dashboard items:", error);
        setFridayExamPracticeSessions([]);
        setFridayAt6Duty(null);
      }
    }

    loadData();
  }, [router]);

  return (
    <TeacherLayout>
      <main className="teacher-dashboard-page">
        <header className="teacher-dashboard-header">
          <div className="teacher-dashboard-header-copy">
            <h1>
              {header.greeting}
              {teacherName ? `, ${teacherName.split(" ")[0]}` : ""}
            </h1>
            <p>{header.date}</p>
            <span>Your teaching workspace</span>
          </div>

          {classroom && (
            <div className="teacher-dashboard-classroom-identity">
              <Image
                src={classroom.logo}
                alt=""
                width={56}
                height={56}
              />
              <strong>{classroom.name}</strong>
            </div>
          )}
        </header>

        <div className="teacher-dashboard-feed">
          <TeacherAnnouncementBanner teacherId={teacherId} />
          <TeacherMessageNotifications teacherId={teacherId} />
          <FridayAt6DutyCard duty={fridayAt6Duty} />
          <FridayExamPracticeCard sessions={fridayExamPracticeSessions} />
          <TeacherCalendarAgenda />
        </div>

        <section className="teacher-dashboard-tools" aria-labelledby="teacher-tools-heading">
          <div className="teacher-dashboard-section-title">
            <h2 id="teacher-tools-heading">Tools</h2>
          </div>
          <div className="teacher-dashboard-tool-list">
            {tools.map((tool) =>
              tool.external ? (
                <a
                  key={tool.title}
                  className="teacher-dashboard-tool-row"
                  href={tool.href}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <span className="teacher-dashboard-tool-icon">
                    <ToolIcon name={tool.icon} />
                  </span>
                  <span className="teacher-dashboard-tool-copy">
                    <strong>{tool.title}</strong>
                    <small>{tool.description}</small>
                  </span>
                  <span aria-hidden="true">›</span>
                </a>
              ) : (
                <Link
                  key={tool.title}
                  className="teacher-dashboard-tool-row"
                  href={tool.href}
                >
                  <span className="teacher-dashboard-tool-icon">
                    <ToolIcon name={tool.icon} />
                  </span>
                  <span className="teacher-dashboard-tool-copy">
                    <strong>{tool.title}</strong>
                    <small>{tool.description}</small>
                  </span>
                  <span aria-hidden="true">›</span>
                </Link>
              )
            )}
          </div>
        </section>
      </main>
    </TeacherLayout>
  );
}
