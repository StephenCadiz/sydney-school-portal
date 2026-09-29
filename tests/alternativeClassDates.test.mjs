import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  getEffectiveClassDateRange,
  validateClassDateOverrides,
} from "../lib/classDateRange.ts";

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("term dates are the default effective window", () => {
  assert.deepEqual(getEffectiveClassDateRange({
    academicYearStart: "2026-09-01",
    academicYearEnd: "2027-06-30",
  }), { startDate: "2026-09-01", endDate: "2027-06-30" });
});

test("start-only, end-only, and both overrides are supported outside the term", () => {
  assert.deepEqual(getEffectiveClassDateRange({
    academicYearStart: "2026-09-01", academicYearEnd: "2027-06-30", classStart: "2026-08-24",
  }), { startDate: "2026-08-24", endDate: "2027-06-30" });
  assert.deepEqual(getEffectiveClassDateRange({
    academicYearStart: "2026-09-01", academicYearEnd: "2027-06-30", classEnd: "2027-07-15",
  }), { startDate: "2026-09-01", endDate: "2027-07-15" });
  assert.deepEqual(getEffectiveClassDateRange({
    academicYearStart: "2026-09-01", academicYearEnd: "2027-06-30", classStart: "2026-08-24", classEnd: "2027-07-15",
  }), { startDate: "2026-08-24", endDate: "2027-07-15" });
});

test("inverted effective ranges are rejected", () => {
  const result = validateClassDateOverrides({
    academicYearStart: "2026-09-01", academicYearEnd: "2027-06-30",
    startDate: "2027-07-01", endDate: "2027-06-30",
  });
  assert.match(result.error, /must not be after/);
});

test("Express and Intensive retain their course-date path while standard forms expose overrides", () => {
  const page = read("app/admin/classes/page.tsx");
  const server = read("lib/adminClassServer.ts");
  assert.match(page, /selectedFormUsesAcademicYear/);
  assert.match(page, /Effective start date/);
  assert.match(page, /Effective end date/);
  assert.match(server, /classUsesAcademicYear/);
  assert.match(server, /validateClassDateOverrides/);
  assert.match(page, /\["intensive", "express"\]/);
});

test("class lifecycle consumers use effective ranges and the Admin update is transactional", () => {
  const roster = read("lib/schoolRosterServer.ts");
  const enrolments = read("app/api/admin/class-enrolments/route.ts");
  const migration = read("supabase/migrations/20260929120000_alternative_class_dates.sql");
  assert.match(roster, /getEffectiveClassDateRange/);
  assert.match(enrolments, /isDateWithinEffectiveClassRange/);
  assert.match(migration, /update_class_with_effective_dates/);
  assert.match(migration, /class_date_change_events/);
  assert.match(migration, /manage_class_enrolment_period_effective/);
  assert.match(migration, /set search_path = pg_catalog, pg_temp/);
  assert.match(migration, /grant execute on function public\.update_class_with_effective_dates/);
  assert.match(migration, /auth\.role\(\) is distinct from 'service_role'/);
  assert.match(migration, /role='admin'/);
});

test("class date changes preserve enrolment history and require confirmation for affected periods", () => {
  const migration = read("supabase/migrations/20260929120000_alternative_class_dates.sql");
  assert.match(migration, /requires_confirmation/);
  assert.match(migration, /class_enrolment_period_events/);
  assert.match(migration, /cancelled_at=now\(\)/);
  assert.match(migration, /p_confirm_date_impact/);
});
