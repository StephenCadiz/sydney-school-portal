"use client";

import { ReactNode, useState } from "react";
import TeacherSidebar from "./TeacherSidebar";
import PortalHeader from "./PortalHeader";

interface TeacherLayoutProps {
  children: ReactNode;
}

export default function TeacherLayout({
  children,
}: TeacherLayoutProps) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div
      className="teacher-layout-shell"
      style={{
        display: "flex",
        minHeight: "100vh",
        background: "var(--ss-page-bg)",
      }}
    >
      <div className="mobile-topbar">
        <div className="mobile-topbar-title">Sydney School / Teacher</div>
        <button
          type="button"
          className="mobile-menu-button"
          aria-label="Open teacher menu"
          onClick={() => setMenuOpen(true)}
        >
          Menu
        </button>
      </div>

      <button
        type="button"
        aria-label="Close teacher menu"
        className={`mobile-sidebar-overlay ${menuOpen ? "is-open" : ""}`}
        onClick={() => setMenuOpen(false)}
      />

      <TeacherSidebar isMobileOpen={menuOpen} onClose={() => setMenuOpen(false)} />

      <main
        className="teacher-main-content"
        style={{
          flex: 1,
          padding: "40px",
          overflowY: "auto",
          background: "var(--ss-page-bg)",
        }}
      >
        <PortalHeader title="Teacher Dashboard" />

        {children}
      </main>
    </div>
  );
}
