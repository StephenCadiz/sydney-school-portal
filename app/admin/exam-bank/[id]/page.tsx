"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import CambridgeExamEditor from "../../../components/admin/CambridgeExamEditor";
import AdminLayout from "../../../components/layout/AdminLayout";
import { CambridgeExamRecord, formatExamName } from "../../../../lib/cambridgeExamBank";
import { supabase } from "../../../../lib/supabase";

export default function EditCambridgeExamPage() {
  const params = useParams<{ id: string }>();
  const [exam, setExam] = useState<CambridgeExamRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadExam = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const { data } = await supabase.auth.getSession();
      if (!data.session?.access_token) throw new Error("Your session has expired.");
      const response = await fetch(`/api/admin/exam-bank/${params.id}`, {
        headers: { Authorization: `Bearer ${data.session.access_token}` },
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to load the exam.");
      setExam(result.exam);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to load the exam.");
    } finally {
      setLoading(false);
    }
  }, [params.id]);

  useEffect(() => {
    void loadExam();
  }, [loadExam]);

  return (
    <AdminLayout>
      <div className="exam-bank-page">
        <Link className="exam-bank-back" href="/admin/exam-bank">← Cambridge Exam Bank</Link>
        {loading ? (
          <div className="exam-bank-editor-skeleton" aria-label="Loading exam">
            <div /><div /><div /><div />
          </div>
        ) : error || !exam ? (
          <section className="exam-bank-local-error" role="alert">
            <h1>Exam unavailable</h1>
            <p>{error || "This Cambridge exam could not be found."}</p>
            <button className="exam-bank-button" type="button" onClick={() => void loadExam()}>Retry</button>
          </section>
        ) : (
          <>
            <header className="exam-bank-page-header">
              <div>
                <h1>{formatExamName(exam.level.name, exam.exam_number, exam.title)}</h1>
                <p>Last updated {new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" }).format(new Date(exam.updated_at))}</p>
              </div>
              {exam.archived_at && <span className="exam-bank-status is-archived">Archived</span>}
            </header>
            <CambridgeExamEditor exam={exam} />
          </>
        )}
      </div>
    </AdminLayout>
  );
}
