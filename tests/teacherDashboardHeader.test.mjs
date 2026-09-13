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
const liveClock = read("app/components/layout/TeacherLiveClock.tsx");
const styles = read("app/globals.css");
const adminLayout = read("app/components/layout/AdminLayout.tsx");
const studentMenu = read("app/student/StudentMenu.tsx");

test("Teacher header and Dashboard use the same centered content width", () => {
  assert.match(styles, /\.teacher-main-content[\s\S]*--teacher-content-max-width: 1480px/);
  assert.match(styles, /\.teacher-portal-header[\s\S]*max-width: var\(--teacher-content-max-width, 1480px\)/);
  assert.match(styles, /\.teacher-dashboard-page,[\s\S]*max-width: var\(--teacher-content-max-width\)/);
  assert.match(styles, /\.teacher-portal-header[\s\S]*margin: 0 auto 24px !important/);
  assert.match(styles, /\.teacher-portal-header[\s\S]*width: 100%/);
  assert.match(styles, /\.teacher-dashboard-page \{[\s\S]*max-width: var\(--teacher-content-max-width, 1480px\)/);
  assert.match(styles, /\.teacher-dashboard-page \.teacher-dashboard-primary-grid,[\s\S]*\.teacher-dashboard-page \.teacher-dashboard-feed[\s\S]*max-width: 100%/);
  assert.match(portalHeader, /className="teacher-portal-header"/);
  assert.match(dashboard, /className="teacher-dashboard-page"/);
});

test("Teacher header retains the logo, title, clock, and message control", () => {
  assert.match(portalHeader, /src="\/LOGO and NAME\.png"/);
  assert.match(portalHeader, /alt="Sydney School"/);
  assert.match(portalHeader, /width=\{220\}/);
  assert.match(portalHeader, /height=\{81\}/);
  assert.doesNotMatch(portalHeader, /Sydney School Portal/);
  assert.match(portalHeader, /<TeacherLiveClock showLabel=\{false\} \/>/);
  assert.match(portalHeader, /title: string/);
  assert.match(portalHeader, /teacher-portal-message-control/);
  assert.match(portalHeader, /unreadMessageCount/);
  assert.match(teacherLayout, /<PortalHeader/);
});

test("Teacher header glass styling is scoped to the card, never the logo", () => {
  assert.match(styles, /\.teacher-portal-header \{[\s\S]*radial-gradient/);
  assert.match(styles, /\.teacher-portal-header \{[\s\S]*backdrop-filter: blur\(18px\)/);
  assert.match(styles, /\.teacher-portal-header \{[\s\S]*inset 0 1px 0/);
  assert.doesNotMatch(styles, /\.teacher-portal-header img \{[^}]*\bfilter\s*:/);
  assert.doesNotMatch(styles, /\.teacher-portal-header img \{[^}]*\btransform\s*:/);
  const logoContainerRule = styles.match(/\.teacher-portal-header-brand \{[^}]*\}/)?.[0] || "";
  assert.doesNotMatch(logoContainerRule, /\b(filter|backdrop-filter|box-shadow|transform)\s*:/);
  assert.doesNotMatch(portalHeader, /style=\{\{[\s\S]*filter:/);
});

test("Teacher header is exactly one centimetre taller without changing width", () => {
  assert.match(portalHeader, /padding: "calc\(18px \+ 1cm\) 24px"/);
  assert.match(styles, /\.teacher-portal-header[\s\S]*max-width: var\(--teacher-content-max-width, 1480px\)/);
  assert.match(styles, /\.teacher-portal-header[\s\S]*width: 100%/);
  assert.match(styles, /\.teacher-portal-header-identity/);
});

test("Desktop Working Day and Calendar cards stretch to equal height", () => {
  assert.match(styles, /\.teacher-dashboard-primary-grid \.staff-time-teacher-panel,[\s\S]*\.teacher-dashboard-primary-grid \.teacher-dashboard-calendar \{[\s\S]*align-self: stretch[\s\S]*height: 100%/);
  assert.match(styles, /\.teacher-dashboard-primary-grid \.teacher-dashboard-calendar \{[\s\S]*margin-bottom: 0/);
  assert.match(styles, /@media \(max-width: 840px\)[\s\S]*grid-template-columns: 1fr/);
});

test("Logo and header identity scale proportionally without overflow", () => {
  assert.match(portalHeader, /width=\{220\}/);
  assert.match(portalHeader, /height=\{81\}/);
  assert.match(portalHeader, /fontSize: "2\.2rem"/);
  assert.match(styles, /\.teacher-portal-header-identity strong[\s\S]*font-size: 1\.2rem/);
  assert.match(styles, /overflow-wrap: anywhere/);
});

test("Teacher header clock renders only live time on desktop", () => {
  assert.match(liveClock, /showLabel\?: boolean/);
  assert.match(liveClock, /showLabel \?\? compact/);
  assert.match(portalHeader, /<TeacherLiveClock showLabel=\{false\} \/>/);
  assert.doesNotMatch(portalHeader, /Madrid Time/);
});

test("Dashboard greeting is owned by the shared Teacher header", () => {
  assert.doesNotMatch(dashboard, /teacher-dashboard-header/);
  assert.match(portalHeader, /Good morning/);
  assert.match(portalHeader, /Good afternoon/);
  assert.match(portalHeader, /Good evening/);
  assert.match(portalHeader, /Logged in as \$\{visibleFirstName\}/);
  assert.match(portalHeader, /Your teaching workspace/);
  assert.match(teacherLayout, /showWelcome/);
});

test("Teacher identity persists by route and clears on logout", () => {
  assert.match(teacherLayout, /teacher-welcome-seen:/);
  assert.match(teacherLayout, /pathname === "\/teacher"/);
  assert.match(teacherLayout, /window\.sessionStorage\.setItem/);
  assert.match(teacherLayout, /event !== "SIGNED_OUT"/);
  assert.match(teacherLayout, /setTeacherFirstName\(""\)/);
  assert.match(teacherLayout, /setShowWelcome\(false\)/);
});

test("Teacher header uses a scoped liquid-glass card treatment", () => {
  assert.match(styles, /\.teacher-portal-header \{/);
  assert.match(styles, /\.teacher-portal-header \{[\s\S]*radial-gradient/);
  assert.match(styles, /\.teacher-portal-header \{[\s\S]*backdrop-filter: blur\(18px\)/);
  assert.match(styles, /\.teacher-portal-header \{[\s\S]*inset 0 1px 0/);
  assert.match(styles, /\.teacher-portal-header::before \{[\s\S]*display: none !important/);
  assert.doesNotMatch(styles, /\.teacher-portal-header img \{[^}]*\bfilter\s*:/);
  assert.doesNotMatch(styles, /\.teacher-portal-header img \{[^}]*\btransform\s*:/);
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

test("Teacher mobile layout uses one compact responsive header and preserves navigation", () => {
  assert.match(styles, /@media \(max-width: 640px\)[\s\S]*\.teacher-portal-header/);
  assert.match(styles, /\.teacher-portal-header[\s\S]*display: grid !important/);
  assert.match(styles, /\.teacher-main-content > \.teacher-portal-header > \.teacher-portal-header-brand[\s\S]*flex-direction: row !important/);
  assert.match(styles, /\.teacher-main-content > \.teacher-portal-header \.teacher-live-clock\.is-header[\s\S]*display: grid/);
  assert.match(portalHeader, /className="mobile-menu-button teacher-header-menu-button"/);
  assert.doesNotMatch(teacherLayout, /className="mobile-topbar"/);
  assert.match(styles, /\.teacher-dashboard-page \{[\s\S]*width: 100%/);
  assert.match(styles, /\.teacher-main-content > \.teacher-portal-header/);
  assert.match(styles, /\.teacher-dashboard-page,[\s\S]*max-width: 100%/);
});

test("Teacher mobile header stays compact at narrow widths without overflow", () => {
  assert.match(portalHeader, /className="mobile-menu-button teacher-header-menu-button"/);
  assert.match(styles, /grid-template-columns: minmax\(0, 1fr\) auto !important/);
  assert.match(styles, /max-width: 112px !important/);
  assert.match(styles, /overflow-wrap: anywhere/);
  assert.doesNotMatch(styles, /teacher-layout-shell > \.mobile-topbar/);
});

test("dashboard controls and content labels remain intact", () => {
  assert.match(dashboard, /Working Day|Teacher Calendar|Tools/);
  assert.match(workingDay, /Sign In|Sign Out/);
  assert.match(workingDay, /Request a correction/);
  assert.match(calendar, /View Calendar/);
  assert.match(dashboard, /teacher-dashboard-tool-row/);
  assert.match(dashboard, /teacher-dashboard-primary-grid/);
});
