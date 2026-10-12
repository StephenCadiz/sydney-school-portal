import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const layout = read("app/components/layout/AdminLayout.tsx");
const teacherLayout = read("app/components/layout/TeacherLayout.tsx");
const shell = read("app/components/pwa/AdminPwaShell.tsx");
const dashboard = read("app/components/pwa/AdminPwaDashboard.tsx");
const studentInformation = read("app/components/pwa/AdminPwaStudentInformation.tsx");
const settings = read("app/components/pwa/AdminPwaSettings.tsx");
const biometricToggle = read("app/components/pwa/PwaBiometricToggle.tsx");
const notifications = read("app/components/pwa/PwaInstallAndNotifications.tsx");
const routeLayout = read("app/admin/layout.tsx");
const styles = read("app/globals.css");
const chatRoute = read("app/admin/chat/page.tsx");

test("Admin installed PWA uses a separate four-tab shell without changing browser navigation", () => {
  assert.match(shell, /Dashboard/);
  assert.match(shell, /href=.*\/admin/);
  assert.match(layout, /display-mode: standalone/);
  assert.match(layout, /<AdminPwaShell/);
  assert.match(layout, /if \(installedPwa\)/);
  assert.match(layout, /typeof children !== "function"/);
  assert.match(shell, /href=\"\/admin\/chat\"/);
  assert.match(shell, /aria-label=\"Admin PWA navigation\"/);
  assert.match(shell, /<span>Messages<\/span>/);
  assert.match(shell, /href="\/admin\?tab=student-information"/);
  assert.match(shell, /href="\/admin\?tab=settings"/);
  assert.match(shell, /<span>Student Information<\/span>/);
  assert.match(shell, /<span>Settings<\/span>/);
  assert.match(shell, /AdminPwaDashboard/);
  assert.match(shell, /AdminPwaStudentInformation/);
  assert.match(shell, /AdminPwaSettings/);
  assert.doesNotMatch(shell, /Open Staff Chat/);
  assert.doesNotMatch(shell, /PwaInstallAndNotifications/);
  assert.doesNotMatch(shell, /PasskeyEnrollment/);
  assert.doesNotMatch(shell, /People & Classes|Calendar & Scheduling|Staff Time/);
});

test("Admin phone PWA dashboard is calendar-only", () => {
  assert.match(dashboard, /Upcoming calendar/);
  assert.match(dashboard, /getUpcomingTeacherCalendarEvents/);
  assert.match(dashboard, /getUpcomingCalendarGroups/);
  assert.match(shell, /isDashboard/);
});

test("Admin phone PWA student information is read-only name search", () => {
  assert.match(studentInformation, /getAdminStudentAttendanceSummary/);
  assert.match(studentInformation, /Homework averages/);
  assert.match(studentInformation, /Class exam average/);
  assert.match(studentInformation, /Follow-up documents/);
  assert.match(studentInformation, /attended/);
  assert.match(studentInformation, /missed/);
  assert.match(studentInformation, /searchAllStudents/);
  assert.match(studentInformation, /getStudentInformation/);
  assert.match(studentInformation, /READ-ONLY LOOKUP/);
  assert.match(studentInformation, /Search student by name/);
  assert.match(studentInformation, /admin-pwa-student-overlay/);
  assert.doesNotMatch(studentInformation, /Access Control|Student Management/);
});

test("Admin phone PWA settings reuse the Student PWA notification and biometric controls", () => {
  assert.match(settings, /PwaNotificationToggle/);
  assert.match(settings, /PwaBiometricToggle/);
  assert.match(biometricToggle, /registerPasskey/);
  assert.match(biometricToggle, /after logout or session expiry/);
});

test("Admin PWA identity is resolved before the limited shell renders", () => {
  assert.match(layout, /adminAccessResolved/);
  assert.match(shell, /Checking your Admin access/);
  assert.match(shell, /fullName/);
  assert.match(shell, /ADMIN PORTAL/);
  assert.match(routeLayout, /profile\?\.role !== \"admin\"/);
});

test("Admin PWA opens the existing Staff Chat and preserves participant authorization", () => {
  assert.match(layout, /pathname === "\/admin\/chat"/);
  assert.match(chatRoute, /StaffChatView/);
  assert.match(shell, /api\/chat\/conversations/);
  assert.match(shell, /staff-chat-unread-changed/);
});

test("Admin PWA bottom navigation supports iOS safe areas and mobile focus", () => {
  assert.match(styles, /\.admin-pwa-bottom-nav/);
  assert.match(styles, /env\(safe-area-inset-bottom\)/);
  assert.match(styles, /\.admin-pwa-bottom-nav a:focus-visible/);
  assert.match(styles, /backdrop-filter: blur\(18px\)/);
});

test("Teacher and Admin PWA bottom navigation stays fixed to the viewport", () => {
  assert.match(styles, /teacher-layout-shell\.is-installed-pwa \.teacher-pwa-bottom-nav,[\s\S]*admin-pwa-shell \.admin-pwa-bottom-nav/);
  assert.match(styles, /position: fixed !important/);
  assert.match(styles, /inset-block-end: 0/);
  assert.match(styles, /block-size: calc\(66px \+ env\(safe-area-inset-bottom\)\)/);
  assert.match(styles, /translate3d\(0, 0, 0\)/);
  assert.match(styles, /teacher-layout-shell\.is-installed-pwa \.teacher-main-content[\s\S]*padding-bottom: calc\(82px \+ env\(safe-area-inset-bottom\)/);
  assert.match(styles, /\.admin-pwa-shell[\s\S]*padding-bottom: calc\(82px \+ env\(safe-area-inset-bottom\)/);
});

test("Admin PWA does not introduce an offline private-data cache", () => {
  assert.doesNotMatch(shell, /caches\.open|localStorage|sessionStorage/);
  assert.match(shell, /cache: "no-store"/);
});

test("Teacher and Admin chat PWAs use a dedicated full-screen surface", () => {
  assert.match(teacherLayout, /isInstalledChatPwa = installedPwa && pathname === "\/teacher\/chat"/);
  assert.match(teacherLayout, /is-installed-pwa-chat/);
  assert.match(teacherLayout, /!isInstalledChatPwa && \([\s\S]*<PortalHeader/);
  assert.match(teacherLayout, /!isInstalledChatPwa && <PwaInstallAndNotifications/);
  assert.match(shell, /is-admin-chat-pwa/);
  assert.match(shell, /!isChat && <header className="admin-pwa-header">/);
  assert.match(styles, /\.is-admin-chat-pwa \.admin-pwa-header\s*\{[\s\S]*display: none/);
  assert.match(styles, /\.is-installed-pwa-chat \.teacher-main-content/);
  assert.match(styles, /\.admin-pwa-chat-main/);
});
