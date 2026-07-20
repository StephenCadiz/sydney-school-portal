"use client";

import Link from "next/link";
import { type FormEvent, useEffect, useMemo, useState } from "react";

import AdminLayout from "../../components/layout/AdminLayout";
import {
  getAdminCambridgeStudentDirectory,
  getAdminYoungLearnerDirectory,
  getCambridgeClassesForBulkCreate,
  getYoungLearnerClassesForBulkCreate,
  updateStudent,
  updateStudentClass,
  type AdminCambridgeStudentDirectoryRow,
  type AdminYoungLearnerDirectoryRow,
  type CambridgeBulkClassOption,
  type YoungLearnerBulkClassOption,
} from "../../../lib/adminStudents";
import { supabase } from "../../../lib/supabase";

type StudentGroup = "cambridge" | "youngLearners";
type ViewMode = "level" | "class";
type StudentMessage = {
  type: "success" | "error";
  text: string;
};
type PendingConfirmation = {
  title: string;
  body: string;
  confirmLabel: string;
  onConfirm: () => void;
};
type DeleteTarget = {
  id: string;
  studentType: "cambridge" | "young_learner";
  name: string;
};
type SelectOption = {
  value: string;
  label: string;
};

const cambridgeLevelOrder = ["B1", "B2", "C1", "C2"];

const youngLearnerPreferredLevelOrder = [
  "PRE-KIDS 2",
  "PRE-KIDS 3",
  "KIDS 1",
  "KIDS 2",
  "JUNIOR 1",
  "JUNIOR 2",
  "JUNIOR 3",
  "JUNIOR 4",
  "TEENS 1",
  "SUPPORT CLASSES",
];

function normalizeLevelName(levelName: string | null | undefined) {
  return String(levelName || "").trim().toUpperCase();
}

function normalizeSearchValue(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function cleanText(value: string | null | undefined, fallback = "-") {
  const text = String(value || "").trim();

  return text || fallback;
}

function getStudentName(student: { first_name?: string; last_name?: string }) {
  return `${student.first_name || ""} ${student.last_name || ""}`.trim();
}

function formatTimeValue(value: string | null | undefined) {
  const timeValue = String(value || "").trim();

  return timeValue ? timeValue.slice(0, 5) : "";
}

function formatTimeRange(
  startTime: string | null | undefined,
  endTime: string | null | undefined
) {
  const start = formatTimeValue(startTime);
  const end = formatTimeValue(endTime);

  if (start && end) {
    return `${start}-${end}`;
  }

  return start || end || "";
}

function formatCourseType(courseType: string | null | undefined) {
  const text = String(courseType || "").trim();

  if (!text) {
    return "-";
  }

  return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
}

function formatClassSelectLabel(
  classroom: CambridgeBulkClassOption | YoungLearnerBulkClassOption,
  group: StudentGroup
) {
  if (group === "youngLearners" && classroom.class_label) {
    return group === "youngLearners" && classroom.teacher_name
      ? `${classroom.class_label} - ${classroom.teacher_name}`
      : classroom.class_label;
  }

  const levelName =
    group === "cambridge"
      ? normalizeLevelName(classroom.level_name)
      : cleanText(classroom.level_name, "Unknown Level");
  const timeSlot = formatTimeRange(classroom.start_time, classroom.end_time);
  const classroomName = cleanText(classroom.classroom_name, "");
  const courseType =
    group === "cambridge" ? formatCourseType(classroom.course_type) : "";
  const teacherName =
    group === "youngLearners" ? cleanText(classroom.teacher_name, "") : "";

  return [
    [levelName, courseType].filter(Boolean).join(" "),
    classroom.days,
    timeSlot,
    classroomName,
    teacherName,
  ]
    .filter(Boolean)
    .join(" - ");
}

function getLevelSortIndex(group: StudentGroup, normalizedLevelName: string) {
  const order =
    group === "cambridge"
      ? cambridgeLevelOrder
      : youngLearnerPreferredLevelOrder;
  const index = order.indexOf(normalizedLevelName);

  return index === -1 ? Number.MAX_SAFE_INTEGER : index;
}

function buildLevelOptions(
  classOptions: (CambridgeBulkClassOption | YoungLearnerBulkClassOption)[],
  group: StudentGroup
) {
  const levelOptions = new Map<string, SelectOption>();

  for (const classroom of classOptions) {
    const normalizedLevelName = normalizeLevelName(classroom.level_name);

    if (!normalizedLevelName) {
      continue;
    }

    if (
      group === "cambridge" &&
      !cambridgeLevelOrder.includes(normalizedLevelName)
    ) {
      continue;
    }

    if (!levelOptions.has(normalizedLevelName)) {
      levelOptions.set(normalizedLevelName, {
        value: normalizedLevelName,
        label:
          group === "cambridge"
            ? normalizedLevelName
            : cleanText(classroom.level_name, "Unknown Level"),
      });
    }
  }

  return Array.from(levelOptions.values()).sort((first, second) => {
    const firstSortIndex = getLevelSortIndex(group, first.value);
    const secondSortIndex = getLevelSortIndex(group, second.value);

    if (firstSortIndex !== secondSortIndex) {
      return firstSortIndex - secondSortIndex;
    }

    return first.label.localeCompare(second.label, undefined, {
      sensitivity: "base",
    });
  });
}

function buildClassOptions(
  classOptions: (CambridgeBulkClassOption | YoungLearnerBulkClassOption)[],
  group: StudentGroup
) {
  return classOptions.map((classroom) => ({
    value: classroom.id,
    label: formatClassSelectLabel(classroom, group),
  }));
}

function sortStudentsByName<
  T extends { id: string; first_name: string; last_name: string }
>(students: T[]) {
  return [...students].sort((first, second) => {
    const lastNameComparison = (first.last_name || "").localeCompare(
      second.last_name || "",
      undefined,
      { sensitivity: "base" }
    );

    if (lastNameComparison !== 0) {
      return lastNameComparison;
    }

    const firstNameComparison = (first.first_name || "").localeCompare(
      second.first_name || "",
      undefined,
      { sensitivity: "base" }
    );

    if (firstNameComparison !== 0) {
      return firstNameComparison;
    }

    return first.id.localeCompare(second.id);
  });
}

function getCountText(totalCount: number, shownCount: number, hasSearch: boolean) {
  const noun = totalCount === 1 ? "student" : "students";

  if (hasSearch) {
    return `${shownCount} of ${totalCount} ${noun} shown`;
  }

  return `${totalCount} ${noun} found`;
}

function getScheduleText(student: {
  days?: string;
  start_time?: string;
  end_time?: string;
}) {
  const timeSlot = formatTimeRange(student.start_time, student.end_time);

  return [student.days, timeSlot].filter(Boolean).join(" - ") || "-";
}

function normalizeDisplayValue(value: string | null | undefined) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

function isGenericClassName(value: string | null | undefined) {
  const normalizedValue = normalizeDisplayValue(value);

  return (
    !normalizedValue ||
    normalizedValue === "CLASS" ||
    normalizedValue === "GROUP" ||
    normalizedValue === "NO CLASS ASSIGNED"
  );
}

function isGeneratedClassDescription(
  label: string | null | undefined,
  student: {
    days?: string;
    start_time?: string;
    end_time?: string;
    classroom_name?: string;
  }
) {
  const normalizedLabel = normalizeDisplayValue(label);
  const scheduleFragments = [
    student.days,
    formatTimeRange(student.start_time, student.end_time),
    student.classroom_name,
  ]
    .map(normalizeDisplayValue)
    .filter(Boolean);

  return scheduleFragments.some((fragment) =>
    normalizedLabel.includes(fragment)
  );
}

function getConciseClassDisplay(
  student: AdminCambridgeStudentDirectoryRow | AdminYoungLearnerDirectoryRow
) {
  if (
    !isGenericClassName(student.class_name) &&
    !isGeneratedClassDescription(student.class_name, student)
  ) {
    return cleanText(student.class_name);
  }

  if (
    !isGenericClassName(student.class_label) &&
    !isGeneratedClassDescription(student.class_label, student)
  ) {
    return cleanText(student.class_label);
  }

  return cleanText(student.level_name, "Unknown Level");
}

export default function AdminStudentsPage() {
  const [activeStudentType, setActiveStudentType] =
    useState<StudentGroup>("cambridge");
  const [viewMode, setViewMode] = useState<ViewMode>("level");
  const [selectedFilter, setSelectedFilter] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [cambridgeStudents, setCambridgeStudents] = useState<
    AdminCambridgeStudentDirectoryRow[]
  >([]);
  const [youngLearners, setYoungLearners] = useState<
    AdminYoungLearnerDirectoryRow[]
  >([]);
  const [cambridgeClasses, setCambridgeClasses] = useState<
    CambridgeBulkClassOption[]
  >([]);
  const [youngLearnerClasses, setYoungLearnerClasses] = useState<
    YoungLearnerBulkClassOption[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [editingStudentId, setEditingStudentId] = useState("");
  const [editingYoungLearnerId, setEditingYoungLearnerId] = useState("");
  const [message, setMessage] = useState<StudentMessage | null>(null);
  const [pendingConfirmation, setPendingConfirmation] =
    useState<PendingConfirmation | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [form, setForm] = useState({
    first_name: "",
    last_name: "",
    email: "",
    class_id: "",
  });
  const [youngLearnerForm, setYoungLearnerForm] = useState({
    first_name: "",
    last_name: "",
    class_id: "",
  });

  async function loadData() {
    setLoading(true);
    setLoadError("");

    try {
      const [
        cambridgeStudentData,
        youngLearnerData,
        cambridgeClassData,
        youngLearnerClassData,
      ] = await Promise.all([
        getAdminCambridgeStudentDirectory(),
        getAdminYoungLearnerDirectory(),
        getCambridgeClassesForBulkCreate(),
        getYoungLearnerClassesForBulkCreate(),
      ]);

      setCambridgeStudents(cambridgeStudentData);
      setYoungLearners(youngLearnerData);
      setCambridgeClasses(cambridgeClassData);
      setYoungLearnerClasses(youngLearnerClassData);
    } catch (error) {
      console.error("Unable to load students:", error);
      setLoadError("Unable to load students. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  const currentClassOptions = useMemo(
    () =>
      activeStudentType === "cambridge"
        ? cambridgeClasses
        : youngLearnerClasses,
    [activeStudentType, cambridgeClasses, youngLearnerClasses]
  );

  const levelOptions = useMemo(
    () => buildLevelOptions(currentClassOptions, activeStudentType),
    [activeStudentType, currentClassOptions]
  );

  const classOptions = useMemo(
    () => buildClassOptions(currentClassOptions, activeStudentType),
    [activeStudentType, currentClassOptions]
  );

  const filterOptions = viewMode === "level" ? levelOptions : classOptions;
  const filterLabel = viewMode === "level" ? "Select level" : "Select class";
  const filterPlaceholder =
    viewMode === "level" ? "Select a level" : "Select a class";

  const selectedRows = useMemo(() => {
    if (!selectedFilter) {
      return [];
    }

    if (activeStudentType === "cambridge") {
      const rows =
        viewMode === "level"
          ? cambridgeStudents.filter(
              (student) =>
                normalizeLevelName(student.level_name) === selectedFilter
            )
          : cambridgeStudents.filter(
              (student) => student.class_id === selectedFilter
            );

      return sortStudentsByName(rows);
    }

    const rows =
      viewMode === "level"
        ? youngLearners.filter(
            (student) => normalizeLevelName(student.level_name) === selectedFilter
          )
        : youngLearners.filter((student) => student.class_id === selectedFilter);

    return sortStudentsByName(rows);
  }, [
    activeStudentType,
    cambridgeStudents,
    selectedFilter,
    viewMode,
    youngLearners,
  ]);

  const normalizedSearchTerm = normalizeSearchValue(searchTerm);

  const visibleRows = useMemo(() => {
    if (!normalizedSearchTerm) {
      return selectedRows;
    }

    return selectedRows.filter((student) => {
      const searchableText = [
        student.first_name,
        student.last_name,
        getStudentName(student),
        activeStudentType === "cambridge"
          ? (student as AdminCambridgeStudentDirectoryRow).email
          : "",
      ].join(" ");

      return normalizeSearchValue(searchableText).includes(normalizedSearchTerm);
    });
  }, [activeStudentType, normalizedSearchTerm, selectedRows]);

  const selectedCambridgeRows =
    activeStudentType === "cambridge"
      ? (visibleRows as AdminCambridgeStudentDirectoryRow[])
      : [];
  const selectedYoungLearnerRows =
    activeStudentType === "youngLearners"
      ? (visibleRows as AdminYoungLearnerDirectoryRow[])
      : [];
  const countText = getCountText(
    selectedRows.length,
    visibleRows.length,
    Boolean(normalizedSearchTerm)
  );
  const editingYoungLearner = youngLearners.find(
    (student) => student.id === editingYoungLearnerId
  );

  function updateForm(field: string, value: string) {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function updateYoungLearnerForm(field: string, value: string) {
    setYoungLearnerForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function resetForm() {
    setForm({
      first_name: "",
      last_name: "",
      email: "",
      class_id: "",
    });
  }

  function resetYoungLearnerForm() {
    setYoungLearnerForm({
      first_name: "",
      last_name: "",
      class_id: "",
    });
  }

  function closeEditForms() {
    setEditingStudentId("");
    setEditingYoungLearnerId("");
    resetForm();
    resetYoungLearnerForm();
  }

  function hasOpenEditForm() {
    return Boolean(editingStudentId || editingYoungLearnerId);
  }

  function requestFilterContextChange(
    confirmation: Omit<PendingConfirmation, "onConfirm">,
    onConfirm: () => void
  ) {
    if (!hasOpenEditForm()) {
      onConfirm();
      return;
    }

    setPendingConfirmation({
      ...confirmation,
      onConfirm: () => {
        closeEditForms();
        onConfirm();
      },
    });
  }

  function handleStudentGroupChange(nextGroup: StudentGroup) {
    if (nextGroup === activeStudentType) {
      return;
    }

    requestFilterContextChange(
      {
        title: "Change student group?",
        body: "Changing student group will close the current edit form and discard unsaved changes. Continue?",
        confirmLabel: "Change Group",
      },
      () => {
        setActiveStudentType(nextGroup);
        setSelectedFilter("");
        setSearchTerm("");
        setMessage(null);
        setDeleteTarget(null);
      }
    );
  }

  function handleViewModeChange(nextViewMode: ViewMode) {
    if (nextViewMode === viewMode) {
      return;
    }

    requestFilterContextChange(
      {
        title: "Change view?",
        body: "Changing view will close the current edit form and discard unsaved changes. Continue?",
        confirmLabel: "Change View",
      },
      () => {
        setViewMode(nextViewMode);
        setSelectedFilter("");
        setSearchTerm("");
        setMessage(null);
        setDeleteTarget(null);
      }
    );
  }

  function startCambridgeEdit(student: AdminCambridgeStudentDirectoryRow) {
    setDeleteTarget(null);
    setMessage(null);
    setEditingYoungLearnerId("");
    resetYoungLearnerForm();
    setEditingStudentId(student.id);
    setForm({
      first_name: student.first_name || "",
      last_name: student.last_name || "",
      email: student.email || "",
      class_id: student.class_id || "",
    });
  }

  function startYoungLearnerEdit(student: AdminYoungLearnerDirectoryRow) {
    setDeleteTarget(null);
    setMessage(null);
    setEditingStudentId("");
    resetForm();
    setEditingYoungLearnerId(student.id);
    setYoungLearnerForm({
      first_name: student.first_name || "",
      last_name: student.last_name || "",
      class_id: student.class_id || "",
    });
  }

  function validateYoungLearnerForm() {
    const firstName = youngLearnerForm.first_name.trim();
    const lastName = youngLearnerForm.last_name.trim();
    const classId = youngLearnerForm.class_id.trim();

    if (!firstName) {
      return "First name is required.";
    }

    if (firstName.length > 80) {
      return "First name must be 80 characters or fewer.";
    }

    if (!lastName) {
      return "Last name is required.";
    }

    if (lastName.length > 80) {
      return "Last name must be 80 characters or fewer.";
    }

    if (!classId) {
      return "Class is required.";
    }

    return "";
  }

  async function handleCambridgeSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);

    const firstName = form.first_name.trim();
    const lastName = form.last_name.trim();
    const classId = form.class_id.trim();

    if (!editingStudentId) {
      return;
    }

    if (!firstName || !lastName || !classId) {
      setMessage({
        type: "error",
        text: "First name, last name and class are required.",
      });
      return;
    }

    setSaving(true);

    try {
      await updateStudent(editingStudentId, {
        first_name: firstName,
        last_name: lastName,
      });
      await updateStudentClass(editingStudentId, classId);

      closeEditForms();
      await loadData();
      setMessage({
        type: "success",
        text: "Student details updated successfully.",
      });
    } catch (error: any) {
      console.error("Unable to save student:", error);
      setMessage({
        type: "error",
        text: error.message || "Unable to save student.",
      });
    } finally {
      setSaving(false);
    }
  }

  async function handleYoungLearnerSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);

    if (!editingYoungLearnerId) {
      return;
    }

    const validationMessage = validateYoungLearnerForm();

    if (validationMessage) {
      setMessage({
        type: "error",
        text: validationMessage,
      });
      return;
    }

    const firstName = youngLearnerForm.first_name.trim();
    const lastName = youngLearnerForm.last_name.trim();
    const classId = youngLearnerForm.class_id.trim();

    setSaving(true);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        setMessage({
          type: "error",
          text: "You must be logged in as an admin.",
        });
        return;
      }

      const response = await fetch("/api/admin/young-learners/update", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          young_learner_id: editingYoungLearnerId,
          first_name: firstName,
          last_name: lastName,
          class_id: classId,
        }),
      });

      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(result.error || "Unable to update Young Learner.");
      }

      closeEditForms();
      await loadData();
      setMessage({
        type: "success",
        text: "Student details updated successfully.",
      });
    } catch (error: any) {
      console.error("Unable to update Young Learner:", error);
      setMessage({
        type: "error",
        text: error.message || "Unable to update Young Learner.",
      });
    } finally {
      setSaving(false);
    }
  }

  function openDeleteDialog(
    student:
      | AdminCambridgeStudentDirectoryRow
      | AdminYoungLearnerDirectoryRow,
    studentType: "cambridge" | "young_learner"
  ) {
    setMessage(null);
    setDeleteTarget({
      id: student.id,
      studentType,
      name: getStudentName(student) || "this student",
    });
  }

  async function handleConfirmDelete() {
    if (!deleteTarget) {
      return;
    }

    setDeleting(true);
    setMessage(null);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        setMessage({
          type: "error",
          text: "You must be logged in as an admin.",
        });
        return;
      }

      const response = await fetch("/api/admin/students/delete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          student_id: deleteTarget.id,
          student_type: deleteTarget.studentType,
        }),
      });

      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          result.details || result.error || "Unable to delete student."
        );
      }

      if (editingStudentId === deleteTarget.id) {
        setEditingStudentId("");
        resetForm();
      }

      if (editingYoungLearnerId === deleteTarget.id) {
        setEditingYoungLearnerId("");
        resetYoungLearnerForm();
      }

      setDeleteTarget(null);
      await loadData();
      setMessage({
        type: "success",
        text: "Student deleted successfully.",
      });
    } catch (error: any) {
      console.error("Unable to delete student:", error);
      setMessage({
        type: "error",
        text: error.message || "Unable to delete student.",
      });
    } finally {
      setDeleting(false);
    }
  }

  function renderCambridgeTable(rows: AdminCambridgeStudentDirectoryRow[]) {
    return (
      <div className="admin-students-table-wrap">
        <table className="admin-students-table">
          <caption>
            Cambridge students matching the selected {viewMode}.
          </caption>
          <thead>
            <tr>
              <th scope="col">#</th>
              <th scope="col">First Name</th>
              <th scope="col">Last Name</th>
              <th scope="col">Email</th>
              <th scope="col">Level</th>
              <th scope="col">Course Type</th>
              <th scope="col">Schedule</th>
              <th scope="col">Teacher</th>
              <th scope="col">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((student, index) => (
              <tr key={student.id}>
                <td>{index + 1}</td>
                <td>{cleanText(student.first_name)}</td>
                <td>{cleanText(student.last_name)}</td>
                <td>{cleanText(student.email)}</td>
                <td>{normalizeLevelName(student.level_name) || "-"}</td>
                <td>{formatCourseType(student.course_type)}</td>
                <td>
                  <div className="admin-students-schedule">
                    <span>{cleanText(student.days)}</span>
                    <span>{formatTimeRange(student.start_time, student.end_time) || "-"}</span>
                  </div>
                </td>
                <td>{cleanText(student.teacher_name, "No teacher assigned")}</td>
                <td>
                  <div className="admin-students-actions">
                    <button
                      type="button"
                      className="admin-students-action-button admin-students-action-edit"
                      onClick={() => startCambridgeEdit(student)}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="admin-students-action-button admin-students-action-delete"
                      onClick={() => openDeleteDialog(student, "cambridge")}
                    >
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  function renderYoungLearnerTable(rows: AdminYoungLearnerDirectoryRow[]) {
    return (
      <div className="admin-students-table-wrap">
        <table className="admin-students-table admin-students-table-young">
          <caption>
            Young Learners matching the selected {viewMode}.
          </caption>
          <thead>
            <tr>
              <th scope="col">#</th>
              <th scope="col">First Name</th>
              <th scope="col">Last Name</th>
              <th scope="col">Level</th>
              <th scope="col">Teacher</th>
              <th scope="col">Schedule</th>
              <th scope="col">Classroom</th>
              <th scope="col">Status</th>
              <th scope="col">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((student, index) => (
              <tr key={student.id}>
                <td>{index + 1}</td>
                <td>{cleanText(student.first_name)}</td>
                <td>{cleanText(student.last_name)}</td>
                <td>{cleanText(student.level_name)}</td>
                <td>{cleanText(student.teacher_name, "No teacher assigned")}</td>
                <td>{getScheduleText(student)}</td>
                <td>{cleanText(student.classroom_name)}</td>
                <td>
                  <span
                    className={`admin-students-status ${
                      student.active === false
                        ? "admin-students-status-inactive"
                        : "admin-students-status-active"
                    }`}
                  >
                    {student.active === false ? "Inactive" : "Active"}
                  </span>
                </td>
                <td>
                  <div className="admin-students-actions">
                    <button
                      type="button"
                      className="admin-students-action-button admin-students-action-edit"
                      onClick={() => startYoungLearnerEdit(student)}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="admin-students-action-button admin-students-action-delete"
                      onClick={() => openDeleteDialog(student, "young_learner")}
                    >
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  function renderCambridgeMobileCards(
    rows: AdminCambridgeStudentDirectoryRow[]
  ) {
    return (
      <div className="admin-students-mobile-list">
        {rows.map((student, index) => (
          <article className="admin-students-mobile-card" key={student.id}>
            <div className="admin-students-mobile-card-header">
              <span>Student {index + 1}</span>
              <strong>{getStudentName(student) || "Unnamed student"}</strong>
            </div>
            <dl>
              <div>
                <dt>Email</dt>
                <dd>{cleanText(student.email)}</dd>
              </div>
              <div>
                <dt>Level</dt>
                <dd>{normalizeLevelName(student.level_name) || "-"}</dd>
              </div>
              <div>
                <dt>Course Type</dt>
                <dd>{formatCourseType(student.course_type)}</dd>
              </div>
              <div>
                <dt>Schedule</dt>
                <dd>{getScheduleText(student)}</dd>
              </div>
              <div>
                <dt>Teacher</dt>
                <dd>{cleanText(student.teacher_name, "No teacher assigned")}</dd>
              </div>
            </dl>
            <div className="admin-students-actions">
              <button
                type="button"
                className="admin-students-action-button admin-students-action-edit"
                onClick={() => startCambridgeEdit(student)}
              >
                Edit
              </button>
              <button
                type="button"
                className="admin-students-action-button admin-students-action-delete"
                onClick={() => openDeleteDialog(student, "cambridge")}
              >
                Delete
              </button>
            </div>
          </article>
        ))}
      </div>
    );
  }

  function renderYoungLearnerMobileCards(
    rows: AdminYoungLearnerDirectoryRow[]
  ) {
    return (
      <div className="admin-students-mobile-list">
        {rows.map((student, index) => (
          <article className="admin-students-mobile-card" key={student.id}>
            <div className="admin-students-mobile-card-header">
              <span>Student {index + 1}</span>
              <strong>{getStudentName(student) || "Unnamed student"}</strong>
            </div>
            <dl>
              <div>
                <dt>Level</dt>
                <dd>{cleanText(student.level_name)}</dd>
              </div>
              <div>
                <dt>Teacher</dt>
                <dd>{cleanText(student.teacher_name, "No teacher assigned")}</dd>
              </div>
              <div>
                <dt>Schedule</dt>
                <dd>{getScheduleText(student)}</dd>
              </div>
              <div>
                <dt>Classroom</dt>
                <dd>{cleanText(student.classroom_name)}</dd>
              </div>
              <div>
                <dt>Status</dt>
                <dd>{student.active === false ? "Inactive" : "Active"}</dd>
              </div>
            </dl>
            <div className="admin-students-actions">
              <button
                type="button"
                className="admin-students-action-button admin-students-action-edit"
                onClick={() => startYoungLearnerEdit(student)}
              >
                Edit
              </button>
              <button
                type="button"
                className="admin-students-action-button admin-students-action-delete"
                onClick={() => openDeleteDialog(student, "young_learner")}
              >
                Delete
              </button>
            </div>
          </article>
        ))}
      </div>
    );
  }

  function renderEmptyState() {
    if (loading) {
      return <div className="admin-students-empty">Loading students...</div>;
    }

    if (loadError) {
      return (
        <div className="admin-students-empty">
          <p>{loadError}</p>
          <button
            type="button"
            className="admin-students-secondary-button"
            onClick={loadData}
          >
            Retry
          </button>
        </div>
      );
    }

    if (!selectedFilter) {
      return (
        <div className="admin-students-empty">
          {viewMode === "level"
            ? "Select a level to view students."
            : "Select a class to view students."}
        </div>
      );
    }

    if (selectedRows.length === 0) {
      return (
        <div className="admin-students-empty">
          No students were found for this selection.
        </div>
      );
    }

    if (visibleRows.length === 0) {
      return (
        <div className="admin-students-empty">
          No students match your search.
        </div>
      );
    }

    return null;
  }

  function renderResults() {
    const emptyState = renderEmptyState();

    if (emptyState) {
      return emptyState;
    }

    if (activeStudentType === "cambridge") {
      return (
        <>
          {renderCambridgeTable(selectedCambridgeRows)}
          {renderCambridgeMobileCards(selectedCambridgeRows)}
        </>
      );
    }

    return (
      <>
        {renderYoungLearnerTable(selectedYoungLearnerRows)}
        {renderYoungLearnerMobileCards(selectedYoungLearnerRows)}
      </>
    );
  }

  function renderEditDialog() {
    if (editingStudentId) {
      return (
        <div className="admin-students-dialog-backdrop">
          <div
            className="admin-students-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="admin-students-edit-title"
          >
            <form onSubmit={handleCambridgeSubmit}>
              <div className="admin-students-dialog-header">
                <h2 id="admin-students-edit-title">Edit Cambridge Student</h2>
                <p>Update this Cambridge student's name or class assignment.</p>
              </div>

              <div className="admin-students-form-grid">
                <label>
                  <span>First Name</span>
                  <input
                    required
                    disabled={saving}
                    value={form.first_name}
                    onChange={(event) =>
                      updateForm("first_name", event.target.value)
                    }
                  />
                </label>

                <label>
                  <span>Last Name</span>
                  <input
                    required
                    disabled={saving}
                    value={form.last_name}
                    onChange={(event) =>
                      updateForm("last_name", event.target.value)
                    }
                  />
                </label>

                <label>
                  <span>Email</span>
                  <input readOnly disabled value={form.email || "-"} />
                </label>

                <label>
                  <span>Class</span>
                  <select
                    required
                    disabled={saving}
                    value={form.class_id}
                    onChange={(event) =>
                      updateForm("class_id", event.target.value)
                    }
                  >
                    <option value="">Select a class</option>
                    {cambridgeClasses.map((classroom) => (
                      <option key={classroom.id} value={classroom.id}>
                        {formatClassSelectLabel(classroom, "cambridge")}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="admin-students-dialog-actions">
                <button
                  type="button"
                  className="admin-students-secondary-button"
                  onClick={closeEditForms}
                  disabled={saving}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="admin-students-primary-button"
                  disabled={saving}
                >
                  {saving ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      );
    }

    if (editingYoungLearnerId) {
      return (
        <div className="admin-students-dialog-backdrop">
          <div
            className="admin-students-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="admin-students-edit-title"
          >
            <form onSubmit={handleYoungLearnerSubmit}>
              <div className="admin-students-dialog-header">
                <h2 id="admin-students-edit-title">Edit Young Learner</h2>
                <p>Update this Young Learner's name or class assignment.</p>
              </div>

              <div className="admin-students-form-grid">
                <label>
                  <span>First Name</span>
                  <input
                    required
                    maxLength={80}
                    disabled={saving}
                    value={youngLearnerForm.first_name}
                    onChange={(event) =>
                      updateYoungLearnerForm("first_name", event.target.value)
                    }
                  />
                </label>

                <label>
                  <span>Last Name</span>
                  <input
                    required
                    maxLength={80}
                    disabled={saving}
                    value={youngLearnerForm.last_name}
                    onChange={(event) =>
                      updateYoungLearnerForm("last_name", event.target.value)
                    }
                  />
                </label>

                <label>
                  <span>Class</span>
                  <select
                    required
                    disabled={saving}
                    value={youngLearnerForm.class_id}
                    onChange={(event) =>
                      updateYoungLearnerForm("class_id", event.target.value)
                    }
                  >
                    <option value="">Select a class</option>
                    {youngLearnerClasses.map((classroom) => (
                      <option key={classroom.id} value={classroom.id}>
                        {formatClassSelectLabel(classroom, "youngLearners")}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  <span>Status</span>
                  <input
                    readOnly
                    disabled
                    value={
                      editingYoungLearner?.active === false
                        ? "Inactive"
                        : "Active"
                    }
                  />
                </label>
              </div>

              <div className="admin-students-dialog-actions">
                <button
                  type="button"
                  className="admin-students-secondary-button"
                  onClick={closeEditForms}
                  disabled={saving}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="admin-students-primary-button"
                  disabled={saving}
                >
                  {saving ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      );
    }

    return null;
  }

  return (
    <AdminLayout>
      <main className="admin-students-page">
        <div className="admin-students-page-heading">
          <h1>Students</h1>
          <p>
            Browse and manage Cambridge Students or Young Learners by level or
            class.
          </p>
        </div>

        <section className="admin-students-card">
          <div className="admin-students-header">
            <div>
              <h2>Student directory</h2>
              <p>
                Choose a student group, select a level or class, then manage the
                matching students from one focused list.
              </p>
            </div>
            <Link href="/admin/add-users" className="admin-students-add-link">
              Add Users
            </Link>
          </div>

          {message && (
            <div
              className={`admin-students-message admin-students-message-${message.type}`}
              aria-live="polite"
            >
              {message.text}
            </div>
          )}

          <div className="admin-students-steps">
            <section className="admin-students-step">
              <div className="admin-students-step-heading">
                <span className="admin-students-step-number">1</span>
                <div>
                  <h3>Choose student group</h3>
                  <p>Select which student directory to view.</p>
                </div>
              </div>
              <div
                className="admin-students-segmented"
                aria-label="Choose student group"
              >
                <button
                  type="button"
                  className={`admin-students-segment ${
                    activeStudentType === "cambridge"
                      ? "admin-students-segment-active"
                      : ""
                  }`}
                  aria-pressed={activeStudentType === "cambridge"}
                  onClick={() => handleStudentGroupChange("cambridge")}
                >
                  Cambridge Students
                </button>
                <button
                  type="button"
                  className={`admin-students-segment ${
                    activeStudentType === "youngLearners"
                      ? "admin-students-segment-active"
                      : ""
                  }`}
                  aria-pressed={activeStudentType === "youngLearners"}
                  onClick={() => handleStudentGroupChange("youngLearners")}
                >
                  Young Learners
                </button>
              </div>
            </section>

            <section className="admin-students-step">
              <div className="admin-students-step-heading">
                <span className="admin-students-step-number">2</span>
                <div>
                  <h3>Choose view</h3>
                  <p>Browse by level or a specific class.</p>
                </div>
              </div>
              <div className="admin-students-segmented" aria-label="Choose view">
                <button
                  type="button"
                  className={`admin-students-segment ${
                    viewMode === "level" ? "admin-students-segment-active" : ""
                  }`}
                  aria-pressed={viewMode === "level"}
                  onClick={() => handleViewModeChange("level")}
                >
                  View by Level
                </button>
                <button
                  type="button"
                  className={`admin-students-segment ${
                    viewMode === "class" ? "admin-students-segment-active" : ""
                  }`}
                  aria-pressed={viewMode === "class"}
                  onClick={() => handleViewModeChange("class")}
                >
                  View by Class
                </button>
              </div>
            </section>

            <section className="admin-students-step">
              <div className="admin-students-step-heading">
                <span className="admin-students-step-number">3</span>
                <div>
                  <h3>Select level or class</h3>
                  <p>Choose the exact list to open.</p>
                </div>
              </div>
              <label
                className="admin-students-filter"
                htmlFor="admin-students-filter-select"
              >
                <span>{filterLabel}</span>
                <select
                  id="admin-students-filter-select"
                  value={selectedFilter}
                  disabled={loading || Boolean(loadError)}
                  onChange={(event) => {
                    setSelectedFilter(event.target.value);
                    setSearchTerm("");
                    setMessage(null);
                    closeEditForms();
                  }}
                >
                  <option value="">{filterPlaceholder}</option>
                  {filterOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </section>
          </div>

          <section className="admin-students-results">
            <div className="admin-students-toolbar">
              <div className="admin-students-count" aria-live="polite">
                {selectedFilter && !loading && !loadError
                  ? countText
                  : activeStudentType === "cambridge"
                    ? "Cambridge Students"
                    : "Young Learners"}
              </div>

              {selectedFilter && selectedRows.length > 0 && !loadError && (
                <label
                  className="admin-students-search"
                  htmlFor="admin-students-search"
                >
                  <span>Search</span>
                  <input
                    id="admin-students-search"
                    value={searchTerm}
                    placeholder={
                      activeStudentType === "cambridge"
                        ? "Search by name or email"
                        : "Search by name"
                    }
                    onChange={(event) => setSearchTerm(event.target.value)}
                  />
                </label>
              )}
            </div>

            {renderResults()}
          </section>
        </section>
      </main>

      {renderEditDialog()}

      {pendingConfirmation && (
        <div className="admin-students-dialog-backdrop">
          <div
            className="admin-students-dialog admin-students-confirm-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="admin-students-confirm-title"
          >
            <h2 id="admin-students-confirm-title">
              {pendingConfirmation.title}
            </h2>
            <p>{pendingConfirmation.body}</p>
            <div className="admin-students-dialog-actions">
              <button
                type="button"
                className="admin-students-secondary-button"
                onClick={() => setPendingConfirmation(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="admin-students-primary-button"
                onClick={() => {
                  const confirmAction = pendingConfirmation.onConfirm;
                  setPendingConfirmation(null);
                  confirmAction();
                }}
              >
                {pendingConfirmation.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div className="admin-students-dialog-backdrop">
          <div
            className="admin-students-dialog admin-students-confirm-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="admin-students-delete-title"
          >
            <h2 id="admin-students-delete-title">
              {deleteTarget.studentType === "cambridge"
                ? "Permanently delete Cambridge student?"
                : "Permanently delete Young Learner?"}
            </h2>
            <p>
              {deleteTarget.studentType === "cambridge"
                ? "This permanently removes the student account, class enrolment and related portal records. This action cannot be undone."
                : "This permanently removes the Young Learner and related school records. This action cannot be undone."}
            </p>
            <p className="admin-students-delete-name">{deleteTarget.name}</p>
            <div className="admin-students-dialog-actions">
              <button
                type="button"
                className="admin-students-secondary-button"
                onClick={() => setDeleteTarget(null)}
                disabled={deleting}
              >
                Cancel
              </button>
              <button
                type="button"
                className="admin-students-danger-button"
                onClick={handleConfirmDelete}
                disabled={deleting}
              >
                {deleting ? "Deleting..." : "Delete Permanently"}
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
