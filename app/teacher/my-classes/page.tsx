"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import TeacherLayout from "../../components/layout/TeacherLayout";
import { supabase } from "../../../lib/supabase";
import { getTeacherClasses } from "../../../lib/teacher";

type View = "today" | "all";
type Timing = "past" | "now" | "upcoming";

type ClassRow = any & {
  levels?: { id: string; name: string } | null;
  student_count: number;
};

type ClassroomIdentity =
  | {
      type: "primary" | "online";
      label: string;
      name: string;
      image: string | null;
      includesOnline: boolean;
    }
  | {
      type: "locations";
      locations: string[];
      includesOnline: boolean;
    }
  | { type: "empty" };

const weekdayNames = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];
const weekdayShort: Record<string, string> = {
  monday: "Mon",
  tuesday: "Tue",
  wednesday: "Wed",
  thursday: "Thu",
  friday: "Fri",
  saturday: "Sat",
  sunday: "Sun",
};
const levelOrder = ["B1", "B2", "C1", "C2"];
const youngLearnerOrder = ["PRE-KIDS", "KIDS", "JUNIOR", "TEENS"];
const courseOrder = ["regular", "intensive", "express", "online"];

function getMadridParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Madrid",
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  return {
    weekday: values.weekday || "",
    dateLabel: `${values.weekday || ""}, ${values.day || ""} ${
      values.month || ""
    } ${values.year || ""}`.trim(),
    minutes: Number(values.hour || 0) * 60 + Number(values.minute || 0),
  };
}

function formatTime(value: unknown) {
  const parts = String(value || "").trim().split(":");
  return parts.length >= 2 ? parts.slice(0, 2).join(":") : "";
}

function timeToMinutes(value: unknown) {
  const match = /^(\d{1,2}):(\d{2})/.exec(String(value || ""));
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

function formatDays(value: unknown) {
  const raw = String(value || "").trim();
  if (!raw) return "Schedule not set";

  const days = weekdayNames
    .filter((day) => new RegExp(`\\b${day}\\b`, "i").test(raw))
    .map((day) => weekdayShort[day.toLowerCase()]);

  if (days.length === 0) return raw.replace(/\s+and\s+/gi, " & ");
  if (days.length === 1) return days[0];
  if (days.length === 2) return `${days[0]} & ${days[1]}`;
  return `${days.slice(0, -1).join(", ")} & ${days.at(-1)}`;
}

function isScheduledOn(value: unknown, weekday: string) {
  const fullMatch = new RegExp(`\\b${weekday}\\b`, "i").test(
    String(value || "")
  );
  const abbreviation = weekdayShort[weekday.toLowerCase()];
  return (
    fullMatch ||
    (abbreviation
      ? new RegExp(`\\b${abbreviation}\\b`, "i").test(String(value || ""))
      : false)
  );
}

function normalizeLevel(value: unknown) {
  return String(value || "").trim().toUpperCase();
}

function titleCase(value: unknown) {
  const text = String(value || "").trim().toLowerCase();
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : "";
}

function getClassTitle(item: ClassRow) {
  const level = String(item.levels?.name || "").trim();
  const className = String(item.class_name || "").trim();

  if (item.is_cambridge === true) {
    return [level || className || "Cambridge", titleCase(item.course_type)]
      .filter(Boolean)
      .join(" ");
  }

  if (
    className &&
    normalizeLevel(className) !== normalizeLevel(level)
  ) {
    return className;
  }

  return level || className || "Class";
}

function getClassroomName(item: ClassRow) {
  return isOnlineClass(item)
    ? "Online"
    : item.classrooms?.name || "Classroom not assigned";
}

function isOnlineClass(item: ClassRow) {
  return String(item.course_type || "").trim().toLowerCase() === "online";
}

function getClassroomIdentity(items: ClassRow[]): ClassroomIdentity {
  if (items.length === 0) return { type: "empty" };

  const onlineClasses = items.filter(isOnlineClass);
  const physicalClasses = items.filter((item) => !isOnlineClass(item));

  if (physicalClasses.length === 0) {
    return {
      type: "online",
      label: "Online teaching",
      name: "Online",
      image: "/On-Line Logo.png",
      includesOnline: false,
    };
  }

  const classrooms = Array.from(
    new Map(
      physicalClasses
        .filter((item) => item.classrooms?.id)
        .map((item) => [
          String(item.classrooms.id),
          {
            name: String(item.classrooms.name || "Classroom not assigned"),
            logo: String(item.classrooms.logo || "") || null,
          },
        ])
    ).values()
  );

  if (classrooms.length === 1) {
    const classroom = classrooms[0];
    return {
      type: "primary",
      label: "Primary classroom",
      name: classroom.name,
      image: classroom.logo,
      includesOnline: onlineClasses.length > 0,
    };
  }

  const locationNames = classrooms.map((classroom) => classroom.name);

  return {
    type: "locations",
    locations: locationNames.length ? locationNames : ["Classroom not assigned"],
    includesOnline: onlineClasses.length > 0,
  };
}

function getTiming(item: ClassRow, currentMinutes: number): Timing {
  const start = timeToMinutes(item.start_time);
  const end = timeToMinutes(item.end_time);
  if (start === null || end === null) return "upcoming";
  if (currentMinutes >= start && currentMinutes < end) return "now";
  return currentMinutes >= end ? "past" : "upcoming";
}

function compareBySchedule(first: ClassRow, second: ClassRow) {
  return (
    String(first.start_time || "99:99").localeCompare(
      String(second.start_time || "99:99")
    ) ||
    String(first.end_time || "99:99").localeCompare(
      String(second.end_time || "99:99")
    ) ||
    getClassTitle(first).localeCompare(getClassTitle(second), undefined, {
      sensitivity: "base",
    }) ||
    String(first.id).localeCompare(String(second.id))
  );
}

function getProgramme(item: ClassRow) {
  if (item.is_cambridge === true) return "Cambridge";
  return normalizeLevel(item.levels?.name) === "SUPPORT CLASSES"
    ? "Support"
    : "Young Learners";
}

function getLevelSort(item: ClassRow) {
  const level = normalizeLevel(item.levels?.name);
  if (item.is_cambridge === true) {
    const index = levelOrder.indexOf(level);
    return index === -1 ? levelOrder.length : index;
  }
  const index = youngLearnerOrder.findIndex((name) => level.startsWith(name));
  return index === -1 ? youngLearnerOrder.length : index;
}

function compareAllClasses(first: ClassRow, second: ClassRow) {
  const firstCourseIndex = courseOrder.indexOf(
    String(first.course_type || "").toLowerCase()
  );
  const secondCourseIndex = courseOrder.indexOf(
    String(second.course_type || "").toLowerCase()
  );
  const courseDifference =
    (firstCourseIndex === -1 ? courseOrder.length : firstCourseIndex) -
    (secondCourseIndex === -1 ? courseOrder.length : secondCourseIndex);
  return (
    getLevelSort(first) - getLevelSort(second) ||
    courseDifference ||
    String(first.days || "").localeCompare(String(second.days || "")) ||
    compareBySchedule(first, second)
  );
}

function ClassListRow({
  item,
  timing,
  onOpen,
}: {
  item: ClassRow;
  timing?: Timing;
  onOpen: () => void;
}) {
  const start = formatTime(item.start_time);
  const end = formatTime(item.end_time);
  const time = start && end ? `${start}–${end}` : "Time not set";
  const onlineClass = isOnlineClass(item);

  return (
    <button
      type="button"
      className={`teacher-my-classes-row${
        timing ? ` is-${timing}` : " is-all"
      }${onlineClass ? " is-online" : ""}`}
      onClick={onOpen}
      aria-label={`Open ${getClassTitle(item)} Class Workspace`}
    >
      <div className="teacher-my-classes-row-time">
        <strong>{time}</strong>
        {timing === "now" && <span>Now</span>}
        {timing === "past" && <span>Past</span>}
      </div>
      <div className="teacher-my-classes-row-main">
        <strong>{getClassTitle(item)}</strong>
        <span>{formatDays(item.days)}</span>
        <small className="teacher-my-classes-row-location">
          {onlineClass && <OnlineClassIcon />}
          <span>
            {getClassroomName(item)} · {item.student_count}{" "}
            {item.student_count === 1 ? "student" : "students"}
          </span>
        </small>
      </div>
      <span className="teacher-my-classes-row-chevron" aria-hidden="true">›</span>
    </button>
  );
}

function OnlineClassIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="4" width="14" height="11" rx="2" />
      <path d="m17 8 4-2.5v8L17 11" />
      <path d="M8 19h4" />
    </svg>
  );
}

function LocationSummaryIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z" />
      <circle cx="12" cy="10" r="2.5" />
    </svg>
  );
}

export default function MyClassesPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [view, setView] = useState<View>("today");
  const [search, setSearch] = useState("");
  const [currentTime, setCurrentTime] = useState(() => new Date());
  const madrid = getMadridParts(currentTime);

  useEffect(() => {
    const timer = window.setInterval(() => setCurrentTime(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    async function loadClasses() {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        router.push("/login");
        return;
      }

      try {
        const teacherClasses = await getTeacherClasses(session.user.id);
        const classIds = teacherClasses.map((item) => item.id).filter(Boolean);
        const levelIds = Array.from(
          new Set(teacherClasses.map((item) => item.level_id).filter(Boolean))
        );
        const [levelsResult, enrolmentsResult, youngLearnersResult] =
          await Promise.all([
            levelIds.length
              ? supabase.from("levels").select("id, name").in("id", levelIds)
              : Promise.resolve({ data: [], error: null }),
            classIds.length
              ? supabase
                  .from("class_enrolments")
                  .select("class_id, student_id")
                  .in("class_id", classIds)
              : Promise.resolve({ data: [], error: null }),
            classIds.length
              ? supabase
                  .from("young_learners")
                  .select("id, class_id")
                  .in("class_id", classIds)
                  .eq("active", true)
              : Promise.resolve({ data: [], error: null }),
          ]);

        const loadError =
          levelsResult.error ||
          enrolmentsResult.error ||
          youngLearnersResult.error;
        if (loadError) throw loadError;

        const enrolmentCounts = new Map<string, Set<string>>();
        for (const row of enrolmentsResult.data || []) {
          const classId = String(row.class_id || "");
          const students = enrolmentCounts.get(classId) || new Set<string>();
          if (row.student_id) students.add(String(row.student_id));
          enrolmentCounts.set(classId, students);
        }
        const youngLearnerCounts = new Map<string, number>();
        for (const row of youngLearnersResult.data || []) {
          const classId = String(row.class_id || "");
          youngLearnerCounts.set(
            classId,
            (youngLearnerCounts.get(classId) || 0) + 1
          );
        }

        setClasses(
          teacherClasses.map((item) => {
            const classId = String(item.id);
            const levels = (levelsResult.data || []).find(
              (level) => level.id === item.level_id
            );
            return {
              ...item,
              levels,
              student_count:
                item.is_cambridge === true
                  ? enrolmentCounts.get(classId)?.size || 0
                  : youngLearnerCounts.get(classId) || 0,
            };
          })
        );
      } catch (loadError) {
        console.error("Error loading classes:", loadError);
        setError(true);
      } finally {
        setLoading(false);
      }
    }

    loadClasses();
  }, [router]);

  const todayClasses = useMemo(
    () =>
      classes
        .filter((item) => isScheduledOn(item.days, madrid.weekday))
        .sort(compareBySchedule),
    [classes, madrid.weekday]
  );
  const searchResults = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return [...classes]
      .filter((item) => {
        if (!query) return true;
        return [
          getClassTitle(item),
          item.levels?.name,
          item.class_name,
          item.days,
          getClassroomName(item),
          item.course_type,
        ].some((value) => String(value || "").toLocaleLowerCase().includes(query));
      })
      .sort(compareAllClasses);
  }, [classes, search]);
  const totalStudents = classes.reduce(
    (sum, item) => sum + item.student_count,
    0
  );

  function openClass(item: ClassRow) {
    router.push(`/teacher/class?id=${item.id}`);
  }

  function renderToday() {
    if (todayClasses.length === 0) {
      return (
        <div className="teacher-my-classes-empty-state">
          <p>No classes scheduled today.</p>
          <button type="button" onClick={() => setView("all")}>View all classes</button>
        </div>
      );
    }

    const past = todayClasses.filter(
      (item) => getTiming(item, madrid.minutes) === "past"
    );
    const current = todayClasses.filter(
      (item) => getTiming(item, madrid.minutes) === "now"
    );
    const upcoming = todayClasses.filter(
      (item) => getTiming(item, madrid.minutes) === "upcoming"
    );
    const groups = [
      { label: "Past", rows: past, timing: "past" as const },
      { label: "Now", rows: current, timing: "now" as const },
      { label: "Next", rows: upcoming.slice(0, 1), timing: "upcoming" as const },
      { label: "Later", rows: upcoming.slice(1), timing: "upcoming" as const },
    ].filter((group) => group.rows.length > 0);

    return (
      <section className="teacher-my-classes-today" aria-labelledby="today-heading">
        <div className="teacher-my-classes-section-label" id="today-heading">
          Today · {madrid.weekday}
        </div>
        {groups.map((group) => (
          <div
            className={`teacher-my-classes-group is-${group.label.toLowerCase()}`}
            key={group.label}
          >
            <h2>{group.label}</h2>
            <div className="teacher-my-classes-rows">
              {group.rows.map((item) => (
                <ClassListRow
                  key={item.id}
                  item={item}
                  timing={group.timing}
                  onOpen={() => openClass(item)}
                />
              ))}
            </div>
          </div>
        ))}
      </section>
    );
  }

  function renderAllClasses() {
    const programmes = ["Cambridge", "Young Learners", "Support"];

    return (
      <section className="teacher-my-classes-all" aria-label="All classes">
        <label className="teacher-my-classes-search">
          <span>Search classes</span>
          <div>
            <svg
              aria-hidden="true"
              width="17"
              height="17"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.35-4.35" />
            </svg>
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search classes..."
            />
          </div>
        </label>

        {searchResults.length === 0 ? (
          <div className="teacher-my-classes-empty-state">
            <p>No classes match your search.</p>
          </div>
        ) : (
          programmes.map((programme) => {
            const programmeRows = searchResults.filter(
              (item) => getProgramme(item) === programme
            );
            if (!programmeRows.length) return null;
            const levels = Array.from(
              new Set(programmeRows.map((item) => item.levels?.name || "Other"))
            );

            return (
              <section className="teacher-my-classes-programme" key={programme}>
                <div className="teacher-my-classes-programme-heading">
                  <h2>{programme}</h2>
                  <span>
                    {programmeRows.length}{" "}
                    {programmeRows.length === 1 ? "class" : "classes"}
                  </span>
                </div>
                {levels.map((level) => {
                  const levelRows = programmeRows.filter(
                    (item) => (item.levels?.name || "Other") === level
                  );
                  return (
                    <div className="teacher-my-classes-level-group" key={level}>
                      <h3>{level}</h3>
                      <div className="teacher-my-classes-rows">
                        {levelRows.map((item) => (
                          <ClassListRow
                            key={item.id}
                            item={item}
                            onOpen={() => openClass(item)}
                          />
                        ))}
                      </div>
                    </div>
                  );
                })}
              </section>
            );
          })
        )}
      </section>
    );
  }

  const representedClasses = view === "today" ? todayClasses : searchResults;
  const classroomIdentity = getClassroomIdentity(representedClasses);

  return (
    <TeacherLayout>
      <main className="teacher-my-classes-page">
        <header className="teacher-my-classes-heading">
          <div className="teacher-my-classes-heading-copy">
            <h1>My Classes</h1>
            <p>{madrid.dateLabel}</p>
            <small>Your teaching groups and schedules</small>
            <div className="teacher-my-classes-heading-stats" aria-label="Class statistics">
              <span>
                <strong>{classes.length}</strong>
                <small>{classes.length === 1 ? "class" : "classes"}</small>
              </span>
              <span>
                <strong>{totalStudents}</strong>
                <small>{totalStudents === 1 ? "student" : "students"}</small>
              </span>
              <span>
                <strong>{todayClasses.length}</strong>
                <small>today</small>
              </span>
            </div>
          </div>
          <div
            className={`teacher-my-classes-heading-context is-${classroomIdentity.type}`}
          >
            {(classroomIdentity.type === "primary" ||
              classroomIdentity.type === "online") && (
              <>
                {classroomIdentity.image && (
                  <div className="teacher-my-classes-heading-classroom">
                    <Image
                      src={classroomIdentity.image}
                      alt={
                        classroomIdentity.type === "online"
                          ? "Online classes"
                          : `${classroomIdentity.name} classroom`
                      }
                      width={168}
                      height={168}
                      sizes="(max-width: 640px) 118px, (max-width: 760px) 150px, 168px"
                    />
                  </div>
                )}
                <div className="teacher-my-classes-heading-identity-copy">
                  <span>{classroomIdentity.label}</span>
                  <strong>{classroomIdentity.name}</strong>
                  {classroomIdentity.includesOnline && (
                    <small>Includes online classes</small>
                  )}
                </div>
              </>
            )}
            {classroomIdentity.type === "locations" && (
              <>
                <div
                  className="teacher-my-classes-heading-location-icon"
                  aria-hidden="true"
                >
                  <LocationSummaryIcon />
                </div>
                <div className="teacher-my-classes-heading-identity-copy">
                  <span>Location summary</span>
                  <strong>Teaching locations</strong>
                  <div className="teacher-my-classes-heading-locations">
                    {classroomIdentity.locations.map((location) => (
                      <span key={location}>{location}</span>
                    ))}
                  </div>
                  {classroomIdentity.includesOnline && (
                    <small>Includes online classes</small>
                  )}
                </div>
              </>
            )}
            {classroomIdentity.type === "empty" && (
              <div className="teacher-my-classes-heading-identity-copy">
                <span>{view === "today" ? "Today" : "Class search"}</span>
                <strong>
                  {view === "today"
                    ? "No classroom scheduled"
                    : "No matching classes"}
                </strong>
              </div>
            )}
          </div>
        </header>

        <nav className="teacher-my-classes-view-switch" aria-label="Class views">
          {(["today", "all"] as View[]).map((item) => (
            <button
              type="button"
              key={item}
              className={view === item ? "is-active" : ""}
              aria-pressed={view === item}
              onClick={() => setView(item)}
            >
              {item === "today" ? "Today" : "All Classes"}
            </button>
          ))}
        </nav>

        {loading ? (
          <div className="teacher-my-classes-loading" aria-busy="true">
            <span />
            <span />
            <span />
          </div>
        ) : error ? (
          <div className="teacher-my-classes-empty-state">
            <p>Unable to load classes.</p>
          </div>
        ) : view === "today" ? (
          renderToday()
        ) : (
          renderAllClasses()
        )}
      </main>
    </TeacherLayout>
  );
}
