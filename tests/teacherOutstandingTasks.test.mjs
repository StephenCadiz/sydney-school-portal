import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const cards = read("app/components/teacher/TeacherOutstandingTaskCards.tsx");
const layout = read("app/components/layout/TeacherLayout.tsx");
const dashboard = read("app/teacher/page.tsx");
const progress = read("app/components/teacher/TeacherClassProgressReminder.tsx");
const styles = read("app/globals.css");

test("Dashboard renders grouped register and class-progress task cards below the header", () => {
  assert.match(layout, /<PortalHeader[\s\S]*<TeacherOutstandingTaskCards \/>[\s\S]*teacher-main-content-body/);
  assert.match(cards, /Registers required/);
  assert.match(cards, /Class progress required/);
  assert.match(cards, /Open register/);
  assert.match(cards, /Open class progress/);
  assert.doesNotMatch(dashboard, /TeacherClass(Register|Progress)DashboardReminders/);
});

test("Task cards use one deduplicated, stale-response-safe source of truth", () => {
  assert.match(cards, /Promise\.all\(\[\s*fetch\("\/api\/teacher\/class-register\/reminders"/);
  assert.match(cards, /fetch\("\/api\/teacher\/class-progress\/reminders"/);
  assert.match(cards, /cache: "no-store"/);
  assert.match(cards, /const requestIdRef = useRef\(0\)/);
  assert.match(cards, /if \(requestId !== requestIdRef\.current\) return;/);
  assert.match(cards, /const seen = new Set<string>\(\)/);
  assert.match(cards, /teacher-outstanding-task-cards/);
});

test("Workspace cards are scoped to the current class and requested lesson", () => {
  assert.match(cards, /usePathname\(\)/);
  assert.match(cards, /useSearchParams\(\)/);
  assert.match(cards, /pathname !== "\/teacher\/class"/);
  assert.match(cards, /item\.class_id === scope\.classId/);
  assert.match(cards, /item\.lesson_date === scope\.lessonDate/);
  assert.match(cards, /item\.scheduled_start_time === scope\.startTime/);
  assert.match(progress, /pathname === "\/teacher\/class"/);
});

test("Opening and completing tasks do not dismiss unrelated outstanding entries", () => {
  assert.match(cards, /router\.push\(/);
  assert.match(cards, /window\.addEventListener\(CLASS_REGISTER_CHANGED_EVENT/);
  assert.match(cards, /window\.addEventListener\("teacher-class-progress-updated"/);
  assert.match(cards, /window\.setInterval\(\(\) => void loadTasks\(\), 60_000\)/);
  assert.match(cards, /registers\.map\(\(task\) => <TaskEntry key=\{task\.key\}/);
  assert.match(cards, /progress\.map\(\(task\) => <TaskEntry key=\{task\.key\}/);
});

test("Task cards remain responsive and keyboard accessible", () => {
  assert.match(styles, /\.teacher-outstanding-task-cards/);
  assert.match(styles, /var\(--teacher-content-max-width\)/);
  assert.match(styles, /grid-template-columns: auto minmax\(0, 1fr\) auto/);
  assert.match(styles, /@media \(max-width: 640px\)[\s\S]*\.teacher-outstanding-task-entry/);
  assert.match(styles, /teacher-outstanding-task-entry button:focus-visible/);
  assert.match(styles, /overflow-wrap: anywhere/);
});
