"use client";

import { useEffect, useRef, useState } from "react";
import {
  createSharedTeacherResource,
  getSharedTeacherResourcesForLevel,
  type TeacherResource,
} from "../../../lib/teacherResources";
import {
  formatTeacherResourceFileSize,
  TEACHER_RESOURCE_ALLOWED_MIME_TYPES,
  TEACHER_RESOURCE_DESCRIPTION_MAX_LENGTH,
  TEACHER_RESOURCE_TITLE_MAX_LENGTH,
  type TeacherResourceType,
  validateTeacherResourceDescription,
  validateTeacherResourceExternalUrl,
  validateTeacherResourceFile,
  validateTeacherResourceTitle,
} from "../../../lib/teacherResourceValidation";
import TeacherResourceCard from "./TeacherResourceCard";

const sectionStyle = {
  display: "grid",
  gap: "18px",
} as const;

const stateBoxStyle = {
  background: "#f8fafd",
  border: "1px dashed var(--ss-border, #dbe7f3)",
  borderRadius: "12px",
  padding: "20px",
  color: "#667085",
  lineHeight: 1.5,
} as const;

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

type SharedResourcesTabProps = {
  levelId: string | number | null | undefined;
  levelName: string;
};

type FieldErrors = {
  title?: string;
  description?: string;
  externalUrl?: string;
  file?: string;
};

function characterHelp(value: string, maxLength: number) {
  return `${Math.max(0, maxLength - value.length)} characters remaining`;
}

export default function SharedResourcesTab({
  levelId,
  levelName,
}: SharedResourcesTabProps) {
  const [resources, setResources] = useState<TeacherResource[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [resourceType, setResourceType] =
    useState<TeacherResourceType>("file");
  const [externalUrl, setExternalUrl] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [publishing, setPublishing] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let active = true;

    async function loadResources() {
      if (!levelId) {
        setResources([]);
        setLoading(false);
        return;
      }

      setLoading(true);
      setError("");

      try {
        const data = await getSharedTeacherResourcesForLevel(levelId);

        if (active) {
          setResources(data);
        }
      } catch (loadError) {
        console.error("Shared Resources load failed:", loadError);

        if (active) {
          setResources([]);
          setError("Resources could not be loaded. Please try again.");
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    loadResources();

    return () => {
      active = false;
    };
  }, [levelId, reloadKey]);

  function resetForm() {
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
    setSuccessMessage("");
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
    const titleValidation = validateTeacherResourceTitle(title);
    const descriptionValidation = validateTeacherResourceDescription(description);

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
    setSuccessMessage("");
    setFormError("");

    if (!levelId) {
      setFormError("A valid class level is required.");
      return;
    }

    if (!validateForm()) {
      return;
    }

    setPublishing(true);

    try {
      await createSharedTeacherResource({
        levelId,
        title,
        description,
        resourceType,
        externalUrl,
        file: selectedFile,
      });

      resetForm();
      setShowForm(false);
      setSuccessMessage("Shared Resource published.");
      setReloadKey((current) => current + 1);
    } catch (publishError) {
      console.error("Shared Resource publish failed:", publishError);
      setFormError(
        publishError instanceof Error
          ? publishError.message
          : "Unable to publish resource."
      );
    } finally {
      setPublishing(false);
    }
  }

  return (
    <div style={sectionStyle}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: "14px",
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "grid", gap: "7px" }}>
          <h3
            style={{
              margin: 0,
              color: "var(--ss-blue-dark, #1f3c88)",
              fontSize: "22px",
            }}
          >
            Shared Resources{levelName ? ` - ${levelName}` : ""}
          </h3>
          <p style={{ margin: 0, color: "#667085", lineHeight: 1.5 }}>
            Resources shared by teachers teaching this level.
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            setShowForm((current) => !current);
            setSuccessMessage("");
            setFormError("");
          }}
          style={buttonStyle}
        >
          Add Shared Resource
        </button>
      </div>

      <div aria-live="polite" style={{ display: "grid", gap: "10px" }}>
        {successMessage && (
          <div
            style={{
              background: "#ecfdf3",
              border: "1px solid #abefc6",
              borderRadius: "10px",
              color: "#027a48",
              padding: "11px 13px",
            }}
          >
            {successMessage}
          </div>
        )}
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} style={formCardStyle}>
          <div style={{ display: "grid", gap: "6px" }}>
            <h4
              style={{
                margin: 0,
                color: "var(--ss-blue-dark, #1f3c88)",
                fontSize: "18px",
              }}
            >
              Add Shared Resource
            </h4>
            <p style={{ margin: 0, color: "#667085" }}>
              Level: {levelName || "Current class level"}
            </p>
          </div>

          <div style={{ display: "grid", gap: "7px" }}>
            <label htmlFor="shared-resource-title" style={{ fontWeight: 700 }}>
              Title
            </label>
            <input
              id="shared-resource-title"
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
              htmlFor="shared-resource-description"
              style={{ fontWeight: 700 }}
            >
              Short description
            </label>
            <textarea
              id="shared-resource-description"
              value={description}
              maxLength={TEACHER_RESOURCE_DESCRIPTION_MAX_LENGTH}
              onChange={(event) => setDescription(event.target.value)}
              rows={4}
              style={{ ...inputStyle, resize: "vertical" }}
            />
            <small style={{ color: "#667085" }}>
              Explain briefly what the resource is and how it can be used.
              {" "}
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
                name="shared-resource-type"
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
                name="shared-resource-type"
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
                htmlFor="shared-resource-external-url"
                style={{ fontWeight: 700 }}
              >
                External HTTPS link
              </label>
              <input
                id="shared-resource-external-url"
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

      {loading ? (
        <div style={stateBoxStyle}>Loading Shared Resources...</div>
      ) : error ? (
        <div style={{ ...stateBoxStyle, display: "grid", gap: "12px" }}>
          <span>{error}</span>
          <button
            type="button"
            onClick={() => setReloadKey((current) => current + 1)}
            style={buttonStyle}
          >
            Retry
          </button>
        </div>
      ) : resources.length === 0 ? (
        <div style={stateBoxStyle}>
          No Shared Resources have been added for this level yet.
        </div>
      ) : (
        <div style={{ display: "grid", gap: "14px" }}>
          {resources.map((resource) => (
            <TeacherResourceCard
              key={resource.id}
              resource={resource}
              showCreator
            />
          ))}
        </div>
      )}
    </div>
  );
}
