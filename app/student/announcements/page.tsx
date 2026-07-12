"use client";

import { useEffect, useState } from "react";

import StudentMenu from "../StudentMenu";
import { getStudentRelevantAnnouncements } from "../../../lib/announcements";
import { getCurrentStudentCourseInfo } from "../../../lib/user";

function formatDate(value?: string | null) {
  if (!value) return "";

  return new Date(value).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export default function AnnouncementsPage() {
  const [announcements, setAnnouncements] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    async function loadAnnouncements() {
      try {
        const courseInfo = await getCurrentStudentCourseInfo();
        const data = await getStudentRelevantAnnouncements(
          courseInfo.level,
          courseInfo.classroom.id
        );

        setAnnouncements(data);
      } catch (error) {
        console.error(error);
        setError(true);
      } finally {
        setLoading(false);
      }
    }

    loadAnnouncements();
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
            fontSize: "32px",
            marginBottom: "10px",
          }}
        >
          Announcements
        </h1>

        <p
          style={{
            color: "#666",
            marginBottom: "40px",
          }}
        >
          Important updates from your teacher and Sydney School.
        </p>

        <div
          style={{
            background: "#ffffff",
            borderRadius: "18px",
            padding: "30px",
            boxShadow: "0 8px 25px rgba(0,0,0,0.06)",
          }}
        >
          {loading && <p>Loading announcements...</p>}

          {!loading && error && <p>Unable to load announcements.</p>}

          {!loading && !error && announcements.length === 0 && (
            <p>No announcements yet.</p>
          )}

          {!loading &&
            !error &&
            announcements.map((announcement) => (
              <div
                key={announcement.id}
                style={{
                  padding: "20px",
                  background: "#f7f8fc",
                  border: "1px solid #e6eaf2",
                  borderRadius: "12px",
                  marginBottom: "18px",
                }}
              >
                <h3
                  style={{
                    marginTop: 0,
                    color: "#1f3c88",
                  }}
                >
                  {announcement.title || "Announcement"}
                </h3>

                <p
                  style={{
                    color: "#666",
                    lineHeight: "1.6",
                    marginBottom: "15px",
                    whiteSpace: "pre-line",
                  }}
                >
                  {announcement.content || ""}
                </p>

                {announcement.created_at && (
                  <small
                    style={{
                      color: "#999",
                    }}
                  >
                    Posted {formatDate(announcement.created_at)}
                  </small>
                )}
              </div>
            ))}
        </div>
      </main>
    </div>
  );
}
