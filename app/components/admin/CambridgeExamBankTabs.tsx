"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function CambridgeExamBankTabs() {
  const pathname = usePathname();
  const assigned = pathname.startsWith("/admin/exam-bank/assignments");
  return (
    <nav className="exam-bank-tabs" aria-label="Cambridge Exam Bank sections">
      <Link href="/admin/exam-bank" aria-current={!assigned ? "page" : undefined} className={!assigned ? "is-active" : ""}>
        Exam Bank
      </Link>
      <Link href="/admin/exam-bank/assignments" aria-current={assigned ? "page" : undefined} className={assigned ? "is-active" : ""}>
        Assigned Exams
      </Link>
    </nav>
  );
}
