import Link from "next/link";

type Props = {
  classes: any[];
};

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
    <section
      style={{
        background: "#ffffff",
        border: "1px solid #e6eaf2",
        borderRadius: "14px",
        padding: "22px",
        marginBottom: "30px",
        boxShadow: "0 6px 18px rgba(31,60,136,0.06)",
      }}
    >
      <div
        style={{
          marginBottom: "18px",
        }}
      >
        <h2
          style={{
            margin: "0 0 6px",
            color: "#1f3c88",
            fontSize: "22px",
          }}
        >
          Today&rsquo;s Lessons
        </h2>

        <p
          style={{
            margin: 0,
            color: "#667085",
            fontSize: "15px",
          }}
        >
          Your scheduled lessons for today.
        </p>
      </div>

      {todaysClasses.length === 0 ? (
        <div
          style={{
            background: "#f8fafd",
            border: "1px dashed #cfd8e6",
            borderRadius: "12px",
            padding: "18px",
            color: "#667085",
            fontWeight: 600,
          }}
        >
          No lessons scheduled today.
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gap: "12px",
          }}
        >
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
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: "14px",
                  alignItems: "center",
                  background: "#f8fafd",
                  border: "1px solid #edf1f7",
                  borderRadius: "12px",
                  padding: "14px",
                  textDecoration: "none",
                  color: "inherit",
                }}
              >
                <div
                  style={{
                    background: "#1f3c88",
                    color: "#ffffff",
                    borderRadius: "999px",
                    padding: "8px 12px",
                    fontWeight: 800,
                    fontSize: "14px",
                    textAlign: "center",
                    minWidth: "42px",
                  }}
                >
                  {levelName}
                </div>

                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "12px",
                    flex: "1 1 240px",
                    minWidth: 0,
                  }}
                >
                  <img
                    src={classroomLogo}
                    alt={classroomName}
                    style={{
                      width: "46px",
                      height: "46px",
                      borderRadius: "10px",
                      objectFit: "contain",
                      background: "#ffffff",
                      border: "1px solid #e6eaf2",
                      padding: "5px",
                      flex: "0 0 auto",
                    }}
                  />

                  <div style={{ minWidth: 0 }}>
                    <div
                      style={{
                        color: "#1f3c88",
                        fontWeight: 800,
                        fontSize: "16px",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {classroomName}
                    </div>

                    <div
                      style={{
                        color: "#667085",
                        fontSize: "13px",
                        marginTop: "3px",
                      }}
                    >
                      {onlineClass ? "Online lesson" : "Classroom"}
                    </div>
                  </div>
                </div>

                <div
                  style={{
                    background: "#ffffff",
                    border: "1px solid #dbe3f0",
                    color: "#1f3c88",
                    borderRadius: "999px",
                    padding: "7px 12px",
                    fontWeight: 700,
                    fontSize: "13px",
                    textAlign: "center",
                    flex: "0 1 auto",
                  }}
                >
                  {formatDays(item.days)}
                </div>

                <div
                  style={{
                    color: "#1f3c88",
                    fontWeight: 900,
                    fontSize: "17px",
                    textAlign: "right",
                    whiteSpace: "nowrap",
                    marginLeft: "auto",
                  }}
                >
                  {timeRange}
                </div>

                <div
                  style={{
                    color: "#1f3c88",
                    fontWeight: 800,
                    whiteSpace: "nowrap",
                  }}
                >
                  Open →
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </section>
  );
}
