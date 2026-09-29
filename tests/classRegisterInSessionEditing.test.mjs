import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const server = read("lib/classRegisterServer.ts");
const route = read("app/api/teacher/classes/[id]/register/route.ts");
const ui = read("app/teacher/class/ClassRegisterTab.tsx");
const types = read("lib/classRegister.ts");
const migration = read("supabase/migrations/20260929150000_class_register_in_session_edit_audit.sql");

test("submitted registers expose an in-session edit window using Madrid time", () => {
  assert.match(server, /function lessonIsInSession\(/);
  assert.match(server, /getMadridDateString\(now\)/);
  assert.match(server, /currentMinutes >= startMinutes/);
  assert.match(server, /currentMinutes < endMinutes/);
  assert.match(server, /can_edit_submitted: canEditSubmitted/);
  assert.match(types, /can_edit_submitted: boolean/);
});

test("teacher UI offers Edit register only during the active scheduled session", () => {
  assert.match(ui, /lesson\.can_edit_submitted\s*&&\s*isLessonInSessionOnClient\(lesson, clockNow\)[\s\S]*?\?\s*"Edit register"\s*:\s*"View register"/);
  assert.match(ui, /submittedRegisterReadOnly/);
  assert.match(ui, /This register is read-only after the scheduled class session/);
  assert.match(ui, /disabled=\{working \|\| submittedRegisterReadOnly\}/);
  assert.match(ui, /Mark \$\{entry\.full_name\} Present/);
  assert.match(ui, /Mark \$\{entry\.full_name\} Absent/);
  assert.doesNotMatch(ui, /Late|Excused/);
});

test("server route keeps assigned-teacher authorization and dispatches edits separately", () => {
  assert.match(server, /text\(classroom\.teacher_id\) !== actor\.id/);
  assert.match(server, /register\.completed_at && input\.complete !== true/);
  assert.match(server, /edit_class_register_attendance/);
  assert.match(route, /Completed Class Registers may only be edited during the scheduled class session/);
});

test("the secure edit RPC enforces the active window, Present/Absent values, and audit history", () => {
  assert.match(migration, /create table if not exists public\.class_register_entry_audit/);
  assert.match(migration, /original_status/);
  assert.match(migration, /new_status/);
  assert.match(migration, /teacher_id/);
  assert.match(migration, /v_register\.lesson_date <> v_today/);
  assert.match(migration, /v_time >= v_register\.scheduled_end_time/);
  assert.match(migration, /Attendance must be Present or Absent/);
  assert.match(migration, /insert into public\.class_register_entry_audit/);
  assert.match(migration, /Completed Class Registers must remain complete/);
  assert.match(migration, /classroom\.teacher_id = p_actor_id/);
  assert.match(migration, /security definer/);
  assert.match(migration, /set search_path = pg_catalog, public, pg_temp/);
  assert.match(migration, /revoke all on function public\.edit_class_register_attendance/);
  assert.match(migration, /grant execute on function public\.edit_class_register_attendance[\s\S]*to service_role/);
});

test("the audit path records both directions and requires no reason field", () => {
  assert.match(migration, /entry\.attendance_status is distinct from submitted\.attendance_status/);
  assert.match(migration, /marked_by = p_actor_id/);
  assert.match(migration, /changed_at/);
  assert.doesNotMatch(route, /reason/);
  assert.doesNotMatch(ui, /reason/);
});
