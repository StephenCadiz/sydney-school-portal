import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const workspaceRoute = read("app/api/teacher/young-learners/[studentId]/workspace/route.ts");
const classPage = read("app/teacher/class/page.tsx");
const workspacePage = read("app/teacher/class/young-learner/[studentId]/page.tsx");
const styles = read("app/globals.css");

test("Young Learner workspaces resolve students from the future-inclusive class roster", () => {
  assert.match(workspaceRoute, /from\("class_roster_young_learners"\)/);
  assert.doesNotMatch(workspaceRoute, /from\("current_young_learners"\)/);
  assert.match(workspaceRoute, /\.eq\("id", studentId\)\.eq\("class_id", classId\)/);
  assert.match(workspaceRoute, /classRow\.teacher_id !== auth\.actor\.id/);
  assert.match(workspaceRoute, /classRow\.is_cambridge === true/);
});

test("Teacher class navigation uses roster IDs and preserves the Cambridge path", () => {
  assert.match(classPage, /from\("class_roster_young_learners"\)/);
  assert.match(classPage, /\/teacher\/class\/young-learner\//);
  assert.match(classPage, /student_type === "young_learner"/);
  assert.match(classPage, /is_cambridge === true/);
  assert.match(workspaceRoute, /Young Learner workspace not found\./);
  assert.match(workspaceRoute, /UUID_PATTERN\.test\(studentId\).*UUID_PATTERN\.test\(classId\)/s);
});

test("Young Learner workspace remains responsive without horizontal overflow", () => {
  assert.match(workspacePage, /className="young-learner-workspace-page"/);
  assert.match(styles, /\.young-learner-workspace-page[\s\S]*min-width: 0/);
  assert.match(styles, /@media \(max-width: 768px\)[\s\S]*\.young-learner-workspace-content[\s\S]*padding: 16px/);
  assert.match(styles, /\.young-learner-workspace-tabs[\s\S]*overflow-x: auto/);
});
