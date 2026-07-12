"use client";

import { useEffect, useMemo, useState } from "react";
import AdminLayout from "../../components/layout/AdminLayout";
import {
  getClassExamLevels,
  getClassExamMaterialsForPrint,
} from "../../../lib/classExams";

function groupByLevel(materials: any[]): Record<string, any[]> {
  return materials.reduce<Record<string, any[]>>((groups, item) => {
    const levelName = item.level_name || "Unknown Level";

    return {
      ...groups,
      [levelName]: [...(groups[levelName] || []), item],
    };
  }, {});
}

export default function PrintClassExamsPage() {
  const [levels, setLevels] = useState<any[]>([]);
  const [materials, setMaterials] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  async function loadData() {
    setLoading(true);
    setMessage("");

    try {
      const [levelData, materialData] = await Promise.all([
        getClassExamLevels(),
        getClassExamMaterialsForPrint(),
      ]);

      setLevels(levelData);
      setMaterials(materialData);
    } catch (error: any) {
      console.error(error);
      setMessage(error?.message || "Unable to load printable class exams.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  const groupedMaterials = useMemo(() => groupByLevel(materials), [materials]);

  return (
    <AdminLayout>
      <div style={{ maxWidth: "980px" }}>
        <header style={{ marginBottom: "26px" }}>
          <h1 style={{ color: "var(--ss-blue-dark)", margin: "0 0 8px" }}>
            Print Class Exams
          </h1>
          <p style={{ color: "#4b5563", margin: 0 }}>
            Open exam papers for printing. Audio and keys are hidden on this page.
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
          }}
        >
          {loading ? (
            <p style={{ color: "#4b5563", margin: 0 }}>Loading printable exams...</p>
          ) : materials.length === 0 ? (
            <p style={{ color: "#4b5563", margin: 0 }}>
              No active class exam papers are ready for printing yet.
            </p>
          ) : (
            <div style={{ display: "grid", gap: "24px" }}>
              {levels
                .filter((level) => groupedMaterials[level.name]?.length > 0)
                .map((level) => (
                  <div key={level.id}>
                    <h2
                      style={{
                        color: "var(--ss-blue-dark)",
                        margin: "0 0 12px",
                        fontSize: "21px",
                      }}
                    >
                      {level.name}
                    </h2>

                    <div style={{ display: "grid", gap: "10px" }}>
                      {groupedMaterials[level.name].map((item) => (
                        <article
                          key={item.id}
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            gap: "14px",
                            flexWrap: "wrap",
                            border: "1px solid var(--ss-border)",
                            borderRadius: "12px",
                            padding: "14px 16px",
                            background: "#ffffff",
                          }}
                        >
                          <h3
                            style={{
                              color: "#111827",
                              margin: 0,
                              fontSize: "16px",
                            }}
                          >
                            Exam Unit {item.exam_unit_number}
                          </h3>

                          {item.exam_file_url ? (
                            <a
                              href={item.exam_file_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{
                                display: "inline-block",
                                background: "var(--ss-blue)",
                                color: "#ffffff",
                                borderRadius: "8px",
                                padding: "9px 12px",
                                textDecoration: "none",
                                fontWeight: 700,
                              }}
                            >
                              Open Exam
                            </a>
                          ) : (
                            <span style={{ color: "#6b7280" }}>No exam file added.</span>
                          )}
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
