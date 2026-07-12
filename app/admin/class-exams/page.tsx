"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import AdminLayout from "../../components/layout/AdminLayout";
import {
  createClassExamMaterial,
  deleteClassExamMaterial,
  getAllClassExamMaterials,
  getClassExamLevels,
  updateClassExamMaterial,
} from "../../../lib/classExams";

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

const buttonStyle = {
  border: "none",
  borderRadius: "8px",
  background: "var(--ss-blue)",
  color: "#ffffff",
  padding: "11px 16px",
  cursor: "pointer",
  fontWeight: 700,
};

function emptyForm() {
  return {
    level_id: "",
    exam_unit_number: "1",
    exam_file_url: "",
    audio_file_url: "",
    key_file_url: "",
    active: true,
  };
}

function groupByLevel(materials: any[]): Record<string, any[]> {
  return materials.reduce<Record<string, any[]>>((groups, item) => {
    const levelName = item.level_name || "Unknown Level";

    return {
      ...groups,
      [levelName]: [...(groups[levelName] || []), item],
    };
  }, {});
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

export default function AdminClassExamsPage() {
  const [levels, setLevels] = useState<any[]>([]);
  const [materials, setMaterials] = useState<any[]>([]);
  const [form, setForm] = useState(emptyForm());
  const [editingId, setEditingId] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  async function loadData() {
    setLoading(true);
    setMessage("");

    try {
      const [levelData, materialData] = await Promise.all([
        getClassExamLevels(),
        getAllClassExamMaterials(),
      ]);

      setLevels(levelData);
      setMaterials(materialData);
    } catch (error: any) {
      console.error(error);
      setMessage(error?.message || "Unable to load class exam materials.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  const groupedMaterials = useMemo(() => groupByLevel(materials), [materials]);

  function updateForm(field: string, value: any) {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function resetForm() {
    setForm(emptyForm());
    setEditingId("");
  }

  function editMaterial(item: any) {
    setEditingId(item.id);
    setForm({
      level_id: item.level_id || "",
      exam_unit_number: String(item.exam_unit_number || 1),
      exam_file_url: item.exam_file_url || "",
      audio_file_url: item.audio_file_url || "",
      key_file_url: item.key_file_url || "",
      active: item.active !== false,
    });
    setMessage("");
  }

  async function saveMaterial(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setMessage("");

    try {
      if (!form.level_id) {
        throw new Error("Please choose a level.");
      }

      if (!form.exam_file_url.trim()) {
        throw new Error("Please add an exam file URL.");
      }

      const payload = {
        ...form,
        exam_unit_number: Number(form.exam_unit_number),
        exam_file_url: form.exam_file_url.trim(),
        audio_file_url: form.audio_file_url.trim() || null,
        key_file_url: form.key_file_url.trim() || null,
      };

      if (editingId) {
        await updateClassExamMaterial(editingId, payload);
        setMessage("Exam unit updated successfully.");
      } else {
        await createClassExamMaterial(payload);
        setMessage("Exam unit saved successfully.");
      }

      resetForm();
      await loadData();
    } catch (error: any) {
      console.error(error);
      setMessage(error?.message || "Unable to save exam unit.");
    } finally {
      setSaving(false);
    }
  }

  async function removeMaterial(id: string) {
    if (!confirm("Delete this exam unit? This cannot be undone.")) return;

    setMessage("");

    try {
      await deleteClassExamMaterial(id);
      setMessage("Exam unit deleted successfully.");
      await loadData();
    } catch (error: any) {
      console.error(error);
      setMessage(error?.message || "Unable to delete exam unit.");
    }
  }

  return (
    <AdminLayout>
      <div style={{ maxWidth: "1120px" }}>
        <header style={{ marginBottom: "26px" }}>
          <h1 style={{ color: "var(--ss-blue-dark)", margin: "0 0 8px" }}>
            Class Exams
          </h1>
          <p style={{ color: "#4b5563", margin: 0 }}>
            Add and manage exam files, audio and keys for Kids 2 to Teens 1.
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

        <section
          style={{
            background: "#ffffff",
            border: "1px solid var(--ss-border)",
            borderRadius: "14px",
            boxShadow: "0 8px 24px rgba(31,60,136,0.06)",
            padding: "24px",
            marginBottom: "26px",
          }}
        >
          <h2 style={{ color: "var(--ss-blue-dark)", margin: "0 0 6px" }}>
            {editingId ? "Edit Exam Unit" : "Add Exam Unit"}
          </h2>
          <p style={{ color: "#6b7280", margin: "0 0 20px" }}>
            Use one record per level and exam unit.
          </p>

          <form
            onSubmit={saveMaterial}
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: "16px",
              alignItems: "end",
            }}
          >
            <label>
              <span style={labelStyle}>Level</span>
              <select
                value={form.level_id}
                onChange={(event) => updateForm("level_id", event.target.value)}
                style={inputStyle}
                required
              >
                <option value="">Select level</option>
                {levels.map((level) => (
                  <option key={level.id} value={level.id}>
                    {level.name}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span style={labelStyle}>Exam unit number</span>
              <input
                type="number"
                min="1"
                value={form.exam_unit_number}
                onChange={(event) =>
                  updateForm("exam_unit_number", event.target.value)
                }
                style={inputStyle}
                required
              />
            </label>

            <label>
              <span style={labelStyle}>Exam file URL</span>
              <input
                value={form.exam_file_url}
                onChange={(event) =>
                  updateForm("exam_file_url", event.target.value)
                }
                placeholder="Google Drive exam file link"
                style={inputStyle}
                required
              />
            </label>

            <label>
              <span style={labelStyle}>Audio file URL</span>
              <input
                value={form.audio_file_url}
                onChange={(event) =>
                  updateForm("audio_file_url", event.target.value)
                }
                placeholder="Listening audio link"
                style={inputStyle}
              />
            </label>

            <label>
              <span style={labelStyle}>Key file URL</span>
              <input
                value={form.key_file_url}
                onChange={(event) =>
                  updateForm("key_file_url", event.target.value)
                }
                placeholder="Teacher key link"
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
                checked={form.active}
                onChange={(event) => updateForm("active", event.target.checked)}
              />
              Active
            </label>

            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
              <button type="submit" disabled={saving} style={buttonStyle}>
                {saving ? "Saving..." : "Save Exam Unit"}
              </button>

              {editingId && (
                <button
                  type="button"
                  onClick={resetForm}
                  style={{
                    ...buttonStyle,
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
        </section>

        <section
          style={{
            background: "#ffffff",
            border: "1px solid var(--ss-border)",
            borderRadius: "14px",
            boxShadow: "0 8px 24px rgba(31,60,136,0.06)",
            padding: "24px",
          }}
        >
          <h2 style={{ color: "var(--ss-blue-dark)", margin: "0 0 18px" }}>
            Existing Class Exams
          </h2>

          {loading ? (
            <p style={{ color: "#4b5563", margin: 0 }}>Loading class exams...</p>
          ) : materials.length === 0 ? (
            <p style={{ color: "#4b5563", margin: 0 }}>
              No class exam materials have been added yet.
            </p>
          ) : (
            <div style={{ display: "grid", gap: "22px" }}>
              {levels
                .filter((level) => groupedMaterials[level.name]?.length > 0)
                .map((level) => (
                  <div key={level.id}>
                    <h3
                      style={{
                        color: "var(--ss-blue-dark)",
                        margin: "0 0 10px",
                        fontSize: "18px",
                      }}
                    >
                      {level.name}
                    </h3>

                    <div style={{ display: "grid", gap: "12px" }}>
                      {groupedMaterials[level.name].map((item) => (
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
                              alignItems: "center",
                            }}
                          >
                            <div>
                              <h4
                                style={{
                                  color: "var(--ss-blue-dark)",
                                  margin: "0 0 6px",
                                }}
                              >
                                Exam Unit {item.exam_unit_number}
                              </h4>
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
                              {item.exam_file_url && (
                                <LinkButton href={item.exam_file_url}>Exam</LinkButton>
                              )}
                              {item.audio_file_url && (
                                <LinkButton href={item.audio_file_url}>Audio</LinkButton>
                              )}
                              {item.key_file_url && (
                                <LinkButton href={item.key_file_url}>Key</LinkButton>
                              )}
                            </div>
                          </div>

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
                              onClick={() => editMaterial(item)}
                              style={{
                                ...buttonStyle,
                                padding: "9px 12px",
                              }}
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => removeMaterial(item.id)}
                              style={{
                                ...buttonStyle,
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
