"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import AdminLayout from "../../components/layout/AdminLayout";
import { getTeachers } from "../../../lib/adminTeachers";
import {
  createFridayExamPracticeSession,
  deleteFridayAt6Duty,
  deleteFridayExamPracticeSession,
  getActivityOptionsForLevel,
  getFridayAt6Duties,
  getFridayExamPracticeSessions,
  isListeningActivity,
  saveFridayAt6Duty,
  updateFridayAt6Duty,
  updateFridayExamPracticeSession,
} from "../../../lib/fridayExamPractice";

const levelOptions = ["B1", "B2", "C1"];

const inputStyle = {
  width: "100%",
  padding: "12px",
  border: "1px solid var(--ss-border)",
  borderRadius: "8px",
  fontSize: "15px",
  color: "#111827",
  background: "#ffffff",
  boxSizing: "border-box" as const,
};

const labelStyle = {
  display: "block" as const,
  marginBottom: "6px",
  color: "var(--ss-blue-dark)",
  fontWeight: 700,
};

const cardStyle = {
  background: "#ffffff",
  border: "1px solid var(--ss-border)",
  borderRadius: "14px",
  boxShadow: "0 8px 24px rgba(31,60,136,0.06)",
  padding: "24px",
} as const;

const primaryButtonStyle = {
  border: "none",
  borderRadius: "8px",
  background: "var(--ss-blue)",
  color: "#ffffff",
  padding: "11px 16px",
  cursor: "pointer",
  fontWeight: 700,
} as const;

function emptyExamForm() {
  return {
    session_date: "",
    level_name: "B1",
    activity_type: "Reading",
    pdf_url: "",
    audio_url: "",
    key_url: "",
    note: "",
    active: true,
  };
}

function emptyDutyForm() {
  return {
    session_date: "",
    teacher_id: "",
    note: "",
    active: true,
  };
}

function formatDate(date: string) {
  if (!date) return "-";

  return new Date(`${date}T00:00:00`).toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function groupByDate(items: any[]) {
  return items.reduce<Record<string, any[]>>((groups, item) => {
    const date = item.session_date || "No date";

    return {
      ...groups,
      [date]: [...(groups[date] || []), item],
    };
  }, {});
}

function getTeacherName(teacher: any) {
  return `${teacher?.first_name || ""} ${teacher?.last_name || ""}`.trim() ||
    teacher?.email ||
    "Unnamed teacher";
}

function LinkButton({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      style={{
        display: "inline-block",
        color: "var(--ss-blue)",
        border: "1px solid var(--ss-border)",
        borderRadius: "8px",
        padding: "8px 10px",
        textDecoration: "none",
        fontWeight: 700,
        background: "#ffffff",
      }}
    >
      {children}
    </a>
  );
}

export default function FridayAt6Page() {
  const [sessions, setSessions] = useState<any[]>([]);
  const [duties, setDuties] = useState<any[]>([]);
  const [teachers, setTeachers] = useState<any[]>([]);
  const [examForm, setExamForm] = useState(emptyExamForm());
  const [dutyForm, setDutyForm] = useState(emptyDutyForm());
  const [editingExamId, setEditingExamId] = useState("");
  const [editingDutyId, setEditingDutyId] = useState("");
  const [loading, setLoading] = useState(true);
  const [savingExam, setSavingExam] = useState(false);
  const [savingDuty, setSavingDuty] = useState(false);
  const [message, setMessage] = useState("");

  const activityOptions = getActivityOptionsForLevel(examForm.level_name);
  const isListening = isListeningActivity(examForm.activity_type);
  const groupedSessions = useMemo(() => groupByDate(sessions), [sessions]);
  const orderedSessionDates = Object.keys(groupedSessions).sort((first, second) =>
    first.localeCompare(second)
  );

  async function loadPageData() {
    setLoading(true);
    setMessage("");

    try {
      const [sessionData, dutyData, teacherData] = await Promise.all([
        getFridayExamPracticeSessions(),
        getFridayAt6Duties(),
        getTeachers(),
      ]);

      setSessions(sessionData);
      setDuties(dutyData);
      setTeachers(teacherData);
    } catch (error: any) {
      console.error(error);
      setMessage(error?.message || "Unable to load Friday @ 6 planning data.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadPageData();
  }, []);

  function updateExamForm(field: string, value: any) {
    setExamForm((current) => {
      const next = {
        ...current,
        [field]: value,
      };

      if (field === "level_name") {
        const nextActivities = getActivityOptionsForLevel(value);

        next.activity_type = nextActivities.includes(current.activity_type)
          ? current.activity_type
          : nextActivities[0] || "";
      }

      if (field === "activity_type" && !isListeningActivity(value)) {
        next.audio_url = "";
      }

      return next;
    });
  }

  function updateDutyForm(field: string, value: any) {
    setDutyForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function resetExamForm() {
    setExamForm(emptyExamForm());
    setEditingExamId("");
  }

  function resetDutyForm() {
    setDutyForm(emptyDutyForm());
    setEditingDutyId("");
  }

  function editExamSession(item: any) {
    setEditingExamId(item.id);
    setExamForm({
      session_date: item.session_date || "",
      level_name: item.level_name || "B1",
      activity_type: item.activity_type || "Reading",
      pdf_url: item.pdf_url || "",
      audio_url: item.audio_url || "",
      key_url: item.key_url || "",
      note: item.note || "",
      active: item.active !== false,
    });
    setMessage("");
  }

  function editDuty(item: any) {
    setEditingDutyId(item.id);
    setDutyForm({
      session_date: item.session_date || "",
      teacher_id: item.teacher_id || "",
      note: item.note || "",
      active: item.active !== false,
    });
    setMessage("");
  }

  async function saveExamSession(event: React.FormEvent) {
    event.preventDefault();
    setSavingExam(true);
    setMessage("");

    try {
      if (editingExamId) {
        await updateFridayExamPracticeSession(editingExamId, examForm);
        setMessage("Exam practice activity updated.");
      } else {
        await createFridayExamPracticeSession(examForm);
        setMessage("Exam practice activity saved.");
      }

      resetExamForm();
      await loadPageData();
    } catch (error: any) {
      console.error(error);
      setMessage(error?.message || "Unable to save exam practice activity.");
    } finally {
      setSavingExam(false);
    }
  }

  async function saveDuty(event: React.FormEvent) {
    event.preventDefault();
    setSavingDuty(true);
    setMessage("");

    try {
      if (editingDutyId) {
        await updateFridayAt6Duty(editingDutyId, dutyForm);
        setMessage("General tutorial duty updated.");
      } else {
        await saveFridayAt6Duty(dutyForm);
        setMessage("General tutorial duty saved.");
      }

      resetDutyForm();
      await loadPageData();
    } catch (error: any) {
      console.error(error);
      setMessage(error?.message || "Unable to save general tutorial duty.");
    } finally {
      setSavingDuty(false);
    }
  }

  async function removeExamSession(id: string) {
    if (!confirm("Delete this exam practice activity?")) return;

    setMessage("");

    try {
      await deleteFridayExamPracticeSession(id);
      setMessage("Exam practice activity deleted.");
      await loadPageData();
    } catch (error: any) {
      console.error(error);
      setMessage(error?.message || "Unable to delete exam practice activity.");
    }
  }

  async function removeDuty(id: string) {
    if (!confirm("Delete this general tutorial duty?")) return;

    setMessage("");

    try {
      await deleteFridayAt6Duty(id);
      setMessage("General tutorial duty deleted.");
      await loadPageData();
    } catch (error: any) {
      console.error(error);
      setMessage(error?.message || "Unable to delete general tutorial duty.");
    }
  }

  return (
    <AdminLayout>
      <div style={{ maxWidth: "1120px" }}>
        <header style={{ marginBottom: "26px" }}>
          <h1 style={{ color: "var(--ss-blue-dark)", margin: "0 0 8px" }}>
            Friday @ 6
          </h1>
          <p style={{ color: "#4b5563", margin: 0 }}>
            Plan Friday 18:00-19:00 exam practice activities and general
            tutorial duty.
          </p>
        </header>

        {message && (
          <div
            style={{
              background: "var(--ss-blue-light)",
              border: "1px solid var(--ss-border)",
              borderRadius: "10px",
              color: "var(--ss-blue-dark)",
              padding: "12px 14px",
              marginBottom: "18px",
              whiteSpace: "pre-wrap",
            }}
          >
            {message}
          </div>
        )}

        <section style={{ ...cardStyle, marginBottom: "26px" }}>
          <h2 style={{ color: "var(--ss-blue-dark)", margin: "0 0 6px" }}>
            General Tutorial Duty
          </h2>
          <p style={{ color: "#6b7280", margin: "0 0 20px" }}>
            Choose the teacher responsible for the general tutorial on each
            Friday.
          </p>

          <form
            onSubmit={saveDuty}
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: "16px",
              alignItems: "end",
              marginBottom: "24px",
            }}
          >
            <label>
              <span style={labelStyle}>Date</span>
              <input
                type="date"
                value={dutyForm.session_date}
                onChange={(event) =>
                  updateDutyForm("session_date", event.target.value)
                }
                style={inputStyle}
                required
              />
            </label>

            <label>
              <span style={labelStyle}>Teacher</span>
              <select
                value={dutyForm.teacher_id}
                onChange={(event) =>
                  updateDutyForm("teacher_id", event.target.value)
                }
                style={inputStyle}
                required
              >
                <option value="">Select teacher</option>
                {teachers.map((teacher) => (
                  <option key={teacher.id} value={teacher.id}>
                    {getTeacherName(teacher)}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span style={labelStyle}>Note</span>
              <input
                value={dutyForm.note}
                onChange={(event) => updateDutyForm("note", event.target.value)}
                placeholder="Optional duty note"
                style={inputStyle}
              />
            </label>

            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                color: "#374151",
                fontWeight: 700,
              }}
            >
              <input
                type="checkbox"
                checked={dutyForm.active}
                onChange={(event) =>
                  updateDutyForm("active", event.target.checked)
                }
              />
              Active
            </label>

            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
              <button type="submit" disabled={savingDuty} style={primaryButtonStyle}>
                {savingDuty ? "Saving..." : "Save Duty"}
              </button>
              {editingDutyId && (
                <button
                  type="button"
                  onClick={resetDutyForm}
                  style={{
                    ...primaryButtonStyle,
                    background: "#ffffff",
                    color: "var(--ss-blue-dark)",
                    border: "1px solid var(--ss-border)",
                  }}
                >
                  Cancel Edit
                </button>
              )}
            </div>
          </form>

          {loading ? (
            <p style={{ color: "#4b5563", margin: 0 }}>Loading duties...</p>
          ) : duties.length === 0 ? (
            <p style={{ color: "#4b5563", margin: 0 }}>
              No general tutorial duties have been planned yet.
            </p>
          ) : (
            <div style={{ display: "grid", gap: "12px" }}>
              {duties.map((duty) => (
                <article
                  key={duty.id}
                  style={{
                    border: "1px solid var(--ss-border)",
                    borderRadius: "12px",
                    padding: "16px",
                    background: duty.active ? "#ffffff" : "#f9fafb",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: "14px",
                      flexWrap: "wrap",
                    }}
                  >
                    <div>
                      <h3
                        style={{
                          color: "var(--ss-blue-dark)",
                          margin: "0 0 6px",
                          fontSize: "18px",
                        }}
                      >
                        {formatDate(duty.session_date)}
                      </h3>
                      <p style={{ color: "#374151", margin: 0, lineHeight: 1.6 }}>
                        <strong>General Tutorial Teacher:</strong>{" "}
                        {duty.teacher_name}
                        <br />
                        18:00-19:00
                        {duty.note && (
                          <>
                            <br />
                            <strong>Note:</strong> {duty.note}
                          </>
                        )}
                      </p>
                      <span
                        style={{
                          display: "inline-block",
                          color: duty.active ? "#166534" : "#6b7280",
                          background: duty.active ? "#dcfce7" : "#f3f4f6",
                          borderRadius: "999px",
                          padding: "4px 9px",
                          fontSize: "13px",
                          fontWeight: 700,
                          marginTop: "10px",
                        }}
                      >
                        {duty.active ? "Active" : "Inactive"}
                      </span>
                    </div>

                    <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                      <button
                        type="button"
                        onClick={() => editDuty(duty)}
                        style={{
                          ...primaryButtonStyle,
                          padding: "9px 12px",
                        }}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => removeDuty(duty.id)}
                        style={{
                          ...primaryButtonStyle,
                          padding: "9px 12px",
                          background: "#ffffff",
                          color: "#b91c1c",
                          border: "1px solid #fecaca",
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <section style={cardStyle}>
          <h2 style={{ color: "var(--ss-blue-dark)", margin: "0 0 6px" }}>
            Exam Practice Activities
          </h2>
          <p style={{ color: "#6b7280", margin: "0 0 20px" }}>
            Add one planned exam-practice activity per level and Friday date.
          </p>

          <form
            onSubmit={saveExamSession}
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: "16px",
              alignItems: "end",
              marginBottom: "26px",
            }}
          >
            <label>
              <span style={labelStyle}>Date</span>
              <input
                type="date"
                value={examForm.session_date}
                onChange={(event) =>
                  updateExamForm("session_date", event.target.value)
                }
                style={inputStyle}
                required
              />
            </label>

            <label>
              <span style={labelStyle}>Level</span>
              <select
                value={examForm.level_name}
                onChange={(event) =>
                  updateExamForm("level_name", event.target.value)
                }
                style={inputStyle}
                required
              >
                {levelOptions.map((level) => (
                  <option key={level} value={level}>
                    {level}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span style={labelStyle}>Activity type</span>
              <select
                value={examForm.activity_type}
                onChange={(event) =>
                  updateExamForm("activity_type", event.target.value)
                }
                style={inputStyle}
                required
              >
                {activityOptions.map((activity) => (
                  <option key={activity} value={activity}>
                    {activity}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span style={labelStyle}>PDF link</span>
              <input
                value={examForm.pdf_url}
                onChange={(event) => updateExamForm("pdf_url", event.target.value)}
                placeholder="Google Drive PDF link"
                style={inputStyle}
                required
              />
            </label>

            {isListening && (
              <label>
                <span style={labelStyle}>Audio link</span>
                <input
                  value={examForm.audio_url}
                  onChange={(event) =>
                    updateExamForm("audio_url", event.target.value)
                  }
                  placeholder="Listening audio link"
                  style={inputStyle}
                  required
                />
              </label>
            )}

            <label>
              <span style={labelStyle}>Key link</span>
              <input
                value={examForm.key_url}
                onChange={(event) => updateExamForm("key_url", event.target.value)}
                placeholder="Teacher key link"
                style={inputStyle}
              />
            </label>

            <label>
              <span style={labelStyle}>Note</span>
              <input
                value={examForm.note}
                onChange={(event) => updateExamForm("note", event.target.value)}
                placeholder="Optional teacher note"
                style={inputStyle}
              />
            </label>

            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                color: "#374151",
                fontWeight: 700,
              }}
            >
              <input
                type="checkbox"
                checked={examForm.active}
                onChange={(event) =>
                  updateExamForm("active", event.target.checked)
                }
              />
              Active
            </label>

            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
              <button type="submit" disabled={savingExam} style={primaryButtonStyle}>
                {savingExam ? "Saving..." : "Save Activity"}
              </button>
              {editingExamId && (
                <button
                  type="button"
                  onClick={resetExamForm}
                  style={{
                    ...primaryButtonStyle,
                    background: "#ffffff",
                    color: "var(--ss-blue-dark)",
                    border: "1px solid var(--ss-border)",
                  }}
                >
                  Cancel Edit
                </button>
              )}
            </div>
          </form>

          <h3 style={{ color: "var(--ss-blue-dark)", margin: "0 0 18px" }}>
            Planned Exam Practice Activities
          </h3>

          {loading ? (
            <p style={{ color: "#4b5563", margin: 0 }}>Loading activities...</p>
          ) : sessions.length === 0 ? (
            <p style={{ color: "#4b5563", margin: 0 }}>
              No exam practice activities have been planned yet.
            </p>
          ) : (
            <div style={{ display: "grid", gap: "24px" }}>
              {orderedSessionDates.map((date) => (
                <div key={date}>
                  <h4
                    style={{
                      color: "var(--ss-blue-dark)",
                      margin: "0 0 6px",
                      fontSize: "19px",
                    }}
                  >
                    {formatDate(date)}
                  </h4>
                  <p style={{ color: "#6b7280", margin: "0 0 12px" }}>
                    Friday 18:00-19:00
                  </p>

                  <div style={{ display: "grid", gap: "12px" }}>
                    {groupedSessions[date].map((item) => (
                      <article
                        key={item.id}
                        style={{
                          border: "1px solid var(--ss-border)",
                          borderRadius: "12px",
                          padding: "16px",
                          background: item.active ? "#ffffff" : "#f9fafb",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            gap: "14px",
                            flexWrap: "wrap",
                            alignItems: "flex-start",
                          }}
                        >
                          <div>
                            <h5
                              style={{
                                color: "var(--ss-blue-dark)",
                                margin: "0 0 6px",
                                fontSize: "17px",
                              }}
                            >
                              {item.level_name} - {item.activity_type}
                            </h5>
                            <span
                              style={{
                                display: "inline-block",
                                color: item.active ? "#166534" : "#6b7280",
                                background: item.active ? "#dcfce7" : "#f3f4f6",
                                borderRadius: "999px",
                                padding: "4px 9px",
                                fontSize: "13px",
                                fontWeight: 700,
                              }}
                            >
                              {item.active ? "Active" : "Inactive"}
                            </span>
                          </div>

                          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                            {item.pdf_url && (
                              <LinkButton href={item.pdf_url}>PDF</LinkButton>
                            )}
                            {isListeningActivity(item.activity_type) && item.audio_url && (
                              <LinkButton href={item.audio_url}>Audio</LinkButton>
                            )}
                            {item.key_url && (
                              <LinkButton href={item.key_url}>Key</LinkButton>
                            )}
                          </div>
                        </div>

                        {item.note && (
                          <p style={{ color: "#4b5563", margin: "12px 0 0" }}>
                            {item.note}
                          </p>
                        )}

                        <div
                          style={{
                            display: "flex",
                            gap: "10px",
                            flexWrap: "wrap",
                            marginTop: "14px",
                          }}
                        >
                          <button
                            type="button"
                            onClick={() => editExamSession(item)}
                            style={{
                              ...primaryButtonStyle,
                              padding: "9px 12px",
                            }}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => removeExamSession(item.id)}
                            style={{
                              ...primaryButtonStyle,
                              padding: "9px 12px",
                              background: "#ffffff",
                              color: "#b91c1c",
                              border: "1px solid #fecaca",
                            }}
                          >
                            Delete
                          </button>
                        </div>
                      </article>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </AdminLayout>
  );
}
