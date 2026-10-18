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
const conversationsRoute = read("app/api/chat/conversations/route.ts");

test("installed Teacher PWA exposes only the safe-area bottom navigation", () => {
  assert.match(teacherLayout, /display-mode: standalone/);
  assert.match(teacherLayout, /is-installed-pwa/);
  assert.match(bottomNav, /Dashboard/);
  assert.match(bottomNav, /My Classes/);
  assert.match(bottomNav, /Calendar/);
  assert.match(bottomNav, /Messages/);
  assert.match(bottomNav, /Settings/);
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
  assert.match(chatServer, /chatPushPreview/);
  assert.match(chatServer, /Chat message from:/);
  assert.match(chatServer, /conversation=/);
  assert.match(chatServer, /recipient\.role === "admin" \? "\/admin\/chat" : "\/teacher\/chat"/);
});

test("chat push previews the first ten lines and notification links open the conversation", () => {
  assert.ok(chatServer.includes("split(/\\r?\\n/).slice(0, 10)"));
  assert.match(chatServer, /firstTenLines\.length > 1500/);
  assert.match(chatView, /new URLSearchParams\(window\.location\.search\)\.get\("conversation"\)/);
  assert.match(chatView, /setPwaThreadOpen\(true\)/);
  assert.match(chatView, /setSelectedId\(conversationId\)/);
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

test("desktop chat separates sent and received messages visually", () => {
  assert.match(chatView, /message\.sender_id === accountId/);
  assert.match(chatView, /staff-chat-message\$\{own \? " is-own" : ""\}/);
  assert.match(styles, /\.staff-chat-message\.is-own \{[\s\S]*align-self: flex-end[\s\S]*background: #1f5f9f/);
  assert.match(styles, /\.staff-chat-message\.is-own p \{[\s\S]*color: #ffffff/);
  assert.match(styles, /\.staff-chat-message \{[\s\S]*align-self: flex-start[\s\S]*background: #eaf4ff/);
});

test("PWA chat composer gives attachment and Send controls separate touch targets", () => {
  assert.match(styles, /staff-chat-pwa-attach \{[\s\S]*flex: 0 0 42px[\s\S]*min-width: 42px/);
  assert.match(styles, /staff-chat-pwa-composer button \{[\s\S]*flex: 0 0 48px[\s\S]*min-width: 48px[\s\S]*touch-action: manipulation/);
});

test("PWA chat composer puts attachments first and grows the message field", () => {
  assert.match(styles, /staff-chat-pwa-composer \{[\s\S]*align-items: flex-end/);
  assert.match(styles, /staff-chat-pwa-attach \{[\s\S]*order: -1/);
  assert.match(styles, /staff-chat-pwa-composer textarea \{[\s\S]*max-height: 132px[\s\S]*overflow-y: hidden/);
  assert.match(styles, /staff-chat-pwa-composer button \{[\s\S]*order: 1/);
  assert.match(chatView, /useLayoutEffect/);
  assert.match(chatView, /staff-chat-pwa-composer textarea/);
  assert.match(chatView, /Math\.min\(element\.scrollHeight, maxHeight\)/);
  assert.match(chatView, /element\.style\.overflowY = element\.scrollHeight > maxHeight \? "auto" : "hidden"/);
});

test("PWA chat resets the header when returning to the contact list", () => {
  assert.match(chatView, /staff-chat-pwa-brand-school/);
  assert.match(chatView, /staff-chat-pwa-school-mark/);
  assert.doesNotMatch(chatView, /staff-chat-pwa-school-name/);
  assert.match(chatView, /function closePwaThread\(\)/);
  assert.match(chatView, /onClick=\{closePwaThread\}/);
  assert.doesNotMatch(styles, /staff-chat-pwa-page:not\(:has\(\.staff-chat-pwa-thread\)\)/);
});

test("PWA contact-list header shows only the school icon and group creation", () => {
  assert.match(conversationsRoute, /getChatActorPresentation/);
  assert.match(conversationsRoute, /viewer/);
  assert.doesNotMatch(chatView, /function ViewerAvatar/);
  assert.doesNotMatch(chatView, /<ViewerAvatar viewer=\{viewer\} \/>/);
  const schoolBrand = chatView.indexOf("staff-chat-pwa-brand-school");
  const newChatButton = chatView.indexOf("staff-chat-pwa-new");
  assert.ok(schoolBrand >= 0 && schoolBrand < newChatButton, "header controls should stay in the requested order");
  assert.match(chatView, /className="staff-chat-pwa-school-mark" src="\/icons\/icon-192\.png"/);
  assert.match(styles, /staff-chat-pwa-header \{[\s\S]*gap: 8px/);
  assert.match(styles, /staff-chat-pwa-header \{[\s\S]*grid-template-columns: minmax\(0, 1fr\) auto/);
  assert.match(styles, /staff-chat-pwa-header \{[\s\S]*padding: 14px 9px 12px 3px/);
  assert.match(styles, /staff-chat-pwa-school-mark \{ border: 1px solid/);
  assert.match(styles, /staff-chat-pwa-new \{[\s\S]*grid-column: 2/);
  assert.match(styles, /staff-chat-pwa-new \{[\s\S]*flex: 0 0 38px/);
});

test("desktop and PWA contact lists render unread counts as compact color badges", () => {
  assert.match(chatView, /row\.conversation\.unread_count > 0 && <b>\{row\.conversation\.unread_count\}<\/b>/);
  assert.match(chatView, /conversation\.unread_count > 0 && <b>\{conversation\.unread_count\}<\/b>/);
  assert.match(styles, /staff-chat-conversation-meta b \{[\s\S]*background: #00a4dc[\s\S]*border-radius: 50%[\s\S]*height: 20px/);
  assert.match(styles, /staff-chat-pwa-contact-meta b \{[\s\S]*background: #00a4dc[\s\S]*border-radius: 50%[\s\S]*height: 20px/);
});

test("Teacher PWA chat reserves the fixed nav area and keeps contacts scrollable", () => {
  assert.match(styles, /is-installed-pwa-chat \.staff-chat-pwa-page/);
  assert.match(styles, /height: calc\(100dvh - 66px - env\(safe-area-inset-bottom\)\)/);
  assert.match(styles, /-webkit-overflow-scrolling: touch/);
  assert.match(styles, /scroll-behavior: smooth/);
  assert.match(styles, /overscroll-behavior-y: contain/);
});

test("PWA chat cache is account-scoped IndexedDB and never a service-worker HTTP cache", () => {
  assert.match(cache, /indexedDB/);
  assert.match(cache, /accountId/);
  assert.match(cache, /conversationId/);
  assert.match(cache, /getCachedContacts/);
  assert.match(cache, /saveCachedContacts/);
  assert.match(cache, /clearStaffChatCache/);
  assert.match(chatView, /saveCachedMessages/);
  assert.match(chatView, /saveCachedConversations/);
  assert.match(chatView, /getCachedContacts/);
  assert.match(chatView, /saveCachedContacts/);
  assert.match(chatView, /Cache-Control|cache: "no-store"/);
});

test("PWA chat hydrates cached content before its silent network refresh", () => {
  const cachedConversations = chatView.indexOf("getCachedConversations");
  const conversationFetch = chatView.indexOf('fetch("/api/chat/conversations"');
  const cachedMessages = chatView.indexOf("getCachedMessages");
  const messageFetch = chatView.indexOf("/messages${query}");
  assert.ok(cachedConversations >= 0 && cachedConversations < conversationFetch, "conversation cache should be read before the API");
  assert.ok(cachedMessages >= 0 && cachedMessages < messageFetch, "message cache should be read before the API");
  assert.doesNotMatch(chatView, /Loading conversations…/);
  assert.doesNotMatch(chatView, /Loading messages…/);
  assert.match(chatView, /An empty cache is a valid state/);
  assert.match(chatView, /setMessages\(cached\)/);
  assert.match(chatView, /staff-chat-account.*localStorage/);
});

test("chat supports contact discovery, delta sync, pagination, and profile-scoped identity", () => {
  assert.match(recipientsRoute, /get\("all"\)/);
  assert.match(chatView, /recipients\?all=1/);
  assert.match(chatView, /viewer_profile_id/);
  assert.match(messagesRoute, /after/);
  assert.match(chatView, /loadOlderMessages/);
  assert.match(chatView, /staff-chat-account/);
});

test("staff chat uses a teacher's primary class icon and the school icon for admins", () => {
  assert.match(chatServer, /classrooms\(id, name, logo\)/);
  assert.match(chatServer, /sortClassesByGlobalOrder/);
  assert.match(chatServer, /SCHOOL_CHAT_AVATAR/);
  assert.match(chatServer, /avatar_url/);
  assert.match(chatView, /ChatAvatar/);
  assert.match(chatView, /icons\/icon-192\.png/);
  assert.match(styles, /staff-chat-avatar img/);
});

test("Staff Chat collapses duplicate staff identities while email-style Messages remain separate", () => {
  assert.match(chatServer, /collapseStaffProfiles/);
  assert.match(chatServer, /identity_key/);
  assert.match(chatServer, /profile\.role === "teacher"/);
  assert.match(chatView, /identityIndex/);
  assert.match(chatView, /nextTarget\?\.role === "teacher"/);
});

test("Staff Chat keeps Stephen Ferreira Teacher-only and excludes the Admin duplicate", () => {
  assert.match(chatServer, /EMAIL_ONLY_ADMIN_STAFF_PROFILE_ID/);
  assert.match(chatServer, /850da38b-97df-4c67-939b-0dd9c2e8036b/);
  assert.match(chatServer, /conversation\.kind === "direct"/);
  assert.match(chatServer, /One or more selected participants are unavailable/);
});
