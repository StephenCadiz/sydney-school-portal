import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import * as helpers from "../lib/staffTime.ts";

const read = (name) => readFileSync(new URL(`../supabase/migrations/${name}`, import.meta.url), "utf8");
const base = read("20260903180000_create_staff_time_register.sql");
const extended = read("20260904210000_extend_staff_time_to_admin_staff.sql");
const correction = read("20260909120000_fix_staff_schedule_ordinality.sql");
test("schedule server preserves payloads and separates validation from SQL failures", async () => {
  const source = readFileSync(new URL("../lib/staffTimeServer.ts", import.meta.url), "utf8");
  const calls = [], logs = [];
  let failure = null;
  const exports = {};
  const realRequire = createRequire(import.meta.url);
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
    exports,
    console: { error: (...args) => logs.push(args) },
    require: (name) => name === "./staffTime" ? helpers : name === "node:net" ? realRequire(name) : name === "./supabaseAdmin" ? {
      supabaseAdmin: { rpc: async (...args) => { calls.push(args); return { data: { id: "saved" }, error: failure }; } },
    } : {},
  });
  const actor = { id: "00000000-0000-4000-8000-000000000001" };
  const teacher_id = "00000000-0000-4000-8000-000000000002";
  const one = { weekday: 1, start_time: "16:00", end_time: "21:00" };
  for (const intervals of [[one], [{ ...one, end_time: "18:00" }, { ...one, start_time: "19:00" }], [one, { ...one, weekday: 3 }]]) {
    await exports.saveWorkSchedule(actor, { teacher_id, effective_from: "2026-09-09", label: "Weekly", intervals });
    assert.deepEqual(JSON.parse(JSON.stringify(calls.at(-1))), ["save_staff_work_schedule", {
      p_actor_id: actor.id, p_teacher_id: teacher_id, p_effective_from: "2026-09-09", p_label: "Weekly", p_intervals: intervals,
    }]);
  }
  failure = { code: "42601", message: "WITH ORDINALITY cannot be used with a column definition list", details: "internal SQL" };
  const body = { teacher_id, effective_from: "2026-09-09", intervals: [one] };
  await assert.rejects(exports.saveWorkSchedule(actor, body), e => e.status === 500 && !/ORDINALITY|internal SQL/.test(e.message));
  assert.equal(logs.at(-1)[1], failure);
  for (const [code, message, status] of [["23P01", "Planned work intervals cannot overlap.", 409], ["22023", "The new schedule must start after the current schedule.", 422], ["42501", "Admin access required.", 403]]) {
    failure = { code, message };
    await assert.rejects(exports.saveWorkSchedule(actor, body), e => e.status === status && e.message === message);
  }
});
const fn = (sql, name) => {
  const start = sql.indexOf(`create or replace function ${name}(`);
  assert.ok(start >= 0, name);
  return sql.slice(start, sql.indexOf("$$;", start) + 3);
};
const table = (sql, name) => {
  const start = sql.indexOf(`create table public.${name} (`);
  return sql.slice(start, sql.indexOf("\n);", start) + 3);
};

test("only the defective function is replaced; all other callable ordinality definitions are valid", () => {
  assert.equal((correction.match(/create or replace function/g) || []).length, 1);
  const old = fn(extended, "public.save_staff_work_schedule");
  const expected = old.replace(
    "from jsonb_to_recordset(p_intervals) with ordinality\n        as item(weekday smallint, start_time time, end_time time, ordinality bigint)",
    "from rows from (\n        jsonb_to_recordset(p_intervals) as (weekday smallint, start_time time, end_time time)\n      ) with ordinality as item(weekday, start_time, end_time, ordinality)"
  ).replace(
    "from jsonb_to_recordset(p_intervals)\n      as item(weekday smallint, start_time time, end_time time)",
    "from rows from (\n      jsonb_to_recordset(p_intervals) as (weekday smallint, start_time time, end_time time)\n    ) with ordinality as item(weekday, start_time, end_time, ordinality)\n    order by weekday, start_time, ordinality"
  );
  assert.equal(fn(correction, "public.save_staff_work_schedule"), expected);
  const latest = new Map();
  for (const name of readdirSync(new URL("../supabase/migrations/", import.meta.url)).sort()) {
    const sql = read(name);
    for (const match of sql.matchAll(/create or replace function ([\w.]+)\(/gi)) {
      latest.set(match[1], fn(sql.slice(match.index), match[1]));
    }
  }
  for (const [name, sql] of latest) {
    assert.doesNotMatch(sql, /jsonb_to_recordset\([^)]*\)\s+with ordinality/i, name);
  }
});

// Opt-in disposable PostgreSQL, with no production connection or project dependency changes.
// STAFF_TIME_PGLITE=/path/to/node_modules/@electric-sql/pglite node --test tests/staffTimeSchedule.test.mjs
test("schedule RPC regression tests in disposable PostgreSQL", { skip: !process.env.STAFF_TIME_PGLITE }, async (t) => {
  const require = createRequire(import.meta.url);
  const root = process.env.STAFF_TIME_PGLITE;
  const { PGlite } = require(root);
  const { btree_gist } = require(`${root}/dist/contrib/btree_gist.cjs`);
  const db = new PGlite({ extensions: { btree_gist } });
  t.after(() => db.close());
  await db.exec(`
    create extension btree_gist;
    create schema app_private; create schema auth;
    create role service_role; create role anon; create role authenticated;
    create function auth.role() returns text language sql as $$ select coalesce(current_setting('test.auth_role', true), 'service_role') $$;
    create table public.profiles (id uuid primary key, role text);
    ${table(base, "staff_work_schedules")}
    ${table(base, "staff_work_schedule_intervals")}
    ${table(extended, "staff_time_admin_enrollment_events")}
    ${fn(base, "app_private.staff_time_require_admin")}
    ${fn(extended, "app_private.staff_time_is_participant")}
    ${fn(base, "app_private.staff_time_check_schedule_interval_overlap")}
    create trigger no_overlap before insert on public.staff_work_schedule_intervals
      for each row execute function app_private.staff_time_check_schedule_interval_overlap();
    ${fn(extended, "public.save_staff_work_schedule")}
    revoke all on function public.save_staff_work_schedule(uuid,uuid,date,text,jsonb) from public;
    grant execute on function public.save_staff_work_schedule(uuid,uuid,date,text,jsonb) to service_role;
    create table insertion_audit (position bigint generated always as identity, weekday smallint, start_time time);
    create function audit_interval() returns trigger language plpgsql as $$ begin
      insert into public.insertion_audit(weekday,start_time) values(new.weekday,new.start_time); return new; end $$;
    create trigger audit after insert on public.staff_work_schedule_intervals for each row execute function audit_interval();
  `);
  const actor = "00000000-0000-0000-0000-000000000001";
  const teacher = "00000000-0000-0000-0000-000000000002";
  const admin = "00000000-0000-0000-0000-000000000003";
  const disabled = "00000000-0000-0000-0000-000000000004";
  await db.query("insert into profiles values ($1,'admin'),($2,'teacher'),($3,'admin'),($4,'admin')", [actor, teacher, admin, disabled]);
  await db.query("insert into staff_time_admin_enrollment_events(admin_id,requires_time_registration,effective_from,changed_by) values ($1,true,'2026-01-01',$3),($2,false,'2026-01-01',$3)", [admin, disabled, actor]);
  const interval = (weekday = 1, start_time = "16:00", end_time = "21:00") => ({ weekday, start_time, end_time });
  const save = (intervals, person = teacher, date = "2026-09-09", user = actor) => db.query(
    "select * from public.save_staff_work_schedule($1,$2,$3,$4,$5::jsonb)",
    [user, person, date, "Test", JSON.stringify(intervals)]
  );
  await t.test("historical function reproduces the reported error", async () => {
    await assert.rejects(save([interval()]), /WITH ORDINALITY cannot be used with a column definition list/);
  });
  const metadata = async () => (await db.query("select proowner,proacl,prosecdef,proconfig from pg_proc where oid='public.save_staff_work_schedule(uuid,uuid,date,text,jsonb)'::regprocedure")).rows;
  const before = await metadata();
  await db.exec(correction);
  assert.deepEqual(await metadata(), before, "ownership, ACLs, security and search_path unchanged");
  const snapshot = async () => (await db.query("select row_to_json(s) as row from staff_work_schedules s order by id")).rows;
  const rejected = async (payload, person = teacher, date = "2026-10-01", user = actor) => {
    const before = await snapshot();
    await assert.rejects(save(payload, person, date, user));
    assert.deepEqual(await snapshot(), before, "failed replacement must roll back schedule versioning");
  };
  await t.test("Monday 16:00–21:00 saves for a Teacher", async () => {
    assert.equal((await save([interval()])).rows.length, 1);
  });
  await t.test("whole week, deterministic day/time ordering and split shifts", async () => {
    await db.exec("truncate insertion_audit");
    const payload = [interval(5), interval(1,"18:00","21:00"), interval(3), interval(1,"09:00","12:00"), interval(2), interval(4)];
    await save(payload, teacher, "2026-09-10");
    assert.deepEqual((await db.query("select weekday,start_time from insertion_audit order by position")).rows,
      payload.toSorted((a,b)=>a.weekday-b.weekday || a.start_time.localeCompare(b.start_time)).map(x=>({weekday:x.weekday,start_time:x.start_time+":00"})));
  });
  await t.test("tracked Admin staff can save", async () => { await save([interval()], admin); });
  for (const [name, payload] of [
    ["overlap", [interval(),interval(1,"17:00","20:00")]],
    ["equal times", [interval(1,"16:00","16:00")]],
    ["reversed times", [interval(1,"21:00","16:00")]],
    ["weekday zero", [interval(0)]], ["weekday eight", [interval(8)]],
    ["malformed object", {}], ["null array", null], ["scalar item", [42]],
    ["missing fields", [{}]], ["bad time", [interval(1,"bad","21:00")]],
    ["too many intervals", Array(36).fill(interval())],
    ["late invalid interval rolls back earlier insert", [interval(),interval(2,"21:00","16:00")]],
  ]) await t.test(`${name} rejected atomically`, () => rejected(payload));
  await t.test("empty array remains allowed", async () => { await save([], teacher, "2026-10-02"); });
  await t.test("disabled Admin rejected", () => rejected([interval()], disabled));
  await t.test("non-admin actor rejected", () => rejected([interval()], teacher, "2026-11-01", teacher));
  await t.test("unknown participant rejected", () => rejected([interval()], "00000000-0000-0000-0000-000000000099"));
  await t.test("non-service role rejected", async () => {
    await db.exec("set test.auth_role = 'authenticated'");
    await rejected([interval()]);
    await db.exec("set test.auth_role = 'service_role'");
  });
  await t.test("past replacement effective date rejected", () => rejected([interval()], teacher, "2026-09-09"));
});
