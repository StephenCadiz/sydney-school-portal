import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const route = read("app/api/admin/messages/send/route.ts");
const messages = read("lib/messages.ts");
const push = read("lib/pushNotificationsServer.ts");

test("Admin-to-Teacher messages dispatch one push per inserted recipient without changing in-app insertion", () => {
  assert.match(route, /from\("messages"\)\.insert\(rows\)/);
  assert.match(route, /sendPortalPush\(\[String\(row\.receiver_id\)\]/);
  assert.match(route, /eventKey: `message:\$\{row\.id\}`/);
  assert.match(messages, /fetch\("\/api\/admin\/messages\/send"/);
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
  assert.match(route, /if \(insertError\) return errorResponse/);
  assert.match(route, /return NextResponse\.json\(\{ success: true/);
  assert.match(push, /return \{ sent, skipped: true \}/);
});
