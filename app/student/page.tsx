"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";

import StudentMenu from "./StudentMenu";
import {
  getCurrentStudentCourseInfo,
  getCurrentTeacher,
  getCurrentUser,
} from "../../lib/user";
import {
  getUnreadMessagesForStudent,
} from "../../lib/studentNotifications";
import { supabase } from "../../lib/supabase";
import StudentAnnouncementBanner from "../components/student/StudentAnnouncementBanner";
import StudentFridayTutorialReminder from "../components/student/StudentFridayTutorialReminder";
import { NO_CURRENT_ACADEMIC_YEAR_CLASS_MESSAGE } from "../../lib/academicYearRules";

function formatCourseType(courseType: string) {
  if (!courseType) return "-";

  return courseType.charAt(0).toUpperCase() + courseType.slice(1);
}

function formatDateOnly(date: string | null | undefined) {
  if (!date) return "-";

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);

  if (!match) return date;

  return new Date(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3])
  ).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  });
}

const cardStyle = {
  background: "var(--ss-card-bg)",
  border: "1px solid var(--ss-border)",
  borderRadius: "14px",
  padding: "24px",
  boxShadow: "0 10px 26px rgba(31,60,136,0.07)",
};

function formatSchedule(value: string) {
  return value.replace(" - ", " · ");
}

export default function StudentDashboard() {
  const [studentName, setStudentName] = useState("Student");
  const [teacherName, setTeacherName] = useState("-");
  const [level, setLevel] = useState("-");
  const [courseType, setCourseType] = useState("-");
  const [className, setClassName] = useState("-");
  const [classId, setClassId] = useState("");
  const [studentId, setStudentId] = useState("");
  const [classSchedule, setClassSchedule] = useState("-");
  const [classroomName, setClassroomName] = useState("-");
  const [classroomLogo, setClassroomLogo] = useState("/Emu Logo.png");
  const [meetLink, setMeetLink] = useState("");
  const [currentHomework, setCurrentHomework] = useState<any[]>([]);
  const [unreadHomeworkCount, setUnreadHomeworkCount] = useState(0);
  const [unreadMessageCount, setUnreadMessageCount] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadDashboard() {
      try {
        const user = await getCurrentUser();
        const teacher = await getCurrentTeacher();
        const courseInfo = await getCurrentStudentCourseInfo();

        setStudentId(user.id);

        const { data: profile } = await supabase
          .from("profiles")
          .select("first_name")
          .eq("id", user.id)
          .single();

        setStudentName(profile?.first_name || "Student");
        setTeacherName(
          `${teacher.first_name || ""} ${
            teacher.last_name || ""
          }`.trim()
        );
        setLevel(courseInfo.level);
        setCourseType(courseInfo.courseType);

        const classroom = courseInfo.classroom;
        const classroomDetails = courseInfo.classroomDetails;
        const isOnlineClass =
          String(courseInfo.courseType ?? "").trim().toLowerCase() ===
          "online";
        const timeSlot =
          classroom.start_time && classroom.end_time
            ? `${classroom.start_time}-${classroom.end_time}`
            : "";

        setClassName(classroom.class_name || courseInfo.level || "-");
        setClassId(classroom.id || "");
        setClassroomName(
          isOnlineClass
            ? "Online Class"
            : classroomDetails?.name || classroom.class_name || "-"
        );
        setClassroomLogo(
          isOnlineClass
            ? "/On-Line Logo.png"
            : classroomDetails?.logo || "/Emu Logo.png"
        );
        setClassSchedule(
          [classroom.days, timeSlot].filter(Boolean).join(" - ") ||
            "-"
        );
        setMeetLink(String(classroom.meet_link ?? "").trim());

        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!session?.access_token) throw new Error("Your session has expired.");
        const homeworkResponse = await fetch("/api/student/homework?summary=1", {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        const homeworkPayload = await homeworkResponse.json().catch(() => ({}));
        if (!homeworkResponse.ok) {
          throw new Error(homeworkPayload.error || "Unable to load homework.");
        }
        setCurrentHomework(
          (homeworkPayload.homework || [])
            .filter((item: any) => item.status === "Current")
            .slice(0, 4)
        );

        const unreadMessages = await getUnreadMessagesForStudent(
          user.id,
          teacher.id
        );

        setUnreadHomeworkCount(Number(homeworkPayload.unread_count || 0));
        setUnreadMessageCount(unreadMessages.length);
      } catch (error) {
        console.error("Unable to load student dashboard:", error);
        setError(
          error instanceof Error &&
            error.message === NO_CURRENT_ACADEMIC_YEAR_CLASS_MESSAGE
            ? NO_CURRENT_ACADEMIC_YEAR_CLASS_MESSAGE
            : "Unable to load all dashboard information."
        );
      } finally {
        setLoading(false);
      }
    }

    loadDashboard();
  }, []);

  const isOnlineCourse =
    String(courseType ?? "").trim().toLowerCase() === "online";
  const hasCurrentHomework = currentHomework.length > 0;

  return (
    <div
      className="student-layout-shell"
      style={{
        display: "flex",
        minHeight: "100vh",
        background: "#f5f7fa",
      }}
    >
      <div className="student-mobile-topbar">
        <div className="student-mobile-topbar-title">Sydney School / Student</div>
        <button
          type="button"
          className="mobile-menu-button"
          aria-label="Open student menu"
          onClick={() => setMenuOpen(true)}
        >
          Menu
        </button>
      </div>

      {menuOpen && (
        <button
          type="button"
          aria-label="Close student menu"
          className="student-mobile-overlay"
          onClick={() => setMenuOpen(false)}
        />
      )}

      <div className={`student-mobile-drawer ${menuOpen ? "open" : ""}`}>
        <StudentMenu mobileMode onClose={() => setMenuOpen(false)} />
      </div>

      <aside className="student-desktop-sidebar">
        <StudentMenu />
      </aside>

      <main
        className="student-main-content student-dashboard-page"
        style={{
          flex: 1,
          padding: "40px",
        }}
      >
        <section className="student-dashboard-hero">
          <div className="student-dashboard-hero-inner">
            <Image
              className="student-dashboard-logo"
              src="/LOGO and NAME.png"
              alt="Sydney School"
              width={230}
              height={80}
              priority
            />

            <h1>
              Welcome back, {studentName}
            </h1>

            <p>
              Your {level} course at a glance.
            </p>
          </div>

          {!loading && unreadHomeworkCount === 0 && unreadMessageCount === 0 && (
            <div className="student-dashboard-up-to-date">
              <span aria-hidden="true">✓</span>
              You&apos;re up to date
            </div>
          )}
        </section>

        {error && (
          <section
            style={{
              ...cardStyle,
              marginBottom: "24px",
              color: "#b00020",
              fontWeight: 600,
            }}
          >
            {error}
          </section>
        )}

        <StudentFridayTutorialReminder />

        <StudentAnnouncementBanner
          userId={studentId}
          studentLevel={level}
          classId={classId}
        />

        {!loading && (unreadHomeworkCount > 0 || unreadMessageCount > 0) && (
          <section className="student-dashboard-alerts" aria-label="Notifications">
            {unreadHomeworkCount > 0 && (
              <div className="student-dashboard-notification-row">
                <div>
                  <strong>New homework available</strong>
                  <span>
                    {unreadHomeworkCount} item
                    {unreadHomeworkCount === 1 ? "" : "s"} to review
                  </span>
                </div>

                <Link
                  className="student-dashboard-action-link"
                  href="/student/homework"
                >
                  View Homework
                </Link>
              </div>
            )}

            {unreadMessageCount > 0 && (
              <div className="student-dashboard-notification-row">
                <div>
                  <strong>New message from your teacher</strong>
                  <span>
                    {unreadMessageCount} unread message
                    {unreadMessageCount === 1 ? "" : "s"}
                  </span>
                </div>

                <Link
                  className="student-dashboard-action-link"
                  href="/student/messages"
                >
                  View Messages
                </Link>
              </div>
            )}
          </section>
        )}

        <section className="student-course-card">
          <div className="student-dashboard-course-image">
            <Image
              src={classroomLogo}
              alt={classroomName}
              width={104}
              height={104}
            />
          </div>

          <div className="student-course-card-content">
            <div className="student-course-card-heading">
              <span>Your Course</span>
              <h2>{level} {formatCourseType(courseType)}</h2>
            </div>

            <div className="student-course-meta-grid">
              <div>
                <span>Teacher</span>
                <strong>{teacherName}</strong>
              </div>

              <div>
                <span>Schedule</span>
                <strong>{formatSchedule(classSchedule)}</strong>
              </div>

              <div>
                <span>Classroom</span>
                <strong>
                  {classroomName || className}
                </strong>
              </div>
            </div>
          </div>
        </section>

        <section className="student-current-homework-card">
          <div className="student-dashboard-section-heading">
            <span>Current Homework</span>
          </div>

          {loading ? (
            <p className="student-dashboard-empty">
              Loading homework...
            </p>
          ) : !hasCurrentHomework ? (
            <p className="student-dashboard-empty">
              No homework has been posted yet.
            </p>
          ) : (
            <div className="student-dashboard-homework-list">
              {currentHomework.map((item) => {
                const skillLabel =
                  item.source === "assignment"
                    ? item.part.label
                    : String(item.skill || "");
                const homeworkTitle =
                  item.source === "assignment"
                    ? `Exam ${item.exam.number} · ${item.part.label}`
                    : item.title || `Week ${item.week_number} Homework`;

                return (
                  <div className="student-dashboard-homework-row" key={`${item.source}-${item.id}`}>
                    <div>
                      <strong>{homeworkTitle}</strong>

                      <div className="student-dashboard-homework-meta">
                        {skillLabel && <span>{skillLabel}</span>}
                        <span>
                          Released {formatDateOnly(item.release_date)} · Due{" "}
                          {formatDateOnly(item.due_date)}
                        </span>
                        <span
                          className="student-homework-status is-current"
                        >
                          Current
                        </span>
                      </div>
                    </div>

                    <Link
                      className="student-dashboard-subtle-link student-dashboard-homework-view"
                      href="/student/homework"
                    >
                      Open →
                    </Link>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section className="student-course-access-section">
          <div className="student-dashboard-access-list">
            <Link
              href="/student/resources"
              className="student-dashboard-access-card"
            >
              <div>
                <h3>Course Materials</h3>
                <p>Books, worksheets and learning resources.</p>
              </div>

              <span>Open →</span>
            </Link>

            {isOnlineCourse && (
              <div className="student-dashboard-access-card">
                <div>
                  <h3>Online Class</h3>
                  <p>
                    {meetLink
                      ? "Join your online class using the Google Meet link."
                      : "The Google Meet link has not been added yet."}
                  </p>
                </div>

                {meetLink && (
                  <a
                    href={meetLink}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Join →
                  </a>
                )}
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
