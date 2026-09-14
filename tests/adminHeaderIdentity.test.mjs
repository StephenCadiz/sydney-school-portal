import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");
const adminLayout = read("app/components/layout/AdminLayout.tsx");
const adminPage = read("app/admin/page.tsx");
const teacherLayout = read("app/components/layout/TeacherLayout.tsx");
const studentPage = read("app/student/page.tsx");
const styles = read("app/globals.css");

test("shared Admin header uses the authenticated profile and route-aware label", () => {
  assert.match(adminLayout, /select\("role, first_name, last_name"\)/);
  assert.match(adminLayout, /pathname === "\/admin"/);
  assert.match(adminLayout, /`Welcome, \$\{adminName\.firstName/);
  assert.match(adminLayout, /`Logged in as \$\{adminName\.fullName\}`/);
  assert.match(adminLayout, /className="admin-portal-header-identity"/);
});

test("Admin identity is rendered beside the shared logo with mail and date controls", () => {
  assert.match(adminLayout, /className="admin-portal-header-logo"/);
  assert.match(adminLayout, /className="admin-portal-header-brand"/);
  assert.match(adminLayout, /className="admin-portal-header-status"/);
  assert.match(adminLayout, /href="\/admin\/messages"/);
  assert.match(adminLayout, /getDisplayDate\(\)/);
  assert.match(adminLayout, /<h1>Admin Portal<\/h1>/);
  assert.match(adminLayout, /<TeacherLiveClock showLabel=\{false\} \/>/);
  assert.match(adminLayout, /Your admin workspace/);
  assert.match(adminLayout, /src="\/LOGO and NAME\.png"/);
  assert.match(adminLayout, /width=\{220\}/);
  assert.match(adminLayout, /height=\{81\}/);
  assert.match(adminLayout, /style=\{\{[\s\S]*height: "auto",[\s\S]*width: "auto"/);
  assert.doesNotMatch(adminLayout, /Sydney School Portal/);
});

test("Admin header uses the centered glass card treatment without changing its width", () => {
  assert.match(styles, /\.admin-portal-header \{[\s\S]*radial-gradient/);
  assert.match(styles, /\.admin-main-content \{[\s\S]*--admin-content-max-width: 1480px/);
  assert.match(styles, /\.admin-portal-header \{[\s\S]*max-width: var\(--admin-content-max-width\)/);
  assert.match(styles, /\.admin-portal-header \{[\s\S]*backdrop-filter: blur\(18px\)/);
  assert.match(styles, /\.admin-portal-header \{[\s\S]*inset 0 1px 0/);
  assert.match(styles, /\.admin-portal-header-title h1/);
  assert.match(styles, /\.admin-portal-header \{[\s\S]*flex-wrap: wrap/);
  assert.match(styles, /\.admin-portal-header \{[\s\S]*gap: 20px/);
  assert.match(styles, /\.admin-portal-header-brand \{[\s\S]*flex: 1 1 420px/);
  assert.match(styles, /\.admin-portal-header-brand \{[\s\S]*gap: 16px/);
  assert.match(styles, /\.admin-portal-header \.admin-dashboard-message-control/);
  assert.match(styles, /\.admin-portal-header \.admin-dashboard-message-control:focus-visible/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)[\s\S]*admin-portal-header \.admin-dashboard-message-control/);
  assert.doesNotMatch(styles, /\.admin-portal-header-logo[^}]*\b(filter|backdrop-filter|box-shadow|transform)\s*:/);
});

test("Admin page roots share the header container without stretching nested controls", () => {
  assert.match(adminLayout, /className="admin-main-content-inner"/);
  assert.match(styles, /\.admin-main-content-inner \{[\s\S]*max-width: var\(--admin-content-max-width\)/);
  assert.match(styles, /\.admin-main-content-inner > \* \{[\s\S]*max-width: 100% !important/);
  assert.match(styles, /\.admin-main-content-inner > \* \{[\s\S]*min-width: 0/);
  assert.match(styles, /\.admin-main-content-inner > \.admin-staff-page \{[\s\S]*padding-left: 0/);
  assert.match(styles, /@media \(max-width: 768px\)[\s\S]*\.admin-main-content,\s*\.teacher-main-content[\s\S]*padding: 22px 16px/);
});

test("Unread messages stay in the Admin header with clear alert and zero states", () => {
  assert.doesNotMatch(adminLayout, /showDashboardMessageAlert|admin-dashboard-message-alert|unread staff message/);
  assert.match(adminLayout, /<EnvelopeIcon size=\{24\} \/>/);
  assert.match(adminLayout, /className="admin-dashboard-message-count"/);
  assert.match(styles, /\.admin-dashboard-message-control\.has-unread \{[\s\S]*background: #fff1f2/);
  assert.match(styles, /\.admin-dashboard-message-control\.has-unread \{[\s\S]*color: #b42318/);
  assert.match(styles, /\.admin-dashboard-message-control\.has-unread[\s\S]*\.admin-dashboard-message-count[\s\S]*color: #b42318/);
  assert.match(styles, /\.admin-dashboard-message-count \{[\s\S]*font-size: 16px/);
  assert.match(styles, /\.admin-dashboard-message-control \{[\s\S]*color: var\(--ss-blue-dark\)/);
  assert.match(adminLayout, /href="\/admin\/messages"/);
  assert.match(adminLayout, /className="admin-mobile-status-link"/);
  assert.match(styles, /@media \(max-width: 680px\)[\s\S]*\.admin-portal-header/);
});

test("Admin dashboard omits the redundant title card while retaining dashboard sections", () => {
  assert.doesNotMatch(adminPage, /<h1>Admin Dashboard<\/h1>/);
  assert.doesNotMatch(adminPage, /Academy management and daily operations\./);
  assert.match(adminPage, /<h2>Academy Overview<\/h2>/);
  assert.match(adminPage, /<h2>Quick Actions<\/h2>/);
  assert.doesNotMatch(adminPage, /<Image/);
});

test("Teacher and Student pages do not use the Admin identity label", () => {
  assert.match(teacherLayout, /title="Teacher Portal"/);
  assert.doesNotMatch(studentPage, /<h1>Admin Portal<\/h1>/);
  assert.doesNotMatch(teacherLayout, /admin-portal-header/);
  assert.doesNotMatch(studentPage, /admin-portal-header/);
});

test("profile-loading fallback remains safe when the Admin profile is unavailable", () => {
  assert.match(adminLayout, /const identityLabel = adminName\.fullName/);
  assert.match(adminLayout, /: "Admin";/);
  assert.match(adminLayout, /if \(!error && profile\?\.role === "admin"/);
});
