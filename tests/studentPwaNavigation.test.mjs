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
  assert.match(nav, /createPortal/);
});

test("Student navigation is rendered only in standalone PWA mode", () => {
  assert.match(layout, /display-mode: standalone/);
  assert.match(layout, /navigator as Navigator & \{ standalone\?: boolean \}/);
  assert.match(layout, /installedPwa && <StudentPwaBottomNav \/>/);
});

test("Student PWA navigation is fixed and reserves the safe-area content space", () => {
  assert.match(styles, /\.student-pwa-bottom-nav\.is-standalone[\s\S]*position: fixed !important/);
  assert.match(styles, /\.student-pwa-bottom-nav\.is-standalone[\s\S]*inset-block-end: 0 !important/);
  assert.match(styles, /\.student-pwa-bottom-nav\.is-standalone[\s\S]*inset-block-start: auto !important/);
  assert.match(styles, /\.student-pwa-bottom-nav\.is-standalone[\s\S]*touch-action: none/);
  assert.match(styles, /\.student-pwa-bottom-nav\.is-standalone[\s\S]*block-size: calc\(66px \+ env\(safe-area-inset-bottom\)\)/);
  assert.match(styles, /\.student-pwa-route-shell\.is-installed-pwa \.student-main-content[\s\S]*padding-bottom: calc\(96px \+ env\(safe-area-inset-bottom\)/);
  assert.match(nav, /visualViewport/);
  assert.match(nav, /viewport\.scale <= 1\.05/);
  assert.match(nav, /addEventListener\("scroll", updateKeyboardState\)/);
  assert.match(nav, /document\.activeElement/);
  assert.match(nav, /addEventListener\("focusin", updateKeyboardState\)/);
  assert.match(nav, /keyboardOpen/);
});
