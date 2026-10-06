import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) =>
  readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const notices = read("app/api/teacher/friday-tutorial-notices/route.ts");
const attendance = read("app/api/teacher/friday-tutorial-attendance/route.ts");
const reminderCard = read("app/components/teacher/FridayTutorialDutyReminderCard.tsx");
const teacherPage = read("app/teacher/page.tsx");
const summaryRoute = read("app/api/admin/student-information/friday-tutorial-attendance/route.ts");
const summaryCard = read("app/components/admin/AdminStudentFridayTutorialAttendance.tsx");
const overview = read("app/admin/student-information/page.tsx");

test("duty reminders use the assigned Friday duty from Wednesday through Friday", () => {
  assert.match(notices, /weekday < 3 \|\| weekday > 5/);
  assert.match(notices, /phase = weekday === 3 \? "wednesday" : weekday === 4 \? "thursday" : "friday"/);
  assert.match(notices, /loadEffectiveFridayTutorialDutyForDate\(sessionDate\)/);
  assert.match(notices, /getFridayAt6DutyTypesForTeacher\(\s*duty,\s*teacherId,\s*tutorialGroup/);
  assert.match(notices, /if \(!duty \|\| dutyTypes\.length === 0\) return null/);
  assert.match(teacherPage, /<FridayTutorialDutyReminderCard reminder=\{fridayDutyReminder\} \/>/);
});

test("duty dismissal is phase-specific and reappears for the next phase", () => {
  assert.match(reminderCard, /teacher-friday-tutorial-duty-dismissed:\$\{reminder\.duty_id\}:\$\{reminder\.phase\}/);
  assert.match(reminderCard, /localStorage\.getItem\(storageKey\)/);
  assert.match(reminderCard, /Dismiss \{phaseLabel\} reminder/);
});

test("attendance is restricted to the assigned teacher and opens at 18:00", () => {
  assert.match(attendance, /profile\?\.role !== "teacher"/);
  assert.match(attendance, /getFridayAt6DutyTypesForTeacher\(/);
  assert.match(attendance, /open: now\.minutes >= 18 \* 60/);
  assert.match(attendance, /student_attended_status/);
  assert.doesNotMatch(attendance, /parent_confirmed_status/);
});

test("attendance accepts only Present/Absent values, updates weekly rows, and is idempotent", () => {
  assert.match(attendance, /\["yes", "no"\]\.includes\(status\)/);
  assert.match(attendance, /student_attended_status: item\.student_attended_status/);
  assert.match(attendance, /existingById/);
  assert.match(attendance, /changed = submitted\.filter/);
  assert.match(attendance, /complete: true/);
  assert.match(read("app/components/teacher/FridayTutorialAttendanceCard.tsx"), /Present/);
  assert.match(read("app/components/teacher/FridayTutorialAttendanceCard.tsx"), /Absent/);
});

test("Student Information summary is Admin-only, invitation-gated, and student-scoped", () => {
  assert.match(summaryRoute, /requireExamBankAdmin\(request\)/);
  assert.match(summaryRoute, /profile_student_id/);
  assert.match(summaryRoute, /young_learner_id/);
  assert.match(summaryRoute, /total_invitations/);
  assert.match(summaryRoute, /attended/);
  assert.match(summaryRoute, /absent/);
  assert.match(summaryRoute, /pending/);
  assert.match(summaryRoute, /row\.session_date >= today/);
  assert.match(summaryCard, /if \(!summary\?\.invited\) return null/);
  assert.match(summaryCard, /Pending attendance/);
  assert.match(overview, /<AdminStudentFridayTutorialAttendance/);
});
