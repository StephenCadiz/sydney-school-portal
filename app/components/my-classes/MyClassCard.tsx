"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";

type Props = {
  item: any;
};

export default function MyClassCard({ item }: Props) {
  const router = useRouter();

  const isOnlineClass =
    String(item.course_type || "").toLowerCase() === "online";
  const themeColour = isOnlineClass
    ? "#1f3c88"
    : item.classrooms?.theme_colour || "#1f3c88";
  const classTitle = item.levels?.name || "Class";
  const classroomName = isOnlineClass
    ? "Online Class"
    : item.classrooms?.name || "Classroom not assigned";
  const classroomLogo = isOnlineClass
    ? "/On-Line Logo.png"
    : item.classrooms?.logo || "/Emu Logo.png";

  return (
    <div
      style={{
        background: "#ffffff",
        borderRadius: "12px",
        marginBottom: "16px",
        overflow: "hidden",
        boxShadow: "0 2px 10px rgba(0,0,0,0.07)",
        borderLeft: `6px solid ${themeColour}`,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "18px",
          padding: "18px 20px",
        }}
      >
        {/* Logo */}

        <Image
          src={classroomLogo}
          alt={classroomName}
          width={86}
          height={86}
          style={{
            width: "86px",
            height: "86px",
            objectFit: "contain",
          }}
        />

        {/* Details */}

        <div
          style={{
            flex: 1,
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "12px",
              gap: "12px",
            }}
          >
            <h2
              style={{
                margin: 0,
                color: "#1f3c88",
                fontSize: "24px",
              }}
            >
              {classTitle}
            </h2>

            <div
              style={{
                background: item.is_cambridge
                  ? "#1f3c88"
                  : "#2e7d32",
                color: "#ffffff",
                padding: "5px 12px",
                borderRadius: "18px",
                fontSize: "11px",
                fontWeight: 700,
                whiteSpace: "nowrap",
              }}
            >
              {item.is_cambridge
                ? "CAMBRIDGE"
                : "YOUNG LEARNERS"}
            </div>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
              gap: "10px 14px",
              color: "#555",
              fontSize: "14px",
            }}
          >
            <div>
              <strong>🏫 Classroom</strong>
              <br />
              {classroomName}
            </div>

            <div>
              <strong>📅 Days</strong>
              <br />
              {item.days}
            </div>

            <div>
              <strong>🕒 Time</strong>
              <br />
              {item.start_time} – {item.end_time}
            </div>

            <div>
              <strong>👥 Capacity</strong>
              <br />
              {item.capacity || "-"} Students
            </div>
          </div>
        </div>

        {/* Button */}

        <button
          onClick={() =>
            router.push(`/teacher/class?id=${item.id}`)
          }
          style={{
            background: themeColour,
            color: "#ffffff",
            border: "none",
            padding: "10px 18px",
            borderRadius: "8px",
            cursor: "pointer",
            fontWeight: 700,
            fontSize: "14px",
            whiteSpace: "nowrap",
          }}
        >
          Open Workspace →
        </button>
      </div>
    </div>
  );
}
