import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const page = read("app/teacher/settings/page.tsx");
const nav = read("app/components/pwa/TeacherPwaBottomNav.tsx");
const layout = read("app/components/layout/TeacherLayout.tsx");
const styles = read("app/globals.css");

test("Teacher PWA has a dedicated Settings destination", () => {
  assert.match(nav, /href: "\/teacher\/settings", label: "Settings"/);
  assert.match(nav, /aria-label="Teacher PWA navigation"/);
  assert.match(page, /PwaNotificationToggle/);
  assert.match(page, /PwaBiometricToggle/);
  assert.match(page, /display-mode: standalone/);
});

test("Teacher PWA settings removes the controls from the dashboard shell", () => {
  assert.doesNotMatch(layout, /PwaInstallAndNotifications/);
  assert.doesNotMatch(layout, /PasskeyEnrollment/);
  assert.match(layout, /isInstalledSettingsPwa/);
  assert.match(layout, /!isInstalledChatPwa && !isInstalledSettingsPwa/);
  assert.match(styles, /grid-template-columns: repeat\(5, minmax\(0, 1fr\)/);
  assert.match(styles, /is-installed-pwa-settings \.teacher-main-content/);
});
