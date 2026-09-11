import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");
const sidebar = read("app/components/layout/TeacherSidebar.tsx");
const styles = read("app/globals.css");
const adminLayout = read("app/components/layout/AdminLayout.tsx");
const studentLayout = read("app/student/StudentMenu.tsx");

test("Teacher navigation links and labels remain unchanged", () => {
  for (const [href, title] of [
    ["/teacher", "Dashboard"],
    ["/teacher/my-classes", "My Classes"],
    ["/teacher/calendar", "Calendar"],
    ["/teacher/resources", "Resources"],
    ["/teacher/results", "Results"],
    ["/teacher/messages", "Messages"],
    ["/teacher/admin", "Admin Tasks"],
  ]) {
    assert.match(sidebar, new RegExp(`href="${href}"`));
    assert.match(sidebar, new RegExp(`title="${title}"`));
  }
});

test("active, hover, pressed, and keyboard focus states remain distinct", () => {
  assert.match(sidebar, /aria-current=\{active \? "page" : undefined\}/);
  assert.match(sidebar, /className="ss-sidebar-link teacher-sidebar-link"/);
  assert.match(styles, /\.teacher-sidebar-link\[aria-current="page"\]/);
  assert.match(styles, /\.teacher-sidebar-link:hover/);
  assert.match(styles, /\.teacher-sidebar-link:active/);
  assert.match(styles, /\.teacher-sidebar-link:focus-visible/);
});

test("Teacher navigation uses a restrained glass treatment and reduced-motion fallback", () => {
  assert.match(styles, /rgba\(255, 255, 255, 0\.14\)/);
  assert.match(styles, /backdrop-filter: blur\(14px\)/);
  assert.match(styles, /inset 0 1px 0 rgba\(255, 255, 255, 0\.16\)/);
  assert.match(styles, /prefers-reduced-motion: reduce/);
});

test("Admin and Student navigation remain on their existing selectors", () => {
  assert.match(adminLayout, /admin-sidebar-link/);
  assert.match(studentLayout, /student-sidebar-nav/);
  assert.doesNotMatch(adminLayout, /teacher-sidebar-link/);
  assert.doesNotMatch(studentLayout, /teacher-sidebar-link/);
});

test("mobile Teacher drawer remains usable", () => {
  assert.match(sidebar, /teacher-sidebar-panel/);
  assert.match(sidebar, /isMobileOpen/);
  assert.match(styles, /\.teacher-sidebar-panel\.is-open/);
  assert.match(styles, /width: 280px !important/);
});
