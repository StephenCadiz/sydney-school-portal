import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const route = fs.readFileSync(
  new URL("../app/api/teacher/follow-ups/route.ts", import.meta.url),
  "utf8"
);
const client = fs.readFileSync(
  new URL("../lib/followUps.ts", import.meta.url),
  "utf8"
);

test("follow-up creation is server-authorized", () => {
  assert.match(route, /supabaseAdmin\.auth\.getUser/);
  assert.match(route, /actor\.role === "teacher"/);
  assert.match(route, /classRow\.teacher_id/);
  assert.match(route, /class_roster_young_learners/);
  assert.match(route, /current_class_enrolments/);
  assert.match(route, /Follow-up save failed/);
});

test("Cambridge follow-up authorization uses the date-effective enrolment", () => {
  assert.match(route, /Profile roster rows expose the student's legacy `active` flag/);
  assert.match(route, /\.from\("current_class_enrolments"\)/);
  assert.match(route, /\.eq\("student_id", studentId\)/);
  assert.match(route, /\.eq\("class_id", classId\)/);
});

test("young learner follow-up authorization uses the current class roster", () => {
  assert.match(
    route,
    /Use the roster view, not young_learners\.class_id/
  );
  assert.match(route, /\.eq\("class_id", classId\)/);
  assert.match(route, /\.eq\("active", true\)/);
  assert.doesNotMatch(route, /\.from\("young_learners"\)\.select\([^)]*class_id/);
});

test("the browser client sends follow-up writes through the protected route", () => {
  assert.match(client, /fetch\("\/api\/teacher\/follow-ups"/);
  assert.match(client, /Authorization: `Bearer \$\{session\.access_token\}`/);
  assert.match(client, /safelySuggestFridayTutorial\(followUp\)/);
});
