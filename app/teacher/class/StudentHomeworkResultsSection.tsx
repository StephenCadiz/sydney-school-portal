"use client";

import { useEffect, useMemo, useState } from "react";

import {
  adjustHomeworkDatesForClassDays,
  getCambridgeReadingSkillLabel,
  getHomework,
} from "../../../lib/homework";
import { supabase } from "../../../lib/supabase";

type StudentHomeworkResultsSectionProps = {
  classId: string;
  studentId: string;
  studentName: string;
  levelName: string;
  courseType: string;
  classDays: string;
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

function formatAverage(value: number | null) {
  if (value === null) return "-";

  return `${Math.round(value * 10) / 10}%`;
}

function average(values: number[]) {
  if (values.length === 0) return null;

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function formatDateOnly(value: string | null | undefined) {
  if (!value) return "-";

  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);

  if (!match) return value;

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
  if (!title) return null;

  const match = /week\s+(\d+)/i.exec(title);

  return match ? Number(match[1]) : null;
}

function getResultWeekNumber(result: any) {
  const storedWeek = Number(result?.week_number);

  if (Number.isFinite(storedWeek) && storedWeek > 0) {
    return storedWeek;
  }

  return getWeekFromTitle(result?.title);
}

function getSkillSortValue(value: string | null | undefined) {
  const skill = String(value || "").trim().toLowerCase();
  const order = ["reading", "listening", "writing"];
  const index = order.indexOf(skill);

  return index === -1 ? order.length : index;
}

function comparePracticeResults(first: any, second: any) {
  const firstWeek = getResultWeekNumber(first) ?? Number.MAX_SAFE_INTEGER;
  const secondWeek = getResultWeekNumber(second) ?? Number.MAX_SAFE_INTEGER;

  if (firstWeek !== secondWeek) {
    return firstWeek - secondWeek;
  }

  const skillDifference =
    getSkillSortValue(first?.skill || first?.homework_skill) -
    getSkillSortValue(second?.skill || second?.homework_skill);

  if (skillDifference !== 0) {
    return skillDifference;
  }

  const titleDifference = String(first?.title || "").localeCompare(
    String(second?.title || "")
  );

  if (titleDifference !== 0) {
    return titleDifference;
  }

  return String(first?.id || "").localeCompare(String(second?.id || ""));
}

function ProgressBar({ value }: { value: any }) {
  const number = toNumber(value);
  const width = number === null ? 0 : Math.max(0, Math.min(100, number));

  return (
    <div className="student-workspace-progress-track">
      <div
        className="student-workspace-progress-fill"
        style={{ width: `${width}%` }}
      />
    </div>
  );
}

export default function StudentHomeworkResultsSection({
  classId,
  studentId,
  studentName,
  levelName,
  courseType,
  classDays,
  teacherId = "",
}: StudentHomeworkResultsSectionProps) {
  const [results, setResults] = useState<any[]>([]);
  const [homework, setHomework] = useState<any[]>([]);
  const [loadingResults, setLoadingResults] = useState(false);
  const [loadingHomework, setLoadingHomework] = useState(false);
  const [resultsLoadFailed, setResultsLoadFailed] = useState(false);
  const [weekNumber, setWeekNumber] = useState("1");
  const [skill, setSkill] = useState("reading");
  const [percentage, setPercentage] = useState("");
  const [editingPracticeId, setEditingPracticeId] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const readingLabel = getCambridgeReadingSkillLabel(levelName);
  const skillOptions = [
    { value: "reading", label: readingLabel },
    { value: "listening", label: "Listening" },
    { value: "writing", label: "Writing" },
  ];

  const practiceResults = useMemo(
    () =>
      results
        .filter((result) => result.result_type === "homework")
        .sort(comparePracticeResults),
    [results]
  );

  const homeworkStats = useMemo(() => {
    function getSkillValues(skillName: string) {
      return practiceResults
        .filter((result) => result.skill === skillName)
        .map((result) => toNumber(result.percentage))
        .filter((value): value is number => value !== null);
    }

    const readingValues = getSkillValues("reading");
    const listeningValues = getSkillValues("listening");
    const writingValues = getSkillValues("writing");
    const allValues = practiceResults
      .map((result) => toNumber(result.percentage))
      .filter((value): value is number => value !== null);

    return {
      reading: average(readingValues),
      listening: average(listeningValues),
      writing: average(writingValues),
      overall: average(allValues),
    };
  }, [practiceResults]);

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

  async function loadResults() {
    if (!classId || !studentId) {
      setResults([]);
      setResultsLoadFailed(false);
      return;
    }

    setLoadingResults(true);
    setErrorMessage("");
    setResultsLoadFailed(false);

    const { data, error } = await supabase
      .from("results")
      .select("*")
      .eq("class_id", classId)
      .eq("student_id", studentId);

    if (error) {
      console.error("Failed to load homework results", error);
      setResults([]);
      setResultsLoadFailed(true);
      setErrorMessage("Unable to load homework results.");
      setLoadingResults(false);
      return;
    }

    setResults(data || []);
    setResultsLoadFailed(false);
    setLoadingResults(false);
  }

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
      console.error("Unable to load homework metadata:", error);
      setHomework([]);
    } finally {
      setLoadingHomework(false);
    }
  }

  useEffect(() => {
    loadResults();
  }, [classId, studentId]);

  useEffect(() => {
    loadHomework();
  }, [levelName, courseType, classDays]);

  function clearForm() {
    setWeekNumber("1");
    setSkill("reading");
    setPercentage("");
    setEditingPracticeId("");
  }

  async function getSafeTeacherId() {
    if (teacherId) return teacherId;

    const {
      data: { session },
    } = await supabase.auth.getSession();

    return session?.user.id || null;
  }

  async function savePracticeResult() {
    const score = toNumber(percentage);

    setMessage("");
    setErrorMessage("");

    if (resultsLoadFailed) {
      setErrorMessage(
        "Results cannot be saved until the existing records load successfully."
      );
      return;
    }

    if (score === null) {
      setErrorMessage("Enter a valid percentage.");
      return;
    }

    setSaving(true);

    const currentTeacherId = await getSafeTeacherId();
    const payload: any = {
      student_id: studentId,
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
      ? await supabase.from("results").update(payload).eq("id", editingPracticeId)
      : await supabase.from("results").insert([payload]);

    if (error) {
      console.error("Unable to save homework result:", error);
      setErrorMessage(error.message);
      setSaving(false);
      return;
    }

    setMessage(
      editingPracticeId ? "Practice result updated." : "Practice result saved."
    );
    clearForm();
    setSaving(false);
    await loadResults();
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

  async function deletePracticeResult(id: string) {
    const confirmed = confirm("Delete this practice result?");

    if (!confirmed) return;

    setMessage("");
    setErrorMessage("");

    const { error } = await supabase.from("results").delete().eq("id", id);

    if (error) {
      console.error("Unable to delete homework result:", error);
      setErrorMessage(error.message);
      return;
    }

    setMessage("Practice result deleted.");
    await loadResults();
  }

  function skillLabel(value: string | null | undefined) {
    return (
      skillOptions.find((option) => option.value === value)?.label || "Practice"
    );
  }

  return (
    <section className="student-workspace-section">
      <div className="student-workspace-section-header">
        <h3>Homework Results</h3>
        <p>Enter and review weekly practice results for {studentName}.</p>
      </div>

      {message && (
        <div className="student-workspace-success" role="status">
          {message}
        </div>
      )}

      {errorMessage && (
        <div className="student-workspace-error" role="alert">
          {errorMessage}
        </div>
      )}

      <div className="student-workspace-stat-grid">
        <div>
          <span>{readingLabel}</span>
          <strong>{formatAverage(homeworkStats.reading)}</strong>
        </div>
        <div>
          <span>Listening</span>
          <strong>{formatAverage(homeworkStats.listening)}</strong>
        </div>
        <div>
          <span>Writing</span>
          <strong>{formatAverage(homeworkStats.writing)}</strong>
        </div>
        <div>
          <span>Overall</span>
          <strong>{formatAverage(homeworkStats.overall)}</strong>
        </div>
      </div>

      <div className="student-workspace-form-card">
        {resultsLoadFailed && (
          <p className="student-workspace-muted">
            Results cannot be saved until the existing records load successfully.
          </p>
        )}

        <div className="student-workspace-form-grid">
          <label className="student-workspace-field">
            <span>Week number</span>
            <input
              type="number"
              min={1}
              value={weekNumber}
              onChange={(event) => setWeekNumber(event.target.value)}
            />
          </label>

          <label className="student-workspace-field">
            <span>Skill</span>
            <select value={skill} onChange={(event) => setSkill(event.target.value)}>
              {skillOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="student-workspace-field">
            <span>Percentage</span>
            <input
              type="number"
              min={0}
              max={100}
              value={percentage}
              onChange={(event) => setPercentage(event.target.value)}
            />
          </label>
        </div>

        <div className="student-workspace-actions">
          <button
            type="button"
            className="student-workspace-primary-button"
            onClick={savePracticeResult}
            disabled={saving || resultsLoadFailed}
          >
            {saving
              ? "Saving..."
              : editingPracticeId
              ? "Save Changes"
              : "Save Result"}
          </button>

          {editingPracticeId && (
            <button
              type="button"
              className="student-workspace-secondary-button"
              onClick={clearForm}
            >
              Cancel
            </button>
          )}
        </div>
      </div>

      <div className="student-workspace-list">
        <h4>Previous Practice Results</h4>

        {loadingResults ? (
          <p className="student-workspace-muted">Loading results...</p>
        ) : practiceResults.length === 0 ? (
          <p className="student-workspace-muted">No practice results yet.</p>
        ) : (
          practiceResults.map((result) => (
            <article className="student-workspace-item" key={result.id}>
              <div className="student-workspace-result-row">
                <div>
                  <strong>{result.title || "Homework Result"}</strong>
                  <span>{skillLabel(result.skill)}</span>
                </div>
                <div>
                  <strong>{formatPercent(result.percentage)}</strong>
                  <ProgressBar value={result.percentage} />
                </div>
              </div>

              <div className="student-workspace-actions is-compact">
                <button
                  type="button"
                  className="student-workspace-secondary-button"
                  onClick={() => editPractice(result)}
                >
                  Edit
                </button>
                <button
                  type="button"
                  className="student-workspace-danger-button"
                  onClick={() => deletePracticeResult(result.id)}
                >
                  Delete
                </button>
              </div>
            </article>
          ))
        )}
      </div>

      <div className="student-workspace-list">
        <h4>Outstanding Homework</h4>

        {loadingHomework ? (
          <p className="student-workspace-muted">Loading homework...</p>
        ) : outstandingHomework.length === 0 ? (
          <p className="student-workspace-muted">No outstanding homework.</p>
        ) : (
          outstandingHomework.map((item) => (
            <article className="student-workspace-item" key={item.id}>
              <div className="student-workspace-result-row">
                <div>
                  <strong>{item.title || `Week ${item.week_number}`}</strong>
                  <span>
                    {item.homework_skill ? skillLabel(item.homework_skill) : "Homework"}
                  </span>
                </div>
                <span>Due {formatDateOnly(item.due_date)}</span>
              </div>
            </article>
          ))
        )}
      </div>
    </section>
  );
}
