import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const loader = read("lib/teacher.ts");
const page = read("app/teacher/my-classes/page.tsx");

test("Teacher My Classes resolves level names separately from the classes query", () => {
  assert.match(loader, /\.from\("classes"\)/);
  assert.doesNotMatch(loader, /levels \(id, name\)/);
  assert.match(loader, /\.from\("levels"\)\.select\("id, name"\)/);
  assert.match(loader, /const levelById = new Map/);
  assert.match(loader, /levels: levelById\.get\(String\(classroom\.level_id\)\) \|\| null/);
  assert.match(loader, /message: error\?\.message/);
  assert.match(loader, /code: error\?\.code/);
  assert.match(loader, /details: error\?\.details/);
  assert.match(loader, /hint: error\?\.hint/);
  assert.match(loader, /sortClassesByGlobalOrder/);
  assert.match(page, /getTeacherClasses\(session\.user\.id\)/);
  assert.match(page, /Unable to load classes\./);
});

test("Teacher class loading keeps Cambridge and Young Learner class data", () => {
  assert.match(page, /item\.is_cambridge === true/);
  assert.match(page, /Young Learners/);
  assert.match(page, /current_class_enrolments/);
  assert.match(page, /current_young_learners/);
  assert.match(page, /student_count/);
});
