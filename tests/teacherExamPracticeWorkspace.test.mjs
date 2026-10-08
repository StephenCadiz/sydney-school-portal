import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const route = readFileSync(
  new URL("../app/api/teacher/friday-tutorial-notices/route.ts", import.meta.url),
  "utf8"
);
const card = readFileSync(
  new URL("../app/components/teacher/FridayExamPracticeCard.tsx", import.meta.url),
  "utf8"
);
const dashboard = readFileSync(new URL("../app/teacher/page.tsx", import.meta.url), "utf8");
const adminRoute = readFileSync(
  new URL("../app/api/admin/friday-exam-practice/sessions/route.ts", import.meta.url),
  "utf8"
);
const migration = readFileSync(
  new URL("../supabase/migrations/20261008120000_add_friday_exam_practice_times.sql", import.meta.url),
  "utf8"
);

test("teacher exam practice activates in the Madrid-local configured window", () => {
  assert.match(route, /timeZone: "Europe\/Madrid"/);
  assert.match(route, /isExamPracticeActiveNow/);
  assert.match(route, /clock\.minutes >= start && clock\.minutes < end/);
  assert.match(route, /session_date/);
  assert.match(route, /start_time/);
  assert.match(route, /end_time/);
});

test("exam practice is independent of Friday duty rotation and targets every teacher dashboard", () => {
  assert.match(route, /from\("friday_exam_practice_sessions"\)/);
  assert.doesNotMatch(route, /isB1FridayTutorialSession/);
  assert.match(route, /\.eq\("active", true\)/);
  assert.match(route, /visibleSessions = \(sessions \|\| \[\]\)\.filter/);
  assert.match(route, /loadTeacherScoringLinks/);
  assert.match(dashboard, /friday-tutorial-notices/);
});

test("the active workspace shows date, time, exact exam part, resources and scoring links", () => {
  assert.match(card, /Active Friday Exam Practice workspace/);
  assert.match(card, /formatSessionDate\(session\.session_date\)/);
  assert.match(card, /formatTime\(session\.start_time\)/);
  assert.match(card, /session\.exam_bank\?\.part_label/);
  assert.match(card, /session\.exam_part/);
  assert.match(card, /session\.activity_type/);
  assert.match(card, /session\.resources/);
  assert.match(card, /Open scoring/);
  assert.match(card, /Not uploaded/);
  assert.match(route, /friday_session_id/);
});

test("configured session times are persisted and validated as Madrid-local times", () => {
  assert.match(adminRoute, /start_time/);
  assert.match(adminRoute, /end_time/);
  assert.match(adminRoute, /end time must be after the start time/);
  assert.match(migration, /add column if not exists start_time/);
  assert.match(migration, /add column if not exists end_time/);
  assert.match(migration, /end_time > start_time/);
});

test("the dashboard refreshes so activation and expiry do not require a manual reload", () => {
  assert.match(dashboard, /setInterval\(loadData, 60_000\)/);
  assert.match(dashboard, /clearInterval\(refreshTimer\)/);
});
