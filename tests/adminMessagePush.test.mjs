import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const route = read("app/api/admin/messages/send/route.ts");
const messages = read("lib/messages.ts");
const push = read("lib/pushNotificationsServer.ts");
const adminPage = read("app/admin/messages/page.tsx");

test("Admin-to-Teacher messages dispatch one push per inserted recipient without changing in-app insertion", () => {
  assert.match(route, /from\("messages"\)\.insert\(rows\)/);
  assert.match(route, /sendPortalPush\(\[String\(row\.receiver_id\)\]/);
  assert.match(route, /eventKey: `message:\$\{row\.id\}`/);
  assert.match(messages, /fetch\("\/api\/admin\/messages\/send"/);
  assert.match(route, /pushUnavailable/);
  assert.match(route, /Message sent; push notification unavailable\./);
});

test("Admin send route validates teacher recipients and preserves private message targeting", () => {
  assert.match(route, /teacher\.role !== "teacher"/);
  assert.match(route, /recipient_group: sharedAdminIdentity \? "admin" : null/);
  assert.match(route, /senderIdentity === "rosa"/);
});

test("push delivery supports multiple devices, duplicate protection, expired cleanup, and iOS payload fields", () => {
  assert.match(push, /for \(const subscription of subscriptions \|\| \[\]\)/);
  assert.match(push, /unique|23505/);
  assert.match(push, /statusCode === 404 \|\| error\?\.statusCode === 410/);
  assert.match(push, /icon: "\/LOGO\.png"/);
  assert.match(push, /badge: "\/LOGO\.png"/);
  assert.match(push, /url: notification\.url/);
});

test("push failure is best effort and does not replace the in-app message", () => {
  assert.match(route, /if \(insertError\) \{/);
  assert.match(route, /return NextResponse\.json\(\{ success: true/);
  assert.match(push, /return \{ sent, skipped: true, reason: "delivery_failed" \}/);
  assert.match(route, /try \{\n      const result = await sendPortalPush/);
  assert.match(push, /stage: "subscription-lookup"/);
  assert.match(push, /stage: "provider-delivery"/);
  assert.doesNotMatch(route, /insertError\.message/);
});

test("missing push configuration or push storage cannot block an inserted Admin message", () => {
  assert.match(push, /reason: "vapid_not_configured"/);
  assert.match(push, /reason: "subscription_store_unavailable"/);
  assert.match(route, /success: true,[\s\S]*push: \{ sent: pushSent, unavailable: pushUnavailable \}/);
});

test("recent exact sends are idempotent for individual and broadcast recipients", () => {
  assert.match(route, /recentCutoff/);
  assert.match(route, /\.eq\("sender_id", admin\.userId\)/);
  assert.match(route, /alreadySentTo/);
  assert.match(route, /duplicate: true/);
});

test("recipient parsing accepts the deployed client field and safe legacy aliases", () => {
  assert.match(route, /\["teacherIds", "teacherId", "teacher_id", "recipientId", "recipient_id"\]/);
  assert.match(route, /record\.id \|\| record\.profileId \|\| record\.teacherId/);
  assert.match(route, /correlationId/);
});

test("individual teacher submission uses the live profile UUID from the selected option", () => {
  assert.match(adminPage, /ref=\{teacherSelectRef\}/);
  assert.match(adminPage, /teacherSelectRef\.current\?\.value \|\| teacherId/);
  assert.match(adminPage, /teacherId: selectedTeacherId/);
  assert.match(adminPage, /value=\{teacher\.id\}/);
  assert.match(messages, /body: JSON\.stringify\(\{ teacherId, subject, message/);
});

test("switching away from individual mode clears the teacher selection", () => {
  assert.match(adminPage, /if \(nextMode !== "individual"\) setTeacherId\(""\)/);
});

test("validation errors remain specific while database and push failures stay generic", () => {
  assert.match(route, /Please select a teacher recipient\./);
  assert.match(route, /Unable to send message\./);
  assert.match(adminPage, /error instanceof Error && error\.message \? error\.message : "Unable to send message\."/);
});
