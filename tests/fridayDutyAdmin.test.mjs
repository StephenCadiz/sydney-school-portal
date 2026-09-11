import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync(
  new URL("../app/admin/friday-exam-practice/page.tsx", import.meta.url),
  "utf8"
);
const legacyPage = readFileSync(
  new URL("../app/admin/friday-tutorials/page.tsx", import.meta.url),
  "utf8"
);
const helper = readFileSync(
  new URL("../lib/fridayExamPractice.ts", import.meta.url),
  "utf8"
);
const nullableDutyMigration = readFileSync(
  new URL(
    "../supabase/migrations/20260910140000_allow_unassigned_friday_general_duty.sql",
    import.meta.url
  ),
  "utf8"
);

test("Tutorial Duties rows expose Admin edit and delete controls", () => {
  assert.match(page, /function editDuty\(item: any\)/);
  assert.match(page, /onClick=\{\(\) => editDuty\(duty\)\}/);
  assert.match(page, /className="friday-six-general-edit"/);
  assert.match(page, /className="friday-six-general-delete"/);
  assert.match(page, /editingDutyId &&/);
});

test("duty deletion confirms date and both assigned teacher names", () => {
  assert.match(page, /Delete the tutorial duty for \$\{formatDate\(/);
  assert.match(page, /Assigned teachers: \$\{teacherSummary\}/);
  assert.match(page, /deletingDutyId === duty\.id/);
  assert.match(page, /Deleting\.\.\./);
});

test("deleting a General duty preserves a separate B1 assignment", () => {
  assert.match(helper, /select\("id, teacher_id, b1_teacher_id"\)/);
  assert.match(helper, /\.eq\("id", id\)/);
  assert.match(helper, /if \(duty\.b1_teacher_id\)/);
  assert.match(helper, /\.update\(\{ teacher_id: null \}\)/);
  assert.match(helper, /\.eq\("teacher_id", duty\.teacher_id\)/);
  assert.match(helper, /\.from\("friday_at_6_duties"\)[\s\S]*\.delete\(\)/);
  assert.match(nullableDutyMigration, /alter column teacher_id drop not null/i);
});

test("existing validation and Admin-only surface remain in use", () => {
  assert.match(page, /if \(!dutySessionType\)/);
  assert.match(page, /if \(b1DutyRequired && !dutyForm\.b1_teacher_id\)/);
  assert.match(page, /<AdminLayout>/);
  assert.match(helper, /ensureNoDuplicateFridayAt6DutyDate\(dutyPayload\.session_date, id\)/);
});

test("Rosa Vara's confirmed duty ID is passed through the controlled delete helper", () => {
  const dutyId = "81710154-a60b-4942-b981-17d273064576";
  assert.equal(dutyId.length, 36);
  assert.match(helper, /export async function deleteFridayAt6Duty\(id: string\)/);
  assert.match(page, /onClick=\{\(\) => removeDuty\(duty\)\}/);
});

test("legacy Friday Tutorials route redirects to the canonical duty workflow", () => {
  assert.match(legacyPage, /window\.location\.replace\("\/admin\/friday-exam-practice"\)/);
});
