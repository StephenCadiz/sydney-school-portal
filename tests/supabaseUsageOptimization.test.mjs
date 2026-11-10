import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const migration = read("supabase/migrations/20261109120000_optimize_portal_read_indexes.sql");
const chatReadMigration = read("supabase/migrations/20261110100000_reduce_chat_request_fanout.sql");
const chatServer = read("lib/chatServer.ts");
const cache = read("lib/pwaDataCache.ts");
const messages = read("lib/messages.ts");
const studentNotifications = read("lib/studentNotifications.ts");
const unreadHook = read("app/components/pwa/usePwaUnreadCounts.ts");
const refreshHook = read("app/hooks/useMessageRealtimeRefresh.ts");

test("read-path indexes cover mailbox, unread, chat, and announcement lookups", () => {
  for (const indexName of [
    "messages_recipient_unread_idx",
    "messages_sender_mailbox_idx",
    "messages_admin_receiver_dealt_idx",
    "messages_admin_group_dealt_idx",
    "chat_participants_active_profile_idx",
    "chat_messages_conversation_sender_idx",
    "chat_message_reads_message_reader_idx",
    "announcement_reads_user_announcement_idx",
  ]) {
    assert.match(migration, new RegExp(indexName));
  }
  assert.match(migration, /where recipient_group is null[\s\S]*read_at is null/);
});

test("chat list and unread counts do not load unbounded message history", () => {
  assert.match(chatServer, /rpc\("chat_latest_messages"/);
  assert.match(chatServer, /rpc\("chat_unread_counts"/);
  assert.match(chatServer, /select\("id, conversation_id, sender_id, body, created_at"\)[\s\S]*\.limit\(1\)/);
  assert.match(chatServer, /select\("id", \{ count: "exact", head: true \}\)/);
  assert.doesNotMatch(chatServer, /\.in\("conversation_id", ids\)[\s\S]*\.order\("created_at", \{ ascending: false \}\);/);
  assert.match(chatReadMigration, /chat_latest_messages/);
  assert.match(chatReadMigration, /chat_unread_counts/);
});

test("mailbox and dashboard unread reads use narrow projections", () => {
  assert.match(messages, /const MESSAGE_COLUMNS =/);
  assert.doesNotMatch(messages, /from\("messages"\)[\s\S]{0,120}\.select\("\*"\)/);
  assert.match(studentNotifications, /from\("messages"\)[\s\S]{0,80}\.select\("id"\)/);
});

test("PWA and realtime refreshes avoid hidden-tab polling and repeated cache revalidation", () => {
  assert.match(cache, /REVALIDATE_AFTER_MS/);
  assert.match(cache, /document\.visibilityState !== "hidden"/);
  assert.match(unreadHook, /setInterval\(\(\) => void refresh\(\), 180000\)/);
  assert.match(unreadHook, /refreshInFlight/);
  assert.match(refreshHook, /document\.visibilityState !== "hidden"/);
});
