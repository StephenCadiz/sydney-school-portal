"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import TeacherLayout from "../../components/layout/TeacherLayout";
import { supabase } from "../../../lib/supabase";

type ViewMode = "class" | "level";

type ClassOption = {
  id: string;
  class_name: string;
  level_id: string;
  level_name: string;
  is_cambridge: boolean;
  course_type: string;
  days: string;
  start_time: string;
  end_time: string;
};

type LevelOption = { id: string; name: string; is_cambridge: boolean };

type Aggregate = {
  average: number | null;
  result_count: number;
  student_count: number;
  suppressed: boolean;
};

type Analytics = {
  view: ViewMode;
  type: "cambridge" | "young_learner";
  context: ClassOption & {
    student_count: number;
    class_count?: number;
  };
  target?: number | null;
  homework?: {
    overall: Aggregate;
    skills: Array<Aggregate & { skill: string; label: string }>;
    weeks: Array<
      Aggregate & {
        week: number;
        skill: string;
        label: string;
        coverage_count: number;
        coverage_total: number;
        coverage_percentage: number | null;
      }
    >;
  };
  class_comparison?: Array<
    Aggregate & {
      class_id: string;
      class_name: string;
      level_name: string;
      roster_count: number;
    }
  >;
  coverage_context?: string;
  message?: string;
};

function formatAverage(value: number | null) {
  if (value === null) return "No data";
  const rounded = Math.round(value * 10) / 10;
  return `${Number.isInteger(rounded) ? rounded : rounded.toFixed(1)}%`;
}

function formatTime(value: string) {
  return value ? value.slice(0, 5) : "";
}

function formatCourseType(value: string) {
  if (!value) return "";
  return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
}

function AverageText({ aggregate }: { aggregate: Aggregate }) {
  if (aggregate.suppressed) {
    return <span className="teacher-results-suppressed">Insufficient aggregate data</span>;
  }

  return <>{formatAverage(aggregate.average)}</>;
}

function TargetBar({ average, target }: { average: number | null; target: number }) {
  const averagePosition = average === null ? null : Math.max(0, Math.min(100, average));
  const difference = average === null ? null : average - target;

  return (
    <div className="teacher-results-target-block">
      <div
        className="teacher-results-target-bar"
        role="meter"
        aria-label={
          average === null
            ? `No aggregate average; target ${target}%`
            : `Homework average ${formatAverage(average)}; target ${target}%`
        }
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={average === null ? undefined : Math.round(average)}
      >
        <span
          className="teacher-results-target-fill"
          style={{ width: `${averagePosition || 0}%` }}
        />
        <span className="teacher-results-target-marker" style={{ left: `${target}%` }} />
        {averagePosition !== null && (
          <span className="teacher-results-score-marker" style={{ left: `${averagePosition}%` }} />
        )}
      </div>
      <div className="teacher-results-target-labels">
        <span>0</span>
        <span style={{ left: `${target}%` }}>Target {target}%</span>
        <span>100</span>
      </div>
      {difference !== null && (
        <div className={`teacher-results-target-status ${difference >= 0 ? "is-achieved" : "is-below"}`}>
          <strong>{difference >= 0 ? "Target achieved" : "Below target"}</strong>
          <span>
            {difference >= 0
              ? `${formatPoints(difference)} above the ${target}% target`
              : `${formatPoints(Math.abs(difference))} to the ${target}% target`}
          </span>
        </div>
      )}
    </div>
  );
}

function formatPoints(value: number) {
  const rounded = Math.round(value * 10) / 10;
  return `${Number.isInteger(rounded) ? rounded : rounded.toFixed(1)} point${rounded === 1 ? "" : "s"}`;
}

function Trend({ weeks }: { weeks: NonNullable<Analytics["homework"]>["weeks"] }) {
  const points = weeks.filter((week) => week.average !== null && !week.suppressed);

  if (points.length < 2) {
    return (
      <p className="teacher-results-muted">
        At least two non-suppressed chronological points are needed for a trend.
      </p>
    );
  }

  return (
    <div className="teacher-results-trend" aria-label="Homework average trend by week and skill">
      {points.map((point) => (
        <div
          className="teacher-results-trend-point"
          key={`${point.week}-${point.skill}`}
          title={`Week ${point.week}, ${point.label}: ${formatAverage(point.average)}, ${point.result_count} results`}
        >
          <strong>{formatAverage(point.average)}</strong>
          <div className="teacher-results-trend-column" aria-hidden="true">
            <span style={{ height: `${Math.max(4, point.average || 0)}%` }} />
          </div>
          <span>W{point.week}</span>
          <small>{point.label}</small>
        </div>
      ))}
    </div>
  );
}

export default function TeacherResultsPage() {
  const router = useRouter();
  const [view, setView] = useState<ViewMode>("class");
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [levels, setLevels] = useState<LevelOption[]>([]);
  const [selection, setSelection] = useState("");
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [loadingOptions, setLoadingOptions] = useState(true);
  const [loadingAnalytics, setLoadingAnalytics] = useState(false);
  const [error, setError] = useState("");

  async function authorizedFetch(url: string) {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;

    if (!token) {
      router.push("/login");
      throw new Error("Authentication required.");
    }

    const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    const payload = await response.json().catch(() => ({}));

    if (!response.ok) throw new Error(payload.error || "Unable to load results.");
    return payload;
  }

  useEffect(() => {
    let active = true;

    async function loadOptions() {
      setLoadingOptions(true);
      setError("");
      try {
        const payload = await authorizedFetch("/api/teacher/results?mode=options");
        if (active) {
          setClasses(payload.classes || []);
          setLevels(payload.levels || []);
        }
      } catch (loadError: any) {
        if (active) setError(loadError?.message || "Unable to load class options.");
      } finally {
        if (active) setLoadingOptions(false);
      }
    }

    loadOptions();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    setSelection("");
    setAnalytics(null);
    setError("");
  }, [view]);

  useEffect(() => {
    let active = true;

    async function loadAnalytics() {
      if (!selection) {
        setAnalytics(null);
        return;
      }

      setLoadingAnalytics(true);
      setError("");
      try {
        const params = new URLSearchParams({ view });
        params.set(view === "class" ? "class_id" : "level_id", selection);
        const payload = await authorizedFetch(`/api/teacher/results?${params}`);
        if (active) setAnalytics(payload);
      } catch (loadError: any) {
        if (active) {
          setAnalytics(null);
          setError(loadError?.message || "Unable to load analytics.");
        }
      } finally {
        if (active) setLoadingAnalytics(false);
      }
    }

    loadAnalytics();
    return () => { active = false; };
  }, [selection, view]);

  const contextTitle = useMemo(() => {
    if (!analytics) return "";
    if (view === "level") return `${analytics.context.level_name} Level Overview`;
    return [analytics.context.level_name, formatCourseType(analytics.context.course_type)]
      .filter(Boolean)
      .join(" ");
  }, [analytics, view]);

  const schedule = analytics?.view === "class"
    ? [
        analytics.context.days,
        analytics.context.start_time && analytics.context.end_time
          ? `${formatTime(analytics.context.start_time)}–${formatTime(analytics.context.end_time)}`
          : "",
      ].filter(Boolean).join(" · ")
    : "";

  return (
    <TeacherLayout>
      <div className="teacher-results-page">
        <header className="teacher-results-heading">
          <p className="teacher-results-eyebrow">Teacher analytics</p>
          <h1>Results &amp; Performance</h1>
          <p>Aggregated performance across a class or your classes at a level. No individual student records are shown.</p>
        </header>

        <section className="teacher-results-controls" aria-label="Results view and selection">
          <div className="teacher-results-view-control" aria-label="View">
            <span>View</span>
            <div className="teacher-results-segmented">
              {(["class", "level"] as ViewMode[]).map((mode) => (
                <button
                  type="button"
                  className={view === mode ? "is-active" : ""}
                  aria-pressed={view === mode}
                  onClick={() => setView(mode)}
                  key={mode}
                >
                  {mode === "class" ? "Class" : "Level"}
                </button>
              ))}
            </div>
          </div>
          <label className="teacher-results-selector">
            <span>{view === "class" ? "Class" : "Level"}</span>
            <select
              value={selection}
              disabled={loadingOptions || (view === "class" ? classes.length === 0 : levels.length === 0)}
              onChange={(event) => setSelection(event.target.value)}
            >
              <option value="">{loadingOptions ? "Loading..." : `Select a ${view}...`}</option>
              {(view === "class" ? classes : levels).map((option) => (
                <option value={option.id} key={option.id}>
                  {"class_name" in option ? `${option.level_name} — ${option.class_name}` : option.name}
                </option>
              ))}
            </select>
          </label>
        </section>

        {error && <div className="teacher-results-alert" role="alert">{error}</div>}

        {!loadingOptions && classes.length === 0 && !error && (
          <div className="teacher-results-empty">No classes are currently assigned to your teacher account.</div>
        )}

        {!selection && classes.length > 0 && !error && (
          <div className="teacher-results-empty">Select a {view} to view aggregated performance.</div>
        )}

        {loadingAnalytics && <div className="teacher-results-empty">Loading aggregated performance...</div>}

        {analytics && !loadingAnalytics && (
          <>
            <section className="teacher-results-context">
              <div>
                <p>{view === "class" ? "Selected class" : "Selected level"}</p>
                <h2>{contextTitle}</h2>
                {schedule && <span>{schedule}</span>}
              </div>
              {analytics.coverage_context && <span className="teacher-results-context-badge">{analytics.coverage_context}</span>}
            </section>

            {analytics.type !== "cambridge" ? (
              <section className="teacher-results-unsupported">
                <div className="teacher-results-summary-grid is-compact">
                  <article><span>{view === "class" ? "Students" : "Unique students"}</span><strong>{analytics.context.student_count}</strong></article>
                  {view === "level" && <article><span>Your classes</span><strong>{analytics.context.class_count || 0}</strong></article>}
                </div>
                <p>{analytics.message}</p>
              </section>
            ) : analytics.homework && (
              <>
                <section className="teacher-results-summary-grid" aria-label="Overview">
                  <article><span>{view === "class" ? "Students" : "Unique students"}</span><strong>{analytics.context.student_count}</strong></article>
                  {view === "level" && <article><span>Your classes</span><strong>{analytics.context.class_count || 0}</strong></article>}
                  <article><span>Homework Average</span><strong><AverageText aggregate={analytics.homework.overall} /></strong></article>
                  <article><span>Homework Results</span><strong>{analytics.homework.overall.result_count}</strong></article>
                  <article><span>Target</span><strong>{analytics.target === null ? "Not available" : `${analytics.target}%`}</strong></article>
                </section>

                <section className="teacher-results-panel teacher-results-performance">
                  <div className="teacher-results-section-heading">
                    <div><p>Cambridge Homework</p><h2>Homework Performance</h2></div>
                    <div className="teacher-results-large-average"><AverageText aggregate={analytics.homework.overall} /></div>
                  </div>
                  {analytics.homework.overall.result_count === 0 ? (
                    <p className="teacher-results-muted">No valid homework results have been entered for the current enrollment.</p>
                  ) : analytics.homework.overall.suppressed ? (
                    <p className="teacher-results-muted">A numeric average is hidden because fewer than two students contribute.</p>
                  ) : analytics.target !== null && analytics.target !== undefined ? (
                    <TargetBar average={analytics.homework.overall.average} target={analytics.target} />
                  ) : null}
                  <div className="teacher-results-performance-context">
                    <span><strong>{analytics.homework.overall.result_count}</strong> graded results</span>
                    <span><strong>{analytics.homework.overall.student_count}</strong> students contributing</span>
                  </div>
                </section>

                <section className="teacher-results-panel">
                  <div className="teacher-results-section-heading"><div><p>Breakdown</p><h2>Homework by Skill</h2></div></div>
                  {analytics.homework.skills.length === 0 ? <p className="teacher-results-muted">No skill results available.</p> : (
                    <div className="teacher-results-table-wrap"><table className="teacher-results-table"><thead><tr><th>Skill</th><th>Average</th><th>Results</th><th>Students</th></tr></thead><tbody>
                      {analytics.homework.skills.map((skill) => <tr key={skill.skill}><th scope="row">{skill.label}</th><td><AverageText aggregate={skill} /></td><td>{skill.result_count}</td><td>{skill.student_count}</td></tr>)}
                    </tbody></table></div>
                  )}
                </section>

                <section className="teacher-results-panel">
                  <div className="teacher-results-section-heading"><div><p>Coverage</p><h2>Weekly Homework</h2></div><span>{analytics.coverage_context}</span></div>
                  {analytics.homework.weeks.length === 0 ? <p className="teacher-results-muted">No weekly homework results available.</p> : (
                    <div className="teacher-results-table-wrap"><table className="teacher-results-table"><thead><tr><th>Week</th><th>Skill</th><th>Class Average</th><th>Results</th><th>Coverage</th></tr></thead><tbody>
                      {analytics.homework.weeks.map((week) => <tr key={`${week.week}-${week.skill}`}><th scope="row">Week {week.week}</th><td>{week.label}</td><td><AverageText aggregate={week} /></td><td>{week.result_count}</td><td><strong>{week.coverage_count} of {week.coverage_total}</strong>{week.coverage_percentage !== null && <small>{Math.round(week.coverage_percentage)}%</small>}</td></tr>)}
                    </tbody></table></div>
                  )}
                </section>

                <section className="teacher-results-panel">
                  <div className="teacher-results-section-heading"><div><p>Chronology</p><h2>Homework Trend</h2></div><span>Each point names its week and skill</span></div>
                  <Trend weeks={analytics.homework.weeks} />
                </section>

                {view === "level" && (
                  <section className="teacher-results-panel">
                    <div className="teacher-results-section-heading"><div><p>Your classes</p><h2>Class Comparison</h2></div><span>Underlying results are weighted independently</span></div>
                    <div className="teacher-results-table-wrap"><table className="teacher-results-table"><thead><tr><th>Class</th><th>Students</th><th>Homework Average</th><th>Graded Results</th></tr></thead><tbody>
                      {(analytics.class_comparison || []).map((item) => <tr key={item.class_id}><th scope="row">{item.class_name}</th><td>{item.roster_count}</td><td><AverageText aggregate={item} /></td><td>{item.result_count}</td></tr>)}
                    </tbody></table></div>
                  </section>
                )}
              </>
            )}
          </>
        )}
      </div>
    </TeacherLayout>
  );
}
