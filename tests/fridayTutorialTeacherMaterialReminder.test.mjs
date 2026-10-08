import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const notices = read("app/api/teacher/friday-tutorial-notices/route.ts");
const workflow = read("app/api/admin/friday-tutorials/workflow/route.ts");
const teacherPage = read("app/teacher/page.tsx");
const card = read("app/components/teacher/FridayTutorialTeacherMaterialReminderCard.tsx");

test("confirmed Young Learner rows surface a reminder for only the recommending teacher", () => {
  assert.match(notices, /parent_confirmed_status.*yes/);
  assert.match(notices, /student_type.*young_learner/);
  assert.match(notices, /teacher_id.*teacherId/);
  assert.match(notices, /teacher_material_reminders/);
  assert.match(notices, /student_name/);
  assert.match(notices, /session_date/);
  assert.match(notices, /start_time/);
  assert.match(notices, /end_time/);
  assert.match(card, /Prepare activities for the student and send them to Admin as soon as possible/);
});

test("the reminder excludes completed materials and B1 rows", () => {
  assert.match(notices, /material_received_status !== "yes"/);
  assert.match(notices, /eq\("student_type", "young_learner"\)/);
  assert.match(workflow, /student_type !== "young_learner"/);
});

test("existing confirmed rows without a message marker are eligible and marker rows are excluded", () => {
  assert.match(notices, /friday-tutorial-parent-confirmed:\$\{row\.id\}/);
  assert.match(notices, /messages\.some\(\(item\) => String\(item\.message \|\| ""\)\.includes\(marker\)\)/);
  assert.match(notices, /return \[\];/);
});

test("Teacher Dashboard renders and acknowledges material reminders", () => {
  assert.match(teacherPage, /FridayTutorialTeacherMaterialReminderCard/);
  assert.match(teacherPage, /teacher_material_reminders/);
  assert.match(card, /Acknowledge/);
  assert.match(card, /teacher-friday-tutorial-material-dismissed/);
});

test("the confirmation transition remains idempotent", () => {
  assert.match(workflow, /parent_confirmed_status\.neq\.yes,parent_confirmed_status\.is\.null/);
  assert.match(workflow, /some\(\(message\) => String\(message\.message \|\| ""\)\.includes\(marker\)\)/);
  assert.match(workflow, /return false;/);
});
