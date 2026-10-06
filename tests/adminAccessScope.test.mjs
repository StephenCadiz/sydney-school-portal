import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const policy = read("lib/adminAccess.ts");
const routeLayout = read("app/admin/layout.tsx");
const navLayout = read("app/components/layout/AdminLayout.tsx");
const attendance = read("app/admin/attendance/page.tsx");
const adminPage = read("app/admin/page.tsx");
const apiGuard = read("lib/cambridgeExamBankServer.ts");

test("Rocio's restriction is keyed by stable profile ID and preserves the requested areas", () => {
  assert.match(policy, /3eb96ad4-e8f7-4e96-bc96-ad8e533cf4a2/);
  for (const path of [
    "/admin",
    "/admin/students",
    "/admin/student-information",
    "/admin/school-roster",
    "/admin/class-exams",
    "/admin/print-class-exams",
    "/admin/friday-tutorials",
  "/admin/attendance",
  "/admin/class-enrolments",
    "/admin/messages",
    "/admin/announcements",
    "/admin/resources",
  ]) assert.match(policy, new RegExp(path.replaceAll("/", "\\/")));
  for (const path of [
    "/admin/classes",
    "/admin/teachers",
    "/admin/admin-staff",
    "/admin/exam-bank",
    "/admin/course-planning",
    "/admin/staff-time",
    "/admin/school-calendar",
    "/admin/teacher-calendar",
    "/admin/friday-exam-practice",
    "/admin/follow-ups",
    "/admin/student-monitoring",
    "/admin/syllabuses",
  ]) assert.doesNotMatch(policy, new RegExp(`allowed.*${path.replaceAll("/", "\\/")}`));
  assert.match(policy, /allowedPath !== "\/admin"/);
});

test("direct Admin pages and shared Admin API guards enforce the same capability policy", () => {
  assert.match(routeLayout, /adminPathAllowed\(profile\?\.id, pathname\)/);
  assert.match(navLayout, /filterAdminNavGroups\(adminId, menuGroups\)/);
  assert.match(apiGuard, /request\.nextUrl\.pathname\.replace\(\/\^\\\/api\//);
  assert.match(apiGuard, /adminApiPathAllowed\(profile\.id, pagePath\)/);
  assert.match(policy, /adminApiPathAllowed/);
  assert.match(policy, /\/admin\/staff-time\/self/);
  assert.match(apiGuard, /not authorised for this area/);
  assert.match(navLayout, /adminId \? visibleMenuGroups\.map/);
  assert.match(navLayout, /Loading Admin navigation/);
});

test("Rocio's Attendance view is overview-only", () => {
  assert.match(attendance, /isAdminAttendanceOverviewOnly/);
  assert.match(attendance, /showViewStudent=\{attendanceOverviewOnly === false\}/);
  assert.match(attendance, /showActions=\{attendanceOverviewOnly === false\}/);
  assert.match(attendance, /attendanceOverviewOnly === false && <nav/);
  assert.match(attendance, /attendanceOverviewOnly === false && <div className=\{styles\.overviewGrid\}/);
  assert.match(attendance, /isAdminAttendanceOverviewOnly/);
});

test("restricted dashboard omits disallowed operational cards and links", () => {
  assert.match(adminPage, /isRocioRestrictedAdmin/);
  assert.match(adminPage, /restrictedAdmin === false && mockResultsAwaitingReview/);
  assert.match(adminPage, /restrictedAdmin === false && monitoringSummary\.feedbackCount/);
  assert.match(adminPage, /restrictedAdmin === false && unreviewedFollowUps\.length/);
  assert.match(adminPage, /restrictedAdmin !== null && \(\s*<TeacherWorkingDayPanel/);
  assert.match(adminPage, /<section className="admin-dashboard-school-calendar"/);
  assert.match(adminPage, /restrictedAdmin === false && \(\s*<Link href="\/admin\/school-calendar"/);
  assert.match(adminPage, /<section className="admin-dashboard-main-grid"/);
  assert.match(adminPage, /restrictedAdmin === false && \(\s*<Link\s+href="\/admin\/teacher-calendar"/);
  assert.match(adminPage, /getUpcomingTeacherCalendarEvents\(\)/);
  assert.match(adminPage, /getUpcomingCalendarGroups\(\)/);
  assert.match(adminPage, /calendarLoading\s*\?\s*\(\s*<p[^>]*>Loading teacher calendar/);
  assert.match(adminPage, /schoolCalendarLoading\s*\n?\s*\?\s*"Loading School Calendar/);
  assert.match(adminPage, /restrictedAdmin === false && \(\s*<>\s*<StatItem\s+label="Classes"/s);
  assert.match(adminPage, /api\/admin\/school-closures\/summary/);
});

test("Rocio policy leaves unrestricted admins unaffected", () => {
  assert.match(policy, /if \(!isRocioRestrictedAdmin\(profileId\)\) return true/);
  assert.match(policy, /if \(!isRocioRestrictedAdmin\(profileId\)\) return groups/);
});

test("Rocio attendance APIs deny detail and mutation surfaces", () => {
  const attendanceApi = read("app/api/admin/attendance/route.ts");
  const alertApi = read("app/api/admin/attendance/alerts/[id]/route.ts");
  assert.match(attendanceApi, /isRocioRestrictedAdmin/);
  assert.match(attendanceApi, /\["count", "overview"\]\.includes\(view\)/);
  assert.match(alertApi, /isRocioRestrictedAdmin/);
  assert.match(alertApi, /attendance overview only/);
});

test("Rocio dashboard calendar summary uses a read-only authorized loader", () => {
  const summaryRoute = read("app/api/admin/school-closures/summary/route.ts");
  assert.match(summaryRoute, /requireExamBankAdmin/);
  assert.match(summaryRoute, /isRocioRestrictedAdmin/);
  assert.match(summaryRoute, /getNextSchoolClosure/);
  assert.match(summaryRoute, /next_closure/);
});
