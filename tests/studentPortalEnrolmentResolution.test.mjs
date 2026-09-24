import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const migration = read("supabase/migrations/20260918130000_resolve_legacy_student_profile_rls.sql");
const studentUser = read("lib/user.ts");
const studentSession = read("app/api/student/session/route.ts");
const resourcesRoute = read("app/api/student/resources/route.ts");
const homeworkServer = read("lib/studentHomeworkServer.ts");
const dashboard = read("app/student/page.tsx");

test("legacy Auth users resolve Student Portal RLS through the mapped profile", () => {
  assert.match(migration, /create or replace function app_private\.current_profile_id\(\)/);
  assert.match(migration, /student_portal_accounts account/);
  assert.match(migration, /account\.auth_user_id = auth\.uid\(\)/);
  assert.match(migration, /app_private\.current_profile_id\(\)/);
  assert.match(migration, /student_id = app_private\.current_profile_id\(\)/);
  assert.match(migration, /set search_path = pg_catalog, public, pg_temp/);
  assert.match(migration, /security definer/);
});

test("Student loaders use the mapping-aware session and server profile resolution", () => {
  assert.match(studentSession, /resolveProfileIdForAuthUser\(authData\.user\.id\)/);
  assert.match(studentUser, /fetch\("\/api\/student\/session"/);
  assert.match(studentUser, /\.eq\("student_id", user\.id\)/);
  assert.match(resourcesRoute, /resolveProfileIdForAuthUser\(authData\.user\.id\)/);
  assert.match(homeworkServer, /resolveProfileIdForAuthUser\(data\.user\.id\)/);
  assert.match(studentSession, /select\("id, email, role, first_name, last_name"\)/);
  assert.match(studentSession, /first_name: profile\.first_name/);
  assert.match(studentUser, /first_name: payload\.first_name/);
  assert.match(dashboard, /user\.display_name \|\|/);
  assert.doesNotMatch(dashboard, /\.from\("profiles"\)/);
});

test("Student access remains bounded by the current enrolment and Cambridge rules", () => {
  assert.match(migration, /p_type = 'profile'/);
  assert.match(migration, /current_class_enrolments/);
  assert.match(resourcesRoute, /resolveStudentCurrentClassServer\(studentId\)/);
  assert.match(homeworkServer, /resolveStudentCurrentClassServer\(studentId\)/);
});
