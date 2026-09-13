import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");
const calendarPage = read("app/teacher/calendar/page.tsx");
const calendarStyles = read("app/teacher/calendar/TeacherCalendar.module.css");
const globalStyles = read("app/globals.css");
const adminLayout = read("app/components/layout/AdminLayout.tsx");
const studentMenu = read("app/student/StudentMenu.tsx");

test("Teacher Calendar uses the shared centered Teacher content width", () => {
  assert.match(calendarStyles, /max-width: var\(--teacher-content-max-width, 1480px\)/);
  assert.match(calendarStyles, /margin: 0 auto/);
  assert.match(calendarStyles, /width: 100%/);
  assert.match(globalStyles, /\.teacher-portal-header[\s\S]*max-width: var\(--teacher-content-max-width, 1480px\)/);
});

test("Calendar header and weekday row share one full-width container", () => {
  assert.match(calendarPage, /className=\{styles\.header\}/);
  assert.match(calendarPage, /className=\{styles\.desktopWeek\}/);
  assert.match(calendarStyles, /\.page \{[\s\S]*width: 100%/);
  assert.match(calendarStyles, /\.header \{[\s\S]*width|\.header \{/);
});

test("Desktop weekday columns remain equal and stretch to matching heights", () => {
  assert.match(calendarPage, /gridTemplateColumns: `repeat\(\$\{visibleDays\.length\}, minmax\(0, 1fr\)\)`/);
  assert.match(calendarStyles, /\.desktopWeek \{[\s\S]*align-items: stretch/);
  assert.match(calendarStyles, /\.dayColumn,[\s\S]*\.mobileDayPanel \{[\s\S]*align-self: stretch/);
});

test("Calendar text sizes and event content remain intact", () => {
  assert.match(calendarStyles, /\.title \{[\s\S]*font-size: 30px/);
  assert.match(calendarStyles, /\.cardTitle \{[\s\S]*font-size: 16px/);
  assert.match(calendarPage, /Previous Week/);
  assert.match(calendarPage, /Today/);
  assert.match(calendarPage, /Next Week/);
  assert.match(calendarPage, /Add Reminder/);
  assert.match(calendarPage, /renderItemsForDay/);
});

test("Calendar spacing is compact without clipping or hidden content", () => {
  assert.match(calendarStyles, /\.header \{[\s\S]*padding: 18px/);
  assert.match(calendarStyles, /\.dayColumn,[\s\S]*padding: 12px/);
  assert.match(calendarStyles, /\.emptyState \{[\s\S]*padding: 10px/);
  assert.doesNotMatch(calendarStyles, /overflow:\s*hidden/);
  assert.match(calendarStyles, /overflow-wrap: anywhere/);
});

test("Tablet and mobile Calendar layouts stack without horizontal overflow", () => {
  assert.match(calendarStyles, /@media \(max-width: 768px\)[\s\S]*\.desktopWeek \{[\s\S]*display: none/);
  assert.match(calendarStyles, /\.mobilePlanner \{[\s\S]*display: none/);
  assert.match(calendarStyles, /\.daySelector \{[\s\S]*grid-template-columns/);
  assert.match(calendarStyles, /\.page \{[\s\S]*min-width: 0/);
});

test("Admin and Student navigation remain isolated from Calendar styling", () => {
  assert.match(adminLayout, /admin-sidebar-panel/);
  assert.match(studentMenu, /student-sidebar-nav/);
  assert.doesNotMatch(adminLayout, /TeacherCalendar/);
  assert.doesNotMatch(studentMenu, /TeacherCalendar/);
});
