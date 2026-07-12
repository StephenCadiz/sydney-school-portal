"use client";

import { useEffect, useMemo, useState } from "react";
import AdminLayout from "../../components/layout/AdminLayout";
import {
  calculateUpcomingFridayTutorials,
  getFridayTutorialSessionRegister,
  getFridayTutorialSettings,
  getFridayTutorialStudents,
  getTutorialGroupLabel,
  removeTutorialStudentFromFutureLists,
  saveFridayTutorialSettings,
  updateFridayTutorialSessionStudent,
  updateFridayTutorialStudent,
} from "../../../lib/fridayTutorials";

const sessionTypeOptions = [
  {
    value: "kids2_junior3",
    label: "Kids 2 - Junior 3",
  },
  {
    value: "junior4_teens_b1",
    label: "Junior 4 - Teens + B1 Training",
  },
];

const tabs = [
  { id: "weekly", label: "Weekly Lists" },
  { id: "suggested", label: "Suggested Students" },
  { id: "active", label: "Active Tutorial Students" },
  { id: "settings", label: "Settings" },
];

const statusOptions = [
  { value: "choose", label: "Choose" },
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
];

const inputStyle = {
  width: "100%",
  padding: "10px 12px",
  border: "1px solid var(--ss-border)",
  borderRadius: "8px",
  fontSize: "14px",
  color: "#111827",
  background: "#ffffff",
  boxSizing: "border-box" as const,
};

const labelStyle = {
  fontWeight: 700,
  marginBottom: "6px",
  display: "block" as const,
  color: "var(--ss-blue-dark)",
};

const cardStyle = {
  background: "#ffffff",
  border: "1px solid var(--ss-border)",
  borderRadius: "14px",
  padding: "24px",
  boxShadow: "0 8px 24px rgba(31,60,136,0.06)",
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

function formatDate(date: string) {
  if (!date) return "-";

  return new Date(`${date}T00:00:00`).toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function formatShortDate(date: string) {
  if (!date) return "-";

  return new Date(`${date}T00:00:00`).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function getStatusStyle(status: string) {
  if (status === "yes") {
    return { color: "#166534", background: "#dcfce7" };
  }

  if (status === "no") {
    return { color: "#991b1b", background: "#fee2e2" };
  }

  return { color: "#374151", background: "#f3f4f6" };
}

function getBadgeStyle(status: string) {
  if (status === "approved") {
    return {
      background: "#dcfce7",
      color: "#166534",
      border: "1px solid #bbf7d0",
    };
  }

  if (status === "removed") {
    return {
      background: "#fee2e2",
      color: "#991b1b",
      border: "1px solid #fecaca",
    };
  }

  return {
    background: "#fef3c7",
    color: "#92400e",
    border: "1px solid #fde68a",
  };
}

function groupByTutorialGroup(students: any[]) {
  return students.reduce<Record<string, any[]>>((groups, student) => {
    const group = student.tutorial_group || "unknown";

    return {
      ...groups,
      [group]: [...(groups[group] || []), student],
    };
  }, {});
}

function StatusSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const statusStyle = getStatusStyle(value);

  return (
    <select
      value={value || "choose"}
      onChange={(event) => onChange(event.target.value)}
      style={{
        ...inputStyle,
        minWidth: "96px",
        color: statusStyle.color,
        background: statusStyle.background,
        fontWeight: 700,
      }}
    >
      {statusOptions.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

export default function AdminFridayTutorialsPage() {
  const [activeTab, setActiveTab] = useState("weekly");
  const [settings, setSettings] = useState<any>(null);
  const [students, setStudents] = useState<any[]>([]);
  const [registerRows, setRegisterRows] = useState<any[]>([]);
  const [selectedSessionKey, setSelectedSessionKey] = useState("");
  const [loading, setLoading] = useState(true);
  const [registerLoading, setRegisterLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [masterCommentDrafts, setMasterCommentDrafts] = useState<
    Record<string, string>
  >({});
  const [registerCommentDrafts, setRegisterCommentDrafts] = useState<
    Record<string, string>
  >({});
  const [form, setForm] = useState({
    first_friday_date: "",
    first_session_type: "kids2_junior3",
  });

  const upcomingTutorials = useMemo(
    () => calculateUpcomingFridayTutorials(settings, 10),
    [settings]
  );
  const selectedTutorial =
    upcomingTutorials.find(
      (tutorial) =>
        `${tutorial.session_date}|${tutorial.tutorial_group}` === selectedSessionKey
    ) || upcomingTutorials[0];
  const suggestedStudents = students.filter(
    (student) => student.approval_status === "suggested"
  );
  const activeStudents = students.filter(
    (student) => student.approval_status === "approved" && student.active !== false
  );
  const groupedActiveStudents = groupByTutorialGroup(activeStudents);

  async function loadMasterData() {
    setLoading(true);
    setError("");

    try {
      const [settingsData, studentData] = await Promise.all([
        getFridayTutorialSettings(),
        getFridayTutorialStudents(),
      ]);

      setSettings(settingsData);
      setStudents(studentData);
      setMasterCommentDrafts(
        studentData.reduce((drafts: Record<string, string>, item: any) => {
          drafts[item.id] = item.comment || "";
          return drafts;
        }, {})
      );

      if (settingsData) {
        setForm({
          first_friday_date: settingsData.first_friday_date || "",
          first_session_type: settingsData.first_session_type || "kids2_junior3",
        });
      }
    } catch (loadError) {
      console.error("Unable to load Friday Tutorials:", loadError);
      setError("Unable to load Friday Tutorials.");
    } finally {
      setLoading(false);
    }
  }

  async function loadRegister(sessionDate: string, tutorialGroup: string) {
    setRegisterLoading(true);
    setError("");

    try {
      const rows = await getFridayTutorialSessionRegister(
        sessionDate,
        tutorialGroup
      );
      setRegisterRows(rows);
      setRegisterCommentDrafts(
        rows.reduce((drafts: Record<string, string>, item: any) => {
          drafts[item.session_student_id] = item.comment || "";
          return drafts;
        }, {})
      );
    } catch (loadError) {
      console.error("Unable to load Friday Tutorial register:", loadError);
      setError("Unable to load the weekly Friday Tutorial list.");
      setRegisterRows([]);
    } finally {
      setRegisterLoading(false);
    }
  }

  useEffect(() => {
    loadMasterData();
  }, []);

  useEffect(() => {
    if (!settings || upcomingTutorials.length === 0) return;

    const firstSession = upcomingTutorials[0];
    const nextKey = `${firstSession.session_date}|${firstSession.tutorial_group}`;

    setSelectedSessionKey((current) => current || nextKey);
  }, [settings, upcomingTutorials]);

  useEffect(() => {
    if (!selectedTutorial) return;

    loadRegister(selectedTutorial.session_date, selectedTutorial.tutorial_group);
  }, [selectedSessionKey, selectedTutorial?.session_date, selectedTutorial?.tutorial_group]);

  function updateForm(field: string, value: string) {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  async function handleSaveSettings(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    setError("");

    if (!form.first_friday_date) {
      setError("Please choose the first Friday date.");
      setSaving(false);
      return;
    }

    try {
      await saveFridayTutorialSettings(
        form.first_friday_date,
        form.first_session_type
      );
      await loadMasterData();
      setSelectedSessionKey("");
      setMessage("Friday Tutorial rotation saved.");
    } catch (saveError) {
      console.error("Unable to save Friday Tutorial settings:", saveError);
      setError("Unable to save Friday Tutorial settings.");
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdateMasterStudent(id: string, updates: any) {
    setMessage("");
    setError("");

    try {
      await updateFridayTutorialStudent(id, updates);
      await loadMasterData();
      if (selectedTutorial) {
        await loadRegister(
          selectedTutorial.session_date,
          selectedTutorial.tutorial_group
        );
      }
      setMessage("Friday Tutorial student updated.");
    } catch (updateError) {
      console.error("Unable to update Friday Tutorial student:", updateError);
      setError("Unable to update Friday Tutorial student.");
    }
  }

  async function handleUpdateRegisterRow(id: string, updates: any) {
    setMessage("");
    setError("");

    try {
      await updateFridayTutorialSessionStudent(id, updates);
      if (selectedTutorial) {
        await loadRegister(
          selectedTutorial.session_date,
          selectedTutorial.tutorial_group
        );
      }
      setMessage("Weekly register updated.");
    } catch (updateError) {
      console.error("Unable to update weekly register:", updateError);
      setError("Unable to update the weekly register.");
    }
  }

  async function handleRemoveFromFutureLists(tutorialStudentId: string) {
    if (!confirm("Remove this student from future Friday Tutorial lists?")) {
      return;
    }

    setMessage("");
    setError("");

    try {
      await removeTutorialStudentFromFutureLists(tutorialStudentId);
      await loadMasterData();
      if (selectedTutorial) {
        await loadRegister(
          selectedTutorial.session_date,
          selectedTutorial.tutorial_group
        );
      }
      setMessage("Student removed from future Friday Tutorial lists.");
    } catch (removeError) {
      console.error("Unable to remove student from future lists:", removeError);
      setError("Unable to remove student from future lists.");
    }
  }

  function renderStudentSummary(student: any) {
    const badgeStyle = getBadgeStyle(student.approval_status);

    return (
      <article
        key={student.id}
        style={{
          border: "1px solid var(--ss-border)",
          borderRadius: "12px",
          padding: "16px",
          background: "#ffffff",
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
            <h3
              style={{
                color: "var(--ss-blue-dark)",
                margin: "0 0 8px",
                fontSize: "18px",
              }}
            >
              {student.student_name}
            </h3>
            <p style={{ color: "#374151", margin: 0, lineHeight: 1.55 }}>
              <strong>Level:</strong> {student.level_name}
              <br />
              <strong>Teacher:</strong> {student.teacher_name}
              <br />
              <strong>Tutorial group:</strong> {student.tutorial_group_label}
            </p>
          </div>

          <span
            style={{
              ...badgeStyle,
              borderRadius: "999px",
              padding: "5px 10px",
              fontWeight: 800,
              fontSize: "12px",
              textTransform: "capitalize",
            }}
          >
            {student.approval_status}
          </span>
        </div>

        <label style={labelStyle}>Comment</label>
        <textarea
          value={masterCommentDrafts[student.id] || ""}
          onChange={(event) =>
            setMasterCommentDrafts((current) => ({
              ...current,
              [student.id]: event.target.value,
            }))
          }
          style={{
            ...inputStyle,
            minHeight: "70px",
            resize: "vertical" as const,
          }}
        />

        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginTop: "12px" }}>
          {student.approval_status === "suggested" && (
            <button
              onClick={() =>
                handleUpdateMasterStudent(student.id, {
                  approval_status: "approved",
                  active: true,
                })
              }
              style={primaryButtonStyle}
            >
              Approve
            </button>
          )}

          <button
            onClick={() =>
              handleUpdateMasterStudent(student.id, {
                approval_status: "removed",
                active: false,
              })
            }
            style={{
              ...primaryButtonStyle,
              background: "#ffffff",
              color: "#991b1b",
              border: "1px solid #fecaca",
            }}
          >
            Remove
          </button>

          <button
            onClick={() =>
              handleUpdateMasterStudent(student.id, {
                comment: masterCommentDrafts[student.id] || "",
              })
            }
            style={{
              ...primaryButtonStyle,
              background: "#ffffff",
              color: "var(--ss-blue-dark)",
              border: "1px solid var(--ss-border)",
            }}
          >
            Save Comment
          </button>
        </div>
      </article>
    );
  }

  return (
    <AdminLayout>
      <div style={{ maxWidth: "1280px" }}>
        <header style={{ marginBottom: "22px" }}>
          <h1 style={{ color: "var(--ss-blue-dark)", margin: "0 0 8px" }}>
            Friday Tutorials
          </h1>
          <p style={{ color: "#4b5563", margin: 0 }}>
            Manage weekly support sessions for weak students.
          </p>
        </header>

        <section
          style={{
            ...cardStyle,
            borderLeft: "5px solid var(--ss-blue)",
            marginBottom: "22px",
          }}
        >
          <strong style={{ color: "var(--ss-blue-dark)" }}>How it works</strong>
          <p style={{ color: "#4b5563", lineHeight: 1.6, margin: "8px 0 0" }}>
            Friday tutorials run every Friday from 18:00 to 19:00. The sessions
            alternate between Kids 2 - Junior 3 and Junior 4 - Teens + B1
            Training.
          </p>
        </section>

        {(message || error) && (
          <div
            style={{
              background: error ? "#fee2e2" : "#dcfce7",
              color: error ? "#991b1b" : "#166534",
              border: error ? "1px solid #fecaca" : "1px solid #bbf7d0",
              borderRadius: "10px",
              padding: "13px 14px",
              marginBottom: "18px",
              fontWeight: 700,
            }}
          >
            {error || message}
          </div>
        )}

        <nav
          style={{
            display: "flex",
            gap: "10px",
            flexWrap: "wrap",
            marginBottom: "20px",
          }}
        >
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id;

            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                style={{
                  background: isActive ? "var(--ss-blue)" : "#ffffff",
                  color: isActive ? "#ffffff" : "var(--ss-blue-dark)",
                  border: isActive ? "1px solid var(--ss-blue)" : "1px solid var(--ss-border)",
                  borderRadius: "999px",
                  padding: "10px 15px",
                  cursor: "pointer",
                  fontWeight: 800,
                }}
              >
                {tab.label}
              </button>
            );
          })}
        </nav>

        {activeTab === "weekly" && (
          <section style={cardStyle}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: "18px",
                flexWrap: "wrap",
                marginBottom: "20px",
              }}
            >
              <div>
                <h2 style={{ color: "var(--ss-blue-dark)", margin: "0 0 6px" }}>
                  Friday Tutorial List
                </h2>
                <p style={{ color: "#4b5563", margin: 0 }}>
                  Weekly register for the selected Friday session.
                </p>
              </div>

              {settings && upcomingTutorials.length > 0 && (
                <label style={{ minWidth: "320px" }}>
                  <span style={labelStyle}>Upcoming Friday date</span>
                  <select
                    value={selectedSessionKey}
                    onChange={(event) => setSelectedSessionKey(event.target.value)}
                    style={inputStyle}
                  >
                    {upcomingTutorials.map((tutorial) => {
                      const key = `${tutorial.session_date}|${tutorial.tutorial_group}`;

                      return (
                        <option key={key} value={key}>
                          {formatShortDate(tutorial.session_date)} -{" "}
                          {tutorial.tutorial_group_label}
                        </option>
                      );
                    })}
                  </select>
                </label>
              )}
            </div>

            {!settings ? (
              <p style={{ color: "#4b5563", margin: 0 }}>
                Please set the first Friday date in Settings before creating
                weekly lists.
              </p>
            ) : selectedTutorial ? (
              <>
                <div
                  style={{
                    background: "var(--ss-blue-light)",
                    border: "1px solid var(--ss-border)",
                    borderRadius: "12px",
                    padding: "14px",
                    marginBottom: "18px",
                    color: "var(--ss-blue-dark)",
                  }}
                >
                  <strong>
                    Friday Tutorial List - {formatShortDate(selectedTutorial.session_date)}
                  </strong>
                  <br />
                  {selectedTutorial.tutorial_group_label}
                  <br />
                  Friday 18:00-19:00
                </div>

                {registerLoading ? (
                  <p style={{ color: "#4b5563" }}>Loading weekly register...</p>
                ) : registerRows.length === 0 ? (
                  <p style={{ color: "#4b5563" }}>
                    No approved active students are assigned to this tutorial
                    group yet.
                  </p>
                ) : (
                  <div style={{ overflowX: "auto" }}>
                    <table
                      style={{
                        width: "100%",
                        borderCollapse: "collapse",
                        minWidth: "1180px",
                      }}
                    >
                      <thead>
                        <tr style={{ background: "var(--ss-blue)" }}>
                          {[
                            "Name",
                            "Level",
                            "Reason",
                            "Time and Day",
                            "Teacher",
                            "WhatsApp to Parents",
                            "Parent Confirmed",
                            "Teacher Material Received",
                            "Student Attended",
                            "Comments",
                            "Remove from Future Lists",
                          ].map((heading) => (
                            <th
                              key={heading}
                              style={{
                                color: "#ffffff",
                                textAlign: "left",
                                padding: "12px",
                                fontSize: "13px",
                              }}
                            >
                              {heading}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {registerRows.map((row) => (
                          <tr key={row.session_student_id}>
                            <td style={{ padding: "12px", borderBottom: "1px solid var(--ss-border)", fontWeight: 700 }}>
                              {row.student_name}
                            </td>
                            <td style={{ padding: "12px", borderBottom: "1px solid var(--ss-border)" }}>
                              {row.level_name}
                            </td>
                            <td style={{ padding: "12px", borderBottom: "1px solid var(--ss-border)" }}>
                              <input
                                value={row.reason || "Tutorial"}
                                onChange={(event) =>
                                  handleUpdateRegisterRow(row.session_student_id, {
                                    reason: event.target.value,
                                  })
                                }
                                style={{ ...inputStyle, minWidth: "120px" }}
                              />
                            </td>
                            <td style={{ padding: "12px", borderBottom: "1px solid var(--ss-border)", whiteSpace: "nowrap" }}>
                              Friday 18:00-19:00
                            </td>
                            <td style={{ padding: "12px", borderBottom: "1px solid var(--ss-border)" }}>
                              {row.teacher_name}
                            </td>
                            <td style={{ padding: "12px", borderBottom: "1px solid var(--ss-border)" }}>
                              <StatusSelect
                                value={row.whatsapp_sent_status}
                                onChange={(value) =>
                                  handleUpdateRegisterRow(row.session_student_id, {
                                    whatsapp_sent_status: value,
                                  })
                                }
                              />
                            </td>
                            <td style={{ padding: "12px", borderBottom: "1px solid var(--ss-border)" }}>
                              <StatusSelect
                                value={row.parent_confirmed_status}
                                onChange={(value) =>
                                  handleUpdateRegisterRow(row.session_student_id, {
                                    parent_confirmed_status: value,
                                  })
                                }
                              />
                            </td>
                            <td style={{ padding: "12px", borderBottom: "1px solid var(--ss-border)" }}>
                              <StatusSelect
                                value={row.material_received_status}
                                onChange={(value) =>
                                  handleUpdateRegisterRow(row.session_student_id, {
                                    material_received_status: value,
                                  })
                                }
                              />
                            </td>
                            <td style={{ padding: "12px", borderBottom: "1px solid var(--ss-border)" }}>
                              <StatusSelect
                                value={row.student_attended_status}
                                onChange={(value) =>
                                  handleUpdateRegisterRow(row.session_student_id, {
                                    student_attended_status: value,
                                  })
                                }
                              />
                            </td>
                            <td style={{ padding: "12px", borderBottom: "1px solid var(--ss-border)", minWidth: "220px" }}>
                              <textarea
                                value={registerCommentDrafts[row.session_student_id] || ""}
                                onChange={(event) =>
                                  setRegisterCommentDrafts((current) => ({
                                    ...current,
                                    [row.session_student_id]: event.target.value,
                                  }))
                                }
                                style={{ ...inputStyle, minHeight: "58px", resize: "vertical" as const }}
                              />
                              <button
                                onClick={() =>
                                  handleUpdateRegisterRow(row.session_student_id, {
                                    comment:
                                      registerCommentDrafts[row.session_student_id] || "",
                                  })
                                }
                                style={{
                                  ...primaryButtonStyle,
                                  marginTop: "8px",
                                  padding: "8px 10px",
                                }}
                              >
                                Save
                              </button>
                            </td>
                            <td style={{ padding: "12px", borderBottom: "1px solid var(--ss-border)" }}>
                              <button
                                onClick={() =>
                                  handleRemoveFromFutureLists(row.tutorial_student_id)
                                }
                                style={{
                                  ...primaryButtonStyle,
                                  background: "#ffffff",
                                  color: "#991b1b",
                                  border: "1px solid #fecaca",
                                  whiteSpace: "nowrap",
                                }}
                              >
                                Remove
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            ) : null}
          </section>
        )}

        {activeTab === "suggested" && (
          <section style={cardStyle}>
            <h2 style={{ color: "var(--ss-blue-dark)", margin: "0 0 8px" }}>
              Suggested Students
            </h2>
            <p style={{ color: "#4b5563", marginTop: 0 }}>
              Approve or remove students suggested from Academic follow-ups.
            </p>

            {loading ? (
              <p style={{ color: "#4b5563" }}>Loading suggested students...</p>
            ) : suggestedStudents.length === 0 ? (
              <p style={{ color: "#4b5563" }}>No suggested students.</p>
            ) : (
              <div style={{ display: "grid", gap: "14px" }}>
                {suggestedStudents.map(renderStudentSummary)}
              </div>
            )}
          </section>
        )}

        {activeTab === "active" && (
          <section style={cardStyle}>
            <h2 style={{ color: "var(--ss-blue-dark)", margin: "0 0 8px" }}>
              Active Tutorial Students
            </h2>
            <p style={{ color: "#4b5563", marginTop: 0 }}>
              Approved students who will be copied into matching future weekly
              lists.
            </p>

            {loading ? (
              <p style={{ color: "#4b5563" }}>Loading active students...</p>
            ) : activeStudents.length === 0 ? (
              <p style={{ color: "#4b5563" }}>
                No active tutorial students yet.
              </p>
            ) : (
              <div style={{ display: "grid", gap: "22px" }}>
                {["kids2_junior3", "junior4_teens_b1"].map((group) => (
                  <div key={group}>
                    <h3
                      style={{
                        color: "var(--ss-blue-dark)",
                        margin: "0 0 12px",
                      }}
                    >
                      {getTutorialGroupLabel(group)}
                    </h3>

                    {!groupedActiveStudents[group]?.length ? (
                      <p style={{ color: "#4b5563", margin: 0 }}>
                        No active students in this group.
                      </p>
                    ) : (
                      <div style={{ overflowX: "auto" }}>
                        <table
                          style={{
                            width: "100%",
                            borderCollapse: "collapse",
                            minWidth: "820px",
                          }}
                        >
                          <thead>
                            <tr style={{ background: "var(--ss-blue)" }}>
                              {[
                                "Name",
                                "Level",
                                "Teacher",
                                "Tutorial Group",
                                "Comment",
                                "Remove from Future Lists",
                              ].map((heading) => (
                                <th
                                  key={heading}
                                  style={{
                                    color: "#ffffff",
                                    textAlign: "left",
                                    padding: "12px",
                                    fontSize: "13px",
                                  }}
                                >
                                  {heading}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {groupedActiveStudents[group].map((student) => (
                              <tr key={student.id}>
                                <td style={{ padding: "12px", borderBottom: "1px solid var(--ss-border)", fontWeight: 700 }}>
                                  {student.student_name}
                                </td>
                                <td style={{ padding: "12px", borderBottom: "1px solid var(--ss-border)" }}>
                                  {student.level_name}
                                </td>
                                <td style={{ padding: "12px", borderBottom: "1px solid var(--ss-border)" }}>
                                  {student.teacher_name}
                                </td>
                                <td style={{ padding: "12px", borderBottom: "1px solid var(--ss-border)" }}>
                                  {student.tutorial_group_label}
                                </td>
                                <td style={{ padding: "12px", borderBottom: "1px solid var(--ss-border)" }}>
                                  {student.comment || "-"}
                                </td>
                                <td style={{ padding: "12px", borderBottom: "1px solid var(--ss-border)" }}>
                                  <button
                                    onClick={() =>
                                      handleRemoveFromFutureLists(student.id)
                                    }
                                    style={{
                                      ...primaryButtonStyle,
                                      background: "#ffffff",
                                      color: "#991b1b",
                                      border: "1px solid #fecaca",
                                    }}
                                  >
                                    Remove
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {activeTab === "settings" && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(280px, 420px) minmax(0, 1fr)",
              gap: "22px",
              alignItems: "start",
            }}
          >
            <form onSubmit={handleSaveSettings} style={cardStyle}>
              <h2 style={{ color: "var(--ss-blue-dark)", margin: "0 0 18px" }}>
                Rotation Settings
              </h2>

              <div style={{ display: "grid", gap: "16px" }}>
                <label>
                  <span style={labelStyle}>First Friday date</span>
                  <input
                    required
                    type="date"
                    value={form.first_friday_date}
                    onChange={(event) =>
                      updateForm("first_friday_date", event.target.value)
                    }
                    style={inputStyle}
                  />
                </label>

                <label>
                  <span style={labelStyle}>First session type</span>
                  <select
                    value={form.first_session_type}
                    onChange={(event) =>
                      updateForm("first_session_type", event.target.value)
                    }
                    style={inputStyle}
                  >
                    {sessionTypeOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>

                <button type="submit" disabled={saving} style={primaryButtonStyle}>
                  {saving ? "Saving..." : "Save Rotation"}
                </button>
              </div>
            </form>

            <section style={cardStyle}>
              <h2 style={{ color: "var(--ss-blue-dark)", margin: "0 0 8px" }}>
                Upcoming Rotation
              </h2>

              {!settings ? (
                <p style={{ color: "#4b5563", marginBottom: 0 }}>
                  Choose the first Friday date to start the rotation.
                </p>
              ) : (
                <div style={{ display: "grid", gap: "10px", marginTop: "16px" }}>
                  {calculateUpcomingFridayTutorials(settings, 6).map((tutorial) => (
                    <div
                      key={`${tutorial.session_date}-${tutorial.tutorial_group}`}
                      style={{
                        display: "grid",
                        gridTemplateColumns:
                          "minmax(190px, 1fr) minmax(220px, 1fr) auto",
                        gap: "12px",
                        alignItems: "center",
                        border: "1px solid var(--ss-border)",
                        borderRadius: "10px",
                        padding: "12px",
                        background: "#f8fafd",
                      }}
                    >
                      <strong style={{ color: "var(--ss-blue-dark)" }}>
                        {formatDate(tutorial.session_date)}
                      </strong>
                      <span style={{ color: "#374151" }}>
                        {tutorial.tutorial_group_label}
                      </span>
                      <span
                        style={{
                          color: "var(--ss-blue-dark)",
                          fontWeight: 800,
                          whiteSpace: "nowrap",
                        }}
                      >
                        18:00-19:00
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
