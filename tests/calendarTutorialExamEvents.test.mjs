import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");
const groups = read("lib/calendarGroupsServer.ts");
const route = read("app/api/calendar/upcoming-groups/route.ts");
const teacherAgenda = read("app/components/teacher/TeacherCalendarAgenda.tsx");
const teacherCalendar = read("lib/teacherCalendar.ts");
const adminDashboard = read("app/admin/page.tsx");
const schoolCalendar = read("app/admin/school-calendar/page.tsx");
const styles = read("app/globals.css");

test("Friday Tutorial groups choose the nearest Madrid-local Friday and include every session", () => {
  assert.match(groups, /selectUpcomingFridayTutorialGroup/);
  assert.match(groups, /session\.session_date.*< today/);
  assert.match(groups, /date === today/);
  assert.match(groups, /end <= nowMinutes/);
  assert.match(groups, /items: sorted\.map/);
  assert.match(groups, /Kids 2–Junior 3 Tutorial/);
  assert.match(groups, /friday_tutorial_sessions/);
  assert.match(groups, /order\("session_date", \{ ascending: true \}\)/);
  assert.match(groups, /Europe\/Madrid/);
  assert.match(groups, /nowMinutes/);
});

test("Exam Week entries are grouped by period and levels are deduplicated", () => {
  assert.match(groups, /selectUpcomingExamWeekGroup/);
  assert.match(groups, /end_date >= today/);
  assert.match(groups, /row\.start_date === first\.start_date && row\.end_date === first\.end_date/);
  assert.match(groups, /uniqueLevels/);
  assert.match(groups, /title: "Exam Week"/);
  assert.match(groups, /syllabus_units/);
  assert.match(groups, /exam_week_start_date/);
  assert.match(groups, /exam_week_end_date/);
  assert.match(groups, /academic_years/);
});

test("Friday @ 6 events use the existing duty schedule and roll over after 19:00 Madrid time", () => {
  assert.match(groups, /friday_at_6_duties/);
  assert.match(groups, /selectUpcomingFridayAt6Group/);
  assert.match(groups, /Friday @ 6/);
  assert.match(groups, /18:00/);
  assert.match(groups, /19:00/);
  assert.match(groups, /getFridayAt6ResponsibilityLevelLabels/);
  assert.match(groups, /fridayAtSixHasEnded/);
  assert.match(groups, /b1_teacher_id/);
  assert.match(groups, /friday_exam_practice_sessions/);
  assert.match(groups, /title: "Cambridge Workshop"/);
  assert.match(groups, /Workshop`\.trim\(\)/);
  assert.match(groups, /namedActivities\.length > 0/);
  assert.match(groups, /assignEffectiveFridayTutorialDutyDates/);
});

test("A named Cambridge activity takes precedence over generic Friday @ 6 duty text", () => {
  assert.match(groups, /if \(namedActivities\.length > 0\)/);
  assert.match(groups, /level_name/);
  assert.match(groups, /activity_type/);
  assert.match(groups, /label: `\$\{String\(activity\.level_name/);
  assert.doesNotMatch(groups, /duty\.note/);
  assert.match(teacherAgenda, /item\.items\.map/);
  assert.match(adminDashboard, /event\.items\.map/);
});

test("Friday Tutorials and Friday @ 6 remain separate groups even when dates match", () => {
  assert.match(groups, /kind: "friday_tutorial"/);
  assert.match(groups, /kind: "friday_at_6"/);
  assert.match(teacherAgenda, /\.\.\.calendarGroups/);
  assert.match(adminDashboard, /\.\.\.calendarGroups/);
  assert.match(schoolCalendar, /group\.kind === "exam_week" \? "Exam Week" : group\.kind === "friday_at_6" \? "Friday @ 6"/);
});

test("Calendar groups use an authenticated no-store server route for Admins and Teachers", () => {
  assert.match(route, /supabaseAdmin\.auth\.getUser/);
  assert.match(route, /profile\?\.role !== "admin" && profile\?\.role !== "teacher"/);
  assert.match(route, /loadUpcomingCalendarGroups/);
  assert.match(route, /Cache-Control.*no-store/);
  assert.match(teacherCalendar, /fetch\("\/api\/calendar\/upcoming-groups"/);
  assert.match(teacherCalendar, /cache: "no-store"/);
});

test("Teacher Dashboard, Admin Dashboard, and School Calendar render both grouped event categories", () => {
  assert.match(teacherAgenda, /getUpcomingCalendarGroups/);
  assert.match(teacherAgenda, /item\.items\.map/);
  assert.match(adminDashboard, /getUpcomingCalendarGroups/);
  assert.match(adminDashboard, /admin-dashboard-calendar-group-items/);
  assert.match(schoolCalendar, /\/api\/calendar\/upcoming-groups/);
  assert.match(schoolCalendar, /Friday Tutorials and Exam Week/);
});

test("Empty schedules remain empty and existing calendar events are preserved", () => {
  assert.match(groups, /return null/);
  assert.match(teacherAgenda, /const nextClosure = getNextTeacherSchoolClosure\(closures\)/);
  assert.match(teacherAgenda, /const dashboardCalendarEvents = filterTeacherDashboardCalendarEvents/);
  assert.match(teacherAgenda, /nextClosure \? \[nextClosure\] : \[\]/);
  assert.match(teacherAgenda, /\.\.\.calendarGroups/);
  assert.match(adminDashboard, /dashboardCalendarEvents, \.\.\.calendarGroups/);
  assert.match(teacherAgenda, /visibleEvents/);
});

test("Admin and Teacher dashboard calendars expose all events through contained scrolling", () => {
  assert.match(adminDashboard, /dashboardCalendarEvents, \.\.\.calendarGroups/);
  assert.match(teacherAgenda, /const visibleEvents = events/);
  assert.match(styles, /\.admin-dashboard-event-list[\s\S]*max-height: 420px[\s\S]*overflow-y: auto/);
  assert.match(styles, /\.teacher-dashboard-event-list[\s\S]*max-height: 430px[\s\S]*overflow-y: auto/);
  assert.match(styles, /overscroll-behavior: contain/);
  assert.match(styles, /scrollbar-gutter: stable/);
  assert.match(styles, /scrollbar-color:/);
  assert.match(styles, /\.teacher-dashboard-calendar \.teacher-dashboard-event-list[\s\S]*overflow-y: auto/);
  assert.doesNotMatch(styles, /scrollbar-width:\s*none/);
  assert.match(styles, /@media \(max-width: 640px\)[\s\S]*100svh/);
});
