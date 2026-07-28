"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import AdminLayout from "../../../../components/layout/AdminLayout";
import CambridgeExamAssignmentEditor from "../../../../components/admin/CambridgeExamAssignmentEditor";
import CambridgeExamBankTabs from "../../../../components/admin/CambridgeExamBankTabs";
import { CambridgeExamAssignmentRecord } from "../../../../../lib/cambridgeExamBank";
import { supabase } from "../../../../../lib/supabase";

export default function EditExamAssignmentPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [assignment, setAssignment] = useState<CambridgeExamAssignmentRecord | null>(null);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [changing, setChanging] = useState(false);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const cancelRef = useRef<HTMLButtonElement | null>(null);
  const openerRef = useRef<HTMLButtonElement | null>(null);
  const changingRef = useRef(false);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const { data } = await supabase.auth.getSession();
      const response = await fetch(`/api/admin/exam-bank/assignments/${id}`, {
        headers: { Authorization: `Bearer ${data.session?.access_token || ""}` },
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to load assignment.");
      setAssignment(result.assignment);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to load assignment.");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { void load(); }, [id]);
  useEffect(() => { changingRef.current = changing; }, [changing]);

  useEffect(() => {
    if (!confirming) return;
    cancelRef.current?.focus();
    function keydown(event: KeyboardEvent) {
      if (event.key === "Escape" && !changingRef.current) {
        event.preventDefault();
        setConfirming(false);
      }
      if (event.key !== "Tab") return;
      const buttons = Array.from(dialogRef.current?.querySelectorAll<HTMLButtonElement>("button:not([disabled])") || []);
      if (!buttons.length) return event.preventDefault();
      if (event.shiftKey && document.activeElement === buttons[0]) {
        event.preventDefault(); buttons[buttons.length - 1].focus();
      } else if (!event.shiftKey && document.activeElement === buttons[buttons.length - 1]) {
        event.preventDefault(); buttons[0].focus();
      }
    }
    document.addEventListener("keydown", keydown);
    return () => {
      document.removeEventListener("keydown", keydown);
      openerRef.current?.focus();
    };
  }, [confirming]);

  async function changeArchiveStatus() {
    if (!assignment || changing) return;
    setChanging(true);
    setActionError("");
    try {
      const { data } = await supabase.auth.getSession();
      const response = await fetch(`/api/admin/exam-bank/assignments/${assignment.id}`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${data.session?.access_token || ""}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ action: assignment.archived_at ? "restore" : "archive" }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to change assignment status.");
      router.push("/admin/exam-bank/assignments");
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : "Unable to change assignment status.");
      setConfirming(false);
    } finally {
      setChanging(false);
    }
  }

  return (
    <AdminLayout>
      <div className="exam-bank-page">
        <CambridgeExamBankTabs />
        <Link className="exam-bank-back" href="/admin/exam-bank/assignments">← Assigned Exams</Link>
        {loading ? <div className="exam-bank-editor-skeleton"><div /><div /><div /></div>
          : error || !assignment ? <div className="exam-bank-local-error" role="alert"><h1>Assignment unavailable</h1><p>{error}</p><button className="exam-bank-button" onClick={() => void load()}>Retry</button></div>
          : <>{actionError && <div className="exam-bank-notice is-error" role="alert">{actionError}</div>}<header className="exam-bank-page-header"><div><h1>Edit Assigned Exam</h1><p>Identity is preserved; only schedule and status may be changed.</p></div><button ref={openerRef} className="exam-bank-button is-secondary" onClick={() => setConfirming(true)}>{assignment.archived_at ? "Restore Assignment" : "Archive Assignment"}</button></header><CambridgeExamAssignmentEditor assignment={assignment} /></>}
      </div>
      {confirming && assignment && <div className="exam-bank-dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !changing) setConfirming(false); }}>
        <div ref={dialogRef} className="exam-bank-dialog" role="alertdialog" aria-modal="true" aria-labelledby="edit-assignment-dialog-title" aria-describedby="edit-assignment-dialog-description" aria-busy={changing}>
          <h2 id="edit-assignment-dialog-title">{assignment.archived_at ? "Restore assignment?" : "Archive assignment?"}</h2>
          <p id="edit-assignment-dialog-description">{assignment.archived_at ? "The assignment will return as a Draft." : "The assignment will be retained and removed from current views."}</p>
          <span className="sr-only" role="status">{changing ? "Updating assignment." : ""}</span>
          <div><button ref={cancelRef} className="exam-bank-button is-secondary" disabled={changing} onClick={() => setConfirming(false)}>Cancel</button><button className="exam-bank-button" disabled={changing} onClick={() => void changeArchiveStatus()}>{changing ? "Working…" : assignment.archived_at ? "Restore" : "Archive"}</button></div>
        </div>
      </div>}
    </AdminLayout>
  );
}
