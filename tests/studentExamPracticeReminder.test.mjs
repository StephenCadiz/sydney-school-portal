import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const route = readFileSync(
  new URL("../app/api/student/friday-tutorial-reminder/route.ts", import.meta.url),
  "utf8"
);
const dashboard = readFileSync(
  new URL("../app/student/page.tsx", import.meta.url),
  "utf8"
);
const reminder = readFileSync(
  new URL("../app/components/student/StudentFridayTutorialReminder.tsx", import.meta.url),
  "utf8"
);

test("exam-practice reminders are independent of Friday Tutorial rotation", () => {
  assert.doesNotMatch(route, /loadFridayTutorialRotationContext/);
  assert.doesNotMatch(route, /getFridayTutorialSessionTypeForDate/);
  assert.doesNotMatch(route, /isB1FridayTutorialSession/);
  assert.match(route, /from\("friday_exam_practice_sessions"\)/);
  assert.match(route, /\.eq\("active", true\)/);
  assert.match(route, /\.eq\("session_date", window\.fridayDate\)/);
});

test("all Cambridge levels use active enrolment level matching", () => {
  for (const level of ["B1", "B2", "C1", "C2"]) {
    assert.match(route, new RegExp(`"${level}"`));
  }
  assert.match(route, /from\("current_class_enrolments"\)/);
  assert.match(route, /studentLevels\.has\(normalizeLevel\(session\.level_name\)\)/);
  assert.match(route, /studentLevels\.size === 0/);
  assert.doesNotMatch(route, /resolveStudentCurrentClassServer/);
});

test("Monday and Thursday phases remain separately acknowledged per student and event", () => {
  assert.match(route, /stage: "monday"/);
  assert.match(route, /stage: "thursday"/);
  assert.match(route, /\.eq\("student_id", context\.studentId\)/);
  assert.match(route, /\.eq\("reminder_stage", context\.stage\)/);
  assert.match(route, /onConflict: "student_id,session_id,reminder_stage"/);
  assert.match(route, /Exam Practice this week/);
  assert.match(route, /Exam Practice tomorrow/);
});

test("the student dashboard renders the authenticated reminder component only", () => {
  assert.match(dashboard, /<StudentFridayTutorialReminder \/>/);
  assert.match(reminder, /cache: "no-store"/);
  assert.match(reminder, /Authorization: `Bearer \$\{token\}`/);
  assert.match(reminder, /fridayDate/);
  assert.match(reminder, /reminder\.level/);
  assert.match(reminder, /reminder\.sessions\.map/);
});

test("unrelated dashboards are not wired to the student reminder", () => {
  const teacher = readFileSync(new URL("../app/teacher/page.tsx", import.meta.url), "utf8");
  const admin = readFileSync(new URL("../app/admin/page.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(teacher, /StudentFridayTutorialReminder/);
  assert.doesNotMatch(admin, /StudentFridayTutorialReminder/);
});
