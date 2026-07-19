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
  const [menuOpen, setMenuOpen] = useState(false);
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
    <div className="student-layout-shell">
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

      <main className="student-main-content student-announcements-page">
        <header className="student-announcements-header">
          <h1>Announcements</h1>
          <p>Important updates from your teacher and Sydney School.</p>
        </header>

        <section className="student-announcements-list">
          {loading && (
            <div className="student-announcements-state">
              Loading announcements...
            </div>
          )}

          {!loading && error && (
            <div className="student-announcements-state is-error">
              Unable to load announcements.
            </div>
          )}

          {!loading && !error && announcements.length === 0 && (
            <div className="student-announcements-state">
              No announcements yet.
            </div>
          )}

          {!loading &&
            !error &&
            announcements.map((announcement) => (
              <article
                key={announcement.id}
                className="student-announcements-card"
              >
                <h3>
                  {announcement.title || "Announcement"}
                </h3>

                <p>
                  {announcement.content || ""}
                </p>

                {announcement.created_at && (
                  <small className="student-announcements-date">
                    Posted {formatDate(announcement.created_at)}
                  </small>
                )}
              </article>
            ))}
        </section>
      </main>
    </div>
  );
}
