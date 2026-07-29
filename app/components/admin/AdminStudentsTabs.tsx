"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function AdminStudentsTabs() {
  const pathname = usePathname();
  const studentInformationActive = pathname.startsWith(
    "/admin/student-information"
  );

  return (
    <nav
      className="exam-bank-tabs"
      aria-label="Students sections"
      style={{ marginBottom: 0 }}
    >
      <Link
        href="/admin/students"
        aria-current={!studentInformationActive ? "page" : undefined}
        className={!studentInformationActive ? "is-active" : ""}
      >
        Students
      </Link>
      <Link
        href="/admin/student-information"
        aria-current={studentInformationActive ? "page" : undefined}
        className={studentInformationActive ? "is-active" : ""}
      >
        Student Information
      </Link>
    </nav>
  );
}
