import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");
const page = read("app/teacher/messages/page.tsx");
const messages = read("lib/messages.ts");
const route = read("app/api/teacher/messages/reply/route.ts");

function between(source, start, end) {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert.notEqual(startIndex, -1, `missing ${start}`);
  assert.notEqual(endIndex, -1, `missing ${end}`);
  return source.slice(startIndex, endIndex);
}

test("reply uses the opened message id and cannot reuse a stale new-message recipient", () => {
  const reply = between(page, "async function handleReply()", "async function handleDeleteFromInbox");

  assert.match(reply, /sendTeacherStaffReply\(/);
  assert.match(reply, /messageId:\s*String\(selectedMessage\.id\)/);
  assert.doesNotMatch(reply, /receiverId/);
  assert.doesNotMatch(reply, /direct_staff/);
  assert.match(reply, /subject:\s*getReplySubject\(selectedMessage\.subject\)/);
  assert.match(reply, /attachments:\s*uploadedAttachments/);
});

test("reply endpoint resolves the recipient from the original sender and enforces teacher access", () => {
  assert.match(route, /authenticateTeacherMessageRequest/);
  assert.match(route, /sourceMessage\.receiver_id !== auth\.teacherId/);
  assert.match(route, /sourceMessage\.sender_id/);
  assert.match(route, /senderProfile\?\.role !== "admin"/);
  assert.match(route, /senderProfile\?\.role !== "teacher"/);
  assert.match(route, /receiver_id:\s*sourceMessage\.sender_id/);
  assert.match(route, /recipient_group:\s*null/);
  assert.doesNotMatch(route, /body\?\.receiverId/);
});

test("manual new-message Rosa restriction remains unchanged", () => {
  assert.match(messages, /type: "direct_staff"/);
  assert.match(messages, /!isRosaProfile\(receiverProfile\)/);
  assert.match(messages, /Please select Rosa Vara as the direct recipient/);
});

test("reply attachments and subject metadata are forwarded", () => {
  assert.match(messages, /messageId,\s*subject,\s*message,\s*attachment_link,\s*attachments/);
  assert.match(messages, /body: JSON\.stringify\(\{[\s\S]*messageId[\s\S]*subject[\s\S]*attachments/);
  assert.match(route, /attachment_link/);
  assert.match(route, /attachments/);
});
