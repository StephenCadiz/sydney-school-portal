"use client";

import type { FormEvent } from "react";
import { useEffect, useState } from "react";

import AdminLayout from "../../components/layout/AdminLayout";
import {
  getCambridgeClassesForStudentInvite,
  getYoungLearnerClassesForStudentCreate,
} from "../../../lib/adminStudents";
import { supabase } from "../../../lib/supabase";

type ActiveTab = "teacher" | "cambridge" | "youngLearner" | "adminStaff";
type CreationMode = "manual" | "invite";

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

const labelStyle = {
  fontWeight: 600,
  marginBottom: "6px",
  display: "block" as const,
  color: "#333",
};

const cardStyle = {
  background: "#ffffff",
  borderRadius: "12px",
  border: "1px solid var(--ss-border)",
  boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
  padding: "28px",
};

function getTabStyle(isActive: boolean) {
  return {
    background: isActive ? "var(--ss-blue)" : "#ffffff",
    color: isActive ? "#ffffff" : "var(--ss-blue-dark)",
    border: isActive ? "1px solid var(--ss-blue)" : "1px solid var(--ss-border)",
    borderRadius: "10px",
    padding: "12px 16px",
    cursor: "pointer",
    fontWeight: 700,
    textAlign: "left" as const,
  };
}

function getModeButtonStyle(isActive: boolean) {
  return {
    background: isActive ? "var(--ss-blue)" : "#ffffff",
    color: isActive ? "#ffffff" : "var(--ss-blue-dark)",
    border: "1px solid var(--ss-blue)",
    borderRadius: "8px",
    padding: "10px 14px",
    cursor: "pointer",
    fontWeight: 700,
  };
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

function getInitialAuthForm() {
  return {
    first_name: "",
    last_name: "",
    email: "",
    password: "",
  };
}

export default function AddUsersPage() {
  const [activeTab, setActiveTab] = useState<ActiveTab>("teacher");
  const [teacherMode, setTeacherMode] = useState<CreationMode>("manual");
  const [cambridgeMode, setCambridgeMode] = useState<CreationMode>("manual");
  const [teacherForm, setTeacherForm] = useState(getInitialAuthForm);
  const [cambridgeForm, setCambridgeForm] = useState({
    ...getInitialAuthForm(),
    class_id: "",
  });
  const [youngLearnerForm, setYoungLearnerForm] = useState({
    first_name: "",
    last_name: "",
    class_id: "",
  });
  const [adminForm, setAdminForm] = useState({
    ...getInitialAuthForm(),
    confirm_password: "",
  });
  const [cambridgeClasses, setCambridgeClasses] = useState<any[]>([]);
  const [youngLearnerClasses, setYoungLearnerClasses] = useState<any[]>([]);
  const [classMessage, setClassMessage] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [loadingClasses, setLoadingClasses] = useState(true);

  useEffect(() => {
    async function loadClasses() {
      setLoadingClasses(true);
      setClassMessage("");

      try {
        const [cambridgeData, youngLearnerData] = await Promise.all([
          getCambridgeClassesForStudentInvite(),
          getYoungLearnerClassesForStudentCreate(),
        ]);

        setCambridgeClasses(cambridgeData);
        setYoungLearnerClasses(youngLearnerData);

        if (cambridgeData.length === 0 && youngLearnerData.length === 0) {
          setClassMessage("No classes found.");
        }
      } catch (error) {
        console.error("Unable to load class options:", error);
        setClassMessage("Unable to load class options.");
      } finally {
        setLoadingClasses(false);
      }
    }

    loadClasses();
  }, []);

  async function postWithSession(path: string, payload: any) {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      throw new Error("You must be logged in as an admin.");
    }

    const response = await fetch(path, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify(payload),
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.details || result.error || "Unable to save user.");
    }

    return result;
  }

  function validatePassword(password: string) {
    if (!password) {
      return "Password is required.";
    }

    if (password.length < 6) {
      return "Password must be at least 6 characters.";
    }

    return "";
  }

  async function handleTeacherSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage("");

    try {
      if (teacherMode === "manual") {
        const passwordError = validatePassword(teacherForm.password);

        if (passwordError) {
          setMessage(passwordError);
          return;
        }
      }

      const result = await postWithSession(
        teacherMode === "manual"
          ? "/api/admin/teachers/create-manual"
          : "/api/admin/teachers/invite",
        teacherMode === "manual"
          ? teacherForm
          : {
              first_name: teacherForm.first_name,
              last_name: teacherForm.last_name,
              email: teacherForm.email,
            }
      );

      setTeacherForm(getInitialAuthForm());
      setMessage(result.message || "Teacher saved successfully.");
    } catch (error: any) {
      console.error("Unable to save teacher:", error);
      setMessage(error.message || "Unable to save teacher.");
    } finally {
      setSaving(false);
    }
  }

  async function handleCambridgeStudentSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage("");

    try {
      if (!cambridgeForm.class_id) {
        setMessage("Class is required.");
        return;
      }

      if (cambridgeMode === "manual") {
        const passwordError = validatePassword(cambridgeForm.password);

        if (passwordError) {
          setMessage(passwordError);
          return;
        }
      }

      const result = await postWithSession(
        cambridgeMode === "manual"
          ? "/api/admin/students/create-manual"
          : "/api/admin/students/invite",
        cambridgeMode === "manual"
          ? cambridgeForm
          : {
              first_name: cambridgeForm.first_name,
              last_name: cambridgeForm.last_name,
              email: cambridgeForm.email,
              class_id: cambridgeForm.class_id,
            }
      );

      setCambridgeForm({
        ...getInitialAuthForm(),
        class_id: "",
      });
      setMessage(result.message || "Cambridge student saved successfully.");
    } catch (error: any) {
      console.error("Unable to save Cambridge student:", error);
      setMessage(error.message || "Unable to save Cambridge student.");
    } finally {
      setSaving(false);
    }
  }

  async function handleYoungLearnerSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage("");

    try {
      if (!youngLearnerForm.class_id) {
        setMessage("Class is required.");
        return;
      }

      const result = await postWithSession(
        "/api/admin/young-learners/create",
        youngLearnerForm
      );

      setYoungLearnerForm({
        first_name: "",
        last_name: "",
        class_id: "",
      });
      setMessage(result.message || "Young Learner added successfully.");
    } catch (error: any) {
      console.error("Unable to save Young Learner:", error);
      setMessage(error.message || "Unable to save Young Learner.");
    } finally {
      setSaving(false);
    }
  }

  async function handleAdminStaffSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage("");

    try {
      const passwordError = validatePassword(adminForm.password);

      if (passwordError) {
        setMessage(passwordError);
        return;
      }

      if (adminForm.password !== adminForm.confirm_password) {
        setMessage("Passwords do not match.");
        return;
      }

      const result = await postWithSession(
        "/api/admin/admin-staff/create-manual",
        {
          first_name: adminForm.first_name,
          last_name: adminForm.last_name,
          email: adminForm.email,
          password: adminForm.password,
        }
      );

      setAdminForm({
        ...getInitialAuthForm(),
        confirm_password: "",
      });
      setMessage(result.message || "Admin staff account created successfully.");
    } catch (error: any) {
      console.error("Unable to save admin staff:", error);
      setMessage(error.message || "Unable to save admin staff.");
    } finally {
      setSaving(false);
    }
  }

  const tabs = [
    { id: "teacher", label: "Add Teacher" },
    { id: "cambridge", label: "Add Cambridge Student" },
    { id: "youngLearner", label: "Add Young Learner" },
    { id: "adminStaff", label: "Add Admin Staff" },
  ] as const;

  return (
    <AdminLayout>
      <h1
        style={{
          color: "var(--ss-blue-dark)",
          marginBottom: "10px",
        }}
      >
        Add Users
      </h1>

      <p
        style={{
          color: "#666",
          marginBottom: "28px",
        }}
      >
        Create teachers, Cambridge students, Young Learners and admin staff.
      </p>

      {message && (
        <div
          style={{
            background: "#ffffff",
            borderRadius: "10px",
            border: "1px solid var(--ss-border)",
            padding: "14px",
            marginBottom: "20px",
            color: "#333",
            boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
            whiteSpace: "pre-wrap",
          }}
        >
          {message}
        </div>
      )}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
          gap: "12px",
          marginBottom: "22px",
        }}
      >
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => {
              setActiveTab(tab.id);
              setMessage("");
            }}
            style={getTabStyle(activeTab === tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "teacher" && (
        <form onSubmit={handleTeacherSubmit} style={cardStyle}>
          <h2 style={{ color: "var(--ss-blue-dark)", marginTop: 0 }}>
            Add Teacher
          </h2>

          <CreationModeControl
            mode={teacherMode}
            onChange={setTeacherMode}
            manualText="Create the login directly without sending an invitation email."
            inviteText="Send an email invite so the teacher can choose their password."
          />

          <AuthFields
            form={teacherForm}
            setForm={setTeacherForm}
            showPassword={teacherMode === "manual"}
          />

          <SubmitButton saving={saving}>
            {teacherMode === "manual" ? "Create Teacher Account" : "Invite Teacher"}
          </SubmitButton>
        </form>
      )}

      {activeTab === "cambridge" && (
        <form onSubmit={handleCambridgeStudentSubmit} style={cardStyle}>
          <h2 style={{ color: "var(--ss-blue-dark)", marginTop: 0 }}>
            Add Cambridge Student
          </h2>

          <CreationModeControl
            mode={cambridgeMode}
            onChange={setCambridgeMode}
            manualText="Create the student login directly without sending an invitation email."
            inviteText="Send an email invite so the student can choose their password."
          />

          <AuthFields
            form={cambridgeForm}
            setForm={setCambridgeForm}
            showPassword={cambridgeMode === "manual"}
          />

          <div style={{ marginTop: "20px" }}>
            <label style={labelStyle}>Class</label>
            <select
              required
              style={inputStyle}
              value={cambridgeForm.class_id}
              onChange={(event) =>
                setCambridgeForm((current) => ({
                  ...current,
                  class_id: event.target.value,
                }))
              }
            >
              <option value="">Select a Cambridge class</option>
              {cambridgeClasses.map((classroom) => (
                <option key={classroom.id} value={classroom.id}>
                  {formatClassOption(classroom)}
                </option>
              ))}
            </select>
            {loadingClasses ? (
              <p style={{ color: "#666" }}>Loading classes...</p>
            ) : classMessage ? (
              <p style={{ color: "#666" }}>{classMessage}</p>
            ) : null}
          </div>

          <SubmitButton saving={saving}>
            {cambridgeMode === "manual"
              ? "Create Student Account"
              : "Invite Student"}
          </SubmitButton>
        </form>
      )}

      {activeTab === "youngLearner" && (
        <form onSubmit={handleYoungLearnerSubmit} style={cardStyle}>
          <h2 style={{ color: "var(--ss-blue-dark)", marginTop: 0 }}>
            Add Young Learner
          </h2>

          <p style={{ color: "#666", marginTop: 0 }}>
            Young Learners do not receive Student Portal access. No email or
            password is needed.
          </p>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: "20px",
            }}
          >
            <div>
              <label style={labelStyle}>First Name</label>
              <input
                required
                style={inputStyle}
                value={youngLearnerForm.first_name}
                onChange={(event) =>
                  setYoungLearnerForm((current) => ({
                    ...current,
                    first_name: event.target.value,
                  }))
                }
              />
            </div>

            <div>
              <label style={labelStyle}>Last Name</label>
              <input
                required
                style={inputStyle}
                value={youngLearnerForm.last_name}
                onChange={(event) =>
                  setYoungLearnerForm((current) => ({
                    ...current,
                    last_name: event.target.value,
                  }))
                }
              />
            </div>

            <div>
              <label style={labelStyle}>Class</label>
              <select
                required
                style={inputStyle}
                value={youngLearnerForm.class_id}
                onChange={(event) =>
                  setYoungLearnerForm((current) => ({
                    ...current,
                    class_id: event.target.value,
                  }))
                }
              >
                <option value="">Select a Young Learner class</option>
                {youngLearnerClasses.map((classroom) => (
                  <option key={classroom.id} value={classroom.id}>
                    {formatClassOption(classroom)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {loadingClasses ? (
            <p style={{ color: "#666" }}>Loading classes...</p>
          ) : classMessage ? (
            <p style={{ color: "#666" }}>{classMessage}</p>
          ) : null}

          <SubmitButton saving={saving}>Add Young Learner</SubmitButton>
        </form>
      )}

      {activeTab === "adminStaff" && (
        <form onSubmit={handleAdminStaffSubmit} style={cardStyle}>
          <h2 style={{ color: "var(--ss-blue-dark)", marginTop: 0 }}>
            Add Admin Staff
          </h2>

          <div
            style={{
              background: "#fff7ed",
              border: "1px solid #fed7aa",
              borderRadius: "10px",
              padding: "14px",
              color: "#7c2d12",
              marginBottom: "22px",
            }}
          >
            Admin staff accounts can access academy management tools. Only create
            admin staff accounts for trusted users.
          </div>

          <AuthFields form={adminForm} setForm={setAdminForm} showPassword />

          <div style={{ marginTop: "20px" }}>
            <label style={labelStyle}>Confirm Password</label>
            <input
              required
              type="password"
              minLength={6}
              style={inputStyle}
              value={adminForm.confirm_password}
              onChange={(event) =>
                setAdminForm((current) => ({
                  ...current,
                  confirm_password: event.target.value,
                }))
              }
            />
          </div>

          <SubmitButton saving={saving}>Create Admin Staff Account</SubmitButton>
        </form>
      )}
    </AdminLayout>
  );
}

function CreationModeControl({
  mode,
  onChange,
  manualText,
  inviteText,
}: {
  mode: CreationMode;
  onChange: (mode: CreationMode) => void;
  manualText: string;
  inviteText: string;
}) {
  return (
    <div
      style={{
        border: "1px solid var(--ss-border)",
        borderRadius: "10px",
        padding: "14px",
        marginBottom: "22px",
        background: "#f8f9fc",
      }}
    >
      <label style={labelStyle}>Creation method</label>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "10px",
        }}
      >
        <button
          type="button"
          onClick={() => onChange("manual")}
          style={getModeButtonStyle(mode === "manual")}
        >
          Create manually with password
        </button>

        <button
          type="button"
          onClick={() => onChange("invite")}
          style={getModeButtonStyle(mode === "invite")}
        >
          Send invitation email
        </button>
      </div>
      <p style={{ color: "#666", marginBottom: 0 }}>
        {mode === "manual" ? manualText : inviteText}
      </p>
    </div>
  );
}

function AuthFields({
  form,
  setForm,
  showPassword,
}: {
  form: {
    first_name: string;
    last_name: string;
    email: string;
    password: string;
  };
  setForm: (updater: any) => void;
  showPassword: boolean;
}) {
  function updateField(field: string, value: string) {
    setForm((current: any) => ({
      ...current,
      [field]: value,
    }));
  }

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
        gap: "20px",
      }}
    >
      <div>
        <label style={labelStyle}>First Name</label>
        <input
          required
          style={inputStyle}
          value={form.first_name}
          onChange={(event) => updateField("first_name", event.target.value)}
        />
      </div>

      <div>
        <label style={labelStyle}>Last Name</label>
        <input
          required
          style={inputStyle}
          value={form.last_name}
          onChange={(event) => updateField("last_name", event.target.value)}
        />
      </div>

      <div>
        <label style={labelStyle}>Email</label>
        <input
          required
          type="email"
          style={inputStyle}
          value={form.email}
          onChange={(event) => updateField("email", event.target.value)}
        />
      </div>

      {showPassword && (
        <div>
          <label style={labelStyle}>Password</label>
          <input
            required
            type="password"
            minLength={6}
            style={inputStyle}
            value={form.password}
            onChange={(event) => updateField("password", event.target.value)}
          />
        </div>
      )}
    </div>
  );
}

function SubmitButton({
  children,
  saving,
}: {
  children: React.ReactNode;
  saving: boolean;
}) {
  return (
    <button
      type="submit"
      disabled={saving}
      style={{
        background: "var(--ss-blue)",
        color: "#ffffff",
        border: "none",
        borderRadius: "8px",
        padding: "12px 22px",
        marginTop: "25px",
        cursor: saving ? "not-allowed" : "pointer",
        fontWeight: 700,
        opacity: saving ? 0.7 : 1,
      }}
    >
      {saving ? "Saving..." : children}
    </button>
  );
}
