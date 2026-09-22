import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const layout = read("app/components/layout/AdminLayout.tsx");
const logout = read("app/components/auth/LogoutButton.tsx");
const styles = read("app/globals.css");

test("Admin sidebar exposes the eight consolidated top-level destinations", () => {
  for (const label of [
    "Dashboard",
    "People & Classes",
    "Exams & Assessment",
    "Calendar & Scheduling",
    "Student Support",
    "Communication",
    "Teaching Resources",
    "Log Out",
  ]) {
    assert.match(label === "Log Out" ? logout : layout, new RegExp(label.replace(/[&]/g, "\\&")));
  }
  assert.match(layout, /admin-nav-group-toggle/);
  assert.match(layout, /aria-expanded={isOpen}/);
  assert.match(layout, /aria-controls={`admin-nav-panel-\$\{group\.key\}`}/);
  assert.match(layout, /openGroupRef\.current = group\.key/);
  assert.match(layout, /setOpenNavGroup\(group\.key\)/);
  assert.match(layout, /suppressPathExpansionRef\.current = item\.href !== pathname/);
});

test("Dashboard is a standalone direct link with no fly-out trigger", () => {
  assert.match(layout, /href="\/admin"/);
  assert.match(layout, /admin-nav-dashboard-link/);
  assert.match(layout, /const isDashboard = group\.key === "dashboard"/);
  assert.match(layout, /isDashboard \? \(/);
  assert.match(layout, /closeNavGroup\(false\)/);
  assert.match(layout, /openNavGroup !== "dashboard"/);
  assert.doesNotMatch(
    layout,
    /className="admin-nav-group-toggle admin-nav-dashboard-link"[\s\S]{0,300}aria-expanded/
  );
  assert.match(layout, /href="\/admin"[\s\S]*closeNavGroup\(false\)/);
});

test("Every existing Admin child route remains in its consolidated group", () => {
  const routes = [
    "/admin/classes",
    "/admin/academic-years",
    "/admin/students",
    "/admin/teachers",
    "/admin/admin-staff",
    "/admin/add-users",
    "/admin/exam-bank",
    "/admin/exam-bank/assignments",
    "/admin/mock-results",
    "/admin/course-planning",
    "/admin/class-exams",
    "/admin/print-class-exams",
    "/admin/staff-time",
    "/admin/school-calendar",
    "/admin/teacher-calendar",
    "/admin/friday-tutorials",
    "/admin/friday-exam-practice",
    "/admin/attendance",
    "/admin/follow-ups",
    "/admin/student-monitoring",
    "/admin/messages",
    "/admin/announcements",
    "/admin/resources",
    "/admin/syllabuses",
  ];
  for (const route of routes) assert.match(layout, new RegExp(route.replaceAll("/", "\\/")));
  assert.match(layout, /Friday Tutorials/);
  assert.match(layout, /Friday @ 6/);
});

test("Admin groups preserve badges, active routes, direct-link expansion, and dismissal", () => {
  assert.match(layout, /groupAttentionCount/);
  assert.match(layout, /outstandingAdminMessages/);
  assert.match(layout, /attendanceAlertCount/);
  assert.match(layout, /monitoringSummary\.feedbackCount/);
  assert.match(layout, /aria-current={isActive\(item\.href\) \? "page" : undefined}/);
  assert.match(layout, /activeGroup = menuGroups\.find/);
  assert.match(layout, /activeGroup\?\.key \|\| "dashboard"/);
  assert.match(layout, /setOpenNavGroup\(initialGroup\)/);
  assert.match(layout, /event\.key === "Escape"/);
  assert.match(layout, /closeOnOutsideClick/);
});

test("Admin child selection closes the fly-out and mobile drawer", () => {
  assert.match(layout, /closeNavGroup\(false\);[\s\S]*setMenuOpen\(false\)/);
  assert.match(layout, /suppressPathExpansionRef\.current = item\.href !== pathname/);
  assert.match(layout, /suppressPathExpansionRef\.current = pathname !== "\/admin"/);
});

test("Admin child navigation clears the fly-out before route effects can reopen it", () => {
  assert.match(layout, /const closingGroup = openGroupRef\.current;[\s\S]*openGroupRef\.current = "";[\s\S]*setOpenNavGroup\(""\)/);
  assert.match(layout, /suppressPathExpansionRef\.current = item\.href !== pathname;[\s\S]*closeNavGroup\(false\);[\s\S]*setMenuOpen\(false\)/);
  assert.match(layout, /if \(suppressPathExpansionRef\.current\) \{[\s\S]*suppressPathExpansionRef\.current = false;[\s\S]*closeNavGroup\(false\)/);
  assert.match(layout, /ADMIN_NAV_CLOSE_AFTER_NAVIGATION_KEY/);
  assert.match(layout, /sessionStorage\.setItem\([\s\S]*ADMIN_NAV_CLOSE_AFTER_NAVIGATION_KEY[\s\S]*item\.href/);
  assert.match(layout, /sessionStorage\.removeItem\([\s\S]*ADMIN_NAV_CLOSE_AFTER_NAVIGATION_KEY/);
  assert.match(layout, /suppressInitialExpansion[\s\S]*pendingClosePath === pathname/);
});

test("Desktop Admin groups use a right-side fly-out while mobile stays accordion-based", () => {
  assert.match(layout, /role="menu"/);
  assert.match(layout, /role="menuitem"/);
  assert.match(layout, /flyoutRef/);
  assert.match(layout, /renderGroupPanel\(openGroup, true\), document\.body/);
  assert.match(layout, /isOpen && isMobileViewport && renderGroupPanel\(group, false\)/);
  assert.match(layout, /admin-nav-group-panel--flyout/);
  assert.match(layout, /createPortal/);
  assert.match(layout, /window\.matchMedia\("\(min-width: 701px\)"\)/);
  assert.match(layout, /querySelector<HTMLElement>\('a\[href\], button:not\(\[disabled\]\)'\)/);
  assert.match(styles, /@media \(min-width: 701px\)[\s\S]*\.admin-nav-group-panel--flyout \.admin-sidebar-link[\s\S]*white-space: nowrap/);
  assert.match(styles, /@media \(max-width: 700px\)/);
  assert.match(styles, /\.admin-nav-group-panel--flyout[\s\S]*position: fixed !important/);
  assert.match(styles, /\.admin-nav-group-panel--flyout[\s\S]*width: min\(360px/);
});

test("Admin navigation has accessible responsive group and child surfaces", () => {
  assert.match(styles, /admin-sidebar-nav/);
  assert.match(styles, /admin-nav-group-toggle:focus-visible/);
  assert.match(styles, /admin-nav-group-panel/);
  assert.match(styles, /admin-sidebar-panel,[\s\S]*max-width: 86vw/);
  assert.match(styles, /@media \(max-width: 700px\)/);
  assert.match(layout, /mobile-menu-button/);
  assert.match(layout, /mobile-sidebar-overlay/);
});

test("Communication stays on one line while its badge and chevron remain separate", () => {
  assert.match(layout, /admin-nav-group-label--communication/);
  assert.match(styles, /\.admin-nav-group-toggle \{[\s\S]*display: grid;[\s\S]*grid-template-columns: minmax\(0, 1fr\) auto/);
  assert.match(styles, /\.admin-nav-group-label--communication \{[\s\S]*grid-template-columns: 22px max-content/);
  assert.match(styles, /\.admin-nav-group-label--communication \.admin-nav-group-label-text \{[\s\S]*overflow-wrap: normal;[\s\S]*white-space: nowrap;[\s\S]*word-break: normal/);
  assert.match(styles, /.admin-nav-group-controls {[\s\S]*flex: 0 0 auto;[\s\S]*gap: 7px/);
  assert.match(layout, /<span className="admin-nav-group-controls">[\s\S]*<UnreadBadge count=\{attentionCount\} \/>[\s\S]*admin-nav-group-chevron/);
});

test("Admin group buttons, child links, badges, and logout share Teacher liquid-glass styling", () => {
  assert.match(styles, /\.admin-nav-group-toggle \{[\s\S]*linear-gradient\(/);
  assert.match(styles, /\.admin-nav-group-toggle \{[\s\S]*inset 0 1px 0 rgba\(255, 255, 255, 0\.16\)/);
  assert.match(styles, /\.admin-nav-group-toggle \{[\s\S]*0 5px 14px rgba\(8, 29, 72, 0\.1\)/);
  assert.match(styles, /\.admin-nav-group-panel \{[\s\S]*backdrop-filter: blur\(14px\)/);
  assert.match(styles, /\.admin-nav-group-panel \.admin-sidebar-link:hover/);
  assert.match(styles, /\.admin-nav-group-panel \.admin-sidebar-link\[aria-current="page"\]/);
  assert.match(styles, /\.admin-nav-logout-group \.portal-logout-button \{/);
  assert.match(styles, /\.admin-nav-logout-group \.portal-logout-button:hover:not\(:disabled\)/);
  assert.match(styles, /\.admin-nav-logout-group \.portal-logout-button:focus-visible/);
  assert.match(styles, /\.admin-nav-group-toggle,[\s\S]*prefers-reduced-motion: reduce/);
});

test("Admin fly-out uses a light translucent glass surface with readable child rows", () => {
  assert.match(styles, /\.admin-nav-group-panel--flyout \{[\s\S]*rgba\(248, 252, 255, 0\.88\)/);
  assert.match(styles, /\.admin-nav-group-panel--flyout \{[\s\S]*backdrop-filter: blur\(18px\) saturate\(125%\)/);
  assert.match(styles, /\.admin-nav-group-panel--flyout \{[\s\S]*border: 1px solid rgba\(91, 145, 192, 0\.36\)/);
  assert.match(styles, /\.admin-nav-group-panel \.admin-sidebar-link \{[\s\S]*rgba\(255, 255, 255, 0\.82\)/);
  assert.match(styles, /\.admin-nav-group-panel \.admin-sidebar-link \{[\s\S]*color: var\(--ss-blue-dark\)/);
  assert.match(styles, /\.admin-nav-group-panel \.admin-sidebar-link:focus-visible/);
  assert.match(styles, /@media \(max-width: 700px\)[\s\S]*\.admin-nav-group-panel--flyout/);
  assert.match(styles, /\.admin-layout-shell > \.admin-sidebar-panel \{[\s\S]*rgba\(45, 119, 187, 0\.9\)/);
  assert.match(styles, /\.admin-layout-shell > \.admin-sidebar-panel \{[\s\S]*backdrop-filter: blur\(16px\) saturate\(120%\)/);
});
