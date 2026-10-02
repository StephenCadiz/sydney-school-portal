import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const displayHelper = read("lib/studentTeacherDisplay.ts");
const dashboard = read("app/student/page.tsx");
const messages = read("app/student/messages/page.tsx");
const coursePlanServer = read("lib/studentCoursePlanningServer.ts");
const adminStudents = read("lib/adminStudents.ts");
const staffTime = read("lib/staffTimeServer.ts");
const userHelper = read("lib/user.ts");

test("Cambridge student teacher display uses Rosa's stable profile ID alias", () => {
  assert.match(
    displayHelper,
    /CAMBRIDGE_ROSE_TEACHER_PROFILE_ID\s*=\s*[\s\S]*8be7d093-d270-40d4-b758-e53d7bc99752/
  );
  assert.match(displayHelper, /isCambridgeStudent/);
  assert.match(displayHelper, /teacher\?\.id/);
  assert.match(displayHelper, /return "Rose"/);
  assert.doesNotMatch(displayHelper, /first_name.*rosa|last_name.*vara/i);
});

test("student-facing dashboard, messages, and course plans use the centralized alias", () => {
  assert.match(dashboard, /getStudentFacingTeacherName\(/);
  assert.match(messages, /getStudentFacingTeacherName\(/);
  assert.match(coursePlanServer, /getStudentFacingTeacherName\(/);
  assert.match(coursePlanServer, /classroom\.is_cambridge === true/);
  assert.doesNotMatch(dashboard, /teacher\.first_name|teacher\.last_name/);
  assert.doesNotMatch(messages, /teacher\?\.first_name|teacher\?\.last_name/);
});

test("canonical staff and Admin displays do not import the student alias", () => {
  assert.doesNotMatch(adminStudents, /studentTeacherDisplay/);
  assert.doesNotMatch(staffTime, /studentTeacherDisplay/);
  assert.match(userHelper, /return `\$\{teacher\.first_name\}/);
  assert.match(displayHelper, /return \(/);
});
