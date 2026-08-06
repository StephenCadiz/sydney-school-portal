"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import AdminLayout from "../../components/layout/AdminLayout";
import { supabase } from "../../../lib/supabase";

type CoursePlanRow = {
  class_id: string;
  class_name: string;
  level: string;
  teacher_name: string;
  course_type: string;
  start_date: string | null;
  end_date: string | null;
  has_course_dates: boolean;
  plan: { id: string; book_name: string; status: "draft" | "published"; published_at: string | null; updated_at: string | null; day_count: number } | null;
};

function displayDate(value: string | null) {
  if (!value) return "Dates needed";
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Europe/Madrid",
  }).format(new Date(value + "T12:00:00Z"));
}

export default function AdminCoursePlanningPage() {
  const [rows, setRows] = useState<CoursePlanRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("all");
  const [courseType, setCourseType] = useState("all");
  const [level, setLevel] = useState("all");
  const [teacher, setTeacher] = useState("all");
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error("Authentication required.");
      const response = await fetch("/api/admin/course-planning", {
        headers: { Authorization: "Bearer " + session.access_token },
        cache: "no-store",
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || "Unable to load Course Planning.");
      setRows(payload?.course_plans || []);
    } catch (loadError: any) {
      setRows([]);
      setError(loadError?.message || "Unable to load Course Planning.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    return rows.filter((row) => {
      const matchesStatus =
        status === "all" ||
        (status === "missing_dates" && !row.has_course_dates) ||
        (status === "not_created" && row.has_course_dates && !row.plan) ||
        row.plan?.status === status;
      const matchesCourseType = courseType === "all" || row.course_type === courseType;
      const matchesLevel = level === "all" || row.level === level;
      const matchesTeacher = teacher === "all" || row.teacher_name === teacher;
      const matchesSearch =
        !query ||
        [row.class_name, row.level, row.teacher_name, row.course_type]
          .join(" ")
          .toLowerCase()
          .includes(query);
      return matchesStatus && matchesCourseType && matchesLevel && matchesTeacher && matchesSearch;
    });
  }, [courseType, level, rows, search, status, teacher]);
  const levels = Array.from(new Set(rows.map((row) => row.level))).sort();
  const teachers = Array.from(new Set(rows.map((row) => row.teacher_name))).sort();

  return (
    <AdminLayout>
      <div className="admin-course-planning-page">
        <header className="admin-course-planning-header">
          <div><p>Cambridge Programme</p><h1>Course Planning</h1><span>Admin overview for Cambridge Intensive and Express course plans.</span></div>
          <button type="button" onClick={() => void load()} disabled={loading}>Refresh</button>
        </header>
        <section className="admin-course-planning-directory">
          <div className="admin-course-planning-filters">
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search class, level or teacher" />
            <select value={status} onChange={(event) => setStatus(event.target.value)}>
              <option value="all">All eligible classes</option>
              <option value="missing_dates">Dates needed</option>
              <option value="not_created">Ready to create</option>
              <option value="draft">Draft plans</option>
              <option value="published">Published plans</option>
            </select>
            <select value={courseType} onChange={(event) => setCourseType(event.target.value)}><option value="all">Intensive and Express</option><option value="intensive">Intensive</option><option value="express">Express</option></select>
            <select value={level} onChange={(event) => setLevel(event.target.value)}><option value="all">All levels</option>{levels.map((option) => <option key={option} value={option}>{option}</option>)}</select>
            <select value={teacher} onChange={(event) => setTeacher(event.target.value)}><option value="all">All teachers</option>{teachers.map((option) => <option key={option} value={option}>{option}</option>)}</select>
          </div>
          {loading && <p className="admin-course-planning-state">Loading Course Planning...</p>}
          {!loading && error && <div className="admin-course-planning-state is-error"><p>{error}</p><button type="button" onClick={() => void load()}>Retry</button></div>}
          {!loading && !error && <div className="admin-course-planning-table-wrap">
            <table className="admin-course-planning-table">
              <thead><tr><th>Class</th><th>Teacher</th><th>Course dates</th><th>Book / plan</th><th>Activity</th><th aria-label="Open course planning" /></tr></thead>
              <tbody>
                {filteredRows.map((row) => <tr key={row.class_id}>
                  <td><strong>{row.class_name}</strong><span>{row.level} · {row.course_type}</span></td>
                  <td>{row.teacher_name}</td>
                  <td>{row.has_course_dates ? <span>{displayDate(row.start_date)} – {displayDate(row.end_date)}</span> : <span className="admin-course-planning-date-warning">Dates needed in Classes / Groups</span>}</td>
                  <td>{row.plan ? <><strong>{row.plan.book_name}</strong><span className={"admin-course-planning-status is-" + row.plan.status}>{row.plan.status}</span></> : row.has_course_dates ? <span className="admin-course-planning-status is-ready">Ready to create</span> : <span>Blocked</span>}</td>
                  <td>{row.plan ? <span>{row.plan.day_count} teaching days<br />Updated {row.plan.updated_at ? new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" }).format(new Date(row.plan.updated_at)) : "—"}{row.plan.published_at ? <><br />Published {new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" }).format(new Date(row.plan.published_at))}</> : null}</span> : <span>—</span>}</td>
                  <td><Link href={"/admin/course-planning/class/" + encodeURIComponent(row.class_id)}>Open</Link></td>
                </tr>)}
                {!filteredRows.length && <tr><td colSpan={6} className="admin-course-planning-empty">No eligible course plans match these filters.</td></tr>}
              </tbody>
            </table>
          </div>}
        </section>
      </div>
    </AdminLayout>
  );
}
