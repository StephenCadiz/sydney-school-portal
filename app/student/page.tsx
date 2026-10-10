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
import { getStudentFacingTeacherName } from "../../lib/studentTeacherDisplay";
import { normalizeHomeworkSkill } from "../../lib/homework";
import {
  getEligibleProgressHomeworkResults,
  getEmptyFridayTutorialProgressSummary,
  getStudentFridayTutorialProgress,
  getStudentProgressData,
  toResultNumber,
} from "../../lib/progress";
import type { FridayTutorialProgressSummary } from "../../lib/fridayTutorialResults";

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

function formatClockTime(value: string | null | undefined) {
  const normalized = String(value ?? "").trim();
  const match = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(normalized);

  if (!match) return normalized;

  return `${match[1].padStart(2, "0")}:${match[2]}`;
}

function formatTeacherFirstName(value: string) {
  return String(value || "-").trim().split(/\s+/)[0] || "-";
}

type DashboardProgressSkill = {
  key: string;
  label: string;
  average: number | null;
  count: number;
};

type DashboardProgress = {
  overall: number | null;
  totalCount: number;
  skills: DashboardProgressSkill[];
};

function buildDashboardProgress(
  progressData: Awaited<ReturnType<typeof getStudentProgressData>>,
  fridayTutorialProgress: FridayTutorialProgressSummary,
  level: string
): DashboardProgress {
  const valuesBySkill = new Map<string, number[]>();
  const addValue = (skill: string, value: number | null, count = 1) => {
    if (value === null || !Number.isFinite(value)) return;

    const values = valuesBySkill.get(skill) || [];
    for (let index = 0; index < count; index += 1) {
      values.push(value);
    }
    valuesBySkill.set(skill, values);
  };

  getEligibleProgressHomeworkResults(
    progressData.results || [],
    progressData.homework_release_metadata || []
  ).forEach((result) => {
    addValue(
      normalizeHomeworkSkill(result.skill),
      toResultNumber(result.percentage)
    );
  });

  fridayTutorialProgress.averages.forEach((item) => {
    addValue(
      normalizeHomeworkSkill(item.practice_label),
      toResultNumber(item.average),
      Number(item.count) || 1
    );
  });

  const readingLabel = level.toUpperCase() === "B1"
    ? "Reading"
    : "Reading and Use of English";
  const skillDefinitions = [
    { key: "reading", label: readingLabel },
    { key: "listening", label: "Listening" },
    { key: "writing", label: "Writing" },
    { key: "speaking", label: "Speaking" },
  ];
  const skills = skillDefinitions
    .filter(({ key }) => key !== "speaking" || valuesBySkill.has(key))
    .map(({ key, label }) => {
      const values = valuesBySkill.get(key) || [];
      return {
        key,
        label,
        average:
          values.length > 0
            ? values.reduce((total, value) => total + value, 0) / values.length
            : null,
        count: values.length,
      };
    });
  const allValues = Array.from(valuesBySkill.values()).flat();

  return {
    overall:
      allValues.length > 0
        ? allValues.reduce((total, value) => total + value, 0) / allValues.length
        : null,
    totalCount: allValues.length,
    skills,
  };
}

function DashboardProgressCard({
  progress,
  loading,
}: {
  progress: DashboardProgress | null;
  loading: boolean;
}) {
  return (
    <section
      className="student-pwa-progress-card"
      aria-labelledby="student-pwa-progress-title"
    >
      <div className="student-pwa-progress-card-heading">
        <div>
          <span>Progress</span>
          <h2 id="student-pwa-progress-title">Your exam progress</h2>
          <p>Homework and Friday Tutorial results together.</p>
        </div>
        <div className="student-pwa-progress-overall" aria-label="Overall progress">
          <span>Overall</span>
          <strong>
            {progress?.overall === null || progress?.overall === undefined
              ? "—"
              : `${Math.round(progress.overall)}%`}
          </strong>
        </div>
      </div>

      {loading ? (
        <p className="student-pwa-progress-empty">Loading progress…</p>
      ) : !progress || progress.totalCount === 0 ? (
        <p className="student-pwa-progress-empty">
          Your graph will appear after your first graded result.
        </p>
      ) : (
        <div
          className="student-pwa-progress-graph"
          role="list"
          aria-label="Progress by skill"
        >
          {progress.skills.map((skill) => {
            const value =
              skill.average === null
                ? 0
                : Math.max(0, Math.min(100, skill.average));

            return (
              <div
                className="student-pwa-progress-graph-row"
                key={skill.key}
                role="listitem"
              >
                <div className="student-pwa-progress-graph-label">
                  <span>{skill.label}</span>
                  <strong>
                    {skill.average === null
                      ? "—"
                      : `${Math.round(skill.average)}%`}
                  </strong>
                </div>
                <div
                  className="student-pwa-progress-graph-track"
                  role="meter"
                  aria-label={`${skill.label} progress`}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={
                    skill.average === null ? 0 : Math.round(skill.average)
                  }
                >
                  <span style={{ width: `${value}%` }} />
                </div>
                <small>
                  {skill.count} result{skill.count === 1 ? "" : "s"}
                </small>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

export default function StudentDashboard() {
  const [studentName, setStudentName] = useState("");
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
  const [dashboardProgress, setDashboardProgress] = useState<DashboardProgress | null>(null);
  const [dashboardProgressLoading, setDashboardProgressLoading] = useState(true);
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
        setStudentName(
          user.display_name ||
            [user.first_name, user.last_name]
              .map((value) => String(value || "").trim())
              .filter(Boolean)
              .join(" ")
        );
        setTeacherName(
          getStudentFacingTeacherName(
            teacher,
            courseInfo.classroom?.is_cambridge === true
          )
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
            ? `${formatClockTime(classroom.start_time)}–${formatClockTime(classroom.end_time)}`
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

        const installedPwa =
          window.matchMedia("(display-mode: standalone)").matches ||
          Boolean(
            (window.navigator as Navigator & { standalone?: boolean }).standalone
          );

        if (installedPwa) {
          const [progressData, fridayTutorialProgress] = await Promise.all([
            getStudentProgressData().catch((progressError) => {
              console.error("Unable to load dashboard progress:", progressError);
              return null;
            }),
            getStudentFridayTutorialProgress().catch((tutorialError) => {
              console.error(
                "Unable to load dashboard Friday Tutorial progress:",
                tutorialError
              );
              return getEmptyFridayTutorialProgressSummary();
            }),
          ]);

          if (progressData) {
            setDashboardProgress(
              buildDashboardProgress(
                progressData,
                fridayTutorialProgress,
                courseInfo.level
              )
            );
          }
        }
        setDashboardProgressLoading(false);

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
        setDashboardProgressLoading(false);
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
        <section className="student-dashboard-hero student-portal-header">
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
              {studentName ? `Welcome back, ${studentName}` : loading ? "Loading your profile…" : "Welcome back"}
            </h1>

            <p>
              Your {level} course at a glance.
            </p>

            <div
              className="student-pwa-dashboard-course-summary"
              aria-label="Current course summary"
            >
              <span>{level !== "-" ? `${level} Course` : "Course"}</span>
              <span>Teacher: {formatTeacherFirstName(teacherName)}</span>
              {classSchedule !== "-" && (
                <span>{formatSchedule(classSchedule)}</span>
              )}
            </div>
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

        <DashboardProgressCard
          progress={dashboardProgress}
          loading={dashboardProgressLoading}
        />

        <section
          className={`student-course-access-section${
            isOnlineCourse ? "" : " student-dashboard-materials-only"
          }`}
        >
          <div className="student-dashboard-access-list">
            <Link
              href="/student/resources"
              className="student-dashboard-access-card student-dashboard-course-materials-card"
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
