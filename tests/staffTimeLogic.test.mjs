import assert from "node:assert/strict";
import test from "node:test";

import {
  formatContractedWeeklyHours,
  formatMadridTime,
  getStaffTimeDayStatus,
  madridLocalToIso,
  minutesBetween,
  shouldShowFinishReminder,
  shouldShowStartReminder,
  spanishClosureLabel,
  validateContractedWeeklyHours,
} from "../lib/staffTime.ts";

const interval = { weekday: 1, start_time: "16:00", end_time: "21:00" };

function assertValidContractedHours(input, expected) {
  const result = validateContractedWeeklyHours(input);
  assert.equal(result.error, "");
  assert.equal(result.value, expected);
}

test("contracted hours accept whole numbers and normal decimal values", () => {
  assertValidContractedHours("0.01", 0.01);
  assertValidContractedHours("1", 1);
  assertValidContractedHours("20", 20);
  assertValidContractedHours("23", 23);
  assertValidContractedHours("23.0", 23);
  assertValidContractedHours("23.25", 23.25);
  assertValidContractedHours("40", 40);
  assertValidContractedHours("167.99", 167.99);
  assertValidContractedHours("168", 168);
  assertValidContractedHours(0.1 + 0.2, 0.3);
});

test("contracted hours reject missing, invalid, out-of-range, and over-precise values", () => {
  for (const value of [
    "",
    0,
    -1,
    "not-a-number",
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
    168.01,
    23.001,
  ]) {
    const result = validateContractedWeeklyHours(value);
    assert.equal(result.value, null);
    assert.notEqual(result.error, "");
  }
});

test("contracted hours display without meaningless trailing zeroes", () => {
  assert.equal(formatContractedWeeklyHours(23), "23");
  assert.equal(formatContractedWeeklyHours(23.5), "23.5");
  assert.equal(formatContractedWeeklyHours(23.01), "23.01");
});

test("the start reminder begins at 15:45, not 15:44", () => {
  assert.equal(shouldShowStartReminder(15 * 60 + 44, 16 * 60, false), false);
  assert.equal(shouldShowStartReminder(15 * 60 + 45, 16 * 60, false), true);
});

test("the finish reminder begins at 20:55 while a session is open", () => {
  assert.equal(shouldShowFinishReminder(20 * 60 + 54, 21 * 60, true), false);
  assert.equal(shouldShowFinishReminder(20 * 60 + 55, 21 * 60, true), true);
  assert.equal(shouldShowFinishReminder(20 * 60 + 55, 21 * 60, false), false);
});

test("actual 15:58 to 21:04 remains a 306-minute official span", () => {
  assert.equal(
    minutesBetween("2026-09-14T13:58:00.000Z", "2026-09-14T19:04:00.000Z"),
    306
  );
});

test("split sessions total eight hours without losing either interval", () => {
  const first = minutesBetween("2026-09-14T07:00:00.000Z", "2026-09-14T11:00:00.000Z");
  const second = minutesBetween("2026-09-14T14:00:00.000Z", "2026-09-14T18:00:00.000Z");
  assert.equal(first + second, 480);
});

test("a school closure overrides the planned obligation", () => {
  const closure = {
    id: "closure",
    name: "Fiesta Nacional de España",
    closure_type: "public_holiday",
  };
  const status = getStaffTimeDayStatus({
    nowDate: "2026-10-12",
    currentMinutes: 18 * 60,
    workDate: "2026-10-12",
    intervals: [interval],
    sessions: [],
    closure,
    remoteAuthorised: false,
    pendingCorrectionCount: 0,
    openIncidenceTypes: [],
  });
  assert.deepEqual(status, { status: "school_closed", label: "School closed" });
  assert.equal(spanishClosureLabel(closure), "Festivo — Fiesta Nacional de España");
});

test("a weekday without planned intervals is non-working, not missing", () => {
  const status = getStaffTimeDayStatus({
    nowDate: "2026-09-13",
    currentMinutes: 22 * 60,
    workDate: "2026-09-13",
    intervals: [],
    sessions: [],
    closure: null,
    remoteAuthorised: false,
    pendingCorrectionCount: 0,
    openIncidenceTypes: [],
  });
  assert.equal(status.status, "non_working_day");
});

test("Madrid wall-clock correction times survive UTC conversion", () => {
  const value = madridLocalToIso("2026-09-18", "16:03");
  assert.ok(value);
  assert.equal(formatMadridTime(value), "16:03");
});
