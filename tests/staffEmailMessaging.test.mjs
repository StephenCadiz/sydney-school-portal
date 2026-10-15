import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const teacherRoute = read("app/api/teacher/messages/staff/route.ts");
const teacherMessages = read("lib/messages.ts");
const teacherPage = read("app/teacher/messages/page.tsx");
const adminReplyRoute = read("app/api/admin/messages/reply/route.ts");
const adminReadRoute = read("app/api/admin/messages/read/route.ts");
const adminMessages = read("app/admin/messages/page.tsx");
const adminSendRoute = read("app/api/admin/messages/send/route.ts");

test("Teacher email-style staff messages use an authenticated server boundary", () => {
  assert.match(teacherRoute, /authenticateTeacherMessageRequest/);
  assert.match(teacherRoute, /supabaseAdmin[\s\S]*\.insert\(/);
  assert.match(teacherRoute, /export async function GET/);
  assert.match(teacherRoute, /export async function POST/);
  assert.match(teacherRoute, /export async function PATCH/);
  assert.match(teacherMessages, /fetch\("\/api\/teacher\/messages\/staff"/);
  assert.doesNotMatch(teacherMessages.slice(teacherMessages.indexOf("export async function sendTeacherStaffMessage"), teacherMessages.indexOf("export async function sendTeacherStaffReply")), /supabase\.from\("messages"\)\.insert/);
});

test("Teachers can address the shared Admin mailbox, any Admin staff member, or another Teacher", () => {
  assert.match(teacherRoute, /recipient\.type === "admin_group"/);
  assert.match(teacherRoute, /const expectedRole = recipient\.type === "teacher" \? "teacher" : "admin"/);
  assert.match(teacherRoute, /recipient_group: recipientGroup/);
  assert.match(teacherPage, /type: "direct_staff", staffId: receiverId/);
  assert.match(teacherPage, /\$\{getProfileName\(admin\)\} \(ADMIN\)/);
});

test("Admin replies use the server route instead of a browser RLS insert", () => {
  assert.match(adminReplyRoute, /requireExamBankAdmin/);
  assert.match(adminReplyRoute, /supabaseAdmin[\s\S]*\.insert\(/);
  assert.match(adminReplyRoute, /sourceMessage\.receiver_id === admin\.userId/);
  assert.match(adminReplyRoute, /recipient_group === "admin"/);
  assert.match(teacherMessages, /fetch\("\/api\/admin\/messages\/reply"/);
  assert.match(adminMessages, /sendAdminStaffReply/);
  assert.doesNotMatch(adminMessages, /await sendMessage\(\{[\s\S]*selectedMessage\.sender_id/);
});

test("Admin mail read status uses the same authenticated server boundary", () => {
  assert.match(adminReadRoute, /requireExamBankAdmin/);
  assert.match(adminReadRoute, /export async function PATCH/);
  assert.match(adminReadRoute, /source\.receiver_id === admin\.userId/);
  assert.match(adminReadRoute, /recipient_group === "admin"/);
  assert.match(adminReadRoute, /supabaseAdmin[\s\S]*\.update\(/);
  assert.match(teacherMessages, /fetch\("\/api\/admin\/messages\/read"/);
});

test("Admin-to-Teacher sends remain available for the Admin identity", () => {
  assert.match(adminSendRoute, /requireExamBankAdmin/);
  assert.match(adminSendRoute, /sender_id: admin\.userId/);
  assert.match(adminSendRoute, /receiver_id: teacherId/);
  assert.match(adminSendRoute, /teacher\.role/);
});

test("The two Stephen identities remain separate in email Messages", () => {
  const teacherId = "4dc8e050-349e-4354-a25c-aed1c804a0f7";
  const adminId = "850da38b-97df-4c67-939b-0dd9c2e8036b";
  assert.notEqual(teacherId, adminId);
  assert.match(teacherRoute, /\.in\("role", \["admin", "teacher"\]\)/);
  assert.match(adminSendRoute, /sender\?\.role !== "admin"/);
});
