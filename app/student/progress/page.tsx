"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import StudentMenu from "../StudentMenu";
import {
  getCambridgeReadingSkillLabel,
  getHomeworkReleaseMetadata,
  normalizeHomeworkSkill,
} from "../../../lib/homework";
import {
  getEmptyFridayTutorialProgressSummary,
  getEligibleProgressHomeworkResults,
  getStudentFridayTutorialProgress,
  getStudentResults,
  toResultNumber,
} from "../../../lib/progress";
import {
  getCurrentStudentCourseInfo,
  getCurrentUser,
} from "../../../lib/user";
import type { FridayTutorialProgressSummary } from "../../../lib/fridayTutorialResults";

function average(values: number[]) {
  if (values.length === 0) {
    return null;
  }

  return values.reduce((total, value) => total + value, 0) / values.length;
}

function formatPercent(value: number | null) {
  if (value === null) return "-";

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

function getTargetForLevel(level: string) {
  const normalizedLevel = String(level ?? "").trim().toUpperCase();

  return normalizedLevel === "B1" ? 70 : 60;
}

function clampPercent(value: number) {
  return Math.max(0, Math.min(100, value));
}

function getPerformanceStatus(value: number | null, target: number) {
  if (value === null) {
    return {
      key: "empty",
      label: "Not started yet",
    };
  }

  if (value >= 90) {
    return {
      key: "excellent",
      label: "Excellent",
    };
  }

  if (value >= target + 15) {
    return {
      key: "strong",
      label: "Strong",
    };
  }

  if (value >= target) {
    return {
      key: "on-track",
      label: "On track",
    };
  }

  if (value >= target - 10) {
    return {
      key: "getting-close",
      label: "Getting close",
    };
  }

  return {
    key: "building",
    label: "Building",
  };
}

function getNextGoalText(value: number | null, target: number) {
  if (value === null) {
    return "Your progress will appear after your first graded task.";
  }

  if (value >= 100) {
    return "Outstanding - maximum score achieved.";
  }

  if (value >= 90) {
    return "Excellent work - keep the momentum going.";
  }

  if (value >= target) {
    const pointsToExcellent = Math.max(0, Math.ceil(90 - value));

    return pointsToExcellent === 1
      ? "Target achieved ✓ · 1 point to 90%"
      : `Target achieved ✓ · ${pointsToExcellent} points to 90%`;
  }

  const pointsToTarget = Math.max(0, Math.ceil(target - value));

  return pointsToTarget <= 2
    ? `Almost there - ${pointsToTarget} point${
        pointsToTarget === 1 ? "" : "s"
      } to your target`
    : `${pointsToTarget} points to the ${target}% target`;
}

function getAttendanceStatus(value: number | null) {
  if (value === null) {
    return {
      key: "empty",
      label: "Attendance waiting to start",
    };
  }

  if (value === 100) {
    return {
      key: "perfect",
      label: "Perfect attendance",
    };
  }

  if (value >= 90) {
    return {
      key: "excellent",
      label: "Excellent consistency",
    };
  }

  if (value >= 75) {
    return {
      key: "strong",
      label: "Strong attendance",
    };
  }

  if (value >= 60) {
    return {
      key: "building",
      label: "Building consistency",
    };
  }

  return {
    key: "focus",
    label: "Keep building your attendance",
  };
}

function PerformanceBadge({
  status,
}: {
  status: ReturnType<typeof getPerformanceStatus>;
}) {
  return (
    <span className={`student-progress-status-pill is-${status.key}`}>
      {status.label}
    </span>
  );
}

function ProgressJourney({
  value,
  target,
  label,
  large = false,
}: {
  value: number | null;
  target: number;
  label: string;
  large?: boolean;
}) {
  const width = value === null ? 0 : clampPercent(value);
  const targetPosition = clampPercent(target);
  const status = getPerformanceStatus(value, target);
  const valueText = value === null ? "Not started yet" : `${Math.round(value)}%`;

  return (
    <div
      className={`student-progress-journey is-${status.key} ${
        large ? "is-large" : ""
      }`}
      role="meter"
      aria-label={`${label}: ${valueText}; target ${target}%`}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(width)}
      aria-valuetext={`${valueText}; target ${target}%`}
    >
      <div className="student-progress-journey-track">
        <div
          className="student-progress-journey-fill"
          style={{ width: `${width}%` }}
        />
        {value !== null && (
          <span
            className="student-progress-journey-dot"
            style={{ left: `${width}%` }}
            aria-hidden="true"
          />
        )}
        <span
          className="student-progress-journey-target"
          style={{ left: `${targetPosition}%` }}
          aria-hidden="true"
        />
      </div>
      <div className="student-progress-journey-labels" aria-hidden="true">
        <span>0</span>
        <span
          className="student-progress-journey-target-label"
          style={{ left: `${targetPosition}%` }}
        >
          Target {target}%
        </span>
        <span>100</span>
      </div>
    </div>
  );
}

function AverageCard({
  label,
  value,
  count,
  target,
  featured = false,
}: {
  label: string;
  value: number | null;
  count: number;
  target: number;
  featured?: boolean;
}) {
  const hasResults = count > 0 && value !== null;
  const status = getPerformanceStatus(hasResults ? value : null, target);

  return (
    <article
      className={`student-progress-average-card is-${status.key} ${
        featured ? "is-featured" : ""
      }`}
      aria-label={label}
    >
      <div className="student-progress-card-heading">
        <h3>{label}</h3>
        <PerformanceBadge status={status} />
      </div>

      <div
        className={`student-progress-average-value ${
          hasResults ? "" : "is-empty"
        }`}
      >
        {hasResults ? formatPercent(value) : "Not started yet"}
      </div>

      <ProgressJourney
        value={hasResults ? value : null}
        target={target}
        label={label}
        large={featured}
      />

      <p className="student-progress-next-goal">
        {hasResults
          ? getNextGoalText(value, target)
          : "Your progress will appear after your first graded task."}
      </p>

      <p className="student-progress-task-count">
        {hasResults ? getTaskLabel(count) : "0 graded tasks so far"}
      </p>
    </article>
  );
}

function FridayTutorialProgressSection({
  summary,
  target,
}: {
  summary: FridayTutorialProgressSummary;
  target: number;
}) {
  const attendance = summary.attendance;
  const attendanceStatus = getAttendanceStatus(attendance.attendance_percentage);
  const attendanceDegrees =
    attendance.attendance_percentage === null
      ? 0
      : clampPercent(attendance.attendance_percentage) * 3.6;

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
            <div
              className={`student-progress-attendance-ring is-${attendanceStatus.key}`}
              style={{
                background: `conic-gradient(var(--attendance-accent) ${attendanceDegrees}deg, #eef2f7 0deg)`,
              }}
              aria-label={`Attendance ${formatTutorialPercent(
                attendance.attendance_percentage
              )}`}
            >
              <div>
                <strong>
                  {formatTutorialPercent(attendance.attendance_percentage)}
                </strong>
                <span>{attendanceStatus.label}</span>
              </div>
            </div>
            <p>
              {attendance.attended_count} of {attendance.eligible_count} tutorials
              attended
            </p>
          </article>

          <div className="student-progress-friday-panel">
            <h3>Average Results by Skill & Part</h3>
            {summary.averages.length === 0 ? (
              <p>No scored tutorial attempts yet.</p>
            ) : (
              <div className="student-progress-friday-average-list">
                {summary.averages.map((item) => {
                  const status = getPerformanceStatus(item.average, target);
                  const label = item.practice_label || "Tutorial practice";

                  return (
                    <div
                      className={`student-progress-friday-average-item is-${status.key}`}
                      key={item.practice_key}
                    >
                      <div className="student-progress-score-row">
                        <div>
                          <span>{label}</span>
                          <small>
                            {item.count} attempt{item.count === 1 ? "" : "s"}
                          </small>
                        </div>
                        <div>
                          <strong>{formatTutorialPercent(item.average)}</strong>
                          <PerformanceBadge status={status} />
                        </div>
                      </div>

                      <ProgressJourney
                        value={item.average}
                        target={target}
                        label={label}
                      />

                      <p className="student-progress-next-goal">
                        {getNextGoalText(item.average, target)}
                      </p>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="student-progress-friday-panel">
            <h3>Last 3 Tutorials</h3>
            <div className="student-progress-friday-recent-list">
              {summary.recent.map((item) => (
                <div
                  className="student-progress-tutorial-timeline-item"
                  key={`${item.result_sheet_id}-${item.result_id}`}
                >
                  <span
                    className={`student-progress-tutorial-dot ${
                      item.attended ? "is-attended" : "is-absent"
                    }`}
                    aria-hidden="true"
                  />
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
  const [homeworkReleaseMetadata, setHomeworkReleaseMetadata] = useState<any[]>(
    []
  );
  const [fridayTutorialProgress, setFridayTutorialProgress] =
    useState<FridayTutorialProgressSummary>(() =>
      getEmptyFridayTutorialProgressSummary()
    );
  const [level, setLevel] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const readingLabel = getCambridgeReadingSkillLabel(level);
  const levelTarget = getTargetForLevel(level);

  const eligibleHomeworkResults = useMemo(
    () => getEligibleProgressHomeworkResults(results, homeworkReleaseMetadata),
    [results, homeworkReleaseMetadata]
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
      const [studentResults, homeworkMetadata] = await Promise.all([
        getStudentResults(user.id),
        getHomeworkReleaseMetadata(
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
      setHomeworkReleaseMetadata(homeworkMetadata);
      setFridayTutorialProgress(tutorialProgress);
    } catch (loadError) {
      console.error(loadError);
      setError(true);
      setResults([]);
      setHomeworkReleaseMetadata([]);
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
    const status = getPerformanceStatus(value, levelTarget);

    return (
      <div className={`student-progress-mock-skill is-${status.key}`}>
        <div className="student-progress-score-row">
          <div>
            <span>{label}</span>
          </div>
          <div>
            <strong>{formatMockPercent(value)}</strong>
            <PerformanceBadge status={status} />
          </div>
        </div>

        <ProgressJourney value={value} target={levelTarget} label={label} />
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
          <div>
            <span className="student-progress-kicker">
              {level ? `${level} progress` : "Cambridge progress"}
            </span>
            <h1>Student Progress</h1>
            <p>
              Track your homework, Friday tutorials and mock exam progress
              {level
                ? ` against your ${levelTarget}% target.`
                : " as soon as your course loads."}
            </p>
          </div>

          <div className="student-progress-target-card">
            <span>Target</span>
            <strong>{level ? `${levelTarget}%` : "-"}</strong>
          </div>
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
                <div>
                  <h2 id="student-homework-averages-title">
                    Homework Averages
                  </h2>
                  <p>
                    Teacher-entered homework results are included after their
                    matching homework release date.
                  </p>
                </div>
                <span className="student-progress-section-target">
                  Target {levelTarget}%
                </span>
              </div>

              <div className="student-progress-average-grid">
                <div className="student-progress-skill-grid">
                  <AverageCard
                    label={`${readingLabel} Average`}
                    value={homeworkStats.reading.average}
                    count={homeworkStats.reading.count}
                    target={levelTarget}
                  />
                  <AverageCard
                    label="Listening Average"
                    value={homeworkStats.listening.average}
                    count={homeworkStats.listening.count}
                    target={levelTarget}
                  />
                  <AverageCard
                    label="Writing Average"
                    value={homeworkStats.writing.average}
                    count={homeworkStats.writing.count}
                    target={levelTarget}
                  />
                </div>

                <div className="student-progress-overall-wrap">
                  <AverageCard
                    label="Overall Homework Progress"
                    value={homeworkStats.overall.average}
                    count={homeworkStats.overall.count}
                    target={levelTarget}
                    featured
                  />
                </div>
              </div>
            </section>

            <FridayTutorialProgressSection
              summary={fridayTutorialProgress}
              target={levelTarget}
            />

            <section className="student-progress-mock-section">
              <div className="student-progress-section-header">
                <div>
                  <h2>Mock Exam Progress</h2>
                  <p>
                    Mock exam results remain separate from homework averages.
                  </p>
                </div>
                <span className="student-progress-section-target">
                  Target {levelTarget}%
                </span>
              </div>

              {mockResults.length === 0 ? (
                <div className="student-progress-empty-card">
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
                    const mockAverageStatus = getPerformanceStatus(
                      mockAverage,
                      levelTarget
                    );

                    return (
                      <article
                        className="student-progress-mock-card"
                        key={result.id}
                      >
                        <div className="student-progress-mock-card-header">
                          <h3>{getMockTitle(result)}</h3>
                        </div>

                        <div className="student-progress-mock-skill-list">
                          {renderMockSkill(readingLabel, reading)}
                          {renderMockSkill("Writing", writing)}
                          {renderMockSkill("Listening", listening)}
                          {renderMockSkill("Speaking", speaking)}

                          <div className="student-progress-mock-average">
                            <div className="student-progress-score-row">
                              <div>
                                <span>Average</span>
                              </div>
                              <div>
                                <strong>{formatMockPercent(mockAverage)}</strong>
                                <PerformanceBadge status={mockAverageStatus} />
                              </div>
                            </div>

                            <ProgressJourney
                              value={mockAverage}
                              target={levelTarget}
                              label={`${getMockTitle(result)} average`}
                              large
                            />
                            <p className="student-progress-next-goal">
                              {getNextGoalText(mockAverage, levelTarget)}
                            </p>
                          </div>
                        </div>

                        {result.comments && (
                          <p className="student-progress-mock-comment">
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
