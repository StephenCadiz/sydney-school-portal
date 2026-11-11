import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const migration = fs.readFileSync(
  new URL(
    "../supabase/migrations/20261111120000_add_cambridge_class_delivery_mode.sql",
    import.meta.url
  ),
  "utf8"
);
const validator = fs.readFileSync(
  new URL("../lib/adminClassServer.ts", import.meta.url),
  "utf8"
);
const studentDashboard = fs.readFileSync(
  new URL("../app/student/page.tsx", import.meta.url),
  "utf8"
);
const teacherMeetRoute = fs.readFileSync(
  new URL("../app/api/teacher/classes/[id]/google-meet/route.ts", import.meta.url),
  "utf8"
);

test("Cambridge delivery mode is additive and defaults existing classes to in-person", () => {
  assert.match(migration, /add column if not exists delivery_mode text not null default 'in_person'/);
  assert.match(migration, /check \(delivery_mode in \('in_person', 'online', 'hybrid'\)\)/);
  assert.match(migration, /where lower\(trim\(coalesce\(course_type, ''\)\)\) = 'online'/);
});

test("Admin validation preserves the online link and separates delivery from course type", () => {
  assert.match(validator, /delivery_mode/);
  assert.match(validator, /const hasOnlineOption = deliveryMode !== "in_person"/);
  assert.match(validator, /meet_link: hasOnlineOption \? meetLink : null/);
  assert.match(validator, /classroom_id: deliveryMode === "online" \? null : classroomId/);
});

test("Students get the same online option for Cambridge online and hybrid classes", () => {
  assert.match(studentDashboard, /classHasOnlineOption\(classroom\)/);
  assert.match(studentDashboard, /setOnlineClassAvailable\(hasOnlineClassOption\)/);
  assert.match(studentDashboard, /const isOnlineCourse = onlineClassAvailable/);
});

test("Teachers can open a Cambridge online or hybrid class through the Meet route", () => {
  assert.match(teacherMeetRoute, /delivery_mode/);
  assert.match(teacherMeetRoute, /is_cambridge: classroom\.is_cambridge === true/);
  assert.match(teacherMeetRoute, /classHasOnlineOption\(classroom\)/);
});
