import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();
const migration = readFileSync(
  join(root, "supabase/migrations/20260912140000_teacher_syllabus_coordinators.sql"),
  "utf8"
);
const eligibilityMigration = readFileSync(
  join(root, "supabase/migrations/20260912150000_allow_coordinators_without_classes.sql"),
  "utf8"
);
const teacherServer = readFileSync(join(root, "lib/syllabusServer.ts"), "utf8");
const adminTeacherPage = readFileSync(join(root, "app/admin/teachers/page.tsx"), "utf8");
const globalsCss = readFileSync(join(root, "app/globals.css"), "utf8");
const teacherLayout = readFileSync(join(root, "app/components/layout/TeacherLayout.tsx"), "utf8");
const sidebar = readFileSync(join(root, "app/components/layout/TeacherSidebar.tsx"), "utf8");
const teacherPage = readFileSync(join(root, "app/teacher/syllabuses/page.tsx"), "utf8");
const coordinatorRoute = readFileSync(join(root, "app/api/teacher/coordinator-levels/route.ts"), "utf8");
const adminTeacherRoute = readFileSync(join(root, "app/api/admin/teachers/[id]/route.ts"), "utf8");
const inviteTeacherRoute = readFileSync(join(root, "app/api/admin/teachers/invite/route.ts"), "utf8");
const manualTeacherRoute = readFileSync(join(root, "app/api/admin/teachers/create-manual/route.ts"), "utf8");
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
  assert.match(adminTeacherRoute, /validateSyllabusCoordinatorLevelIds/);
  assert.match(inviteTeacherRoute, /validateSyllabusCoordinatorLevelIds/);
  assert.match(manualTeacherRoute, /validateSyllabusCoordinatorLevelIds/);
  assert.match(syllabusListRoute, /canManageSyllabusLevel/);
  assert.match(addUsersPage, /Coordinator levels \(optional\)/);
  assert.match(addUsersPage, /coordinator_level_ids/);
  assert.match(addUsersPage, /new Set\(\[\.\.\.currentIds, level\.id\]\)/);
  assert.match(addUsersPage, /unavailable \(already assigned\)/);
  assert.match(addUsersPage, /teacherData\.levels\.filter/);
  assert.doesNotMatch(addUsersPage, /setCoordinatorLevels\([\s\S]*teacherData\.classes/);
});

test("Teacher navigation exposes Syllabuses only after coordinator verification", () => {
  assert.match(teacherLayout, /api\/teacher\/coordinator-levels/);
  assert.match(teacherLayout, /showSyllabuses={isSyllabusCoordinator}/);
  assert.match(teacherLayout, /usePathname/);
  assert.match(teacherLayout, /\}, \[pathname\]\)/);
  assert.match(teacherLayout, /cache: "no-store"/);
  assert.match(teacherLayout, /let active = true/);
  assert.match(teacherLayout, /setIsSyllabusCoordinator\(false\)/);
  assert.match(coordinatorRoute, /resolveAuthenticatedProfile/);
  assert.match(coordinatorRoute, /Cache-Control.*no-store/);
  assert.match(sidebar, /href="\/teacher\/syllabuses"/);
  assert.match(sidebar, /showSyllabuses/);
  assert.match(teacherPage, /SyllabusesWorkspace/);
  assert.match(teacherPage, /api\/teacher\/coordinator-levels/);
  assert.match(teacherPage, /cache: "no-store"/);
});

test("coordinator status resolves the authenticated teacher profile and confirms saves", () => {
  assert.match(teacherServer, /resolveAuthenticatedProfile/);
  assert.match(teacherServer, /select\("id, role"\)/);
  assert.match(teacherServer, /\.eq\("email", authData\.user\.email\)/);
  assert.match(teacherServer, /getTeacherCoordinatorLevelIds\(profile\.userId\)/);
  assert.match(adminTeacherPage, /Coordinator levels saved successfully\./);
  assert.match(adminTeacherPage, /coordinatorChangeRequested/);
  assert.match(adminTeacherPage, /setFeedback\(null\)/);
  assert.match(adminTeacherPage, /result\.message \|\| "Teacher information updated\."/);
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
  assert.match(eligibilityMigration, /syllabus level catalogue, not classes/i);
  assert.match(eligibilityMigration, /level_row\.name[\s\S]*intensive\|express/i);
  assert.doesNotMatch(eligibilityMigration, /from public\.classes/);
  assert.match(addUsersPage, /Only syllabus-supported levels are shown/);
  assert.match(syllabusListRoute, /manager\.access\.role === "admin"/);
  assert.match(teacherServer, /Teacher or Admin access required/);
});

test("Coordinator selectors expose selected, unavailable, and multi-level states", () => {
  assert.match(adminTeacherPage, /className="admin-teachers-coordinator-list"/);
  assert.match(adminTeacherPage, /type="checkbox"/);
  assert.match(adminTeacherPage, /coordinatorLevelIds\.includes\(level\.id\)/);
  assert.match(adminTeacherPage, /eligibleCoordinatorLevels\.map\(\(level\) =>/);
  assert.match(adminTeacherPage, /levels\.filter\([\s\S]*intensive\|express/);
  assert.doesNotMatch(adminTeacherPage, /eligibleCoordinatorLevels[\s\S]*classes\.some/);
  assert.match(globalsCss, /admin-teachers-coordinator-list[\s\S]*max-height: 220px/);
  assert.match(globalsCss, /admin-teachers-coordinator-list[\s\S]*overflow-y: auto/);
  assert.match(globalsCss, /\.admin-teachers-coordinator-option\.is-selected/);
  assert.match(adminTeacherPage, /disabled=\{unavailable\}/);
  assert.match(adminTeacherPage, /Select as many levels as needed/);
  assert.match(addUsersPage, /className="admin-add-users-coordinator-list"/);
  assert.match(addUsersPage, /type="checkbox"/);
  assert.match(addUsersPage, /disabled=\{unavailable\}/);
});

test("Coordinator-only edits participate in the Teacher save dirty state", () => {
  assert.match(adminTeacherPage, /initialCoordinatorLevelIds/);
  assert.match(adminTeacherPage, /sameNumberSet\(/);
  assert.match(adminTeacherPage, /coordinatorSelectionChanged/);
  assert.match(adminTeacherPage, /coordinatorReplacementChanged/);
  assert.match(adminTeacherPage, /disabled=\{saving \|\| !editHasChanges\}/);
  assert.match(adminTeacherPage, /coordinator_level_ids: coordinatorLevelIds/);
});
