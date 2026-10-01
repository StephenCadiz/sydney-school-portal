import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const planningUi = read("app/teacher/class/CoursePlanningTab.tsx");
const planningServer = read("lib/coursePlanningServer.ts");
const studentPlan = read("app/student/course-plan/page.tsx");
const eligibility = read("lib/coursePlanningEligibility.ts");
const migration = read("supabase/migrations/20260806195000_create_course_planning.sql");
const styles = read("app/globals.css");

test("Express and Intensive planning exposes separate grouped multi-part selectors", () => {
  assert.match(planningUi, /supportsMultiPartSelections/);
  assert.match(planningUi, /\["express", "intensive"\]/);
  assert.match(planningUi, /type="checkbox"/);
  assert.match(planningUi, /Whole exam/);
  assert.match(planningUi, /purpose === "homework" \? "Homework" : "Classwork"/);
  assert.match(planningUi, /course-planning-exam-trigger/);
  assert.match(planningUi, /course-planning-exam-popover/);
  assert.match(planningUi, /Add another exam/);
  assert.match(planningUi, /course-planning-selected-chip/);
  assert.match(planningUi, /course-planning-exam-choice-heading/);
  assert.match(planningUi, /course-planning-purpose-heading/);
  assert.match(planningUi, /course-planning-exam-parts-label/);
  assert.match(planningUi, /Remove /);
});

test("multi-exam selections retain purpose separation and backward-compatible storage", () => {
  assert.match(planningUi, /examItems: FormExamItem\[\]/);
  assert.match(planningUi, /purpose: FormExamItem\["purpose"\]/);
  assert.match(planningUi, /selection_scope: "full_exam"/);
  assert.match(planningUi, /selection_scope: "part"/);
  assert.match(planningServer, /\.from\("course_plan_exam_items"\)/);
  assert.match(planningServer, /exam_set_id: item\.examSetId/);
  assert.match(planningServer, /exam_part_id: item\.examPartId/);
});

test("server validation prevents duplicates and whole-exam/part overlap per purpose", () => {
  assert.match(planningServer, /const seen = new Set<string>\(\)/);
  assert.match(planningServer, /same exam activity can only be selected once/);
  assert.match(planningServer, /Choose Whole exam or individual parts for the same exam/);
  assert.match(planningServer, /purposeExamKey/);
});

test("same-skill numbered parts reconcile by exact subpart identity", () => {
  assert.match(planningServer, /function homeworkAssignmentKey\(examPartId: string, examSubpartId: string \| null\)/);
  assert.match(planningServer, /homeworkAssignmentKey\(selection\.parentId, selection\.subpartId\)/);
  assert.match(planningServer, /assignmentsByKey/);
  assert.match(planningServer, /exam_subpart_id/);
  assert.match(planningServer, /already assigned to the selected lesson/);
});

test("server logging preserves useful database error fields without exposing them to clients", () => {
  const route = read("app/api/teacher/classes/[id]/course-planning/route.ts");
  assert.match(route, /message:/);
  assert.match(route, /code:/);
  assert.match(route, /details:/);
  assert.match(route, /hint:/);
  assert.match(route, /Unable to update Course Planning\./);
});

test("the existing schema remains backward-compatible while cross-activity duplicates are validated server-side", () => {
  assert.match(migration, /unique \(course_plan_day_id, purpose, exam_set_id, exam_part_id\)/);
  assert.match(migration, /selection_scope text not null check \(selection_scope in \('full_exam', 'part'\)\)/);
  assert.match(migration, /purpose text not null check \(purpose in \('class_practice', 'homework'\)\)/);
  assert.doesNotMatch(migration, /alter table public\.course_plan_exam_items\s+add column/);
});

test("student classwork and homework render every selected item independently", () => {
  assert.match(studentPlan, /function classPracticeItems\(day: PlanDay\)/);
  assert.match(studentPlan, /function homeworkItems\(day: PlanDay\)/);
  assert.match(studentPlan, /<MaterialActions items=\{practice\}/);
  assert.match(studentPlan, /<MaterialActions items=\{homework\}/);
  assert.match(studentPlan, /items\.map\(\(item\)/);
});

test("normal course eligibility remains unchanged", () => {
  assert.match(eligibility, /COURSE_PLANNING_COURSE_TYPES = new Set\(\["intensive", "express"\]\)/);
  assert.match(eligibility, /input\.isCambridge === true/);
  assert.match(planningUi, /Choose exam/);
  assert.match(planningUi, /Class practice/);
  assert.match(planningUi, /addExamItem/);
});

test("multi-part controls remain responsive and keyboard accessible", () => {
  assert.match(planningUi, /aria-haspopup="dialog"/);
  assert.match(planningUi, /aria-label=\{purpose === "homework"/);
  assert.match(styles, /\.course-planning-exam-popover-body \{[^}]*grid-template-columns/);
  assert.match(styles, /\.course-planning-selected-exams \{[^}]*flex-wrap: wrap/);
  assert.match(styles, /course-planning-exam-part:focus-within/);
  assert.match(styles, /\.course-planning-exam-menu button:focus-visible/);
  assert.match(styles, /\.course-planning-chip-remove:focus-visible/);
  assert.match(styles, /\.course-planning-exam-popover-footer \{ align-items: stretch; flex-direction: column; \}/);
  assert.doesNotMatch(planningUi, /course-planning-exam-groups/);
});

test("selected chips have one clear activity label and no duplicated purpose text", () => {
  assert.match(planningUi, /Selected \{purpose === "homework" \? "homework" : "classwork"\}/);
  assert.match(planningUi, /<p>Written homework<\/p>/);
  assert.match(planningUi, /selectedExamLabel\(item\)/);
  assert.doesNotMatch(planningUi, /Exam \+.*Homework.*Homework/);
});

test("menus start collapsed and retain selections outside the popover", () => {
  assert.match(planningUi, /const \[openExamPurpose, setOpenExamPurpose\] = useState/);
  assert.match(planningUi, /openExamPurpose === purpose/);
  assert.match(planningUi, /setOpenExamPurpose\(null\)/);
  assert.match(planningUi, /course-planning-selected-chip/);
  assert.match(planningUi, /onClick=\{\(\) => openExamMenu\(purpose, true\)\}/);
});
