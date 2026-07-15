"use client";

import { useState } from "react";

import {
  getTeacherResourceSignedUrl,
  type TeacherResource,
} from "../../../lib/teacherResources";
import { formatTeacherResourceFileSize } from "../../../lib/teacherResourceValidation";

const cardStyle = {
  background: "#ffffff",
  border: "1px solid var(--ss-border, #dbe7f3)",
  borderRadius: "14px",
  padding: "18px",
  boxShadow: "0 4px 14px rgba(31,60,136,0.06)",
  display: "grid",
  gap: "12px",
  overflowWrap: "anywhere" as const,
} as const;

const primaryButtonStyle = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: "8px",
  width: "fit-content",
  maxWidth: "100%",
  background: "var(--ss-blue, #2f7db8)",
  color: "#ffffff",
  border: "none",
  borderRadius: "9px",
  padding: "10px 14px",
  fontWeight: 700,
  textDecoration: "none",
  fontSize: "14px",
  cursor: "pointer",
} as const;

const dangerButtonStyle = {
  ...primaryButtonStyle,
  background: "#b42318",
} as const;

const disabledButtonStyle = {
  ...primaryButtonStyle,
  background: "#edf2f7",
  color: "#667085",
  border: "1px solid #dbe7f3",
  cursor: "not-allowed",
} as const;

type AdminResourceCardProps = {
  resource: TeacherResource;
  showCreator?: boolean;
  deleting?: boolean;
  onRequestDelete: (resource: TeacherResource) => void;
};

function formatDate(value: string | null | undefined) {
  if (!value) {
    return "Date not available";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Date not available";
  }

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function ExternalLinkIcon() {
  return (
    <svg
      aria-hidden="true"
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M15 3h6v6" />
      <path d="M10 14 21 3" />
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
    </svg>
  );
}

export default function AdminResourceCard({
  resource,
  showCreator = false,
  deleting = false,
  onRequestDelete,
}: AdminResourceCardProps) {
  const [openingFile, setOpeningFile] = useState(false);
  const [openError, setOpenError] = useState("");
  const fileSize = formatTeacherResourceFileSize(resource.file_size);
  const sourceType = resource.external_url ? "External link" : "Private file";
  const fileMetadata = [
    resource.original_filename,
    resource.mime_type,
    fileSize,
  ].filter(Boolean);

  async function handleOpenFile() {
    if (!resource.storage_path || openingFile) {
      return;
    }

    setOpeningFile(true);
    setOpenError("");

    const popup = window.open("about:blank", "_blank");

    try {
      if (popup) {
        popup.document.title = "Opening resource";
        popup.document.body.innerHTML =
          "<p style=\"font-family: sans-serif; padding: 24px;\">Opening resource...</p>";
      }

      const signedUrl = await getTeacherResourceSignedUrl(resource.id);

      if (popup) {
        popup.opener = null;
        popup.location.href = signedUrl;
      } else {
        window.open(signedUrl, "_blank", "noopener,noreferrer");
      }
    } catch (error) {
      console.error("Unable to open admin teacher resource file:", error);

      if (popup) {
        popup.close();
      }

      setOpenError("File could not be opened. Please try again.");
    } finally {
      setOpeningFile(false);
    }
  }

  return (
    <article style={cardStyle}>
      <div style={{ display: "grid", gap: "7px" }}>
        <h3
          style={{
            margin: 0,
            color: "var(--ss-blue-dark, #1f3c88)",
            fontSize: "19px",
            lineHeight: 1.25,
          }}
        >
          {resource.title}
        </h3>
        <p style={{ margin: 0, color: "#475467", lineHeight: 1.55 }}>
          {resource.description}
        </p>
      </div>

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "8px 14px",
          color: "#667085",
          fontSize: "13px",
          lineHeight: 1.4,
        }}
      >
        <span>Level: {resource.level_name || "Unknown Level"}</span>
        <span>Added {formatDate(resource.created_at)}</span>
        <span>{sourceType}</span>
        {showCreator && (
          <span>Posted by {resource.creator_name || "Sydney School"}</span>
        )}
      </div>

      {resource.storage_path && (
        <div
          style={{
            background: "#f8fafd",
            border: "1px solid #e6eaf2",
            borderRadius: "10px",
            padding: "10px 12px",
            color: "#475467",
            fontSize: "14px",
            lineHeight: 1.45,
          }}
        >
          {fileMetadata.length > 0 ? fileMetadata.join(" - ") : "Uploaded file"}
        </div>
      )}

      {openError && (
        <div
          aria-live="polite"
          style={{
            color: "#b42318",
            background: "#fff5f5",
            border: "1px solid #fecdca",
            borderRadius: "9px",
            padding: "9px 11px",
            fontSize: "14px",
          }}
        >
          {openError}
        </div>
      )}

      <div
        style={{
          display: "flex",
          gap: "10px",
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        {resource.external_url ? (
          <a
            href={resource.external_url}
            target="_blank"
            rel="noopener noreferrer"
            style={primaryButtonStyle}
          >
            Open Resource <ExternalLinkIcon />
          </a>
        ) : resource.storage_path ? (
          <button
            type="button"
            onClick={handleOpenFile}
            disabled={openingFile}
            style={openingFile ? disabledButtonStyle : primaryButtonStyle}
          >
            {openingFile ? "Opening..." : "Open File"}
          </button>
        ) : (
          <span style={{ color: "#667085", fontSize: "14px" }}>
            Resource source not available.
          </span>
        )}

        <button
          type="button"
          onClick={() => onRequestDelete(resource)}
          disabled={deleting}
          style={deleting ? disabledButtonStyle : dangerButtonStyle}
        >
          {deleting ? "Deleting..." : "Delete Resource"}
        </button>
      </div>
    </article>
  );
}
