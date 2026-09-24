"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function AdminStudentsTabs() {
  const pathname = usePathname();
  const studentInformationActive = pathname.startsWith(
    "/admin/student-information"
  );

  function prepareContentNavigation(href: string) {
    try {
      window.sessionStorage.setItem("admin-nav-close-after-navigation", href);
    } catch {
      // Session storage may be unavailable in privacy-restricted browsers.
    }
    window.dispatchEvent(
      new CustomEvent("admin-content-navigation", { detail: { href } })
    );
  }

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
        onClick={(event) => {
          event.stopPropagation();
          prepareContentNavigation("/admin/students");
        }}
      >
        Students
      </Link>
      <Link
        href="/admin/student-information"
        aria-current={studentInformationActive ? "page" : undefined}
        className={studentInformationActive ? "is-active" : ""}
        onClick={(event) => {
          event.stopPropagation();
          prepareContentNavigation("/admin/student-information");
        }}
      >
        Student Information
      </Link>
    </nav>
  );
}
