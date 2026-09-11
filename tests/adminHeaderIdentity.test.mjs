import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");
const adminLayout = read("app/components/layout/AdminLayout.tsx");
const adminPage = read("app/admin/page.tsx");
const teacherLayout = read("app/components/layout/TeacherLayout.tsx");
const studentPage = read("app/student/page.tsx");

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
});

test("Admin dashboard keeps its title and subtitle while using the shared header", () => {
  assert.match(adminPage, /<h1>Admin Dashboard<\/h1>/);
  assert.match(adminPage, /Academy management and daily operations\./);
  assert.doesNotMatch(adminPage, /<Image/);
});

test("Teacher and Student pages do not use the Admin identity label", () => {
  assert.doesNotMatch(teacherLayout, /Logged in as|Welcome,/);
  assert.doesNotMatch(studentPage, /Logged in as|Welcome,/);
});

test("profile-loading fallback remains safe when the Admin profile is unavailable", () => {
  assert.match(adminLayout, /const identityLabel = adminName\.fullName/);
  assert.match(adminLayout, /: "Admin";/);
  assert.match(adminLayout, /if \(!error && profile\?\.role === "admin"/);
});
