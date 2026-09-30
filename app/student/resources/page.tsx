"use client";

import { useEffect, useState } from "react";

import StudentMenu from "../StudentMenu";
import { supabase } from "../../../lib/supabase";

type StudentResource = {
  id: string;
  title: string | null;
  description: string | null;
  resource_url: string | null;
  source: "class" | "cambridge_level";
  source_label: string;
  level_name: string | null;
  requires_signed_url: boolean;
  original_filename?: string | null;
  mime_type?: string | null;
  file_size?: number | null;
};

function formatFileSize(value?: number | null) {
  if (!value || value <= 0) return "";
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function resourceTypeLabel(resource: StudentResource) {
  if (resource.source === "cambridge_level") return "Official resource";
  return resource.original_filename ? "Class document" : "Class resource";
}

function formatResourceFileType(value?: string | null) {
  const mimeType = String(value || "").toLowerCase();
  if (!mimeType) return "";
  if (mimeType === "application/pdf") return "PDF";
  if (mimeType.includes("wordprocessingml") || mimeType === "application/msword") {
    return "Word document";
  }
  if (mimeType.includes("spreadsheetml") || mimeType === "application/vnd.ms-excel") {
    return "Spreadsheet";
  }
  if (mimeType.includes("presentationml") || mimeType === "application/vnd.ms-powerpoint") {
    return "Presentation";
  }
  if (mimeType.startsWith("audio/")) return "Audio file";
  if (mimeType.startsWith("video/")) return "Video file";
  if (mimeType.startsWith("image/")) return "Image file";
  if (mimeType.startsWith("text/")) return "Text file";
  return "File";
}

export default function ResourcesPage() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [resources, setResources] = useState<StudentResource[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [openingResourceId, setOpeningResourceId] = useState("");
  const [openError, setOpenError] = useState("");

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

  async function handleOpenPrivateResource(resource: StudentResource) {
    if (!resource.requires_signed_url || openingResourceId) return;

    setOpeningResourceId(resource.id);
    setOpenError("");
    const popup = window.open("about:blank", "_blank");

    try {
      if (popup) {
        popup.document.title = "Opening resource";
        popup.document.body.innerHTML =
          '<p style="font-family: sans-serif; padding: 24px;">Opening resource...</p>';
      }

      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) {
        throw new Error("Authentication required.");
      }

      const response = await fetch("/api/student/resources", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ resourceId: resource.id }),
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok || !payload?.signedUrl) {
        throw new Error(payload?.error || "Unable to open resource file.");
      }

      if (popup) {
        popup.opener = null;
        popup.location.href = String(payload.signedUrl);
      } else {
        window.open(String(payload.signedUrl), "_blank", "noopener,noreferrer");
      }
    } catch (openResourceError) {
      console.error("Student resource open failed:", openResourceError);
      popup?.close();
      setOpenError(
        openResourceError instanceof Error
          ? openResourceError.message
          : "Unable to open resource file."
      );
    } finally {
      setOpeningResourceId("");
    }
  }

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
          <h2>Learning Resources</h2>

          {openError && (
            <p className="student-resources-error" role="alert">
              {openError}
            </p>
          )}

          {loading ? (
            <p>Loading resources...</p>
          ) : error ? (
            <p role="alert">{error}</p>
          ) : resources.length === 0 ? (
            <p>No learning resources are available yet.</p>
          ) : (
            resources.map((resource) => (
              <article
                className="student-resources-item"
                key={`${resource.source}-${resource.id}`}
              >
                <header className="student-resources-item-header">
                  <div className="student-resources-origin">
                    <span>{resource.source_label}</span>
                    <small>
                      {resource.source === "cambridge_level"
                        ? "Sydney School"
                        : "Your class"}
                    </small>
                  </div>
                  <span className="student-resources-type">
                    {resourceTypeLabel(resource)}
                  </span>
                </header>

                <div className="student-resources-item-content">
                  <h3>{resource.title || "Learning resource"}</h3>
                  {resource.description && <p>{resource.description}</p>}
                  {(formatResourceFileType(resource.mime_type) || resource.file_size) && (
                    <div className="student-resources-metadata" aria-label="File details">
                      {formatResourceFileType(resource.mime_type) && (
                        <span>{formatResourceFileType(resource.mime_type)}</span>
                      )}
                      {formatFileSize(resource.file_size) && (
                        <span>{formatFileSize(resource.file_size)}</span>
                      )}
                    </div>
                  )}
                </div>

                <div className="student-resources-item-actions">
                  {resource.resource_url && (
                    <a
                      className="student-resources-action"
                      href={resource.resource_url}
                      target="_blank"
                      rel="noreferrer"
                      aria-label={`Open ${resource.title || "learning resource"}`}
                    >
                      Open Resource
                    </a>
                  )}
                  {resource.requires_signed_url && (
                    <button
                      type="button"
                      className="student-resources-action"
                      onClick={() => handleOpenPrivateResource(resource)}
                      disabled={Boolean(openingResourceId)}
                      aria-label={`Open ${resource.title || "learning resource"}`}
                    >
                      {openingResourceId === resource.id
                        ? "Opening..."
                        : "Open Resource"}
                    </button>
                  )}
                </div>
              </article>
            ))
          )}
        </section>
      </main>
    </div>
  );
}
