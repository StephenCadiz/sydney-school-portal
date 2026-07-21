"use client";

import { useEffect, useMemo, useState } from "react";

import {
  createFollowUpDocument,
  deleteFollowUpDocument,
  getFollowUpsForClass,
} from "../../../lib/followUps";

type StudentFollowUpPanelSectionProps = {
  classId: string;
  teacherId: string;
  studentId: string;
  studentName: string;
};

const categories = ["Academic", "Behaviour", "Homework", "Attendance", "Other"];
const statuses = ["Open", "In Progress", "Resolved"];

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

function getStatusClass(status: string) {
  if (status === "Resolved") return "is-resolved";
  if (status === "In Progress") return "is-progress";

  return "is-open";
}

function Timeline({ followUp }: { followUp: any }) {
  const entries = followUp.entries || [];

  if (entries.length === 0) {
    return <p className="student-workspace-muted">No dated entries yet.</p>;
  }

  return (
    <div className="student-workspace-timeline">
      {entries.map((entry: any, index: number) => (
        <article
          className="student-workspace-timeline-entry"
          key={`${entry.entry_date || entry.created_at}-${index}`}
        >
          <strong>{formatDate(entry.entry_date || entry.created_at)}</strong>
          <span>{entry.teacher_name}</span>
          <p>{entry.details || "No details provided."}</p>
          {entry.action_plan && (
            <p>
              <strong>Action plan:</strong> {entry.action_plan}
            </p>
          )}
        </article>
      ))}
    </div>
  );
}

export default function StudentFollowUpPanelSection({
  classId,
  teacherId,
  studentId,
  studentName,
}: StudentFollowUpPanelSectionProps) {
  const [followUps, setFollowUps] = useState<any[]>([]);
  const [category, setCategory] = useState("Academic");
  const [status, setStatus] = useState("Open");
  const [details, setDetails] = useState("");
  const [actionPlan, setActionPlan] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const studentFollowUps = useMemo(() => {
    return followUps.filter((item) => {
      const itemType =
        item.student_type || (item.young_learner_id ? "young_learner" : "cambridge");
      const itemStudentId =
        itemType === "young_learner" ? item.young_learner_id : item.student_id;

      return itemType === "cambridge" && itemStudentId === studentId;
    });
  }, [followUps, studentId]);

  const selectedExistingFollowUp = useMemo(() => {
    return (
      studentFollowUps.find((item) => (item.category || "Other") === category) ||
      null
    );
  }, [studentFollowUps, category]);

  useEffect(() => {
    if (selectedExistingFollowUp?.status) {
      setStatus(selectedExistingFollowUp.status);
    }
  }, [selectedExistingFollowUp?.id, selectedExistingFollowUp?.status]);

  async function loadFollowUps() {
    if (!classId) {
      setFollowUps([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setErrorMessage("");

    try {
      const data = await getFollowUpsForClass(classId);
      setFollowUps(data);
    } catch (error: any) {
      console.error("Unable to load student follow-ups:", error);
      setErrorMessage(error?.message || "Unable to load follow-up documents.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadFollowUps();
  }, [classId, studentId]);

  function resetEntryFields() {
    setDetails("");
    setActionPlan("");
  }

  async function handleSubmit() {
    setMessage("");
    setErrorMessage("");

    if (!details.trim()) {
      setErrorMessage("Please enter follow-up details.");
      return;
    }

    if (!teacherId) {
      setErrorMessage("Unable to identify the logged-in teacher.");
      return;
    }

    setSaving(true);

    try {
      await createFollowUpDocument({
        student_type: "cambridge",
        student_id: studentId,
        young_learner_id: null,
        class_id: classId,
        teacher_id: teacherId,
        category,
        status,
        details: details.trim(),
        action_plan: actionPlan.trim(),
      });

      setMessage(
        selectedExistingFollowUp
          ? "Dated entry added to the existing follow-up."
          : "Follow-up file created."
      );
      resetEntryFields();
      await loadFollowUps();
    } catch (error: any) {
      console.error("Unable to save student follow-up:", error);
      setErrorMessage(error?.message || "Unable to save follow-up document.");
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
    setErrorMessage("");

    try {
      await deleteFollowUpDocument(id);
      setMessage("Follow-up document deleted.");
      await loadFollowUps();
    } catch (error: any) {
      console.error("Unable to delete student follow-up:", error);
      setErrorMessage(error?.message || "Unable to delete follow-up document.");
    }
  }

  return (
    <section className="student-workspace-section">
      <div className="student-workspace-section-header">
        <h3>Follow-up</h3>
        <p>Create and review follow-up entries for {studentName}.</p>
      </div>

      {message && (
        <div className="student-workspace-success" role="status">
          {message}
        </div>
      )}

      {errorMessage && (
        <div className="student-workspace-error" role="alert">
          {errorMessage}
        </div>
      )}

      <div className="student-workspace-form-card">
        <div className="student-workspace-form-grid is-two-column">
          <label className="student-workspace-field">
            <span>Reason</span>
            <select value={category} onChange={(event) => setCategory(event.target.value)}>
              {categories.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>

          <label className="student-workspace-field">
            <span>Status</span>
            <select value={status} onChange={(event) => setStatus(event.target.value)}>
              {statuses.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div
          className={`student-workspace-context-note ${
            selectedExistingFollowUp ? "is-existing" : "is-new"
          }`}
        >
          {selectedExistingFollowUp
            ? "Existing follow-up found. Your new note will be added as a dated entry."
            : "A new follow-up file will be created for this student and reason."}
        </div>

        <label className="student-workspace-field">
          <span>Details</span>
          <textarea
            rows={4}
            value={details}
            onChange={(event) => setDetails(event.target.value)}
            placeholder="Describe the concern or reason for follow-up"
          />
        </label>

        <label className="student-workspace-field">
          <span>Action plan</span>
          <textarea
            rows={3}
            value={actionPlan}
            onChange={(event) => setActionPlan(event.target.value)}
            placeholder="Next steps, support actions or teacher plan"
          />
        </label>

        <button
          type="button"
          className="student-workspace-primary-button"
          onClick={handleSubmit}
          disabled={saving}
        >
          {saving
            ? "Saving..."
            : selectedExistingFollowUp
            ? "Add Dated Entry"
            : "Create Follow-Up"}
        </button>
      </div>

      <div className="student-workspace-list">
        <h4>Follow-up History</h4>

        {loading ? (
          <p className="student-workspace-muted">Loading follow-up documents...</p>
        ) : studentFollowUps.length === 0 ? (
          <p className="student-workspace-muted">No follow-up documents yet.</p>
        ) : (
          studentFollowUps.map((item) => (
            <article className="student-workspace-item" key={item.id}>
              <div className="student-workspace-item-header">
                <div>
                  <strong>{item.category || "Other"} Follow-Up</strong>
                  <span
                    className={`student-workspace-badge ${getStatusClass(
                      item.status || "Open"
                    )}`}
                  >
                    {item.status || "Open"}
                  </span>
                </div>
                <button
                  type="button"
                  className="student-workspace-danger-button"
                  onClick={() => handleDelete(item.id)}
                >
                  Delete
                </button>
              </div>
              <Timeline followUp={item} />
            </article>
          ))
        )}
      </div>
    </section>
  );
}
