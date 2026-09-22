"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../../../lib/supabase";
import type { SchoolRosterClass, SchoolRosterStudent } from "../../../lib/schoolRosterServer";
import { getGlobalLevelRank } from "../../../lib/classOrdering";

type Props = { heading?: string };

function formatTime(value: string | null) {
  return value ? String(value).slice(0, 5) : "Not set";
}

function schedule(row: SchoolRosterClass) {
  const time = row.start_time || row.end_time
    ? `${formatTime(row.start_time)}${row.end_time ? `–${formatTime(row.end_time)}` : ""}`
    : "Time not set";
  return `${row.days || "Days not set"} · ${time}`;
}

function uniqueStudents(rows: SchoolRosterClass[]) {
  const result = new Map<string, { student: SchoolRosterStudent; classroom: SchoolRosterClass }>();
  for (const row of rows) for (const student of row.students) {
    const key = `${student.student_type}:${student.id}`;
    if (!result.has(key)) result.set(key, { student, classroom: row });
  }
  return [...result.values()].sort((a, b) => a.student.name.localeCompare(b.student.name));
}

function levelCoordinatorLabel(rows: SchoolRosterClass[]) {
  const names = [...new Set(rows.map((row) => row.coordinator).filter((name) => name && name !== "Coordinator not assigned"))];
  return names.length ? names.join(", ") : "Coordinator not assigned";
}

export default function SchoolRosterView({ heading = "School Roster" }: Props) {
  const [rows, setRows] = useState<SchoolRosterClass[]>([]);
  const [allRows, setAllRows] = useState<SchoolRosterClass[]>([]);
  const [query, setQuery] = useState("");
  const [programme, setProgramme] = useState("");
  const [level, setLevel] = useState("");
  const [teacher, setTeacher] = useState("");
  const [className, setClassName] = useState("");
  const [day, setDay] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const requestId = useRef(0);

  useEffect(() => {
    let cancelled = false;
    const id = ++requestId.current;
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setError("");
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) throw new Error("Please sign in to view the School Roster.");
        const params = new URLSearchParams();
        if (query.trim()) params.set("q", query.trim());
        if (programme) params.set("programme", programme);
        if (level) params.set("level", level);
        if (teacher) params.set("teacher", teacher);
        if (className) params.set("class", className);
        if (day) params.set("day", day);
        const response = await fetch(`/api/school-roster${params.toString() ? `?${params}` : ""}`, {
          headers: { Authorization: `Bearer ${session.access_token}` },
          cache: "no-store",
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || "Unable to load the School Roster.");
        if (!cancelled && id === requestId.current) {
          const nextRows = Array.isArray(payload.classes) ? payload.classes as SchoolRosterClass[] : [];
          setRows(nextRows);
          if (!query && !programme && !level && !teacher && !className && !day) setAllRows(nextRows);
        }
      } catch (loadError) {
        if (!cancelled && id === requestId.current) {
          setRows([]);
          setError(loadError instanceof Error ? loadError.message : "Unable to load the School Roster.");
        }
      } finally {
        if (!cancelled && id === requestId.current) setLoading(false);
      }
    }, query ? 180 : 0);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [query, programme, level, teacher, className, day]);

  const options = useMemo(() => ({
    programmes: [...new Set(allRows.map((row) => row.programme))].sort(),
    levels: [...new Set(allRows.map((row) => row.level))].sort(),
    teachers: [...new Set(allRows.map((row) => row.teacher))].sort(),
    classes: [...new Set(allRows.map((row) => row.class_name))].sort(),
    days: [...new Set(allRows.flatMap((row) => String(row.days || "").split(/\s*(?:,|&|and)\s*/i).filter(Boolean)))].sort(),
  }), [allRows]);

  const grouped = useMemo(() => {
    const programmes = new Map<string, Map<string, SchoolRosterClass[]>>();
    for (const row of rows) {
      const byLevel = programmes.get(row.programme) || new Map<string, SchoolRosterClass[]>();
      const levelRows = byLevel.get(row.level) || [];
      levelRows.push(row);
      byLevel.set(row.level, levelRows);
      programmes.set(row.programme, byLevel);
    }
    return [...programmes.entries()].map(([programme, byLevel]) => [programme, new Map([...byLevel.entries()].sort((a, b) => getGlobalLevelRank(a[0]) - getGlobalLevelRank(b[0])))] as const).sort((a, b) => a[0].localeCompare(b[0]));
  }, [rows]);

  const searchedStudents = useMemo(() => uniqueStudents(rows), [rows]);
  const hasFilters = Boolean(query || programme || level || teacher || className || day);

  return (
    <div className="school-roster-page">
      <header className="school-roster-heading">
        <div>
          <p className="school-roster-eyebrow">READ-ONLY DIRECTORY</p>
          <h1>{heading}</h1>
          <p>Browse active classes, current placements, and the people supporting each level.</p>
        </div>
        <span className="school-roster-count" aria-live="polite">{rows.length} active {rows.length === 1 ? "class" : "classes"}</span>
      </header>

      <section className="school-roster-filters" aria-labelledby="school-roster-filter-heading">
        <div className="school-roster-filter-heading">
          <h2 id="school-roster-filter-heading">Find a class or student</h2>
          <p>Search by first name or surname, then refine the active roster by programme, level, teacher, class, or day.</p>
        </div>
        <label className="school-roster-search">
          <span>Student lookup</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search first name or surname" type="search" />
        </label>
        <div className="school-roster-filter-grid">
          <label><span>Programme</span><select value={programme} onChange={(event) => setProgramme(event.target.value)}><option value="">All programmes</option>{options.programmes.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
          <label><span>Level</span><select value={level} onChange={(event) => setLevel(event.target.value)}><option value="">All levels</option>{options.levels.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
          <label><span>Teacher</span><select value={teacher} onChange={(event) => setTeacher(event.target.value)}><option value="">All teachers</option>{options.teachers.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
          <label><span>Class</span><select value={className} onChange={(event) => setClassName(event.target.value)}><option value="">All classes</option>{options.classes.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
          <label><span>Day</span><select value={day} onChange={(event) => setDay(event.target.value)}><option value="">Any day</option>{options.days.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
        </div>
      </section>

      {loading && <div className="school-roster-state" role="status">Loading active classes…</div>}
      {!loading && error && <div className="school-roster-state is-error" role="alert">{error}</div>}
      {!loading && !error && query.trim() && searchedStudents.length > 0 && (
        <section className="school-roster-student-results" aria-labelledby="school-roster-student-results-heading">
          <div className="school-roster-section-heading"><div><h2 id="school-roster-student-results-heading">Student results</h2><p>Current active placement for matching students.</p></div><span>{searchedStudents.length}</span></div>
          <div className="school-roster-student-grid">
            {searchedStudents.map(({ student, classroom }) => <article className="school-roster-student-card" key={`${student.student_type}:${student.id}`}><div className="school-roster-student-name">{student.name}</div><span className="school-roster-programme-badge">{classroom.programme}</span><dl><div><dt>Level</dt><dd>{classroom.level}</dd></div><div><dt>Class</dt><dd>{classroom.class_name}</dd></div><div><dt>Schedule</dt><dd>{schedule(classroom)}</dd></div><div><dt>Teacher</dt><dd>{classroom.teacher}</dd></div><div><dt>Coordinator</dt><dd>{classroom.coordinator}</dd></div></dl></article>)}
          </div>
        </section>
      )}

      {!loading && !error && rows.length === 0 && <div className="school-roster-state"><strong>{hasFilters ? "No matching active classes or students" : "No active classes"}</strong><p>{hasFilters ? "Try a different search or filter." : "There are no active classes to display."}</p></div>}

      {!loading && !error && rows.length > 0 && <div className="school-roster-groups">{grouped.map(([programmeName, byLevel]) => <section key={programmeName} className="school-roster-programme" aria-labelledby={`school-roster-${programmeName.replace(/\W+/g, "-")}`}><div className="school-roster-programme-heading"><h2 id={`school-roster-${programmeName.replace(/\W+/g, "-")}`}>{programmeName}</h2><span>{[...byLevel.values()].flat().length} classes</span></div>{[...byLevel.entries()].map(([levelName, classes]) => <div className="school-roster-level" key={levelName}><div className="school-roster-level-heading"><h3>{levelName}</h3><span>Level coordinator: <strong>{levelCoordinatorLabel(classes)}</strong></span></div><div className="school-roster-class-grid">{classes.map((row) => <details className="school-roster-class-card" key={row.id}><summary><span><strong>{row.class_name}</strong><small>{schedule(row)}</small></span><span className="school-roster-expand">View {row.students.length} {row.students.length === 1 ? "student" : "students"}</span></summary><div className="school-roster-class-details"><dl><div><dt>Programme</dt><dd>{row.programme}</dd></div><div><dt>Level</dt><dd>{row.level}</dd></div><div><dt>Schedule</dt><dd>{schedule(row)}</dd></div><div><dt>Classroom</dt><dd>{row.classroom}</dd></div><div><dt>Teacher</dt><dd>{row.teacher}</dd></div><div><dt>Coordinator</dt><dd>{row.coordinator}</dd></div></dl><div className="school-roster-student-list"><h4>Enrolled students</h4>{row.students.length ? <ul>{row.students.map((student) => <li key={`${student.student_type}:${student.id}`}>{student.name}</li>)}</ul> : <p>No current active enrolments.</p>}</div></div></details>)}</div></div>)}</section>)}</div>}
    </div>
  );
}
