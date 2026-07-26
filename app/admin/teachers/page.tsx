"use client";

import Link from "next/link";
import {
  FormEvent,
  KeyboardEvent as ReactKeyboardEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import AdminLayout from "../../components/layout/AdminLayout";
import {
  AdminTeacher,
  AdminTeacherClass,
  getTeacherManagementData,
} from "../../../lib/adminTeachers";
import { supabase } from "../../../lib/supabase";

type Feedback = {
  type: "success" | "error";
  text: string;
};

function clean(value: string | null | undefined) {
  return String(value || "").trim();
}

function getTeacherName(teacher: AdminTeacher) {
  const name = [clean(teacher.first_name), clean(teacher.last_name)]
    .filter(Boolean)
    .join(" ");

  return name || clean(teacher.email) || "Unnamed teacher";
}

function getInitials(teacher: AdminTeacher) {
  const initials = [clean(teacher.first_name), clean(teacher.last_name)]
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");

  return initials.slice(0, 2) || "T";
}

function pluralizeClasses(count: number, assigned = false) {
  return `${count} ${assigned ? "assigned " : ""}${
    count === 1 ? "class" : "classes"
  }`;
}

function formatTime(value: string | null) {
  const normalized = clean(value);
  return normalized ? normalized.slice(0, 5) : "";
}

function formatClassLabel(classroom: AdminTeacherClass) {
  const className = clean(classroom.class_name);
  const levelName = clean(classroom.level_name);
  const normalizedClassName = className
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  const normalizedLevelName = levelName
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  const classNameContainsSchedule =
    /\b(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i.test(
      className
    ) || /\b\d{1,2}:\d{2}(?::\d{2})?\b/.test(className);
  const meaningfulClassName =
    className &&
    !classNameContainsSchedule &&
    normalizedClassName !== normalizedLevelName
      ? className
      : "";
  const primaryName = meaningfulClassName || levelName || className || "Class";
  const courseType = clean(classroom.course_type);
  const normalizedCourseType = courseType.toLocaleLowerCase();
  const isSupportClass =
    normalizedLevelName === "support classes" ||
    normalizedClassName === "support classes";
  const showCourseType =
    classroom.is_cambridge === true &&
    !isSupportClass &&
    courseType &&
    !new RegExp(`\\b${normalizedCourseType}\\b`, "i").test(primaryName);
  const primaryLabel = [
    primaryName,
    showCourseType
      ? courseType.replace(/\b\w/g, (letter) => letter.toUpperCase())
      : "",
  ]
    .filter(Boolean)
    .join(" ");
  const context = [
    primaryLabel,
    clean(classroom.days),
    classroom.start_time || classroom.end_time
      ? [formatTime(classroom.start_time), formatTime(classroom.end_time)]
          .filter(Boolean)
          .join("–")
      : "",
  ].filter(Boolean);

  return context.join(" · ");
}

function compareTeachers(first: AdminTeacher, second: AdminTeacher) {
  const fields: Array<keyof AdminTeacher> = [
    "last_name",
    "first_name",
    "email",
    "id",
  ];

  for (const field of fields) {
    const comparison = clean(first[field]).localeCompare(clean(second[field]),
      undefined,
      { sensitivity: "base" }
    );

    if (comparison !== 0) return comparison;
  }

  return 0;
}

export default function AdminTeachersPage() {
  const [teachers, setTeachers] = useState<AdminTeacher[]>([]);
  const [classes, setClasses] = useState<AdminTeacherClass[]>([]);
  const [currentUserId, setCurrentUserId] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [classRecordsAvailable, setClassRecordsAvailable] = useState(true);
  const [classLabelsAvailable, setClassLabelsAvailable] = useState(true);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [menuTeacherId, setMenuTeacherId] = useState("");
  const [editTeacher, setEditTeacher] = useState<AdminTeacher | null>(null);
  const [deleteTeacher, setDeleteTeacher] = useState<AdminTeacher | null>(null);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [fieldErrors, setFieldErrors] = useState<{
    firstName?: string;
    lastName?: string;
  }>({});
  const [modalError, setModalError] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const menuButtonRefs = useRef(new Map<string, HTMLButtonElement>());
  const editTriggerRef = useRef<HTMLElement | null>(null);
  const deleteTriggerRef = useRef<HTMLElement | null>(null);
  const editDialogRef = useRef<HTMLDivElement | null>(null);
  const deleteDialogRef = useRef<HTMLDivElement | null>(null);
  const loadInFlightRef = useRef(false);

  async function loadPage() {
    if (loadInFlightRef.current) return;
    loadInFlightRef.current = true;
    setLoading(true);
    setLoadError("");

    try {
      const [managementData, sessionResult] = await Promise.all([
        getTeacherManagementData(),
        supabase.auth.getSession(),
      ]);

      setTeachers(managementData.teachers);
      setClasses(managementData.classes);
      setClassRecordsAvailable(managementData.classRecordsAvailable);
      setClassLabelsAvailable(managementData.classLabelsAvailable);
      setCurrentUserId(sessionResult.data.session?.user.id || "");
    } catch {
      setLoadError("Unable to load teacher accounts. Please try again.");
    } finally {
      loadInFlightRef.current = false;
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadPage();
  }, []);

  const classesByTeacher = useMemo(() => {
    const grouped = new Map<string, AdminTeacherClass[]>();

    for (const classroom of classes) {
      if (!classroom.teacher_id) continue;
      const teacherClasses = grouped.get(classroom.teacher_id) || [];
      teacherClasses.push(classroom);
      grouped.set(classroom.teacher_id, teacherClasses);
    }

    for (const teacherClasses of grouped.values()) {
      teacherClasses.sort((first, second) =>
        formatClassLabel(first).localeCompare(formatClassLabel(second), undefined, {
          sensitivity: "base",
        })
      );
    }

    return grouped;
  }, [classes]);

  const sortedTeachers = useMemo(
    () => [...teachers].sort(compareTeachers),
    [teachers]
  );
  const visibleTeachers = useMemo(() => {
    const search = searchTerm.trim().toLocaleLowerCase();
    if (!search) return sortedTeachers;

    return sortedTeachers.filter((teacher) =>
      [
        teacher.first_name,
        teacher.last_name,
        getTeacherName(teacher),
        teacher.email,
      ]
        .map((value) => clean(value).toLocaleLowerCase())
        .some((value) => value.includes(search))
    );
  }, [searchTerm, sortedTeachers]);

  const assignedClassCount = classes.filter((item) =>
    teachers.some((teacher) => teacher.id === item.teacher_id)
  ).length;

  useEffect(() => {
    if (!menuTeacherId) return;

    function closeMenu(event: MouseEvent) {
      if (!menuRef.current?.contains(event.target as Node)) {
        setMenuTeacherId("");
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        const button = menuButtonRefs.current.get(menuTeacherId);
        setMenuTeacherId("");
        button?.focus();
      }
    }

    document.addEventListener("mousedown", closeMenu);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", closeMenu);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [menuTeacherId]);

  function trapDialogFocus(
    event: KeyboardEvent,
    dialog: HTMLDivElement | null,
    close: () => void,
    busy: boolean
  ) {
    if (event.key === "Escape" && !busy) {
      close();
      return;
    }

    if (event.key !== "Tab" || !dialog) return;
    const focusable = Array.from(
      dialog.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )
    );
    if (focusable.length === 0) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  useEffect(() => {
    if (!editTeacher) return;
    const handleKeyDown = (event: KeyboardEvent) =>
      trapDialogFocus(event, editDialogRef.current, closeEditModal, saving);
    document.addEventListener("keydown", handleKeyDown);
    window.setTimeout(() => editDialogRef.current?.querySelector("input")?.focus());
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [editTeacher, saving]);

  useEffect(() => {
    if (!deleteTeacher) return;
    const handleKeyDown = (event: KeyboardEvent) =>
      trapDialogFocus(
        event,
        deleteDialogRef.current,
        closeDeleteDialog,
        deleting
      );
    document.addEventListener("keydown", handleKeyDown);
    window.setTimeout(() => deleteDialogRef.current?.querySelector("button")?.focus());
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [deleteTeacher, deleting]);

  function openEditModal(teacher: AdminTeacher, trigger: HTMLElement) {
    editTriggerRef.current = trigger;
    setMenuTeacherId("");
    setEditTeacher(teacher);
    setFirstName(clean(teacher.first_name));
    setLastName(clean(teacher.last_name));
    setFieldErrors({});
    setModalError("");
  }

  function closeEditModal() {
    if (saving) return;
    setEditTeacher(null);
    window.setTimeout(() => editTriggerRef.current?.focus());
  }

  function openDeleteDialog(teacher: AdminTeacher, trigger: HTMLElement) {
    deleteTriggerRef.current = trigger;
    setMenuTeacherId("");
    setDeleteTeacher(teacher);
    setModalError("");
  }

  function closeDeleteDialog() {
    if (deleting) return;
    setDeleteTeacher(null);
    setModalError("");
    window.setTimeout(() => deleteTriggerRef.current?.focus());
  }

  async function handleSave(event: FormEvent) {
    event.preventDefault();
    if (!editTeacher || saving) return;

    const nextFirstName = firstName.trim();
    const nextLastName = lastName.trim();
    const nextErrors = {
      firstName: nextFirstName ? undefined : "Enter the teacher’s first name.",
      lastName: nextLastName ? undefined : "Enter the teacher’s last name.",
    };
    setFieldErrors(nextErrors);
    setModalError("");
    if (nextErrors.firstName || nextErrors.lastName) return;

    setSaving(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) throw new Error("You must be logged in as an admin.");

      const response = await fetch(`/api/admin/teachers/${editTeacher.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          first_name: nextFirstName,
          last_name: nextLastName,
        }),
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || "Unable to update teacher information.");
      }

      setTeachers((current) =>
        current.map((teacher) =>
          teacher.id === editTeacher.id ? result.teacher : teacher
        )
      );
      setEditTeacher(null);
      setFeedback({
        type: "success",
        text: result.message || "Teacher information updated.",
      });
      window.setTimeout(() => editTriggerRef.current?.focus());
    } catch (error) {
      setModalError(
        error instanceof Error
          ? error.message
          : "Unable to update teacher information."
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleteTeacher || deleting) return;
    const teacherClassCount = classesByTeacher.get(deleteTeacher.id)?.length || 0;
    if (teacherClassCount > 0) return;

    setDeleting(true);
    setModalError("");
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) throw new Error("You must be logged in as an admin.");

      const response = await fetch("/api/admin/teachers/delete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ teacher_id: deleteTeacher.id }),
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || "Unable to delete teacher.");
      }

      const deletedName = getTeacherName(deleteTeacher);
      setTeachers((current) =>
        current.filter((teacher) => teacher.id !== deleteTeacher.id)
      );
      setDeleteTeacher(null);
      setFeedback({
        type: "success",
        text: `${deletedName} was deleted successfully.`,
      });
    } catch (error) {
      setModalError(
        error instanceof Error ? error.message : "Unable to delete teacher."
      );
    } finally {
      setDeleting(false);
    }
  }

  function handleMenuKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    const items = Array.from(
      event.currentTarget.querySelectorAll<HTMLElement>('[role="menuitem"]')
    );
    const currentIndex = items.indexOf(document.activeElement as HTMLElement);
    const nextIndex =
      event.key === "ArrowDown"
        ? (currentIndex + 1) % items.length
        : (currentIndex - 1 + items.length) % items.length;
    items[nextIndex]?.focus();
  }

  return (
    <AdminLayout>
      <main className="admin-teachers-page">
        <header className="admin-teachers-header">
          <div>
            <h1>Teachers</h1>
            <p>Manage teacher accounts and staff information.</p>
            <div className="admin-teachers-summary">
              {teachers.length} {teachers.length === 1 ? "teacher" : "teachers"} ·{" "}
              {classRecordsAvailable
                ? pluralizeClasses(assignedClassCount, true)
                : "Assigned-class information unavailable"}
            </div>
          </div>
          <Link href="/admin/add-users" className="admin-teachers-add-button">
            Add Teacher
          </Link>
        </header>

        {feedback && (
          <div
            className={`admin-teachers-feedback is-${feedback.type}`}
            role="status"
          >
            {feedback.text}
          </div>
        )}

        {!loading &&
          !loadError &&
          (!classRecordsAvailable || !classLabelsAvailable) && (
            <div className="admin-teachers-feedback is-error" role="status">
              Teacher accounts loaded, but assigned-class information is
              temporarily unavailable.
            </div>
          )}

        <section className="admin-teachers-controls" aria-label="Teacher search">
          <label htmlFor="admin-teachers-search">Search teachers</label>
          <input
            id="admin-teachers-search"
            type="search"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Search teachers by name or email..."
          />
        </section>

        <section
          className="admin-teachers-sheet"
          aria-labelledby="admin-teachers-list-title"
        >
          <div className="admin-teachers-sheet-heading">
            <h2 id="admin-teachers-list-title">Teacher List</h2>
            {!loading && !loadError && (
              <span>{visibleTeachers.length} shown</span>
            )}
          </div>

          {loading ? (
            <div className="admin-teachers-skeleton" aria-label="Loading teachers">
              {[0, 1, 2, 3].map((row) => (
                <div key={row} className="admin-teachers-skeleton-row">
                  <span />
                  <span />
                  <span />
                </div>
              ))}
            </div>
          ) : loadError ? (
            <div className="admin-teachers-state" role="alert">
              <p>{loadError}</p>
              <button type="button" onClick={() => void loadPage()}>
                Retry
              </button>
            </div>
          ) : teachers.length === 0 ? (
            <div className="admin-teachers-state">
              <p>No teacher accounts found.</p>
              <Link href="/admin/add-users">Add Teacher</Link>
            </div>
          ) : visibleTeachers.length === 0 ? (
            <div className="admin-teachers-state">
              <p>No teachers match your search.</p>
            </div>
          ) : (
            <div className="admin-teachers-table" role="table">
              <div className="admin-teachers-table-header" role="row">
                <span role="columnheader">Teacher</span>
                <span role="columnheader">Email</span>
                <span role="columnheader">Assigned Classes</span>
                <span role="columnheader">Actions</span>
              </div>
              <div role="rowgroup">
                {visibleTeachers.map((teacher) => {
                  const teacherClasses = classesByTeacher.get(teacher.id) || [];
                  const isSelf = teacher.id === currentUserId;

                  return (
                    <div className="admin-teachers-row" role="row" key={teacher.id}>
                      <div className="admin-teachers-identity" role="cell">
                        <span className="admin-teachers-avatar" aria-hidden="true">
                          {getInitials(teacher)}
                        </span>
                        <div>
                          <strong>{getTeacherName(teacher)}</strong>
                          {isSelf && <small>Current account</small>}
                        </div>
                      </div>
                      <div className="admin-teachers-email" role="cell">
                        <span className="admin-teachers-mobile-label">Email</span>
                        {clean(teacher.email) || "No email recorded"}
                      </div>
                      <div className="admin-teachers-class-count" role="cell">
                        <span className="admin-teachers-mobile-label">
                          Assigned Classes
                        </span>
                        {classRecordsAvailable
                          ? pluralizeClasses(teacherClasses.length)
                          : "Unavailable"}
                      </div>
                      <div className="admin-teachers-actions" role="cell">
                        <button
                          type="button"
                          className="admin-teachers-edit-button"
                          disabled={isSelf}
                          title={
                            isSelf
                              ? "Your own account cannot be edited here."
                              : undefined
                          }
                          onClick={(event) =>
                            openEditModal(teacher, event.currentTarget)
                          }
                        >
                          Edit
                        </button>
                        <div
                          className="admin-teachers-menu-wrap"
                          ref={menuTeacherId === teacher.id ? menuRef : undefined}
                        >
                          <button
                            type="button"
                            className="admin-teachers-menu-button"
                            aria-label={`Actions for ${getTeacherName(teacher)}`}
                            aria-expanded={menuTeacherId === teacher.id}
                            aria-controls={`teacher-menu-${teacher.id}`}
                            ref={(button) => {
                              if (button) menuButtonRefs.current.set(teacher.id, button);
                              else menuButtonRefs.current.delete(teacher.id);
                            }}
                            onClick={() =>
                              setMenuTeacherId((current) =>
                                current === teacher.id ? "" : teacher.id
                              )
                            }
                          >
                            ⋯
                          </button>
                          {menuTeacherId === teacher.id && (
                            <div
                              id={`teacher-menu-${teacher.id}`}
                              className="admin-teachers-menu"
                              role="menu"
                              onKeyDown={handleMenuKeyDown}
                            >
                              <button
                                type="button"
                                role="menuitem"
                                disabled={isSelf}
                                onClick={(event) =>
                                  openEditModal(teacher, event.currentTarget)
                                }
                              >
                                Edit teacher
                              </button>
                              <Link href="/admin/classes" role="menuitem">
                                Manage classes
                              </Link>
                              <button
                                type="button"
                                role="menuitem"
                                className="is-danger"
                                disabled={isSelf}
                                onClick={(event) =>
                                  openDeleteDialog(teacher, event.currentTarget)
                                }
                              >
                                Delete teacher
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </section>
      </main>

      {editTeacher && (
        <div
          className="admin-teachers-dialog-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeEditModal();
          }}
        >
          <div
            className="admin-teachers-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="admin-teachers-edit-title"
            aria-describedby="admin-teachers-edit-description"
            ref={editDialogRef}
          >
            <form onSubmit={handleSave}>
              <header className="admin-teachers-dialog-header">
                <div>
                  <h2 id="admin-teachers-edit-title">Edit Teacher</h2>
                  <p id="admin-teachers-edit-description">
                    Update staff information for {getTeacherName(editTeacher)}.
                  </p>
                </div>
                <button
                  type="button"
                  aria-label="Close edit teacher dialog"
                  onClick={closeEditModal}
                  disabled={saving}
                >
                  ×
                </button>
              </header>

              <div className="admin-teachers-dialog-body">
                <section>
                  <h3>Teacher Information</h3>
                  <div className="admin-teachers-form-grid">
                    <label>
                      <span>First name</span>
                      <input
                        value={firstName}
                        onChange={(event) => setFirstName(event.target.value)}
                        aria-invalid={Boolean(fieldErrors.firstName)}
                        aria-describedby={
                          fieldErrors.firstName
                            ? "admin-teacher-first-name-error"
                            : undefined
                        }
                      />
                      {fieldErrors.firstName && (
                        <small id="admin-teacher-first-name-error">
                          {fieldErrors.firstName}
                        </small>
                      )}
                    </label>
                    <label>
                      <span>Last name</span>
                      <input
                        value={lastName}
                        onChange={(event) => setLastName(event.target.value)}
                        aria-invalid={Boolean(fieldErrors.lastName)}
                        aria-describedby={
                          fieldErrors.lastName
                            ? "admin-teacher-last-name-error"
                            : undefined
                        }
                      />
                      {fieldErrors.lastName && (
                        <small id="admin-teacher-last-name-error">
                          {fieldErrors.lastName}
                        </small>
                      )}
                    </label>
                  </div>
                </section>

                <section>
                  <h3>Account</h3>
                  <dl className="admin-teachers-account-row">
                    <div>
                      <dt>Email address</dt>
                      <dd>{clean(editTeacher.email) || "No email recorded"}</dd>
                    </div>
                  </dl>
                  <p className="admin-teachers-help">
                    This is the teacher’s login email. Secure email changes are
                    not available in this version.
                  </p>
                </section>

                <section>
                  <div className="admin-teachers-section-heading">
                    <h3>Assigned Classes</h3>
                    <Link href="/admin/classes">Manage in Classes</Link>
                  </div>
                  {!classRecordsAvailable ? (
                    <p className="admin-teachers-empty-classes">
                      Assigned-class information is temporarily unavailable.
                    </p>
                  ) : (classesByTeacher.get(editTeacher.id) || []).length === 0 ? (
                    <p className="admin-teachers-empty-classes">
                      No classes currently assigned.
                    </p>
                  ) : (
                    <ul className="admin-teachers-class-list">
                      {(classesByTeacher.get(editTeacher.id) || []).map(
                        (classroom) => (
                          <li key={classroom.id}>{formatClassLabel(classroom)}</li>
                        )
                      )}
                    </ul>
                  )}
                </section>

                {modalError && (
                  <p className="admin-teachers-dialog-error" role="alert">
                    {modalError}
                  </p>
                )}
              </div>

              <footer className="admin-teachers-dialog-footer">
                <button
                  type="button"
                  className="admin-teachers-secondary-button"
                  onClick={closeEditModal}
                  disabled={saving}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="admin-teachers-primary-button"
                  disabled={saving}
                >
                  {saving ? "Saving..." : "Save Changes"}
                </button>
              </footer>
            </form>
          </div>
        </div>
      )}

      {deleteTeacher && (
        <div
          className="admin-teachers-dialog-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeDeleteDialog();
          }}
        >
          <div
            className="admin-teachers-dialog admin-teachers-delete-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="admin-teachers-delete-title"
            aria-describedby="admin-teachers-delete-description"
            ref={deleteDialogRef}
          >
            <header className="admin-teachers-dialog-header">
              <div>
                <h2 id="admin-teachers-delete-title">
                  Delete {getTeacherName(deleteTeacher)}?
                </h2>
                <p id="admin-teachers-delete-description">
                  This permanently removes the teacher’s account. Teachers with
                  assigned classes cannot be deleted. Reassign their classes
                  first.
                </p>
              </div>
            </header>
            <div className="admin-teachers-dialog-body">
              {(classesByTeacher.get(deleteTeacher.id) || []).length > 0 && (
                <div className="admin-teachers-delete-warning">
                  This teacher still has{" "}
                  {pluralizeClasses(
                    (classesByTeacher.get(deleteTeacher.id) || []).length,
                    true
                  )}
                  . Reassign them in Classes before deleting the account.{" "}
                  <Link href="/admin/classes">Manage Classes</Link>
                </div>
              )}
              {!classRecordsAvailable && (
                <div className="admin-teachers-delete-warning">
                  Assigned-class information is temporarily unavailable. Retry
                  loading the page before deleting this account.
                </div>
              )}
              {modalError && (
                <p className="admin-teachers-dialog-error" role="alert">
                  {modalError}
                </p>
              )}
            </div>
            <footer className="admin-teachers-dialog-footer">
              <button
                type="button"
                className="admin-teachers-secondary-button"
                onClick={closeDeleteDialog}
                disabled={deleting}
              >
                Cancel
              </button>
              <button
                type="button"
                className="admin-teachers-danger-button"
                onClick={() => void handleDelete()}
                disabled={
                  deleting ||
                  !classRecordsAvailable ||
                  (classesByTeacher.get(deleteTeacher.id) || []).length > 0
                }
              >
                {deleting ? "Deleting..." : "Delete Teacher"}
              </button>
            </footer>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
