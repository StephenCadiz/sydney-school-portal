import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const server = read("lib/coursePlanningServer.ts");
const ui = read("app/teacher/class/CoursePlanningTab.tsx");
const styles = read("app/globals.css");
const calendar = read("lib/schoolClosures.ts");
const eligibility = read("lib/coursePlanningEligibility.ts");

test("Express and Intensive planning loads Madrid-local closures into each lesson", () => {
  assert.match(server, /loadSchoolClosures\(\{\s*startDate: firstLessonDate/);
  assert.match(server, /findSchoolClosure\(String\(day\.lesson_date\), closures\)/);
  assert.match(server, /closure_type: match\.closure_type/);
  assert.match(server, /start_date: String\(match\.start_date\)/);
  assert.match(server, /end_date: String\(match\.end_date\)/);
  assert.match(server, /isCoursePlanningEligible/);
  assert.match(eligibility, /\["intensive", "express"\]/);
  assert.match(calendar, /timeZone: "Europe\/Madrid"/);
});

test("closure lessons are visibly read-only while preserving saved planning", () => {
  assert.match(ui, /ClosureLessonCard/);
  assert.match(ui, /course-planning-closure-card/);
  assert.match(ui, /School closed/);
  assert.match(ui, /selectedDay\.closure\.name/);
  assert.match(ui, /No planning required for this date\./);
  assert.match(ui, /Scheduled time/);
  assert.match(ui, /!selectedDayIsClosed &&.*View final plan/);
  assert.match(ui, /!selectedDayIsClosed && \(snapshot\.plan\.status/);
  assert.doesNotMatch(ui, /course-planning-edit-fieldset/);
  assert.match(ui, /if \(selectedDay\.closure\)/);
});

test("the server rejects save and resource mutations on closure dates", () => {
  assert.match(server, /async function rejectClosedLesson/);
  assert.match(server, /await rejectClosedLesson\(String\(day\.lesson_date\)\)/);
  assert.match(server, /await rejectClosedLesson\(String\(resourceDay\?\.lesson_date/);
  assert.match(server, /School is closed on \$\{lessonDate\}/);
});

test("publishing does not activate homework assignments for a closed lesson", () => {
  assert.match(server, /if \(await getCoursePlanningClosure\(String\(day\.lesson_date\)\)\)/);
  assert.match(server, /await deactivateHomeworkForDay\(String\(day\.id\)\)/);
});

test("lesson numbering and later lesson dates remain unchanged", () => {
  assert.match(server, /getScheduledCourseDays\(context: CoursePlanningContext\)/);
  assert.match(server, /date = addMadridCalendarDays\(date, 1\)/);
  assert.match(ui, /Lesson \{index \+ 1\}/);
  assert.doesNotMatch(server, /filter\(.*closure/);
});

test("non-closure lessons retain normal editable controls", () => {
  assert.match(ui, /const selectedDayIsClosed = Boolean\(selectedDay\?\.closure\)/);
  assert.match(ui, /<form onSubmit=\{saveDay\}>/);
  assert.match(ui, /Pages to be covered/);
  assert.match(ui, /Written homework/);
  assert.match(styles, /\.course-planning-closure-card/);
});
