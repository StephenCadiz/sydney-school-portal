import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const bulkPage = read("app/admin/add-users/page.tsx");
const bulkRoute = read("app/api/admin/students/create-bulk/route.ts");
const accessServer = read("lib/cambridgeStudentAccessServer.ts");
const adminRoute = read("app/api/admin/students/[id]/access-control/route.ts");
const teacherRoute = read("app/api/teacher/classes/[id]/student-access/route.ts");
const teacherPanel = read("app/teacher/class/StudentWorkspacePanel.tsx");
const adminInfo = read("app/admin/student-information/page.tsx");
const accessUi = read("app/components/student/StudentAccessControl.tsx");
const passwordRoute = read("app/api/admin/accounts/[id]/set-password/route.ts");
const migration = read("supabase/migrations/20260916120000_cambridge_student_access_control.sql");

test("Cambridge creation allows roster-only students and keeps Young Learners unchanged", () => {
  assert.match(bulkPage, /Email is optional/);
  assert.match(bulkPage, /Roster-only - add an email later/);
  assert.match(bulkRoute, /method: "invitation" \| "manual" \| "none"/);
  assert.match(bulkRoute, /student\.method === "none"/);
  assert.match(bulkRoute, /randomUUID\(\)/);
  assert.match(bulkRoute, /Email is required when creating an account with a password/);
});

test("Access Control is available only for Cambridge students in Admin and assigned Teacher workspaces", () => {
  assert.match(adminInfo, /Access Control/);
  assert.match(adminInfo, /isCambridge && activeSection === "access-control"/);
  assert.match(teacherPanel, /studentType !== "cambridge"/);
  assert.match(teacherPanel, /id: "access-control", label: "Access Control"/);
  assert.match(teacherPanel, /teacherMode/);
  assert.match(teacherRoute, /authorizeCambridgeAccess\(actor, studentId, id\)/);
  assert.match(accessServer, /classroom\.teacher_id !== actor\.id/);
});

test("Teacher Access Control GET carries the profile identifier from the workspace card", () => {
  assert.match(accessUi, /student_id=\$\{encodeURIComponent\(studentId\)\}/);
  assert.match(teacherRoute, /searchParams\.get\("student_id"\)/);
  assert.match(accessServer, /resolveStudentAuthUser\(profile\)/);
});

test("Email save is separate from explicit invitation and never exposes passwords", () => {
  assert.match(accessUi, /Save email/);
  assert.match(accessUi, /Send invitation/);
  assert.match(accessUi, /Resend invitation/);
  assert.match(adminRoute, /action === "save-email"/);
  assert.match(adminRoute, /action === "send-invitation" \|\| action === "resend-invitation"/);
  assert.match(accessServer, /updateUserById/);
  assert.match(accessServer, /inviteUserByEmail/);
  assert.match(accessServer, /options\.resend/);
  assert.match(accessUi, /Invitation sent again successfully/);
  assert.match(accessUi, /busyRef\.current/);
  const saveSection = accessServer.split("export async function saveStudentEmail")[1]?.split("export async function sendStudentInvitation")[0] || "";
  assert.doesNotMatch(saveSection, /inviteUserByEmail/);
  assert.doesNotMatch(accessUi, /password/i);
});

test("Auth links are durable and protected by restrictive RLS", () => {
  assert.match(migration, /create table if not exists public\.student_portal_accounts/);
  assert.match(migration, /profile_id uuid primary key references public\.profiles/);
  assert.match(migration, /auth_user_id uuid not null unique references auth\.users/);
  assert.match(migration, /enable row level security/);
  assert.match(migration, /revoke all on public\.student_portal_accounts from public, anon, authenticated/);
  assert.match(migration, /auth\.uid\(\) = auth_user_id/);
  assert.match(migration, /actor\.role = 'admin'/);
  assert.match(migration, /actor\.role = 'teacher'/);
});

test("Access API responses are uncached and reject unauthorized/Young Learner access", () => {
  assert.match(adminRoute, /Cache-Control.*no-store/);
  assert.match(teacherRoute, /Cache-Control.*no-store/);
  assert.match(accessServer, /student\.role !== "student"/);
  assert.match(accessServer, /Cambridge student access is not available/);
  assert.match(accessUi, /cache: "no-store"/);
});

test("Admin password activation links roster-only Cambridge profiles safely", () => {
  assert.match(passwordRoute, /resolveStudentAuthUser\(targetProfile\)/);
  assert.match(passwordRoute, /auth\.admin\.createUser/);
  assert.match(passwordRoute, /student_portal_accounts/);
  assert.match(passwordRoute, /deleteUser\(created\.user\.id\)/);
  assert.match(passwordRoute, /updateUserById\(targetAuthUser\.id, \{ password \}\)/);
  assert.match(passwordRoute, /Add a login email before activating/);
  assert.match(passwordRoute, /targetRole !== "student"/);
});
