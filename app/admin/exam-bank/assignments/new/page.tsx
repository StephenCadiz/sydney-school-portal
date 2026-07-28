"use client";

import Link from "next/link";

import AdminLayout from "../../../../components/layout/AdminLayout";
import CambridgeExamAssignmentEditor from "../../../../components/admin/CambridgeExamAssignmentEditor";
import CambridgeExamBankTabs from "../../../../components/admin/CambridgeExamBankTabs";

export default function NewExamAssignmentPage() {
  return (
    <AdminLayout>
      <div className="exam-bank-page">
        <CambridgeExamBankTabs />
        <Link className="exam-bank-back" href="/admin/exam-bank/assignments">← Assigned Exams</Link>
        <header className="exam-bank-page-header">
          <div><h1>Assign Cambridge Exam</h1><p>Assign a complete exam or selected complete parts to one or more courses.</p></div>
        </header>
        <CambridgeExamAssignmentEditor />
      </div>
    </AdminLayout>
  );
}
