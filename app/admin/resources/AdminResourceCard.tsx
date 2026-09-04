"use client";

import { FormEvent, useState } from "react";

import {
  getTeacherResourceSignedUrl,
  type TeacherResource,
  updateCambridgeStudentResource,
} from "../../../lib/teacherResources";
import {
  formatTeacherResourceFileSize,
  TEACHER_RESOURCE_DESCRIPTION_MAX_LENGTH,
  TEACHER_RESOURCE_TITLE_MAX_LENGTH,
  validateTeacherResourceDescription,
  validateTeacherResourceExternalUrl,
  validateTeacherResourceLevelId,
  validateTeacherResourceTitle,
} from "../../../lib/teacherResourceValidation";

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

const secondaryButtonStyle = {
  ...primaryButtonStyle,
  background: "#ffffff",
  border: "1px solid var(--ss-border, #dbe7f3)",
  color: "var(--ss-blue-dark, #1f3c88)",
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
  levels?: Array<{ id: string | number; name: string }>;
  onUpdated?: () => void | Promise<void>;
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

function getScopeLabel(resource: TeacherResource) {
  if (resource.resource_scope === "general_teacher") {
    return "General Teacher Resource";
  }

  if (resource.resource_scope === "cambridge_student") {
    return "Cambridge Student Resource";
  }

  return resource.resource_scope === "shared_teacher"
    ? "Shared Teacher Resource"
    : "Official Teacher Resource";
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
  levels = [],
  onUpdated,
}: AdminResourceCardProps) {
  const [openingFile, setOpeningFile] = useState(false);
  const [openError, setOpenError] = useState("");
  const [editing, setEditing] = useState(false);
  const [editLevelId, setEditLevelId] = useState(String(resource.level_id));
  const [editTitle, setEditTitle] = useState(resource.title);
  const [editDescription, setEditDescription] = useState(resource.description);
  const [editExternalUrl, setEditExternalUrl] = useState(
    resource.external_url || ""
  );
  const [editError, setEditError] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const fileSize = formatTeacherResourceFileSize(resource.file_size);
  const sourceType = resource.external_url ? "External link" : "Private file";
  const fileMetadata = [
    resource.original_filename,
    resource.mime_type,
    fileSize,
  ].filter(Boolean);
  const levelName = String(resource.level_name || "Unknown Level").trim();
  const resourceContext =
    resource.resource_scope === "general_teacher"
      ? getScopeLabel(resource)
      : `${levelName} · ${getScopeLabel(resource)}`;

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

  function startEdit() {
    setEditLevelId(String(resource.level_id));
    setEditTitle(resource.title);
    setEditDescription(resource.description);
    setEditExternalUrl(resource.external_url || "");
    setEditError("");
    setEditing(true);
  }

  async function handleSaveEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (savingEdit) return;

    const levelValidation = validateTeacherResourceLevelId(editLevelId);
    const titleValidation = validateTeacherResourceTitle(editTitle);
    const descriptionValidation =
      validateTeacherResourceDescription(editDescription);
    const urlValidation = resource.external_url
      ? validateTeacherResourceExternalUrl(editExternalUrl)
      : { value: "", error: "" };
    const firstError =
      levelValidation.error ||
      titleValidation.error ||
      descriptionValidation.error ||
      urlValidation.error;

    if (firstError) {
      setEditError(firstError);
      return;
    }

    setSavingEdit(true);
    setEditError("");

    try {
      await updateCambridgeStudentResource({
        resourceId: resource.id,
        levelId: levelValidation.value,
        title: titleValidation.value,
        description: descriptionValidation.value,
        externalUrl: resource.external_url ? urlValidation.value : null,
      });
      setEditing(false);
      await onUpdated?.();
    } catch (error) {
      console.error("Unable to update Cambridge Student Resource:", error);
      setEditError(
        error instanceof Error ? error.message : "Unable to update resource."
      );
    } finally {
      setSavingEdit(false);
    }
  }

  if (editing) {
    return (
      <article style={cardStyle}>
        <form onSubmit={handleSaveEdit} style={{ display: "grid", gap: "14px" }}>
          <div style={{ display: "grid", gap: "6px" }}>
            <h3
              style={{
                color: "var(--ss-blue-dark, #1f3c88)",
                fontSize: "19px",
                margin: 0,
              }}
            >
              Edit Cambridge Student Resource
            </h3>
            <p style={{ color: "#667085", lineHeight: 1.5, margin: 0 }}>
              Changes apply to every current student at the selected level.
            </p>
          </div>

          <label style={{ display: "grid", gap: "6px", fontWeight: 700 }}>
            Level
            <select
              value={editLevelId}
              onChange={(event) => setEditLevelId(event.target.value)}
              disabled={savingEdit}
              style={{
                background: "#ffffff",
                border: "1px solid #d9e2ef",
                borderRadius: "9px",
                fontSize: "15px",
                padding: "10px 11px",
              }}
            >
              {levels.map((level) => (
                <option key={level.id} value={level.id}>
                  {level.name}
                </option>
              ))}
            </select>
          </label>

          <label style={{ display: "grid", gap: "6px", fontWeight: 700 }}>
            Title
            <input
              value={editTitle}
              onChange={(event) => setEditTitle(event.target.value)}
              disabled={savingEdit}
              maxLength={TEACHER_RESOURCE_TITLE_MAX_LENGTH}
              style={{
                border: "1px solid #d9e2ef",
                borderRadius: "9px",
                fontSize: "15px",
                padding: "10px 11px",
              }}
            />
          </label>

          <label style={{ display: "grid", gap: "6px", fontWeight: 700 }}>
            Short description
            <textarea
              value={editDescription}
              onChange={(event) => setEditDescription(event.target.value)}
              disabled={savingEdit}
              maxLength={TEACHER_RESOURCE_DESCRIPTION_MAX_LENGTH}
              rows={3}
              style={{
                border: "1px solid #d9e2ef",
                borderRadius: "9px",
                font: "inherit",
                padding: "10px 11px",
                resize: "vertical",
              }}
            />
          </label>

          {resource.external_url ? (
            <label style={{ display: "grid", gap: "6px", fontWeight: 700 }}>
              External HTTPS link
              <input
                type="url"
                value={editExternalUrl}
                onChange={(event) => setEditExternalUrl(event.target.value)}
                disabled={savingEdit}
                style={{
                  border: "1px solid #d9e2ef",
                  borderRadius: "9px",
                  fontSize: "15px",
                  padding: "10px 11px",
                }}
              />
            </label>
          ) : (
            <p style={{ color: "#667085", fontSize: "13px", margin: 0 }}>
              The current uploaded file will be retained.
            </p>
          )}

          {editError && (
            <p
              role="alert"
              style={{ color: "#b42318", lineHeight: 1.45, margin: 0 }}
            >
              {editError}
            </p>
          )}

          <div style={{ display: "flex", flexWrap: "wrap", gap: "10px" }}>
            <button
              type="submit"
              disabled={savingEdit}
              style={savingEdit ? disabledButtonStyle : primaryButtonStyle}
            >
              {savingEdit ? "Saving..." : "Save Changes"}
            </button>
            <button
              type="button"
              disabled={savingEdit}
              onClick={() => setEditing(false)}
              style={secondaryButtonStyle}
            >
              Cancel
            </button>
          </div>
        </form>
      </article>
    );
  }

  return (
    <article style={cardStyle}>
      <div style={{ display: "grid", gap: "7px" }}>
        <span
          style={{
            color: "var(--ss-blue-dark, #1f3c88)",
            fontSize: "12px",
            fontWeight: 800,
            letterSpacing: 0,
          }}
        >
          {resourceContext}
        </span>
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

        {resource.resource_scope === "cambridge_student" && onUpdated && (
          <button type="button" onClick={startEdit} style={secondaryButtonStyle}>
            Edit Resource
          </button>
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
