import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const settings = read("app/student/settings/page.tsx");
const nav = read("app/components/pwa/StudentPwaBottomNav.tsx");
const pushToggle = read("app/components/pwa/PwaNotificationToggle.tsx");
const styles = read("app/globals.css");

test("Student PWA Settings is a toolbar destination with Push and Biometrics toggles", () => {
  assert.match(nav, /href: "\/student\/settings", label: "Settings"/);
  assert.match(settings, /PwaNotificationToggle/);
  assert.match(settings, /StudentBiometricToggle/);
  assert.match(settings, /display-mode: standalone/);
  assert.match(settings, /biometricPreferenceKey/);
});

test("Student PWA push settings unsubscribe locally and on the server", () => {
  assert.match(pushToggle, /role="switch"/);
  assert.match(pushToggle, /Notification\.requestPermission\(\)/);
  assert.match(pushToggle, /method: "POST"/);
  assert.match(pushToggle, /method: "DELETE"/);
  assert.match(pushToggle, /subscription\.unsubscribe\(\)/);
  assert.match(styles, /\.student-pwa-setting-toggle/);
});
