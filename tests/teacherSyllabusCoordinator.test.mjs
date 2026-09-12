import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();
const migration = readFileSync(
  join(root, "supabase/migrations/20260912140000_teacher_syllabus_coordinators.sql"),
  "utf8"
);
const teacherServer = readFileSync(join(root, "lib/syllabusServer.ts"), "utf8");
const teacherLayout = readFileSync(join(root, "app/components/layout/TeacherLayout.tsx"), "utf8");
const sidebar = readFileSync(join(root, "app/components/layout/TeacherSidebar.tsx"), "utf8");
const teacherPage = readFileSync(join(root, "app/teacher/syllabuses/page.tsx"), "utf8");
const adminTeacherRoute = readFileSync(join(root, "app/api/admin/teachers/[id]/route.ts"), "utf8");
const addUsersPage = readFileSync(join(root, "app/admin/add-users/page.tsx"), "utf8");
const syllabusListRoute = readFileSync(join(root, "app/api/admin/syllabuses/route.ts"), "utf8");
const detailRoute = readFileSync(join(root, "app/api/admin/syllabuses/[id]/route.ts"), "utf8");

test("coordinator assignment is unique, historical, Admin-only, and transactional", () => {
  assert.match(migration, /create table public\.syllabus_coordinators/i);
  assert.match(migration, /unique index syllabus_coordinators_one_active_level/i);
  assert.match(migration, /where revoked_at is null/i);
  assert.match(migration, /set_teacher_syllabus_coordinators/i);
  assert.match(migration, /Only Admin users can assign syllabus coordinators/i);
  assert.match(migration, /p_replace_existing boolean/i);
  assert.match(migration, /for update/i);
  assert.match(migration, /Replaced by an Admin/i);
  assert.match(migration, /revoke all on function public\.set_teacher_syllabus_coordinators/i);
});

test("Admin teacher editing persists coordinator levels and explicit replacement", () => {
  assert.match(adminTeacherRoute, /coordinator_level_ids/);
  assert.match(adminTeacherRoute, /replace_coordinators/);
  assert.match(adminTeacherRoute, /set_teacher_syllabus_coordinators/);
  assert.match(adminTeacherRoute, /eligible Regular or Online classes/);
  assert.match(syllabusListRoute, /canManageSyllabusLevel/);
  assert.match(addUsersPage, /Syllabus coordinator levels/);
  assert.match(addUsersPage, /coordinator_level_ids/);
});

test("Teacher navigation exposes Syllabuses only after coordinator verification", () => {
  assert.match(teacherLayout, /api\/teacher\/coordinator-levels/);
  assert.match(teacherLayout, /showSyllabuses={isSyllabusCoordinator}/);
  assert.match(sidebar, /href="\/teacher\/syllabuses"/);
  assert.match(sidebar, /showSyllabuses/);
  assert.match(teacherPage, /SyllabusesWorkspace/);
});

test("Syllabus APIs scope every coordinator operation to assigned levels", () => {
  assert.match(teacherServer, /getTeacherCoordinatorLevelIds/);
  assert.match(teacherServer, /requireSyllabusManagerForSyllabus/);
  assert.match(teacherServer, /coordinatorLevelIds/);
  assert.match(syllabusListRoute, /You can only create syllabuses for your coordinator levels/);
  assert.match(detailRoute, /requireSyllabusManagerForSyllabus/);
  assert.match(detailRoute, /manager\.access\.role === "teacher"/);
});

test("Syllabus assignment excludes ineligible course types and keeps Admin access", () => {
  assert.match(migration, /course_type[\s\S]*in \('regular', 'online'\)/i);
  assert.match(addUsersPage, /Only levels with Regular or Online classes can be coordinated/);
  assert.match(syllabusListRoute, /manager\.access\.role === "admin"/);
  assert.match(teacherServer, /Teacher or Admin access required/);
});
