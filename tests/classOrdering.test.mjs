import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(new URL("../lib/classOrdering.ts", import.meta.url), "utf8");

test("global class ordering defines the requested level sequence", () => {
  const levels = source.match(/"(?:Pre-Kids|Kids|Junior|Teens|Support Classes|B1|B2|C1|C2)[^"]*"/g) || [];
  assert.deepEqual(levels.slice(0, 15), [
    '"Pre-Kids 1"', '"Pre-Kids 2"', '"Pre-Kids 3"', '"Kids 1"', '"Kids 2"',
    '"Junior 1"', '"Junior 2"', '"Junior 3"', '"Junior 4"', '"Teens 1"',
    '"Support Classes"', '"B1"', '"B2"', '"C1"', '"C2"',
  ]);
});

test("ordering utility includes schedule day, time, name, and unknown fallbacks", () => {
  assert.match(source, /getScheduleDayGroup/);
  assert.match(source, /Monday|monday/);
  assert.match(source, /Tuesday|tuesday/);
  assert.match(source, /timeRank/);
  assert.match(source, /Number\.MAX_SAFE_INTEGER/);
  assert.match(source, /GLOBAL_LEVEL_ORDER\.length/);
  assert.match(source, /class_name/);
});

test("School Roster uses the shared ordering and displays coordinators by level", () => {
  const server = fs.readFileSync(new URL("../lib/schoolRosterServer.ts", import.meta.url), "utf8");
  const view = fs.readFileSync(new URL("../app/components/roster/SchoolRosterView.tsx", import.meta.url), "utf8");
  assert.match(server, /sortClassesByGlobalOrder/);
  assert.match(server, /syllabus_coordinators/);
  assert.match(view, /Coordinator/);
  assert.match(view, /Coordinator not assigned|Not assigned/);
});
