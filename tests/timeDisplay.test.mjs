import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = (file) => fs.readFileSync(file, "utf8");

test("shared clock formatter removes database seconds", () => {
  const helper = read("lib/timeDisplay.ts");

  assert.match(helper, /export function formatClockTime/);
  assert.match(helper, /\\d\{2\}/);
  assert.match(helper, /padStart\(2, "0"\)/);
  assert.match(helper, /export function formatClockRange/);
});

test("known schedule cards use the shared clock formatter", () => {
  const files = [
    "app/components/dashboard/ClassCard.tsx",
    "app/components/my-classes/MyClassCard.tsx",
    "app/components/class/ClassHeader.tsx",
    "app/components/teacher/FridayAt6DutyCard.tsx",
    "app/components/teacher/FridayTutorialAttendanceCard.tsx",
    "app/components/teacher/FridayTutorialDutyReminderCard.tsx",
    "app/components/teacher/FridayTutorialTeacherMaterialReminderCard.tsx",
    "app/components/pwa/AdminPwaStudentInformation.tsx",
    "app/admin/add-users/page.tsx",
    "app/admin/teacher-calendar/page.tsx",
    "app/admin/student-information/page.tsx",
  ];

  for (const file of files) {
    assert.match(read(file), /timeDisplay/ , `${file} should use the shared clock formatter`);
  }
});

test("class workspace normalizes serialized database times", () => {
  const helper = read("lib/timeDisplay.ts");
  assert.match(helper, /fractional seconds/);
  assert.match(helper, /\(\?:Z\|\[\+\-\]/);

  const header = read("app/components/class/ClassHeader.tsx");
  assert.doesNotMatch(header, /function formatTime/);
  assert.match(header, /formatClockTime\(classData\.start_time\)/);
  assert.match(header, /formatClockTime\(classData\.end_time\)/);
});
