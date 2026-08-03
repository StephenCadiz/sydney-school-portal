"use client";

import { useEffect, useState } from "react";

import StudentMenu from "../StudentMenu";
import { supabase } from "../../../lib/supabase";

type StudentClassResource = {
  id: string;
  title: string | null;
  description: string | null;
  resource_url: string | null;
};

export default function ResourcesPage() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [resources, setResources] = useState<StudentClassResource[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadResources() {
      setLoading(true);
      setError("");

      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!session?.access_token) {
          throw new Error("Authentication required.");
        }

        const response = await fetch("/api/student/resources", {
          headers: { Authorization: `Bearer ${session.access_token}` },
          cache: "no-store",
        });
        const payload = await response.json().catch(() => ({}));

        if (!response.ok) {
          throw new Error(payload?.error || "Unable to load class resources.");
        }

        if (!cancelled) {
          setResources(Array.isArray(payload?.resources) ? payload.resources : []);
        }
      } catch (loadError) {
        console.error("Student resources load failed:", loadError);
        if (!cancelled) {
          setResources([]);
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Unable to load class resources."
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadResources();

    return () => {
      cancelled = true;
    };
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

      <main className="student-main-content student-resources-page">
        <header className="student-resources-header">
          <h1>Resources</h1>
          <p>Download worksheets, PDFs, audio files and extra learning materials.</p>
        </header>

        <section className="student-resources-card">
          <h2>Class Resources</h2>

          {loading ? (
            <p>Loading class resources...</p>
          ) : error ? (
            <p role="alert">{error}</p>
          ) : resources.length === 0 ? (
            <p>No class resources are available yet.</p>
          ) : (
            resources.map((resource) => (
              <div className="student-resources-item" key={resource.id}>
                <strong>{resource.title || "Class resource"}</strong>
                {resource.description && <p>{resource.description}</p>}
                {resource.resource_url && (
                  <a
                    className="student-resources-action"
                    href={resource.resource_url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open Resource
                  </a>
                )}
              </div>
            ))
          )}
        </section>
      </main>
    </div>
  );
}
