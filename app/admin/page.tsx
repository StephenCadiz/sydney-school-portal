"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import AdminLayout from "../components/layout/AdminLayout";
import { getAdminClasses } from "../../lib/adminClasses";
import { getTeachers } from "../../lib/adminTeachers";
import { getAllHomework } from "../../lib/homework";
import { getUnreviewedFollowUpsForAdmin } from "../../lib/followUps";
import { getUpcomingTeacherCalendarEvents } from "../../lib/teacherCalendar";
import { supabase } from "../../lib/supabase";

const cardStyle = {
  background: "#ffffff",
  border: "1px solid #e6eaf2",
  borderRadius: "14px",
  boxShadow: "0 8px 22px rgba(31,60,136,0.06)",
};

const quickActions = [
  { label: "Add Class", href: "/admin/classes" },
  { label: "Add Users", href: "/admin/add-users" },
  { label: "Add Homework", href: "/admin/homework" },
  { label: "Announcements", href: "/admin/announcements" },
];

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

function StatItem({
  label,
  value,
  active = false,
  onClick,
}: {
  label: string;
  value: number | string;
  active?: boolean;
  onClick?: () => void;
}) {
  const interactive = Boolean(onClick);

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!interactive}
      style={{
        width: "100%",
        textAlign: "left",
        background: active ? "#eef3ff" : "#f8fafd",
        border: active ? "1px solid #b9c9ef" : "1px solid #edf1f7",
        borderRadius: "12px",
        padding: "16px",
        cursor: interactive ? "pointer" : "default",
        font: "inherit",
      }}
    >
      <div
        style={{
          color: "#667085",
          fontSize: "13px",
          fontWeight: 700,
          marginBottom: "8px",
        }}
      >
        {label}
      </div>
      <div
        style={{
          color: "#1f3c88",
          fontSize: "28px",
          fontWeight: 900,
          lineHeight: 1,
        }}
      >
        {value}
      </div>
      {interactive && (
        <div
          style={{
            color: "#667085",
            fontSize: "12px",
            fontWeight: 700,
            marginTop: "8px",
          }}
        >
          {active ? "Hide breakdown" : "View breakdown"}
        </div>
      )}
    </button>
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

    if (classroom.is_cambridge === true) {
      cambridgeStudents += 1;

      if (cambridgeLevels.includes(levelName)) {
        cambridgeByLevel[levelName] += 1;
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
    <div
      style={{
        gridColumn: "1 / -1",
        background: "#ffffff",
        border: "1px solid #e6eaf2",
        borderRadius: "12px",
        padding: "14px",
      }}
    >
      <div
        style={{
          color: "#1f3c88",
          fontWeight: 900,
          marginBottom: "10px",
          fontSize: "14px",
        }}
      >
        {type === "cambridge"
          ? "Cambridge level breakdown"
          : "Young Learner level breakdown"}
      </div>

      {total === 0 ? (
        <p
          style={{
            color: "#667085",
            margin: 0,
            fontSize: "14px",
          }}
        >
          {emptyMessage}
        </p>
      ) : (
        <div
          style={{
            display: "grid",
            gap: "8px",
          }}
        >
          {entries.map(([level, count]) => (
            <div
              key={level}
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: "12px",
                color: "#333",
                fontSize: "14px",
              }}
            >
              <span>{level}</span>
              <strong style={{ color: "#1f3c88" }}>{count}</strong>
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
      <div
        style={{
          background: "#f5f7fa",
          margin: "-10px",
          padding: "26px",
          minHeight: "100%",
        }}
      >
        <header
          style={{
            marginBottom: "28px",
          }}
        >
          <h1
            style={{
              color: "#1f3c88",
              margin: 0,
              fontSize: "34px",
              lineHeight: 1.15,
            }}
          >
            Sydney School Admin
          </h1>

          <p
            style={{
              color: "#667085",
              margin: "9px 0 0",
              fontSize: "17px",
              lineHeight: 1.55,
            }}
          >
            Daily overview of academy operations.
          </p>
        </header>

        {unreviewedFollowUps.length > 0 && (
          <section
            style={{
              ...cardStyle,
              border: "1px solid #f2c98f",
              borderLeft: "5px solid #b54708",
              padding: "20px",
              marginBottom: "24px",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                gap: "18px",
                marginBottom: "14px",
              }}
            >
              <div>
                <h2
                  style={{
                    color: "#1f3c88",
                    margin: "0 0 6px",
                    fontSize: "20px",
                  }}
                >
                  Follow Ups Requiring Review
                </h2>
                <p
                  style={{
                    color: "#5f6b7a",
                    margin: 0,
                    fontSize: "14px",
                  }}
                >
                  {unreviewedFollowUps.length} new follow-up
                  {unreviewedFollowUps.length === 1 ? "" : "s"} need admin
                  attention.
                </p>
              </div>

              <Link
                href="/admin/follow-ups"
                style={{
                  background: "#1f3c88",
                  color: "#ffffff",
                  borderRadius: "8px",
                  padding: "9px 13px",
                  fontWeight: 800,
                  fontSize: "13px",
                  textDecoration: "none",
                  whiteSpace: "nowrap",
                }}
              >
                Open Follow Ups →
              </Link>
            </div>

            <div
              style={{
                display: "grid",
                gap: "10px",
              }}
            >
              {latestFollowUps.map((item) => (
                <div
                  key={item.id}
                  style={{
                    background: "#fffaf4",
                    border: "1px solid #f5dfbf",
                    borderRadius: "10px",
                    padding: "12px",
                  }}
                >
                  <strong
                    style={{
                      color: "#333",
                      display: "block",
                      marginBottom: "4px",
                    }}
                  >
                    {item.title || "Follow up"}
                  </strong>

                  <div
                    style={{
                      color: "#667085",
                      fontSize: "13px",
                      lineHeight: 1.5,
                    }}
                  >
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

        <section
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1.35fr) minmax(300px, 0.85fr)",
            gap: "22px",
            alignItems: "start",
            marginBottom: "24px",
          }}
        >
          <div
            style={{
              ...cardStyle,
              padding: "24px",
            }}
          >
            <div
              style={{
                marginBottom: "18px",
              }}
            >
              <h2
                style={{
                  color: "#1f3c88",
                  margin: "0 0 6px",
                  fontSize: "21px",
                }}
              >
                Teacher Calendar
              </h2>
              <p
                style={{
                  color: "#667085",
                  margin: 0,
                  fontSize: "14px",
                }}
              >
                Upcoming school-wide teacher events.
              </p>
            </div>

            {calendarError ? (
              <p style={{ color: "#b00020", margin: 0 }}>
                Unable to load teacher calendar.
              </p>
            ) : calendarEvents.length === 0 ? (
              <p style={{ color: "#667085", margin: 0 }}>
                No upcoming teacher events.
              </p>
            ) : (
              <div
                style={{
                  display: "grid",
                  gap: "12px",
                  maxHeight: "390px",
                  overflowY: "auto",
                  paddingRight: "4px",
                }}
              >
                {calendarEvents.map((event) => (
                  <div
                    key={event.id}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "72px minmax(0, 1fr)",
                      gap: "14px",
                      alignItems: "center",
                      background: "#f8fafd",
                      border: "1px solid #edf1f7",
                      borderRadius: "12px",
                      padding: "13px",
                    }}
                  >
                    <div
                      style={{
                        background: "#1f3c88",
                        color: "#ffffff",
                        borderRadius: "10px",
                        padding: "10px 8px",
                        textAlign: "center",
                        fontWeight: 800,
                      }}
                    >
                      {formatDate(event.event_date)}
                    </div>

                    <div>
                      <div
                        style={{
                          color: "#667085",
                          fontSize: "13px",
                          fontWeight: 700,
                          marginBottom: "4px",
                        }}
                      >
                        {formatDay(event.event_date)}
                        {" · "}
                        {formatTime(event.start_time, event.end_time)}
                      </div>

                      <div
                        style={{
                          color: "#1f3c88",
                          fontWeight: 900,
                          fontSize: "16px",
                          marginBottom: event.description ? "4px" : 0,
                        }}
                      >
                        {event.title || "Untitled event"}
                      </div>

                      {event.description && (
                        <p
                          style={{
                            color: "#5f6b7a",
                            margin: 0,
                            fontSize: "13px",
                            lineHeight: 1.45,
                          }}
                        >
                          {getPreview(event.description)}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <aside
            style={{
              ...cardStyle,
              padding: "24px",
            }}
          >
            <h2
              style={{
                color: "#1f3c88",
                margin: "0 0 6px",
                fontSize: "21px",
              }}
            >
              Academy Overview
            </h2>
            <p
              style={{
                color: "#667085",
                margin: "0 0 18px",
                fontSize: "14px",
              }}
            >
              Current portal records.
            </p>

            {overviewError && (
              <p
                style={{
                  color: "#b00020",
                  margin: "0 0 14px",
                  fontSize: "14px",
                  fontWeight: 700,
                }}
              >
                Unable to load all overview counts.
              </p>
            )}

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                gap: "12px",
              }}
            >
              <StatItem label="Classes" value={overview.classes} />
              <StatItem label="Teachers" value={overview.teachers} />
              <StatItem
                label="Cambridge Students"
                value={overview.cambridgeStudents}
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
                active={activeStudentBreakdown === "youngLearners"}
                onClick={() =>
                  setActiveStudentBreakdown((current) =>
                    current === "youngLearners" ? "" : "youngLearners"
                  )
                }
              />
              <StatItem label="Homework Items" value={overview.homework} />

              {activeStudentBreakdown && (
                <BreakdownList
                  type={activeStudentBreakdown}
                  cambridgeByLevel={overview.cambridgeByLevel}
                  youngLearnersByLevel={overview.youngLearnersByLevel}
                  cambridgeTotal={overview.cambridgeStudents}
                  youngLearnersTotal={overview.youngLearners}
                />
              )}
            </div>

            <p
              style={{
                color: "#667085",
                margin: "14px 0 0",
                fontSize: "12px",
              }}
            >
              Counts are based on enrolled Cambridge students and active Young
              Learners.
            </p>
          </aside>
        </section>

        <section
          style={{
            ...cardStyle,
            padding: "18px",
          }}
        >
          <h2
            style={{
              color: "#1f3c88",
              margin: "0 0 12px",
              fontSize: "18px",
            }}
          >
            Quick Actions
          </h2>

          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "10px",
            }}
          >
            {quickActions.map((action) => (
              <Link
                key={action.href}
                href={action.href}
                style={{
                  background: "#f8fafd",
                  color: "#1f3c88",
                  border: "1px solid #dbe3f0",
                  borderRadius: "999px",
                  padding: "9px 13px",
                  textDecoration: "none",
                  fontWeight: 800,
                  fontSize: "13px",
                }}
              >
                {action.label} →
              </Link>
            ))}
          </div>
        </section>
      </div>
    </AdminLayout>
  );
}
