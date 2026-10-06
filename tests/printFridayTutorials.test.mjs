import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const repositoryRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const source = readFileSync(
  join(repositoryRoot, "app/api/admin/print-exams/friday-tutorials/route.ts"),
  "utf8"
);
const page = readFileSync(
  join(repositoryRoot, "app/admin/print-class-exams/page.tsx"),
  "utf8"
);
const testBuildDirectory = mkdtempSync(join(tmpdir(), "print-friday-tutorials-test-"));
const helperSource = readFileSync(
  join(repositoryRoot, "lib/printFridayTutorials.ts"),
  "utf8"
);
writeFileSync(
  join(testBuildDirectory, "printFridayTutorials.js"),
  ts.transpileModule(helperSource, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: "printFridayTutorials.ts",
  }).outputText
);
const require = createRequire(import.meta.url);
const { getFridayTutorialPrintWindow } = require(
  join(testBuildDirectory, "printFridayTutorials.js")
);

test.after(() => rmSync(testBuildDirectory, { recursive: true, force: true }));

test("Tuesday in Madrid selects only the current Friday print event", () => {
  assert.deepEqual(
    getFridayTutorialPrintWindow(new Date("2026-10-06T12:00:00.000Z")),
    { monday: "2026-10-05", friday: "2026-10-09" }
  );
  assert.match(source, /\.eq\("session_date", window\.friday\)/);
  assert.doesNotMatch(source, /\.gte\("session_date", window\.monday\)/);
  assert.doesNotMatch(source, /\.lte\("session_date", window\.friday\)/);
});

test("week boundaries use Madrid local dates and exclude weekends", () => {
  assert.deepEqual(
    getFridayTutorialPrintWindow(new Date("2026-10-05T22:30:00.000Z")),
    { monday: "2026-10-05", friday: "2026-10-09" }
  );
  assert.equal(
    getFridayTutorialPrintWindow(new Date("2026-10-10T10:00:00.000Z")),
    null
  );
  assert.match(helperSource, /timeZone: "Europe\/Madrid"/);
});

test("independently scheduled B1 through C2 sessions are not rotation-filtered", () => {
  assert.doesNotMatch(source, /isB1FridayTutorialSession/);
  assert.doesNotMatch(source, /getFridayTutorialSessionTypeForDate/);
  assert.match(source, /isFridayTutorialCambridgeLevel\(tutorial\.level_name\)/);
  assert.match(source, /normalizeCambridgeLevel\(tutorial\.level_name\)/);
});

test("current-Friday rows retain configured exam parts and printable papers", () => {
  assert.match(source, /cambridge_exam_part_id/);
  assert.match(source, /paperByPartId\.get\(partId\)/);
  assert.match(source, /has_exam_part: Boolean\(tutorial\.cambridge_exam_part_id\)/);
  assert.match(page, /No exam parts have been selected for this Friday Tutorial/);
  assert.match(page, /No printable exam paper is configured for this exam part/);
});
