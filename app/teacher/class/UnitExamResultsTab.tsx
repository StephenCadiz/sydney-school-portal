"use client";

import { useEffect, useMemo, useState } from "react";
import {
  deleteUnitExamResult,
  getUnitExamResultsForClass,
  isUnitExamLevel,
  isTeensUnitExamLevel,
  saveUnitExamResult,
} from "../../../lib/unitExamResults";

const cardStyle = {
  background: "#ffffff",
  border: "1px solid var(--ss-border)",
  borderRadius: "14px",
  padding: "22px",
  boxShadow: "0 6px 18px rgba(31,60,136,0.06)",
} as const;

const inputStyle = {
  width: "100%",
  padding: "10px 11px",
  border: "1px solid #d9e2ef",
  borderRadius: "9px",
  background: "#ffffff",
  color: "#111827",
  fontSize: "14px",
  boxSizing: "border-box" as const,
};

const buttonStyle = {
  background: "var(--ss-blue)",
  color: "#ffffff",
  border: "none",
  borderRadius: "9px",
  padding: "10px 13px",
  fontWeight: 700,
  cursor: "pointer",
} as const;

const deleteButtonStyle = {
  background: "#ffffff",
  color: "#b42318",
  border: "1px solid #f3c7c3",
  borderRadius: "9px",
  padding: "8px 11px",
  fontWeight: 700,
  cursor: "pointer",
} as const;

type RowValues = {
  id?: string;
  reading_writing: string;
  reading: string;
  writing: string;
  listening: string;
  speaking: string;
  comments: string;
};

function getStudentName(student: any) {
  return `${student.first_name || ""} ${student.last_name || ""}`.trim() ||
    "Unnamed student";
}

function formatScore(value: any) {
  if (value === null || value === undefined || value === "") {
    return "-";
  }

  return String(value);
}

export default function UnitExamResultsTab({
  classId,
  teacherId,
  levelName,
  youngLearners,
}: {
  classId: string;
  teacherId: string;
  levelName: string;
  youngLearners: any[];
}) {
  const [unitExamNumber, setUnitExamNumber] = useState("1");
  const [results, setResults] = useState<any[]>([]);
  const [rowValues, setRowValues] = useState<Record<string, RowValues>>({});
  const [loading, setLoading] = useState(false);
  const [savingId, setSavingId] = useState("");
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const allowedLevel = isUnitExamLevel(levelName);
  const isTeensLevel = isTeensUnitExamLevel(levelName);
  const selectedUnitNumber = Number(unitExamNumber) || 1;
  const resultHeadings = isTeensLevel
    ? ["Student", "Reading", "Writing", "Listening", "Speaking", "Comments", "Save"]
    : ["Student", "Reading/Writing", "Listening", "Speaking", "Comments", "Save"];

  const studentMap = useMemo(() => {
    return new Map(
      youngLearners.map((student) => [student.id, getStudentName(student)])
    );
  }, [youngLearners]);

  const currentUnitResults = useMemo(() => {
    return results.filter(
      (result) => Number(result.unit_exam_number) === selectedUnitNumber
    );
  }, [results, selectedUnitNumber]);

  const groupedResults = useMemo(() => {
    return results.reduce((groups: Record<string, any[]>, result) => {
      const unitNumber = String(result.unit_exam_number || "Unassigned");

      return {
        ...groups,
        [unitNumber]: [...(groups[unitNumber] || []), result],
      };
    }, {});
  }, [results]);

  useEffect(() => {
    if (!allowedLevel || !classId) {
      return;
    }

    loadResults();
  }, [allowedLevel, classId]);

  useEffect(() => {
    const nextValues: Record<string, RowValues> = {};

    youngLearners.forEach((student) => {
      const result = currentUnitResults.find(
        (item) => item.young_learner_id === student.id
      );

      nextValues[student.id] = {
        id: result?.id,
        reading_writing:
          result?.reading_writing === null ||
          result?.reading_writing === undefined
            ? ""
            : String(result.reading_writing),
        reading:
          result?.reading === null || result?.reading === undefined
            ? ""
            : String(result.reading),
        writing:
          result?.writing === null || result?.writing === undefined
            ? ""
            : String(result.writing),
        listening:
          result?.listening === null || result?.listening === undefined
            ? ""
            : String(result.listening),
        speaking:
          result?.speaking === null || result?.speaking === undefined
            ? ""
            : String(result.speaking),
        comments: result?.comments || "",
      };
    });

    setRowValues(nextValues);
  }, [youngLearners, currentUnitResults]);

  async function loadResults() {
    setLoading(true);
    setErrorMessage("");

    try {
      const data = await getUnitExamResultsForClass(classId);
      setResults(data);
    } catch (error: any) {
      console.error(error);
      setErrorMessage(error?.message || "Unable to load Unit Exam results.");
      setResults([]);
    } finally {
      setLoading(false);
    }
  }

  function updateRow(studentId: string, field: keyof RowValues, value: string) {
    setRowValues((current) => {
      const currentRow = current[studentId] || {
        reading_writing: "",
        reading: "",
        writing: "",
        listening: "",
        speaking: "",
        comments: "",
      };

      return {
        ...current,
        [studentId]: {
          ...currentRow,
          [field]: value,
        },
      };
    });
  }

  async function saveRow(student: any) {
    const row = rowValues[student.id] || {
      reading_writing: "",
      reading: "",
      writing: "",
      listening: "",
      speaking: "",
      comments: "",
    };

    setSavingId(student.id);
    setMessage("");
    setErrorMessage("");

    try {
      await saveUnitExamResult({
        young_learner_id: student.id,
        class_id: classId,
        teacher_id: teacherId,
        level_name: levelName,
        unit_exam_number: selectedUnitNumber,
        reading_writing: row.reading_writing,
        reading: row.reading,
        writing: row.writing,
        listening: row.listening,
        speaking: row.speaking,
        comments: row.comments,
      });

      setMessage(`${getStudentName(student)} saved for Unit Exam ${selectedUnitNumber}.`);
      await loadResults();
    } catch (error: any) {
      console.error(error);
      setErrorMessage(error?.message || "Unable to save Unit Exam result.");
    } finally {
      setSavingId("");
    }
  }

  async function deleteResult(result: any) {
    const confirmed = confirm("Delete this Unit Exam result?");

    if (!confirmed) {
      return;
    }

    setMessage("");
    setErrorMessage("");

    try {
      await deleteUnitExamResult(result.id);
      setMessage("Unit Exam result deleted.");
      await loadResults();
    } catch (error: any) {
      console.error(error);
      setErrorMessage(error?.message || "Unable to delete Unit Exam result.");
    }
  }

  if (!allowedLevel) {
    return null;
  }

  return (
    <div style={{ display: "grid", gap: "22px" }}>
      <section style={cardStyle}>
        <h2
          style={{
            color: "var(--ss-blue-dark)",
            margin: "0 0 6px",
            fontSize: "24px",
          }}
        >
          Unit Exam Results
        </h2>

        <p style={{ color: "#667085", margin: "0 0 18px" }}>
          Enter Unit Exam results for the selected class level.
        </p>

        <div style={{ maxWidth: "230px" }}>
          <label
            style={{
              color: "#333333",
              fontWeight: 700,
              fontSize: "13px",
              marginBottom: "6px",
              display: "block",
            }}
          >
            Unit Exam number
          </label>
          <input
            type="number"
            min={1}
            value={unitExamNumber}
            onChange={(event) => setUnitExamNumber(event.target.value)}
            style={inputStyle}
          />
        </div>
      </section>

      {message && (
        <div
          style={{
            ...cardStyle,
            borderColor: "#c8e6d2",
            color: "#236b3b",
            padding: "14px 18px",
          }}
        >
          {message}
        </div>
      )}

      {errorMessage && (
        <div
          style={{
            ...cardStyle,
            borderColor: "#f1b7b7",
            color: "#9f1d1d",
            padding: "14px 18px",
          }}
        >
          {errorMessage}
        </div>
      )}

      <section style={cardStyle}>
        {youngLearners.length === 0 ? (
          <p style={{ color: "#667085", margin: 0 }}>
            No students have been added to this class yet.
          </p>
        ) : (
          <>
            <h3
              style={{
                color: "var(--ss-blue-dark)",
                margin: "0 0 14px",
                fontSize: "20px",
              }}
            >
              Unit Exam {selectedUnitNumber}
            </h3>

            <div style={{ overflowX: "auto" }}>
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  minWidth: "820px",
                }}
              >
                <thead>
                  <tr>
                    {resultHeadings.map(
                      (heading) => (
                        <th
                          key={heading}
                          style={{
                            textAlign: "left",
                            color: "#344054",
                            fontSize: "13px",
                            padding: "10px",
                            borderBottom: "1px solid var(--ss-border)",
                          }}
                        >
                          {heading}
                        </th>
                      )
                    )}
                  </tr>
                </thead>
                <tbody>
                  {youngLearners.map((student) => {
                    const row = rowValues[student.id] || {
                      reading_writing: "",
                      reading: "",
                      writing: "",
                      listening: "",
                      speaking: "",
                      comments: "",
                    };

                    return (
                      <tr key={student.id}>
                        <td
                          style={{
                            padding: "12px 10px",
                            borderBottom: "1px solid #eef2f7",
                            color: "#111827",
                            fontWeight: 700,
                          }}
                        >
                          {getStudentName(student)}
                        </td>
                        {isTeensLevel ? (
                          <>
                            <td style={{ padding: "12px 10px", borderBottom: "1px solid #eef2f7" }}>
                              <input
                                type="number"
                                value={row.reading}
                                onChange={(event) =>
                                  updateRow(student.id, "reading", event.target.value)
                                }
                                style={inputStyle}
                              />
                            </td>
                            <td style={{ padding: "12px 10px", borderBottom: "1px solid #eef2f7" }}>
                              <input
                                type="number"
                                value={row.writing}
                                onChange={(event) =>
                                  updateRow(student.id, "writing", event.target.value)
                                }
                                style={inputStyle}
                              />
                            </td>
                          </>
                        ) : (
                          <td style={{ padding: "12px 10px", borderBottom: "1px solid #eef2f7" }}>
                            <input
                              type="number"
                              value={row.reading_writing}
                              onChange={(event) =>
                                updateRow(
                                  student.id,
                                  "reading_writing",
                                  event.target.value
                                )
                              }
                              style={inputStyle}
                            />
                          </td>
                        )}
                        <td style={{ padding: "12px 10px", borderBottom: "1px solid #eef2f7" }}>
                          <input
                            type="number"
                            value={row.listening}
                            onChange={(event) =>
                              updateRow(student.id, "listening", event.target.value)
                            }
                            style={inputStyle}
                          />
                        </td>
                        <td style={{ padding: "12px 10px", borderBottom: "1px solid #eef2f7" }}>
                          <input
                            type="number"
                            value={row.speaking}
                            onChange={(event) =>
                              updateRow(student.id, "speaking", event.target.value)
                            }
                            style={inputStyle}
                          />
                        </td>
                        <td style={{ padding: "12px 10px", borderBottom: "1px solid #eef2f7" }}>
                          <input
                            value={row.comments}
                            onChange={(event) =>
                              updateRow(student.id, "comments", event.target.value)
                            }
                            style={inputStyle}
                          />
                        </td>
                        <td style={{ padding: "12px 10px", borderBottom: "1px solid #eef2f7" }}>
                          <button
                            onClick={() => saveRow(student)}
                            disabled={savingId === student.id}
                            style={{
                              ...buttonStyle,
                              opacity: savingId === student.id ? 0.75 : 1,
                            }}
                          >
                            {savingId === student.id ? "Saving..." : "Save"}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      <section style={cardStyle}>
        <h3
          style={{
            color: "var(--ss-blue-dark)",
            margin: "0 0 14px",
            fontSize: "20px",
          }}
        >
          Previous Unit Exam Results
        </h3>

        {loading ? (
          <p style={{ color: "#667085", margin: 0 }}>Loading Unit Exam results...</p>
        ) : results.length === 0 ? (
          <p style={{ color: "#667085", margin: 0 }}>
            No Unit Exam results have been saved yet.
          </p>
        ) : (
          <div style={{ display: "grid", gap: "16px" }}>
            {Object.keys(groupedResults)
              .sort((first, second) => Number(first) - Number(second))
              .map((unitNumber) => (
                <div
                  key={unitNumber}
                  style={{
                    border: "1px solid var(--ss-border)",
                    borderRadius: "12px",
                    padding: "15px",
                    background: "#f8fafd",
                  }}
                >
                  <h4
                    style={{
                      color: "var(--ss-blue-dark)",
                      margin: "0 0 12px",
                      fontSize: "17px",
                    }}
                  >
                    Unit Exam {unitNumber}
                  </h4>

                  <div style={{ display: "grid", gap: "10px" }}>
                    {groupedResults[unitNumber].map((result) => (
                      <div
                        key={result.id}
                        style={{
                          display: "grid",
                          gridTemplateColumns:
                            isTeensLevel
                              ? "minmax(150px, 1.2fr) repeat(4, minmax(80px, 0.5fr)) minmax(160px, 1fr) auto"
                              : "minmax(150px, 1.2fr) repeat(3, minmax(100px, 0.5fr)) minmax(160px, 1fr) auto",
                          gap: "10px",
                          alignItems: "center",
                          background: "#ffffff",
                          border: "1px solid #e6eaf2",
                          borderRadius: "10px",
                          padding: "12px",
                        }}
                      >
                        <strong style={{ color: "#111827" }}>
                          {studentMap.get(result.young_learner_id) ||
                            "Unknown student"}
                        </strong>
                        {isTeensLevel ? (
                          <>
                            <span>Reading: {formatScore(result.reading)}</span>
                            <span>Writing: {formatScore(result.writing)}</span>
                          </>
                        ) : (
                          <span>
                            Reading/Writing: {formatScore(result.reading_writing)}
                          </span>
                        )}
                        <span>Listening: {formatScore(result.listening)}</span>
                        <span>Speaking: {formatScore(result.speaking)}</span>
                        <span style={{ color: "#667085" }}>
                          {result.comments || "No comments"}
                        </span>
                        <button
                          onClick={() => deleteResult(result)}
                          style={deleteButtonStyle}
                        >
                          Delete
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
          </div>
        )}
      </section>
    </div>
  );
}
