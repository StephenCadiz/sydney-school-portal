import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const migration = read("supabase/migrations/20260918140000_student_monitoring.sql");
const server = read("lib/studentMonitoringServer.ts");
const adminRoute = read("app/api/admin/student-monitoring/route.ts");
const teacherRoute = read("app/api/teacher/student-monitoring/[id]/route.ts");
const tasks = read("app/components/teacher/TeacherStudentMonitoringTasks.tsx");
const layout = read("app/components/layout/TeacherLayout.tsx");
const sidebar = read("app/components/layout/TeacherSidebar.tsx");

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
