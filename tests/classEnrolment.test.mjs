import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { eligibleForClassDate, isEnrolmentDate, madridEnrolmentDate } from "../lib/classEnrolment.ts";

const period = (student_type = "profile", extra = {}) => ({
  class_id: "class-a", student_type, student_id: "student-a",
  starts_on: "2026-10-01", ends_before: "2026-11-01", ...extra,
});

for (const type of ["profile", "young_learner"]) {
  test(`${type}: inclusive start, exclusive withdrawal and re-enrolment gap`, () => {
    const periods = [period(type), period(type, { starts_on: "2026-12-01", ends_before: null })];
    const eligible = date => eligibleForClassDate(periods, "class-a", type, "student-a", date);
    for (const date of ["2026-09-15", "2026-09-30", "2026-11-01", "2026-11-30"]) assert.equal(eligible(date), false, date);
    for (const date of ["2026-10-01", "2026-10-31", "2026-12-01", "2027-01-01"]) assert.equal(eligible(date), true, date);
    assert.equal(eligibleForClassDate(periods, "other", type, "student-a", "2026-10-01"), false);
    assert.equal(eligibleForClassDate(periods, "class-a", type, "other", "2026-10-01"), false);
    assert.equal(eligibleForClassDate(periods, "class-a", type === "profile" ? "young_learner" : "profile", "student-a", "2026-10-01"), false);
  });
}

test("calendar dates reject normalization and use Madrid across UTC midnight and DST", () => {
  for (const date of [null, "", "2026-02-29", "2026-04-31", "2026-10-01T00:00:00Z", "1 October"]) assert.equal(isEnrolmentDate(date), false);
  assert.equal(isEnrolmentDate("2028-02-29"), true);
  assert.equal(madridEnrolmentDate(new Date("2026-09-30T22:30:00Z")), "2026-10-01");
  assert.equal(madridEnrolmentDate(new Date("2026-01-31T23:30:00Z")), "2026-02-01");
  assert.equal(madridEnrolmentDate(new Date("2026-10-25T00:30:00Z")), "2026-10-25");
});

const sql = readFileSync(new URL("../supabase/migrations/20260909130000_class_enrolment_periods.sql", import.meta.url), "utf8");
const uuid = n => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

// Execute the actual draft and selected historical definitions in disposable
// PostgreSQL. Fixtures cover the dependency paths under test, not a complete
// Supabase/Auth/PostgREST installation or multi-connection concurrency.
test("enrolment SQL foundation in disposable PostgreSQL", { skip: !process.env.STAFF_TIME_PGLITE }, async t => {
  const require = createRequire(import.meta.url);
  const root = process.env.STAFF_TIME_PGLITE;
  const { PGlite } = require(root);
  const { btree_gist } = require(`${root}/dist/contrib/btree_gist.cjs`);
  const db = new PGlite({ extensions: { btree_gist } });
  t.after(() => db.close());
  await db.exec(`
    create schema extensions; create schema app_private; create schema auth;
    set search_path = public, extensions;
    create role service_role bypassrls; create role anon; create role authenticated;
    create table profiles (id uuid primary key, active boolean default true, role text default 'student');
    create function auth.role() returns text language sql as $$ select coalesce(nullif(current_setting('test.auth_role',true),''),'service_role') $$;
    create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('test.auth_id',true),'')::uuid $$;
    create function app_private.is_admin() returns boolean language sql as $$ select false $$;
    create table levels(id bigint primary key,name text);
    create table academic_years (id uuid primary key, start_date date, end_date date);
    create table classes (id uuid primary key, teacher_id uuid, is_cambridge boolean default true, course_type text default 'regular', academic_year_id uuid references academic_years, start_date date, end_date date,level_id bigint references levels);
    create function app_private.teacher_owns_class(p_class_id uuid) returns boolean language sql stable security definer set search_path=pg_catalog,pg_temp as $$ select exists(select 1 from public.classes where id=p_class_id and teacher_id=auth.uid()) $$;
    create table young_learners (id uuid primary key default gen_random_uuid(), class_id uuid references classes, active boolean default true,first_name text,last_name text,created_at timestamptz,updated_at timestamptz);
    create table class_enrolments (student_id uuid references profiles, class_id uuid references classes, enrolled_at date not null, active boolean default true,unique(student_id,class_id));
    create table young_learner_enrolments (young_learner_id uuid references young_learners, class_id uuid references classes, enrolled_at date not null,unique(young_learner_id,class_id));
    create table class_registers (id uuid primary key, class_id uuid references classes, lesson_date date, completed_at timestamptz);
    create table class_register_entries (id uuid primary key, register_id uuid references class_registers, student_type text, profile_student_id uuid references profiles, young_learner_id uuid references young_learners, attendance_status text);
    create table friday_exam_practice_sessions (id uuid primary key, session_date date);
    create table friday_tutorial_result_sheets (id uuid primary key, tutorial_session_id uuid references friday_exam_practice_sessions, class_id uuid references classes);
    create table friday_tutorial_results (id uuid primary key, result_sheet_id uuid references friday_tutorial_result_sheets, student_id uuid references profiles, attended boolean, percentage numeric);
    create table school_closures(start_date date,end_date date);
    create table results(id uuid primary key,student_id uuid references profiles,class_id uuid references classes,cambridge_exam_assignment_id uuid,result_type text,published_at timestamptz,exam_date date);
    create table mock_result_reviews(id uuid primary key,result_id uuid references results);
    create table unit_exam_results(id uuid primary key,young_learner_id uuid references young_learners,class_id uuid references classes,created_at timestamptz default now());
    create function public.is_school_closed(p_date date) returns boolean language sql as $$ select exists(select 1 from public.school_closures where p_date between start_date and end_date) $$;
    grant select on class_register_entries, class_registers, friday_tutorial_results, friday_tutorial_result_sheets, friday_exam_practice_sessions to service_role;
  `);
  const alertsSql = readFileSync(new URL("../supabase/migrations/20260902120000_create_attendance_alerts.sql", import.meta.url), "utf8");
  await db.exec(alertsSql.slice(alertsSql.indexOf("create table"), alertsSql.indexOf("create or replace function app_private.reconcile_attendance_alerts_for_student")));
  const rolloverSql = readFileSync(new URL("../supabase/migrations/20260809210000_create_academic_year_rollover.sql", import.meta.url), "utf8");
  await db.exec(rolloverSql.slice(rolloverSql.indexOf("create table"), rolloverSql.indexOf("create or replace function")));
  await db.query("insert into profiles(id) values ($1)", [uuid(1)]);
  await db.query("insert into classes(id) values ($1),($2)", [uuid(10), uuid(11)]);
  await db.query("insert into young_learners(id,class_id) values ($1,$2)", [uuid(2), uuid(10)]);
  await db.query("insert into class_enrolments(student_id,class_id,enrolled_at) values ($1,$2,'2026-10-01')", [uuid(1), uuid(10)]);
  await db.query("insert into young_learner_enrolments values ($1,$2,'2026-10-01')", [uuid(2), uuid(10)]);
  // Stored pre-enrolment absences must survive the migration unchanged.
  await db.query("insert into class_registers values ($1,$2,'2026-09-30',now())", [uuid(20), uuid(10)]);
  await db.query("insert into class_register_entries values ($1,$2,'profile',$3,null,'absent')", [uuid(30), uuid(20), uuid(1)]);
  for (const [n, date] of [[50, "2026-09-30"], [51, "2026-10-01"], [52, "2026-11-15"]]) {
    await db.query("insert into friday_exam_practice_sessions values($1,$2)", [uuid(n), date]);
    await db.query("insert into friday_tutorial_result_sheets values($1,$2,$3)", [uuid(n + 10), uuid(n), uuid(10)]);
    await db.query("insert into friday_tutorial_results values($1,$2,$3,true,75)", [uuid(n + 20), uuid(n + 10), uuid(1)]);
  }
  await db.exec("alter table class_registers add column scheduled_start_time time default '18:00'");
  await db.query("insert into attendance_alerts(alert_type,class_id,student_type,profile_student_id) values('consecutive_absence',$1,'profile',$2)", [uuid(10), uuid(1)]);
  await db.query("insert into attendance_alerts(alert_type,class_id,student_type,young_learner_id) values('low_attendance',$1,'young_learner',$2)", [uuid(10), uuid(2)]);
  await t.test("ambiguous legacy backfills fail and roll back the entire draft", async () => {
    const reject = async pattern => {
      await assert.rejects(db.exec(sql), pattern);
      await db.exec("rollback");
      assert.equal((await db.query("select to_regclass('public.class_enrolment_periods') as relation")).rows[0].relation, null);
      assert.equal((await db.query("select count(*)::int as n from attendance_alerts where condition_active")).rows[0].n, 2);
    };
    await db.exec("update profiles set active=false");
    await reject(/missing withdrawal dates/);
    await db.exec("update profiles set active=true; update class_enrolments set active=false");
    await reject(/missing withdrawal dates/);
    await db.exec("update class_enrolments set active=true");
    await db.query("update young_learners set class_id=$1", [uuid(11)]);
    await reject(/missing withdrawal dates/);
    await db.query("update young_learners set class_id=$1", [uuid(10)]);
    await db.query("insert into academic_years values($1,'2000-01-01','2100-12-31')", [uuid(998)]);
    await db.query("update classes set academic_year_id=$1", [uuid(998)]);
    await db.query("insert into class_enrolments(student_id,class_id,enrolled_at) values($1,$2,'2026-10-01')", [uuid(1), uuid(11)]);
    await reject(/Multiple legacy classes/);
    await db.query("delete from class_enrolments where class_id=$1", [uuid(11)]);
    await db.exec("update classes set academic_year_id=null; delete from academic_years");
    await db.query("insert into profiles(id) values($1)", [uuid(999)]);
    await db.query("insert into class_register_entries values($1,$2,'profile',$3,null,'absent')", [uuid(999), uuid(20), uuid(999)]);
    await reject(/no recoverable membership/);
    await db.query("delete from class_register_entries where id=$1", [uuid(999)]);
    await db.query("insert into friday_tutorial_results values($1,$2,$3,true,75)", [uuid(999), uuid(60), uuid(999)]);
    await reject(/Historical Friday results/);
    await db.query("delete from friday_tutorial_results where id=$1", [uuid(999)]);
    await db.query("delete from profiles where id=$1", [uuid(999)]);
  });
  await db.exec(sql);
  await db.exec("alter table class_registers drop column scheduled_start_time");
  await t.test("rollout resolves stale episodes for both student types without deleting history", async () => {
    assert.deepEqual((await db.query("select condition_active,resolved_at is not null as resolved from attendance_alerts order by student_type")).rows,
      [{ condition_active: false, resolved: true }, { condition_active: false, resolved: true }]);
  });
  await t.test("backfill preserves known dates without rewriting stale snapshots", async () => {
    const { rows } = await db.query("select starts_on::text,ends_before from class_enrolment_periods order by student_type");
    assert.deepEqual(rows, [{ starts_on: "2026-10-01", ends_before: null }, { starts_on: "2026-10-01", ends_before: null }]);
    assert.equal((await db.query("select attendance_status from class_register_entries")).rows[0].attendance_status, "absent");
    assert.equal((await db.query("select * from eligible_class_register_entries")).rows.length, 0);
  });
  await db.exec("update class_enrolment_periods set ends_before='2026-11-01'");
  await db.query("insert into class_enrolment_periods(class_id,student_type,profile_student_id,starts_on) values ($1,'profile',$2,'2026-12-01')", [uuid(10), uuid(1)]);
  await db.query("insert into class_enrolment_periods(class_id,student_type,young_learner_id,starts_on) values ($1,'young_learner',$2,'2026-12-01')", [uuid(10), uuid(2)]);
  for (const [type, id] of [["profile", 1], ["young_learner", 2]]) {
    await t.test(`${type}: SQL/TypeScript parity over historical periods and gaps`, async () => {
      const periods = [period(type), period(type, { starts_on: "2026-12-01", ends_before: null })];
      for (const date of ["2026-09-15", "2026-09-30", "2026-10-01", "2026-10-31", "2026-11-01", "2026-11-30", "2026-12-01"]) {
        const result = await db.query("select is_class_member_on($1,$2,$3,$4) as eligible", [uuid(10), type, uuid(id), date]);
        assert.equal(result.rows[0].eligible, eligibleForClassDate(periods, "class-a", type, "student-a", date), date);
      }
    });
  }
  await t.test("constraints reject overlap and invalid boundaries while allowing adjacent periods", async () => {
    const insert = (start, end) => db.query("insert into class_enrolment_periods(class_id,student_type,profile_student_id,starts_on,ends_before) values ($1,'profile',$2,$3,$4)", [uuid(10), uuid(1), start, end]);
    await assert.rejects(insert("2026-10-20", "2026-11-10"), e => e.code === "23P01");
    await assert.rejects(insert("2026-11-15", "2026-11-15"), e => e.code === "23514");
    await assert.rejects(insert("2026-11-15", "2026-11-14"), e => e.code === "23514");
    await insert("2026-09-01", "2026-10-01");
    await db.exec("delete from class_enrolment_periods where starts_on='2026-09-01'");
  });
  await t.test("view filters before aggregate and leaves unmarked out of denominator", async () => {
    for (const [n, date, status] of [[21, "2026-10-01", "present"], [22, "2026-10-02", "absent"], [23, "2026-10-03", null], [24, "2026-11-15", "absent"]]) {
      await db.query("insert into class_registers values ($1,$2,$3,now())", [uuid(n), uuid(10), date]);
      await db.query("insert into class_register_entries values ($1,$2,'profile',$3,null,$4)", [uuid(n + 10), uuid(n), uuid(1), status]);
    }
    const { rows } = await db.query("select count(*) filter(where attendance_status='present')::int as present,count(*) filter(where attendance_status='absent')::int as absent,count(*) filter(where attendance_status in ('present','absent'))::int as denominator from eligible_class_register_entries");
    assert.deepEqual(rows, [{ present: 1, absent: 1, denominator: 2 }]);
    assert.equal((await db.query("select * from class_register_entries")).rows.length, 5);
  });
  await t.test("Friday view excludes pre-enrolment and gap snapshots without changing scores", async () => {
    assert.deepEqual((await db.query("select percentage::int from eligible_friday_tutorial_results")).rows, [{ percentage: 75 }]);
    assert.equal((await db.query("select * from friday_tutorial_results")).rows.length, 3);
    await assert.rejects(db.query("update friday_tutorial_results set percentage=80 where id=$1", [uuid(70)]), e => e.code === "23514");
    await assert.rejects(db.query("update friday_tutorial_results set percentage=80 where id=$1", [uuid(72)]), e => e.code === "23514");
    await db.query("update friday_tutorial_results set percentage=80 where id=$1", [uuid(71)]);
  });
  await t.test("periods cannot be mutated by service or client roles; clients cannot read identities", async () => {
    for (const role of ["anon", "authenticated", "service_role"]) {
      await db.exec(`set role ${role}`);
      try {
        await assert.rejects(db.exec("update class_enrolment_periods set ends_before=null"), e => e.code === "42501");
        if (role !== "service_role") {
          await assert.rejects(db.exec("select * from class_enrolment_periods"), e => e.code === "42501");
          await assert.rejects(db.query("select is_class_member_on($1,'profile',$2,'2026-10-01')", [uuid(10), uuid(1)]), e => e.code === "42501");
        } else {
          assert.equal((await db.query("select * from eligible_class_register_entries")).rows.length, 3);
        }
      } finally { await db.exec("reset role"); }
    }
    const { rows } = await db.query("select p.prosecdef,p.proconfig,pg_get_userbyid(p.proowner) as owner from pg_proc p where p.oid='public.is_class_member_on(uuid,text,uuid,date)'::regprocedure");
    assert.equal(rows[0].prosecdef, true);
    assert.equal(rows[0].owner, "postgres");
    assert.deepEqual(rows[0].proconfig, ["search_path=pg_catalog, pg_temp"]);
  });
  await t.test("actual register RPCs reject stale saves and preserve eligible historical snapshots", async () => {
    await db.exec(`
      alter table class_registers alter column id set default gen_random_uuid();
      alter table class_registers add column scheduled_start_time time default '18:00';
      alter table class_registers add column scheduled_end_time time default '19:00';
      alter table class_registers add column created_by uuid;
      alter table class_registers add column completed_by uuid;
      alter table class_registers add unique(class_id,lesson_date,scheduled_start_time);
      alter table class_register_entries alter column id set default gen_random_uuid();
      alter table class_register_entries add column marked_at timestamptz;
      alter table class_register_entries add column marked_by uuid;
      update class_registers set lesson_date=lesson_date-interval '6 years';
      update class_enrolment_periods set starts_on=starts_on-interval '6 years',ends_before=ends_before-interval '6 years';
    `);
    await db.query("insert into profiles(id,role) values($1,'teacher'),($2,'student')", [uuid(3), uuid(4)]);
    await db.query("update classes set teacher_id=$1 where id=$2", [uuid(3), uuid(10)]);
    await db.query("insert into class_enrolment_periods(class_id,student_type,profile_student_id,starts_on) values($1,'profile',$2,'2020-12-01')", [uuid(10), uuid(4)]);
    await db.query("insert into class_register_entries(id,register_id,student_type,profile_student_id,attendance_status) values($1,$2,'profile',$3,'absent')", [uuid(90), uuid(21), uuid(4)]);
    const save = (items, complete = true, actor = uuid(3)) => db.query("select save_class_register_attendance($1,$2,$3,$4)", [actor, uuid(21), JSON.stringify(items), complete]);
    const marked = { entry_id: uuid(31), attendance_status: "present" };
    const stale = { entry_id: uuid(90), attendance_status: "present" };
    await assert.rejects(save([marked, stale]), /roster does not match/);
    await assert.rejects(save([stale]), /roster does not match/);
    await save([marked]);
    assert.equal((await db.query("select attendance_status from class_register_entries where id=$1", [uuid(90)])).rows[0].attendance_status, "absent");
    await assert.rejects(save([marked], false), /must remain complete/);
    await assert.rejects(save([{ ...marked, attendance_status: null }]), /Mark every student/);
    await assert.rejects(save([marked], true, uuid(1)), /Teacher access required/);
    const open = roster => db.query("select open_class_register($1,$2,'2020-10-04','18:00','19:00',$3)", [uuid(3), uuid(10), JSON.stringify(roster)]);
    await assert.rejects(open([{ student_type: "profile", profile_student_id: uuid(4), young_learner_id: null }]), /outside their enrolment period/);
    const opened = await open([{ student_type: "profile", profile_student_id: uuid(1), young_learner_id: null }]);
    assert.ok(opened.rows[0].open_class_register);
    const reopened = await open([]);
    assert.equal(reopened.rows[0].open_class_register, opened.rows[0].open_class_register);
    assert.equal((await db.query("select * from class_register_entries where register_id=$1", [opened.rows[0].open_class_register])).rows.length, 1);
  });
  await t.test("actual Admin RPC: transfer, withdrawal and re-enrolment preserve distinct periods", async () => {
    await db.query("insert into profiles(id,role) values($1,'admin'),($2,'student')", [uuid(6), uuid(7)]);
    await db.query("insert into academic_years values($1,'2000-01-01','2100-12-31')", [uuid(100)]);
    await db.query("update classes set academic_year_id=$1", [uuid(100)]);
    const manage = (action, classId, start, end = null, periodId = null, actor = uuid(6)) => db.query(
      "select manage_class_enrolment_period($1,'profile',$2,$3,$4,$5,$6,$7) as id",
      [actor, uuid(7), action, uuid(classId), start, end, periodId]
    );
    const first = (await manage("enrol", 10, "2020-10-01")).rows[0].id;
    await manage("withdraw", 10, "2020-10-01", "2020-10-20", first);
    const second = (await manage("enrol", 10, "2020-11-01")).rows[0].id;
    const third = (await manage("transfer", 11, "2020-11-10", null, second)).rows[0].id;
    const eligibility = async (classId, date) => (await db.query("select is_class_member_on($1,'profile',$2,$3) as eligible", [uuid(classId), uuid(7), date])).rows[0].eligible;
    assert.equal(await eligibility(10, "2020-10-01"), true);
    assert.equal(await eligibility(10, "2020-10-20"), false);
    assert.equal(await eligibility(10, "2020-10-31"), false);
    assert.equal(await eligibility(10, "2020-11-01"), true);
    assert.equal(await eligibility(10, "2020-11-10"), false);
    assert.equal(await eligibility(11, "2020-11-10"), true);
    assert.equal((await db.query("select * from class_enrolment_period_events where actor_id=$1", [uuid(6)])).rows.length, 5);
    // Seed a conflicting target; failure after closing the source must roll back.
    await assert.rejects(manage("enrol", 10, "2020-12-01"), e => e.code === "23P01");
    await db.query("insert into class_enrolment_periods(class_id,student_type,profile_student_id,starts_on) values($1,'profile',$2,'2020-12-01')", [uuid(10), uuid(7)]);
    const before = await db.query("select to_jsonb(p) as period from class_enrolment_periods p where id=$1", [third]);
    const auditBefore = (await db.query("select count(*) from class_enrolment_period_events")).rows[0].count;
    await assert.rejects(manage("transfer", 10, "2020-12-10", null, third), e => e.code === "23P01");
    assert.deepEqual((await db.query("select to_jsonb(p) as period from class_enrolment_periods p where id=$1", [third])).rows, before.rows);
    assert.equal((await db.query("select count(*) from class_enrolment_period_events")).rows[0].count, auditBefore);
    for (const actor of [uuid(1), uuid(3), uuid(999)]) {
      await assert.rejects(manage("enrol", 10, "2099-01-01", null, null, actor), e => e.code === "42501");
    }
    await db.exec("set test.auth_role='authenticated'");
    await assert.rejects(manage("enrol", 10, "2099-01-01"), e => e.code === "42501");
    await db.exec("reset test.auth_role");
    await assert.rejects(manage("enrol", 10, "1999-12-31"), e => e.code === "22023");
    await assert.rejects(manage("correct", 10, "2020-10-01", "2020-10-01", first), e => e.code === "22023");
  });
  await t.test("both serialized teacher-save/Admin-correction orderings exclude pre-enrolment attendance", async () => {
    // PGlite has one session: exercise both serialized outcomes, not lock contention.
    for (const type of ["profile", "young_learner"]) {
      for (const teacherFirst of [false, true]) {
        await db.exec("begin");
        try {
          await db.query("insert into classes(id,teacher_id,is_cambridge,academic_year_id) values($1,$2,$3,$4)", [uuid(700), uuid(3), type === "profile", uuid(100)]);
          if (type === "profile") await db.query("insert into profiles(id) values($1)", [uuid(701)]);
          else await db.query("insert into young_learners(id,class_id) values($1,$2)", [uuid(701), uuid(700)]);
          const manage = (action, start, periodId) => db.query("select manage_class_enrolment_period($1,$2,$3,$4,$5,$6,null,$7) as id", [uuid(6), type, uuid(701), action, uuid(700), start, periodId]);
          const periodId = (await manage("enrol", "2020-09-15", null)).rows[0].id;
          const roster = [{ student_type: type, profile_student_id: type === "profile" ? uuid(701) : null, young_learner_id: type === "young_learner" ? uuid(701) : null }];
          const registerId = (await db.query("select open_class_register($1,$2,'2020-09-30','18:00','19:00',$3) as id", [uuid(3), uuid(700), JSON.stringify(roster)])).rows[0].id;
          const loaded = (await db.query("select id from eligible_class_register_entries where register_id=$1", [registerId])).rows;
          assert.equal(loaded.length, 1);
          const payload = JSON.stringify([{ entry_id: loaded[0].id, attendance_status: "absent" }]);
          const save = () => db.query("select save_class_register_attendance($1,$2,$3,true)", [uuid(3), registerId, payload]);
          if (teacherFirst) await save();
          await manage("correct", "2020-10-01", periodId);
          await db.exec("savepoint stale_teacher_save");
          await assert.rejects(save(), /roster does not match/);
          await db.exec("rollback to savepoint stale_teacher_save");
          const totals = (await db.query("select count(*)::int as eligible,count(*) filter(where attendance_status='present')::int as present,count(*) filter(where attendance_status='absent')::int as absent,count(*) filter(where attendance_status in ('present','absent'))::int as denominator from eligible_class_register_entries where register_id=$1", [registerId])).rows[0];
          assert.deepEqual(totals, { eligible: 0, present: 0, absent: 0, denominator: 0 });
          assert.equal((await db.query("select attendance_status from class_register_entries where id=$1", [loaded[0].id])).rows[0].attendance_status, teacherFirst ? "absent" : null);
          assert.deepEqual((await db.query("select is_class_member_on($1,$2,$3,'2020-10-01') as eligible", [uuid(700), type, uuid(701)])).rows, [{ eligible: true }]);
        } finally { await db.exec("rollback"); }
      }
    }
  });
  await t.test("Young Learner creation is atomic and supports future transfer and re-enrolment", async () => {
    await db.query("insert into classes(id,is_cambridge,academic_year_id) values($1,false,$3),($2,false,$3)", [uuid(12), uuid(13), uuid(100)]);
    const create = students => db.query("select create_young_learner_enrolments($1,$2,'2099-01-01',$3) as count", [uuid(6), uuid(12), JSON.stringify(students)]);
    const before = (await db.query("select count(*) from young_learners")).rows[0].count;
    await assert.rejects(create([{ first_name: "Synthetic", last_name: "One" }, { first_name: "", last_name: "Invalid" }]), e => e.code === "22023");
    assert.equal((await db.query("select count(*) from young_learners")).rows[0].count, before);
    assert.equal((await create([{ first_name: "Synthetic", last_name: "One" }])).rows[0].count, 1);
    const learner = (await db.query("select id from young_learners where first_name='Synthetic'")).rows[0].id;
    assert.equal((await db.query("select class_id from current_young_learners where id=$1", [learner])).rows[0].class_id, null);
    const first = (await db.query("select id from class_enrolment_periods where student_id=$1", [learner])).rows[0].id;
    const manage = (action, classId, start, end, periodId) => db.query("select manage_class_enrolment_period($1,'young_learner',$2,$3,$4,$5,$6,$7) as id", [uuid(6), learner, action, uuid(classId), start, end, periodId]);
    const transferred = (await manage("transfer", 13, "2099-02-01", null, first)).rows[0].id;
    await manage("withdraw", 13, "2099-02-01", "2099-02-10", transferred);
    await manage("enrol", 12, "2099-03-01", null, null);
    for (const [classId, date, eligible] of [[12, "2099-01-01", true], [12, "2099-02-01", false], [13, "2099-02-01", true], [13, "2099-02-10", false], [12, "2099-02-28", false], [12, "2099-03-01", true]]) {
      assert.equal((await db.query("select is_class_member_on($1,'young_learner',$2,$3) as eligible", [uuid(classId), learner, date])).rows[0].eligible, eligible);
    }
  });
  await t.test("a future transfer leaves today's current-class view on the old class", async () => {
    await db.query("insert into profiles(id) values($1)", [uuid(8)]);
    const dates = (await db.query("select ((now() at time zone 'Europe/Madrid')::date-10)::text as start,((now() at time zone 'Europe/Madrid')::date+1)::text as transfer")).rows[0];
    const first = (await db.query("select manage_class_enrolment_period($1,'profile',$2,'enrol',$3,$4,null,null) as id", [uuid(6), uuid(8), uuid(10), dates.start])).rows[0].id;
    await db.query("select manage_class_enrolment_period($1,'profile',$2,'transfer',$3,$4,null,$5)", [uuid(6), uuid(8), uuid(11), dates.transfer, first]);
    assert.deepEqual((await db.query("select class_id from current_class_enrolments where student_id=$1", [uuid(8)])).rows, [{ class_id: uuid(10) }]);
    assert.equal((await db.query("select is_class_member_on($1,'profile',$2,$3) as eligible", [uuid(11), uuid(8), dates.transfer])).rows[0].eligible, true);
  });
  await t.test("actual alert calculation excludes stale absences and still respects closures", async () => {
    const alerts = async () => {
      await db.query("select app_private.reconcile_attendance_alerts_for_student($1,'profile',$2,null)", [uuid(10), uuid(1)]);
      return (await db.query("select exists(select 1 from attendance_alerts where class_id=$1 and profile_student_id=$2 and alert_type='consecutive_absence' and condition_active) as active", [uuid(10), uuid(1)])).rows[0].active;
    };
    assert.equal(await alerts(), false);
    await db.query("update class_register_entries set attendance_status='absent' where id=$1", [uuid(31)]);
    assert.equal(await alerts(), true);
    await db.exec("insert into school_closures values('2020-10-02','2020-10-02')");
    assert.equal(await alerts(), false);
    assert.equal((await db.query("select attendance_status from class_register_entries where id=$1", [uuid(34)])).rows[0].attendance_status, "absent");
  });
  await t.test("future cancellation is explicit, immutable, idempotent and excluded from eligibility", async () => {
    await db.query("insert into profiles(id) values($1)", [uuid(200)]);
    const call = (action, id = null) => db.query("select manage_class_enrolment_period($1,'profile',$2,$3,$4,'2099-10-01',null,$5) as id", [uuid(6), uuid(200), action, uuid(10), id]);
    const id = (await call("enrol")).rows[0].id;
    await call("cancel", id);
    await call("cancel", id);
    assert.equal((await db.query("select count(*)::int as n from class_enrolment_period_events where period_id=$1", [id])).rows[0].n, 2);
    assert.equal((await db.query("select is_class_member_on($1,'profile',$2,'2099-10-01') as eligible", [uuid(10), uuid(200)])).rows[0].eligible, false);
    assert.equal(eligibleForClassDate([period("profile", { cancelled_at: "2026-09-09T00:00:00Z" })], "class-a", "profile", "student-a", "2026-10-01"), false);
    await assert.rejects(call("correct", id), /cancelled period is immutable/);
    const next = (await call("enrol")).rows[0].id;
    assert.notEqual(next, id);
    assert.equal((await db.query("select count(*)::int as n from class_enrolment_periods where student_id=$1", [uuid(200)])).rows[0].n, 2);
    const old = (await db.query("select id,starts_on::text,ends_before::text,class_id from class_enrolment_periods where student_id=$1 order by starts_on limit 1", [uuid(7)])).rows[0];
    await assert.rejects(db.query("select manage_class_enrolment_period($1,'profile',$2,'cancel',$3,$4,$5,$6)", [uuid(6), uuid(7), old.class_id, old.starts_on, old.ends_before, old.id]), /Only a never-effective/);
  });
  await t.test("rollover applies once, revises by cancellation, and rolls back conflicting assignments", async () => {
    await db.exec("alter table academic_years add column status text default 'future'; insert into levels values(1,'B1'),(2,'B2')");
    await db.query("insert into academic_years(id,start_date,end_date,status) values($1,'2098-09-15','2099-06-30','current'),($2,'2099-09-15','2100-06-30','future')", [uuid(201), uuid(202)]);
    await db.query("insert into classes(id,academic_year_id,level_id) values($1,$4,1),($2,$5,2),($3,$5,2)", [uuid(203), uuid(204), uuid(205), uuid(201), uuid(202)]);
    await db.query("insert into profiles(id) values($1),($2)", [uuid(206), uuid(209)]);
    for (const student of [206, 209]) await db.query("select manage_class_enrolment_period($1,'profile',$2,'enrol',$3,'2098-09-15',null,null)", [uuid(6), uuid(student), uuid(203)]);
    await db.query("insert into academic_year_rollovers(id,source_academic_year_id,target_academic_year_id,created_by) values($1,$2,$3,$4)", [uuid(207), uuid(201), uuid(202), uuid(6)]);
    await db.query("insert into academic_year_rollover_students(id,rollover_id,student_type,profile_student_id,source_class_id,decision,target_class_id,suggested_level_id) values($1,$2,'profile',$3,$4,'promote',$5,2)", [uuid(208), uuid(207), uuid(206), uuid(203), uuid(204)]);
    const apply = () => db.query("select * from apply_academic_year_rollover($1,$2)", [uuid(207), uuid(6)]);
    const revise = (decision, target) => db.query("select save_academic_year_rollover_student_decision($1,$2,$3,null,$4)", [uuid(208), decision, target ? uuid(target) : null, uuid(6)]);
    const preview = () => db.query("select * from preview_academic_year_rollover_periods($1,$2)", [uuid(207), uuid(6)]);
    assert.equal((await preview()).rows[0].period_action, "create_period");
    assert.equal((await preview()).rows[0].conflict, null);
    assert.equal((await apply()).rows[0].newly_applied_count, 1);
    assert.equal((await apply()).rows[0].newly_applied_count, 0);
    assert.equal((await preview()).rows[0].period_action, "keep_applied");
    const first = (await db.query("select enrolment_period_id from academic_year_rollover_students where id=$1", [uuid(208)])).rows[0].enrolment_period_id;
    assert.equal((await db.query("select starts_on::text from class_enrolment_periods where id=$1", [first])).rows[0].starts_on, "2099-09-15");
    await revise("promote", 205);
    assert.equal((await db.query("select cancelled_at is not null as cancelled from class_enrolment_periods where id=$1", [first])).rows[0].cancelled, true);
    await apply();
    await revise("not_returning", null);
    await apply();
    assert.equal((await db.query("select count(*)::int as n from class_enrolment_periods where student_id=$1 and class_id in ($2,$3) and cancelled_at is null", [uuid(206), uuid(204), uuid(205)])).rows[0].n, 0);
    await revise("promote", 204);
    // A conflicting second row must undo the first row's new period and event.
    await db.query("select manage_class_enrolment_period($1,'profile',$2,'enrol',$3,'2099-09-15',null,null)", [uuid(6), uuid(209), uuid(205)]);
    await db.query("insert into academic_year_rollover_students(rollover_id,student_type,profile_student_id,source_class_id,decision,target_class_id,suggested_level_id) values($1,'profile',$2,$3,'promote',$4,2)", [uuid(207), uuid(209), uuid(203), uuid(204)]);
    const snapshot = async () => (await db.query("select (select jsonb_agg(to_jsonb(p) order by id) from class_enrolment_periods p) as periods,(select jsonb_agg(to_jsonb(e) order by id) from class_enrolment_period_events e) as events,(select jsonb_agg(to_jsonb(s) order by id) from academic_year_rollover_students s) as decisions,(select jsonb_agg(to_jsonb(c) order by student_id,class_id) from class_enrolments c) as legacy")).rows;
    const before = await snapshot();
    assert.match((await preview()).rows.find(row => row.decision_id !== uuid(208)).conflict, /overlaps/);
    await assert.rejects(apply(), e => e.code === "23P01");
    assert.deepEqual(await snapshot(), before);
    await assert.rejects(db.query("select * from apply_academic_year_rollover($1,$2)", [uuid(207), uuid(3)]), /Admin access required/);
    await assert.rejects(revise("promote", 203), /target class is not compatible/);
  });
  await t.test("set-based alert reconciliation creates missing episodes once and rolls back atomically", async () => {
    await db.exec("delete from school_closures");
    const rollout = () => db.exec("select app_private.reconcile_enrolment_alert_rollout()");
    await rollout();
    const snapshot = async () => (await db.query("select to_jsonb(a) as alert from attendance_alerts a order by id")).rows;
    const before = await snapshot();
    await rollout();
    assert.deepEqual(await snapshot(), before);
    assert.equal((await db.query("select count(*)::int as n from attendance_alerts where profile_student_id=$1 and condition_active", [uuid(1)])).rows[0].n, 1);
    await db.exec("begin; insert into school_closures values('2020-10-01','2020-10-31')");
    await rollout();
    assert.notDeepEqual(await snapshot(), before);
    await assert.rejects(db.exec("select 1/0"));
    await db.exec("rollback");
    assert.deepEqual(await snapshot(), before);
  });
  await t.test("Young Learner rollover and already-effective target revisions preserve period history", async () => {
    await db.query("insert into classes(id,is_cambridge,academic_year_id,level_id) values($1,false,$3,1),($2,false,$4,2)", [uuid(500), uuid(501), uuid(201), uuid(202)]);
    await db.query("insert into young_learners(id,class_id) values($1,$2)", [uuid(502), uuid(500)]);
    await db.query("select manage_class_enrolment_period($1,'young_learner',$2,'enrol',$3,'2098-09-15',null,null)", [uuid(6), uuid(502), uuid(500)]);
    await db.query("insert into academic_year_rollovers(id,source_academic_year_id,target_academic_year_id,created_by) values($1,$2,$3,$4) on conflict(source_academic_year_id,target_academic_year_id) do nothing", [uuid(503), uuid(201), uuid(202), uuid(6)]);
    // Use the same existing batch; isolate its previous forced-conflict row.
    await db.query("update academic_year_rollover_students set decision='decide_later',target_class_id=null where profile_student_id in ($1,$2)", [uuid(206), uuid(209)]);
    await db.query("insert into academic_year_rollover_students(id,rollover_id,student_type,young_learner_id,source_class_id,decision,target_class_id,suggested_level_id) values($1,$2,'young_learner',$3,$4,'promote',$5,2)", [uuid(504), uuid(207), uuid(502), uuid(500), uuid(501)]);
    assert.equal((await db.query("select * from apply_academic_year_rollover($1,$2)", [uuid(207), uuid(6)])).rows[0].newly_applied_count, 1);
    const linked = (await db.query("select enrolment_period_id from academic_year_rollover_students where id=$1", [uuid(504)])).rows[0].enrolment_period_id;
    assert.equal((await db.query("select is_class_member_on($1,'young_learner',$2,'2099-09-15') as eligible", [uuid(501), uuid(502)])).rows[0].eligible, true);
    await db.query("select save_academic_year_rollover_student_decision($1,'not_returning',null,null,$2)", [uuid(504), uuid(6)]);
    assert.equal((await db.query("select cancelled_at is not null as cancelled from class_enrolment_periods where id=$1", [linked])).rows[0].cancelled, true);
    // A source and target in the past exercise real effective dates, not just
    // the editable administrative 'future' status flag.
    await db.query("insert into academic_years(id,start_date,end_date,status) values($1,'2019-09-15','2020-06-30','archived'),($2,'2020-09-15','2021-06-30','future')", [uuid(510), uuid(511)]);
    await db.query("insert into classes(id,academic_year_id,level_id) values($1,$3,1),($2,$4,2)", [uuid(512), uuid(513), uuid(510), uuid(511)]);
    await db.query("insert into profiles(id) values($1)", [uuid(514)]);
    await db.query("select manage_class_enrolment_period($1,'profile',$2,'enrol',$3,'2019-09-15',null,null)", [uuid(6), uuid(514), uuid(512)]);
    await db.query("insert into academic_year_rollovers(id,source_academic_year_id,target_academic_year_id,created_by) values($1,$2,$3,$4)", [uuid(515), uuid(510), uuid(511), uuid(6)]);
    await db.query("insert into academic_year_rollover_students(id,rollover_id,student_type,profile_student_id,source_class_id,decision,target_class_id,suggested_level_id) values($1,$2,'profile',$3,$4,'promote',$5,2)", [uuid(516), uuid(515), uuid(514), uuid(512), uuid(513)]);
    assert.equal((await db.query("select * from apply_academic_year_rollover($1,$2)", [uuid(515), uuid(6)])).rows[0].newly_applied_count, 1);
    await assert.rejects(db.query("select save_academic_year_rollover_student_decision($1,'not_returning',null,null,$2)", [uuid(516), uuid(6)]), /Only a never-effective future period/);
    assert.equal((await db.query("select decision from academic_year_rollover_students where id=$1", [uuid(516)])).rows[0].decision, "promote");
  });
  await t.test("permanent deletion previews and atomic rollback cover both identities and class history", async () => {
    const purgeSql = readFileSync(new URL("../supabase/migrations/20260902220000_create_test_student_purge.sql", import.meta.url), "utf8");
    await db.exec(purgeSql.slice(purgeSql.indexOf("create or replace function"), purgeSql.indexOf("create or replace function app_private.get_test_student_purge_preview")));
    await db.exec(`
      create table auth.users(id uuid primary key);
      create table follow_up_documents(id uuid primary key,student_id uuid references profiles,young_learner_id uuid references young_learners,class_id uuid references classes);
      create table follow_up_entries(id uuid primary key,follow_up_document_id uuid references follow_up_documents);
      create table friday_tutorial_students(id uuid primary key,profile_student_id uuid references profiles,young_learner_id uuid references young_learners,class_id uuid references classes,follow_up_document_id uuid references follow_up_documents);
      create table friday_tutorial_session_students(id uuid primary key,tutorial_student_id uuid references friday_tutorial_students);
      create table friday_tutorial_reminder_reads(id uuid primary key,student_id uuid references profiles);
      create table student_homework_reads(id uuid primary key,student_id uuid references profiles);
      create table teacher_notes(id uuid primary key,student_id uuid references profiles,class_id uuid references classes);
      create table messages(id uuid primary key,sender_id uuid references profiles,receiver_id uuid references profiles);
      create table announcements(id uuid primary key,classes_id uuid references classes);
      create table announcement_reads(id uuid primary key,user_id uuid references profiles,announcement_id uuid references announcements);
      create table young_learner_notes(id uuid primary key,young_learner_id uuid references young_learners,class_id uuid references classes);
      create table young_learner_class_point_entries(id uuid primary key,young_learner_id uuid references young_learners,class_id uuid references classes);
      create table class_progress_entries(id uuid primary key,class_id uuid references classes);
      create table resources(id uuid primary key,class_id uuid references classes);
      create table course_plans(id uuid primary key,class_id uuid references classes);
      create table course_plan_days(id uuid primary key,course_plan_id uuid references course_plans);
      create table course_plan_exam_items(id uuid primary key,course_plan_day_id uuid references course_plan_days);
      create table course_plan_resources(id uuid primary key,course_plan_day_id uuid references course_plan_days,storage_path text);
      create table cambridge_exam_assignments(id uuid primary key,course_plan_class_id uuid references classes,course_plan_day_id uuid references course_plan_days);
      create table course_plan_homework_assignments(id uuid primary key,course_plan_exam_item_id uuid references course_plan_exam_items,cambridge_exam_assignment_id uuid references cambridge_exam_assignments);
      create table student_assignment_homework_reads(id uuid primary key,student_id uuid references profiles,cambridge_exam_assignment_id uuid references cambridge_exam_assignments);
      create function public.test_stop_delete() returns trigger language plpgsql as $$ begin raise exception 'forced final deletion failure'; end $$;
    `);
    const snapshot = async () => (await db.query("select (select jsonb_agg(to_jsonb(p) order by id) from class_enrolment_periods p) as periods,(select jsonb_agg(to_jsonb(e) order by id) from class_enrolment_period_events e) as events,(select jsonb_agg(to_jsonb(p) order by id) from profiles p) as profiles,(select jsonb_agg(to_jsonb(y) order by id) from young_learners y) as learners,(select jsonb_agg(to_jsonb(u) order by id) from auth.users u) as users,(select jsonb_agg(to_jsonb(c) order by student_id,class_id) from class_enrolments c) as legacy")).rows;
    for (const [type, student, classroom, table] of [["profile", 300, 10, "profiles"], ["young_learner", 301, 12, "young_learners"]]) {
      if (type === "profile") {
        await db.query("insert into profiles(id) values($1)", [uuid(student)]);
        await db.query("insert into auth.users values($1)", [uuid(student)]);
      } else await db.query("insert into young_learners(id,class_id) values($1,$2)", [uuid(student), uuid(classroom)]);
      await db.query("select manage_class_enrolment_period($1,$2,$3,'enrol',$4,'2020-10-01','2020-11-01',null)", [uuid(6), type, uuid(student), uuid(classroom)]);
      const preview = (await db.query("select app_private.get_test_student_purge_preview($1,$2) as data", [type === "profile" ? [uuid(student)] : [], type === "young_learner" ? [uuid(student)] : []])).rows[0].data;
      assert.equal(preview.dependencies.class_enrolment_periods, 1);
      assert.equal(preview.dependencies.class_enrolment_period_events, 1);
      const purge = confirmation => db.query("select purge_test_students($1,$2) as data", [JSON.stringify([{ student_type: type, student_id: uuid(student) }]), confirmation]);
      await assert.rejects(purge(""), /confirmation value must be DELETE/);
      const before = await snapshot();
      await db.exec(`create trigger test_stop before delete on ${table} for each row execute function test_stop_delete()`);
      await assert.rejects(purge("DELETE"), /forced final deletion failure/);
      assert.deepEqual(await snapshot(), before);
      await db.exec(`drop trigger test_stop on ${table}`);
      assert.deepEqual((await purge("DELETE")).rows[0].data, { ...preview, success: true });
      assert.equal((await db.query("select count(*)::int as n from class_enrolment_periods where student_id=$1", [uuid(student)])).rows[0].n, 0);
      assert.equal((await db.query(`select count(*)::int as n from ${table} where id=$1`, [uuid(student)])).rows[0].n, 0);
      // Other identities and their history remain untouched.
      assert.equal((await db.query("select count(*)::int as n from profiles where id=$1", [uuid(1)])).rows[0].n, 1);
    }
    await db.query("insert into classes(id,is_cambridge,academic_year_id) values($1,false,$2)", [uuid(302), uuid(100)]);
    await db.query("insert into young_learners(id,class_id) values($1,$2)", [uuid(303), uuid(302)]);
    await db.query("select manage_class_enrolment_period($1,'young_learner',$2,'enrol',$3,'2020-10-01','2020-11-01',null)", [uuid(6), uuid(303), uuid(302)]);
    const preview = (await db.query("select app_private.get_test_class_purge_preview($1) as data", [uuid(302)])).rows[0].data;
    assert.equal(preview.can_purge, true);
    assert.equal(preview.dependencies.class_enrolment_periods, 1);
    assert.equal(preview.dependencies.class_enrolment_period_events, 1);
    const before = await snapshot();
    await db.exec("create trigger test_stop before delete on classes for each row execute function test_stop_delete()");
    await assert.rejects(db.query("select purge_test_class($1,'DELETE')", [uuid(302)]), /forced final deletion failure/);
    assert.deepEqual(await snapshot(), before);
    await db.exec("drop trigger test_stop on classes");
    assert.deepEqual((await db.query("select purge_test_class($1,'DELETE') as data", [uuid(302)])).rows[0].data, { ...preview, success: true });
    assert.deepEqual((await db.query("select class_id from young_learners where id=$1", [uuid(303)])).rows, [{ class_id: null }]);
    for (const role of ["anon", "authenticated"]) {
      await db.exec(`set role ${role}`);
      try { await assert.rejects(db.query("select purge_test_class($1,'DELETE')", [uuid(10)]), e => e.code === "42501"); }
      finally { await db.exec("reset role"); }
    }
  });
  await t.test("actual whole-sheet Friday RPC rejects pre-enrolment and stale submissions without changing scores", async () => {
    await db.exec(`
      alter table friday_exam_practice_sessions add column active boolean default true;
      alter table friday_exam_practice_sessions add column level_name text default 'B1';
      alter table friday_tutorial_result_sheets alter column id set default gen_random_uuid();
      alter table friday_tutorial_result_sheets add column submitted_by uuid references profiles;
      alter table friday_tutorial_result_sheets add column updated_by uuid references profiles;
      alter table friday_tutorial_result_sheets add column updated_at timestamptz;
      alter table friday_tutorial_results alter column id set default gen_random_uuid();
      alter table friday_tutorial_results add column updated_at timestamptz;
      alter table friday_tutorial_results add constraint friday_tutorial_results_sheet_student_key unique(result_sheet_id,student_id);
    `);
    await db.query("insert into classes(id,teacher_id,academic_year_id,level_id) values($1,$2,$3,1)", [uuid(310), uuid(3), uuid(100)]);
    await db.query("insert into profiles(id) values($1),($2)", [uuid(311), uuid(312)]);
    for (const student of [311, 312]) await db.query("select manage_class_enrolment_period($1,'profile',$2,'enrol',$3,'2020-10-01',null,null)", [uuid(6), uuid(student), uuid(310)]);
    for (const [session, date] of [[313, "2020-09-30"], [314, "2020-10-01"]]) await db.query("insert into friday_exam_practice_sessions(id,session_date) values($1,$2)", [uuid(session), date]);
    const save = (session, rows, actor = uuid(3)) => db.query("select * from save_friday_tutorial_result_sheet($1,$2,$3,$4)", [actor, uuid(session), uuid(310), JSON.stringify(rows)]);
    const rows = [{ student_id: uuid(311), percentage: 80 }, { student_id: uuid(312), percentage: null }];
    await assert.rejects(save(313, rows), /no_eligible_students/);
    await assert.rejects(save(314, rows, uuid(1)), /unauthorized/);
    const first = (await save(314, rows)).rows[0];
    assert.equal(first.attended_count, 1);
    assert.equal(first.absent_count, 1);
    const latePeriod = (await db.query("select id from class_enrolment_periods where student_id=$1", [uuid(312)])).rows[0].id;
    await db.query("select manage_class_enrolment_period($1,'profile',$2,'correct',$3,'2020-10-10',null,$4)", [uuid(6), uuid(312), uuid(310), latePeriod]);
    await assert.rejects(save(314, rows), /submitted_student_count_mismatch/);
    assert.equal((await save(314, [rows[0]])).rows[0].created_or_updated_count, 1);
    assert.deepEqual((await db.query("select percentage::int,attended from eligible_friday_tutorial_results where result_sheet_id=$1", [first.result_sheet_id])).rows, [{ percentage: 80, attended: true }]);
    assert.equal((await db.query("select count(*)::int as n from friday_tutorial_results where result_sheet_id=$1", [first.result_sheet_id])).rows[0].n, 2);
    await assert.rejects(db.query("update friday_tutorial_results set percentage=50 where result_sheet_id=$1 and student_id=$2", [first.result_sheet_id, uuid(312)]), e => e.code === "23514");
  });
  await t.test("RLS dependency chain scopes current views and direct Homework mutations", async () => {
    await db.exec(`
      create or replace function app_private.is_admin() returns boolean language sql stable security definer set search_path=pg_catalog,pg_temp as $$ select exists(select 1 from public.profiles where id=auth.uid() and role='admin') $$;
      alter table profiles enable row level security;
      alter table classes enable row level security;
      alter table young_learners enable row level security;
      alter table results enable row level security;
      grant usage on schema auth,app_private to authenticated;
      grant select on profiles,classes,young_learners,levels to authenticated;
      grant select,insert,update,delete on results to authenticated;
      create policy profiles_select_allowed on profiles for select to authenticated using(app_private.is_admin() or id=auth.uid() or (role='student' and app_private.teacher_teaches_student(id)) or (role='teacher' and app_private.student_can_access_teacher(id)));
      create policy classes_select_allowed on classes for select to authenticated using(app_private.is_admin() or app_private.teacher_owns_class(id) or app_private.student_in_class(id));
      create policy results_select_allowed on results for select to authenticated using(app_private.is_admin() or app_private.teacher_owns_class(class_id) or (student_id=auth.uid() and (result_type is distinct from 'mock' or published_at is not null)));
    `);
    await db.query("select set_config('test.auth_id',$1,false)", [uuid(8)]);
    await db.exec("set role authenticated");
    try {
      assert.deepEqual((await db.query("select class_id from current_class_enrolments")).rows, [{ class_id: uuid(10) }]);
      assert.deepEqual((await db.query("select id from classes")).rows, [{ id: uuid(10) }]);
      assert.equal((await db.query("select count(*)::int as n from current_young_learners")).rows[0].n, 0);
      await assert.rejects(db.exec("select * from class_enrolment_period_events"), e => e.code === "42501");
      await assert.rejects(db.exec("select * from eligible_class_register_entries"), e => e.code === "42501");
    } finally { await db.exec("reset role"); }
    await db.query("select set_config('test.auth_id',$1,false)", [uuid(3)]);
    await db.exec("set role authenticated");
    try {
      await db.query("insert into results(id,student_id,class_id,result_type) values($1,$2,$3,'homework')", [uuid(400), uuid(8), uuid(10)]);
      await assert.rejects(db.query("insert into results(id,student_id,class_id,result_type) values($1,$2,$3,'homework')", [uuid(401), uuid(206), uuid(10)]), e => e.code === "42501");
      await assert.rejects(db.query("update results set student_id=$1 where id=$2", [uuid(206), uuid(400)]), e => e.code === "42501");
      await assert.rejects(db.exec("update class_enrolment_periods set cancelled_at=null"), e => e.code === "42501");
    } finally { await db.exec("reset role; reset test.auth_id"); }
    const names = ["manage_class_enrolment_period", "create_young_learner_enrolments", "apply_academic_year_rollover", "save_academic_year_rollover_student_decision", "preview_academic_year_rollover_periods", "purge_test_students", "purge_test_class"];
    const functions = (await db.query("select p.proname,p.prosecdef,p.proconfig,pg_get_userbyid(p.proowner) as owner,has_function_privilege('anon',p.oid,'execute') as anon,has_function_privilege('authenticated',p.oid,'execute') as authenticated,has_function_privilege('service_role',p.oid,'execute') as service from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=any($1::text[])", [names])).rows;
    assert.equal(functions.length, names.length);
    for (const fn of functions) {
      assert.equal(fn.prosecdef, true, fn.proname);
      assert.equal(fn.owner, "postgres", fn.proname);
      assert.deepEqual(fn.proconfig, ["search_path=pg_catalog, pg_temp"], fn.proname);
      assert.equal(fn.anon, false, fn.proname);
      assert.equal(fn.authenticated, false, fn.proname);
      assert.equal(fn.service, true, fn.proname);
    }
    await db.exec("set enable_seqscan=off");
    const plan = await db.query("explain (format json) select 1 from class_enrolment_periods where class_id=$1 and student_type='profile' and student_id=$2 and cancelled_at is null and starts_on<='2020-10-01' and (ends_before is null or ends_before>'2020-10-01')", [uuid(10), uuid(1)]);
    assert.match(JSON.stringify(plan.rows), /Index/);
    await db.exec("reset enable_seqscan");
  });
  await t.test("rollout preserves the 15-record minimum and below-70 rule for both student types", async () => {
    for (const [type, n] of [["profile", 600], ["young_learner", 650]]) {
      await db.query("insert into classes(id,is_cambridge,academic_year_id) values($1,$2,$3)", [uuid(n), type === "profile", uuid(100)]);
      if (type === "profile") await db.query("insert into profiles(id) values($1)", [uuid(n + 1)]);
      else await db.query("insert into young_learners(id,class_id) values($1,$2)", [uuid(n + 1), uuid(n)]);
      await db.query("select manage_class_enrolment_period($1,$2,$3,'enrol',$4,'2020-10-01',null,null)", [uuid(6), type, uuid(n + 1), uuid(n)]);
      for (let day = 1; day <= 14; day++) {
        await db.query("insert into class_registers(id,class_id,lesson_date,completed_at) values($1,$2,$3,now())", [uuid(n + 10 + day), uuid(n), `2020-10-${String(day).padStart(2, "0")}`]);
        await db.query("insert into class_register_entries(id,register_id,student_type,profile_student_id,young_learner_id,attendance_status) values($1,$2,$3,$4,$5,'absent')", [uuid(n + 30 + day), uuid(n + 10 + day), type, type === "profile" ? uuid(n + 1) : null, type === "young_learner" ? uuid(n + 1) : null]);
      }
      const low = async () => {
        await db.exec("select app_private.reconcile_enrolment_alert_rollout()");
        return (await db.query("select exists(select 1 from attendance_alerts where class_id=$1 and alert_type='low_attendance' and condition_active) as active", [uuid(n)])).rows[0].active;
      };
      assert.equal(await low(), false);
      await db.query("insert into class_registers(id,class_id,lesson_date,completed_at) values($1,$2,'2020-10-15',now())", [uuid(n + 25), uuid(n)]);
      await db.query("insert into class_register_entries(id,register_id,student_type,profile_student_id,young_learner_id,attendance_status) values($1,$2,$3,$4,$5,'present')", [uuid(n + 45), uuid(n + 25), type, type === "profile" ? uuid(n + 1) : null, type === "young_learner" ? uuid(n + 1) : null]);
      assert.equal(await low(), true);
      // Ten of fifteen is below 70; eleven of fifteen is above it.
      for (let day = 1; day <= 9; day++) await db.query("update class_register_entries set attendance_status='present' where id=$1", [uuid(n + 30 + day)]);
      assert.equal(await low(), true);
      await db.query("update class_register_entries set attendance_status='present' where id=$1", [uuid(n + 40)]);
      assert.equal(await low(), false);
      assert.ok((await db.query("select count(*)::int as n from attendance_alerts where class_id=$1 and alert_type='low_attendance' and not condition_active", [uuid(n)])).rows[0].n > 0);
    }
  });
});
