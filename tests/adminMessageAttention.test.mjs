import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");

const messages = read("lib/messages.ts");
const adminLayout = read("app/components/layout/AdminLayout.tsx");
const adminMessagesPage = read("app/admin/messages/page.tsx");
const workQueueRoute = read("app/api/admin/messages/work-queue/route.ts");
const dealtWithMigration = read(
  "supabase/migrations/20260730130000_add_admin_message_dealt_with_status.sql"
);

test("Admin indicator counts received, outstanding messages instead of unread messages", () => {
  const start = messages.indexOf("export async function getAdminOutstandingMessageCount");
  const end = messages.indexOf("/** @deprecated", start);
  assert.ok(start >= 0 && end > start);
  const countFunction = messages.slice(start, end);

  assert.match(adminLayout, /getAdminOutstandingMessageCount/);
  assert.match(countFunction, /receiver_id\.eq\.\$\{adminId\}/);
  assert.match(countFunction, /recipient_group\.eq\.admin,receiver_id\.is\.null/);
  assert.match(countFunction, /is\("dealt_with_at", null\)/);
  assert.match(countFunction, /neq\("sender_id", adminId\)/);
  assert.doesNotMatch(countFunction, /profiles|role.*teacher|senderIds/);
  assert.doesNotMatch(countFunction, /read_at/);
  assert.match(adminLayout, /requiring attention/);
});

test("Dealt-with state is durable and separate from read state", () => {
  assert.match(dealtWithMigration, /add column dealt_with_at timestamptz null/i);
  assert.match(dealtWithMigration, /add column dealt_with_by uuid null/i);
  assert.match(dealtWithMigration, /references public\.profiles\(id\)/i);
  assert.match(dealtWithMigration, /messages_dealt_with_at_created_at_idx/i);
  assert.match(adminMessagesPage, /markSharedAdminMessageAsRead|markMessageAsRead/);
  assert.match(adminMessagesPage, /admin-unread-messages-changed/);
  assert.match(adminMessagesPage, /Status: \{selectedMessage\.dealt_with_at/);
});

test("Only an authorized Admin can mark an exact received message dealt with", () => {
  assert.match(workQueueRoute, /requireExamBankAdmin\(request\)/);
  assert.match(workQueueRoute, /function inboxScope\(userId: string\)/);
  assert.match(workQueueRoute, /\.eq\("id", messageId\)/);
  assert.match(workQueueRoute, /dealt_with_at: new Date\(\)\.toISOString\(\)/);
  assert.match(workQueueRoute, /dealt_with_by: admin\.userId/);
  assert.match(workQueueRoute, /dealt_with_at: null/);
  assert.match(adminMessagesPage, /Mark as Dealt With/);
  assert.match(adminMessagesPage, /Move Back to Active/);
});

test("Admin message status remains visible while messages stay in inbox/history", () => {
  assert.match(workQueueRoute, /active_messages: activeEnrichment\.messages/);
  assert.match(workQueueRoute, /dealt_messages: dealtEnrichment\.messages/);
  assert.match(adminMessagesPage, /setDealtMessages\(queueData\.dealt_messages \|\| \[\]\)/);
  assert.match(adminMessagesPage, /selectedMessage\.dealt_with_at \? "restore" : "dealt"/);
});
