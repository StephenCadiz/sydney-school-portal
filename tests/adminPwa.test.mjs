import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const layout = read("app/components/layout/AdminLayout.tsx");
const teacherLayout = read("app/components/layout/TeacherLayout.tsx");
const shell = read("app/components/pwa/AdminPwaShell.tsx");
const routeLayout = read("app/admin/layout.tsx");
const styles = read("app/globals.css");
const chatRoute = read("app/admin/chat/page.tsx");

test("Admin installed PWA uses a separate one-item shell without changing browser navigation", () => {
  assert.match(layout, /display-mode: standalone/);
  assert.match(layout, /<AdminPwaShell/);
  assert.match(layout, /if \(installedPwa\)/);
  assert.match(layout, /typeof children !== "function"/);
  assert.match(shell, /href=\"\/admin\/chat\"/);
  assert.match(shell, /aria-label=\"Admin PWA navigation\"/);
  assert.match(shell, /<span>Messages<\/span>/);
  assert.match(shell, /Open Staff Chat/);
  assert.doesNotMatch(shell, /People & Classes|Calendar & Scheduling|Staff Time/);
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
