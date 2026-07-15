"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import AdminLayout from "../../components/layout/AdminLayout";
import {
  getCambridgeClassesForStudentInvite,
  getStudents,
  getYoungLearnerClassesForStudentCreate,
  getYoungLearners,
  updateStudent,
  updateStudentClass,
} from "../../../lib/adminStudents";
import { supabase } from "../../../lib/supabase";

const inputStyle = {
  width: "100%",
  padding: "12px",
  border: "1px solid #d9d9d9",
  borderRadius: "8px",
  fontSize: "15px",
  color: "#333",
  background: "#ffffff",
  boxSizing: "border-box" as const,
};

const cambridgeLevelOrder = ["B1", "B2", "C1", "C2"];

const youngLearnerLevelOrder = [
  "Pre-Kids",
  "Pre-Kids 1",
  "Pre-Kids 2",
  "Pre-Kids 3",
  "Kids 1",
  "Kids 2",
  "Kids 3",
  "Junior 1",
  "Junior 2",
  "Junior 3",
  "Junior 4",
  "Teens 1",
  "Teens 2",
  "Teens 3",
];

const labelStyle = {
  fontWeight: 600,
  marginBottom: "6px",
  display: "block" as const,
  color: "#333",
};

function getModeButtonStyle(isActive: boolean) {
  return {
    background: isActive ? "#1f3c88" : "#ffffff",
    color: isActive ? "#ffffff" : "#1f3c88",
    border: "1px solid #1f3c88",
    borderRadius: "8px",
    padding: "10px 14px",
    cursor: "pointer",
    fontWeight: 700,
  };
}

function getStudentName(student: any) {
  return `${student.first_name || ""} ${
    student.last_name || ""
  }`.trim();
}

function formatCourseType(courseType: string) {
  if (!courseType) return "-";

  return courseType.charAt(0).toUpperCase() + courseType.slice(1);
}

function formatClassOption(classroom: any) {
  if (classroom.class_label) {
    return classroom.class_label;
  }

  const timeSlot =
    classroom.start_time && classroom.end_time
      ? `${classroom.start_time}-${classroom.end_time}`
      : "-";

  return `${classroom.level_name || "-"} - ${formatCourseType(
    classroom.course_type
  )} - ${classroom.days || "-"} - ${timeSlot} - ${
    classroom.classroom_name || "No classroom assigned"
  }`;
}

function getOrderedLevelNames(groupedItems: Record<string, any[]>, order: string[]) {
  const knownLevels = order.filter((level) => groupedItems[level]?.length > 0);
  const otherLevels = Object.keys(groupedItems)
    .filter((level) => !order.includes(level))
    .sort((first, second) => first.localeCompare(second));

  return [...knownLevels, ...otherLevels];
}

export default function AdminStudentsPage() {
  const [activeStudentType, setActiveStudentType] = useState<
    "cambridge" | "youngLearners"
  >("cambridge");
  const [students, setStudents] = useState<any[]>([]);
  const [youngLearners, setYoungLearners] = useState<any[]>([]);
  const [classes, setClasses] = useState<any[]>([]);
  const [youngLearnerClasses, setYoungLearnerClasses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingStudentId, setEditingStudentId] = useState("");
  const [editingYoungLearnerId, setEditingYoungLearnerId] = useState("");
  const [savingYoungLearnerEdit, setSavingYoungLearnerEdit] = useState(false);
  const [message, setMessage] = useState("");
  const [classesMessage, setClassesMessage] = useState("");
  const [youngLearnerClassesMessage, setYoungLearnerClassesMessage] =
    useState("");
  const [youngLearnerEditError, setYoungLearnerEditError] = useState("");
  const [youngLearnerEditSuccess, setYoungLearnerEditSuccess] = useState("");
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
    setClassesMessage("");
    setYoungLearnerClassesMessage("");

    try {
      const studentData = await getStudents();
      setStudents(studentData);
    } catch (error) {
      console.error("Unable to load students:", error);
      setMessage("Unable to load Cambridge students.");
    }

    try {
      const youngLearnerData = await getYoungLearners();
      setYoungLearners(youngLearnerData);
    } catch (error) {
      console.error("Unable to load Young Learners:", error);
      setMessage("Unable to load Young Learners.");
    }

    try {
      const classData = await getCambridgeClassesForStudentInvite();
      setClasses(classData);

      if (classData.length === 0) {
        setClassesMessage("No Cambridge classes found.");
      }
    } catch (error) {
      console.error("Unable to load Cambridge classes:", error);
      setClasses([]);
      setClassesMessage("Unable to load Cambridge classes.");
    }

    try {
      const youngLearnerClassData =
        await getYoungLearnerClassesForStudentCreate();
      setYoungLearnerClasses(youngLearnerClassData);

      if (youngLearnerClassData.length === 0) {
        setYoungLearnerClassesMessage("No Young Learner classes found.");
      }
    } catch (error) {
      console.error("Unable to load Young Learner classes:", error);
      setYoungLearnerClasses([]);
      setYoungLearnerClassesMessage("Unable to load Young Learner classes.");
    }

    setLoading(false);
  }

  useEffect(() => {
    loadData();
  }, []);

  function updateForm(field: string, value: string) {
    setForm((current) => ({
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

  function resetYoungLearnerEdit() {
    setEditingYoungLearnerId("");
    setYoungLearnerForm({
      first_name: "",
      last_name: "",
      class_id: "",
    });
  }

  function cancelEdit() {
    setEditingStudentId("");
    resetForm();
    setMessage("");
  }

  function cancelYoungLearnerEdit() {
    resetYoungLearnerEdit();
    setYoungLearnerEditError("");
  }

  function startEdit(student: any) {
    setEditingStudentId(student.id);
    setEditingYoungLearnerId("");
    setMessage("");
    setForm({
      first_name: student.first_name || "",
      last_name: student.last_name || "",
      email: student.email || "",
      class_id: student.class_id || "",
    });
  }

  function updateYoungLearnerForm(field: string, value: string) {
    setYoungLearnerForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function startYoungLearnerEdit(student: any) {
    setEditingStudentId("");
    setEditingYoungLearnerId(student.id);
    setYoungLearnerEditError("");
    setYoungLearnerEditSuccess("");
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

  async function handleDeleteStudent(
    studentId: string,
    studentType: "cambridge" | "young_learner" = "cambridge"
  ) {
    const warning =
      studentType === "young_learner"
        ? "Are you sure you want to permanently delete this Young Learner?\n\nThis will also delete related Unit Exam results, follow-up documents and tutorial records.\n\nThis action cannot be undone."
        : "Are you sure you want to permanently delete this Cambridge student?\n\nThis will also delete all related student information, including class assignment, results, messages, follow-up documents, tutorial records, homework read history and announcement read history.\n\nThis action cannot be undone.";

    const confirmed = confirm(
      warning
    );

    if (!confirmed) return;

    setMessage("");

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        setMessage("You must be logged in as an admin.");
        return;
      }

      const response = await fetch("/api/admin/students/delete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          student_id: studentId,
          student_type: studentType,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          result.details || result.error || "Unable to delete student."
        );
      }

      if (editingStudentId === studentId) {
        setEditingStudentId("");
        resetForm();
      }

      if (
        studentType === "young_learner" &&
        editingYoungLearnerId === studentId
      ) {
        resetYoungLearnerEdit();
      }

      await loadData();
      setMessage(result.message || "Student deleted successfully.");
    } catch (error: any) {
      console.error("Unable to delete student:", error);
      setMessage(error.message || "Unable to delete student.");
    }
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setMessage("");

    try {
      if (!editingStudentId) {
        return;
      }

      await updateStudent(editingStudentId, {
        first_name: form.first_name,
        last_name: form.last_name,
      });
      await updateStudentClass(editingStudentId, form.class_id);

      resetForm();
      setEditingStudentId("");
      await loadData();
      setMessage("Student updated successfully.");
    } catch (error: any) {
      console.error("Unable to save student:", error);
      setMessage(error.message || "Unable to save student.");
    } finally {
      setSaving(false);
    }
  }

  async function handleYoungLearnerSubmit(event: React.FormEvent) {
    event.preventDefault();
    setYoungLearnerEditError("");
    setYoungLearnerEditSuccess("");

    if (!editingYoungLearnerId) {
      return;
    }

    const validationMessage = validateYoungLearnerForm();

    if (validationMessage) {
      setYoungLearnerEditError(validationMessage);
      return;
    }

    const firstName = youngLearnerForm.first_name.trim();
    const lastName = youngLearnerForm.last_name.trim();
    const classId = youngLearnerForm.class_id.trim();

    setSavingYoungLearnerEdit(true);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        setYoungLearnerEditError("You must be logged in as an admin.");
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

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Unable to update Young Learner.");
      }

      resetYoungLearnerEdit();
      await loadData();
      setYoungLearnerEditSuccess(
        result.message || "Young Learner updated successfully."
      );
    } catch (error: any) {
      console.error("Unable to update Young Learner:", error);
      setYoungLearnerEditError(
        error.message || "Unable to update Young Learner."
      );
    } finally {
      setSavingYoungLearnerEdit(false);
    }
  }

  function groupStudentsByLevel(items: any[]) {
    return items.reduce((groups: Record<string, any[]>, student) => {
      const levelName = student.level_name || "Unknown Level";

      if (!groups[levelName]) {
        groups[levelName] = [];
      }

      groups[levelName].push(student);

      return groups;
    }, {});
  }

  function renderCambridgeStudentCard(student: any) {
    return (
      <div
        key={student.id}
        style={{
          border: "1px solid #e5e5e5",
          borderRadius: "10px",
          padding: "18px",
          background: "#f8f9fc",
        }}
      >
        <h3
          style={{
            color: "#1f3c88",
            marginTop: 0,
            marginBottom: "8px",
          }}
        >
          {getStudentName(student)}
        </h3>

        <div
          style={{
            color: "#555",
          }}
        >
          {student.email || "-"}
        </div>

        <div
          style={{
            color: "#555",
            marginTop: "8px",
          }}
        >
          <strong>Class</strong>
          <br />
          {student.class_label || "No class assigned"}
        </div>

        <div
          style={{
            display: "flex",
            gap: "12px",
            marginTop: "16px",
          }}
        >
          <button
            onClick={() => startEdit(student)}
            style={{
              background: "#1f3c88",
              color: "#ffffff",
              border: "none",
              borderRadius: "8px",
              padding: "10px 16px",
              cursor: "pointer",
              fontWeight: 700,
            }}
          >
            Edit
          </button>

          <button
            onClick={() => handleDeleteStudent(student.id, "cambridge")}
            style={{
              background: "#d32f2f",
              color: "#ffffff",
              border: "none",
              borderRadius: "8px",
              padding: "10px 16px",
              cursor: "pointer",
              fontWeight: 700,
            }}
          >
            Delete
          </button>
        </div>
      </div>
    );
  }

  function renderYoungLearnerCard(student: any) {
    return (
      <div
        key={student.id}
        style={{
          border: "1px solid #e5e5e5",
          borderRadius: "10px",
          padding: "18px",
          background: "#f8f9fc",
        }}
      >
        <h3
          style={{
            color: "#1f3c88",
            marginTop: 0,
            marginBottom: "8px",
          }}
        >
          {getStudentName(student)}
        </h3>

        <div
          style={{
            color: "#555",
            marginTop: "8px",
          }}
        >
          <strong>Class</strong>
          <br />
          {student.class_label || "No class assigned"}
        </div>

        <div
          style={{
            color: "#555",
            marginTop: "8px",
          }}
        >
          <strong>Status</strong>
          <br />
          {student.active === false ? "Inactive" : "Active"}
        </div>

        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "12px",
            marginTop: "16px",
          }}
        >
          <button
            type="button"
            onClick={() => startYoungLearnerEdit(student)}
            style={{
              background: "#1f3c88",
              color: "#ffffff",
              border: "none",
              borderRadius: "8px",
              padding: "10px 16px",
              cursor: "pointer",
              fontWeight: 700,
            }}
          >
            Edit
          </button>

          <button
            type="button"
            onClick={() => handleDeleteStudent(student.id, "young_learner")}
            style={{
              background: "#d32f2f",
              color: "#ffffff",
              border: "none",
              borderRadius: "8px",
              padding: "10px 16px",
              cursor: "pointer",
              fontWeight: 700,
            }}
          >
            Delete
          </button>
        </div>
      </div>
    );
  }

  function renderGroupedStudentSections(
    items: any[],
    levelOrder: string[],
    renderCard: (student: any) => any
  ) {
    const groupedItems = groupStudentsByLevel(items);
    const orderedLevels = getOrderedLevelNames(groupedItems, levelOrder);

    return (
      <div
        style={{
          display: "grid",
          gap: "18px",
        }}
      >
        {orderedLevels.map((levelName) => (
          <section
            key={levelName}
            style={{
              border: "1px solid #e6eaf2",
              borderRadius: "12px",
              padding: "16px",
              background: "#ffffff",
            }}
          >
            <h3
              style={{
                color: "#333",
                margin: "0 0 12px",
                fontSize: "17px",
              }}
            >
              {levelName}
            </h3>

            <div
              style={{
                display: "grid",
                gap: "12px",
              }}
            >
              {groupedItems[levelName].map(renderCard)}
            </div>
          </section>
        ))}
      </div>
    );
  }

  return (
    <AdminLayout>
      <h1
        style={{
          color: "#1f3c88",
          marginBottom: "10px",
        }}
      >
        Students
      </h1>

      <p
        style={{
          color: "#666",
          marginBottom: "24px",
        }}
      >
        View, search and manage Cambridge students and Young Learners.
      </p>

      <div
        style={{
          background: "#ffffff",
          border: "1px solid var(--ss-border)",
          borderRadius: "12px",
          boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
          padding: "20px",
          marginBottom: "24px",
          display: "flex",
          justifyContent: "space-between",
          gap: "16px",
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        <div>
          <h2
            style={{
              color: "#1f3c88",
              margin: "0 0 6px",
              fontSize: "18px",
            }}
          >
            Need to add a new student or Young Learner?
          </h2>
          <p
            style={{
              color: "#666",
              margin: 0,
            }}
          >
            Use Add Users to create Cambridge students and Young Learners.
          </p>
        </div>

        <Link
          href="/admin/add-users"
          style={{
            background: "var(--ss-blue)",
            color: "#ffffff",
            borderRadius: "8px",
            padding: "11px 18px",
            textDecoration: "none",
            fontWeight: 800,
          }}
        >
          Add Users
        </Link>
      </div>

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "10px",
          marginBottom: "22px",
        }}
      >
        <button
          type="button"
          onClick={() => {
            setActiveStudentType("cambridge");
            resetYoungLearnerEdit();
          }}
          style={getModeButtonStyle(activeStudentType === "cambridge")}
        >
          Cambridge Students
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveStudentType("youngLearners");
            setEditingStudentId("");
            resetForm();
          }}
          style={getModeButtonStyle(activeStudentType === "youngLearners")}
        >
          Young Learners
        </button>
      </div>

      {message && (
        <div
          style={{
            background: "#ffffff",
            borderRadius: "8px",
            padding: "14px",
            marginBottom: "20px",
            color: "#333",
            boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
          }}
        >
          {message}
        </div>
      )}

      {activeStudentType === "cambridge" ? (
        <>
          {editingStudentId && (
          <form
            onSubmit={handleSubmit}
            style={{
              background: "#ffffff",
              padding: "30px",
              borderRadius: "12px",
              boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
              marginBottom: "30px",
            }}
          >
            <h2
              style={{
                color: "#1f3c88",
                marginTop: 0,
                marginBottom: "10px",
              }}
            >
              {editingStudentId
                ? "Edit Cambridge Student"
                : "Edit Cambridge Student"}
            </h2>

            <p
              style={{
                color: "#666",
                marginTop: 0,
                marginBottom: "25px",
              }}
            >
              Update this Cambridge student's name or class assignment.
            </p>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                gap: "20px",
              }}
            >
              <div>
                <label style={labelStyle}>First Name</label>
                <input
                  required
                  style={inputStyle}
                  value={form.first_name}
                  onChange={(event) =>
                    updateForm("first_name", event.target.value)
                  }
                />
              </div>

              <div>
                <label style={labelStyle}>Last Name</label>
                <input
                  required
                  style={inputStyle}
                  value={form.last_name}
                  onChange={(event) =>
                    updateForm("last_name", event.target.value)
                  }
                />
              </div>

              <div>
                <label style={labelStyle}>Email</label>
                <div
                  style={{
                    ...inputStyle,
                    background: "#f5f7fa",
                  }}
                >
                  {form.email || "-"}
                </div>
              </div>

              <div>
                <label style={labelStyle}>Cambridge Class</label>
                <select
                  required
                  style={inputStyle}
                  value={form.class_id}
                  onChange={(event) =>
                    updateForm("class_id", event.target.value)
                  }
                >
                  <option value="">Select a class</option>
                  {classes.map((classroom) => (
                    <option key={classroom.id} value={classroom.id}>
                      {formatClassOption(classroom)}
                    </option>
                  ))}
                </select>
                {classesMessage && (
                  <p
                    style={{
                      color: "#333",
                      marginBottom: 0,
                    }}
                  >
                    {classesMessage}
                  </p>
                )}
              </div>

            </div>

            <button
              type="submit"
              disabled={saving}
              style={{
                background: "#1f3c88",
                color: "#ffffff",
                border: "none",
                borderRadius: "8px",
                padding: "12px 22px",
                marginTop: "25px",
                cursor: "pointer",
                fontWeight: 700,
              }}
            >
              {saving ? "Saving..." : "Save Changes"}
            </button>

            <button
              type="button"
              onClick={cancelEdit}
              style={{
                background: "#ffffff",
                color: "#1f3c88",
                border: "1px solid #1f3c88",
                borderRadius: "8px",
                padding: "12px 22px",
                marginTop: "25px",
                marginLeft: "12px",
                cursor: "pointer",
                fontWeight: 700,
              }}
            >
              Cancel Edit
            </button>
          </form>
          )}

          <div
            style={{
              background: "#ffffff",
              padding: "30px",
              borderRadius: "12px",
              boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
            }}
          >
            <h2
              style={{
                color: "#1f3c88",
                marginTop: 0,
                marginBottom: "20px",
              }}
            >
              Existing Cambridge Students
            </h2>

            {loading ? (
              <p>Loading students...</p>
            ) : students.length === 0 ? (
              <p
                style={{
                  color: "#333",
                }}
              >
                No Cambridge students found.
              </p>
            ) : (
              renderGroupedStudentSections(
                students,
                cambridgeLevelOrder,
                renderCambridgeStudentCard
              )
            )}
          </div>
        </>
      ) : (
        <>
          {(youngLearnerEditError || youngLearnerEditSuccess) && (
            <div
              aria-live="polite"
              style={{
                background: "#ffffff",
                borderRadius: "8px",
                padding: "14px",
                marginBottom: "20px",
                color: youngLearnerEditError ? "#b42318" : "#1f7a3f",
                border: `1px solid ${
                  youngLearnerEditError ? "#f4c7c3" : "#bfe5cc"
                }`,
                boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
              }}
            >
              {youngLearnerEditError || youngLearnerEditSuccess}
            </div>
          )}

          {editingYoungLearnerId && (
            <form
              onSubmit={handleYoungLearnerSubmit}
              style={{
                background: "#ffffff",
                padding: "30px",
                borderRadius: "12px",
                boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
                marginBottom: "30px",
              }}
            >
              <h2
                style={{
                  color: "#1f3c88",
                  marginTop: 0,
                  marginBottom: "10px",
                }}
              >
                Edit Young Learner
              </h2>

              <p
                style={{
                  color: "#666",
                  marginTop: 0,
                  marginBottom: "25px",
                }}
              >
                Update this Young Learner's name or class assignment.
              </p>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                  gap: "20px",
                }}
              >
                <div>
                  <label htmlFor="young-learner-first-name" style={labelStyle}>
                    First Name
                  </label>
                  <input
                    id="young-learner-first-name"
                    required
                    maxLength={80}
                    style={inputStyle}
                    value={youngLearnerForm.first_name}
                    onChange={(event) =>
                      updateYoungLearnerForm("first_name", event.target.value)
                    }
                  />
                </div>

                <div>
                  <label htmlFor="young-learner-last-name" style={labelStyle}>
                    Last Name
                  </label>
                  <input
                    id="young-learner-last-name"
                    required
                    maxLength={80}
                    style={inputStyle}
                    value={youngLearnerForm.last_name}
                    onChange={(event) =>
                      updateYoungLearnerForm("last_name", event.target.value)
                    }
                  />
                </div>

                <div>
                  <label htmlFor="young-learner-class" style={labelStyle}>
                    Young Learner Class
                  </label>
                  <select
                    id="young-learner-class"
                    required
                    style={inputStyle}
                    value={youngLearnerForm.class_id}
                    onChange={(event) =>
                      updateYoungLearnerForm("class_id", event.target.value)
                    }
                  >
                    <option value="">Select a Young Learner class</option>
                    {youngLearnerClasses.map((classroom) => (
                      <option key={classroom.id} value={classroom.id}>
                        {formatClassOption(classroom)}
                      </option>
                    ))}
                  </select>
                  {youngLearnerClassesMessage && (
                    <p
                      style={{
                        color: "#333",
                        marginBottom: 0,
                      }}
                    >
                      {youngLearnerClassesMessage}
                    </p>
                  )}
                </div>
              </div>

              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: "12px",
                  marginTop: "25px",
                }}
              >
                <button
                  type="submit"
                  disabled={savingYoungLearnerEdit}
                  style={{
                    background: "#1f3c88",
                    color: "#ffffff",
                    border: "none",
                    borderRadius: "8px",
                    padding: "12px 22px",
                    cursor: savingYoungLearnerEdit ? "not-allowed" : "pointer",
                    fontWeight: 700,
                    opacity: savingYoungLearnerEdit ? 0.7 : 1,
                  }}
                >
                  {savingYoungLearnerEdit ? "Saving..." : "Save Changes"}
                </button>

                <button
                  type="button"
                  onClick={cancelYoungLearnerEdit}
                  disabled={savingYoungLearnerEdit}
                  style={{
                    background: "#ffffff",
                    color: "#1f3c88",
                    border: "1px solid #1f3c88",
                    borderRadius: "8px",
                    padding: "12px 22px",
                    cursor: savingYoungLearnerEdit ? "not-allowed" : "pointer",
                    fontWeight: 700,
                    opacity: savingYoungLearnerEdit ? 0.7 : 1,
                  }}
                >
                  Cancel
                </button>
              </div>
            </form>
          )}

          <div
            style={{
              background: "#ffffff",
              padding: "30px",
              borderRadius: "12px",
              boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
            }}
          >
            <h2
              style={{
                color: "#1f3c88",
                marginTop: 0,
                marginBottom: "20px",
              }}
            >
              Existing Young Learners
            </h2>

            {loading ? (
              <p>Loading Young Learners...</p>
            ) : youngLearners.length === 0 ? (
              <p
                style={{
                  color: "#333",
                }}
              >
                No Young Learners added yet.
              </p>
            ) : (
              renderGroupedStudentSections(
                youngLearners,
                youngLearnerLevelOrder,
                renderYoungLearnerCard
              )
            )}
          </div>
        </>
      )}
    </AdminLayout>
  );
}
