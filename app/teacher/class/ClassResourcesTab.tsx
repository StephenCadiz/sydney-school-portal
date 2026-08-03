"use client";

import { FormEvent, useState } from "react";

import { supabase } from "../../../lib/supabase";
import {
  TEACHER_RESOURCE_DESCRIPTION_MAX_LENGTH,
  validateTeacherResourceExternalUrl,
  validateTeacherResourceTitle,
} from "../../../lib/teacherResourceValidation";

export type ClassResource = {
  id: string;
  title: string | null;
  description: string | null;
  resource_url: string | null;
  class_id: string | null;
  active?: boolean | null;
};

type ClassResourcesTabProps = {
  classId: string;
  resources: ClassResource[];
  canManage: boolean;
  onResourcesChange: (resources: ClassResource[]) => void;
};

type ResourceDraft = {
  title: string;
  description: string;
  resource_url: string;
};

const emptyDraft: ResourceDraft = {
  title: "",
  description: "",
  resource_url: "",
};

function getDraft(resource: ClassResource): ResourceDraft {
  return {
    title: String(resource.title || ""),
    description: String(resource.description || ""),
    resource_url: String(resource.resource_url || ""),
  };
}

function validateDescription(value: unknown) {
  const description = String(value || "").trim();

  if (description.length > TEACHER_RESOURCE_DESCRIPTION_MAX_LENGTH) {
    return {
      value: description,
      error: `Description must be ${TEACHER_RESOURCE_DESCRIPTION_MAX_LENGTH} characters or fewer.`,
    };
  }

  return { value: description, error: "" };
}

function validateDraft(draft: ResourceDraft) {
  const title = validateTeacherResourceTitle(draft.title);
  const description = validateDescription(draft.description);
  const resourceUrl = validateTeacherResourceExternalUrl(draft.resource_url);

  return {
    title,
    description,
    resourceUrl,
    error: title.error || description.error || resourceUrl.error,
  };
}

async function getAccessToken() {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    throw new Error("You must be logged in to manage class resources.");
  }

  return session.access_token;
}

async function getApiError(response: Response, fallback: string) {
  const payload = await response.json().catch(() => ({}));
  return String(payload?.error || fallback);
}

export default function ClassResourcesTab({
  classId,
  resources,
  canManage,
  onResourcesChange,
}: ClassResourcesTabProps) {
  const [newDraft, setNewDraft] = useState<ResourceDraft>(emptyDraft);
  const [editingId, setEditingId] = useState("");
  const [editingDraft, setEditingDraft] = useState<ResourceDraft>(emptyDraft);
  const [deleteTarget, setDeleteTarget] = useState<ClassResource | null>(null);
  const [saving, setSaving] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  function clearFeedback() {
    setMessage("");
    setError("");
  }

  function startEdit(resource: ClassResource) {
    clearFeedback();
    setDeleteTarget(null);
    setEditingId(resource.id);
    setEditingDraft(getDraft(resource));
  }

  function cancelEdit() {
    setEditingId("");
    setEditingDraft(emptyDraft);
  }

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving || !classId) return;

    clearFeedback();
    const validation = validateDraft(newDraft);
    if (validation.error) {
      setError(validation.error);
      return;
    }

    setSaving(true);

    try {
      const { data, error: insertError } = await supabase
        .from("resources")
        .insert([
          {
            title: validation.title.value,
            description: validation.description.value,
            resource_url: validation.resourceUrl.value,
            class_id: classId,
            active: true,
          },
        ])
        .select("id, title, description, resource_url, class_id, active")
        .single();

      if (insertError || !data) {
        throw new Error(insertError?.message || "Unable to save the resource.");
      }

      onResourcesChange([...resources, data as ClassResource]);
      setNewDraft(emptyDraft);
      setMessage("Class resource added.");
    } catch (createError) {
      console.error("Class resource create failed:", createError);
      setError(
        createError instanceof Error
          ? createError.message
          : "Unable to save the resource."
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingId || savingEdit || !classId) return;

    clearFeedback();
    const validation = validateDraft(editingDraft);
    if (validation.error) {
      setError(validation.error);
      return;
    }

    setSavingEdit(true);

    try {
      const accessToken = await getAccessToken();
      const response = await fetch(
        `/api/teacher/classes/${encodeURIComponent(classId)}/resources/${encodeURIComponent(editingId)}`,
        {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            title: validation.title.value,
            description: validation.description.value,
            resource_url: validation.resourceUrl.value,
          }),
        }
      );

      if (!response.ok) {
        throw new Error(await getApiError(response, "Unable to update the resource."));
      }

      const payload = await response.json();
      const updatedResource = payload?.resource as ClassResource | undefined;
      if (!updatedResource?.id) {
        throw new Error("Unable to update the resource.");
      }

      onResourcesChange(
        resources.map((resource) =>
          resource.id === updatedResource.id ? updatedResource : resource
        )
      );
      cancelEdit();
      setMessage("Class resource updated.");
    } catch (updateError) {
      console.error("Class resource update failed:", updateError);
      setError(
        updateError instanceof Error
          ? updateError.message
          : "Unable to update the resource."
      );
    } finally {
      setSavingEdit(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget || deleting || !classId) return;

    clearFeedback();
    setDeleting(true);

    try {
      const accessToken = await getAccessToken();
      const response = await fetch(
        `/api/teacher/classes/${encodeURIComponent(classId)}/resources/${encodeURIComponent(deleteTarget.id)}`,
        {
          method: "DELETE",
          headers: { Authorization: `Bearer ${accessToken}` },
        }
      );

      if (!response.ok) {
        throw new Error(await getApiError(response, "Unable to delete the resource."));
      }

      onResourcesChange(
        resources.filter((resource) => resource.id !== deleteTarget.id)
      );
      setDeleteTarget(null);
      setMessage("Class resource deleted.");
    } catch (deleteError) {
      console.error("Class resource delete failed:", deleteError);
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "Unable to delete the resource."
      );
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="teacher-class-resource-tab">
      <div className="teacher-class-resource-heading">
        <div>
          <p className="teacher-class-resource-eyebrow">Class workspace</p>
          <h3>Class Resources</h3>
          <p>Share and maintain links that are specific to this class.</p>
        </div>
        <span className="teacher-class-resource-count">
          {resources.length} {resources.length === 1 ? "resource" : "resources"}
        </span>
      </div>

      {(message || error) && (
        <p
          className={`teacher-class-resource-message ${
            error
              ? "teacher-class-resource-message-error"
              : "teacher-class-resource-message-success"
          }`}
          role={error ? "alert" : "status"}
          aria-live="polite"
        >
          {error || message}
        </p>
      )}

      <div className="teacher-class-resource-list" aria-label="Class resources">
        {resources.length === 0 ? (
          <p className="teacher-class-resource-empty">
            No class resources have been added yet.
          </p>
        ) : (
          resources.map((resource) => {
            const editing = editingId === resource.id;

            return (
              <article className="teacher-class-resource-row" key={resource.id}>
                {editing ? (
                  <form
                    className="teacher-class-resource-edit-form"
                    onSubmit={handleSaveEdit}
                  >
                    <div className="teacher-class-resource-field">
                      <label htmlFor={`resource-title-${resource.id}`}>Title</label>
                      <input
                        id={`resource-title-${resource.id}`}
                        value={editingDraft.title}
                        onChange={(event) =>
                          setEditingDraft((current) => ({
                            ...current,
                            title: event.target.value,
                          }))
                        }
                        disabled={savingEdit}
                        maxLength={120}
                        required
                      />
                    </div>
                    <div className="teacher-class-resource-field">
                      <label htmlFor={`resource-description-${resource.id}`}>
                        Description <span>(optional)</span>
                      </label>
                      <textarea
                        id={`resource-description-${resource.id}`}
                        value={editingDraft.description}
                        onChange={(event) =>
                          setEditingDraft((current) => ({
                            ...current,
                            description: event.target.value,
                          }))
                        }
                        disabled={savingEdit}
                        maxLength={TEACHER_RESOURCE_DESCRIPTION_MAX_LENGTH}
                        rows={3}
                      />
                    </div>
                    <div className="teacher-class-resource-field">
                      <label htmlFor={`resource-url-${resource.id}`}>
                        Google Drive Link
                      </label>
                      <input
                        id={`resource-url-${resource.id}`}
                        type="url"
                        value={editingDraft.resource_url}
                        onChange={(event) =>
                          setEditingDraft((current) => ({
                            ...current,
                            resource_url: event.target.value,
                          }))
                        }
                        disabled={savingEdit}
                        required
                      />
                    </div>
                    <div className="teacher-class-resource-actions">
                      <button
                        className="teacher-class-resource-button teacher-class-resource-button-primary"
                        type="submit"
                        disabled={savingEdit}
                      >
                        {savingEdit ? "Saving..." : "Save Changes"}
                      </button>
                      <button
                        className="teacher-class-resource-button teacher-class-resource-button-secondary"
                        type="button"
                        onClick={cancelEdit}
                        disabled={savingEdit}
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                ) : (
                  <>
                    <div className="teacher-class-resource-copy">
                      <h4>{resource.title || "Untitled resource"}</h4>
                      {resource.description && <p>{resource.description}</p>}
                    </div>
                    <div className="teacher-class-resource-actions">
                      {resource.resource_url ? (
                        <a
                          className="teacher-class-resource-button teacher-class-resource-button-open"
                          href={resource.resource_url}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Open Resource
                        </a>
                      ) : (
                        <span className="teacher-class-resource-unavailable">
                          Resource link unavailable
                        </span>
                      )}
                      {canManage && (
                        <>
                          <button
                            className="teacher-class-resource-button teacher-class-resource-button-secondary"
                            type="button"
                            onClick={() => startEdit(resource)}
                          >
                            Edit
                          </button>
                          <button
                            className="teacher-class-resource-button teacher-class-resource-button-danger"
                            type="button"
                            onClick={() => {
                              clearFeedback();
                              setDeleteTarget(resource);
                            }}
                          >
                            Delete
                          </button>
                        </>
                      )}
                    </div>
                  </>
                )}
              </article>
            );
          })
        )}
      </div>

      <form className="teacher-class-resource-add-form" onSubmit={handleCreate}>
          <div className="teacher-class-resource-form-heading">
            <h4>Add Class Resource</h4>
            <p>Add a Google Drive link for students in this class.</p>
          </div>
          <div className="teacher-class-resource-field">
            <label htmlFor="new-class-resource-title">Title</label>
            <input
              id="new-class-resource-title"
              value={newDraft.title}
              onChange={(event) =>
                setNewDraft((current) => ({ ...current, title: event.target.value }))
              }
              disabled={saving}
              maxLength={120}
              required
            />
          </div>
          <div className="teacher-class-resource-field">
            <label htmlFor="new-class-resource-description">
              Description <span>(optional)</span>
            </label>
            <textarea
              id="new-class-resource-description"
              value={newDraft.description}
              onChange={(event) =>
                setNewDraft((current) => ({
                  ...current,
                  description: event.target.value,
                }))
              }
              disabled={saving}
              maxLength={TEACHER_RESOURCE_DESCRIPTION_MAX_LENGTH}
              rows={3}
            />
          </div>
          <div className="teacher-class-resource-field">
            <label htmlFor="new-class-resource-url">Google Drive Link</label>
            <input
              id="new-class-resource-url"
              type="url"
              value={newDraft.resource_url}
              onChange={(event) =>
                setNewDraft((current) => ({
                  ...current,
                  resource_url: event.target.value,
                }))
              }
              disabled={saving}
              required
            />
          </div>
          <div className="teacher-class-resource-actions">
            <button
              className="teacher-class-resource-button teacher-class-resource-button-primary"
              type="submit"
              disabled={saving}
            >
              {saving ? "Saving..." : "Save Resource"}
            </button>
          </div>
      </form>

      {deleteTarget && (
        <div
          className="teacher-class-resource-dialog-backdrop"
          role="presentation"
        >
          <div
            className="teacher-class-resource-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-class-resource-title"
          >
            <h4 id="delete-class-resource-title">
              Delete this class resource permanently?
            </h4>
            <p>
              “{deleteTarget.title || "Untitled resource"}” will be removed from
              this class.
            </p>
            <div className="teacher-class-resource-actions">
              <button
                className="teacher-class-resource-button teacher-class-resource-button-secondary"
                type="button"
                onClick={() => setDeleteTarget(null)}
                disabled={deleting}
              >
                Cancel
              </button>
              <button
                className="teacher-class-resource-button teacher-class-resource-button-danger"
                type="button"
                onClick={handleDelete}
                disabled={deleting}
              >
                {deleting ? "Deleting..." : "Delete Resource"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
