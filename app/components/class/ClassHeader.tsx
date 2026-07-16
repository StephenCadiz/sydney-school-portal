"use client";

import Image from "next/image";

type Props = {
  classData: any;
  studentCount: number;
};

function normalizeLevelName(levelName: string | null | undefined) {
  return String(levelName || "").trim().toUpperCase();
}

function isSupportLevelName(levelName: string | null | undefined) {
  return normalizeLevelName(levelName) === "SUPPORT CLASSES";
}

export default function ClassHeader({
  classData,
  studentCount,
}: Props) {
  if (!classData) return null;

  const classroom = classData.classrooms;
  const isOnlineClass =
    String(classData.course_type || "").toLowerCase() === "online";
  const themeColour = isOnlineClass
    ? "#1f3c88"
    : classroom?.theme_colour || "#1f3c88";
  const levelName = classData.level_name || "";
  const title = levelName
    ? `${levelName} Class Workspace`
    : "Class Workspace";
  const isSupportClass =
    classData.is_cambridge !== true && isSupportLevelName(levelName);
  const classroomName = isOnlineClass
    ? "Online Class"
    : classroom?.name || "Classroom not assigned";
  const classroomLogo = isOnlineClass
    ? "/On-Line Logo.png"
    : classroom?.logo || "/Emu Logo.png";

  return (
    <div
      style={{
        background: "#ffffff",
        border: "1px solid #e6eaf2",
        borderRadius: "16px",
        padding: "26px",
        marginBottom: "24px",
        boxShadow: "0 8px 24px rgba(31,60,136,0.08)",
        borderLeft: `7px solid ${themeColour}`,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: "24px",
          marginBottom: "22px",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "18px",
            minWidth: 0,
          }}
        >
          <div
            style={{
              background: "#f5f7fa",
              border: "1px solid #e6eaf2",
              borderRadius: "14px",
              padding: "12px",
              flex: "0 0 auto",
            }}
          >
            <Image
              src={classroomLogo}
              alt={classroomName}
              width={82}
              height={82}
              style={{
                width: "82px",
                height: "82px",
                objectFit: "contain",
              }}
            />
          </div>

          <div>
            <h1
              style={{
                margin: 0,
                color: "#1f3c88",
                fontSize: "32px",
                lineHeight: 1.15,
              }}
            >
              {title}
            </h1>

            <p
              style={{
                margin: "8px 0 0",
                color: "#667085",
                fontSize: "16px",
              }}
            >
              Class Workspace
            </p>
          </div>
        </div>

        <div
          style={{
            background: classData.is_cambridge
              ? "#1f3c88"
              : isSupportClass
              ? "#8a5a00"
              : "#2e7d32",
            color: "#ffffff",
            padding: "8px 16px",
            borderRadius: "25px",
            fontWeight: 700,
            fontSize: "12px",
            whiteSpace: "nowrap",
          }}
        >
          {classData.is_cambridge
            ? "CAMBRIDGE"
            : isSupportClass
            ? "SUPPORT"
            : "YOUNG LEARNERS"}
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
          gap: "16px",
        }}
      >
        {[
          {
            label: "Classroom",
            value: classroomName,
          },
          {
            label: "Days",
            value: classData.days || "-",
          },
          {
            label: "Time",
            value:
              classData.start_time && classData.end_time
                ? `${classData.start_time} - ${classData.end_time}`
                : "-",
          },
          {
            label: "Students",
            value: studentCount,
          },
          {
            label: "Level",
            value: levelName || "-",
          },
        ].map((item) => (
          <div
            key={item.label}
            style={{
              background: "#f8fafd",
              border: "1px solid #eef2f7",
              borderRadius: "10px",
              padding: "13px",
            }}
          >
            <div
              style={{
                color: "#667085",
                fontSize: "13px",
                marginBottom: "5px",
              }}
            >
              {item.label}
            </div>

            <strong
              style={{
                color: "#1f3c88",
                fontSize: "15px",
              }}
            >
              {item.value}
            </strong>
          </div>
        ))}
      </div>
    </div>
  );
}
