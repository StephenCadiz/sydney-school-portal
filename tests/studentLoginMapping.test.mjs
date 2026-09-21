import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const loginPage = readFileSync(new URL("../app/login/page.tsx", import.meta.url), "utf8");

test("login falls back to the mapping-aware Student session for legacy Cambridge IDs", () => {
  assert.match(loginPage, /data\.session\?\.access_token/);
  assert.match(loginPage, /fetch\("\/api\/student\/session"/);
  assert.match(loginPage, /Authorization: `Bearer \$\{accessToken\}`/);
  assert.match(loginPage, /cache: "no-store"/);
  assert.match(loginPage, /resolvedProfileId/);
  assert.match(loginPage, /mappedSessionResponse\.ok && resolvedProfileId/);
  assert.match(loginPage, /router\.push\("\/student"\)/);
});

test("invalid or unmapped accounts still sign out and show the existing error", () => {
  assert.match(loginPage, /await supabase\.auth\.signOut\(\);/);
  assert.match(loginPage, /Unable to access your portal account\. Please try again\./);
  assert.match(loginPage, /if \(profileError \|\| !profile\?\.role\)/);
});

test("direct Admin, Teacher, and Student profile routing remains unchanged", () => {
  assert.match(loginPage, /profile\.role === "admin"/);
  assert.match(loginPage, /router\.push\("\/admin"\)/);
  assert.match(loginPage, /profile\.role === "teacher"/);
  assert.match(loginPage, /router\.push\("\/teacher"\)/);
  assert.match(loginPage, /profile\.role === "student"/);
  assert.match(loginPage, /router\.push\("\/student"\)/);
});
