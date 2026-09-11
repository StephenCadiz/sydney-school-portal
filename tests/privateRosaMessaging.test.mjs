import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");
const messages = read("lib/messages.ts");
const teacherPage = read("app/teacher/messages/page.tsx");
const adminSentRoute = read("app/api/admin/messages/sent/route.ts");
const migration = read(
  "supabase/migrations/20260911150000_private_rosa_staff_messages.sql"
);
const hardeningMigration = read(
  "supabase/migrations/20260911160000_harden_private_rosa_message_visibility.sql"
);
const identityMigration = read(
  "supabase/migrations/20260911170000_resolve_current_rosa_admin.sql"
);

test("teacher recipients resolve the current Rosa Admin profile and direct sends target her", () => {
  assert.match(messages, /ROSA_RECIPIENT_NAME\s*=\s*"Rosa Vara"/);
  assert.match(messages, /isRosaProfile\(profile\)/);
  assert.match(messages, /is_rosa: true/);
  assert.match(messages, /type: "direct_staff"/);
  assert.match(messages, /!isRosaProfile\(receiverProfile\)/);
  assert.match(messages, /select\("id, role, first_name, last_name"\)/);
  assert.match(messages, /payload\.receiver_id = recipient\.staffId/);
  assert.match(messages, /payload\.recipient_group = null/);
});

test("Rosa replies remain direct while shared Admin replies remain shared", () => {
  assert.match(teacherPage, /selectedMessage\.recipient_group === "admin"/);
  assert.match(teacherPage, /type: "direct_staff", staffId: selectedMessage\.sender_id/);
  assert.match(teacherPage, /type: "admin_group"/);
});

test("direct messages are participant-readable and non-participants are excluded by RLS", () => {
  assert.match(migration, /auth\.uid\(\) in \(sender_id, receiver_id\)/i);
  assert.match(migration, /recipient_group is null/i);
  assert.match(migration, /role in \('admin', 'teacher'\)/i);
  assert.match(hardeningMigration, /drop policy if exists messages_select_allowed/i);
  assert.match(hardeningMigration, /app_private\.is_admin\(\)\s+and\s+recipient_group = 'admin'/i);
  assert.match(hardeningMigration, /sender_id = auth\.uid\(\)/i);
  assert.match(hardeningMigration, /receiver_id = auth\.uid\(\)/i);
  assert.doesNotMatch(hardeningMigration, /using \(\s*app_private\.is_admin\(\)\s*\)/i);
});

test("teacher-to-Rosa and Rosa-to-teacher inserts are RLS-scoped", () => {
  assert.match(migration, /Teachers can send private Rosa staff messages/);
  assert.match(migration, /receiver_id = '7f4d3e64-94a7-47f0-b069-ed0e77b29369'::uuid/);
  assert.match(migration, /Rosa can send private staff replies/);
  assert.match(migration, /sender_id = '7f4d3e64-94a7-47f0-b069-ed0e77b29369'::uuid/);
  assert.match(identityMigration, /role = 'admin'/i);
  assert.match(identityMigration, /lower\(trim\(receiver_profile\.first_name\)\) like 'rosa%'/i);
  assert.match(identityMigration, /lower\(trim\(receiver_profile\.last_name\)\) = 'vara'/i);
  assert.match(identityMigration, /lower\(trim\(sender_profile\.first_name\)\) like 'rosa%'/i);
  assert.match(identityMigration, /lower\(trim\(sender_profile\.last_name\)\) = 'vara'/i);
});

test("Rosa private messages are hidden from other Admin sent views", () => {
  assert.match(adminSentRoute, /message\.recipient_group === "admin"/);
  assert.match(adminSentRoute, /message\.sender_id === admin\.userId/);
  assert.match(adminSentRoute, /const visibleMessages = \(messages \|\| \[\]\)\.filter/);
});

test("shared Admin messages remain visible through the shared inbox scope", () => {
  const workQueue = read("app/api/admin/messages/work-queue/route.ts");
  assert.match(workQueue, /receiver_id\.eq\.\$\{userId\},recipient_group\.eq\.admin/);
});

test("Rosa is identified by name in teacher message rows and details", () => {
  assert.match(teacherPage, /messageDirectionLabel/);
  assert.match(teacherPage, /\$\{type === "inbox" \? "From" : "To"\} \$\{getMessageName/);
  assert.match(teacherPage, /<p className="teacher-messages-detail-eyebrow">\{messageDirectionLabel/);
  assert.match(messages, /canonicalName[\s\S]*Rosa Vara/);
});

test("read marking uses the participant-scoped RPC", () => {
  assert.match(messages, /mark_direct_staff_message_as_read/);
  assert.match(migration, /security definer/i);
  assert.match(migration, /set search_path = public, pg_temp/i);
  assert.match(migration, /grant execute on function public\.mark_direct_staff_message_as_read\(uuid\) to authenticated/i);
  assert.match(hardeningMigration, /revoke all on function public\.mark_direct_staff_message_as_read\(uuid\) from anon/i);
  assert.match(hardeningMigration, /grant execute on function public\.mark_direct_staff_message_as_read\(uuid\) to service_role/i);
});
