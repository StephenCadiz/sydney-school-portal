"use client";

import { useEffect, useMemo, useState } from "react";
import TeacherLayout from "../../components/layout/TeacherLayout";
import { getCambridgeExamKeys } from "../../../lib/cambridgeExamKeys";
import {
  getExamNumberFromWeek,
  getHomework,
  getHomeworkSkillLabel,
} from "../../../lib/homework";

const levels = ["B1", "B2", "C1", "C2"];

const courseTypes = [
  { value: "regular", label: "Regular" },
  { value: "intensive", label: "Intensive" },
  { value: "express", label: "Express" },
  { value: "online", label: "Online" },
];

const skillOrder = ["reading", "listening", "writing"];

const cardStyle = {
  background: "#ffffff",
  border: "1px solid #e6eaf2",
  borderRadius: "14px",
  padding: "22px",
  boxShadow: "0 6px 18px rgba(31,60,136,0.06)",
} as const;

const inputStyle = {
  width: "100%",
  padding: "12px",
  border: "1px solid #d9e2ef",
  borderRadius: "9px",
  background: "#ffffff",
  color: "#333333",
  fontSize: "15px",
  boxSizing: "border-box" as const,
};

const linkButtonStyle = {
  display: "inline-block",
  background: "#1f3c88",
  color: "#ffffff",
  borderRadius: "8px",
  padding: "9px 13px",
  fontWeight: 700,
  textDecoration: "none",
  fontSize: "14px",
} as const;

function formatDateOnly(value: string | null | undefined) {
  if (!value) {
    return "";
  }

  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);

  if (!match) {
    return value;
  }

  return `${match[3]}/${match[2]}/${match[1]}`;
}

function getSafeExamNumber(item: any) {
  const storedExamNumber = Number(item.exam_number);

  if (Number.isFinite(storedExamNumber) && storedExamNumber > 0) {
    return storedExamNumber;
  }

  return getExamNumberFromWeek(item.week_number);
}

function getMaterialForSkill(items: any[], skill: string) {
  return items.find((item) => item.homework_skill === skill);
}

function MaterialLinks({ item }: { item: any }) {
  if (item.homework_skill === "listening") {
    return (
      <div
        style={{
          display: "flex",
          gap: "10px",
          flexWrap: "wrap",
          marginTop: "12px",
        }}
      >
        {item.resource_url && (
          <a
            href={item.resource_url}
            target="_blank"
            rel="noopener noreferrer"
            style={linkButtonStyle}
          >
            Open PDF
          </a>
        )}

        {item.audio_url && (
          <a
            href={item.audio_url}
            target="_blank"
            rel="noopener noreferrer"
            style={linkButtonStyle}
          >
            Open Audio
          </a>
        )}
      </div>
    );
  }

  if (!item.resource_url) {
    return null;
  }

  return (
    <div style={{ marginTop: "12px" }}>
      <a
        href={item.resource_url}
        target="_blank"
        rel="noopener noreferrer"
        style={linkButtonStyle}
      >
        Open File
      </a>
    </div>
  );
}

export default function TeacherCambridgeExamsPage() {
  const [level, setLevel] = useState("B2");
  const [courseType, setCourseType] = useState("regular");
  const [materials, setMaterials] = useState<any[]>([]);
  const [keys, setKeys] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const exams = useMemo(() => {
    const grouped = new Map<number, any[]>();

    materials.forEach((item) => {
      const examNumber = getSafeExamNumber(item);

      if (!examNumber) {
        return;
      }

      const currentItems = grouped.get(examNumber) || [];
      grouped.set(examNumber, [...currentItems, item]);
    });

    return Array.from(grouped.entries())
      .sort(([a], [b]) => a - b)
      .map(([examNumber, items]) => ({
        examNumber,
        items,
        key: keys.find((item) => Number(item.exam_number) === examNumber),
      }));
  }, [materials, keys]);

  useEffect(() => {
    async function loadCambridgeExams() {
      setLoading(true);
      setError("");

      try {
        const [homeworkData, keyData] = await Promise.all([
          getHomework(level, courseType),
          getCambridgeExamKeys(level, courseType),
        ]);

        setMaterials(homeworkData);
        setKeys(keyData);
      } catch (loadError) {
        console.error(loadError);
        setMaterials([]);
        setKeys([]);
        setError("Unable to load Cambridge exam materials.");
      } finally {
        setLoading(false);
      }
    }

    loadCambridgeExams();
  }, [level, courseType]);

  return (
    <TeacherLayout>
      <section style={{ marginBottom: "26px" }}>
        <h1
          style={{
            color: "#1f3c88",
            margin: "0 0 8px",
            fontSize: "32px",
          }}
        >
          Cambridge Exams
        </h1>

        <p
          style={{
            color: "#667085",
            margin: 0,
            fontSize: "16px",
          }}
        >
          Access Cambridge homework materials and teacher answer keys.
        </p>
      </section>

      <section
        style={{
          ...cardStyle,
          marginBottom: "24px",
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: "16px",
          }}
        >
          <div>
            <label
              style={{
                color: "#333333",
                display: "block",
                fontWeight: 700,
                marginBottom: "6px",
              }}
            >
              Level
            </label>
            <select
              value={level}
              onChange={(event) => setLevel(event.target.value)}
              style={inputStyle}
            >
              {levels.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              style={{
                color: "#333333",
                display: "block",
                fontWeight: 700,
                marginBottom: "6px",
              }}
            >
              Course Type
            </label>
            <select
              value={courseType}
              onChange={(event) => setCourseType(event.target.value)}
              style={inputStyle}
            >
              {courseTypes.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      {loading && (
        <section style={cardStyle}>
          <p style={{ color: "#667085", margin: 0 }}>
            Loading Cambridge materials...
          </p>
        </section>
      )}

      {!loading && error && (
        <section
          style={{
            ...cardStyle,
            borderColor: "#f1b7b7",
            color: "#9f1d1d",
          }}
        >
          <p style={{ margin: 0 }}>{error}</p>
        </section>
      )}

      {!loading && !error && exams.length === 0 && (
        <section style={cardStyle}>
          <p style={{ color: "#667085", margin: 0 }}>
            No Cambridge materials found for this level and course type.
          </p>
        </section>
      )}

      {!loading && !error && exams.length > 0 && (
        <section
          style={{
            display: "grid",
            gap: "18px",
          }}
        >
          {exams.map((exam) => (
            <article key={exam.examNumber} style={cardStyle}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: "16px",
                  alignItems: "center",
                  marginBottom: "18px",
                }}
              >
                <h2
                  style={{
                    color: "#1f3c88",
                    margin: 0,
                    fontSize: "24px",
                  }}
                >
                  Exam {exam.examNumber}
                </h2>

                {exam.key?.key_url ? (
                  <a
                    href={exam.key.key_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={linkButtonStyle}
                  >
                    Open Key
                  </a>
                ) : (
                  <span
                    style={{
                      background: "#f5f7fa",
                      color: "#667085",
                      border: "1px solid #dbe3f0",
                      borderRadius: "999px",
                      padding: "7px 12px",
                      fontWeight: 700,
                      fontSize: "13px",
                    }}
                  >
                    No key added yet.
                  </span>
                )}
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))",
                  gap: "14px",
                }}
              >
                {skillOrder.map((skill) => {
                  const item = getMaterialForSkill(exam.items, skill);

                  return (
                    <div
                      key={skill}
                      style={{
                        background: "#f8fafd",
                        border: "1px solid #edf1f7",
                        borderRadius: "12px",
                        padding: "16px",
                      }}
                    >
                      <h3
                        style={{
                          color: "#1f3c88",
                          margin: "0 0 10px",
                          fontSize: "17px",
                        }}
                      >
                        {getHomeworkSkillLabel(level, skill)}
                      </h3>

                      {item ? (
                        <>
                          <strong
                            style={{
                              color: "#333333",
                              display: "block",
                              marginBottom: "6px",
                            }}
                          >
                            {item.title || getHomeworkSkillLabel(level, skill)}
                          </strong>

                          <p
                            style={{
                              color: "#667085",
                              margin: 0,
                              fontSize: "14px",
                            }}
                          >
                            Week {item.week_number || "-"}
                            {item.due_date
                              ? ` • Due ${formatDateOnly(item.due_date)}`
                              : ""}
                          </p>

                          <MaterialLinks item={item} />
                        </>
                      ) : (
                        <p style={{ color: "#667085", margin: 0 }}>
                          Not added yet.
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </article>
          ))}
        </section>
      )}
    </TeacherLayout>
  );
}
