import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");
const studentPage = read("app/student/page.tsx");
const studentMenu = read("app/student/StudentMenu.tsx");
const styles = read("app/globals.css");
const teacherHeader = read("app/components/layout/PortalHeader.tsx");
const adminLayout = read("app/components/layout/AdminLayout.tsx");

test("Student dashboard header uses the shared centered content width", () => {
  assert.match(styles, /\.student-main-content\s*\{[\s\S]*--student-content-max-width:\s*1480px/);
  assert.match(
    styles,
    /\.student-dashboard-page,[\s\S]*max-width:\s*var\(--student-content-max-width, 1480px\)/
  );
  assert.match(styles, /\.student-portal-header\s*\{[\s\S]*width:\s*100%/);
  assert.match(studentPage, /student-dashboard-hero student-portal-header/);
});

test("Student header receives liquid-glass styling without affecting the logo", () => {
  assert.match(styles, /\.student-portal-header\s*\{[\s\S]*radial-gradient/);
  assert.match(styles, /\.student-portal-header\s*\{[\s\S]*box-shadow:/);
  assert.match(styles, /\.student-portal-header,[\s\S]*backdrop-filter: blur\(14px\)/);
  assert.doesNotMatch(styles, /\.student-portal-header img\s*\{[^}]*\b(filter|transform|backdrop-filter|box-shadow)\s*:/);
  assert.match(studentPage, /src="\/LOGO and NAME\.png"/);
});

test("Student navigation keeps labels, routes, active state, and logout", () => {
  for (const [href, label] of [
    ["/student", "Dashboard"],
    ["/student/homework", "Homework"],
    ["/student/messages", "Messages"],
    ["/student/resources", "Resources"],
    ["/student/announcements", "Announcements"],
    ["/student/progress", "Progress"],
  ]) {
    assert.match(studentMenu, new RegExp(`name: "${label}"`));
    assert.match(studentMenu, new RegExp(`href: "${href}"`));
  }
  assert.match(studentMenu, /student-sidebar-link/);
  assert.match(studentMenu, /aria-current=\{active \? "page" : undefined\}/);
  assert.match(studentMenu, /LogoutButton className="student-logout teacher-logout"/);
});

test("Student navigation uses accessible glass interaction states", () => {
  assert.match(styles, /\.student-sidebar-link\s*\{[\s\S]*background: linear-gradient/);
  assert.match(styles, /\.student-sidebar-link:hover/);
  assert.match(styles, /\.student-sidebar-link:active/);
  assert.match(styles, /\.student-sidebar-link\.is-active/);
  assert.match(styles, /\.student-sidebar-link:focus-visible/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.student-sidebar-link/);
  assert.match(styles, /\.teacher-logout \.portal-logout-button/);
});

test("Student responsive layout is constrained without changing Teacher or Admin selectors", () => {
  assert.match(styles, /\.student-layout-shell\s*\{[\s\S]*min-height: 100vh/);
  assert.match(styles, /\.student-main-content\s*\{[\s\S]*box-sizing: border-box/);
  assert.match(styles, /\.student-mobile-topbar-title\s*\{\s*display: none/);
  assert.match(styles, /@media \(max-width: 640px\)[\s\S]*\.student-dashboard-page,[\s\S]*max-width: none/);
  assert.match(styles, /@media \(max-width: 640px\)[\s\S]*\.student-mobile-topbar-title\s*\{\s*display: none/);
  assert.match(teacherHeader, /className="teacher-portal-header"/);
  assert.match(adminLayout, /className="admin-portal-header"/);
  assert.doesNotMatch(styles, /\.student-portal-header[^}]*\.teacher-portal-header/);
});
