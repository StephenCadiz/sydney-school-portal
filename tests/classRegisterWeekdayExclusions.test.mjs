import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const server = read("lib/classRegisterServer.ts");
const migration = read(
  "supabase/migrations/20261028120000_add_class_register_weekday_exclusions.sql"
);

test("class registers support student-specific weekday exclusions without changing class days", () => {
  assert.match(server, /class_register_student_weekday_exclusions/);
  assert.match(server, /\.eq\("weekday", weekday\)/);
  assert.match(server, /\.lte\("effective_from", lessonDate\)/);
  assert.match(server, /return roster\.filter\(\(student\) =>/);
  assert.match(migration, /create table if not exists public\.class_register_student_weekday_exclusions/);
  assert.match(migration, /effective_from date not null default current_date/);
  assert.match(migration, /weekday text not null check/);
  assert.match(migration, /Attends Monday and Wednesday only/);
});

test("the Alma exclusion is scoped to the named Pre-Kids 3 class and Friday", () => {
  assert.match(migration, /lower\(trim\(student\.first_name\)\) = 'alma'/);
  assert.match(migration, /lower\(trim\(student\.last_name\)\) like 'beltran%'/);
  assert.match(migration, /lower\(trim\(classroom\.class_name\)\) = 'pre-kids 3'/);
  assert.match(migration, /lower\(trim\(teacher\.first_name\)\) = 'bernadett'/);
  assert.match(migration, /weekday,\s*effective_from,\s*reason/);
  assert.match(migration, /'Friday',\s*current_date,\s*'Attends Monday and Wednesday only.'/s);
  assert.doesNotMatch(migration, /update public\.classes\s+set\s+days/);
});
