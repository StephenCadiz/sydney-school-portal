"use client";

import { useState } from "react";

import StudentMenu from "../StudentMenu";

export default function ResourcesPage() {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="student-layout-shell">
      <div className="student-mobile-topbar">
        <div className="student-mobile-topbar-title">Sydney School / Student</div>
        <button
          type="button"
          className="mobile-menu-button"
          aria-label="Open student menu"
          onClick={() => setMenuOpen(true)}
        >
          Menu
        </button>
      </div>

      {menuOpen && (
        <button
          type="button"
          aria-label="Close student menu"
          className="student-mobile-drawer-overlay"
          onClick={() => setMenuOpen(false)}
        />
      )}

      <div className={`student-mobile-drawer ${menuOpen ? "open" : ""}`}>
        <button
          type="button"
          className="student-mobile-drawer-close"
          onClick={() => setMenuOpen(false)}
        >
          Close
        </button>
        <StudentMenu mobileMode onClose={() => setMenuOpen(false)} />
      </div>

      <aside className="student-desktop-sidebar">
        <StudentMenu />
      </aside>

      <main className="student-main-content student-resources-page">
        <header className="student-resources-header">
          <h1>Resources</h1>
          <p>Download worksheets, PDFs, audio files and extra learning materials.</p>
        </header>

        <section className="student-resources-card">
          <h2>Week 1 Resources</h2>

          <div className="student-resources-item">
            <strong>B2 Reading Worksheet</strong>

            <p>
              Additional Cambridge Reading Part 5 practice.
            </p>

            <button
              type="button"
              className="student-resources-action"
            >
              Download PDF
            </button>
          </div>
        </section>
      </main>
    </div>
  );
}
