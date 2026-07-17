import Link from "next/link";

type Props = {
  classes: any[];
};

function LessonMetaIcon({ name }: { name: "days" | "time" }) {
  const commonProps = {
    "aria-hidden": true,
    width: 16,
    height: 16,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };

  if (name === "days") {
    return (
      <svg {...commonProps}>
        <rect x="3" y="4" width="18" height="18" rx="2" />
        <path d="M16 2v4" />
        <path d="M8 2v4" />
        <path d="M3 10h18" />
      </svg>
    );
  }

  return (
    <svg {...commonProps}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

function formatTime(value?: string | null) {
  if (!value) return "";

  return value.slice(0, 5);
}

function formatTimeRange(startTime?: string | null, endTime?: string | null) {
  const start = formatTime(startTime);
  const end = formatTime(endTime);

  if (start && end) return `${start} – ${end}`;

  return start || end || "Time not set";
}

function getLevelName(item: any) {
  const relatedLevel = item.levels?.name || item.level_name;

  if (relatedLevel) return relatedLevel;

  const className = item.class_name || "";
  const firstPart = className.split(" ")[0]?.trim();

  return firstPart || "Class";
}

function getClassroomName(item: any) {
  if (isOnlineClass(item)) return "Online Class";

  return item.classrooms?.name || "Classroom not assigned";
}

function getClassroomLogo(item: any) {
  if (isOnlineClass(item)) return "/On-Line Logo.png";

  return item.classrooms?.logo || "/Emu Logo.png";
}

function isOnlineClass(item: any) {
  return String(item.course_type || "").toLowerCase() === "online";
}

function formatDays(days?: string | null) {
  if (!days) return "Days not set";

  return days.replace(/\s+and\s+/gi, " & ");
}

export default function TodaySchedule({ classes }: Props) {
  const today = new Date().toLocaleDateString("en-GB", {
    weekday: "long",
  });

  const todaysClasses = classes
    .filter((item) => item.days?.includes(today))
    .sort((a, b) =>
      (a.start_time || "").localeCompare(b.start_time || "")
    );

  return (
    <section className="teacher-dashboard-card teacher-dashboard-lessons">
      <div className="teacher-dashboard-section-header">
        <div>
          <h2>Today&rsquo;s Lessons</h2>
          <p>Your scheduled lessons for today.</p>
        </div>
      </div>

      {todaysClasses.length === 0 ? (
        <div className="teacher-dashboard-empty-state">
          No lessons scheduled today.
        </div>
      ) : (
        <div className="teacher-dashboard-lesson-list">
          {todaysClasses.map((item) => {
            const levelName = getLevelName(item);
            const classroomName = getClassroomName(item);
            const classroomLogo = getClassroomLogo(item);
            const timeRange = formatTimeRange(item.start_time, item.end_time);
            const onlineClass = isOnlineClass(item);

            return (
              <Link
                key={item.id}
                href={`/teacher/class?id=${item.id}`}
                className="teacher-dashboard-lesson-card"
              >
                <div className="teacher-dashboard-lesson-identity">
                  <span className="teacher-dashboard-lesson-image">
                  <img
                    src={classroomLogo}
                    alt={classroomName}
                  />
                  </span>

                  <div className="teacher-dashboard-lesson-copy">
                    <span className="teacher-dashboard-lesson-level">
                      {levelName}
                    </span>

                    <strong>
                      {classroomName}
                    </strong>

                    <span>
                      {onlineClass ? "Online lesson" : "Classroom"}
                    </span>
                  </div>
                </div>

                <div className="teacher-dashboard-lesson-schedule">
                  <span>
                    <LessonMetaIcon name="days" />
                    {formatDays(item.days)}
                  </span>

                  <span>
                    <LessonMetaIcon name="time" />
                    {timeRange}
                  </span>
                </div>

                <span className="teacher-dashboard-lesson-action">
                  Open →
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </section>
  );
}
