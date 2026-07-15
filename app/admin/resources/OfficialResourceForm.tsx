"use client";

import { useRef, useState } from "react";

import { createOfficialTeacherResource } from "../../../lib/teacherResources";
import {
  formatTeacherResourceFileSize,
  TEACHER_RESOURCE_ALLOWED_MIME_TYPES,
  TEACHER_RESOURCE_DESCRIPTION_MAX_LENGTH,
  TEACHER_RESOURCE_TITLE_MAX_LENGTH,
  type TeacherResourceType,
  validateTeacherResourceDescription,
  validateTeacherResourceExternalUrl,
  validateTeacherResourceFile,
  validateTeacherResourceLevelId,
  validateTeacherResourceTitle,
} from "../../../lib/teacherResourceValidation";

type LevelOption = {
  id: string | number;
  name: string;
};

type FieldErrors = {
  levelId?: string;
  title?: string;
  description?: string;
  externalUrl?: string;
  file?: string;
};

type OfficialResourceFormProps = {
  levels: LevelOption[];
  onCreated: (message: string) => void | Promise<void>;
};

const buttonStyle = {
  width: "fit-content",
  background: "var(--ss-blue, #2f7db8)",
  color: "#ffffff",
  border: "none",
  borderRadius: "9px",
  padding: "10px 14px",
  fontWeight: 700,
  cursor: "pointer",
} as const;

const secondaryButtonStyle = {
  ...buttonStyle,
  background: "#ffffff",
  color: "var(--ss-blue-dark, #1f3c88)",
  border: "1px solid var(--ss-border, #dbe7f3)",
} as const;

const inputStyle = {
  width: "100%",
  boxSizing: "border-box" as const,
  border: "1px solid #d9e2ef",
  borderRadius: "10px",
  padding: "11px 12px",
  fontSize: "15px",
  color: "#111827",
  background: "#ffffff",
};

const formCardStyle = {
  background: "#ffffff",
  border: "1px solid var(--ss-border, #dbe7f3)",
  borderRadius: "14px",
  padding: "20px",
  boxShadow: "0 4px 14px rgba(31,60,136,0.06)",
  display: "grid",
  gap: "16px",
} as const;

function characterHelp(value: string, maxLength: number) {
  return `${Math.max(0, maxLength - value.length)} characters remaining`;
}

export default function OfficialResourceForm({
  levels,
  onCreated,
}: OfficialResourceFormProps) {
  const [showForm, setShowForm] = useState(false);
  const [levelId, setLevelId] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [resourceType, setResourceType] =
    useState<TeacherResourceType>("file");
  const [externalUrl, setExternalUrl] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState("");
  const [publishing, setPublishing] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  function resetForm() {
    setLevelId("");
    setTitle("");
    setDescription("");
    setResourceType("file");
    setExternalUrl("");
    setSelectedFile(null);
    setFieldErrors({});
    setFormError("");

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  function handleSelectedFile(file: File | undefined) {
    setFormError("");

    if (!file) {
      return;
    }

    const validation = validateTeacherResourceFile({
      name: file.name,
      type: file.type,
      size: file.size,
    });

    if (validation.error) {
      setSelectedFile(null);
      setFieldErrors((current) => ({
        ...current,
        file: validation.error,
      }));
      return;
    }

    setSelectedFile(file);
    setFieldErrors((current) => ({
      ...current,
      file: "",
    }));
  }

  function validateForm() {
    const nextErrors: FieldErrors = {};
    const levelValidation = validateTeacherResourceLevelId(levelId);
    const titleValidation = validateTeacherResourceTitle(title);
    const descriptionValidation = validateTeacherResourceDescription(description);

    if (levelValidation.error) {
      nextErrors.levelId = "Please choose a level.";
    }

    if (titleValidation.error) {
      nextErrors.title = titleValidation.error;
    }

    if (descriptionValidation.error) {
      nextErrors.description = descriptionValidation.error;
    }

    if (resourceType === "link") {
      const urlValidation = validateTeacherResourceExternalUrl(externalUrl);

      if (urlValidation.error) {
        nextErrors.externalUrl = urlValidation.error;
      }
    } else {
      const fileValidation = selectedFile
        ? validateTeacherResourceFile({
            name: selectedFile.name,
            type: selectedFile.type,
            size: selectedFile.size,
          })
        : { error: "Please choose a file to upload." };

      if (fileValidation.error) {
        nextErrors.file = fileValidation.error;
      }
    }

    setFieldErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError("");

    if (!validateForm()) {
      return;
    }

    setPublishing(true);

    try {
      await createOfficialTeacherResource({
        levelId,
        title,
        description,
        resourceType,
        externalUrl,
        file: selectedFile,
      });

      resetForm();
      setShowForm(false);
      await onCreated("Official Resource published.");
    } catch (error) {
      console.error("Official Resource publish failed:", error);
      setFormError(
        error instanceof Error
          ? error.message
          : "Unable to publish official resource."
      );
    } finally {
      setPublishing(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: "14px" }}>
      <button
        type="button"
        onClick={() => {
          setShowForm((current) => !current);
          setFormError("");
        }}
        style={buttonStyle}
      >
        Add Official Resource
      </button>

      {showForm && (
        <form onSubmit={handleSubmit} style={formCardStyle}>
          <div style={{ display: "grid", gap: "6px" }}>
            <h2
              style={{
                margin: 0,
                color: "var(--ss-blue-dark, #1f3c88)",
                fontSize: "20px",
              }}
            >
              Add Official Resource
            </h2>
            <p style={{ margin: 0, color: "#667085" }}>
              Official resources are available to teachers of the selected level.
            </p>
          </div>

          <div style={{ display: "grid", gap: "7px" }}>
            <label htmlFor="official-resource-level" style={{ fontWeight: 700 }}>
              Level
            </label>
            <select
              id="official-resource-level"
              value={levelId}
              onChange={(event) => setLevelId(event.target.value)}
              style={inputStyle}
            >
              <option value="">Choose a level</option>
              {levels.map((level) => (
                <option key={level.id} value={level.id}>
                  {level.name}
                </option>
              ))}
            </select>
            {fieldErrors.levelId && (
              <small style={{ color: "#b42318" }}>{fieldErrors.levelId}</small>
            )}
          </div>

          <div style={{ display: "grid", gap: "7px" }}>
            <label htmlFor="official-resource-title" style={{ fontWeight: 700 }}>
              Title
            </label>
            <input
              id="official-resource-title"
              value={title}
              maxLength={TEACHER_RESOURCE_TITLE_MAX_LENGTH}
              onChange={(event) => setTitle(event.target.value)}
              style={inputStyle}
            />
            <small style={{ color: "#667085" }}>
              {characterHelp(title, TEACHER_RESOURCE_TITLE_MAX_LENGTH)}
            </small>
            {fieldErrors.title && (
              <small style={{ color: "#b42318" }}>{fieldErrors.title}</small>
            )}
          </div>

          <div style={{ display: "grid", gap: "7px" }}>
            <label
              htmlFor="official-resource-description"
              style={{ fontWeight: 700 }}
            >
              Short description
            </label>
            <textarea
              id="official-resource-description"
              value={description}
              maxLength={TEACHER_RESOURCE_DESCRIPTION_MAX_LENGTH}
              onChange={(event) => setDescription(event.target.value)}
              rows={4}
              style={{ ...inputStyle, resize: "vertical" }}
            />
            <small style={{ color: "#667085" }}>
              Explain what the resource contains and how teachers should use it.{" "}
              {characterHelp(
                description,
                TEACHER_RESOURCE_DESCRIPTION_MAX_LENGTH
              )}
            </small>
            {fieldErrors.description && (
              <small style={{ color: "#b42318" }}>
                {fieldErrors.description}
              </small>
            )}
          </div>

          <fieldset
            style={{
              border: "1px solid var(--ss-border, #dbe7f3)",
              borderRadius: "12px",
              padding: "14px",
              display: "grid",
              gap: "10px",
            }}
          >
            <legend style={{ fontWeight: 700, padding: "0 6px" }}>
              Resource type
            </legend>
            <label
              style={{
                display: "flex",
                gap: "9px",
                alignItems: "center",
                cursor: "pointer",
              }}
            >
              <input
                type="radio"
                name="official-resource-type"
                value="file"
                checked={resourceType === "file"}
                onChange={() => {
                  setResourceType("file");
                  setExternalUrl("");
                  setFieldErrors({});
                }}
              />
              Upload File
            </label>
            <label
              style={{
                display: "flex",
                gap: "9px",
                alignItems: "center",
                cursor: "pointer",
              }}
            >
              <input
                type="radio"
                name="official-resource-type"
                value="link"
                checked={resourceType === "link"}
                onChange={() => {
                  setResourceType("link");
                  setSelectedFile(null);
                  setFieldErrors({});

                  if (fileInputRef.current) {
                    fileInputRef.current.value = "";
                  }
                }}
              />
              External Link
            </label>
          </fieldset>

          {resourceType === "file" ? (
            <div style={{ display: "grid", gap: "10px" }}>
              <input
                ref={fileInputRef}
                type="file"
                accept={TEACHER_RESOURCE_ALLOWED_MIME_TYPES.join(",")}
                style={{ display: "none" }}
                onChange={(event) =>
                  handleSelectedFile(event.target.files?.[0])
                }
              />
              <div
                role="button"
                tabIndex={0}
                onClick={() => fileInputRef.current?.click()}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    fileInputRef.current?.click();
                  }
                }}
                onDragOver={(event) => {
                  event.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={(event) => {
                  event.preventDefault();
                  setIsDragging(false);
                  handleSelectedFile(event.dataTransfer.files?.[0]);
                }}
                style={{
                  border: isDragging
                    ? "2px solid var(--ss-blue, #2f7db8)"
                    : "2px dashed var(--ss-border, #dbe7f3)",
                  borderRadius: "14px",
                  padding: "24px",
                  textAlign: "center",
                  cursor: "pointer",
                  background: isDragging ? "#eaf5fc" : "#f8fafd",
                  color: "#475467",
                  overflowWrap: "anywhere",
                }}
              >
                Drag a file here or click to browse
                <div style={{ marginTop: "8px", fontSize: "13px" }}>
                  PDF, DOCX, PPTX, XLSX, JPG, PNG, WEBP, MP3 or M4A. Maximum
                  50 MB.
                </div>
              </div>

              {selectedFile && (
                <div
                  style={{
                    background: "#ffffff",
                    border: "1px solid var(--ss-border, #dbe7f3)",
                    borderRadius: "10px",
                    padding: "11px 12px",
                    display: "flex",
                    justifyContent: "space-between",
                    gap: "12px",
                    alignItems: "center",
                    flexWrap: "wrap",
                    overflowWrap: "anywhere",
                  }}
                >
                  <span>
                    {selectedFile.name} -{" "}
                    {formatTeacherResourceFileSize(selectedFile.size)}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedFile(null);

                      if (fileInputRef.current) {
                        fileInputRef.current.value = "";
                      }
                    }}
                    style={secondaryButtonStyle}
                  >
                    Remove selected file
                  </button>
                </div>
              )}

              {fieldErrors.file && (
                <small style={{ color: "#b42318" }}>{fieldErrors.file}</small>
              )}
            </div>
          ) : (
            <div style={{ display: "grid", gap: "7px" }}>
              <label
                htmlFor="official-resource-external-url"
                style={{ fontWeight: 700 }}
              >
                External HTTPS link
              </label>
              <input
                id="official-resource-external-url"
                type="url"
                value={externalUrl}
                placeholder="https://drive.google.com/..."
                onChange={(event) => setExternalUrl(event.target.value)}
                style={inputStyle}
              />
              {fieldErrors.externalUrl && (
                <small style={{ color: "#b42318" }}>
                  {fieldErrors.externalUrl}
                </small>
              )}
            </div>
          )}

          {formError && (
            <div
              aria-live="polite"
              style={{
                background: "#fff5f5",
                border: "1px solid #fecdca",
                borderRadius: "10px",
                color: "#b42318",
                padding: "11px 13px",
              }}
            >
              {formError}
            </div>
          )}

          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              gap: "10px",
              flexWrap: "wrap",
            }}
          >
            <button
              type="button"
              onClick={() => {
                resetForm();
                setShowForm(false);
              }}
              style={secondaryButtonStyle}
              disabled={publishing}
            >
              Cancel
            </button>
            <button
              type="submit"
              style={publishing ? { ...buttonStyle, opacity: 0.7 } : buttonStyle}
              disabled={publishing}
            >
              {publishing ? "Publishing..." : "Publish Resource"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
