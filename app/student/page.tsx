"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";

import StudentMenu from "./StudentMenu";
import {
  adjustHomeworkDatesForClassDays,
  getHomework,
  getHomeworkSkillLabel,
} from "../../lib/homework";
import {
  getCurrentStudentCourseInfo,
  getCurrentTeacher,
  getCurrentUser,
} from "../../lib/user";
import {
  getUnreadHomeworkForStudent,
  getUnreadMessagesForStudent,
} from "../../lib/studentNotifications";
import { supabase } from "../../lib/supabase";
import StudentAnnouncementBanner from "../components/student/StudentAnnouncementBanner";

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
  background: "#ffffff",
  border: "1px solid #e6eaf2",
  borderRadius: "12px",
  padding: "22px",
  boxShadow: "0 6px 18px rgba(31,60,136,0.06)",
};

const actionButtonStyle = {
  display: "inline-block",
  background: "#1f3c88",
  color: "#ffffff",
  borderRadius: "8px",
  padding: "10px 16px",
  fontWeight: 700,
  textDecoration: "none",
  marginTop: "16px",
};

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
  const [classroomThemeColour, setClassroomThemeColour] =
    useState("#1f3c88");
  const [meetLink, setMeetLink] = useState("");
  const [currentHomework, setCurrentHomework] = useState<any[]>([]);
  const [unreadHomeworkCount, setUnreadHomeworkCount] = useState(0);
  const [unreadMessageCount, setUnreadMessageCount] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

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
        setClassroomThemeColour(
          isOnlineClass
            ? "#1f3c88"
            : classroomDetails?.theme_colour || "#1f3c88"
        );
        setClassSchedule(
          [classroom.days, timeSlot].filter(Boolean).join(" - ") ||
            "-"
        );
        setMeetLink(String(classroom.meet_link ?? "").trim());

        const homeworkData = await getHomework(
          courseInfo.level,
          courseInfo.courseType
        );
        const adjustedHomework = adjustHomeworkDatesForClassDays(
          homeworkData,
          courseInfo.classroom.days
        );
        setCurrentHomework(adjustedHomework.slice(0, 4));

        const homeworkIds = adjustedHomework.map((item) => item.id);
        const unreadHomeworkIds = await getUnreadHomeworkForStudent(
          user.id,
          homeworkIds
        );

        const unreadMessages = await getUnreadMessagesForStudent(
          user.id,
          teacher.id
        );

        setUnreadHomeworkCount(unreadHomeworkIds.length);
        setUnreadMessageCount(unreadMessages.length);
      } catch (error) {
        console.error("Unable to load student dashboard:", error);
        setError(true);
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
        className="student-main-content"
        style={{
          flex: 1,
          padding: "40px",
        }}
      >
        <section
          className="student-dashboard-hero"
          style={{
            background: "#ffffff",
            borderRadius: "18px",
            padding: "32px",
            marginBottom: "24px",
            border: "1px solid #e6eaf2",
            boxShadow: "0 10px 28px rgba(31,60,136,0.08)",
            display: "grid",
            gridTemplateColumns: "minmax(0, 1fr) 170px",
            gap: "28px",
            alignItems: "center",
            borderLeft: `8px solid ${classroomThemeColour}`,
          }}
        >
          <div className="student-dashboard-hero-inner">
            <Image
              className="student-dashboard-logo"
              src="/LOGO and NAME.png"
              alt="Sydney School"
              width={230}
              height={80}
              priority
              style={{
                width: "230px",
                height: "auto",
                marginBottom: "24px",
              }}
            />

            <h1
              style={{
                color: "#1f3c88",
                margin: 0,
                fontSize: "36px",
                lineHeight: 1.15,
              }}
            >
              Welcome back, {studentName}
            </h1>

            <p
              style={{
                color: "#667085",
                margin: "10px 0 0",
                fontSize: "17px",
              }}
            >
              Here is your latest course information.
            </p>
          </div>

          <div
            className="student-dashboard-classroom-image"
            style={{
              justifySelf: "center",
              background: "#f5f7fa",
              borderRadius: "16px",
              padding: "18px",
              border: "1px solid #e6eaf2",
            }}
          >
            <Image
              src={classroomLogo}
              alt={classroomName}
              width={130}
              height={130}
              style={{
                width: "130px",
                height: "130px",
                objectFit: "contain",
              }}
            />
          </div>
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
            Unable to load all dashboard information.
          </section>
        )}

        <StudentAnnouncementBanner
          userId={studentId}
          studentLevel={level}
          classId={classId}
        />

        <section
          style={{
            ...cardStyle,
            borderLeft: "4px solid #1f3c88",
            marginBottom: "24px",
            padding: "24px",
          }}
        >
          <h2
            style={{
              color: "#1f3c88",
              margin: "0 0 14px",
              fontSize: "20px",
            }}
          >
            Notifications
          </h2>

          {loading ? (
            <p style={{ color: "#667085", margin: 0 }}>
              Loading notifications...
            </p>
          ) : unreadHomeworkCount === 0 && unreadMessageCount === 0 ? (
            <p style={{ color: "#287a45", margin: 0, fontWeight: 600 }}>
              You are up to date.
            </p>
          ) : (
            <div
              style={{
                display: "grid",
                gap: "12px",
              }}
            >
              {unreadHomeworkCount > 0 && (
                <div
                  className="student-dashboard-notification-row"
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: "16px",
                    alignItems: "center",
                    background: "#f8fafd",
                    border: "1px solid #e6eaf2",
                    borderRadius: "10px",
                    padding: "14px",
                  }}
                >
                  <div>
                    <strong style={{ color: "#333" }}>
                      New homework available
                    </strong>
                    <div
                      style={{
                        color: "#667085",
                        fontSize: "14px",
                        marginTop: "4px",
                      }}
                    >
                      {unreadHomeworkCount} item
                      {unreadHomeworkCount === 1 ? "" : "s"} to review
                    </div>
                  </div>

                  <Link
                    className="student-dashboard-action-button"
                    href="/student/homework"
                    style={{
                      color: "#1f3c88",
                      fontWeight: 700,
                      textDecoration: "none",
                      whiteSpace: "nowrap",
                    }}
                  >
                    View Homework →
                  </Link>
                </div>
              )}

              {unreadMessageCount > 0 && (
                <div
                  className="student-dashboard-notification-row"
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: "16px",
                    alignItems: "center",
                    background: "#f8fafd",
                    border: "1px solid #e6eaf2",
                    borderRadius: "10px",
                    padding: "14px",
                  }}
                >
                  <div>
                    <strong style={{ color: "#333" }}>
                      New message from your teacher
                    </strong>
                    <div
                      style={{
                        color: "#667085",
                        fontSize: "14px",
                        marginTop: "4px",
                      }}
                    >
                      {unreadMessageCount} unread message
                      {unreadMessageCount === 1 ? "" : "s"}
                    </div>
                  </div>

                  <Link
                    className="student-dashboard-action-button"
                    href="/student/messages"
                    style={{
                      color: "#1f3c88",
                      fontWeight: 700,
                      textDecoration: "none",
                      whiteSpace: "nowrap",
                    }}
                  >
                    View Messages →
                  </Link>
                </div>
              )}
            </div>
          )}
        </section>

        <section
          className="student-course-card"
          style={{
            ...cardStyle,
            marginBottom: "26px",
            display: "grid",
            gridTemplateColumns: "140px minmax(0, 1fr)",
            gap: "24px",
            alignItems: "center",
            borderTop: `5px solid ${classroomThemeColour}`,
          }}
        >
          <div
            className="student-dashboard-course-image"
            style={{
              background: "#f5f7fa",
              borderRadius: "14px",
              padding: "14px",
              textAlign: "center",
            }}
          >
            <Image
              src={classroomLogo}
              alt={classroomName}
              width={110}
              height={110}
              style={{
                width: "110px",
                height: "110px",
                objectFit: "contain",
              }}
            />
          </div>

          <div>
            <h2
              style={{
                color: "#1f3c88",
                margin: "0 0 16px",
                fontSize: "22px",
              }}
            >
              Your Course
            </h2>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                gap: "16px",
                color: "#333",
              }}
            >
              <div>
                <div
                  style={{
                    color: "#667085",
                    fontSize: "13px",
                    marginBottom: "6px",
                  }}
                >
                  Course
                </div>
                <strong style={{ color: "#1f3c88", fontSize: "22px" }}>
                  {level} {formatCourseType(courseType)}
                </strong>
              </div>

              <div>
                <div
                  style={{
                    color: "#667085",
                    fontSize: "13px",
                    marginBottom: "6px",
                  }}
                >
                  Teacher
                </div>
                <strong style={{ color: "#1f3c88" }}>{teacherName}</strong>
              </div>

              <div>
                <div
                  style={{
                    color: "#667085",
                    fontSize: "13px",
                    marginBottom: "6px",
                  }}
                >
                  Days and Time
                </div>
                <strong style={{ color: "#1f3c88" }}>{classSchedule}</strong>
              </div>

              <div>
                <div
                  style={{
                    color: "#667085",
                    fontSize: "13px",
                    marginBottom: "6px",
                  }}
                >
                  Classroom
                </div>
                <strong style={{ color: "#1f3c88" }}>
                  {classroomName || className}
                </strong>
              </div>
            </div>
          </div>
        </section>

        <section
          className="student-current-homework-card"
          style={{
            ...cardStyle,
            marginBottom: "26px",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: "16px",
              alignItems: "center",
              marginBottom: "18px",
            }}
          >
            <div>
              <h2
                style={{
                  color: "#1f3c88",
                  margin: "0 0 6px",
                  fontSize: "22px",
                }}
              >
                Current Homework
              </h2>

              <p
                style={{
                  color: "#667085",
                  margin: 0,
                  fontSize: "14px",
                }}
              >
                Recent homework posted for your course.
              </p>
            </div>

            <Link
              href="/student/homework"
              style={{
                color: "#1f3c88",
                fontWeight: 700,
                textDecoration: "none",
                whiteSpace: "nowrap",
              }}
            >
              Open Homework →
            </Link>
          </div>

          {loading ? (
            <p style={{ color: "#667085", margin: 0 }}>
              Loading homework...
            </p>
          ) : !hasCurrentHomework ? (
            <p style={{ color: "#667085", margin: 0 }}>
              No homework has been posted yet.
            </p>
          ) : (
            <div
              style={{
                display: "grid",
                gap: "12px",
              }}
            >
              {currentHomework.map((item) => {
                const skillLabel = getHomeworkSkillLabel(
                  level,
                  item.homework_skill
                );

                return (
                  <div
                    className="student-dashboard-homework-row"
                    key={item.id}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "minmax(0, 1fr) auto",
                      gap: "16px",
                      alignItems: "center",
                      background: "#f8fafd",
                      border: "1px solid #e6eaf2",
                      borderRadius: "10px",
                      padding: "14px",
                    }}
                  >
                    <div>
                      <strong
                        style={{
                          color: "#1f3c88",
                          display: "block",
                          marginBottom: "6px",
                        }}
                      >
                        {item.title || "Homework"}
                      </strong>

                      <div
                        style={{
                          color: "#667085",
                          fontSize: "14px",
                          display: "flex",
                          flexWrap: "wrap",
                          gap: "10px",
                        }}
                      >
                        {skillLabel && <span>{skillLabel}</span>}
                        <span>Release: {formatDateOnly(item.release_date)}</span>
                        <span>Due: {formatDateOnly(item.due_date)}</span>
                      </div>
                    </div>

                    <Link
                      className="student-dashboard-action-button student-dashboard-homework-view"
                      href="/student/homework"
                      style={{
                        background: "#1f3c88",
                        color: "#ffffff",
                        borderRadius: "8px",
                        padding: "9px 13px",
                        fontWeight: 700,
                        textDecoration: "none",
                        fontSize: "14px",
                        whiteSpace: "nowrap",
                      }}
                    >
                      View
                    </Link>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section className="student-course-access-section" style={{ marginBottom: "24px" }}>
          <h2
            style={{
              color: "#1f3c88",
              margin: "0 0 16px",
              fontSize: "22px",
            }}
          >
            Course Access
          </h2>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
              gap: "18px",
            }}
          >
            <Link
              href="/student/resources"
              style={{ textDecoration: "none" }}
            >
              <div className="student-dashboard-access-card" style={{ ...cardStyle, minHeight: "145px" }}>
                <h3
                  style={{
                    color: "#1f3c88",
                    margin: "0 0 10px",
                    fontSize: "18px",
                  }}
                >
                  Course Materials
                </h3>

                <p
                  style={{
                    color: "#667085",
                    margin: 0,
                    lineHeight: 1.5,
                  }}
                >
                  Open class resources and materials for your course.
                </p>

                <span className="student-dashboard-action-button" style={actionButtonStyle}>Open Materials →</span>
              </div>
            </Link>

            {isOnlineCourse && (
              <div
                className="student-dashboard-access-card"
                style={{
                  ...cardStyle,
                  minHeight: "145px",
                  opacity: 0.92,
                }}
              >
                <h3
                  style={{
                    color: "#1f3c88",
                    margin: "0 0 10px",
                    fontSize: "18px",
                  }}
                >
                  Connect to Online Class
                </h3>

                {meetLink ? (
                  <>
                    <p
                      style={{
                        color: "#667085",
                        margin: 0,
                        lineHeight: 1.5,
                      }}
                    >
                      Join your online class using the Google Meet link.
                    </p>

                    <a
                      className="student-dashboard-action-button"
                      href={meetLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={actionButtonStyle}
                    >
                      Join Google Meet
                    </a>
                  </>
                ) : (
                  <p
                    style={{
                      color: "#667085",
                      margin: 0,
                      lineHeight: 1.5,
                    }}
                  >
                    The Google Meet link has not been added yet.
                  </p>
                )}
              </div>
            )}
          </div>
        </section>

        <p
          style={{
            color: "#667085",
            fontSize: "14px",
            margin: 0,
          }}
        >
          Use the sidebar to access all course sections.
        </p>
      </main>
    </div>
  );
}
