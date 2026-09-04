"use client";

import { useEffect, useState } from "react";

import TeacherLayout from "../../components/layout/TeacherLayout";
import { supabase } from "../../../lib/supabase";
import type { TeacherResource } from "../../../lib/teacherResources";
import TeacherResourceCard from "../class/TeacherResourceCard";

function ResourceLibraryIcon() {
  return (
    <svg
      aria-hidden="true"
      width="28"
      height="28"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z" />
      <path d="M8 7h8" />
      <path d="M8 11h6" />
    </svg>
  );
}

export default function TeacherResourcesPage() {
  const [resources, setResources] = useState<TeacherResource[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

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
          throw new Error("Your Teacher session has expired. Please sign in again.");
        }

        const response = await fetch("/api/teacher/resources", {
          headers: { Authorization: `Bearer ${session.access_token}` },
          cache: "no-store",
        });
        const payload = await response.json().catch(() => ({}));

        if (!response.ok) {
          throw new Error(
            payload?.error || "General Teacher Resources could not be loaded."
          );
        }

        if (!cancelled) {
          setResources(
            Array.isArray(payload?.resources) ? payload.resources : []
          );
        }
      } catch (loadError) {
        console.error("General Teacher Resources load failed:", loadError);

        if (!cancelled) {
          setResources([]);
          setError(
            loadError instanceof Error
              ? loadError.message
              : "General Teacher Resources could not be loaded."
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
  }, [reloadKey]);

  return (
    <TeacherLayout>
      <div className="teacher-general-resources-page">
        <header className="teacher-general-resources-header">
          <div className="teacher-general-resources-icon">
            <ResourceLibraryIcon />
          </div>
          <div className="teacher-general-resources-heading">
            <span>Teacher library</span>
            <h1>General Teacher Resources</h1>
            <p>
              School-wide guides, templates and teaching materials selected by
              Sydney School for every Teacher.
            </p>
          </div>
          <div className="teacher-general-resources-audience">
            Available to all Teachers
          </div>
        </header>

        <section
          className="teacher-general-resources-library"
          aria-labelledby="general-resources-library-heading"
        >
          <div className="teacher-general-resources-library-heading">
            <div>
              <span>Official collection</span>
              <h2 id="general-resources-library-heading">Resource Library</h2>
            </div>
            {!loading && !error && resources.length > 0 && (
              <p>
                {resources.length} {resources.length === 1 ? "resource" : "resources"}
              </p>
            )}
          </div>

          {loading ? (
            <div
              className="teacher-general-resources-loading"
              aria-live="polite"
              aria-label="Loading General Teacher Resources"
            >
              {[0, 1, 2].map((item) => (
                <div key={item} className="teacher-general-resource-skeleton">
                  <span />
                  <span />
                  <span />
                </div>
              ))}
            </div>
          ) : error ? (
            <div className="teacher-general-resources-state is-error" role="alert">
              <strong>Resources could not be loaded</strong>
              <p>{error}</p>
              <button
                type="button"
                onClick={() => setReloadKey((current) => current + 1)}
              >
                Try Again
              </button>
            </div>
          ) : resources.length === 0 ? (
            <div className="teacher-general-resources-state">
              <strong>No general resources yet</strong>
              <p>
                Resources published for all Teachers will appear here when they
                become available.
              </p>
            </div>
          ) : (
            <div className="teacher-general-resources-grid">
              {resources.map((resource) => (
                <TeacherResourceCard
                  key={resource.id}
                  resource={resource}
                  showResourceType
                />
              ))}
            </div>
          )}
        </section>
      </div>
    </TeacherLayout>
  );
}
