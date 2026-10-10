import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const layout = read("app/student/layout.tsx");
const nav = read("app/components/pwa/StudentPwaBottomNav.tsx");
const styles = read("app/globals.css");

test("Student PWA has the requested four navigation destinations", () => {
  assert.match(nav, /href: "\/student", label: "Dashboard"/);
  assert.match(nav, /href: "\/student\/homework", label: "Homework"/);
  assert.match(nav, /href: "\/student\/resources", label: "Resources"/);
  assert.match(nav, /href: "\/student\/progress", label: "Progress"/);
  assert.match(nav, /aria-label="Student PWA navigation"/);
});

test("Student navigation is rendered only in standalone PWA mode", () => {
  assert.match(layout, /display-mode: standalone/);
  assert.match(layout, /navigator as Navigator & \{ standalone\?: boolean \}/);
  assert.match(layout, /installedPwa && <StudentPwaBottomNav \/>/);
});

test("Student PWA navigation is fixed and reserves the safe-area content space", () => {
  assert.match(styles, /\.student-pwa-route-shell\.is-installed-pwa \.student-pwa-bottom-nav[\s\S]*position: fixed/);
  assert.match(styles, /\.student-pwa-route-shell\.is-installed-pwa \.student-pwa-bottom-nav[\s\S]*inset-block-end: 0/);
  assert.match(styles, /\.student-pwa-route-shell\.is-installed-pwa \.student-pwa-bottom-nav[\s\S]*block-size: calc\(66px \+ env\(safe-area-inset-bottom\)\)/);
  assert.match(styles, /\.student-pwa-route-shell\.is-installed-pwa \.student-main-content[\s\S]*padding-bottom: calc\(96px \+ env\(safe-area-inset-bottom\)/);
});
