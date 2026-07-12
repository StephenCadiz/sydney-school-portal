"use client";

import { useEffect, useMemo, useState } from "react";
import {
  createFollowUpDocument,
  deleteFollowUpDocument,
  getFollowUpsForClass,
} from "../../../lib/followUps";

const categories = ["Academic", "Behaviour", "Homework", "Attendance", "Other"];
const statuses = ["Open", "In Progress", "Resolved"];

const cardStyle = {
  background: "#ffffff",
  border: "1px solid var(--ss-border)",
  borderRadius: "14px",
  padding: "22px",
  boxShadow: "0 6px 18px rgba(31,60,136,0.06)",
} as const;

const inputStyle = {
  width: "100%",
  padding: "11px 12px",
  border: "1px solid #d9e2ef",
  borderRadius: "9px",
  background: "#ffffff",
  color: "#333333",
  fontSize: "14px",
  boxSizing: "border-box" as const,
  outlineColor: "var(--ss-blue)",
};

const labelStyle = {
  color: "#333333",
  fontWeight: 700,
  fontSize: "13px",
  marginBottom: "6px",
  display: "block",
} as const;

const buttonStyle = {
  background: "var(--ss-blue)",
  color: "#ffffff",
  border: "none",
  borderRadius: "9px",
  padding: "11px 16px",
  fontWeight: 700,
  cursor: "pointer",
} as const;

const secondaryButtonStyle = {
  background: "#ffffff",
  color: "var(--ss-blue-dark)",
  border: "1px solid var(--ss-border)",
  borderRadius: "9px",
  padding: "10px 14px",
  fontWeight: 700,
  cursor: "pointer",
} as const;

type Props = {
  classId: string;
  students: any[];
  teacherId: string;
};

function formatDate(date: string | null | undefined) {
  if (!date) return "Date not available";

  return new Date(`${date}`.includes("T") ? date : `${date}T00:00:00`).toLocaleDateString(
    "en-GB",
    {
      day: "numeric",
      month: "short",
      year: "numeric",
    }
  );
}

function getStatusBadgeStyle(itemStatus: string) {
  if (itemStatus === "Resolved") {
    return {
      background: "#e8f5ee",
      color: "#236b3b",
      border: "1px solid #bfe2cc",
    };
  }

  if (itemStatus === "In Progress") {
    return {
      background: "#edf3ff",
      color: "var(--ss-blue-dark)",
      border: "1px solid #cdd9f5",
    };
  }

  return {
    background: "#fff7e6",
    color: "#8a5a00",
    border: "1px solid #f0d28a",
  };
}

export default function FollowUpsTab({ classId, students, teacherId }: Props) {
  const [followUps, setFollowUps] = useState<any[]>([]);
  const [selectedStudentKey, setSelectedStudentKey] = useState("");
  const [category, setCategory] = useState("Academic");
  const [details, setDetails] = useState("");
  const [actionPlan, setActionPlan] = useState("");
  const [status, setStatus] = useState("Open");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  function getStudentKey(student: any) {
    return `${student.student_type || "cambridge"}:${student.id}`;
  }

  function getSelectedStudent() {
    return students.find((student) => getStudentKey(student) === selectedStudentKey);
  }

  function getStudentName(student: any) {
    return `${student?.first_name || ""} ${student?.last_name || ""}`.trim() ||
      "Unnamed student";
  }

  function getStudentNameFromRecord(item: any) {
    const studentType =
      item.student_type || (item.young_learner_id ? "young_learner" : "cambridge");
    const studentId =
      studentType === "young_learner" ? item.young_learner_id : item.student_id;
    const student = students.find(
      (studentItem) =>
        studentItem.id === studentId &&
        (studentItem.student_type || "cambridge") === studentType
    );

    return student ? getStudentName(student) : item.student_name || "Student not found";
  }

  const selectedExistingFollowUp = useMemo(() => {
    const selectedStudent = getSelectedStudent();

    if (!selectedStudent) return null;

    const studentType = selectedStudent.student_type || "cambridge";

    return (
      followUps.find((item) => {
        const itemType =
          item.student_type || (item.young_learner_id ? "young_learner" : "cambridge");
        const itemStudentId =
          itemType === "young_learner" ? item.young_learner_id : item.student_id;

        return (
          itemType === studentType &&
          itemStudentId === selectedStudent.id &&
          item.category === category
        );
      }) || null
    );
  }, [selectedStudentKey, category, followUps]);

  async function loadFollowUps() {
    if (!classId) return;

    setLoading(true);
    setError("");

    try {
      const data = await getFollowUpsForClass(classId);
      setFollowUps(data);
    } catch (loadError: any) {
      console.error(loadError);
      setError(loadError?.message || "Unable to load follow-up documents.");
    } finally {
      setLoading(false);
    }
  }

  function resetEntryFields() {
    setDetails("");
    setActionPlan("");
  }

  async function handleSubmit() {
    setMessage("");
    setError("");

    const selectedStudent = getSelectedStudent();

    if (!selectedStudent) {
      setError("Please select a student.");
      return;
    }

    if (!details.trim()) {
      setError("Please enter follow-up details.");
      return;
    }

    if (!teacherId) {
      setError("Unable to identify the logged-in teacher.");
      return;
    }

    setSaving(true);

    try {
      const selectedStudentType = selectedStudent.student_type || "cambridge";
      const isYoungLearner = selectedStudentType === "young_learner";

      await createFollowUpDocument({
        student_type: selectedStudentType,
        student_id: isYoungLearner ? null : selectedStudent.id,
        young_learner_id: isYoungLearner ? selectedStudent.id : null,
        class_id: classId,
        teacher_id: teacherId,
        category,
        details: details.trim(),
        action_plan: actionPlan.trim(),
        status,
      });

      setMessage(
        selectedExistingFollowUp
          ? "Dated entry added to the existing follow-up."
          : "Follow-up file created."
      );
      resetEntryFields();
      await loadFollowUps();
    } catch (saveError: any) {
      console.error(saveError);
      setError(saveError?.message || "Unable to save follow-up document.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    const confirmed = confirm(
      "Are you sure you want to delete this follow-up document?"
    );

    if (!confirmed) return;

    setMessage("");
    setError("");

    try {
      await deleteFollowUpDocument(id);
      setMessage("Follow-up document deleted.");
      await loadFollowUps();
    } catch (deleteError: any) {
      console.error(deleteError);
      setError(deleteError?.message || "Unable to delete follow-up document.");
    }
  }

  useEffect(() => {
    loadFollowUps();
  }, [classId]);

  return (
    <div style={{ display: "grid", gap: "22px" }}>
      <section>
        <h2 style={{ color: "var(--ss-blue-dark)", margin: "0 0 6px", fontSize: "24px" }}>
          Follow Up
        </h2>
        <p style={{ color: "#667085", maxWidth: "760px", margin: 0 }}>
          Create and manage follow-up files for students who need extra academic
          or behavioural support.
        </p>
      </section>

      {(message || error) && (
        <div
          style={{
            ...cardStyle,
            padding: "14px 18px",
            borderColor: error ? "#f1b7b7" : "#c8e6d2",
            color: error ? "#9f1d1d" : "#236b3b",
            fontWeight: 700,
            whiteSpace: "pre-wrap",
          }}
        >
          {error || message}
        </div>
      )}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(330px, 1fr))",
          gap: "22px",
          alignItems: "start",
        }}
      >
        <section style={cardStyle}>
          <h3 style={{ color: "var(--ss-blue-dark)", margin: "0 0 6px", fontSize: "20px" }}>
            Add Follow-Up Entry
          </h3>
          <p style={{ color: "#667085", margin: "0 0 18px", fontSize: "14px" }}>
            Select a student and reason, then record today&apos;s details and
            action plan.
          </p>

          <div style={{ display: "grid", gap: "14px" }}>
            <label>
              <span style={labelStyle}>Student</span>
              <select
                value={selectedStudentKey}
                onChange={(event) => setSelectedStudentKey(event.target.value)}
                style={inputStyle}
              >
                <option value="">Select student</option>
                <optgroup label="Cambridge Students">
                  {students
                    .filter(
                      (student) =>
                        (student.student_type || "cambridge") === "cambridge"
                    )
                    .map((student) => (
                      <option key={getStudentKey(student)} value={getStudentKey(student)}>
                        {getStudentName(student)}
                      </option>
                    ))}
                </optgroup>
                <optgroup label="Young Learners">
                  {students
                    .filter((student) => student.student_type === "young_learner")
                    .map((student) => (
                      <option key={getStudentKey(student)} value={getStudentKey(student)}>
                        {getStudentName(student)}
                      </option>
                    ))}
                </optgroup>
              </select>
            </label>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "12px",
              }}
            >
              <label>
                <span style={labelStyle}>Reason</span>
                <select
                  value={category}
                  onChange={(event) => setCategory(event.target.value)}
                  style={inputStyle}
                >
                  {categories.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                <span style={labelStyle}>Status</span>
                <select
                  value={status}
                  onChange={(event) => setStatus(event.target.value)}
                  style={inputStyle}
                >
                  {statuses.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {selectedStudentKey && (
              <div
                style={{
                  background: selectedExistingFollowUp ? "#fff7e6" : "#edf7f1",
                  border: selectedExistingFollowUp
                    ? "1px solid #f0d28a"
                    : "1px solid #cfe9d8",
                  borderRadius: "10px",
                  padding: "12px",
                  color: selectedExistingFollowUp ? "#8a5a00" : "#236b3b",
                  fontWeight: 700,
                }}
              >
                {selectedExistingFollowUp
                  ? "Existing follow-up found. Your new note will be added as a dated entry."
                  : "A new follow-up file will be created for this student and reason."}
              </div>
            )}

            <label>
              <span style={labelStyle}>Details</span>
              <textarea
                rows={4}
                value={details}
                onChange={(event) => setDetails(event.target.value)}
                placeholder="Describe the concern or reason for follow-up"
                style={{ ...inputStyle, resize: "vertical", minHeight: "96px" }}
              />
            </label>

            <label>
              <span style={labelStyle}>Action plan</span>
              <textarea
                rows={3}
                value={actionPlan}
                onChange={(event) => setActionPlan(event.target.value)}
                placeholder="Next steps, support actions or teacher plan"
                style={{ ...inputStyle, resize: "vertical", minHeight: "82px" }}
              />
            </label>

            <button onClick={handleSubmit} disabled={saving} style={buttonStyle}>
              {saving
                ? "Saving..."
                : selectedExistingFollowUp
                ? "Add Dated Entry"
                : "Create Follow-Up"}
            </button>
          </div>
        </section>

        <section style={cardStyle}>
          <h3 style={{ color: "var(--ss-blue-dark)", margin: "0 0 6px", fontSize: "20px" }}>
            {selectedExistingFollowUp ? "Selected Follow-Up Timeline" : "Existing Follow Ups"}
          </h3>
          <p style={{ color: "#667085", margin: "0 0 16px", fontSize: "14px" }}>
            {selectedExistingFollowUp
              ? "Review previous dated entries for this student and reason."
              : "Choose a student and reason to see the matching timeline."}
          </p>

          {selectedExistingFollowUp ? (
            <Timeline followUp={selectedExistingFollowUp} />
          ) : loading ? (
            <p style={{ color: "#667085", margin: 0 }}>Loading follow-up documents...</p>
          ) : followUps.length === 0 ? (
            <div
              style={{
                background: "#f8fafd",
                border: "1px dashed #cfd8e6",
                borderRadius: "12px",
                padding: "22px",
                color: "#667085",
              }}
            >
              <strong style={{ color: "var(--ss-blue-dark)" }}>
                No follow-up documents yet.
              </strong>
              <p style={{ margin: "8px 0 0" }}>
                Create a follow-up when a student needs extra academic or
                behavioural support.
              </p>
            </div>
          ) : (
            <div style={{ display: "grid", gap: "12px", maxHeight: "720px", overflowY: "auto" }}>
              {followUps.map((item) => {
                const statusBadge = getStatusBadgeStyle(item.status);

                return (
                  <article
                    key={item.id}
                    style={{
                      border: "1px solid #edf1f7",
                      borderRadius: "12px",
                      padding: "15px",
                      background: "#ffffff",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", gap: "12px" }}>
                      <div>
                        <strong style={{ color: "var(--ss-blue-dark)" }}>
                          {getStudentNameFromRecord(item)}
                        </strong>
                        <p style={{ color: "#667085", margin: "5px 0 0" }}>
                          {item.category || "Other"} Follow-Up
                        </p>
                      </div>
                      <span
                        style={{
                          ...statusBadge,
                          borderRadius: "999px",
                          padding: "5px 10px",
                          fontWeight: 800,
                          fontSize: "12px",
                          height: "fit-content",
                        }}
                      >
                        {item.status || "Open"}
                      </span>
                    </div>
                    <Timeline followUp={item} compact />
                    <button
                      onClick={() => handleDelete(item.id)}
                      style={{
                        ...secondaryButtonStyle,
                        color: "#9f1d1d",
                        borderColor: "#f1b7b7",
                        marginTop: "12px",
                      }}
                    >
                      Delete
                    </button>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function Timeline({ followUp, compact = false }: { followUp: any; compact?: boolean }) {
  const entries = followUp.entries || [];

  if (entries.length === 0) {
    return (
      <p style={{ color: "#667085", margin: compact ? "10px 0 0" : 0 }}>
        No dated entries yet.
      </p>
    );
  }

  return (
    <div style={{ display: "grid", gap: compact ? "8px" : "12px", marginTop: compact ? "12px" : 0 }}>
      {entries.map((entry: any) => (
        <div
          key={entry.id}
          style={{
            background: "#f8fafd",
            border: "1px solid #edf1f7",
            borderRadius: "10px",
            padding: compact ? "10px" : "13px",
          }}
        >
          <strong style={{ color: "var(--ss-blue-dark)" }}>
            {formatDate(entry.entry_date || entry.created_at)}
          </strong>
          <span style={{ color: "#667085", marginLeft: "8px", fontSize: "13px" }}>
            {entry.teacher_name}
          </span>
          <p style={{ color: "#333333", margin: "8px 0 0", lineHeight: 1.55 }}>
            {entry.details || "No details provided."}
          </p>
          {entry.action_plan && (
            <p style={{ color: "#667085", margin: "8px 0 0", lineHeight: 1.55 }}>
              <strong>Action plan:</strong> {entry.action_plan}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}
