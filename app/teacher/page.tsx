"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import TeacherLayout from "../components/layout/TeacherLayout";
import TeacherCalendarAgenda from "../components/teacher/TeacherCalendarAgenda";
import TeacherMessageNotifications from "../components/teacher/TeacherMessageNotifications";
import TeacherAnnouncementBanner from "../components/teacher/TeacherAnnouncementBanner";
import FridayExamPracticeCard from "../components/teacher/FridayExamPracticeCard";
import FridayAt6DutyCard from "../components/teacher/FridayAt6DutyCard";
import FridayTutorialAttendanceCard from "../components/teacher/FridayTutorialAttendanceCard";
import TeacherWorkingDayPanel from "../components/teacher/TeacherWorkingDayPanel";
import { supabase } from "../../lib/supabase";
import {
  getFridayAt6DutyTypesForTeacher,
} from "../../lib/fridayTutorials";

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

function ToolIcon({ name, size = 18 }: { name: string; size?: number }) {
  const commonProps = {
    "aria-hidden": true,
    width: size,
    height: size,
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

  if (name === "envelope") {
    return (
      <svg {...commonProps}>
        <rect width="20" height="16" x="2" y="4" rx="2" />
        <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
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

export default function TeacherPage() {
  const router = useRouter();
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
        .select("first_name, last_name, role")
        .eq("id", session.user.id)
        .single();

      if (profile.data?.role !== "teacher") {
        router.push("/login");
        return;
      }

      setTeacherId(session.user.id);

      try {
        const noticeResponse = await fetch("/api/teacher/friday-tutorial-notices", {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        });

        const noticeResult = await noticeResponse.json();
        if (!noticeResponse.ok) {
          throw new Error(
            noticeResult.error || "Unable to load Friday Tutorial notices."
          );
        }

        const duty = noticeResult.duty || null;
        const dutyTypes = getFridayAt6DutyTypesForTeacher(
          duty,
          session.user.id,
          duty?.tutorial_group
        );

        setFridayExamPracticeSessions(noticeResult.notices || []);
        setFridayAt6Duty(
          !noticeResult.school_closed && dutyTypes.length > 0
            ? {
                ...duty,
                duty_types: dutyTypes,
              }
            : null
        );
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
      {() => (
      <main className="teacher-dashboard-page">
        <div className="teacher-dashboard-primary-grid">
          <TeacherWorkingDayPanel />
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

        <div className="teacher-dashboard-feed">
          <TeacherAnnouncementBanner teacherId={teacherId} />
          <TeacherMessageNotifications teacherId={teacherId} />
          <FridayAt6DutyCard duty={fridayAt6Duty} />
          <FridayTutorialAttendanceCard />
          <FridayExamPracticeCard sessions={fridayExamPracticeSessions} />
        </div>
      </main>
      )}
    </TeacherLayout>
  );
}
