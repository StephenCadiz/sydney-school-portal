import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(new URL("../lib/adminClasses.ts", import.meta.url), "utf8");
const dashboard = fs.readFileSync(new URL("../app/admin/page.tsx", import.meta.url), "utf8");

test("Admin classes avoids the unavailable nested classes-to-levels relationship", () => {
  assert.match(source, /from\("classes"\)[\s\S]*?\.select\("\*"\)/);
  assert.doesNotMatch(source, /select\("\*,\s*levels\s*\(/);
  assert.match(source, /from\("levels"\)\.select\("id, name"\)/);
});

test("Admin classes attach level names before applying shared ordering", () => {
  assert.match(source, /levelNames = new Map/);
  assert.match(source, /level_name:\s*levelNames\.get/);
  assert.match(source, /sortClassesByGlobalOrder/);
});

test("Admin dashboard derives its class count from the repaired loader", () => {
  assert.match(dashboard, /getAdminClasses\(\)/);
  assert.match(dashboard, /classes\.length/);
});

test("Admin class query errors expose structured Supabase diagnostics", () => {
  assert.match(source, /message:\s*error\?\.message/);
  assert.match(source, /code:\s*error\?\.code/);
  assert.match(source, /details:\s*error\?\.details/);
  assert.match(source, /hint:\s*error\?\.hint/);
});
