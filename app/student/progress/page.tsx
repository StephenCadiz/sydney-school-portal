"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import StudentMenu from "../StudentMenu";
import {
  getCambridgeReadingSkillLabel,
  getReleasedStudentHomework,
  normalizeHomeworkSkill,
} from "../../../lib/homework";
import {
  getEmptyFridayTutorialProgressSummary,
  getEligibleHomeworkResults,
  getStudentFridayTutorialProgress,
  getStudentResults,
  toResultNumber,
} from "../../../lib/progress";
import {
  getCurrentStudentCourseInfo,
  getCurrentUser,
} from "../../../lib/user";
import type { FridayTutorialProgressSummary } from "../../../lib/fridayTutorialResults";

const cardStyle = {
  background: "#ffffff",
  border: "1px solid #e6eaf2",
  borderRadius: "14px",
  padding: "22px",
  boxShadow: "0 6px 18px rgba(31,60,136,0.06)",
};

function average(values: number[]) {
  if (values.length === 0) {
    return null;
  }

  return values.reduce((total, value) => total + value, 0) / values.length;
}

function formatPercent(value: number | null) {
  if (value === null) return "No graded homework yet";

  return `${Math.round(value)}%`;
}

function formatMockPercent(value: number | null) {
  if (value === null) return "-";

  return `${Math.round(value)}%`;
}

function formatTutorialPercent(value: number | null) {
  if (value === null) return "-";

  const rounded = Math.round(value * 10) / 10;

  return `${Number.isInteger(rounded) ? rounded : rounded.toFixed(1)}%`;
}

function formatTutorialDate(value: string | null | undefined) {
  if (!value) {
    return "Date not available";
  }

  const [year, month, day] = String(value).split("-").map(Number);
  const date =
    Number.isFinite(year) && Number.isFinite(month) && Number.isFinite(day)
      ? new Date(Date.UTC(year, month - 1, day, 12, 0, 0))
      : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Date not available";
  }

  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Europe/Madrid",
  }).format(date);
}

function getTaskLabel(count: number) {
  return `Based on ${count} graded homework task${count === 1 ? "" : "s"}`;
}

function ProgressBar({
  value,
  strong = false,
}: {
  value: number | null;
  strong?: boolean;
}) {
  const width = value === null ? 0 : Math.max(0, Math.min(100, value));

  return (
    <div className="student-progress-bar">
      <div
        style={{
          width: `${width}%`,
          background: strong ? "#1f3c88" : "#5f7dcc",
        }}
      />
    </div>
  );
}

function AverageCard({
  label,
  value,
  count,
  strong = false,
}: {
  label: string;
  value: number | null;
  count: number;
  strong?: boolean;
}) {
  const hasResults = count > 0 && value !== null;

  return (
    <article
      className={`student-progress-average-card ${strong ? "is-strong" : ""}`}
      aria-label={label}
    >
      <h3>{label}</h3>

      <div
        className={`student-progress-average-value ${
          hasResults ? "" : "is-empty"
        }`}
      >
        {formatPercent(value)}
      </div>

      <p>
        {hasResults
          ? getTaskLabel(count)
          : "Results will appear after released homework is graded."}
      </p>

      <ProgressBar value={value} strong={strong} />
    </article>
  );
}

function FridayTutorialProgressSection({
  summary,
}: {
  summary: FridayTutorialProgressSummary;
}) {
  const attendance = summary.attendance;

  return (
    <section
      className="student-progress-friday-section"
      aria-labelledby="student-friday-tutorial-progress-title"
    >
      <div className="student-progress-section-header">
        <div>
          <h2 id="student-friday-tutorial-progress-title">
            Friday Tutorial Progress
          </h2>
          <p>
            Submitted Friday @ 6 tutorial results are shown here once your
            teacher saves the class sheet.
          </p>
        </div>
      </div>

      {!summary.has_results ? (
        <div className="student-progress-friday-empty">
          No Friday tutorial results are available yet.
        </div>
      ) : (
        <div className="student-progress-friday-content">
          <article className="student-progress-friday-attendance">
            <h3>Attendance</h3>
            <strong>
              {attendance.attended_count} of {attendance.eligible_count} tutorials
              attended
            </strong>
            <p>
              {attendance.attendance_percentage === null
                ? "Attendance will appear after results are submitted."
                : formatTutorialPercent(attendance.attendance_percentage)}
            </p>
            <ProgressBar value={attendance.attendance_percentage} strong />
          </article>

          <div className="student-progress-friday-panel">
            <h3>Average Results by Skill & Part</h3>
            {summary.averages.length === 0 ? (
              <p>No scored tutorial attempts yet.</p>
            ) : (
              <div className="student-progress-friday-average-list">
                {summary.averages.map((item) => (
                  <div key={item.practice_key}>
                    <span>{item.practice_label || "Tutorial practice"}</span>
                    <strong>{formatTutorialPercent(item.average)}</strong>
                    <small>
                      {item.count} attempt{item.count === 1 ? "" : "s"}
                    </small>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="student-progress-friday-panel">
            <h3>Last 3 Tutorials</h3>
            <div className="student-progress-friday-recent-list">
              {summary.recent.map((item) => (
                <div key={`${item.result_sheet_id}-${item.result_id}`}>
                  <div>
                    <strong>{formatTutorialDate(item.session_date)}</strong>
                    <span>{item.practice_label || item.activity_type}</span>
                  </div>
                  <span
                    className={`student-progress-friday-result ${
                      item.attended ? "is-attended" : "is-absent"
                    }`}
                  >
                    {item.attended
                      ? formatTutorialPercent(item.percentage)
                      : "Absent"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

export default function ProgressPage() {
  const [results, setResults] = useState<any[]>([]);
  const [releasedHomework, setReleasedHomework] = useState<any[]>([]);
  const [fridayTutorialProgress, setFridayTutorialProgress] =
    useState<FridayTutorialProgressSummary>(() =>
      getEmptyFridayTutorialProgressSummary()
    );
  const [level, setLevel] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const readingLabel = getCambridgeReadingSkillLabel(level);

  const eligibleHomeworkResults = useMemo(
    () => getEligibleHomeworkResults(results, releasedHomework),
    [results, releasedHomework]
  );

  const mockResults = results.filter(
    (result) => result.result_type === "mock"
  );

  const homeworkStats = useMemo(() => {
    function getSkillValues(skill: string) {
      return eligibleHomeworkResults
        .filter((result) => normalizeHomeworkSkill(result.skill) === skill)
        .map((result) => toResultNumber(result.percentage))
        .filter((value): value is number => value !== null);
    }

    const readingValues = getSkillValues("reading");
    const listeningValues = getSkillValues("listening");
    const writingValues = getSkillValues("writing");
    const overallValues = eligibleHomeworkResults
      .map((result) => toResultNumber(result.percentage))
      .filter((value): value is number => value !== null);

    return {
      reading: {
        average: average(readingValues),
        count: readingValues.length,
      },
      listening: {
        average: average(listeningValues),
        count: listeningValues.length,
      },
      writing: {
        average: average(writingValues),
        count: writingValues.length,
      },
      overall: {
        average: average(overallValues),
        count: overallValues.length,
      },
    };
  }, [eligibleHomeworkResults]);

  const loadProgress = useCallback(async () => {
    setLoading(true);
    setError(false);

    try {
      const user = await getCurrentUser();
      const courseInfo = await getCurrentStudentCourseInfo();
      const [studentResults, homeworkItems] = await Promise.all([
        getStudentResults(user.id),
        getReleasedStudentHomework(
          courseInfo.level,
          courseInfo.courseType,
          courseInfo.classroom.days
        ),
      ]);
      let tutorialProgress = getEmptyFridayTutorialProgressSummary();

      try {
        tutorialProgress = await getStudentFridayTutorialProgress();
      } catch (tutorialError) {
        console.error(tutorialError);
      }

      setLevel(courseInfo.level);
      setResults(studentResults);
      setReleasedHomework(homeworkItems);
      setFridayTutorialProgress(tutorialProgress);
    } catch (loadError) {
      console.error(loadError);
      setError(true);
      setResults([]);
      setReleasedHomework([]);
      setFridayTutorialProgress(getEmptyFridayTutorialProgressSummary());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProgress();
  }, [loadProgress]);

  function getMockAverage(result: any) {
    const reading = toResultNumber(result.reading);
    const writing = toResultNumber(result.writing);
    const listening = toResultNumber(result.listening);
    const speaking = toResultNumber(result.speaking);

    if (
      reading !== null &&
      writing !== null &&
      listening !== null &&
      speaking !== null
    ) {
      return average([reading, writing, listening, speaking]);
    }

    return toResultNumber(result.overall);
  }

  function getMockTitle(result: any) {
    if (result.mock_number) {
      return `Mock Exam ${result.mock_number}`;
    }

    return result.title || "Mock Exam";
  }

  function renderMockSkill(label: string, value: number | null) {
    return (
      <div className="student-progress-mock-skill">
        <div>
          <span>{label}</span>
          <strong>{formatMockPercent(value)}</strong>
        </div>

        <ProgressBar value={value} />
      </div>
    );
  }

  return (
    <div className="student-layout-shell">
      <div className="student-mobile-topbar">
        <div className="student-mobile-topbar-title">Sydney School / Student</div>
        <button
          type="button"
          className="mobile-menu-button"
          aria-label="Open student menu"
          onClick={() => setMenuOpen(true)}
        >
          Menu
        </button>
      </div>

      {menuOpen && (
        <button
          type="button"
          aria-label="Close student menu"
          className="student-mobile-drawer-overlay"
          onClick={() => setMenuOpen(false)}
        />
      )}

      <div className={`student-mobile-drawer ${menuOpen ? "open" : ""}`}>
        <button
          type="button"
          className="student-mobile-drawer-close"
          onClick={() => setMenuOpen(false)}
        >
          Close
        </button>
        <StudentMenu mobileMode onClose={() => setMenuOpen(false)} />
      </div>

      <aside className="student-desktop-sidebar">
        <StudentMenu />
      </aside>

      <main className="student-main-content student-progress-page">
        <header className="student-progress-header">
          <h1>Student Progress</h1>
          <p>Track your homework averages and mock exam progress.</p>
        </header>

        {loading && (
          <div className="student-progress-state" role="status" aria-live="polite">
            Loading progress...
          </div>
        )}

        {!loading && error && (
          <div className="student-progress-state is-error" role="alert">
            <p>Unable to load progress.</p>
            <button type="button" onClick={loadProgress}>
              Retry
            </button>
          </div>
        )}

        {!loading && !error && (
          <>
            <section
              className="student-progress-homework-averages"
              aria-labelledby="student-homework-averages-title"
            >
              <div className="student-progress-section-header">
                <h2 id="student-homework-averages-title">Homework Averages</h2>
                <p>
                  Only released homework with entered teacher results is
                  included.
                </p>
              </div>

              <div className="student-progress-average-grid">
                <AverageCard
                  label={`${readingLabel} Average`}
                  value={homeworkStats.reading.average}
                  count={homeworkStats.reading.count}
                />
                <AverageCard
                  label="Listening Average"
                  value={homeworkStats.listening.average}
                  count={homeworkStats.listening.count}
                />
                <AverageCard
                  label="Writing Average"
                  value={homeworkStats.writing.average}
                  count={homeworkStats.writing.count}
                />
                <AverageCard
                  label="Overall Homework Average"
                  value={homeworkStats.overall.average}
                  count={homeworkStats.overall.count}
                  strong
                />
              </div>
            </section>

            <FridayTutorialProgressSection summary={fridayTutorialProgress} />

            <section className="student-progress-mock-section">
              <div className="student-progress-section-header">
                <h2>Mock Exam Progress</h2>
                <p>Mock exam results remain separate from homework averages.</p>
              </div>

              {mockResults.length === 0 ? (
                <div style={cardStyle}>
                  <p style={{ margin: 0 }}>No mock exam results yet.</p>
                </div>
              ) : (
                <div className="student-progress-mock-grid">
                  {mockResults.map((result) => {
                    const reading = toResultNumber(result.reading);
                    const writing = toResultNumber(result.writing);
                    const listening = toResultNumber(result.listening);
                    const speaking = toResultNumber(result.speaking);
                    const mockAverage = getMockAverage(result);

                    return (
                      <article key={result.id} style={cardStyle}>
                        <h3
                          style={{
                            color: "#1f3c88",
                            margin: "0 0 16px",
                            fontSize: "19px",
                          }}
                        >
                          {getMockTitle(result)}
                        </h3>

                        <div
                          style={{
                            display: "grid",
                            gap: "13px",
                          }}
                        >
                          {renderMockSkill(readingLabel, reading)}
                          {renderMockSkill("Writing", writing)}
                          {renderMockSkill("Listening", listening)}
                          {renderMockSkill("Speaking", speaking)}

                          <div
                            style={{
                              borderTop: "1px solid #eef2f7",
                              paddingTop: "13px",
                              display: "grid",
                              gap: "8px",
                            }}
                          >
                            <div
                              style={{
                                display: "flex",
                                justifyContent: "space-between",
                                color: "#1f3c88",
                                fontWeight: 800,
                              }}
                            >
                              <span>Average</span>
                              <span>{formatMockPercent(mockAverage)}</span>
                            </div>

                            <ProgressBar value={mockAverage} strong />
                          </div>
                        </div>

                        {result.comments && (
                          <p
                            style={{
                              color: "#667085",
                              margin: "16px 0 0",
                              lineHeight: 1.55,
                              fontSize: "14px",
                            }}
                          >
                            {result.comments}
                          </p>
                        )}
                      </article>
                    );
                  })}
                </div>
              )}
            </section>
          </>
        )}
      </main>
    </div>
  );
}
