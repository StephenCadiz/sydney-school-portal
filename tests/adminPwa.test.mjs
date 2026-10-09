import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const layout = read("app/components/layout/AdminLayout.tsx");
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

test("Admin PWA does not introduce an offline private-data cache", () => {
  assert.doesNotMatch(shell, /caches\.open|localStorage|sessionStorage/);
  assert.match(shell, /cache: "no-store"/);
});
