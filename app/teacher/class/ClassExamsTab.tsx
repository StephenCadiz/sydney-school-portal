"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { getClassExamMaterialsByLevelName } from "../../../lib/classExams";

const linkStyle = {
  display: "inline-block",
  background: "var(--ss-blue)",
  color: "#ffffff",
  borderRadius: "8px",
  padding: "9px 12px",
  textDecoration: "none",
  fontWeight: 700,
};

function MaterialLink({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" style={linkStyle}>
      {children}
    </a>
  );
}

export default function ClassExamsTab({ levelName }: { levelName: string }) {
  const [materials, setMaterials] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function loadMaterials() {
    setLoading(true);
    setError("");

    try {
      const data = await getClassExamMaterialsByLevelName(levelName);
      setMaterials(data);
    } catch (loadError: any) {
      console.error(loadError);
      setError("Unable to load class exams.");
      setMaterials([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadMaterials();
  }, [levelName]);

  return (
    <div>
      <div style={{ marginBottom: "22px" }}>
        <h2
          style={{
            color: "var(--ss-blue-dark)",
            margin: "0 0 6px",
            fontSize: "24px",
          }}
        >
          Class Exams
        </h2>
        <p style={{ color: "#4b5563", margin: 0 }}>
          Open exam papers, audio and teacher keys for this class level.
        </p>
      </div>

      {loading ? (
        <p style={{ color: "#4b5563", margin: 0 }}>Loading class exams...</p>
      ) : error ? (
        <p style={{ color: "#b91c1c", margin: 0 }}>{error}</p>
      ) : materials.length === 0 ? (
        <div
          style={{
            background: "#f9fafb",
            border: "1px solid var(--ss-border)",
            borderRadius: "12px",
            padding: "18px",
            color: "#4b5563",
          }}
        >
          No class exams have been added for this level yet.
        </div>
      ) : (
        <div style={{ display: "grid", gap: "14px" }}>
          {materials.map((item) => (
            <article
              key={item.id}
              style={{
                border: "1px solid var(--ss-border)",
                borderRadius: "12px",
                padding: "18px",
                background: "#ffffff",
                boxShadow: "0 4px 12px rgba(31,60,136,0.04)",
              }}
            >
              <h3
                style={{
                  color: "var(--ss-blue-dark)",
                  margin: "0 0 14px",
                  fontSize: "18px",
                }}
              >
                Exam Unit {item.exam_unit_number}
              </h3>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
                  gap: "12px",
                  alignItems: "center",
                }}
              >
                <div>
                  <div style={{ color: "#6b7280", fontSize: "13px", marginBottom: "6px" }}>
                    Exam
                  </div>
                  {item.exam_file_url ? (
                    <MaterialLink href={item.exam_file_url}>Open Exam</MaterialLink>
                  ) : (
                    <span style={{ color: "#6b7280" }}>No exam added</span>
                  )}
                </div>

                <div>
                  <div style={{ color: "#6b7280", fontSize: "13px", marginBottom: "6px" }}>
                    Audio
                  </div>
                  {item.audio_file_url ? (
                    <MaterialLink href={item.audio_file_url}>Open Audio</MaterialLink>
                  ) : (
                    <span style={{ color: "#6b7280" }}>No audio added</span>
                  )}
                </div>

                <div>
                  <div style={{ color: "#6b7280", fontSize: "13px", marginBottom: "6px" }}>
                    Key
                  </div>
                  {item.key_file_url ? (
                    <MaterialLink href={item.key_file_url}>Open Key</MaterialLink>
                  ) : (
                    <span style={{ color: "#6b7280" }}>No key added</span>
                  )}
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
