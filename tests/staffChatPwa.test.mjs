import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const chatServer = read("lib/chatServer.ts");
const chatView = read("app/components/chat/StaffChatView.tsx");
const teacherLayout = read("app/components/layout/TeacherLayout.tsx");
const bottomNav = read("app/components/pwa/TeacherPwaBottomNav.tsx");
const migration = read("supabase/migrations/20261009120000_create_staff_chat.sql");
const styles = read("app/globals.css");
const cache = read("lib/staffChatCache.ts");
const messagesRoute = read("app/api/chat/conversations/[id]/messages/route.ts");
const recipientsRoute = read("app/api/chat/recipients/route.ts");

test("installed Teacher PWA exposes only the safe-area bottom navigation", () => {
  assert.match(teacherLayout, /display-mode: standalone/);
  assert.match(teacherLayout, /is-installed-pwa/);
  assert.match(bottomNav, /Dashboard/);
  assert.match(bottomNav, /My Classes/);
  assert.match(bottomNav, /Calendar/);
  assert.match(bottomNav, /Messages/);
  assert.match(styles, /env\(safe-area-inset-bottom\)/);
  assert.match(styles, /teacher-layout-shell\.is-installed-pwa/);
});

test("staff chat is separate from email-style Messages and supports staff-only conversations", () => {
  assert.match(chatView, /Private conversations for Teachers and Admin staff/);
  assert.match(chatView, /Search conversations/);
  assert.match(chatView, /New chat/);
  assert.match(chatView, /Group/);
  assert.match(chatView, /Manage participants/);
  assert.match(chatView, /Attach files/);
  assert.match(chatView, new RegExp("/api/chat/conversations"));
  assert.match(chatServer, /\.in\("role", \["admin", "teacher"\]\)/);
  assert.match(chatServer, /You do not have access to this conversation/);
  assert.match(chatServer, /updateChatParticipants/);
});

test("chat schema provides participant authorization, read receipts, attachments, and idempotency", () => {
  assert.match(migration, /chat_conversations/);
  assert.match(migration, /chat_participants/);
  assert.match(migration, /chat_messages/);
  assert.match(migration, /chat_message_reads/);
  assert.match(migration, /chat_attachments/);
  assert.match(migration, /unique \(conversation_id, sender_id, idempotency_key\)/);
  assert.match(migration, /enable row level security/);
  assert.match(migration, /revoke all .* from anon, authenticated/);
});

test("chat push uses generic private-safe notification payload and deep link", () => {
  assert.match(chatServer, /sendPortalPush/);
  assert.match(chatServer, /New chat message/);
  assert.match(chatServer, /conversation=/);
  assert.match(chatServer, /recipient\.role === "admin" \? "\/admin\/chat" : "\/teacher\/chat"/);
});

test("installed PWA chat uses a WhatsApp-style contact/thread surface without changing desktop markup", () => {
  assert.match(chatView, /installedPwa/);
  assert.match(chatView, /staff-chat-pwa-list/);
  assert.match(chatView, /staff-chat-pwa-contact/);
  assert.match(chatView, /staff-chat-pwa-message is-own|staff-chat-pwa-message\$\{/);
  assert.match(chatView, /staff-chat-pwa-date/);
  assert.match(chatView, /Offline · read-only/);
  assert.match(chatView, /staff-chat-pwa-composer/);
  assert.match(chatView, /staff-chat-shell/);
  assert.match(styles, /staff-chat-pwa-message\.is-own/);
  assert.match(styles, /env\(safe-area-inset-bottom\)/);
});

test("PWA chat cache is account-scoped IndexedDB and never a service-worker HTTP cache", () => {
  assert.match(cache, /indexedDB/);
  assert.match(cache, /accountId/);
  assert.match(cache, /conversationId/);
  assert.match(cache, /clearStaffChatCache/);
  assert.match(chatView, /saveCachedMessages/);
  assert.match(chatView, /saveCachedConversations/);
  assert.match(chatView, /Cache-Control|cache: "no-store"/);
});

test("chat supports contact discovery, delta sync, pagination, and profile-scoped identity", () => {
  assert.match(recipientsRoute, /get\("all"\)/);
  assert.match(chatView, /recipients\?all=1/);
  assert.match(chatView, /viewer_profile_id/);
  assert.match(messagesRoute, /after/);
  assert.match(chatView, /loadOlderMessages/);
  assert.match(chatView, /staff-chat-account/);
});
