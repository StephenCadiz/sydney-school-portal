"use client";

import StudentMenu from "../StudentMenu";
import { useEffect, useState } from "react";
import {
  adjustHomeworkDatesForClassDays,
  getHomework,
} from "../../../lib/homework";
import {
  getCurrentStudentCourseInfo,
  getCurrentUser,
} from "../../../lib/user";
import { markHomeworkAsViewed } from "../../../lib/studentNotifications";

function formatDateOnly(date: string | null | undefined) {
  if (!date) {
    return "";
  }

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);

  if (!match) {
    return date;
  }

  return new Date(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3])
  ).toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

const homeworkLinkStyle = {
  display: "inline-block",
  marginTop: "10px",
  marginRight: "10px",
  color: "#1f3c88",
  fontWeight: 600,
  textDecoration: "none",
} as const;

export default function HomeworkPage() {
  const [homework, setHomework] = useState<any[]>([]);
  const groupedHomework = homework.reduce((groups: any, item: any) => {
  if (!groups[item.week_number]) {
    groups[item.week_number] = [];
  }

  groups[item.week_number].push(item);

  return groups;
}, {});

  useEffect(() => {
    async function loadHomework() {
      try {
        const user = await getCurrentUser();
        const courseInfo = await getCurrentStudentCourseInfo();

        const data = await getHomework(
          courseInfo.level,
          courseInfo.courseType
        );
        const adjustedHomework = adjustHomeworkDatesForClassDays(
          data,
          courseInfo.classroom.days
        );

        console.log("Homework from Supabase:", data);
        setHomework(adjustedHomework);

        await markHomeworkAsViewed(
          user.id,
          data.map((item) => item.id)
        );
      } catch (error) {
        console.error(error);
      }
    }

    loadHomework();
  }, []);

  return (
    <div
      style={{
        display: "flex",
        minHeight: "100vh",
        background: "#f5f7fa",
      }}
    >
      <StudentMenu />

      <main
        style={{
          flex: 1,
          padding: "40px",
        }}
      >
        <h1
          style={{
            color: "#1f3c88",
            marginBottom: "10px",
          }}
        >
          Homework
        </h1>

        <p
          style={{
            color: "#666",
            marginBottom: "40px",
          }}
        >
          View your homework assigned by your teacher.
        </p>

       {Object.entries(groupedHomework).map(([week, items]) => (
  <div
    key={week}
    style={{
      background: "#ffffff",
      borderRadius: "14px",
      padding: "30px",
      boxShadow: "0 2px 10px rgba(0,0,0,0.08)",
      maxWidth: "900px",
      marginBottom: "25px",
    }}
  >
    <h2
      style={{
        marginTop: 0,
        color: "#1f3c88",
      }}
    >
      Week {week}
    </h2>

    {(items as any[]).map((item) => (
      <div
        key={item.id}
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginTop: "25px",
          padding: "15px",
          background: "#f8f9fc",
          borderRadius: "10px",
        }}
      >
        <div>
          <div
            style={{
              fontWeight: 700,
              color: "#1f3c88",
              marginBottom: "6px",
            }}
          >
            {item.title}
          </div>

          <div
            style={{
              color: "#555",
            }}
          >
            {item.description}
          </div>

{item.homework_skill === "listening" ? (
  <>
    {item.resource_url && (
      <a
        href={item.resource_url}
        target="_blank"
        rel="noopener noreferrer"
        style={homeworkLinkStyle}
      >
        Open PDF
      </a>
    )}

    {item.audio_url && (
      <a
        href={item.audio_url}
        target="_blank"
        rel="noopener noreferrer"
        style={homeworkLinkStyle}
      >
        Open Audio
      </a>
    )}
  </>
) : (
  item.resource_url && (
    <a
      href={item.resource_url}
      target="_blank"
      rel="noopener noreferrer"
      style={homeworkLinkStyle}
    >
      Open File
    </a>
  )
)}

        </div>

        <div
          style={{
            background: "#ffe8a3",
            color: "#7a5b00",
            padding: "6px 14px",
            borderRadius: "20px",
            fontWeight: 600,
            fontSize: "14px",
          }}
        >
          Due{" "}
{formatDateOnly(item.due_date)}
        </div>
      </div>
    ))}
  </div>
))}

      </main>
    </div>
  );
}
