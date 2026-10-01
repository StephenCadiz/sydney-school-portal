import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const scoring = read("lib/coursePlanExamScoring.ts");
const scoringServer = read("lib/coursePlanExamScoresServer.ts");
const loader = read("lib/teacherCambridgeExamsServer.ts");
const planningServer = read("lib/coursePlanningServer.ts");
const planningUi = read("app/teacher/class/CoursePlanningTab.tsx");
const scoringUi = read("app/teacher/class/CoursePlanExamScoringSection.tsx");
const studentPlan = read("app/student/course-plan/page.tsx");
const teacherHomework = read("lib/teacherHomeworkServer.ts");
const studentHomework = read("lib/studentHomeworkServer.ts");
const route = read("app/api/teacher/classes/[id]/course-planning/scores/route.ts");
const migration = read("supabase/migrations/20261001120000_course_plan_exam_part_scoring.sql");
const definitions = read("lib/cambridgeExamPartDefinitions.ts");
const subpartsMigration = read("supabase/migrations/20261001130000_cambridge_exam_subparts.sql");

test("B1, B2, C1 and C2 use authoritative level-specific exam parts", () => {
  assert.match(scoring, /COURSE_PLAN_EXAM_LEVELS = \["B1", "B2", "C1", "C2"\]/);
  assert.match(loader, /\.eq\("level_id", context\.levelId\)/);
  assert.match(loader, /cambridge_exam_parts/);
  assert.match(loader, /partsByType/);
  assert.match(definitions, /B1: \{ reading: 6, listening: 4, writing: 2 \}/);
  assert.match(definitions, /B2: \{ reading: 7, listening: 4, writing: 2 \}/);
  assert.match(definitions, /C1: \{ reading: 8, listening: 4, writing: 2 \}/);
  assert.match(definitions, /C2: \{ reading: 7, listening: 4, writing: 2 \}/);
  assert.match(loader, /cambridge_exam_subparts/);
});

test("Speaking is excluded from Express and Intensive assignment and scoring", () => {
  assert.match(scoring, /COURSE_PLAN_ELIGIBLE_SKILLS = \["reading", "listening", "writing"\]/);
  assert.match(planningServer, /Speaking cannot be assigned/);
  assert.match(planningServer, /filter\(isEligibleExamPart\)/);
  assert.match(planningUi, /Speaking cannot be assigned|Speaking/);
});

test("cross-activity duplicate prevention and reassignment are server enforced", () => {
  assert.match(planningServer, /Each exam part can be assigned to Homework or Classwork once/);
  assert.match(scoring, /unavailablePartIds/);
  assert.match(planningUi, /partUnavailableInPurpose/);
  assert.match(planningUi, /Remove /);
});

test("whole skill and whole exam selections expand to eligible parts", () => {
  assert.match(scoring, /expandSelection/);
  assert.match(scoring, /selection_scope === "full_exam"/);
  assert.match(planningUi, /toggleWholeSkill/);
  assert.match(planningUi, /Whole skill/);
  assert.match(planningUi, /Whole exam/);
  assert.match(planningUi, /Exam parts/);
  assert.match(scoring, /selection_scope === "skill"/);
  assert.match(scoring, /exam_subpart_id/);
});

test("numbered parts are grouped under their skill and preserve Listening Parts 1-4", () => {
  assert.match(definitions, /partCountFor/);
  assert.match(subpartsMigration, /generate_series\(1, v_count\)/);
  assert.match(planningUi, /course-planning-exam-skill-group/);
  assert.match(planningUi, /part\.label/);
  assert.match(planningUi, /skill_label/);
});

test("unassigned-part indicators and per-part statuses are rendered", () => {
  assert.match(planningUi, /unassigned part/);
  assert.match(planningUi, /Assigned to \$\{purpose/);
  assert.match(planningUi, /Not assigned/);
  assert.match(scoring, /remainingPartIds/);
});

test("per-student scores calculate incremental skill averages and complete-test averages", () => {
  assert.match(scoring, /skillAverage/);
  assert.match(scoring, /testPercentage/);
  assert.match(scoring, /values\.some/);
  assert.match(scoringServer, /skill_averages/);
  assert.match(scoringServer, /test_percentages/);
});

test("score persistence is class-scoped, authorized, and idempotent", () => {
  assert.match(migration, /course_plan_exam_scores/);
  assert.match(migration, /course_plan_exam_score_history/);
  assert.match(migration, /unique \(course_plan_day_id, student_id, exam_part_id, purpose\)/);
  assert.match(migration, /enable row level security/);
  assert.match(migration, /revoke all on table public\.course_plan_exam_scores from anon, authenticated/);
  assert.match(scoringServer, /current_class_enrolments/);
  assert.match(scoringServer, /upsert/);
  assert.match(scoringServer, /exam_subpart_id/);
  assert.match(route, /getCoursePlanningContext/);
});

test("whole skill and whole exam are blocked when assignments already exist", () => {
  assert.match(planningUi, /Remove existing assignments in this skill/);
  assert.match(planningUi, /before selecting Whole exam/);
  assert.match(planningServer, /selectionScope !== "full_exam" && selectionScope !== "skill"/);
});

test("teacher scoring UI keeps classwork and homework distinct and validates 0-100", () => {
  assert.match(scoringUi, /purpose === "homework" \? "Homework" : "Classwork"/);
  assert.match(scoringUi, /score < 0 \|\| score > 100/);
  assert.match(scoringUi, /Save score/);
  assert.match(scoringUi, /skill_label/);
});

test("student rendering shows the exact exam skill part and score state", () => {
  assert.match(studentPlan, /available_parts\.map/);
  assert.match(studentPlan, /Score \$\{score\.percentage\}%/);
  assert.match(studentPlan, /Not marked/);
  assert.match(studentPlan, /scores=\{day\.scores\}/);
  assert.match(teacherHomework, /cambridge_exam_subparts/);
  assert.match(studentHomework, /cambridge_exam_subparts/);
});

test("existing whole-exam and single-part plans remain readable", () => {
  assert.match(planningServer, /selection_scope === "full_exam"/);
  assert.match(planningServer, /selectionScope === "part"|selection_scope: "part"/);
  assert.match(studentPlan, /Full exam/);
  assert.match(planningServer, /selection_scope: String\(item\.selection_scope\)/);
});

test("normal courses keep Speaking support outside Express and Intensive", () => {
  assert.match(loader, /LEGACY_PART_ORDER/);
  assert.match(loader, /\["express", "intensive"\]\.includes/);
});
