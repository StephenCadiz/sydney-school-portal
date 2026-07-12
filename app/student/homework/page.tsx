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

type HomeworkItem = {
  id: string;
  week_number: string | number;
  title?: string | null;
  description?: string | null;
  homework_skill?: string | null;
  resource_url?: string | null;
  audio_url?: string | null;
  due_date?: string | null;
};

export default function HomeworkPage() {
  const [homework, setHomework] = useState<HomeworkItem[]>([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const groupedHomework = homework.reduce<Record<string, HomeworkItem[]>>((groups, item) => {
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
      } finally {
        setLoading(false);
      }
    }

    loadHomework();
  }, []);

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
          className="student-mobile-drawer-overlay"
          onClick={() => setMenuOpen(false)}
        />
      )}

      <div className={`student-mobile-drawer ${menuOpen ? "open" : ""}`}>
        <button
          type="button"
          className="student-mobile-drawer-close"
          onClick={() => setMenuOpen(false)}
        >
          Close
        </button>
        <StudentMenu mobileMode onClose={() => setMenuOpen(false)} />
      </div>

      <aside className="student-desktop-sidebar">
        <StudentMenu />
      </aside>

      <main
        className="student-main-content student-homework-page"
        style={{
          flex: 1,
          padding: "40px",
        }}
      >
        <h1
          className="student-homework-header"
          style={{
            color: "#1f3c88",
            marginBottom: "10px",
          }}
        >
          Homework
        </h1>

        <p
          className="student-homework-subtitle"
          style={{
            color: "#666",
            marginBottom: "40px",
          }}
        >
          View your homework assigned by your teacher.
        </p>

       {loading ? (
  <div
    className="student-homework-empty"
    style={{
      background: "#ffffff",
      borderRadius: "14px",
      padding: "30px",
      boxShadow: "0 2px 10px rgba(0,0,0,0.08)",
      maxWidth: "900px",
      marginBottom: "25px",
      color: "#666",
      fontWeight: 600,
    }}
  >
    Loading homework...
  </div>
) : homework.length === 0 ? (
  <div
    className="student-homework-empty"
    style={{
      background: "#ffffff",
      borderRadius: "14px",
      padding: "30px",
      boxShadow: "0 2px 10px rgba(0,0,0,0.08)",
      maxWidth: "900px",
      marginBottom: "25px",
      color: "#666",
      fontWeight: 600,
    }}
  >
    No homework has been posted yet.
  </div>
) : (
  <div className="student-homework-weeks">
       {Object.entries(groupedHomework).map(([week, items]) => (
  <div
    key={week}
    className="student-homework-week-card"
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
      className="student-homework-week-title"
      style={{
        marginTop: 0,
        color: "#1f3c88",
      }}
    >
      Week {week}
    </h2>

    {items.map((item) => (
      <div
        key={item.id}
        className="student-homework-item"
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
        <div className="student-homework-item-content">
          <div
            className="student-homework-item-title"
            style={{
              fontWeight: 700,
              color: "#1f3c88",
              marginBottom: "6px",
            }}
          >
            {item.title}
          </div>

          <div
            className="student-homework-description"
            style={{
              color: "#555",
            }}
          >
            {item.description}
          </div>

<div className="student-homework-links">
{item.homework_skill === "listening" ? (
  <>
    {item.resource_url && (
      <a
        className="student-homework-link"
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
        className="student-homework-link"
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
      className="student-homework-link"
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

        </div>

        <div
          className="student-homework-due-date"
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
  </div>
)}

      </main>
    </div>
  );
}
