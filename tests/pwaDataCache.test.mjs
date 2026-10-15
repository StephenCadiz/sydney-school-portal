import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const cache = read("lib/pwaDataCache.ts");
const bootstrap = read("app/components/pwa/PwaDataCacheBootstrap.tsx");
const studentLayout = read("app/student/layout.tsx");
const teacherLayout = read("app/components/layout/TeacherLayout.tsx");
const adminShell = read("app/components/pwa/AdminPwaShell.tsx");

test("installed PWAs use an account-scoped IndexedDB stale-while-revalidate cache", () => {
  assert.match(cache, /indexedDB/);
  assert.match(cache, /accountId/);
  assert.match(cache, /stale/i);
  assert.match(cache, /updatedAt/);
  assert.match(cache, /responseFromRecord/);
  assert.match(cache, /refreshResponse/);
  assert.match(cache, /window\.fetch = wrappedFetch/);
  assert.match(cache, /\/rest\/v1\//);
  assert.match(cache, /NEXT_PUBLIC_SUPABASE_URL/);
});

test("PWA data cache excludes binary resources and clears on account changes", () => {
  for (const pattern of ["/download", "/attachment", "/media", "/storage", ".pdf", ".mp3", ".wav", ".m4a"]) {
    assert.match(cache, new RegExp(pattern.replace(".", "\\.")));
  }
  assert.match(cache, /clearPwaDataCache/);
  assert.match(bootstrap, /SIGNED_OUT/);
  assert.match(bootstrap, /clearPwaDataCache\(previousAccountId\)/);
  assert.match(bootstrap, /installPwaDataCache/);
});

test("Student, Teacher, and Admin installed PWAs bootstrap the shared cache", () => {
  assert.match(studentLayout, /PwaDataCacheBootstrap/);
  assert.match(teacherLayout, /PwaDataCacheBootstrap/);
  assert.match(adminShell, /PwaDataCacheBootstrap/);
});
