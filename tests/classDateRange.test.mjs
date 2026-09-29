import assert from "node:assert/strict";
import test from "node:test";

import {
  getEffectiveClassDateRange,
  isDateWithinEffectiveClassRange,
  validateClassDateOverrides,
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

test("explicit class dates may extend beyond the academic year", () => {
  assert.deepEqual(
    getEffectiveClassDateRange({
      academicYearStart: "2026-09-14",
      academicYearEnd: "2027-06-30",
      classStart: "2026-09-01",
      classEnd: "2027-08-31",
    }),
    { startDate: "2026-09-01", endDate: "2027-08-31" }
  );
});

test("a start-only or end-only override inherits the other term boundary", () => {
  assert.deepEqual(
    getEffectiveClassDateRange({
      academicYearStart: "2026-09-01",
      academicYearEnd: "2027-08-31",
      classStart: "2026-08-24",
    }),
    { startDate: "2026-08-24", endDate: "2027-08-31" }
  );
  assert.deepEqual(
    getEffectiveClassDateRange({
      academicYearStart: "2026-09-01",
      academicYearEnd: "2027-08-31",
      classEnd: "2027-09-15",
    }),
    { startDate: "2026-09-01", endDate: "2027-09-15" }
  );
});

test("date override validation accepts term defaults and rejects inverted effective ranges", () => {
  assert.deepEqual(
    validateClassDateOverrides({
      academicYearStart: "2026-09-01",
      academicYearEnd: "2027-08-31",
      startDate: "2026-08-24",
      endDate: null,
    }),
    { value: { startDate: "2026-08-24", endDate: null }, error: null }
  );
  assert.match(
    validateClassDateOverrides({
      academicYearStart: "2026-09-01",
      academicYearEnd: "2027-08-31",
      startDate: "2028-01-01",
      endDate: "2027-01-01",
    }).error,
    /must not be after/
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

test("a partial class override inherits the missing term boundary", () => {
  assert.deepEqual(
    getEffectiveClassDateRange({
      academicYearStart: "2026-09-01",
      academicYearEnd: "2027-08-31",
      classStart: "2026-09-14",
    }),
    { startDate: "2026-09-14", endDate: "2027-08-31" }
  );
});

test("date-only range includes both boundaries and excludes outside dates", () => {
  const range = { startDate: "2026-09-14", endDate: "2027-06-30" };
  assert.equal(isDateWithinEffectiveClassRange("2026-09-13", range), false);
  assert.equal(isDateWithinEffectiveClassRange("2026-09-14", range), true);
  assert.equal(isDateWithinEffectiveClassRange("2027-06-30", range), true);
  assert.equal(isDateWithinEffectiveClassRange("2027-07-01", range), false);
});

test("an explicit range outside the term remains an active class range", () => {
  assert.deepEqual(
    getEffectiveClassDateRange({
      academicYearStart: "2026-09-01",
      academicYearEnd: "2027-08-31",
      classStart: "2028-01-01",
      classEnd: "2028-02-01",
    }),
    { startDate: "2028-01-01", endDate: "2028-02-01" }
  );
});
