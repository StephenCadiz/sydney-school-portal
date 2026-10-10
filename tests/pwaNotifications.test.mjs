import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const manifest = read("app/manifest.ts");
const worker = read("public/sw.js");
const client = read("app/components/pwa/PwaInstallAndNotifications.tsx");
const server = read("lib/pushNotificationsServer.ts");
const subscriptionRoute = read("app/api/push/subscription/route.ts");
const migration = read("supabase/migrations/20261008150000_add_portal_push_subscriptions.sql");
const adminMigration = read("supabase/migrations/20261010120000_allow_admin_push_subscriptions.sql");
const studentPushQueueMigration = read("supabase/migrations/20261010130000_queue_student_push_notifications.sql");
const studentPushQueueRoute = read("app/api/cron/student-push-queue/route.ts");
const vercelConfig = read("vercel.json");

test("Teacher and Student manifest is standalone with Sydney branding and install icons", () => {
  assert.match(manifest, /short_name: "Sydney School"/);
  assert.match(manifest, /display: "standalone"/);
  assert.match(manifest, /scope: "\/"/);
  assert.match(manifest, /LOGO\.png/);
  assert.match(manifest, /theme_color/);
});

test("service worker has network-only fetch behavior and never caches private API data", () => {
  assert.match(worker, /event\.respondWith\(fetch\(request\)\)/);
  assert.doesNotMatch(worker, /caches\.open|cache\.put|cacheFirst|staleWhileRevalidate/);
  assert.match(worker, /push/);
  assert.match(worker, /event\.data\.text\(\)/);
  assert.match(worker, /notificationclick/);
});

test("install and push controls are opt-in and do not repeatedly show dismissed prompts", () => {
  assert.match(client, /window\.location\.pathname === "\/teacher"/);
  assert.match(client, /window\.location\.pathname === "\/student"/);
  assert.match(client, /window\.location\.pathname === "\/admin"/);
  assert.match(client, /beforeinstallprompt/);
  assert.match(client, /sydney-school-pwa-install-dismissed/);
  assert.match(client, /Notification\.requestPermission\(\)/);
  assert.match(client, /userVisibleOnly: true/);
  assert.match(client, /Enable notifications/);
  assert.match(client, /pushManager\.getSubscription\(\)/);
  assert.match(client, /subscriptionMatchesKey/);
  assert.match(client, /subscription\.unsubscribe\(\)/);
  assert.match(client, /registration\.update\(\)/);
  assert.match(client, /could not register for push notifications/);
});

test("subscriptions are authenticated, role-scoped, removable, and deduplicated", () => {
  assert.match(subscriptionRoute, /authenticatePortalActor/);
  assert.match(subscriptionRoute, /savePushSubscription/);
  assert.match(subscriptionRoute, /removePushSubscription/);
  assert.match(server, /onConflict: "user_id,endpoint"/);
  assert.match(migration, /unique \(user_id, endpoint\)/);
  assert.match(migration, /revoke all .* from anon, authenticated/);
  assert.match(server, /PortalRole = "teacher" \| "student" \| "admin"/);
  assert.match(adminMigration, /role in \('teacher', 'student', 'admin'\)/);
});

test("server push delivery is idempotent and removes expired subscriptions", () => {
  assert.match(server, /push_notification_deliveries/);
  assert.match(server, /event_key/);
  assert.match(server, /statusCode === 404 \|\| error\?\.statusCode === 410/);
  assert.match(server, /sendNotification/);
});

test("Admin message push responses retain a safe unavailability reason", () => {
  const adminRoute = read("app/api/admin/messages/send/route.ts");
  assert.match(adminRoute, /pushReason/);
  assert.match(adminRoute, /reason: pushReason/);
  assert.match(adminRoute, /logFailure\("push-dispatch"/);
  assert.doesNotMatch(adminRoute, /console\.log\([^\n]*(endpoint|p256dh|auth|message)/i);
});

test("direct messages and Young Learner material reminders use the shared push service", () => {
  assert.match(read("app/api/student/messages/route.ts"), /sendPortalPush/);
  assert.match(read("app/api/teacher/messages/reply/route.ts"), /sendPortalPush/);
  assert.match(read("app/api/teacher/student-messages/route.ts"), /sendPortalPush/);
  assert.match(read("app/api/admin/friday-tutorials/workflow/route.ts"), /sendPortalPush/);
  assert.match(read("app/api/teacher/class-register/reminders/route.ts"), /sendPortalPush/);
  assert.match(read("app/api/teacher/class-progress/reminders/route.ts"), /sendPortalPush/);
  assert.match(read("app/api/student/friday-tutorial-reminder/route.ts"), /sendPortalPush/);
  assert.match(read("app/api/student/homework/route.ts"), /sendPortalPush/);
  assert.match(read("app/api/teacher/friday-tutorial-notices/route.ts"), /sendPortalPush/);
  assert.match(read("app/api/admin/messages/send/route.ts"), /sendPortalPush/);
  assert.match(read("app/api/push/self/route.ts"), /authenticatePortalActor/);
  assert.match(read("app/components/student/StudentAnnouncementBanner.tsx"), /notifySelf/);
  assert.match(read("app/components/teacher/TeacherAnnouncementBanner.tsx"), /notifySelf/);
  assert.match(read("app/components/teacher/TeacherCalendarAgenda.tsx"), /notifySelf/);
});

test("automated Student PWA pushes queue overnight while direct messages bypass quiet hours", () => {
  assert.match(server, /Europe\/Madrid/);
  assert.match(server, /totalMinutes >= 10 \* 60 && totalMinutes < 22 \* 60/);
  assert.match(server, /push_notification_queue/);
  assert.match(server, /deliveryPolicy !== "direct_message"/);
  assert.match(server, /bypassAutomatedQuietHours/);
  assert.match(server, /flushQueuedAutomatedStudentPushes/);
  assert.match(studentPushQueueMigration, /unique \(user_id, event_key\)/);
  assert.match(studentPushQueueMigration, /sent_at/);
  assert.match(studentPushQueueRoute, /CRON_SECRET/);
  assert.match(studentPushQueueRoute, /flushQueuedAutomatedStudentPushes/);
  assert.match(vercelConfig, /student-push-queue/);
  assert.match(read("app/api/teacher/student-messages/route.ts"), /deliveryPolicy: "direct_message"/);
  assert.match(read("app/api/admin/messages/send/route.ts"), /deliveryPolicy: "direct_message"/);
});
