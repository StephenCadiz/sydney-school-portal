"use client";

import { useEffect, useState } from "react";
import { getCambridgeExamKey } from "../../../lib/cambridgeExamKeys";
import {
  getExamNumberFromWeek,
  getGeneratedHomeworkTitle,
  getHomeworkSkillFromWeek,
  getHomeworkSkillLabel,
} from "../../../lib/homework";

type Props = {
  onSave: (homework: any) => void;
  editingHomework: any;
  onCancelEdit: () => void;
};

const inputStyle = {
  width: "100%",
  padding: "12px",
  border: "1px solid #d9d9d9",
  borderRadius: "8px",
  fontSize: "15px",
  color: "#333",
  background: "#fff",
  boxSizing: "border-box" as const,
};

const labelStyle = {
  fontWeight: 600,
  marginBottom: "6px",
  display: "block" as const,
  color: "#333",
};

const courseTypeOptions = [
  { value: "regular", label: "Regular" },
  { value: "intensive", label: "Intensive" },
  { value: "express", label: "Express" },
  { value: "online", label: "Online" },
];

export default function HomeworkForm({
  onSave,
  editingHomework,
  onCancelEdit,
}: Props) {
  const [level, setLevel] = useState("B2");
  const [courseType, setCourseType] = useState("regular");
  const [weekNumber, setWeekNumber] = useState(1);
  const [description, setDescription] = useState("");
  const [releaseDate, setReleaseDate] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [resourceUrl, setResourceUrl] = useState("");
  const [audioUrl, setAudioUrl] = useState("");
  const [teacherKeyUrl, setTeacherKeyUrl] = useState("");
  const [formError, setFormError] = useState("");

  const examNumber = getExamNumberFromWeek(weekNumber);
  const homeworkSkill = getHomeworkSkillFromWeek(weekNumber);
  const generatedTitle = getGeneratedHomeworkTitle(level, weekNumber);
  const activityLabel = getHomeworkSkillLabel(level, homeworkSkill);
  const isListening = homeworkSkill === "listening";

  function resetForm() {
    setLevel("B2");
    setCourseType("regular");
    setWeekNumber(1);
    setDescription("");
    setReleaseDate("");
    setDueDate("");
    setResourceUrl("");
    setAudioUrl("");
    setTeacherKeyUrl("");
    setFormError("");
  }

  useEffect(() => {
    if (!editingHomework) {
      resetForm();
      return;
    }

    setLevel(editingHomework.level || "B2");
    setCourseType((editingHomework.course_type || "regular").toLowerCase());
    setWeekNumber(Number(editingHomework.week_number) || 1);
    setDescription(editingHomework.description || "");
    setReleaseDate(editingHomework.release_date || "");
    setDueDate(editingHomework.due_date || "");
    setResourceUrl(editingHomework.resource_url || "");
    setAudioUrl(editingHomework.audio_url || "");
    setTeacherKeyUrl("");
    setFormError("");
  }, [editingHomework]);

  useEffect(() => {
    async function loadTeacherKey() {
      if (!examNumber) {
        setTeacherKeyUrl("");
        return;
      }

      try {
        const key = await getCambridgeExamKey(level, courseType, examNumber);
        setTeacherKeyUrl(key?.key_url || "");
      } catch (error) {
        console.error(error);
        setTeacherKeyUrl("");
      }
    }

    loadTeacherKey();
  }, [level, courseType, examNumber]);

  useEffect(() => {
    if (!isListening) {
      setAudioUrl("");
    }
  }, [isListening]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError("");

    const safeWeekNumber = Number(weekNumber);

    if (!Number.isFinite(safeWeekNumber) || safeWeekNumber < 1) {
      setFormError("Please enter a valid week number.");
      return;
    }

    if (!examNumber || !homeworkSkill || !generatedTitle) {
      setFormError("Unable to generate homework details from this week.");
      return;
    }

    onSave({
      level,
      course_type: courseType,
      week_number: safeWeekNumber,
      homework_order: 1,
      exam_number: examNumber,
      title: generatedTitle,
      description,
      release_date: releaseDate || null,
      due_date: dueDate || null,
      resource_url: resourceUrl || null,
      homework_skill: homeworkSkill,
      audio_url: isListening ? audioUrl || null : null,
      teacher_key_url: teacherKeyUrl,
      active: true,
    });

    resetForm();
    onCancelEdit();
  }

  return (
    <form
      onSubmit={handleSubmit}
      style={{
        background: "#ffffff",
        padding: "30px",
        borderRadius: "12px",
        boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
        marginBottom: "30px",
      }}
    >
      <h2
        style={{
          color: "#1f3c88",
          marginTop: 0,
          marginBottom: "8px",
        }}
      >
        {editingHomework ? "Edit Cambridge Material" : "Add Cambridge Material"}
      </h2>

      <p
        style={{
          color: "#666",
          marginTop: 0,
          marginBottom: "25px",
        }}
      >
        Week number automatically generates the exam number, activity and
        student-facing title.
      </p>

      {formError && (
        <p
          style={{
            color: "#b00020",
            fontWeight: 600,
          }}
        >
          {formError}
        </p>
      )}

      <div
        style={{
          display: "grid",
          gap: "20px",
        }}
      >
        <div>
          <label style={labelStyle}>Level</label>
          <select
            style={inputStyle}
            value={level}
            onChange={(e) => setLevel(e.target.value)}
          >
            <option>B1</option>
            <option>B2</option>
            <option>C1</option>
            <option>C2</option>
          </select>
        </div>

        <div>
          <label style={labelStyle}>Course Type</label>
          <select
            style={inputStyle}
            value={courseType}
            onChange={(e) => setCourseType(e.target.value)}
          >
            {courseTypeOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label style={labelStyle}>Week Number</label>
          <input
            style={inputStyle}
            type="number"
            min={1}
            value={weekNumber}
            onChange={(e) => setWeekNumber(Number(e.target.value))}
          />
        </div>

        <div
          style={{
            background: "#f5f7fa",
            border: "1px solid #dbe3f0",
            borderRadius: "12px",
            padding: "18px",
          }}
        >
          <div
            style={{
              color: "#667085",
              fontSize: "13px",
              fontWeight: 700,
              marginBottom: "6px",
            }}
          >
            Generated material
          </div>

          <h3
            style={{
              color: "#1f3c88",
              margin: "0 0 8px",
            }}
          >
            {examNumber ? `Exam ${examNumber}` : "Exam not available"}
          </h3>

          <p
            style={{
              color: "#333",
              margin: "0 0 6px",
              fontWeight: 700,
            }}
          >
            {generatedTitle || "Enter a valid week number"}
          </p>

          <p
            style={{
              color: "#667085",
              margin: 0,
            }}
          >
            Activity: {activityLabel || "-"}
          </p>
        </div>

        <div>
          <label style={labelStyle}>Student instructions</label>
          <textarea
            style={inputStyle}
            rows={4}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>

        <div>
          <label style={labelStyle}>Release Date *</label>
          <input
            style={inputStyle}
            required
            type="date"
            value={releaseDate}
            onChange={(e) => setReleaseDate(e.target.value)}
          />
        </div>

        <div>
          <label style={labelStyle}>Due Date *</label>
          <input
            style={inputStyle}
            required
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
          />
        </div>

        <div>
          <label style={labelStyle}>
            {isListening ? "PDF link" : "File link"}
          </label>
          <input
            style={inputStyle}
            value={resourceUrl}
            onChange={(e) => setResourceUrl(e.target.value)}
          />
        </div>

        {isListening && (
          <div>
            <label style={labelStyle}>Audio link</label>
            <input
              style={inputStyle}
              value={audioUrl}
              onChange={(e) => setAudioUrl(e.target.value)}
            />
          </div>
        )}

        <div>
          <label style={labelStyle}>
            Teacher Key link for {examNumber ? `Exam ${examNumber}` : "this exam"}
          </label>
          <input
            style={inputStyle}
            value={teacherKeyUrl}
            onChange={(e) => setTeacherKeyUrl(e.target.value)}
            placeholder="Teacher-only key link"
          />
        </div>

        <div
          style={{
            display: "flex",
            gap: "12px",
            marginTop: "10px",
          }}
        >
          <button
            type="submit"
            style={{
              flex: 1,
              background: "#1f3c88",
              color: "#ffffff",
              border: "none",
              padding: "14px",
              borderRadius: "8px",
              cursor: "pointer",
              fontWeight: 600,
              fontSize: "16px",
            }}
          >
            {editingHomework ? "Update Material" : "Save Material"}
          </button>

          {editingHomework && (
            <button
              type="button"
              onClick={() => {
                onCancelEdit();
                resetForm();
              }}
              style={{
                background: "#777",
                color: "#fff",
                border: "none",
                padding: "14px 24px",
                borderRadius: "8px",
                cursor: "pointer",
                fontWeight: 600,
              }}
            >
              Cancel
            </button>
          )}
        </div>
      </div>
    </form>
  );
}
