import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const route = read("app/api/pwa/unread-count/route.ts");
const hook = read("app/components/pwa/usePwaUnreadCounts.ts");
const teacherNav = read("app/components/pwa/TeacherPwaBottomNav.tsx");
const studentNav = read("app/components/pwa/StudentPwaBottomNav.tsx");
const adminShell = read("app/components/pwa/AdminPwaShell.tsx");

test("PWA unread endpoint returns separate categories and a combined total", () => {
  assert.match(route, /chat: number/);
  assert.match(route, /messages: number/);
  assert.match(route, /notifications: number/);
  assert.match(route, /homework: number/);
  assert.match(route, /const total = counts\.chat \+ counts\.messages \+ counts\.notifications \+ counts\.homework/);
  assert.match(route, /authenticatePortalActor/);
});

test("PWA unread hook updates the installed app icon badge and refreshes safely", () => {
  assert.match(hook, /setAppBadge/);
  assert.match(hook, /clearAppBadge/);
  assert.match(hook, /\/api\/pwa\/unread-count/);
  assert.match(hook, /staff-chat-unread-changed/);
  assert.match(hook, /teacher-unread-messages-changed/);
  assert.match(hook, /student-unread-messages-changed/);
  assert.match(hook, /visibilitychange/);
});

test("Teacher, Admin, and Student PWA navigation exposes the relevant unread badges", () => {
  assert.match(teacherNav, /counts\.chat/);
  assert.match(teacherNav, /counts\.messages \+ counts\.notifications/);
  assert.match(adminShell, /counts\.chat/);
  assert.match(adminShell, /counts\.messages \+ counts\.notifications/);
  assert.match(studentNav, /counts\.homework/);
  assert.match(studentNav, /counts\.messages \+ counts\.notifications/);
});
