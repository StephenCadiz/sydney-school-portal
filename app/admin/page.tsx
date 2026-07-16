"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";

import AdminLayout from "../components/layout/AdminLayout";
import { getAdminClasses } from "../../lib/adminClasses";
import { getTeachers } from "../../lib/adminTeachers";
import { getAllHomework } from "../../lib/homework";
import { getUnreviewedFollowUpsForAdmin } from "../../lib/followUps";
import { getUpcomingTeacherCalendarEvents } from "../../lib/teacherCalendar";
import { supabase } from "../../lib/supabase";

type IconName =
  | "classes"
  | "teachers"
  | "cambridge"
  | "youngLearners"
  | "homework"
  | "addClass"
  | "addUsers"
  | "announcements"
  | "calendar"
  | "followUps"
  | "chevron";

const quickActions = [
  {
    label: "Add Class",
    href: "/admin/classes",
    description: "Create and schedule a new class.",
    icon: "addClass" as IconName,
  },
  {
    label: "Add Users",
    href: "/admin/add-users",
    description: "Add students, teachers or staff.",
    icon: "addUsers" as IconName,
  },
  {
    label: "Add Homework",
    href: "/admin/homework",
    description: "Publish Cambridge homework.",
    icon: "homework" as IconName,
  },
  {
    label: "Announcements",
    href: "/admin/announcements",
    description: "Send an announcement to a selected audience.",
    icon: "announcements" as IconName,
  },
];

function DashboardIcon({ name, size = 22 }: { name: IconName; size?: number }) {
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

  switch (name) {
    case "classes":
    case "addClass":
      return (
        <svg {...commonProps}>
          <path d="M3 21h18" />
          <path d="M5 21V8l7-5 7 5v13" />
          <path d="M9 21v-7h6v7" />
          <path d="M9 10h.01" />
          <path d="M15 10h.01" />
        </svg>
      );
    case "teachers":
    case "youngLearners":
      return (
        <svg {...commonProps}>
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      );
    case "cambridge":
      return (
        <svg {...commonProps}>
          <path d="m22 10-10-5-10 5 10 5 10-5Z" />
          <path d="M6 12v5c3 2 9 2 12 0v-5" />
          <path d="M22 10v6" />
        </svg>
      );
    case "homework":
      return (
        <svg {...commonProps}>
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
          <path d="M14 2v6h6" />
          <path d="M8 13h8" />
          <path d="M8 17h5" />
        </svg>
      );
    case "addUsers":
      return (
        <svg {...commonProps}>
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M19 8v6" />
          <path d="M22 11h-6" />
        </svg>
      );
    case "announcements":
      return (
        <svg {...commonProps}>
          <path d="m3 11 18-5v12L3 13v-2Z" />
          <path d="M11.6 16.8a3 3 0 1 1-5.8-1.6" />
        </svg>
      );
    case "calendar":
      return (
        <svg {...commonProps}>
          <rect x="3" y="4" width="18" height="18" rx="2" />
          <path d="M16 2v4" />
          <path d="M8 2v4" />
          <path d="M3 10h18" />
        </svg>
      );
    case "followUps":
      return (
        <svg {...commonProps}>
          <path d="M9 11l3 3L22 4" />
          <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
        </svg>
      );
    case "chevron":
      return (
        <svg {...commonProps}>
          <path d="m9 18 6-6-6-6" />
        </svg>
      );
    default:
      return null;
  }
}

function formatDate(value?: string | null) {
  if (!value) return "-";

  return new Date(`${value}T00:00:00`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  });
}

function formatDay(value?: string | null) {
  if (!value) return "";

  return new Date(`${value}T00:00:00`).toLocaleDateString("en-GB", {
    weekday: "long",
  });
}

function formatTime(startTime?: string | null, endTime?: string | null) {
  const start = startTime ? startTime.slice(0, 5) : "";
  const end = endTime ? endTime.slice(0, 5) : "";

  if (!start && !end) return "All day";
  if (!end || start === end) return start;

  return `${start} - ${end}`;
}

function getPreview(value?: string | null) {
  if (!value) return "";

  return value.length > 110 ? `${value.slice(0, 110).trim()}...` : value;
}

function getDisplayDate(date = new Date()) {
  return date.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function StatItem({
  label,
  value,
  icon,
  active = false,
  onClick,
}: {
  label: string;
  value: number | string;
  icon: IconName;
  active?: boolean;
  onClick?: () => void;
}) {
  const interactive = Boolean(onClick);

  return (
    <article
      className={`admin-dashboard-kpi-card ${active ? "is-active" : ""}`}
    >
      <div className="admin-dashboard-kpi-icon">
        <DashboardIcon name={icon} />
      </div>

      <div className="admin-dashboard-kpi-body">
        <div className="admin-dashboard-kpi-label">{label}</div>
        <div className="admin-dashboard-kpi-value">{value}</div>
      </div>

      {interactive && (
        <button
          type="button"
          className="admin-dashboard-kpi-action"
          onClick={onClick}
          aria-expanded={active}
        >
          {active ? "Hide breakdown" : "View breakdown"}
          <DashboardIcon name="chevron" size={16} />
        </button>
      )}
    </article>
  );
}

function buildStudentOverview(
  studentProfiles: any[],
  enrolments: any[],
  youngLearnersData: any[],
  classes: any[],
  levels: any[]
) {
  const cambridgeLevels = ["B1", "B2", "C1", "C2"];
  const studentIds = new Set(studentProfiles.map((student) => student.id));
  const countedStudentIds = new Set<string>();
  const countedYoungLearnerIds = new Set<string>();
  const cambridgeByLevel: Record<string, number> = {
    B1: 0,
    B2: 0,
    C1: 0,
    C2: 0,
  };
  const youngLearnersByLevel: Record<string, number> = {};
  let cambridgeStudents = 0;
  let youngLearners = 0;

  for (const enrolment of enrolments) {
    if (!studentIds.has(enrolment.student_id)) continue;
    if (countedStudentIds.has(enrolment.student_id)) continue;

    const classroom = classes.find(
      (item) => item.id === enrolment.class_id
    );

    if (!classroom) continue;

    countedStudentIds.add(enrolment.student_id);

    const level = levels.find((item) => item.id === classroom.level_id);
    const levelName = level?.name || "Level not set";
    const normalizedLevelName = String(levelName || "").trim().toUpperCase();

    if (classroom.is_cambridge === true) {
      cambridgeStudents += 1;

      if (cambridgeLevels.includes(normalizedLevelName)) {
        cambridgeByLevel[normalizedLevelName] += 1;
      }
    }
  }

  for (const youngLearner of youngLearnersData) {
    if (countedYoungLearnerIds.has(youngLearner.id)) continue;

    const classroom = classes.find(
      (item) => item.id === youngLearner.class_id
    );

    if (!classroom) continue;

    countedYoungLearnerIds.add(youngLearner.id);

    const level = levels.find((item) => item.id === classroom.level_id);
    const levelName = level?.name || "Level not set";

    youngLearners += 1;
    youngLearnersByLevel[levelName] =
      (youngLearnersByLevel[levelName] || 0) + 1;
  }

  return {
    cambridgeStudents,
    youngLearners,
    cambridgeByLevel,
    youngLearnersByLevel,
  };
}

function BreakdownList({
  type,
  cambridgeByLevel,
  youngLearnersByLevel,
  cambridgeTotal,
  youngLearnersTotal,
}: {
  type: "cambridge" | "youngLearners";
  cambridgeByLevel: Record<string, number>;
  youngLearnersByLevel: Record<string, number>;
  cambridgeTotal: number;
  youngLearnersTotal: number;
}) {
  const entries =
    type === "cambridge"
      ? ["B1", "B2", "C1", "C2"].map((level) => [
          level,
          cambridgeByLevel[level] || 0,
        ])
      : Object.entries(youngLearnersByLevel).sort(([first], [second]) =>
          first.localeCompare(second)
        );

  const emptyMessage =
    type === "cambridge"
      ? "No Cambridge students enrolled yet."
      : "No Young Learner students enrolled yet.";

  const total = type === "cambridge" ? cambridgeTotal : youngLearnersTotal;

  return (
    <div className="admin-dashboard-breakdown">
      <div className="admin-dashboard-breakdown-title">
        {type === "cambridge"
          ? "Cambridge level breakdown"
          : "Young Learner level breakdown"}
      </div>

      {total === 0 ? (
        <p className="admin-dashboard-empty-text">{emptyMessage}</p>
      ) : (
        <div className="admin-dashboard-breakdown-list">
          {entries.map(([level, count]) => (
            <div key={level} className="admin-dashboard-breakdown-row">
              <span>{level}</span>
              <strong>{count}</strong>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function AdminDashboard() {
  const [unreviewedFollowUps, setUnreviewedFollowUps] = useState<any[]>([]);
  const [calendarEvents, setCalendarEvents] = useState<any[]>([]);
  const [overview, setOverview] = useState({
    classes: 0,
    teachers: 0,
    cambridgeStudents: 0,
    youngLearners: 0,
    homework: 0,
    cambridgeByLevel: {
      B1: 0,
      B2: 0,
      C1: 0,
      C2: 0,
    } as Record<string, number>,
    youngLearnersByLevel: {} as Record<string, number>,
  });
  const [activeStudentBreakdown, setActiveStudentBreakdown] = useState<
    "cambridge" | "youngLearners" | ""
  >("");
  const [overviewError, setOverviewError] = useState(false);
  const [calendarError, setCalendarError] = useState(false);

  useEffect(() => {
    async function loadDashboard() {
      try {
        const data = await getUnreviewedFollowUpsForAdmin();
        setUnreviewedFollowUps(data);
      } catch (error) {
        console.error("Unable to load unreviewed follow-ups:", error);
      }

      try {
        const data = await getUpcomingTeacherCalendarEvents();
        setCalendarEvents(data.slice(0, 5));
      } catch (error) {
        console.error("Unable to load teacher calendar events:", error);
        setCalendarError(true);
      }

      try {
        const [classes, teachers, homework, studentProfiles] =
          await Promise.all([
          getAdminClasses(),
          getTeachers(),
          getAllHomework(),
          supabase
            .from("profiles")
            .select("id")
            .eq("role", "student"),
        ]);

        if (studentProfiles.error) {
          throw studentProfiles.error;
        }

        const studentIds = (studentProfiles.data || []).map(
          (student) => student.id
        );

        const [enrolmentsResult, youngLearnersResult, levelsResult] =
          await Promise.all([
          studentIds.length > 0
            ? supabase
                .from("class_enrolments")
                .select("student_id, class_id")
                .in("student_id", studentIds)
            : { data: [], error: null },
          supabase
            .from("young_learners")
            .select("id, class_id")
            .eq("active", true),
          supabase.from("levels").select("id, name"),
        ]);

        if (enrolmentsResult.error) {
          throw enrolmentsResult.error;
        }

        if (youngLearnersResult.error) {
          throw youngLearnersResult.error;
        }

        if (levelsResult.error) {
          throw levelsResult.error;
        }

        const studentOverview = buildStudentOverview(
          studentProfiles.data || [],
          enrolmentsResult.data || [],
          youngLearnersResult.data || [],
          classes,
          levelsResult.data || []
        );

        setOverview({
          classes: classes.length,
          teachers: teachers.length,
          homework: homework.length,
          ...studentOverview,
        });
      } catch (error) {
        console.error("Unable to load admin overview:", error);
        setOverviewError(true);
      }
    }

    loadDashboard();
  }, []);

  const latestFollowUps = unreviewedFollowUps.slice(0, 3);

  return (
    <AdminLayout>
      <div className="admin-dashboard-page">
        <header className="admin-dashboard-header">
          <div className="admin-dashboard-header-main">
            <Image
              className="admin-dashboard-logo"
              src="/LOGO and NAME.png"
              alt="Sydney School"
              width={230}
              height={80}
              priority
            />

            <div className="admin-dashboard-header-copy">
              <h1>Admin Dashboard</h1>
              <p>Academy management and daily operations.</p>
            </div>
          </div>

          <div className="admin-dashboard-date">{getDisplayDate()}</div>
        </header>

        {unreviewedFollowUps.length > 0 && (
          <section className="admin-dashboard-alert-card">
            <div className="admin-dashboard-alert-header">
              <div>
                <h2>Follow Ups Requiring Review</h2>
                <p>
                  {unreviewedFollowUps.length} new follow-up
                  {unreviewedFollowUps.length === 1 ? "" : "s"} need admin
                  attention.
                </p>
              </div>

              <Link href="/admin/follow-ups" className="admin-dashboard-button">
                Open Follow Ups
                <DashboardIcon name="chevron" size={16} />
              </Link>
            </div>

            <div className="admin-dashboard-follow-up-list">
              {latestFollowUps.map((item) => (
                <div key={item.id} className="admin-dashboard-follow-up-item">
                  <strong>{item.title || "Follow up"}</strong>

                  <div>
                    {item.student_name || "Unknown student"} ·{" "}
                    {item.teacher_name || "Unknown teacher"}
                    {item.created_at && (
                      <>
                        {" "}
                        · {new Date(item.created_at).toLocaleDateString()}
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        <section className="admin-dashboard-section">
          <div className="admin-dashboard-section-heading">
            <h2>Academy Overview</h2>
            <p>Current portal records.</p>
          </div>

          {overviewError && (
            <p className="admin-dashboard-error">
              Unable to load all overview counts.
            </p>
          )}

          <div className="admin-dashboard-kpi-grid">
            <StatItem
              label="Classes"
              value={overview.classes}
              icon="classes"
            />
            <StatItem
              label="Teachers"
              value={overview.teachers}
              icon="teachers"
            />
            <StatItem
              label="Cambridge Students"
              value={overview.cambridgeStudents}
              icon="cambridge"
              active={activeStudentBreakdown === "cambridge"}
              onClick={() =>
                setActiveStudentBreakdown((current) =>
                  current === "cambridge" ? "" : "cambridge"
                )
              }
            />
            <StatItem
              label="Young Learners"
              value={overview.youngLearners}
              icon="youngLearners"
              active={activeStudentBreakdown === "youngLearners"}
              onClick={() =>
                setActiveStudentBreakdown((current) =>
                  current === "youngLearners" ? "" : "youngLearners"
                )
              }
            />
            <StatItem
              label="Homework Items"
              value={overview.homework}
              icon="homework"
            />
          </div>

          {activeStudentBreakdown && (
            <BreakdownList
              type={activeStudentBreakdown}
              cambridgeByLevel={overview.cambridgeByLevel}
              youngLearnersByLevel={overview.youngLearnersByLevel}
              cambridgeTotal={overview.cambridgeStudents}
              youngLearnersTotal={overview.youngLearners}
            />
          )}

          <p className="admin-dashboard-count-note">
            Counts are based on enrolled Cambridge students and active Young
            Learners.
          </p>
        </section>

        <section className="admin-dashboard-main-grid">
          <div className="admin-dashboard-card admin-dashboard-calendar">
            <div className="admin-dashboard-card-header">
              <div>
                <h2>Teacher Calendar</h2>
                <p>Upcoming school-wide teacher events.</p>
              </div>

              <Link
                href="/admin/teacher-calendar"
                className="admin-dashboard-secondary-link"
              >
                View Full Calendar
                <DashboardIcon name="chevron" size={16} />
              </Link>
            </div>

            {calendarError ? (
              <p className="admin-dashboard-error">
                Unable to load teacher calendar.
              </p>
            ) : calendarEvents.length === 0 ? (
              <p className="admin-dashboard-empty-text">
                No upcoming teacher events.
              </p>
            ) : (
              <div className="admin-dashboard-event-list">
                {calendarEvents.map((event) => (
                  <article key={event.id} className="admin-dashboard-event">
                    <div className="admin-dashboard-event-date">
                      <span>{formatDate(event.event_date).split(" ")[0]}</span>
                      <strong>
                        {formatDate(event.event_date).split(" ")[1] || ""}
                      </strong>
                    </div>

                    <div className="admin-dashboard-event-content">
                      <div className="admin-dashboard-event-meta">
                        {formatDay(event.event_date)}
                        {" · "}
                        {formatTime(event.start_time, event.end_time)}
                      </div>

                      <h3>{event.title || "Untitled event"}</h3>

                      {event.description && (
                        <p>{getPreview(event.description)}</p>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>

          <aside className="admin-dashboard-card admin-dashboard-quick-actions">
            <div className="admin-dashboard-card-header">
              <div>
                <h2>Quick Actions</h2>
                <p>Common admin tasks.</p>
              </div>
            </div>

            <div className="admin-dashboard-action-grid">
              {quickActions.map((action) => (
                <Link
                  key={action.href}
                  href={action.href}
                  className="admin-dashboard-action-card"
                  aria-label={`${action.label}: ${action.description}`}
                >
                  <span className="admin-dashboard-action-icon">
                    <DashboardIcon name={action.icon} />
                  </span>
                  <span className="admin-dashboard-action-copy">
                    <strong>{action.label}</strong>
                    <span>{action.description}</span>
                  </span>
                  <span className="admin-dashboard-action-arrow">
                    <DashboardIcon name="chevron" size={17} />
                  </span>
                </Link>
              ))}
            </div>
          </aside>
        </section>
      </div>
    </AdminLayout>
  );
}
