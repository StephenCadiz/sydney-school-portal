import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const { NextRequest } = require("next/server");
const root = fileURLToPath(new URL("../", import.meta.url));
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

// Real handlers, NextRequest/Response and role-checking helpers; only the Auth
// provider and database transport are synthetic. This is not browser E2E or a
// running Supabase integration test. Import interception prevents all networking.
function fixture() {
  const rows = {
    profiles: [
      { id: id(1), role: "student" }, { id: id(2), role: "teacher" },
      { id: id(3), role: "admin" }, { id: id(4), role: "staff" },
    ],
    classes: [{ id: id(10), teacher_id: id(20), is_cambridge: true, level_id: 1 }],
    levels: [{ id: 1, name: "B1" }],
  };
  const calls = [];
  const query = table => {
    let result = [...(rows[table] || [])];
    let single = false;
    const q = {
      select() { calls.push({ table, operation: "select" }); return q; },
      eq(key, value) { result = result.filter(row => row[key] === value); return q; },
      is(key, value) { result = result.filter(row => (row[key] ?? null) === value); return q; },
      not(key, operator, value) { assert.equal(operator, "is"); result = result.filter(row => (row[key] ?? null) !== value); return q; },
      lte(key, value) { result = result.filter(row => row[key] <= value); return q; },
      gte(key, value) { result = result.filter(row => row[key] >= value); return q; },
      in(key, values) { result = result.filter(row => values.includes(row[key])); return q; },
      order() { return q; }, limit(n) { result = result.slice(0, n); return q; },
      single() { single = true; return q; }, maybeSingle() { single = true; return q; },
      then(yes, no) { return Promise.resolve({ data: single ? result[0] || null : result, error: null }).then(yes, no); },
    };
    return q;
  };
  const supabaseAdmin = {
    auth: { async getUser(token) {
      const user = rows.profiles.find(row => `synthetic-${row.role}` === token);
      return { data: { user: user ? { id: user.id } : null }, error: null };
    } },
    from: query,
    async rpc(name, args) { calls.push({ name, args }); return { data: id(100), error: null }; },
  };
  const cache = new Map();
  function load(path) {
    const filename = resolve(root, path);
    if (cache.has(filename)) return cache.get(filename).exports;
    const loadedModule = { exports: {} };
    cache.set(filename, loadedModule);
    const code = ts.transpileModule(readFileSync(filename, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    }).outputText;
    const imports = spec => {
      if (spec === "server-only") return {};
      if (!spec.startsWith(".")) return require(spec);
      const path = resolve(dirname(filename), spec);
      if (path === resolve(root, "lib/supabaseAdmin")) return { supabaseAdmin };
      if (path === resolve(root, "lib/supabase")) return { supabase: new Proxy({}, { get() { throw new Error("Unexpected browser database access"); } }) };
      return load(existsSync(path) ? path : `${path}.ts`);
    };
    new Function("require", "module", "exports", code)(imports, loadedModule, loadedModule.exports);
    return loadedModule.exports;
  }
  const request = (path, role, body) => new NextRequest(`http://localhost${path}`, {
    method: body ? "POST" : "GET",
    headers: { ...(role ? { Authorization: `Bearer synthetic-${role}` } : {}), "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { load, calls, rows, request };
}

test("Admin enrolment HTTP handlers reject every non-Admin and supply the verified actor", async () => {
  const f = fixture();
  const route = f.load("app/api/admin/class-enrolments/route.ts");
  const body = { student_type: "profile", student_id: id(1), class_id: id(10), action: "enrol", starts_on: "2026-10-01", ends_before: null, period_id: null };
  for (const [role, status] of [[null, 401], ["invalid", 401], ["student", 403], ["teacher", 403], ["staff", 403]]) {
    assert.equal((await route.POST(f.request("/api/admin/class-enrolments", role, body))).status, status);
    assert.equal((await route.GET(f.request(`/api/admin/class-enrolments?student_type=profile&student_id=${id(1)}`, role))).status, status);
  }
  assert.equal(f.calls.filter(call => call.name).length, 0);
  assert.equal((await route.POST(f.request("/api/admin/class-enrolments", "admin", { ...body, p_actor_id: id(3) }))).status, 400);
  assert.equal((await route.POST(f.request("/api/admin/class-enrolments", "admin", { ...body, starts_on: "2026-02-30" }))).status, 400);
  assert.equal((await route.POST(f.request("/api/admin/class-enrolments", "admin", body))).status, 200);
  assert.deepEqual(f.calls.find(call => call.name)?.args, {
    p_actor_id: id(3), p_student_type: "profile", p_student_id: id(1), p_action: "enrol", p_class_id: id(10),
    p_starts_on: "2026-10-01", p_ends_before: null, p_period_id: null,
  });
});

test("ordinary student deletion authenticates before a single atomic RPC", async () => {
  const f = fixture();
  const route = f.load("app/api/admin/students/delete/route.ts");
  const body = { student_id: id(1), student_type: "cambridge" };
  for (const [role, status] of [[null, 401], ["teacher", 403], ["student", 403], ["staff", 403]]) {
    assert.equal((await route.POST(f.request("/api/admin/students/delete", role, body))).status, status);
  }
  assert.equal(f.calls.filter(call => call.name).length, 0);
  assert.equal((await route.POST(f.request("/api/admin/students/delete", "admin", body))).status, 200);
  assert.deepEqual(f.calls.filter(call => call.name), [{ name: "purge_test_students", args: {
    p_students: [{ student_type: "profile", student_id: id(1) }], p_confirmation: "DELETE",
  } }]);
});

test("Teacher Progress HTTP handler enforces role, class ownership and period membership", async () => {
  const f = fixture();
  const route = f.load("app/api/teacher/student-progress/route.ts");
  const path = `/api/teacher/student-progress?class_id=${id(10)}&student_id=${id(1)}`;
  for (const [role, status] of [[null, 401], ["student", 403], ["staff", 403], ["teacher", 403]]) {
    assert.equal((await route.GET(f.request(path, role))).status, status);
  }
  f.rows.classes[0].teacher_id = id(2);
  assert.equal((await route.GET(f.request(path, "teacher"))).status, 403);
  assert.ok(f.calls.some(call => call.table === "class_enrolment_periods"));
  assert.ok(!f.calls.some(call => call.table === "results"));
});

test("Friday Progress HTTP handler prevents cross-student reads and uses eligible results", async () => {
  const f = fixture();
  const route = f.load("app/api/friday-tutorial-progress/route.ts");
  const path = `/api/friday-tutorial-progress?student_id=${id(1)}`;
  for (const [role, status] of [[null, 401], ["teacher", 403], ["staff", 403]]) {
    assert.equal((await route.GET(f.request(path, role))).status, status);
  }
  assert.equal((await route.GET(f.request(`/api/friday-tutorial-progress?student_id=${id(99)}`, "student"))).status, 403);
  assert.equal((await route.GET(f.request(path, "student"))).status, 404);
  assert.ok(f.calls.some(call => call.table === "current_class_enrolments"));
  assert.equal((await route.GET(f.request(path, "admin"))).status, 200);
  assert.ok(f.calls.some(call => call.table === "eligible_friday_tutorial_results"));
  assert.ok(!f.calls.some(call => call.table === "friday_tutorial_results"));
});

test("shared attendance and Admin class/level/overall consumers aggregate the filtered view", async () => {
  const f = fixture();
  f.rows.classes[0] = { ...f.rows.classes[0], academic_year_id: id(30), start_date: "2020-09-15", end_date: "2021-06-30", course_type: "regular" };
  f.rows.academic_years = [{ id: id(30), label: "Synthetic year", start_date: "2020-09-15", end_date: "2021-06-30", status: "current" }];
  f.rows.class_enrolment_periods = [{ class_id: id(10), student_type: "profile", student_id: id(1), profile_student_id: id(1), starts_on: "2020-10-01", ends_before: null, cancelled_at: null }];
  f.rows.class_registers = ["2020-09-30", "2020-10-01", "2020-10-02", "2020-10-03"].map((date, n) => ({ id: id(40 + n), class_id: id(10), lesson_date: date, scheduled_start_time: "18:00", scheduled_end_time: "19:00", completed_at: "2020-10-04T00:00:00Z" }));
  f.rows.class_register_entries = ["absent", "present", "absent", null].map((status, n) => ({ id: id(50 + n), register_id: id(40 + n), student_type: "profile", profile_student_id: id(1), attendance_status: status }));
  // SQL filtering itself is tested by executing the migration in classEnrolment.test.
  // Here its response is the transport fixture for the real aggregation consumers.
  f.rows.eligible_class_register_entries = f.rows.class_register_entries.slice(1);
  const summary = { present_count: 1, absent_count: 1, completed_register_count: 2, attendance_percentage: 50 };
  const shared = f.load("lib/classRegisterServer.ts");
  assert.deepEqual(await shared.getStudentClassAttendanceSummary(id(10), "profile", id(1)), summary);
  const admin = f.load("lib/adminAttendanceServer.ts");
  const overview = await admin.getAdminAttendanceOverview(id(30));
  for (const value of [overview.summary, overview.classes[0], overview.levels[0]]) {
    for (const [key, expected] of Object.entries(summary)) assert.equal(value[key], expected, key);
  }
  const classroom = await admin.getAdminAttendanceClassDetails(id(10));
  for (const [key, expected] of Object.entries(summary)) assert.equal(classroom.students[0][key], expected, key);
  assert.ok(!f.calls.some(call => call.table === "class_register_entries"));
});
