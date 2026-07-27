"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import AdminLayout from "../../components/layout/AdminLayout";
import { CambridgeExamRecord, formatExamName } from "../../../lib/cambridgeExamBank";
import { supabase } from "../../../lib/supabase";

type PendingAction = { exam: CambridgeExamRecord; action: "archive" | "restore" };

export default function CambridgeExamBankPage() {
  const [exams, setExams] = useState<CambridgeExamRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [level, setLevel] = useState("all");
  const [status, setStatus] = useState("active");
  const [search, setSearch] = useState("");
  const [openMenu, setOpenMenu] = useState("");
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [changing, setChanging] = useState(false);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const cancelDialogRef = useRef<HTMLButtonElement | null>(null);
  const dialogOpenerRef = useRef<HTMLButtonElement | null>(null);
  const addExamRef = useRef<HTMLAnchorElement | null>(null);
  const changingRef = useRef(false);

  useEffect(() => {
    changingRef.current = changing;
  }, [changing]);

  useEffect(() => {
    if (!pending) return;

    cancelDialogRef.current?.focus();

    function handleDialogKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !changingRef.current) {
        event.preventDefault();
        setPending(null);
        return;
      }

      if (event.key !== "Tab") return;

      const focusable = Array.from(
        dialogRef.current?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        ) || []
      );
      if (focusable.length === 0) {
        event.preventDefault();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleDialogKeyDown);
    return () => {
      document.removeEventListener("keydown", handleDialogKeyDown);
      if (dialogOpenerRef.current?.isConnected) {
        dialogOpenerRef.current.focus();
      } else {
        addExamRef.current?.focus();
      }
    };
  }, [pending]);

  const getToken = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session?.access_token) throw new Error("Your session has expired.");
    return data.session.access_token;
  }, []);

  const loadExams = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const token = await getToken();
      const response = await fetch("/api/admin/exam-bank?status=all", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to load Cambridge exams.");
      setExams(result.exams || []);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to load Cambridge exams.");
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  useEffect(() => {
    void loadExams();
  }, [loadExams]);

  const visible = useMemo(() => {
    const query = search.trim().toLowerCase();
    return exams.filter((exam) => {
      const statusMatch =
        status === "all" ||
        (status === "active" && !exam.archived_at) ||
        (status === "archived" && Boolean(exam.archived_at));
      return (
        (level === "all" || exam.level.name === level) &&
        statusMatch &&
        (!query ||
          String(exam.exam_number).includes(query) ||
          (exam.title || "").toLowerCase().includes(query))
      );
    });
  }, [exams, level, search, status]);

  const readyCount = visible.filter((exam) => exam.completeness.ready).length;

  async function changeStatus() {
    if (!pending || changing) return;
    setChanging(true);
    try {
      const token = await getToken();
      const response = await fetch(`/api/admin/exam-bank/${pending.exam.id}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ action: pending.action }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to change exam status.");
      setExams((current) => current.map((exam) => exam.id === result.exam.id ? result.exam : exam));
      setPending(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to change exam status.");
      setPending(null);
    } finally {
      setChanging(false);
    }
  }

  return (
    <AdminLayout>
      <div className="exam-bank-page">
        <header className="exam-bank-page-header">
          <div>
            <h1>Cambridge Exam Bank</h1>
            <p>Reusable Cambridge papers, audio, keys and sample answers.</p>
          </div>
          <Link ref={addExamRef} className="exam-bank-button" href="/admin/exam-bank/new">Add Exam</Link>
        </header>

        <div className="exam-bank-summary" aria-live="polite">
          {visible.length} exams · {readyCount} ready · {visible.length - readyCount} incomplete
        </div>

        <section className="exam-bank-controls" aria-label="Exam Bank filters">
          <div className="exam-bank-filter-group" aria-label="Level">
            {["all", "B1", "B2", "C1", "C2"].map((item) => (
              <button type="button" key={item} className={level === item ? "is-active" : ""} onClick={() => setLevel(item)}>
                {item === "all" ? "All Levels" : item}
              </button>
            ))}
          </div>
          <div className="exam-bank-filter-group" aria-label="Status">
            {(["active", "archived", "all"] as const).map((item) => (
              <button type="button" key={item} className={status === item ? "is-active" : ""} onClick={() => setStatus(item)}>
                {item === "all" ? "All Statuses" : item[0].toUpperCase() + item.slice(1)}
              </button>
            ))}
          </div>
          <label className="exam-bank-search">
            <span className="sr-only">Search exams</span>
            <input type="search" placeholder="Search exam number or title" value={search} onChange={(event) => setSearch(event.target.value)} />
          </label>
        </section>

        {error && (
          <div className="exam-bank-notice is-error" role="alert">
            <span>{error}</span>
            <button type="button" onClick={() => void loadExams()}>Retry</button>
          </div>
        )}

        {loading ? (
          <div className="exam-bank-list-skeleton" aria-label="Loading exams">
            {[1, 2, 3, 4].map((item) => <div key={item} />)}
          </div>
        ) : visible.length === 0 ? (
          <section className="exam-bank-empty">
            <h2>{exams.length ? "No exams match these filters." : "No Cambridge exams have been added yet."}</h2>
            <p>{exams.length ? "Adjust the level, status or search." : "Add the first reusable Cambridge exam."}</p>
            {!exams.length && <Link className="exam-bank-button" href="/admin/exam-bank/new">Add Exam</Link>}
          </section>
        ) : (
          <div className="exam-bank-sheet">
            <div className="exam-bank-sheet-head" aria-hidden="true">
              <span>Exam</span><span>Level</span><span>Completeness</span><span>Status</span><span>Updated</span><span>Actions</span>
            </div>
            {visible.map((exam) => (
              <article className="exam-bank-row" key={exam.id}>
                <div className="exam-bank-row-title"><strong>{formatExamName(exam.level.name, exam.exam_number, exam.title)}</strong><span>{exam.title || "No internal title"}</span></div>
                <div data-label="Level">{exam.level.name}</div>
                <div data-label="Completeness"><strong>{exam.completeness.complete_parts} of 4 parts complete</strong><span>{exam.completeness.ready ? "All required resources stored" : exam.completeness.missing[0]}</span></div>
                <div data-label="Status"><span className={`exam-bank-status ${exam.archived_at ? "is-archived" : exam.completeness.ready ? "is-ready" : "is-incomplete"}`}>{exam.archived_at ? "Archived" : exam.completeness.ready ? "Ready" : "Incomplete"}</span></div>
                <div data-label="Updated">{new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" }).format(new Date(exam.updated_at))}</div>
                <div className="exam-bank-row-actions">
                  <Link href={`/admin/exam-bank/${exam.id}`}>Edit</Link>
                  <div className="exam-bank-actions-menu">
                    <button type="button" aria-label={`More actions for ${formatExamName(exam.level.name, exam.exam_number)}`} aria-expanded={openMenu === exam.id} onClick={() => setOpenMenu((current) => current === exam.id ? "" : exam.id)}>•••</button>
                    {openMenu === exam.id && (
                      <div role="menu">
                        <button role="menuitem" type="button" onClick={(event) => { dialogOpenerRef.current = event.currentTarget; setPending({ exam, action: exam.archived_at ? "restore" : "archive" }); }}>
                          {exam.archived_at ? "Restore Exam" : "Archive Exam"}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>

      {pending && (
        <div
          className="exam-bank-dialog-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !changing) {
              setPending(null);
            }
          }}
        >
          <div ref={dialogRef} className="exam-bank-dialog" role="alertdialog" aria-modal="true" aria-labelledby="exam-status-dialog-title" aria-describedby="exam-status-dialog-description" aria-busy={changing}>
            <h2 id="exam-status-dialog-title">{pending.action === "archive" ? "Archive exam?" : "Restore exam?"}</h2>
            <p id="exam-status-dialog-description">
              {pending.action === "archive"
                ? "The exam will leave the Active view but remain stored safely."
                : "The exam will return to the Active view."}
            </p>
            <span className="sr-only" role="status" aria-live="polite">
              {changing ? "Updating exam status." : ""}
            </span>
            <div>
              <button ref={cancelDialogRef} className="exam-bank-button is-secondary" type="button" onClick={() => setPending(null)} disabled={changing}>Cancel</button>
              <button className="exam-bank-button" type="button" onClick={() => void changeStatus()} disabled={changing}>{changing ? "Working…" : pending.action === "archive" ? "Archive Exam" : "Restore Exam"}</button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
