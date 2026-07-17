"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import AdminLayout from "../../components/layout/AdminLayout";
import {
  getAllFollowUpsForAdmin,
  markFollowUpAsSeen,
  updateFollowUpDocumentForAdmin,
} from "../../../lib/followUps";
import { supabase } from "../../../lib/supabase";
import { formatFridayTutorialApprovedDate } from "../../../lib/fridayTutorials";

const categories = ["Academic", "Behaviour", "Homework", "Attendance", "Other"];
const statuses = ["Open", "In Progress", "Resolved"];

type FridayTutorialStatus = {
  status: "added" | "not_added" | "removed" | "ineligible";
  approved_at: string | null;
  eligible: boolean;
  eligibility: boolean;
  has_existing_record: boolean;
  previously_removed: boolean;
  tutorial_student_id: string | null;
  tutorial_group: string | null;
};

const inputStyle = {
  width: "100%",
  padding: "12px",
  border: "1px solid var(--ss-border)",
  borderRadius: "8px",
  fontSize: "15px",
  color: "#333",
  background: "#ffffff",
  boxSizing: "border-box" as const,
};

const labelStyle = {
  fontWeight: 700,
  marginBottom: "6px",
  display: "block" as const,
  color: "#333",
};

const cardStyle = {
  background: "#ffffff",
  border: "1px solid var(--ss-border)",
  borderRadius: "12px",
  padding: "22px",
  boxShadow: "0 4px 14px rgba(31,60,136,0.06)",
} as const;

const primaryButtonStyle = {
  background: "var(--ss-blue)",
  color: "#ffffff",
  border: "none",
  borderRadius: "8px",
  padding: "10px 14px",
  cursor: "pointer",
  fontWeight: 700,
} as const;

const secondaryButtonStyle = {
  background: "#ffffff",
  color: "var(--ss-blue-dark)",
  border: "1px solid var(--ss-border)",
  borderRadius: "8px",
  padding: "10px 14px",
  cursor: "pointer",
  fontWeight: 700,
} as const;

function formatDate(date: string | null | undefined) {
  if (!date) return "Date not available";

  return new Date(`${date}`.includes("T") ? date : `${date}T00:00:00`).toLocaleDateString(
    "en-GB",
    {
      day: "numeric",
      month: "long",
      year: "numeric",
    }
  );
}

function getStatusBadgeStyle(status: string) {
  if (status === "Resolved") {
    return {
      background: "#e8f5ee",
      color: "#236b3b",
      border: "1px solid #bfe2cc",
    };
  }

  if (status === "In Progress") {
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

export default function AdminFollowUpsPage() {
  const [followUps, setFollowUps] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [fridayStatuses, setFridayStatuses] = useState<
    Record<string, FridayTutorialStatus>
  >({});
  const [fridayStatusLoading, setFridayStatusLoading] = useState(false);
  const [fridayStatusUnavailable, setFridayStatusUnavailable] = useState(false);
  const [addingFridayFollowUpId, setAddingFridayFollowUpId] = useState("");
  const [editingId, setEditingId] = useState("");
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    category: "Academic",
    status: "Open",
    admin_seen: false,
  });

  const newFollowUpCount = followUps.filter(
    (item) => item.admin_seen === false
  ).length;

  async function getAuthToken() {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    return session?.access_token || "";
  }

  async function loadFridayStatuses(items: any[]) {
    const academicFollowUpIds = items
      .filter((item) => item.category === "Academic")
      .map((item) => item.id)
      .filter(Boolean);

    setFridayStatuses({});
    setFridayStatusUnavailable(false);

    if (academicFollowUpIds.length === 0) {
      setFridayStatusLoading(false);
      return;
    }

    setFridayStatusLoading(true);

    try {
      const token = await getAuthToken();

      if (!token) {
        throw new Error("Missing authorization token.");
      }

      const response = await fetch("/api/follow-ups/friday-status", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          follow_up_document_ids: academicFollowUpIds,
        }),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data?.error || "Unable to load Friday status.");
      }

      setFridayStatuses(data.statuses || {});
    } catch (statusError) {
      console.error("Unable to load Friday Tutorial statuses:", statusError);
      setFridayStatusUnavailable(true);
    } finally {
      setFridayStatusLoading(false);
    }
  }

  async function loadFollowUps() {
    setLoading(true);
    setError("");

    try {
      const data = await getAllFollowUpsForAdmin();
      setFollowUps(data);
      await loadFridayStatuses(data);
    } catch (loadError: any) {
      console.error("Unable to load follow-ups:", loadError);
      setError(loadError?.message || "Unable to load follow-ups.");
    } finally {
      setLoading(false);
    }
  }

  async function handleAddToFridayList(item: any) {
    const currentStatus = fridayStatuses[item.id];

    if (
      currentStatus?.status === "removed" &&
      !confirm(
        "This student was previously removed from the Friday list. Re-add them now?"
      )
    ) {
      return;
    }

    setMessage("");
    setError("");
    setAddingFridayFollowUpId(item.id);

    try {
      const token = await getAuthToken();

      if (!token) {
        throw new Error("Missing authorization token.");
      }

      const response = await fetch(
        "/api/admin/friday-tutorials/add-from-follow-up",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            follow_up_document_id: item.id,
          }),
        }
      );
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data?.error || "Unable to update Friday list.");
      }

      setFridayStatuses((current) => ({
        ...current,
        [item.id]: data.status,
      }));
      setMessage(data?.message || "Friday Tutorial list updated.");
    } catch (addError: any) {
      console.error("Unable to update Friday Tutorial list:", addError);
      setError(addError?.message || "Unable to update Friday Tutorial list.");
    } finally {
      setAddingFridayFollowUpId("");
    }
  }

  function renderFridayTutorialStatus(item: any) {
    if (item.category !== "Academic") {
      return null;
    }

    const status = fridayStatuses[item.id];
    const isAdding = addingFridayFollowUpId === item.id;

    if (fridayStatusLoading && !status) {
      return (
        <section className="follow-up-friday-status" aria-live="polite">
          <div className="follow-up-friday-status-header">
            <strong>Friday Tutorial Status</strong>
            <span className="follow-up-friday-status-badge follow-up-friday-status-pending">
              Checking
            </span>
          </div>
          <p className="follow-up-friday-status-message">
            Checking Friday list status...
          </p>
        </section>
      );
    }

    if (fridayStatusUnavailable && !status) {
      return (
        <section className="follow-up-friday-status" aria-live="polite">
          <div className="follow-up-friday-status-header">
            <strong>Friday Tutorial Status</strong>
            <span className="follow-up-friday-status-badge follow-up-friday-status-ineligible">
              Unavailable
            </span>
          </div>
          <p className="follow-up-friday-status-message">
            Friday list status unavailable.
          </p>
        </section>
      );
    }

    if (!status) {
      return null;
    }

    if (status.status === "added") {
      const approvedDate = formatFridayTutorialApprovedDate(status.approved_at);

      return (
        <section className="follow-up-friday-status" aria-live="polite">
          <div className="follow-up-friday-status-header">
            <strong>Friday Tutorial Status</strong>
            <span className="follow-up-friday-status-badge follow-up-friday-status-added">
              Added
            </span>
          </div>
          <p className="follow-up-friday-status-message">
            Added to Friday list
            {approvedDate ? ` on ${approvedDate}` : ""}.
          </p>
          <div className="follow-up-friday-status-actions">
            <Link
              className="follow-up-friday-status-link"
              href="/admin/friday-tutorials"
            >
              View Friday List
            </Link>
          </div>
        </section>
      );
    }

    if (status.status === "removed") {
      return (
        <section className="follow-up-friday-status" aria-live="polite">
          <div className="follow-up-friday-status-header">
            <strong>Friday Tutorial Status</strong>
            <span className="follow-up-friday-status-badge follow-up-friday-status-removed">
              Not currently added
            </span>
          </div>
          <p className="follow-up-friday-status-message">
            Not currently on the Friday list.
          </p>
          <div className="follow-up-friday-status-actions">
            <button
              type="button"
              className="follow-up-friday-status-button"
              onClick={() => handleAddToFridayList(item)}
              disabled={isAdding}
            >
              {isAdding ? "Adding..." : "Re-add to Friday List"}
            </button>
          </div>
        </section>
      );
    }

    if (status.status === "ineligible") {
      return (
        <section className="follow-up-friday-status" aria-live="polite">
          <div className="follow-up-friday-status-header">
            <strong>Friday Tutorial Status</strong>
            <span className="follow-up-friday-status-badge follow-up-friday-status-ineligible">
              Not eligible
            </span>
          </div>
          <p className="follow-up-friday-status-message">
            Not eligible for Friday Tutorials.
          </p>
        </section>
      );
    }

    return (
      <section className="follow-up-friday-status" aria-live="polite">
        <div className="follow-up-friday-status-header">
          <strong>Friday Tutorial Status</strong>
          <span className="follow-up-friday-status-badge follow-up-friday-status-pending">
            Not added
          </span>
        </div>
        <p className="follow-up-friday-status-message">
          Not added to Friday list yet.
        </p>
        <div className="follow-up-friday-status-actions">
          <button
            type="button"
            className="follow-up-friday-status-button"
            onClick={() => handleAddToFridayList(item)}
            disabled={isAdding}
          >
            {isAdding ? "Adding..." : "Add to Friday List"}
          </button>
        </div>
      </section>
    );
  }

  useEffect(() => {
    loadFollowUps();
  }, []);

  function updateForm(field: string, value: string | boolean) {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function startEdit(item: any) {
    setEditingId(item.id);
    setMessage("");
    setError("");
    setForm({
      category: item.category || "Academic",
      status: item.status || "Open",
      admin_seen: Boolean(item.admin_seen),
    });
  }

  function cancelEdit() {
    setEditingId("");
    setMessage("");
    setError("");
  }

  async function handleSaveEdit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    setError("");

    try {
      await updateFollowUpDocumentForAdmin(editingId, form);
      setEditingId("");
      await loadFollowUps();
      setMessage("Follow-up document updated.");
    } catch (saveError: any) {
      console.error("Unable to update follow-up:", saveError);
      setError(saveError?.message || "Unable to update follow-up.");
    } finally {
      setSaving(false);
    }
  }

  async function handleMarkReviewed(id: string) {
    setMessage("");
    setError("");

    try {
      await markFollowUpAsSeen(id);
      await loadFollowUps();
      setMessage("Follow-up marked as reviewed.");
    } catch (markError: any) {
      console.error("Unable to mark follow-up reviewed:", markError);
      setError(markError?.message || "Unable to mark follow-up as reviewed.");
    }
  }

  return (
    <AdminLayout>
      <h1 style={{ color: "var(--ss-blue-dark)", marginBottom: "10px" }}>
        Follow Ups
      </h1>

      <p style={{ color: "#666", marginBottom: "30px" }}>
        Review student follow-up documents created by teachers.
      </p>

      <section
        style={{
          ...cardStyle,
          borderLeft: "5px solid var(--ss-blue)",
          marginBottom: "24px",
        }}
      >
        <h2 style={{ color: "var(--ss-blue-dark)", margin: "0 0 8px", fontSize: "20px" }}>
          New follow-ups requiring review
        </h2>
        <div
          style={{
            fontSize: "34px",
            fontWeight: 700,
            color: newFollowUpCount > 0 ? "#b54708" : "#287a45",
          }}
        >
          {newFollowUpCount}
        </div>
      </section>

      {(message || error) && (
        <div
          style={{
            background: error ? "#fff3f3" : "#edf7f1",
            color: error ? "#b00020" : "#287a45",
            border: error ? "1px solid #f1c6c6" : "1px solid #cfe9d8",
            borderRadius: "8px",
            padding: "14px",
            marginBottom: "20px",
            fontWeight: 600,
            whiteSpace: "pre-wrap",
          }}
        >
          {error || message}
        </div>
      )}

      {editingId && (
        <form
          onSubmit={handleSaveEdit}
          style={{
            ...cardStyle,
            marginBottom: "26px",
            maxWidth: "760px",
          }}
        >
          <h2 style={{ color: "var(--ss-blue-dark)", marginTop: 0 }}>
            Edit Follow Up File
          </h2>

          <label style={labelStyle}>Reason</label>
          <select
            value={form.category}
            onChange={(event) => updateForm("category", event.target.value)}
            style={inputStyle}
          >
            {categories.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>

          <div style={{ height: "14px" }} />

          <label style={labelStyle}>Status</label>
          <select
            value={form.status}
            onChange={(event) => updateForm("status", event.target.value)}
            style={inputStyle}
          >
            {statuses.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>

          <div style={{ height: "14px" }} />

          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              color: "#333",
              fontWeight: 600,
            }}
          >
            <input
              type="checkbox"
              checked={form.admin_seen}
              onChange={(event) => updateForm("admin_seen", event.target.checked)}
            />
            Reviewed by admin
          </label>

          <div style={{ marginTop: "22px", display: "flex", gap: "10px" }}>
            <button type="submit" disabled={saving} style={primaryButtonStyle}>
              {saving ? "Saving..." : "Save Changes"}
            </button>

            <button type="button" onClick={cancelEdit} style={secondaryButtonStyle}>
              Cancel
            </button>
          </div>
        </form>
      )}

      <section>
        {loading ? (
          <p>Loading follow-ups...</p>
        ) : error === "Unable to load follow-ups." ? (
          <p>Unable to load follow-ups.</p>
        ) : followUps.length === 0 ? (
          <p>No follow-up documents yet.</p>
        ) : (
          <div style={{ display: "grid", gap: "16px" }}>
            {followUps.map((item) => {
              const statusBadge = getStatusBadgeStyle(item.status);

              return (
                <article
                  key={item.id}
                  style={{
                    ...cardStyle,
                    border: item.admin_seen ? "1px solid var(--ss-border)" : "1px solid #f2c98f",
                    borderLeft: item.admin_seen
                      ? "4px solid #d8e2fb"
                      : "4px solid #b54708",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: "14px",
                      alignItems: "flex-start",
                      marginBottom: "12px",
                    }}
                  >
                    <div>
                      <span
                        style={{
                          display: "inline-block",
                          borderRadius: "999px",
                          padding: "5px 10px",
                          fontSize: "12px",
                          fontWeight: 700,
                          background: item.admin_seen ? "#edf7f1" : "#fff4e5",
                          color: item.admin_seen ? "#287a45" : "#b54708",
                          marginBottom: "10px",
                        }}
                      >
                        {item.admin_seen ? "Reviewed" : "New"}
                      </span>

                      <h2
                        style={{
                          color: "var(--ss-blue-dark)",
                          margin: "0 0 8px",
                          fontSize: "20px",
                        }}
                      >
                        {item.category || "Other"} Follow-Up
                      </h2>
                    </div>

                    <div>
                      <button onClick={() => startEdit(item)} style={secondaryButtonStyle}>
                        Edit
                      </button>

                      {!item.admin_seen && (
                        <button
                          onClick={() => handleMarkReviewed(item.id)}
                          style={{ ...primaryButtonStyle, marginLeft: "10px" }}
                        >
                          Mark Reviewed
                        </button>
                      )}
                    </div>
                  </div>

                  <p style={{ color: "#333", margin: "0 0 8px", lineHeight: 1.6 }}>
                    <strong>Student:</strong> {item.student_name}{" "}
                    <span
                      style={{
                        display: "inline-block",
                        marginLeft: "8px",
                        borderRadius: "999px",
                        padding: "3px 8px",
                        fontSize: "12px",
                        fontWeight: 700,
                        background: "#edf3ff",
                        color: "var(--ss-blue-dark)",
                        border: "1px solid #cdd9f5",
                      }}
                    >
                      {item.student_type_label || "Cambridge"}
                    </span>
                    <br />
                    <strong>Teacher:</strong> {item.teacher_name}
                    <br />
                    <strong>Class:</strong> {item.class_label}
                  </p>

                  <p style={{ color: "#333", margin: "0 0 14px" }}>
                    <strong>Reason:</strong> {item.category}{" "}
                    <strong style={{ marginLeft: "16px" }}>Status:</strong>{" "}
                    <span
                      style={{
                        ...statusBadge,
                        borderRadius: "999px",
                        padding: "4px 9px",
                        fontWeight: 800,
                        fontSize: "12px",
                      }}
                    >
                      {item.status || "Open"}
                    </span>
                  </p>

                  {renderFridayTutorialStatus(item)}

                  <Timeline entries={item.entries || []} />
                </article>
              );
            })}
          </div>
        )}
      </section>
    </AdminLayout>
  );
}

function Timeline({ entries }: { entries: any[] }) {
  if (!entries.length) {
    return (
      <div
        style={{
          background: "#f8fafd",
          border: "1px dashed var(--ss-border)",
          borderRadius: "10px",
          padding: "14px",
          color: "#667085",
        }}
      >
        No dated entries yet.
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: "12px" }}>
      {entries.map((entry) => (
        <div
          key={entry.id}
          style={{
            background: "#f8fafd",
            border: "1px solid #edf1f7",
            borderRadius: "10px",
            padding: "14px",
          }}
        >
          <strong style={{ color: "var(--ss-blue-dark)" }}>
            {formatDate(entry.entry_date || entry.created_at)}
          </strong>
          <span style={{ color: "#667085", marginLeft: "8px", fontSize: "13px" }}>
            {entry.teacher_name}
          </span>
          <p style={{ color: "#333", lineHeight: 1.55, margin: "10px 0 0" }}>
            {entry.details || "No details provided."}
          </p>
          {entry.action_plan && (
            <p style={{ color: "#444", lineHeight: 1.55, margin: "10px 0 0" }}>
              <strong>Action plan:</strong> {entry.action_plan}
            </p>
          )}
          {entry.comment && (
            <p style={{ color: "#667085", lineHeight: 1.55, margin: "10px 0 0" }}>
              <strong>Comment:</strong> {entry.comment}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}
