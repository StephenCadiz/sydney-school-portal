import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const migration = read("supabase/migrations/20260912120000_add_future_class_roster_views.sql");

function rosterVisible(period, today) {
  return !period.cancelled_at && (!period.ends_before || today < period.ends_before);
}

test("future enrolments are visible in roster views but not attendance eligibility", () => {
  assert.match(migration, /create view public\.class_roster_profiles/);
  assert.match(migration, /create view public\.class_roster_young_learners/);
  assert.match(migration, /p\.cancelled_at is null/);
  assert.match(migration, /p\.ends_before is null or .*p\.ends_before/);
  assert.equal(rosterVisible({ starts_on: "2026-09-15", ends_before: null }, "2026-09-12"), true);
  assert.equal(rosterVisible({ starts_on: "2026-09-15", ends_before: "2026-09-20" }, "2026-09-19"), true);
  assert.equal(rosterVisible({ starts_on: "2026-09-15", ends_before: "2026-09-20" }, "2026-09-20"), false);
  assert.equal(rosterVisible({ starts_on: "2026-09-15", ends_before: null, cancelled_at: "2026-09-10" }, "2026-09-12"), false);

  const currentView = read("supabase/migrations/20260909130000_class_enrolment_periods.sql");
  assert.match(currentView, /create view public\.current_class_enrolments[\s\S]*p\.starts_on <=/);
  assert.match(currentView, /create view public\.current_young_learners[\s\S]*p\.starts_on <=/);
});

test("Admin and Teacher roster consumers use the future-inclusive views", () => {
  for (const path of ["lib/adminClasses.ts", "lib/adminStudents.ts", "app/teacher/class/page.tsx"]) {
    const source = read(path);
    assert.match(source, /class_roster_profiles|class_roster_young_learners/, path);
  }

  const attendance = read("lib/classRegisterServer.ts");
  assert.match(attendance, /current_class_enrolments/);
  assert.match(attendance, /current_young_learners/);
});
