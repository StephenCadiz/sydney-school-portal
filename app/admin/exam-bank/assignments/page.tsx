"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import AdminLayout from "../../../components/layout/AdminLayout";
import CambridgeExamBankTabs from "../../../components/admin/CambridgeExamBankTabs";
import {
  CAMBRIDGE_EXAM_ASSIGNMENT_STATUS_LABELS,
  CAMBRIDGE_EXAM_COURSE_LABELS,
  CAMBRIDGE_EXAM_COURSE_TYPES,
  CambridgeExamAssignmentRecord,
  formatExamName,
} from "../../../../lib/cambridgeExamBank";
import { supabase } from "../../../../lib/supabase";

type Pending = { assignment: CambridgeExamAssignmentRecord; action: "archive" | "restore" };

export default function AssignedExamsPage() {
  const [assignments, setAssignments] = useState<CambridgeExamAssignmentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [level, setLevel] = useState("all");
  const [course, setCourse] = useState("all");
  const [status, setStatus] = useState("all");
  const [scope, setScope] = useState("current");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const pageSize = 50;
  const [pending, setPending] = useState<Pending | null>(null);
  const [changing, setChanging] = useState(false);
  const [mutationError, setMutationError] = useState("");
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const cancelRef = useRef<HTMLButtonElement | null>(null);
  const openerRef = useRef<HTMLButtonElement | null>(null);
  const assignRef = useRef<HTMLAnchorElement | null>(null);
  const changingRef = useRef(false);

  async function accessToken() {
    const { data } = await supabase.auth.getSession();
    if (!data.session?.access_token) throw new Error("Your session has expired.");
    return data.session.access_token;
  }

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({
        scope,
        page: String(page),
        page_size: String(pageSize),
      });
      if (level !== "all") params.set("level", level);
      if (course !== "all") params.set("course", course);
      if (status !== "all") params.set("status", status);
      const response = await fetch(`/api/admin/exam-bank/assignments?${params}`, {
        headers: { Authorization: `Bearer ${await accessToken()}` },
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to load assigned exams.");
      setAssignments(result.assignments || []);
      setTotal(Number(result.pagination?.total || 0));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to load assigned exams.");
    } finally {
      setLoading(false);
    }
  }, [course, level, page, scope, status]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { changingRef.current = changing; }, [changing]);

  useEffect(() => {
    if (!pending) return;
    cancelRef.current?.focus();
    function keydown(event: KeyboardEvent) {
      if (event.key === "Escape" && !changingRef.current) {
        event.preventDefault();
        setPending(null);
        return;
      }
      if (event.key !== "Tab") return;
      const items = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>("button:not([disabled])") || []);
      if (!items.length) return event.preventDefault();
      if (event.shiftKey && document.activeElement === items[0]) {
        event.preventDefault(); items[items.length - 1].focus();
      } else if (!event.shiftKey && document.activeElement === items[items.length - 1]) {
        event.preventDefault(); items[0].focus();
      }
    }
    document.addEventListener("keydown", keydown);
    return () => {
      document.removeEventListener("keydown", keydown);
      if (openerRef.current?.isConnected) openerRef.current.focus();
      else assignRef.current?.focus();
    };
  }, [pending]);

  const visible = useMemo(() => {
    const query = search.trim().toLowerCase();
    return assignments.filter((item) =>
      (!query || formatExamName(item.level.name, item.exam.exam_number, item.exam.title).toLowerCase().includes(query) || item.part.display_label.toLowerCase().includes(query))
    );
  }, [assignments, search]);

  const counts = {
    active: visible.filter((item) => item.status === "active").length,
    scheduled: visible.filter((item) => item.status === "scheduled").length,
    draft: visible.filter((item) => item.status === "draft").length,
  };

  async function changeStatus() {
    if (!pending || changing) return;
    setChanging(true);
    setMutationError("");
    try {
      const response = await fetch(`/api/admin/exam-bank/assignments/${pending.assignment.id}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${await accessToken()}`, "Content-Type": "application/json" },
        body: JSON.stringify({ action: pending.action }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to change assignment status.");
      setPending(null);
      await load();
    } catch (caught) {
      setMutationError(caught instanceof Error ? caught.message : "Unable to change assignment status.");
    } finally {
      setChanging(false);
    }
  }

  return (
    <AdminLayout>
      <div className="exam-bank-page">
        <CambridgeExamBankTabs />
        <header className="exam-bank-page-header">
          <div><h1>Assigned Exams</h1><p>Assign complete Cambridge exams or selected parts to Regular, Intensive, Express and Online courses.</p></div>
          <Link ref={assignRef} className="exam-bank-button" href="/admin/exam-bank/assignments/new">Assign Exam</Link>
        </header>
        <div className="exam-bank-summary" aria-live="polite">
          {total} matching assignments · this page: {counts.active} active · {counts.scheduled} scheduled · {counts.draft} drafts
        </div>
        <section className="exam-assignment-filters" aria-label="Assignment filters">
          <select aria-label="Level filter" value={level} onChange={(event) => { setLevel(event.target.value); setPage(1); }}>
            <option value="all">All Levels</option>{["B1", "B2", "C1", "C2"].map((item) => <option key={item}>{item}</option>)}
          </select>
          <select aria-label="Course filter" value={course} onChange={(event) => { setCourse(event.target.value); setPage(1); }}>
            <option value="all">All Courses</option>{CAMBRIDGE_EXAM_COURSE_TYPES.map((item) => <option key={item} value={item}>{CAMBRIDGE_EXAM_COURSE_LABELS[item]}</option>)}
          </select>
          <select aria-label="Status filter" value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}>
            <option value="all">All Statuses</option>{Object.entries(CAMBRIDGE_EXAM_ASSIGNMENT_STATUS_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select>
          <select aria-label="Archive filter" value={scope} onChange={(event) => { setScope(event.target.value); setPage(1); }}>
            <option value="current">Current</option><option value="archived">Archived</option><option value="all">All</option>
          </select>
          <input aria-label="Search assignments" type="search" placeholder="Search exam or part" value={search} onChange={(event) => setSearch(event.target.value)} />
        </section>
        {error && <div className="exam-bank-notice is-error" role="alert"><span>{error}</span><button onClick={() => void load()}>Retry</button></div>}
        {loading ? <div className="exam-bank-list-skeleton"><div /><div /><div /></div>
          : visible.length === 0 ? <div className="exam-bank-empty"><h2>No assigned exams match this view.</h2><p>Assign an exam or adjust the filters.</p></div>
          : <div className="exam-assignment-sheet">
              <div className="exam-assignment-sheet-head" aria-hidden="true"><span>Level</span><span>Exam</span><span>Part</span><span>Course</span><span>Release</span><span>Due</span><span>Status</span><span>Actions</span></div>
              {visible.map((item) => <article className="exam-assignment-row" key={item.id}>
                <div data-label="Level"><strong>{item.level.name}</strong></div>
                <div data-label="Exam">{formatExamName(item.level.name, item.exam.exam_number, item.exam.title)}</div>
                <div data-label="Part"><strong>{item.part.display_label}</strong>{!item.part.complete && <small>Master part currently incomplete</small>}</div>
                <div data-label="Course">{CAMBRIDGE_EXAM_COURSE_LABELS[item.course_type]}</div>
                <div data-label="Release">{item.release_date || "—"}</div>
                <div data-label="Due">{item.due_date || "—"}</div>
                <div data-label="Status"><span className={`exam-bank-status is-${item.status}`}>{CAMBRIDGE_EXAM_ASSIGNMENT_STATUS_LABELS[item.status]}</span></div>
                <div className="exam-bank-row-actions"><Link href={`/admin/exam-bank/assignments/${item.id}`}>Edit</Link><button type="button" onClick={(event) => { openerRef.current = event.currentTarget; setMutationError(""); setPending({ assignment: item, action: item.archived_at ? "restore" : "archive" }); }}>{item.archived_at ? "Restore" : "Archive"}</button></div>
              </article>)}
            </div>}
        {total > pageSize && <nav className="exam-assignment-pagination" aria-label="Assignment pages">
          <button type="button" disabled={page === 1 || loading} onClick={() => setPage((current) => Math.max(1, current - 1))}>Previous</button>
          <span>Page {page} of {Math.max(1, Math.ceil(total / pageSize))}</span>
          <button type="button" disabled={page >= Math.ceil(total / pageSize) || loading} onClick={() => setPage((current) => current + 1)}>Next</button>
        </nav>}
      </div>
      {pending && <div className="exam-bank-dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !changing) { setMutationError(""); setPending(null); } }}>
        <div ref={dialogRef} className="exam-bank-dialog" role="alertdialog" aria-modal="true" aria-labelledby="assignment-dialog-title" aria-describedby={`assignment-dialog-description${mutationError ? " assignment-dialog-error" : ""}`} aria-busy={changing}>
          <h2 id="assignment-dialog-title">{pending.action === "archive" ? "Archive assignment?" : "Restore assignment?"}</h2>
          <p id="assignment-dialog-description">{pending.action === "archive" ? "The assignment will be retained and removed from current views." : "The assignment will return as a Draft."}</p>
          {mutationError && <p id="assignment-dialog-error" className="exam-assignment-dialog-error" role="alert">{mutationError}</p>}
          <span className="sr-only" role="status">{changing ? "Updating assignment." : ""}</span>
          <div><button ref={cancelRef} className="exam-bank-button is-secondary" disabled={changing} onClick={() => { setMutationError(""); setPending(null); }}>Cancel</button><button className="exam-bank-button" disabled={changing} onClick={() => void changeStatus()}>{changing ? "Working…" : mutationError ? "Retry" : pending.action === "archive" ? "Archive" : "Restore"}</button></div>
        </div>
      </div>}
    </AdminLayout>
  );
}
