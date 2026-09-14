import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");
const layout = read("app/components/layout/TeacherLayout.tsx");
const styles = read("app/globals.css");
const calendarStyles = read("app/teacher/calendar/TeacherCalendar.module.css");

test("all Teacher route content is placed in the shared header-width shell", () => {
  assert.match(layout, /className="teacher-main-content-body"/);
  assert.match(
    styles,
    /\.teacher-main-content-body\s*\{[\s\S]*margin:\s*0 auto;[\s\S]*max-width:\s*var\(--teacher-content-max-width\);[\s\S]*min-width:\s*0;[\s\S]*width:\s*100%;/
  );
  assert.match(styles, /\.teacher-main-content\s*\{[\s\S]*--teacher-content-max-width:\s*1480px/);
  assert.match(
    styles,
    /\.teacher-portal-header\s*\{[\s\S]*max-width:\s*var\(--teacher-content-max-width, 1480px\)/
  );
});

test("page shells that previously narrowed main cards use the shared width", () => {
  for (const selector of [
    "teacher-dashboard-page",
    "teacher-my-classes-page",
    "teacher-results-page",
    "teacher-admin-tasks-page",
    "teacher-messages-shell",
    "teacher-general-resources-page",
    "teacher-class-announcements",
    "young-learner-workspace-page",
  ]) {
    assert.match(
      styles,
      new RegExp(`\\.${selector}(?:\\s*,|\\s*\\{)[\\s\\S]{0,500}max-width:\\s*var\\(--teacher-content-max-width`),
      `missing shared width for ${selector}`
    );
  }
  assert.match(calendarStyles, /max-width:\s*var\(--teacher-content-max-width, 1480px\)/);
});

test("the shared shell remains centered and overflow-safe at responsive widths", () => {
  assert.match(styles, /\.teacher-main-content-body\s*\{[\s\S]*box-sizing:\s*border-box/);
  assert.match(styles, /\.teacher-main-content-body\s*\{[\s\S]*min-width:\s*0/);
  assert.match(styles, /\.teacher-main-content\s*\{[\s\S]*min-width:\s*0;[\s\S]*padding:\s*22px 16px !important/);
  assert.match(styles, /\.teacher-messages-content-panel[\s\S]*overflow/);
  assert.match(styles, /\.teacher-results-table-wrap[\s\S]*overflow-x:\s*auto/);
});

test("nested controls retain intentional sizing inside the shared shell", () => {
  assert.match(calendarStyles, /\.modal\s*\{[\s\S]*width:\s*min\(540px, 100%\)/);
  assert.match(styles, /\.teacher-messages-compose-fields\s*\{[\s\S]*max-width:\s*800px/);
  assert.match(styles, /\.young-learner-workspace-state\s*\{[\s\S]*max-width:\s*760px/);
});
