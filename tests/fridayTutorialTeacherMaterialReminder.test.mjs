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

test("teacher reminders are scoped to the current Madrid school week", () => {
  assert.match(notices, /getCurrentWeekFriday/);
  assert.match(notices, /const daysSinceMonday = \(weekday \+ 6\) % 7/);
  assert.match(notices, /\.eq\("session_date", friday\)/);
});

test("the reminder excludes completed materials and B1 rows", () => {
  assert.match(notices, /material_received_status !== "yes"/);
  assert.match(notices, /eq\("student_type", "young_learner"\)/);
  assert.match(workflow, /student_type !== "young_learner"/);
});

test("confirmed rows remain eligible even after the notification message is created", () => {
  assert.doesNotMatch(notices, /markerRows/);
  assert.doesNotMatch(notices, /friday-tutorial-parent-confirmed:\$\{row\.id\}/);
  assert.match(notices, /material_received_status !== "yes"/);
});

test("Teacher Dashboard renders durable material reminders", () => {
  assert.match(teacherPage, /FridayTutorialTeacherMaterialReminderCard/);
  assert.match(teacherPage, /teacher_material_reminders/);
  assert.match(card, /Material Sent to Admin/);
  assert.match(card, /method: "PATCH"/);
  assert.match(card, /session_student_id: reminder\.id/);
  assert.doesNotMatch(card, /localStorage/);
});

test("teacher acknowledgement is authenticated, teacher-owned, and durable", () => {
  assert.match(notices, /export async function PATCH/);
  assert.match(notices, /authenticatePortalActor\(tokenFromRequest\(request\)\)/);
  assert.match(notices, /String\(tutorialStudent\.teacher_id \|\| ""\) !== actor\.profileId/);
  assert.match(notices, /material_received_status: "yes"/);
  assert.match(notices, /updated_at: new Date\(\)\.toISOString\(\)/);
});

test("the confirmation transition remains idempotent", () => {
  assert.match(workflow, /parent_confirmed_status\.neq\.yes,parent_confirmed_status\.is\.null/);
  assert.match(workflow, /some\(\(message\) => String\(message\.message \|\| ""\)\.includes\(marker\)\)/);
  assert.match(workflow, /return false;/);
  assert.match(workflow, /eventKey: `friday-tutorial-material:\$\{sessionStudent\.id\}`/);
  assert.match(notices, /eventKey: `friday-tutorial-material:\$\{reminder\.id\}`/);
});
