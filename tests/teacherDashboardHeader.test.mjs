import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");
const portalHeader = read("app/components/layout/PortalHeader.tsx");
const teacherLayout = read("app/components/layout/TeacherLayout.tsx");
const dashboard = read("app/teacher/page.tsx");
const workingDay = read("app/components/teacher/TeacherWorkingDayPanel.tsx");
const calendar = read("app/components/teacher/TeacherCalendarAgenda.tsx");
const styles = read("app/globals.css");
const adminLayout = read("app/components/layout/AdminLayout.tsx");
const studentMenu = read("app/student/StudentMenu.tsx");

test("Teacher header and Dashboard use the same centered content width", () => {
  assert.match(styles, /\.teacher-main-content[\s\S]*--teacher-content-max-width: 1480px/);
  assert.match(styles, /\.teacher-portal-header[\s\S]*max-width: var\(--teacher-content-max-width, 1480px\)/);
  assert.match(styles, /\.teacher-dashboard-page,[\s\S]*max-width: var\(--teacher-content-max-width\)/);
  assert.match(styles, /\.teacher-portal-header[\s\S]*margin: 0 auto 24px !important/);
  assert.match(styles, /\.teacher-portal-header[\s\S]*width: 100%/);
  assert.match(portalHeader, /className="teacher-portal-header"/);
  assert.match(dashboard, /className="teacher-dashboard-page"/);
});

test("Teacher header retains logo, title, subtitle, clock, and message control", () => {
  assert.match(portalHeader, /src="\/LOGO and NAME\.png"/);
  assert.match(portalHeader, /alt="Sydney School"/);
  assert.match(portalHeader, /<TeacherLiveClock \/>/);
  assert.match(portalHeader, /title: string/);
  assert.match(portalHeader, /Sydney School Portal/);
  assert.match(dashboard, /admin-dashboard-message-control/);
  assert.match(teacherLayout, /<PortalHeader title="Teacher Portal" \/>/);
});

test("Teacher header is a solid card while dashboard surfaces use the sidebar language", () => {
  assert.match(styles, /\.teacher-portal-header \{/);
  assert.match(styles, /\.teacher-portal-header \{[\s\S]*background: #ffffff !important/);
  assert.match(styles, /\.teacher-portal-header::before \{[\s\S]*display: none !important/);
  assert.match(styles, /\.teacher-dashboard-page \.teacher-dashboard-section,[\s\S]*linear-gradient\(/);
  assert.match(styles, /\.teacher-dashboard-page \.staff-time-primary-action/);
  assert.match(styles, /\.teacher-dashboard-page \.teacher-dashboard-tool-row:hover/);
  assert.match(styles, /\.teacher-dashboard-page \.teacher-dashboard-section-link:focus-visible/);
  assert.match(styles, /prefers-reduced-motion: reduce/);
});

test("Admin and Student header/navigation styling remains separate", () => {
  assert.match(adminLayout, /admin-sidebar-panel/);
  assert.match(studentMenu, /student-sidebar-nav/);
  assert.doesNotMatch(adminLayout, /teacher-portal-header/);
  assert.doesNotMatch(studentMenu, /teacher-portal-header/);
});

test("Teacher mobile layout keeps the existing responsive header and dashboard flow", () => {
  assert.match(styles, /@media \(max-width: 640px\)[\s\S]*\.teacher-portal-header/);
  assert.match(styles, /\.teacher-layout-shell > \.mobile-topbar/);
  assert.match(styles, /\.teacher-dashboard-page \{[\s\S]*width: 100%/);
  assert.match(styles, /\.teacher-main-content > \.teacher-portal-header/);
  assert.match(styles, /\.teacher-dashboard-page,[\s\S]*max-width: 100%/);
});

test("dashboard controls and content labels remain intact", () => {
  assert.match(dashboard, /Working Day|Teacher Calendar|Tools/);
  assert.match(workingDay, /Sign In|Sign Out/);
  assert.match(workingDay, /Request a correction/);
  assert.match(calendar, /View Calendar/);
  assert.match(dashboard, /teacher-dashboard-tool-row/);
  assert.match(dashboard, /teacher-dashboard-primary-grid/);
});
