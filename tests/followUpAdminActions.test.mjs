import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) =>
  fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const migration = read(
  "supabase/migrations/20261028130000_add_admin_follow_up_actions.sql"
);
const adminRoute = read("app/api/admin/follow-ups/[id]/actions/route.ts");
const noticesRoute = read("app/api/teacher/follow-up-action-notices/route.ts");
const openRoute = read(
  "app/api/teacher/follow-up-action-notices/[id]/open/route.ts"
);
const adminPage = read("app/admin/follow-ups/page.tsx");
const teacherPage = read("app/teacher/page.tsx");
const followUps = read("lib/followUps.ts");
const followUpsTab = read("app/teacher/class/FollowUpsTab.tsx");

test("follow-up schema tracks Admin actions and teacher acknowledgement", () => {
  assert.match(migration, /author_role text not null default 'teacher'/);
  assert.match(migration, /last_admin_action_at timestamptz/);
  assert.match(migration, /teacher_action_seen_at timestamptz/);
  assert.match(migration, /author_role in \('teacher', 'admin'\)/);
});

test("only Admin can add a dated action entry", () => {
  assert.match(adminRoute, /actor\.role !== "admin"/);
  assert.match(adminRoute, /author_role: "admin"/);
  assert.match(adminRoute, /follow_up_entries/);
  assert.match(adminRoute, /last_admin_action_at: now/);
  assert.match(adminRoute, /teacher_action_seen_at: null/);
});

test("teacher notices are scoped to the responsible teacher and open state", () => {
  assert.match(noticesRoute, /actor\.role !== "teacher"/);
  assert.match(noticesRoute, /\.eq\("teacher_id", actor\.profileId\)/);
  assert.match(noticesRoute, /last_admin_action_at/);
  assert.match(noticesRoute, /teacher_action_seen_at/);
  assert.match(openRoute, /\.eq\("teacher_id", actor\.profileId\)/);
  assert.match(openRoute, /teacher_action_seen_at: document\.last_admin_action_at/);
});

test("Admin UI adds actions and the teacher dashboard links directly to the follow-up", () => {
  assert.match(adminPage, /Add Action Taken/);
  assert.match(adminPage, /Save Action/);
  assert.match(adminPage, /addAdminFollowUpAction/);
  assert.match(teacherPage, /TeacherFollowUpActionReminderCard/);
  assert.match(followUps, /\/api\/admin\/follow-ups/);
  assert.match(followUpsTab, /initialFollowUpId/);
  assert.match(followUpsTab, /markFollowUpActionOpened/);
});
