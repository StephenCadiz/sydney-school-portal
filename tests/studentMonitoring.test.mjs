import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const migration = read("supabase/migrations/20260918140000_student_monitoring.sql");
const programmesMigration = read("supabase/migrations/20260918150000_student_monitoring_young_learners.sql");
const server = read("lib/studentMonitoringServer.ts");
const adminRoute = read("app/api/admin/student-monitoring/route.ts");
const teacherRoute = read("app/api/teacher/student-monitoring/[id]/route.ts");
const tasks = read("app/components/teacher/TeacherStudentMonitoringTasks.tsx");
const layout = read("app/components/layout/TeacherLayout.tsx");
const sidebar = read("app/components/layout/TeacherSidebar.tsx");
const adminPage = read("app/admin/student-monitoring/page.tsx");
const dashboard = read("app/admin/page.tsx");
const adminLayout = read("app/components/layout/AdminLayout.tsx");
const searchRoute = read("app/api/admin/student-monitoring/students/route.ts");
const enrolmentRoute = read("app/api/admin/student-monitoring/students/[id]/route.ts");
const styles = read("app/globals.css");

test("monitoring schema preserves feedback, decisions, and append-only history", () => {
  assert.match(migration, /create table public\.student_monitoring_records/);
  assert.match(migration, /create table public\.student_monitoring_feedback/);
  assert.match(migration, /create table public\.student_monitoring_history/);
  assert.match(migration, /previous_deadline date/);
  assert.match(migration, /new_deadline date/);
  assert.match(migration, /student_monitoring_one_active_per_student_class/);
  assert.match(migration, /foreign key|references public\.profiles/);
  assert.match(migration, /create unique index student_monitoring_one_active_per_student_class/);
  assert.match(migration, /where status in \('awaiting_teacher_feedback'/);
  assert.match(migration, /like '%intensive%'/);
  assert.match(migration, /like '%express%'/);
});

test("Admin creation and decisions are server-authorized", () => {
  assert.match(migration, /Only Admin users can create monitoring records/);
  assert.match(migration, /Only Admin users can decide monitoring records/);
  assert.match(adminRoute, /auth\.actor\?\.role !== "admin"/);
  assert.match(adminRoute, /create_student_monitoring/);
  assert.match(server, /\["admin", "teacher"\]/);
});

test("Teacher actions are class-scoped and cannot change class or level", () => {
  assert.match(migration, /v_record\.teacher_id is distinct from p_actor_id/);
  assert.match(migration, /submit_student_monitoring_feedback/);
  assert.match(migration, /continue_student_monitoring/);
  assert.match(teacherRoute, /body\.action === "continue"/);
  assert.match(teacherRoute, /body\.action === "feedback"/);
  assert.doesNotMatch(teacherRoute, /p_new_class_id/);
});

test("Teacher cards persist until feedback and keep overdue tasks visible", () => {
  assert.match(tasks, /Student Monitoring/);
  assert.match(tasks, /Complete feedback/);
  assert.match(tasks, /Continue monitoring/);
  assert.match(tasks, /status === "overdue"/);
  assert.match(tasks, /cache: "no-store"/);
  assert.match(tasks, /setActive\(record\)/);
  assert.match(layout, /<TeacherStudentMonitoringTasks \/>/);
  assert.match(sidebar, /studentMonitoringCount/);
  assert.match(sidebar, /title="Student Monitoring"/);
});

test("Madrid deadline and secure RPC settings are explicit", () => {
  assert.match(migration, /Europe\/Madrid/);
  assert.match(migration, /set search_path = pg_catalog, public, app_private, pg_temp/);
  assert.match(migration, /language plpgsql security definer/);
  assert.match(migration, /revoke all on function[\s\S]*from public, anon, authenticated/);
  assert.match(migration, /grant execute on function[\s\S]*to service_role/);
  assert.match(server, /effectiveStatus/);
  assert.match(server, /feedback_due_on.*today/);
});

test("Responsive monitoring surfaces are bounded", () => {
  const styles = read("app/globals.css");
  assert.match(styles, /teacher-monitoring-task-cards/);
  assert.match(styles, /teacher-monitoring-modal-backdrop/);
  assert.match(styles, /max-height: calc\(100vh - 20px\)/);
  assert.match(styles, /@media \(max-width: 700px\)/);
});

test("Admin monitoring uses an accessible searchable all-programmes combobox", () => {
  assert.match(adminPage, /import AdminLayout/);
  assert.match(adminPage, /<AdminLayout>/);
  assert.match(adminPage, /admin-student-monitoring-page/);
  assert.match(adminLayout, /admin-portal-header/);
  assert.match(adminLayout, /admin-sidebar/);
  assert.match(styles, /\.admin-student-monitoring-page \{ width: 100%; max-width: var\(--admin-content-max-width/);
  assert.match(styles, /admin-monitoring-result-enrolment/);
  assert.match(adminPage, /role="combobox"/);
  assert.match(adminPage, /Search student by first name or surname/);
  assert.match(adminPage, /aria-autocomplete="list"/);
  assert.match(adminPage, /role="listbox"/);
  assert.match(adminPage, /No matching students/);
  assert.match(adminPage, /Clear selected student/);
  assert.match(adminPage, /searchRequest/);
  assert.match(searchRoute, /searchMonitoringStudents/);
  assert.match(server, /young_learners/);
  assert.match(adminPage, /Young Learner/);
  assert.match(adminPage, /admin-monitoring-result-programme/);
  assert.match(adminPage, /admin-monitoring-result-enrolment/);
  assert.match(searchRoute, /role !== "admin"/);
});

test("Selected students load authoritative active enrolment details", () => {
  assert.match(adminPage, /load active enrolment/);
  assert.match(adminPage, /Level/);
  assert.match(adminPage, /Class/);
  assert.match(adminPage, /Days/);
  assert.match(adminPage, /Assigned teacher/);
  assert.match(adminPage, /multiple active enrolments|enrolments.length > 1/);
  assert.match(enrolmentRoute, /loadMonitoringEnrolments/);
  assert.match(enrolmentRoute, /role !== "admin"/);
  assert.match(adminPage, /enrolmentRequest/);
  assert.match(server, /enrolments: await loadMonitoringEnrolments/);
  assert.match(server, /studentType === "profile"/);
});

test("Create ignores browser-supplied level and teacher values", () => {
  assert.match(adminRoute, /loadMonitoringEnrolments\(studentType, studentId\)/);
  assert.match(adminRoute, /p_level_id: enrolment\.level_id/);
  assert.doesNotMatch(adminRoute, /p_teacher_id/);
  assert.match(server, /eq\("is_cambridge", true\)/);
  assert.match(migration, /selected student is not currently enrolled/);
});

test("Monitoring supports Young Learners with a focused schema extension", () => {
  assert.match(programmesMigration, /student_type text not null default 'profile'/);
  assert.match(programmesMigration, /young_learner_id uuid references public\.young_learners/);
  assert.match(programmesMigration, /drop function if exists public\.create_student_monitoring\(uuid,uuid,uuid,bigint,text,date\)/);
  assert.match(programmesMigration, /p_student_type text/);
  assert.match(programmesMigration, /p_young_learner_id uuid/);
  assert.match(programmesMigration, /student_type = 'young_learner'/);
  assert.match(programmesMigration, /v_class\.is_cambridge is true/);
  assert.match(programmesMigration, /set search_path = pg_catalog, public, app_private, pg_temp/);
  assert.match(programmesMigration, /revoke all on function[\s\S]*from public, anon, authenticated/);
  assert.match(programmesMigration, /grant execute on function[\s\S]*to service_role/);
});

test("Student monitoring search covers names, programmes, and current enrolments", () => {
  assert.match(server, /toLowerCase\(\)/);
  assert.match(server, /first_name\.ilike\.%\$\{term\}%,last_name\.ilike\.%\$\{term\}%/);
  assert.match(server, /young_learners.*select\("id, first_name, last_name, active"\)/s);
  assert.match(server, /from\("class_roster_profiles"\)/);
  assert.match(server, /select\("student_id, first_name, last_name, email, class_id/);
  assert.match(server, /String\(profile\.student_id\)/);
  assert.match(server, /row\.active !== false/);
  assert.match(server, /cancelled_at.*lte\("starts_on", today\)/s);
  assert.match(server, /ends_before\.is\.null,ends_before\.gt\.\$\{today\}/);
  assert.match(adminPage, /No matching students/);
  assert.match(adminPage, /student_type === "young_learner"/);
});

test("Admin monitoring feedback stays visible until an outcome and is clearly structured", () => {
  assert.match(adminLayout, /student-monitoring\?summary=1/);
  assert.match(adminLayout, /monitoringSummary\.feedbackCount/);
  assert.match(adminLayout, /admin-student-monitoring-changed/);
  assert.match(adminLayout, /item\.name === "Student Monitoring"/);
  assert.match(adminRoute, /feedback_submitted/);
  assert.match(adminRoute, /overdueCount/);
  assert.match(dashboard, /Student Monitoring requires review/);
  assert.match(dashboard, /Student Monitoring overdue/);
  assert.match(adminPage, /admin-monitoring-record-card/);
  assert.match(adminPage, /Overall observation/);
  assert.match(adminPage, /Strengths/);
  assert.match(adminPage, /Difficulties/);
  assert.match(adminPage, /Recommended level\/action/);
  assert.match(adminPage, /Teacher notes/);
  assert.match(adminPage, /Save outcome/);
  assert.match(adminPage, /savingDecision/);
  assert.match(adminPage, /admin_notes/);
  assert.match(adminPage, /new_deadline/);
  assert.match(styles, /admin-monitoring-record-card/);
  assert.match(styles, /admin-dashboard-monitoring-alert/);
  assert.match(styles, /admin-monitoring-decision-fields/);
});

test("Teacher continuation preserves the authoritative deadline", () => {
  assert.doesNotMatch(tasks, /type="date"/);
  assert.match(tasks, /existing deadline/);
  assert.match(tasks, /body\s*:\s*action === "continue" \? JSON\.stringify\(\{ action \}\)/);
  assert.match(teacherRoute, /loadMonitoringRecords\(auth\.actor\.id, "teacher"\)/);
  assert.match(teacherRoute, /p_new_deadline: current\.feedback_due_on/);
  assert.match(teacherRoute, /current\.status === "overdue"/);
  assert.doesNotMatch(teacherRoute, /body\.new_deadline/);
  assert.match(migration, /v_previous_deadline/);
  assert.match(migration, /p_new_deadline <=/);
});
