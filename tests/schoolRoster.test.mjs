import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const server = read("lib/schoolRosterServer.ts");
const route = read("app/api/school-roster/route.ts");
const roster = read("app/components/roster/SchoolRosterView.tsx");
const adminPage = read("app/admin/school-roster/page.tsx");
const teacherPage = read("app/teacher/school-roster/page.tsx");
const teacherNav = read("app/components/layout/TeacherSidebar.tsx");
const adminNav = read("app/components/layout/AdminLayout.tsx");

test("School Roster is available to Admins and authenticated Teachers only", () => {
  assert.match(server, /resolveAuthenticatedProfile/);
  assert.match(server, /\["admin", "teacher"\]\.includes\(profile\.role\)/);
  assert.doesNotMatch(server, /role !== "teacher" \|\| String\(classroom\.teacher_id/);
  assert.match(server, /const visibleClasses = \(classes \|\| \[\]\)\.filter/);
  assert.match(server, /isActiveClass\(classroom, today, currentAcademicYearId\)/);
  assert.match(route, /authenticateSchoolRosterViewer/);
  assert.match(teacherNav, /href="\/teacher\/school-roster"/);
  assert.match(adminNav, /href: "\/admin\/school-roster"/);
  assert.match(adminPage, /<AdminLayout>/);
  assert.match(teacherPage, /<TeacherLayout>/);
});

test("roster uses active classes and authoritative current enrolment views", () => {
  assert.match(server, /academic_years/);
  assert.match(server, /isActiveClass/);
  assert.match(server, /class_roster_profiles/);
  assert.match(server, /class_roster_young_learners/);
  assert.match(server, /isCurrentEnrolment/);
  assert.match(server, /enrolled_at/);
  assert.match(server, /ends_before/);
  assert.match(server, /syllabus_coordinators/);
});

test("School Roster is school-wide for authorised Teachers and keeps both programmes", () => {
  assert.match(server, /programme: classroom\.is_cambridge === true \? "Cambridge" : "Young Learner"/);
  assert.match(server, /class_roster_profiles/);
  assert.match(server, /class_roster_young_learners/);
  assert.doesNotMatch(server, /classroom\.teacher_id\s*\)\s*===\s*viewer\.userId/);
  assert.match(server, /sortClassesByGlobalOrder\(rosterRows\)/);
  assert.match(server, /coordinator: coordinatorByLevel/);
});

test("student lookup is server-filtered and exposes placement without controls that mutate data", () => {
  assert.match(server, /filterSchoolRoster/);
  assert.match(server, /first_name|last_name/);
  assert.match(roster, /Student lookup/);
  assert.match(roster, /Search first name or surname/);
  assert.match(roster, /Current active placement/);
  assert.doesNotMatch(roster, /method="post"|onSubmit=|Save|Delete|Assign/);
  assert.doesNotMatch(route, /export async function POST/);
});

test("roster groups programmes and levels and supports expandable class students", () => {
  assert.match(roster, /school-roster-programme/);
  assert.match(roster, /school-roster-level/);
  assert.match(roster, /<details className="school-roster-class-card"/);
  assert.match(roster, /Enrolled students/);
  assert.match(roster, /Coordinator/);
});

test("responsive roster styles prevent narrow-screen overflow", () => {
  const css = read("app/globals.css");
  assert.match(css, /\.school-roster-page[\s\S]*max-width: var\(--teacher-content-max-width/);
  assert.match(css, /@media \(max-width: 640px\)[\s\S]*\.school-roster-filter-grid/);
  assert.match(css, /school-roster-class-grid \{ grid-template-columns: 1fr/);
});
