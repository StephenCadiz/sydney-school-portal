import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync(new URL("../app/admin/student-information/page.tsx", import.meta.url), "utf8");
const component = readFileSync(new URL("../app/components/admin/AdminStudentManagement.tsx", import.meta.url), "utf8");
const route = readFileSync(new URL("../app/api/admin/class-enrolments/route.ts", import.meta.url), "utf8");
const migration = readFileSync(new URL("../supabase/migrations/20260928160000_student_management_reason.sql", import.meta.url), "utf8");

test("Student Management is available for Cambridge and Young Learner detail windows", () => {
  assert.equal((page.match(/id: "student-management", label: "Student Management"/g) || []).length, 2);
  assert.match(page, /<AdminStudentManagement/);
});

test("management uses stable IDs, existing enrolment periods and server actions", () => {
  assert.match(component, /studentId: string/);
  assert.match(component, /studentType: "profile" \| "young_learner"/);
  assert.match(component, /\/api\/admin\/class-enrolments\?student_type=/);
  assert.match(component, /action,?\s*\/\*?\s*transfer|action,?/);
  assert.match(component, /save\("transfer"\)/);
  assert.match(component, /save\("withdraw"\)/);
  assert.match(component, /save\("enrol"\)/);
  assert.match(component, /withdrawReason\.trim\(\)/);
  assert.match(component, /history/);
  assert.doesNotMatch(component, /delete\(/i);
});

test("server validates Admin enrolment operations and never trusts display fields", () => {
  assert.match(route, /requireExamBankAdmin/);
  assert.match(route, /p_student_type: body\.student_type/);
  assert.match(route, /p_student_id: body\.student_id/);
  assert.match(route, /p_class_id: body\.class_id/);
  assert.match(route, /manage_class_enrolment_period_with_reason/);
  assert.match(route, /body\.action === "withdraw"/);
  assert.match(route, /body\.reason\.trim\(\)/);
});

test("withdrawal reasons are audited and the reusable RPC is service-role-only", () => {
  assert.match(migration, /add column if not exists reason text/i);
  assert.match(migration, /manage_class_enrolment_period\(/);
  assert.match(migration, /set reason = nullif\(btrim\(p_reason\), ''\)/);
  assert.match(migration, /set search_path = pg_catalog, pg_temp/);
  assert.match(migration, /revoke all on function public\.manage_class_enrolment_period_with_reason/);
  assert.match(migration, /grant execute on function public\.manage_class_enrolment_period_with_reason[\s\S]*to service_role/);
});

test("future withdrawal, re-enrolment, overlap and no-hard-delete safeguards are represented", () => {
  assert.match(component, /portalActive/);
  assert.match(component, /Future re-enrolment/);
  assert.match(component, /Re-add student/);
  assert.match(route, /23P01/);
  assert.doesNotMatch(migration, /delete\s+from\s+public\.(profiles|class_enrolment_periods|class_enrolment_period_events)/i);
});

test("Student Management presents spaced labels, action cards and accessible states", () => {
  for (const label of ["Current placement", "Change class", "Remove from school", "Re-add student", "Enrolment history"]) {
    assert.match(component, new RegExp(label));
  }
  assert.match(component, /aria-label="New class"/);
  assert.match(component, /aria-label="Withdrawal reason"/);
  assert.match(component, /role="alert"/);
  assert.match(component, /role="status"/);
  assert.match(component, /Saving…/);
  assert.match(component, /student-management-grid/);
});

test("Student Information modal keeps a fixed header/tabs and independently scrollable body", () => {
  const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(css, /\.admin-student-detail-modal-panel[\s\S]*max-height: min\(91vh, calc\(100vh - 32px\)\)/);
  assert.match(css, /\.admin-student-detail-modal-content[\s\S]*overflow: auto/);
  assert.match(css, /\.admin-student-detail-modal-content[\s\S]*scrollbar-gutter: stable/);
  assert.match(css, /\.admin-student-detail-modal-tabs[\s\S]*overflow-x: auto/);
  assert.match(css, /admin-student-management-form[\s\S]*grid-template-columns/);
  assert.match(css, /admin-student-management-form button:focus-visible/);
});
