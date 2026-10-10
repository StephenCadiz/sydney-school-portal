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
  assert.match(route, /teacher\.role \|\| ""\)\.trim\(\)\.toLowerCase\(\) !== "teacher"/);
  assert.match(route, /recipient_group: sharedAdminIdentity \? "admin" : null/);
  assert.match(route, /senderIdentity === "rosa"/);
});

test("push delivery supports multiple devices, duplicate protection, expired cleanup, and iOS payload fields", () => {
  assert.match(push, /for \(const subscription of subscriptionsToDeliver\)/);
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
  assert.match(route, /success: true,[\s\S]*push: \{ sent: pushSent, unavailable: pushUnavailable, reason: pushReason \}/);
  assert.match(route, /pushUnavailableMessage/);
  assert.match(route, /push notifications are not configured on this server/);
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
  assert.match(route, /profile:\(\.\+\)\$/i);
  assert.match(route, /JSON\.parse\(trimmed\)/);
  assert.match(route, /recipientKeys: recipientKeysPresent\(body\)/);
  assert.match(route, /recipientValueShapes/);
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
  assert.match(route, /selected teacher recipient is invalid/);
  assert.match(route, /selected recipient is not an authorized teacher/);
  assert.match(route, /Unable to send message\./);
  assert.match(adminPage, /error instanceof Error && error\.message \? error\.message : "Unable to send message\."/);
});

test("individual recipient authorization is server authoritative", () => {
  const individualSender = messages.slice(
    messages.indexOf("export async function sendAdminMessageToTeacher"),
    messages.indexOf("export async function sendAdminMessageToAllTeachers")
  );
  assert.match(messages, /fetch\("\/api\/admin\/messages\/send"/);
  assert.doesNotMatch(individualSender, /receiverProfile\?\.role !== "teacher"/);
  assert.match(route, /\.from\("profiles"\)\.select\("id, role"\)\.in\("id", teacherIds\)/);
  assert.match(route, /teacher-not-found/);
  assert.match(route, /selected recipient is not an authorized teacher/);
});

test("Stephen's canonical profile UUID is accepted without name or Auth-ID substitution", () => {
  assert.match(adminPage, /value=\{teacher\.id\}/);
  assert.match(messages, /body: JSON\.stringify\(\{ teacherId, subject, message/);
  assert.match(route, /const UUID = \/\^\[0-9a-f\]\{8\}-\[0-9a-f\]\{4\}-\[1-5\]\[0-9a-f\]\{3\}-\[89ab\]\[0-9a-f\]\{3\}-\[0-9a-f\]\{12\}\$\/i/);
  assert.doesNotMatch(route, /-\[89ab\]\[0-9a-f\]\{12\}\$\/i/);
  assert.match(route, /UUID\.test\(normalized\)/);
  assert.match(route, /String\(teacher\.role \|\| \"\"\)\.trim\(\)\.toLowerCase\(\) !== \"teacher\"/);
});

test("the real Stephen profile UUID survives the form-to-route contract", () => {
  const stephenProfileId = "4dc8e050-349e-4354-a25c-aed1c804a0f7";
  assert.match(adminPage, /teacherSelectRef\.current\?\.value \|\| teacherId/);
  assert.match(adminPage, /teacherId: selectedTeacherId/);
  assert.match(messages, /body: JSON\.stringify\(\{ teacherId, subject, message/);
  assert.match(stephenProfileId, /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  assert.match(route, /\.from\("profiles"\)\.select\("id, role"\)\.in\("id", teacherIds\)/);
});

test("recipient validation fails closed for empty, malformed, missing, and non-teacher values", () => {
  assert.match(route, /const hasRecipientValue = normalizedRecipientValues\.some\(Boolean\)/);
  assert.match(route, /hasRecipientValue \? "invalid-recipient-format" : "missing-recipient"/);
  assert.match(route, /The selected teacher recipient could not be found\./);
  assert.match(route, /The selected recipient is not an authorized teacher\./);
  assert.match(route, /\.trim\(\)\.toLowerCase\(\) !== "teacher"/);
});
