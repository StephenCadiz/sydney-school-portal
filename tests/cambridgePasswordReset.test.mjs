import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const route = read("app/api/admin/accounts/[id]/set-password/route.ts");
const accessServer = read("lib/cambridgeStudentAccessServer.ts");
const accessUi = read("app/components/student/StudentAccessControl.tsx");

test("Student password reset targets the mapped Auth account and confirms it", () => {
  assert.match(route, /resolveStudentAuthUser\(targetProfile\)/);
  assert.match(route, /ensureStudentPortalAccountMapping\(/);
  assert.match(route, /updateUserById\(\s*targetAuthUser\.id/);
  assert.match(route, /password, email_confirm: true/);
  assert.match(route, /targetRole === "student"/);
});

test("Missing accounts can be created once, while existing accounts are never duplicated", () => {
  assert.match(route, /if \(!targetAuthUser\)/);
  assert.match(route, /auth\.admin\.createUser/);
  assert.match(route, /student_portal_accounts/);
  assert.match(accessServer, /ensureStudentPortalAccountMapping/);
});

test("Ambiguous exact-email Auth matches fail closed", () => {
  assert.match(accessServer, /const matches = .*filter/);
  assert.match(accessServer, /matches\.length > 1/);
  assert.match(accessServer, /Multiple portal accounts match this student email/);
});

test("Access Control reports confirmed Auth accounts as active", () => {
  assert.match(accessServer, /const authConfirmed = Boolean\(authUser\?\.email_confirmed_at\)/);
  assert.match(accessServer, /portal_access_active: Boolean\(authUser && authConfirmed\)/);
  assert.match(accessUi, /Student Portal access active/);
  assert.match(accessUi, /No active Student Portal access/);
});
