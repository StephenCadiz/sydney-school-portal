import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const route = read("app/api/student/messages/route.ts");
const page = read("app/student/messages/page.tsx");
const messages = read("lib/messages.ts");
const user = read("lib/user.ts");

test("Student sends through the mapping-aware server route", () => {
  assert.match(route, /resolveProfileIdForAuthUser\(authData\.user\.id\)/);
  assert.match(route, /profile\.role !== "student"/);
  assert.match(page, /sendStudentMessage\(/);
  assert.doesNotMatch(page, /sendMessage\(/);
});

test("Express and Intensive students may message only a current class teacher", () => {
  assert.match(route, /current_class_enrolments/);
  assert.match(route, /classes!inner\(id, teacher_id\)/);
  assert.match(route, /teacherIds\.includes\(receiverId\)/);
  assert.match(route, /TEACHER_NOT_ASSIGNED/);
  assert.match(route, /You can only message a teacher assigned to your current class/);
  assert.match(user, /getCurrentStudentTeachers/);
  assert.match(page, /student-message-recipient/);
  assert.match(page, /teachers\.length > 1/);
});

test("Subjects, attachments, and notifications use the existing message row", () => {
  assert.match(route, /subject,/);
  assert.match(route, /message,/);
  assert.match(route, /attachment_link: attachmentLink/);
  assert.match(route, /attachments,/);
  assert.match(route, /\.from\("messages"\)/);
});

test("Retries do not immediately create an exact duplicate message", () => {
  assert.match(route, /recentCutoff/);
  assert.match(route, /duplicate: true/);
  assert.match(route, /eq\("sender_id", studentId\)/);
  assert.match(route, /eq\("receiver_id", receiverId\)/);
  assert.match(page, /disabled=\{sending\}/);
});

test("The client surfaces server authorization and validation errors", () => {
  assert.match(messages, /payload\?\.error \|\| "Unable to send message\."/);
  assert.match(page, /error instanceof Error \? error\.message/);
  assert.match(route, /logFailure\("send", error\)/);
  assert.match(route, /message: error\?\.message/);
  assert.match(route, /code: error\?\.code/);
  assert.match(route, /details: error\?\.details/);
  assert.match(route, /hint: error\?\.hint/);
});
