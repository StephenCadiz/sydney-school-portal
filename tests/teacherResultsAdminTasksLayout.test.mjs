import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");
const resultsPage = read("app/teacher/results/page.tsx");
const adminTasksPage = read("app/teacher/admin/page.tsx");
const styles = read("app/globals.css");

test("Teacher Results uses the shared centered content width", () => {
  assert.match(styles, /\.teacher-results-page \{[\s\S]*margin: 0 auto;[\s\S]*max-width: var\(--teacher-content-max-width, 1480px\);[\s\S]*min-width: 0;[\s\S]*width: 100%;/);
  assert.match(resultsPage, /className="teacher-results-page"/);
  assert.match(styles, /\.teacher-portal-header \{[\s\S]*max-width: var\(--teacher-content-max-width, 1480px\);/);
});

test("Results title, controls, and cards share the page width", () => {
  for (const className of [
    "teacher-results-heading",
    "teacher-results-controls",
    "teacher-results-context",
    "teacher-results-panel",
    "teacher-results-empty",
  ]) {
    assert.match(resultsPage, new RegExp(className));
    assert.match(styles, new RegExp(`\\.${className}`));
  }
  assert.match(styles, /\.teacher-results-page \{[\s\S]*width: 100%;/);
});

test("Teacher Admin Tasks uses the shared centered content width", () => {
  assert.match(adminTasksPage, /className="teacher-admin-tasks-page"/);
  assert.match(styles, /\.teacher-admin-tasks-page \{[\s\S]*margin: 0 auto;[\s\S]*max-width: var\(--teacher-content-max-width, 1480px\);[\s\S]*min-width: 0;[\s\S]*width: 100%;/);
  assert.match(adminTasksPage, /Admin Tasks/);
  assert.match(adminTasksPage, /Quick access to teacher platforms and administrative tools/);
  assert.match(adminTasksPage, /Open \{link\.title\}/);
});

test("Existing text sizing and page functionality remain unchanged", () => {
  assert.match(resultsPage, /Results &amp; Performance/);
  assert.match(resultsPage, /Previous|Overview|Homework|Friday Tutorials|Mock Exams/);
  assert.match(adminTasksPage, /fontSize: "32px"/);
  assert.match(adminTasksPage, /fontSize: "16px"/);
  assert.match(adminTasksPage, /fontSize: "22px"/);
  assert.match(adminTasksPage, /sydneyschool\.aqadem\.com\/profesores/);
});

test("Results and Admin Tasks remain responsive without horizontal overflow", () => {
  assert.match(styles, /\.teacher-results-page \{[\s\S]*box-sizing: border-box;[\s\S]*min-width: 0;/);
  assert.match(styles, /@media \(max-width: 768px\) \{[\s\S]*\.teacher-results-page \{[\s\S]*width: 100%;/);
  assert.match(adminTasksPage, /gridTemplateColumns: "repeat\(auto-fit, minmax\(260px, 1fr\)\)"/);
  assert.match(styles, /\.teacher-admin-tasks-page \{[\s\S]*min-width: 0;/);
});

test("Other Teacher, Admin, and Student layouts are not targeted", () => {
  assert.doesNotMatch(styles, /\.admin-results-page|\.student-results-page|\.admin-tasks-page/);
  assert.doesNotMatch(adminTasksPage, /teacher-results-page/);
  assert.doesNotMatch(resultsPage, /admin-tasks-page/);
});
