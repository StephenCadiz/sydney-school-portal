"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import TeacherLayout from "../../components/layout/TeacherLayout";
import { supabase } from "../../../lib/supabase";

type ViewMode = "class" | "level";
type ResultsSection = "overview" | "homework" | "friday" | "mocks";

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

type Attendance = {
  percentage: number | null;
  attended_count: number | null;
  absent_count: number | null;
  opportunity_count: number;
  student_count: number;
  suppressed: boolean;
};

type MockSummary = Aggregate & {
  mock_number: number;
  coverage_count: number;
  coverage_total: number;
  published_count: number;
  entered_count: number;
  aggregate_change: number | null;
  matched_change: number | null;
  matched_student_count: number;
  skills: Array<Aggregate & { skill: string; label: string }>;
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
  friday?: {
    overall: Aggregate;
    attendance: Attendance;
    session_count: number;
    attempt_count: number;
    parts: Array<Aggregate & { key: string; label: string }>;
    sessions: Array<
      Aggregate & {
        session_date: string;
        label: string;
        sheet_count: number;
        attendance: Attendance;
      }
    >;
  };
  mocks?: {
    latest_mock_number: number | null;
    latest: MockSummary | null;
    latest_skills: Array<Aggregate & { skill: string; label: string }>;
    history: MockSummary[];
    represented_class_count: number;
  };
  class_comparison?: Array<
    {
      class_id: string;
      class_name: string;
      level_name: string;
      roster_count: number;
      homework: Aggregate;
      friday: Aggregate;
      mock: MockSummary | null;
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

function formatDays(value: string) {
  return value.trim().replace(/\s+and\s+/gi, " & ");
}

function normalizeLabelPart(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function formatClassLabel(option: ClassOption) {
  const levelName = option.level_name.trim();
  const className = option.class_name.trim();
  const namesMatch = normalizeLabelPart(levelName) === normalizeLabelPart(className);
  const classNameContainsSchedule =
    /\b(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i.test(className) ||
    /\b\d{1,2}:\d{2}(?::\d{2})?\b/.test(className);
  const name = namesMatch || !className || classNameContainsSchedule
    ? levelName || className || "Class"
    : `${levelName} — ${className}`;
  const courseType = option.is_cambridge ? formatCourseType(option.course_type) : "";
  const title = courseType && !normalizeLabelPart(name).includes(normalizeLabelPart(courseType))
    ? `${name} ${courseType}`
    : name;
  const schedule = [
    formatDays(option.days),
    option.start_time && option.end_time
      ? `${formatTime(option.start_time)}–${formatTime(option.end_time)}`
      : "",
  ].filter(Boolean).join(" · ");

  return [title, schedule].filter(Boolean).join(" — ");
}

function AverageText({ aggregate }: { aggregate: Aggregate }) {
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
            : `Aggregate average ${formatAverage(average)}; target ${target}%`
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

function formatDate(value: string) {
  if (!value) return "-";
  const [year, month, day] = value.split("-");
  return year && month && day ? `${day}/${month}/${year}` : value;
}

function InsightCards({
  title,
  items,
}: {
  title: string;
  items: Array<Aggregate & { label: string }>;
}) {
  const comparable = items.filter((item) => item.average !== null);
  if (comparable.length < 2) return null;
  const ordered = [...comparable].sort((a, b) => (b.average as number) - (a.average as number));
  const strongest = ordered[0];
  const focus = ordered[ordered.length - 1];

  return (
    <div className="teacher-results-insight-group">
      <h3>{title}</h3>
      <div className="teacher-results-insights">
        <article><span>Strongest current area</span><strong>{strongest.label} · {formatAverage(strongest.average)}</strong><small>{strongest.result_count} contributing results</small></article>
        <article><span>Area to focus</span><strong>{focus.label} · {formatAverage(focus.average)}</strong><small>{focus.result_count} contributing results</small></article>
      </div>
    </div>
  );
}

function FridayTrend({ sessions }: { sessions: NonNullable<Analytics["friday"]>["sessions"] }) {
  const points = sessions.filter((item) => item.average !== null);
  if (points.length < 2) return <p className="teacher-results-muted">At least two sessions with score data are needed for a trend.</p>;

  return (
    <div className="teacher-results-trend" aria-label="Friday Tutorial Session Performance">
      {points.map((point) => <div className="teacher-results-trend-point" key={`${point.session_date}-${point.label}`} title={`${formatDate(point.session_date)}, ${point.label}: ${formatAverage(point.average)}, ${point.result_count} attempts`}><strong>{formatAverage(point.average)}</strong><div className="teacher-results-trend-column" aria-hidden="true"><span style={{ height: `${Math.max(4, point.average || 0)}%` }} /></div><span>{formatDate(point.session_date)}</span><small>{point.label}</small></div>)}
    </div>
  );
}

function Trend({ weeks }: { weeks: NonNullable<Analytics["homework"]>["weeks"] }) {
  const points = weeks.filter((week) => week.average !== null);

  if (points.length < 2) {
    return (
      <p className="teacher-results-muted">
        At least two chronological points with score data are needed for a trend.
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
  const [selectedClassId, setSelectedClassId] = useState("");
  const [selectedLevelId, setSelectedLevelId] = useState("");
  const [activeSection, setActiveSection] = useState<ResultsSection>("overview");
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
    setAnalytics(null);
    setActiveSection("overview");
    setError("");
  }, [view]);

  useEffect(() => {
    let active = true;
    const activeSelection = view === "class" ? selectedClassId : selectedLevelId;

    async function loadAnalytics() {
      if (!activeSelection) {
        setAnalytics(null);
        return;
      }

      setLoadingAnalytics(true);
      setError("");
      try {
        const params = new URLSearchParams({ view });
        params.set(view === "class" ? "class_id" : "level_id", activeSelection);
        const payload = await authorizedFetch(`/api/teacher/results?${params}`);
        if (active) {
          setAnalytics(payload);
          setActiveSection("overview");
        }
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
  }, [selectedClassId, selectedLevelId, view]);

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
  const selection = view === "class" ? selectedClassId : selectedLevelId;

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
              onChange={(event) =>
                view === "class"
                  ? setSelectedClassId(event.target.value)
                  : setSelectedLevelId(event.target.value)
              }
            >
              <option value="">{loadingOptions ? "Loading..." : `Select a ${view}...`}</option>
              {(view === "class" ? classes : levels).map((option) => (
                <option value={option.id} key={option.id}>
                  {"class_name" in option ? formatClassLabel(option) : option.name}
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
            ) : analytics.homework && analytics.friday && analytics.mocks && (
              <>
                <nav className="teacher-results-section-nav" aria-label="Results sections">
                  {([
                    ["overview", "Overview"],
                    ["homework", "Homework"],
                    ["friday", "Friday Tutorials"],
                    ["mocks", "Mock Exams"],
                  ] as Array<[ResultsSection, string]>).map(([section, label]) => (
                    <button type="button" className={activeSection === section ? "is-active" : ""} aria-pressed={activeSection === section} onClick={() => setActiveSection(section)} key={section}>{label}</button>
                  ))}
                </nav>

                {activeSection === "overview" && (
                  <>
                    <section className="teacher-results-summary-grid" aria-label="Overview">
                      <article><span>{view === "class" ? "Students" : "Unique students"}</span><strong>{analytics.context.student_count}</strong></article>
                      {view === "level" && <article><span>Your classes</span><strong>{analytics.context.class_count || 0}</strong></article>}
                      <article><span>Homework Average</span><strong><AverageText aggregate={analytics.homework.overall} /></strong></article>
                      <article><span>Friday Tutorial Average</span><strong><AverageText aggregate={analytics.friday.overall} /></strong></article>
                      <article><span>{analytics.mocks.latest_mock_number ? `Latest available Mock ${analytics.mocks.latest_mock_number}` : "Latest Mock Average"}</span><strong>{analytics.mocks.latest ? <AverageText aggregate={analytics.mocks.latest} /> : "No data"}</strong>{view === "level" && analytics.mocks.latest && <small>{analytics.mocks.represented_class_count} classes represented</small>}</article>
                    </section>
                    <section className="teacher-results-panel">
                      <div className="teacher-results-section-heading"><div><p>Overview</p><h2>Performance Snapshot</h2></div><span>Level target: {analytics.target}%</span></div>
                      <div className="teacher-results-snapshot-groups">
                        <InsightCards title="Homework" items={analytics.homework.skills} />
                        <InsightCards title="Friday Tutorials" items={analytics.friday.parts} />
                        <InsightCards title={analytics.mocks.latest_mock_number ? `Mock ${analytics.mocks.latest_mock_number}` : "Latest Mock"} items={analytics.mocks.latest_skills.filter((item) => item.skill !== "average")} />
                      </div>
                      {!analytics.homework.skills.some((item) => item.average !== null) && !analytics.friday.parts.some((item) => item.average !== null) && !analytics.mocks.latest_skills.some((item) => item.average !== null) && <p className="teacher-results-muted">More aggregate data is needed to identify comparable performance areas.</p>}
                    </section>
                    {view === "level" && (
                      <section className="teacher-results-panel">
                        <div className="teacher-results-section-heading"><div><p>Your classes</p><h2>Class Comparison</h2></div><span>Each metric is weighted from its underlying results</span></div>
                        <div className="teacher-results-table-wrap"><table className="teacher-results-table"><thead><tr><th>Class</th><th>Students</th><th>Homework</th><th>Friday</th><th>Latest Mock</th></tr></thead><tbody>
                          {(analytics.class_comparison || []).map((item) => <tr key={item.class_id}><th scope="row">{item.class_name}</th><td>{item.roster_count}</td><td><AverageText aggregate={item.homework} /></td><td><AverageText aggregate={item.friday} /></td><td>{item.mock ? <><span>Mock {item.mock.mock_number} · </span><AverageText aggregate={item.mock} /></> : "No data"}</td></tr>)}
                        </tbody></table></div>
                      </section>
                    )}
                  </>
                )}

                {activeSection === "homework" && (
                  <>
                    <section className="teacher-results-panel teacher-results-performance"><div className="teacher-results-section-heading"><div><p>Cambridge Homework</p><h2>Homework Performance</h2></div><div className="teacher-results-large-average"><AverageText aggregate={analytics.homework.overall} /></div></div>{analytics.homework.overall.result_count === 0 ? <p className="teacher-results-muted">No valid homework results have been entered for the current enrollment.</p> : analytics.target !== null && analytics.target !== undefined ? <TargetBar average={analytics.homework.overall.average} target={analytics.target} /> : null}<div className="teacher-results-performance-context"><span><strong>{analytics.homework.overall.result_count}</strong> graded results</span><span><strong>{analytics.homework.overall.student_count}</strong> {analytics.homework.overall.student_count === 1 ? "student" : "students"} contributing</span></div></section>
                    <section className="teacher-results-panel"><div className="teacher-results-section-heading"><div><p>Breakdown</p><h2>Homework by Skill</h2></div></div><div className="teacher-results-table-wrap"><table className="teacher-results-table"><thead><tr><th>Skill</th><th>Average</th><th>Results</th><th>Students</th></tr></thead><tbody>{analytics.homework.skills.map((skill) => <tr key={skill.skill}><th scope="row">{skill.label}</th><td><AverageText aggregate={skill} /></td><td>{skill.result_count}</td><td>{skill.student_count}</td></tr>)}</tbody></table></div></section>
                    <section className="teacher-results-panel"><div className="teacher-results-section-heading"><div><p>Coverage</p><h2>Weekly Homework</h2></div><span>{analytics.coverage_context}</span></div>{analytics.homework.weeks.length === 0 ? <p className="teacher-results-muted">No weekly homework results available.</p> : <div className="teacher-results-table-wrap"><table className="teacher-results-table"><thead><tr><th>Week</th><th>Skill</th><th>Class Average</th><th>Results</th><th>Coverage</th></tr></thead><tbody>{analytics.homework.weeks.map((week) => <tr key={`${week.week}-${week.skill}`}><th scope="row">Week {week.week}</th><td>{week.label}</td><td><AverageText aggregate={week} /></td><td>{week.result_count}</td><td><strong>{week.coverage_count} of {week.coverage_total}</strong>{week.coverage_percentage !== null && <small>{Math.round(week.coverage_percentage)}%</small>}</td></tr>)}</tbody></table></div>}</section>
                    <section className="teacher-results-panel"><div className="teacher-results-section-heading"><div><p>Chronology</p><h2>Homework Trend</h2></div><span>Each point names its week and skill</span></div><Trend weeks={analytics.homework.weeks} /></section>
                  </>
                )}

                {activeSection === "friday" && (
                  <>
                    <section className="teacher-results-summary-grid"><article><span>Overall Friday Average</span><strong><AverageText aggregate={analytics.friday.overall} /></strong></article><article><span>Attendance</span><strong>{formatAverage(analytics.friday.attendance.percentage)}</strong></article><article><span>Sessions Submitted</span><strong>{analytics.friday.session_count}</strong></article><article><span>Total Attempts</span><strong>{analytics.friday.attempt_count}</strong></article></section>
                    <section className="teacher-results-panel"><div className="teacher-results-section-heading"><div><p>Submitted sheets</p><h2>Friday Tutorial Performance</h2></div><span>Attendance uses historical submitted-sheet snapshots</span></div>{analytics.friday.attendance.opportunity_count === 0 ? <p className="teacher-results-muted">No submitted Friday Tutorial result sheets are available.</p> : <div className="teacher-results-attendance"><strong>{formatAverage(analytics.friday.attendance.percentage)}</strong><span>{analytics.friday.attendance.attended_count} attended · {analytics.friday.attendance.absent_count} absent</span></div>}</section>
                    <section className="teacher-results-panel"><div className="teacher-results-section-heading"><div><p>Breakdown</p><h2>Skill &amp; Exam Part</h2></div></div>{analytics.friday.parts.length === 0 ? <p className="teacher-results-muted">No Friday score data available.</p> : <div className="teacher-results-table-wrap"><table className="teacher-results-table"><thead><tr><th>Skill / Exam Part</th><th>Average</th><th>Attempts</th><th>Students</th></tr></thead><tbody>{analytics.friday.parts.map((part) => <tr key={part.key}><th scope="row">{part.label}</th><td><AverageText aggregate={part} /></td><td>{part.result_count}</td><td>{part.student_count}</td></tr>)}</tbody></table></div>}</section>
                    <section className="teacher-results-panel"><div className="teacher-results-section-heading"><div><p>Chronology</p><h2>Friday Tutorial Session Performance</h2></div><span>Sessions may assess different skills and parts</span></div><FridayTrend sessions={analytics.friday.sessions} /></section>
                    <section className="teacher-results-panel"><div className="teacher-results-section-heading"><div><p>History</p><h2>Submitted Sessions</h2></div></div>{analytics.friday.sessions.length === 0 ? <p className="teacher-results-muted">No submitted sessions available.</p> : <div className="teacher-results-table-wrap"><table className="teacher-results-table"><thead><tr><th>Date</th><th>Skill / Part</th><th>Average</th><th>Attendance</th><th>Attempts</th></tr></thead><tbody>{analytics.friday.sessions.map((session) => <tr key={`${session.session_date}-${session.label}`}><th scope="row">{formatDate(session.session_date)}</th><td>{session.label}</td><td><AverageText aggregate={session} /></td><td>{formatAverage(session.attendance.percentage)}</td><td>{session.result_count}</td></tr>)}</tbody></table></div>}</section>
                  </>
                )}

                {activeSection === "mocks" && (
                  <>
                    <p className="teacher-results-note">Teacher analytics include entered draft and published mock results.</p>
                    <section className="teacher-results-summary-grid"><article><span>Latest Mock</span><strong>{analytics.mocks.latest_mock_number ? `Mock ${analytics.mocks.latest_mock_number}` : "No data"}</strong></article><article><span>Latest Mock Average</span><strong>{analytics.mocks.latest ? <AverageText aggregate={analytics.mocks.latest} /> : "No data"}</strong></article><article><span>Students with Results</span><strong>{analytics.mocks.latest?.student_count ?? "No data"}</strong>{analytics.mocks.latest && <small>{analytics.mocks.latest.coverage_count} of {analytics.mocks.latest.coverage_total} current students</small>}</article><article><span>Published Results</span><strong>{analytics.mocks.latest ? `${analytics.mocks.latest.published_count} of ${analytics.mocks.latest.entered_count}` : "No data"}</strong></article></section>
                    <section className="teacher-results-panel"><div className="teacher-results-section-heading"><div><p>{analytics.mocks.latest_mock_number ? `Mock ${analytics.mocks.latest_mock_number}` : "Latest Mock"}</p><h2>Mock Exam Performance</h2></div><span>{view === "level" && analytics.mocks.latest ? `${analytics.mocks.represented_class_count} selected classes represented` : `Level target: ${analytics.target}%`}</span></div>{!analytics.mocks.latest ? <p className="teacher-results-muted">No valid mock averages are available.</p> : <><div className="teacher-results-table-wrap"><table className="teacher-results-table"><thead><tr><th>Skill</th><th>Class Average</th><th>Students</th></tr></thead><tbody>{analytics.mocks.latest_skills.map((skill) => <tr key={skill.skill}><th scope="row">{skill.label}</th><td><AverageText aggregate={skill} /></td><td>{skill.student_count}</td></tr>)}</tbody></table></div>{analytics.target !== null && analytics.target !== undefined && <TargetBar average={analytics.mocks.latest.average} target={analytics.target} />}</>}</section>
                    {analytics.mocks.history.length > 1 && <section className="teacher-results-panel"><div className="teacher-results-section-heading"><div><p>Breakdown</p><h2>Skills by Mock</h2></div><span>Each average uses underlying student scores</span></div><div className="teacher-results-mock-breakdowns">{analytics.mocks.history.map((mock) => <div key={mock.mock_number}><h3>Mock {mock.mock_number}</h3><div className="teacher-results-table-wrap"><table className="teacher-results-table"><thead><tr><th>Skill</th><th>Average</th><th>Students</th></tr></thead><tbody>{mock.skills.map((skill) => <tr key={skill.skill}><th scope="row">{skill.label}</th><td><AverageText aggregate={skill} /></td><td>{skill.student_count}</td></tr>)}</tbody></table></div></div>)}</div></section>}
                    <section className="teacher-results-panel"><div className="teacher-results-section-heading"><div><p>Class aggregate change</p><h2>Mock Progression</h2></div><span>Participating students may differ between mocks</span></div>{analytics.mocks.history.length === 0 ? <p className="teacher-results-muted">No mock history available.</p> : <div className="teacher-results-progression">{analytics.mocks.history.map((mock) => <article key={mock.mock_number}><span>Mock {mock.mock_number}</span><strong><AverageText aggregate={mock} /></strong>{mock.aggregate_change !== null && <small>Aggregate {mock.aggregate_change >= 0 ? "+" : ""}{Math.round(mock.aggregate_change * 10) / 10} points</small>}{mock.matched_change !== null && <small>Matched cohort {mock.matched_change >= 0 ? "+" : ""}{Math.round(mock.matched_change * 10) / 10} · {mock.matched_student_count} students</small>}</article>)}</div>}</section>
                    <section className="teacher-results-panel"><div className="teacher-results-section-heading"><div><p>History</p><h2>Mock Exams</h2></div><span>{analytics.coverage_context}</span></div>{analytics.mocks.history.length === 0 ? <p className="teacher-results-muted">No valid mock results available.</p> : <div className="teacher-results-table-wrap"><table className="teacher-results-table"><thead><tr><th>Mock</th><th>Average</th><th>Students</th><th>Coverage</th><th>Published</th></tr></thead><tbody>{analytics.mocks.history.map((mock) => <tr key={mock.mock_number}><th scope="row">Mock {mock.mock_number}</th><td><AverageText aggregate={mock} /></td><td>{mock.student_count}</td><td>{mock.coverage_count} of {mock.coverage_total}</td><td>{mock.published_count}/{mock.entered_count}</td></tr>)}</tbody></table></div>}</section>
                  </>
                )}
              </>
            )}
          </>
        )}
      </div>
    </TeacherLayout>
  );
}
