import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(new URL(
  "../supabase/migrations/20260918120000_fix_student_permanent_deletion_auth_cleanup.sql",
  import.meta.url,
), "utf8");
const deleteRoute = readFileSync(new URL(
  "../app/api/admin/students/delete/route.ts",
  import.meta.url,
), "utf8");

test("permanent student deletion resolves legacy Auth IDs through mapping or exact email", () => {
  assert.match(migration, /student_portal_accounts[\s\S]*auth_user_id/);
  assert.match(migration, /lower\(btrim\(auth_user\.email\)\)\s*=\s*lower\(btrim\(profile\.email\)\)/);
  assert.match(migration, /auth_user\.id\s*=\s*any\(v_profile_ids\)/);
  assert.match(migration, /array_agg\(distinct auth_user\.id\)/);
});

test("Auth cleanup is transactional, exact, and preserves the existing child purge", () => {
  assert.match(migration, /delete from public\.student_portal_accounts/);
  assert.match(migration, /delete from auth\.users[\s\S]*where id = any\(v_auth_user_ids\)/);
  assert.match(migration, /purge_test_students_legacy\(p_students, p_confirmation\)/);
  assert.match(migration, /security definer/);
  assert.match(migration, /set search_path = pg_catalog, public, pg_temp/);
  assert.match(migration, /revoke all on function public\.purge_test_students\(jsonb, text\)[\s\S]*from public, anon, authenticated/);
  assert.match(migration, /grant execute on function public\.purge_test_students\(jsonb, text\)[\s\S]*to service_role/);
  assert.match(migration, /revoke all on function public\.purge_test_students_legacy\(jsonb, text\)[\s\S]*service_role/);
});

test("Ambiguous matches fail closed and completed deletion is idempotent", () => {
  assert.match(migration, /multiple profiles/);
  assert.match(migration, /multiple Auth accounts/);
  assert.match(migration, /'idempotent', true/);
  assert.match(migration, /not exists \(select 1 from auth\.users where id = v_retry_profile_id\)/);
});

test("The HTTP entry point remains the Admin-only confirmed purge RPC", () => {
  assert.match(deleteRoute, /requireExamBankAdmin/);
  assert.match(deleteRoute, /p_students: \[\{ student_type: type === "cambridge" \? "profile" : "young_learner", student_id: body\.student_id \}\]/);
  assert.match(deleteRoute, /p_confirmation: "DELETE"/);
});
