import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const sessionRoute = read("app/api/student/session/route.ts");
const userHelper = read("lib/user.ts");
const dashboard = read("app/student/page.tsx");

test("Student identity comes from the mapping-resolved profile", () => {
  assert.match(sessionRoute, /resolveProfileIdForAuthUser\(authData\.user\.id\)/);
  assert.match(sessionRoute, /select\("id, email, role, first_name, last_name"\)/);
  assert.match(sessionRoute, /first_name: profile\.first_name/);
  assert.match(sessionRoute, /const displayName = \[profile\.first_name, profile\.last_name\]/);
  assert.match(sessionRoute, /display_name: displayName/);
  assert.match(userHelper, /first_name: payload\.first_name/);
  assert.match(userHelper, /display_name: payload\.display_name/);
  assert.match(dashboard, /user\.display_name \|\|/);
  assert.match(dashboard, /Welcome back, \$\{studentName\}/);
  assert.doesNotMatch(dashboard, /\.from\("profiles"\)/);
});

test("Student identity keeps a safe fallback and does not affect staff routing", () => {
  assert.match(dashboard, /useState\(""\)/);
  assert.match(sessionRoute, /profile\?\.role !== "student"/);
  assert.match(userHelper, /cache: "no-store"/);
});
