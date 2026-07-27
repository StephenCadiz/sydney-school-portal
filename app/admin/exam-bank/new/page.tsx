"use client";

import Link from "next/link";

import CambridgeExamEditor from "../../../components/admin/CambridgeExamEditor";
import AdminLayout from "../../../components/layout/AdminLayout";

export default function AddCambridgeExamPage() {
  return (
    <AdminLayout>
      <div className="exam-bank-page">
        <Link className="exam-bank-back" href="/admin/exam-bank">← Cambridge Exam Bank</Link>
        <header className="exam-bank-page-header">
          <div>
            <h1>Add Cambridge Exam</h1>
            <p>Store each exam paper, audio file, key and writing sample once for future reuse.</p>
          </div>
        </header>
        <CambridgeExamEditor />
      </div>
    </AdminLayout>
  );
}
