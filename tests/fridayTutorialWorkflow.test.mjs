import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const workflowRoute = readFileSync(
  new URL("../app/api/admin/friday-tutorials/workflow/route.ts", import.meta.url),
  "utf8"
);
const fridayTutorials = readFileSync(
  new URL("../lib/fridayTutorials.ts", import.meta.url),
  "utf8"
);
const adminPage = readFileSync(new URL("../app/admin/page.tsx", import.meta.url), "utf8");

test("Admin reminder runs Monday through Friday Madrid time and uses the next non-empty list", () => {
  assert.match(workflowRoute, /weekday === 0 \|\| weekday === 6/);
  assert.match(workflowRoute, /calculateUpcomingFridayTutorials/);
  assert.match(workflowRoute, /entry\.session_date >= today/);
  assert.match(workflowRoute, /friday_tutorial_session_students/);
  assert.match(workflowRoute, /friday_tutorial_students/);
  assert.match(workflowRoute, /approval_status.*approved/);
  assert.match(workflowRoute, /if \(list\.length === 0\) return \{ show: false/);
});

test("Reminder remains until every required weekly status is complete", () => {
  assert.match(workflowRoute, /whatsapp_sent_status === "yes"/);
  assert.match(workflowRoute, /parent_confirmed_status === "no"/);
  assert.match(workflowRoute, /parent_confirmed_status === "yes"/);
  assert.match(workflowRoute, /material_received_status === "yes"/);
  assert.match(workflowRoute, /parent_confirmed_status === "no" \|\|/);
  assert.match(workflowRoute, /show: complete < list\.length/);
  assert.match(adminPage, /fridayTutorialReminder\?\.show/);
  assert.match(adminPage, /Open Friday Tutorials/);
  assert.match(adminPage, /Teacher material is required when parents confirm/);
});

test("Parent refusal does not require teacher material", () => {
  assert.match(
    workflowRoute,
    /row\.whatsapp_sent_status === "yes"[\s\S]*row\.parent_confirmed_status === "no"/
  );
  assert.match(
    workflowRoute,
    /row\.parent_confirmed_status === "yes"[\s\S]*row\.material_received_status === "yes"/
  );
});

test("Parent confirmation notifies only the recommending Young Learner teacher", () => {
  assert.match(workflowRoute, /student_type !== "young_learner"/);
  assert.match(workflowRoute, /tutorialStudent\.teacher_id/);
  assert.match(workflowRoute, /updates\.parent_confirmed_status === "yes"/);
  assert.match(workflowRoute, /parent_confirmed_status\.is\.null/);
  assert.match(workflowRoute, /prepare activities for the student and send them to Admin as soon as possible\./);
  assert.match(workflowRoute, /friday-tutorial-parent-confirmed/);
  assert.match(workflowRoute, /select\("id, class_name, days, start_time, end_time, level_id"\)/);
  assert.match(workflowRoute, /classRow\?\.class_name/);
});

test("Notification retries are idempotent and do not create duplicates", () => {
  assert.match(workflowRoute, /\.eq\("receiver_id", tutorialStudent\.teacher_id\)/);
  assert.match(workflowRoute, /some\(\(message\) => String\(message\.message \|\| ""\)\.includes\(marker\)\)/);
  assert.match(workflowRoute, /includes\(marker\)/);
  assert.match(workflowRoute, /return false;/);
});

test("Admin updates are server-authorized and limited to existing status fields", () => {
  assert.match(workflowRoute, /requireExamBankAdmin\(request\)/);
  assert.match(workflowRoute, /STATUS_FIELDS/);
  assert.match(workflowRoute, /unsupported fields/);
  assert.match(workflowRoute, /friday_tutorial_session_students/);
});

test("the browser update helper uses the protected workflow endpoint", () => {
  assert.match(fridayTutorials, /fetch\("\/api\/admin\/friday-tutorials\/workflow"/);
  assert.match(fridayTutorials, /session_student_id: id/);
  assert.match(fridayTutorials, /Authorization: `Bearer \$\{token\}`/);
});

test("B1 rows remain excluded from teacher notifications", () => {
  assert.match(workflowRoute, /student_type !== "young_learner"/);
  assert.doesNotMatch(workflowRoute, /student_type === "b1"/);
});
