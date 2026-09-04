import assert from "node:assert/strict";
import test from "node:test";

import {
  getEffectiveClassDateRange,
  isDateWithinEffectiveClassRange,
} from "../lib/classDateRange.ts";

test("explicit class dates narrow the academic year", () => {
  assert.deepEqual(
    getEffectiveClassDateRange({
      academicYearStart: "2026-09-01",
      academicYearEnd: "2027-08-31",
      classStart: "2026-09-14",
      classEnd: "2027-06-30",
    }),
    { startDate: "2026-09-14", endDate: "2027-06-30" }
  );
});

test("academic-year boundaries win when narrower than class dates", () => {
  assert.deepEqual(
    getEffectiveClassDateRange({
      academicYearStart: "2026-09-14",
      academicYearEnd: "2027-06-30",
      classStart: "2026-09-01",
      classEnd: "2027-08-31",
    }),
    { startDate: "2026-09-14", endDate: "2027-06-30" }
  );
});

test("annual classes without explicit dates fall back to the academic year", () => {
  assert.deepEqual(
    getEffectiveClassDateRange({
      academicYearStart: "2026-09-01",
      academicYearEnd: "2027-08-31",
    }),
    { startDate: "2026-09-01", endDate: "2027-08-31" }
  );
});

test("an incomplete explicit class range does not partially narrow the fallback", () => {
  assert.deepEqual(
    getEffectiveClassDateRange({
      academicYearStart: "2026-09-01",
      academicYearEnd: "2027-08-31",
      classStart: "2026-09-14",
    }),
    { startDate: "2026-09-01", endDate: "2027-08-31" }
  );
});

test("date-only range includes both boundaries and excludes outside dates", () => {
  const range = { startDate: "2026-09-14", endDate: "2027-06-30" };
  assert.equal(isDateWithinEffectiveClassRange("2026-09-13", range), false);
  assert.equal(isDateWithinEffectiveClassRange("2026-09-14", range), true);
  assert.equal(isDateWithinEffectiveClassRange("2027-06-30", range), true);
  assert.equal(isDateWithinEffectiveClassRange("2027-07-01", range), false);
});

test("non-overlapping boundaries do not produce an active range", () => {
  assert.equal(
    getEffectiveClassDateRange({
      academicYearStart: "2026-09-01",
      academicYearEnd: "2027-08-31",
      classStart: "2028-01-01",
      classEnd: "2028-02-01",
    }),
    null
  );
});
