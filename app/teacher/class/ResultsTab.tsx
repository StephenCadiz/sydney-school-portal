"use client";

import { useEffect, useMemo, useState } from "react";
import {
  adjustHomeworkDatesForClassDays,
  getCambridgeReadingSkillLabel,
  getHomework,
} from "../../../lib/homework";
import { supabase } from "../../../lib/supabase";

const cardStyle = {
  background: "#ffffff",
  border: "1px solid #e6eaf2",
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
};

const labelStyle = {
  color: "#333333",
  fontWeight: 700,
  fontSize: "13px",
  marginBottom: "6px",
  display: "block",
} as const;

const buttonStyle = {
  background: "#1f3c88",
  color: "#ffffff",
  border: "none",
  borderRadius: "9px",
  padding: "11px 16px",
  fontWeight: 700,
  cursor: "pointer",
} as const;

const secondaryButtonStyle = {
  background: "#ffffff",
  color: "#1f3c88",
  border: "1px solid #cfd8e6",
  borderRadius: "9px",
  padding: "10px 14px",
  fontWeight: 700,
  cursor: "pointer",
} as const;

const statusBadgeBaseStyle = {
  display: "inline-flex",
  alignItems: "center",
  borderRadius: "999px",
  padding: "5px 10px",
  fontSize: "12px",
  fontWeight: 800,
  lineHeight: 1,
  whiteSpace: "nowrap" as const,
};

const draftBadgeStyle = {
  ...statusBadgeBaseStyle,
  background: "#fff7e6",
  border: "1px solid #f3d49b",
  color: "#8a5a00",
};

const publishedBadgeStyle = {
  ...statusBadgeBaseStyle,
  background: "#edf7f1",
  border: "1px solid #cfe9d8",
  color: "#236b3b",
};

const dangerButtonStyle = {
  ...secondaryButtonStyle,
  color: "#9f1d1d",
  border: "1px solid #f1b7b7",
};

const disabledButtonStyle = {
  cursor: "not-allowed",
  opacity: 0.65,
} as const;

type Props = {
  classId: string;
  students: any[];
  levelName?: string;
  courseType?: string;
  classDays?: string;
  teacherId?: string;
};

function toNumber(value: any) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const number = Number(value);

  return Number.isFinite(number) ? number : null;
}

function formatPercent(value: any) {
  const number = toNumber(value);

  if (number === null) {
    return "-";
  }

  return `${Math.round(number)}%`;
}

function formatDateOnly(value: string | null | undefined) {
  if (!value) {
    return "-";
  }

  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);

  if (!match) {
    return value;
  }

  return `${match[3]}/${match[2]}/${match[1]}`;
}

function getTodayDateOnly() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function getWeekFromTitle(title: string | null | undefined) {
  if (!title) {
    return null;
  }

  const match = /week\s+(\d+)/i.exec(title);

  return match ? Number(match[1]) : null;
}

function getMockAverage(result: any) {
  const reading = toNumber(result.reading);
  const writing = toNumber(result.writing);
  const listening = toNumber(result.listening);
  const speaking = toNumber(result.speaking);

  if (
    reading !== null &&
    writing !== null &&
    listening !== null &&
    speaking !== null
  ) {
    return (reading + writing + listening + speaking) / 4;
  }

  return toNumber(result.overall);
}

function isMockResultPublished(result: any) {
  return Boolean(result?.published_at);
}

function hasCompleteMockScores(result: any) {
  return (
    result.reading !== null &&
    result.reading !== undefined &&
    result.reading !== "" &&
    result.writing !== null &&
    result.writing !== undefined &&
    result.writing !== "" &&
    result.listening !== null &&
    result.listening !== undefined &&
    result.listening !== "" &&
    result.speaking !== null &&
    result.speaking !== undefined &&
    result.speaking !== ""
  );
}

function ProgressBar({ value }: { value: any }) {
  const number = toNumber(value);
  const width = number === null ? 0 : Math.max(0, Math.min(100, number));

  return (
    <div
      style={{
        height: "8px",
        background: "#edf2f8",
        borderRadius: "999px",
        overflow: "hidden",
        marginTop: "7px",
      }}
    >
      <div
        style={{
          width: `${width}%`,
          height: "100%",
          background: "#1f3c88",
          borderRadius: "999px",
        }}
      />
    </div>
  );
}

export default function ResultsTab({
  classId,
  students,
  levelName = "",
  courseType = "",
  classDays = "",
  teacherId = "",
}: Props) {
  const [selectedStudentId, setSelectedStudentId] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [homework, setHomework] = useState<any[]>([]);
  const [loadingResults, setLoadingResults] = useState(false);
  const [loadingHomework, setLoadingHomework] = useState(false);
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const [weekNumber, setWeekNumber] = useState("1");
  const [skill, setSkill] = useState("reading");
  const [percentage, setPercentage] = useState("");
  const [savingPractice, setSavingPractice] = useState(false);
  const [editingPracticeId, setEditingPracticeId] = useState("");

  const [mockNumber, setMockNumber] = useState("1");
  const [reading, setReading] = useState("");
  const [writing, setWriting] = useState("");
  const [listening, setListening] = useState("");
  const [speaking, setSpeaking] = useState("");
  const [comments, setComments] = useState("");
  const [savingMock, setSavingMock] = useState(false);
  const [editingMockId, setEditingMockId] = useState("");
  const [publishingMockId, setPublishingMockId] = useState("");
  const [unpublishingMockId, setUnpublishingMockId] = useState("");
  const [pendingUnpublishResult, setPendingUnpublishResult] =
    useState<any>(null);

  const selectedStudent = students.find(
    (student) => student.id === selectedStudentId
  );

  const readingLabel = getCambridgeReadingSkillLabel(levelName);

  const skillOptions = [
    { value: "reading", label: readingLabel },
    { value: "listening", label: "Listening" },
    { value: "writing", label: "Writing" },
  ];

  const practiceResults = results.filter(
    (result) => result.result_type === "homework"
  );
  const mockResults = results.filter(
    (result) => result.result_type === "mock"
  );

  const mockAverage = useMemo(() => {
    const values = [reading, writing, listening, speaking].map(toNumber);

    if (values.some((value) => value === null)) {
      return null;
    }

    return (
      (values[0] as number) +
      (values[1] as number) +
      (values[2] as number) +
      (values[3] as number)
    ) / 4;
  }, [reading, writing, listening, speaking]);

  const outstandingHomework = useMemo(() => {
    const today = getTodayDateOnly();

    return homework.filter((item) => {
      if (!item.due_date || item.due_date >= today) {
        return false;
      }

      const homeworkWeek = Number(item.week_number);

      if (!Number.isFinite(homeworkWeek)) {
        return false;
      }

      return !practiceResults.some((result) => {
        const resultWeek = getWeekFromTitle(result.title);

        if (resultWeek !== homeworkWeek) {
          return false;
        }

        if (item.homework_skill) {
          return result.skill === item.homework_skill;
        }

        return true;
      });
    });
  }, [homework, practiceResults]);

  useEffect(() => {
    if (!students.some((student) => student.id === selectedStudentId)) {
      setSelectedStudentId("");
    }
  }, [students, selectedStudentId]);

  useEffect(() => {
    async function loadHomework() {
      if (!levelName || !courseType) {
        setHomework([]);
        return;
      }

      setLoadingHomework(true);

      try {
        const data = await getHomework(levelName, courseType);
        setHomework(adjustHomeworkDatesForClassDays(data, classDays));
      } catch (error) {
        console.error(error);
        setHomework([]);
      } finally {
        setLoadingHomework(false);
      }
    }

    loadHomework();
  }, [levelName, courseType, classDays]);

  useEffect(() => {
    loadResults();
  }, [classId, selectedStudentId]);

  async function getSafeTeacherId() {
    if (teacherId) {
      return teacherId;
    }

    const {
      data: { session },
    } = await supabase.auth.getSession();

    return session?.user.id || null;
  }

  async function loadResults() {
    if (!selectedStudentId) {
      setResults([]);
      return;
    }

    setLoadingResults(true);
    setErrorMessage("");

    const { data, error } = await supabase
      .from("results")
      .select("*")
      .eq("class_id", classId)
      .eq("student_id", selectedStudentId);

    if (error) {
      console.error(error);
      setResults([]);
      setErrorMessage("Unable to load results.");
      setLoadingResults(false);
      return;
    }

    setResults(data || []);
    setLoadingResults(false);
  }

  function clearPracticeForm() {
    setWeekNumber("1");
    setSkill("reading");
    setPercentage("");
    setEditingPracticeId("");
  }

  function clearMockForm() {
    setMockNumber("1");
    setReading("");
    setWriting("");
    setListening("");
    setSpeaking("");
    setComments("");
    setEditingMockId("");
  }

  async function savePracticeResult() {
    if (!selectedStudent) {
      setErrorMessage("Select a student first.");
      return;
    }

    const score = toNumber(percentage);

    if (score === null) {
      setErrorMessage("Enter a valid percentage.");
      return;
    }

    setSavingPractice(true);
    setMessage("");
    setErrorMessage("");

    const currentTeacherId = await getSafeTeacherId();
    const payload: any = {
      student_id: selectedStudent.id,
      class_id: classId,
      result_type: "homework",
      title: `Homework Week ${weekNumber}`,
      skill,
      percentage: score,
    };

    if (currentTeacherId) {
      payload.teacher_id = currentTeacherId;
    }

    const { error } = editingPracticeId
      ? await supabase
          .from("results")
          .update(payload)
          .eq("id", editingPracticeId)
      : await supabase.from("results").insert([payload]);

    if (error) {
      setErrorMessage(error.message);
      setSavingPractice(false);
      return;
    }

    setMessage(
      editingPracticeId
        ? "Practice result updated."
        : "Practice result saved."
    );
    clearPracticeForm();
    setSavingPractice(false);
    loadResults();
  }

  function editPractice(result: any) {
    setEditingPracticeId(result.id);
    setWeekNumber(String(getWeekFromTitle(result.title) || 1));
    setSkill(result.skill || "reading");
    setPercentage(
      result.percentage === null || result.percentage === undefined
        ? ""
        : String(result.percentage)
    );
  }

  async function deleteResult(id: string, label: string) {
    const confirmed = confirm(`Delete this ${label}?`);

    if (!confirmed) {
      return;
    }

    const { error } = await supabase
      .from("results")
      .delete()
      .eq("id", id);

    if (error) {
      setErrorMessage(error.message);
      return;
    }

    setMessage(`${label} deleted.`);
    loadResults();
  }

  async function saveMockResult() {
    if (!selectedStudent) {
      setErrorMessage("Select a student first.");
      return;
    }

    const readingScore = toNumber(reading);
    const writingScore = toNumber(writing);
    const listeningScore = toNumber(listening);
    const speakingScore = toNumber(speaking);

    if (
      readingScore === null ||
      writingScore === null ||
      listeningScore === null ||
      speakingScore === null
    ) {
      setErrorMessage("Enter valid scores for all mock exam skills.");
      return;
    }

    setSavingMock(true);
    setMessage("");
    setErrorMessage("");

    const average =
      (readingScore + writingScore + listeningScore + speakingScore) / 4;
    const currentTeacherId = await getSafeTeacherId();
    const wasPublished =
      editingMockId &&
      isMockResultPublished(
        results.find((result) => result.id === editingMockId)
      );
    const payload: any = {
      class_id: classId,
      student_id: selectedStudent.id,
      result_type: "mock",
      mock_number: Number(mockNumber) || 1,
      title: `Mock ${Number(mockNumber) || 1}`,
      reading: readingScore,
      writing: writingScore,
      listening: listeningScore,
      speaking: speakingScore,
      overall: average,
      comments,
      published_at: null,
    };

    if (currentTeacherId) {
      payload.teacher_id = currentTeacherId;
    }

    const { error } = editingMockId
      ? await supabase
          .from("results")
          .update(payload)
          .eq("id", editingMockId)
      : await supabase.from("results").insert([payload]);

    if (error) {
      setErrorMessage(error.message);
      setSavingMock(false);
      return;
    }

    setMessage(
      editingMockId
        ? wasPublished
          ? "Mock result updated and returned to Draft. Publish it when ready."
          : "Mock exam result updated."
        : "Mock exam result saved as Draft."
    );
    clearMockForm();
    setSavingMock(false);
    loadResults();
  }

  async function publishMockResult(result: any) {
    if (!result?.id || publishingMockId || unpublishingMockId) {
      return;
    }

    setMessage("");
    setErrorMessage("");

    if (!hasCompleteMockScores(result)) {
      setErrorMessage("Complete all four mock scores before publishing.");
      return;
    }

    setPublishingMockId(result.id);

    const { error } = await supabase
      .from("results")
      .update({
        published_at: new Date().toISOString(),
      })
      .eq("id", result.id)
      .eq("class_id", classId)
      .eq("result_type", "mock");

    if (error) {
      console.error("Unable to publish mock result:", error);
      setErrorMessage(
        "The mock result could not be published. Please try again."
      );
      setPublishingMockId("");
      return;
    }

    setMessage("Mock result published successfully.");
    setPublishingMockId("");
    loadResults();
  }

  function requestUnpublishMockResult(result: any) {
    setMessage("");
    setErrorMessage("");
    setPendingUnpublishResult(result);
  }

  function cancelUnpublishMockResult() {
    if (unpublishingMockId) {
      return;
    }

    setPendingUnpublishResult(null);
  }

  async function confirmUnpublishMockResult() {
    if (!pendingUnpublishResult?.id || unpublishingMockId) {
      return;
    }

    const resultId = pendingUnpublishResult.id;
    setUnpublishingMockId(resultId);
    setMessage("");
    setErrorMessage("");

    const { error } = await supabase
      .from("results")
      .update({
        published_at: null,
      })
      .eq("id", resultId)
      .eq("class_id", classId)
      .eq("result_type", "mock");

    if (error) {
      console.error("Unable to unpublish mock result:", error);
      setErrorMessage(
        "The mock result could not be unpublished. Please try again."
      );
      setUnpublishingMockId("");
      return;
    }

    setMessage("Mock result returned to Draft.");
    setUnpublishingMockId("");
    setPendingUnpublishResult(null);
    loadResults();
  }

  function editMock(result: any) {
    setEditingMockId(result.id);
    setMockNumber(String(result.mock_number || 1));
    setReading(result.reading === null || result.reading === undefined ? "" : String(result.reading));
    setWriting(result.writing === null || result.writing === undefined ? "" : String(result.writing));
    setListening(result.listening === null || result.listening === undefined ? "" : String(result.listening));
    setSpeaking(result.speaking === null || result.speaking === undefined ? "" : String(result.speaking));
    setComments(result.comments || "");
  }

  function skillLabel(value: string | null | undefined) {
    return (
      skillOptions.find((option) => option.value === value)?.label ||
      "Practice"
    );
  }

  function mockTitle(result: any) {
    if (result.mock_number) {
      return `Mock ${result.mock_number}`;
    }

    return result.title || "Mock Exam";
  }

  return (
    <div
      style={{
        display: "grid",
        gap: "22px",
      }}
    >
      <section style={cardStyle}>
        <h2
          style={{
            color: "#1f3c88",
            margin: "0 0 6px",
            fontSize: "24px",
          }}
        >
          Results
        </h2>

        <p
          style={{
            color: "#667085",
            margin: "0 0 18px",
          }}
        >
          Select a student to add results, review previous work and check
          outstanding homework.
        </p>

        {students.length === 0 ? (
          <p style={{ color: "#333333", margin: 0 }}>
            No students found in this class.
          </p>
        ) : (
          <div style={{ maxWidth: "420px" }}>
            <label style={labelStyle}>Student</label>
            <select
              value={selectedStudentId}
              onChange={(event) => {
                setSelectedStudentId(event.target.value);
                setMessage("");
                setErrorMessage("");
                clearPracticeForm();
                clearMockForm();
              }}
              style={inputStyle}
            >
              <option value="">Select student</option>
              {students.map((student) => (
                <option key={student.id} value={student.id}>
                  {student.first_name} {student.last_name}
                </option>
              ))}
            </select>
          </div>
        )}
      </section>

      {message && (
        <div
          role="status"
          aria-live="polite"
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
          role="alert"
          aria-live="assertive"
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

      {!selectedStudent && students.length > 0 && (
        <section style={cardStyle}>
          <p style={{ color: "#667085", margin: 0 }}>
            Choose a student to open their results workspace.
          </p>
        </section>
      )}

      {selectedStudent && (
        <>
          <section
            style={{
              ...cardStyle,
              background: "#f8fafd",
            }}
          >
            <p
              style={{
                color: "#667085",
                margin: "0 0 5px",
                fontWeight: 700,
                fontSize: "13px",
              }}
            >
              Selected Student
            </p>

            <h3
              style={{
                color: "#1f3c88",
                margin: 0,
                fontSize: "22px",
              }}
            >
              {selectedStudent.first_name} {selectedStudent.last_name}
            </h3>
          </section>

          <section style={cardStyle}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: "16px",
                alignItems: "center",
                marginBottom: "18px",
              }}
            >
              <div>
                <h3
                  style={{
                    color: "#1f3c88",
                    margin: "0 0 5px",
                    fontSize: "20px",
                  }}
                >
                  Practice / Homework Results
                </h3>
                <p style={{ color: "#667085", margin: 0 }}>
                  Weekly exam-part practice for this student.
                </p>
              </div>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
                gap: "14px",
                alignItems: "end",
                marginBottom: "24px",
              }}
            >
              <div>
                <label style={labelStyle}>Week number</label>
                <input
                  type="number"
                  min={1}
                  value={weekNumber}
                  onChange={(event) => setWeekNumber(event.target.value)}
                  style={inputStyle}
                />
              </div>

              <div>
                <label style={labelStyle}>Skill</label>
                <select
                  value={skill}
                  onChange={(event) => setSkill(event.target.value)}
                  style={inputStyle}
                >
                  {skillOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={labelStyle}>Percentage</label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={percentage}
                  onChange={(event) => setPercentage(event.target.value)}
                  style={inputStyle}
                />
              </div>

              <div
                style={{
                  display: "flex",
                  gap: "10px",
                  flexWrap: "wrap",
                }}
              >
                <button
                  onClick={savePracticeResult}
                  disabled={savingPractice}
                  style={buttonStyle}
                >
                  {savingPractice
                    ? "Saving..."
                    : editingPracticeId
                    ? "Save Changes"
                    : "Save Result"}
                </button>

                {editingPracticeId && (
                  <button
                    onClick={clearPracticeForm}
                    style={secondaryButtonStyle}
                  >
                    Cancel
                  </button>
                )}
              </div>
            </div>

            <h4
              style={{
                color: "#1f3c88",
                margin: "0 0 12px",
                fontSize: "16px",
              }}
            >
              Previous Practice Results
            </h4>

            {loadingResults ? (
              <p style={{ color: "#667085" }}>Loading results...</p>
            ) : practiceResults.length === 0 ? (
              <p style={{ color: "#667085", margin: 0 }}>
                No practice results yet.
              </p>
            ) : (
              <div style={{ display: "grid", gap: "10px" }}>
                {practiceResults.map((result) => (
                  <div
                    key={result.id}
                    style={{
                      border: "1px solid #edf1f7",
                      borderRadius: "11px",
                      padding: "13px",
                      display: "grid",
                      gridTemplateColumns:
                        "minmax(140px, 1.4fr) minmax(150px, 1fr) minmax(120px, 1fr) auto",
                      gap: "14px",
                      alignItems: "center",
                    }}
                  >
                    <strong style={{ color: "#333333" }}>
                      {result.title || "Homework Result"}
                    </strong>

                    <span style={{ color: "#667085" }}>
                      {skillLabel(result.skill)}
                    </span>

                    <div>
                      <strong style={{ color: "#1f3c88" }}>
                        {formatPercent(result.percentage)}
                      </strong>
                      <ProgressBar value={result.percentage} />
                    </div>

                    <div
                      style={{
                        display: "flex",
                        gap: "8px",
                        justifyContent: "flex-end",
                      }}
                    >
                      <button
                        onClick={() => editPractice(result)}
                        style={secondaryButtonStyle}
                      >
                        Edit
                      </button>
                      <button
                        onClick={() =>
                          deleteResult(result.id, "practice result")
                        }
                        style={secondaryButtonStyle}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section style={cardStyle}>
            <h3
              style={{
                color: "#1f3c88",
                margin: "0 0 5px",
                fontSize: "20px",
              }}
            >
              Outstanding Homework
            </h3>

            <p style={{ color: "#667085", margin: "0 0 16px" }}>
              Past-due homework with no matching practice result entered yet.
            </p>

            {loadingHomework ? (
              <p style={{ color: "#667085" }}>Loading homework...</p>
            ) : outstandingHomework.length === 0 ? (
              <p style={{ color: "#667085", margin: 0 }}>
                No outstanding homework.
              </p>
            ) : (
              <div style={{ display: "grid", gap: "10px" }}>
                {outstandingHomework.map((item) => (
                  <div
                    key={item.id}
                    style={{
                      border: "1px solid #edf1f7",
                      borderRadius: "11px",
                      padding: "13px",
                      display: "grid",
                      gridTemplateColumns:
                        "minmax(180px, 1.4fr) minmax(120px, 0.8fr) minmax(110px, 0.7fr)",
                      gap: "14px",
                    }}
                  >
                    <div>
                      <strong style={{ color: "#333333" }}>
                        {item.title || `Week ${item.week_number}`}
                      </strong>
                      <p
                        style={{
                          color: "#667085",
                          margin: "5px 0 0",
                          fontSize: "13px",
                        }}
                      >
                        No result entered yet
                      </p>
                    </div>

                    <span style={{ color: "#667085" }}>
                      {item.homework_skill
                        ? skillLabel(item.homework_skill)
                        : "Homework"}
                    </span>

                    <span style={{ color: "#667085" }}>
                      Due {formatDateOnly(item.due_date)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section style={cardStyle}>
            <h3
              style={{
                color: "#1f3c88",
                margin: "0 0 5px",
                fontSize: "20px",
              }}
            >
              Mock Exam Results
            </h3>

            <p style={{ color: "#667085", margin: "0 0 18px" }}>
              Mock exam results are kept separate from weekly practice.
            </p>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(165px, 1fr))",
                gap: "14px",
                alignItems: "end",
                marginBottom: "24px",
              }}
            >
              <div>
                <label style={labelStyle}>Mock number</label>
                <input
                  type="number"
                  min={1}
                  value={mockNumber}
                  onChange={(event) => setMockNumber(event.target.value)}
                  style={inputStyle}
                />
              </div>

              {[
                { label: readingLabel, value: reading, setter: setReading },
                { label: "Writing", value: writing, setter: setWriting },
                { label: "Listening", value: listening, setter: setListening },
                { label: "Speaking", value: speaking, setter: setSpeaking },
              ].map((field) => (
                <div key={field.label}>
                  <label style={labelStyle}>{field.label}</label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={field.value}
                    onChange={(event) => field.setter(event.target.value)}
                    style={inputStyle}
                  />
                </div>
              ))}

              <div>
                <label style={labelStyle}>Average</label>
                <div
                  style={{
                    ...inputStyle,
                    background: "#f5f7fa",
                    fontWeight: 800,
                    color: "#1f3c88",
                  }}
                >
                  {formatPercent(mockAverage)}
                </div>
              </div>
            </div>

            <div style={{ marginBottom: "16px" }}>
              <label style={labelStyle}>Comments</label>
              <textarea
                value={comments}
                onChange={(event) => setComments(event.target.value)}
                rows={4}
                style={inputStyle}
              />
            </div>

            <div
              style={{
                display: "flex",
                gap: "10px",
                flexWrap: "wrap",
                marginBottom: "24px",
              }}
            >
              <button
                onClick={saveMockResult}
                disabled={savingMock}
                style={buttonStyle}
              >
                {savingMock
                  ? "Saving..."
                  : editingMockId
                  ? "Save Mock Changes"
                  : "Save Mock Result"}
              </button>

              {editingMockId && (
                <button onClick={clearMockForm} style={secondaryButtonStyle}>
                  Cancel
                </button>
              )}
            </div>

            {loadingResults ? (
              <p style={{ color: "#667085" }}>Loading mock results...</p>
            ) : mockResults.length === 0 ? (
              <p style={{ color: "#667085", margin: 0 }}>
                No mock exam results yet.
              </p>
            ) : (
              <div style={{ display: "grid", gap: "12px" }}>
                {mockResults.map((result) => {
                  const published = isMockResultPublished(result);
                  const isPublishing = publishingMockId === result.id;
                  const isUnpublishing = unpublishingMockId === result.id;

                  return (
                    <div
                      key={result.id}
                      style={{
                        border: "1px solid #edf1f7",
                        borderRadius: "12px",
                        padding: "16px",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          gap: "14px",
                          marginBottom: "14px",
                          flexWrap: "wrap",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "10px",
                            flexWrap: "wrap",
                          }}
                        >
                          <strong
                            style={{
                              color: "#1f3c88",
                              fontSize: "17px",
                            }}
                          >
                            {mockTitle(result)}
                          </strong>

                          <span
                            style={
                              published ? publishedBadgeStyle : draftBadgeStyle
                            }
                          >
                            {published ? "Published" : "Draft"}
                          </span>
                        </div>

                        <strong style={{ color: "#1f3c88" }}>
                          Average {formatPercent(getMockAverage(result))}
                        </strong>
                      </div>

                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns:
                            "repeat(auto-fit, minmax(140px, 1fr))",
                          gap: "12px",
                          marginBottom: result.comments ? "14px" : "0",
                        }}
                      >
                        {[
                          { label: readingLabel, value: result.reading },
                          { label: "Writing", value: result.writing },
                          { label: "Listening", value: result.listening },
                          { label: "Speaking", value: result.speaking },
                        ].map((item) => (
                          <div key={item.label}>
                            <span
                              style={{
                                color: "#667085",
                                fontSize: "13px",
                              }}
                            >
                              {item.label}
                            </span>
                            <div>
                              <strong style={{ color: "#333333" }}>
                                {formatPercent(item.value)}
                              </strong>
                            </div>
                            <ProgressBar value={item.value} />
                          </div>
                        ))}
                      </div>

                      {result.comments && (
                        <p
                          style={{
                            color: "#667085",
                            margin: "0 0 14px",
                          }}
                        >
                          {result.comments}
                        </p>
                      )}

                      <div className="teacher-mock-result-action-footer">
                        <div
                          className={`teacher-mock-result-student-status ${
                            published ? "is-visible" : "is-draft"
                          }`}
                        >
                          {published
                            ? "Visible to student"
                            : "Not visible to student"}
                        </div>

                        <div className="teacher-mock-result-action-buttons">
                          {published ? (
                            <button
                              type="button"
                              aria-label={`Unpublish ${mockTitle(result)}`}
                              onClick={() => requestUnpublishMockResult(result)}
                              disabled={isUnpublishing}
                              className="teacher-mock-result-action-button is-unpublish"
                            >
                              {isUnpublishing ? "Unpublishing…" : "Unpublish"}
                            </button>
                          ) : (
                            <button
                              type="button"
                              aria-label={`Publish ${mockTitle(result)}`}
                              onClick={() => publishMockResult(result)}
                              disabled={isPublishing}
                              className="teacher-mock-result-action-button is-publish"
                            >
                              {isPublishing ? "Publishing…" : "Publish"}
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() => editMock(result)}
                            className="teacher-mock-result-action-button is-edit"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              deleteResult(result.id, "mock exam result")
                            }
                            className="teacher-mock-result-action-button is-delete"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </>
      )}

      {pendingUnpublishResult && (
        <div
          role="presentation"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(17, 24, 39, 0.42)",
            zIndex: 100,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "18px",
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="unpublish-mock-title"
            aria-describedby="unpublish-mock-description"
            style={{
              background: "#ffffff",
              borderRadius: "14px",
              boxShadow: "0 20px 60px rgba(17, 24, 39, 0.22)",
              border: "1px solid #e6eaf2",
              width: "100%",
              maxWidth: "460px",
              padding: "22px",
            }}
          >
            <h3
              id="unpublish-mock-title"
              style={{
                color: "#1f3c88",
                margin: "0 0 10px",
                fontSize: "21px",
              }}
            >
              Unpublish Mock Result?
            </h3>

            <p
              id="unpublish-mock-description"
              style={{
                color: "#667085",
                margin: "0 0 20px",
                lineHeight: 1.55,
              }}
            >
              The marks will remain saved, but the student will no longer see
              this mock result until it is published again.
            </p>

            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: "10px",
                flexWrap: "wrap",
              }}
            >
              <button
                type="button"
                onClick={cancelUnpublishMockResult}
                disabled={Boolean(unpublishingMockId)}
                style={{
                  ...secondaryButtonStyle,
                  ...(unpublishingMockId ? disabledButtonStyle : {}),
                }}
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={confirmUnpublishMockResult}
                disabled={Boolean(unpublishingMockId)}
                style={{
                  ...dangerButtonStyle,
                  ...(unpublishingMockId ? disabledButtonStyle : {}),
                }}
              >
                {unpublishingMockId ? "Unpublishing..." : "Unpublish"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
