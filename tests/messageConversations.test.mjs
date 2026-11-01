import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");

const migration = read("supabase/migrations/20261101120000_add_message_conversations.sql");
const threadServer = read("lib/messageThreadsServer.ts");
const threadRoute = read("app/api/messages/thread/route.ts");
const messages = read("lib/messages.ts");
const teacherReply = read("app/api/teacher/messages/reply/route.ts");
const adminReply = read("app/api/admin/messages/reply/route.ts");
const studentMessages = read("app/api/student/messages/route.ts");
const teacherPage = read("app/teacher/messages/page.tsx");
const adminPage = read("app/admin/messages/page.tsx");
const studentPage = read("app/student/messages/page.tsx");
const teacherStudentMessages = read("app/teacher/messages/TeacherStudentMessagesInbox.tsx");
const teacherStudentMessagesApi = read("app/api/teacher/student-messages/route.ts");

test("email-style messages persist a conversation id and replies stay in the same thread", () => {
  assert.match(migration, /add column if not exists conversation_id uuid/i);
  assert.match(migration, /set conversation_id = id/i);
  assert.match(migration, /alter column conversation_id set default gen_random_uuid/i);
  assert.match(migration, /messages_conversation_created_at_idx/i);
  assert.match(teacherReply, /sourceMessage\.conversation_id/);
  assert.match(adminReply, /sourceMessage\.conversation_id/);
  assert.match(studentMessages, /reply_to_message_id/);
  assert.match(studentMessages, /sourceMessage\.conversation_id\s*\|\|\s*sourceMessage\.id/);
  assert.match(studentMessages, /hasConversationColumn/);
  assert.match(studentMessages, /conversationId = hasConversationColumn/);
  assert.match(teacherStudentMessagesApi, /hasConversationColumn/);
  assert.match(teacherStudentMessagesApi, /conversationId = hasConversationColumn/);
});

test("thread history is authenticated and participant-scoped", () => {
  assert.match(threadRoute, /authenticateMessageThreadActor/);
  assert.match(threadServer, /canReadSource/);
  assert.match(threadServer, /Message access required/);
  assert.match(threadServer, /conversation_id/);
  assert.match(threadServer, /sender_id === actor\.id \|\| message\.receiver_id === actor\.id/);
  assert.match(threadServer, /Full message history|messages: visibleMessages/);
});

test("all mailboxes show reply author/date indicators and full history", () => {
  for (const page of [teacherPage, adminPage, studentPage]) {
    assert.match(page, /reply_count/);
    assert.match(page, /last_reply_name/);
    assert.match(page, /last_reply_at/);
    assert.match(page, /getMessageThread/);
    assert.match(page, /Full message history/);
  }
  assert.match(adminPage, /Inbox \(\$\{messageCounts\.active\}\)/);
  assert.match(teacherPage, /const tabs = \["Inbox", "Sent"\]/);
  assert.match(studentPage, /tab === "inbox"/);
  assert.match(teacherStudentMessages, /Student message folders/);
  assert.match(teacherStudentMessages, /activeFolder === "Inbox"/);
  assert.match(teacherStudentMessages, /activeFolder === "Sent"/);
  assert.match(teacherStudentMessages, /Full student message history/);
  assert.match(teacherStudentMessagesApi, /inbox: safeInbox/);
  assert.match(teacherStudentMessagesApi, /sent: safeSent/);
  assert.match(teacherStudentMessagesApi, /reply_to_message_id/);
  assert.match(teacherStudentMessagesApi, /const MESSAGE_COLUMNS = "\*"/);
  assert.match(threadServer, /isConversationColumnMissing/);
});

test("all mailbox lists show a green Replied badge when the original has a reply", () => {
  for (const page of [teacherPage, adminPage, studentPage, teacherStudentMessages]) {
    assert.match(page, /message-replied-badge/);
    assert.match(page, /aria-label="Replied"/);
  }
  assert.match(read("app/globals.css"), /\.message-replied-badge[\s\S]*background:\s*#dcfce7/);
  assert.match(read("app/globals.css"), /\.message-replied-badge[\s\S]*color:\s*#166534/);
  assert.match(messages, /reply_to_message_id/);
  assert.match(messages, /hasReversedParticipants/);
  assert.match(messages, /candidateSubject/);
});
