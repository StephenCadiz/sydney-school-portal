import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const root = fileURLToPath(new URL("../", import.meta.url));
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

function loadPolicy() {
  const filename = resolve(root, "lib/adminAttendanceAlertPolicy.ts");
  const code = ts.transpileModule(read("lib/adminAttendanceAlertPolicy.ts"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const module = { exports: {} };
  new Function("module", "exports", code)(module, module.exports);
  return module.exports;
}

test("Kei is exempt by stable Young Learner ID while another student remains eligible", () => {
  const policy = loadPolicy();
  const alertRows = [
    {
      studentType: "young_learner",
      studentId: "f0521a4f-7343-473d-958f-74a8c6353d4d",
      alertType: "consecutive_absence",
    },
    {
      studentType: "young_learner",
      studentId: "00000000-0000-4000-8000-000000000999",
      alertType: "consecutive_absence",
    },
    {
      studentType: "young_learner",
      studentId: "f0521a4f-7343-473d-958f-74a8c6353d4d",
      alertType: "low_attendance",
    },
    {
      studentType: "young_learner",
      studentId: "00000000-0000-4000-8000-000000000999",
      alertType: "low_attendance",
    },
  ];
  const visibleRows = alertRows.filter(
    (row) => !policy.isAdminAttendanceAlertExempt(row.studentType, row.studentId)
  );
  assert.deepEqual(visibleRows.map((row) => row.alertType), [
    "consecutive_absence",
    "low_attendance",
  ]);
  assert.equal(
    policy.isAdminAttendanceAlertExempt(
      "young_learner",
      "f0521a4f-7343-473d-958f-74a8c6353d4d"
    ),
    true
  );
  assert.equal(
    policy.isAdminAttendanceAlertExempt(
      "young_learner",
      "00000000-0000-4000-8000-000000000999"
    ),
    false
  );
  assert.equal(
    policy.isAdminAttendanceAlertExempt(
      "profile",
      "f0521a4f-7343-473d-958f-74a8c6353d4d"
    ),
    false
  );
});

test("every Admin alert surface applies the server-side exemption", () => {
  const server = read("lib/adminAttendanceServer.ts");
  assert.match(server, /from "\.\/adminAttendanceAlertPolicy"/);
  assert.match(server, /loadAlerts[\s\S]*isAdminAttendanceAlertExempt/);
  assert.match(server, /getAdminAttendanceAlertCount[\s\S]*isAdminAttendanceAlertExempt/);
  assert.match(server, /buildAlertRows[\s\S]*isAdminAttendanceAlertExempt/);
  assert.match(server, /studentsBelow70[\s\S]*isAdminAttendanceAlertExempt/);
  assert.match(server, /alertResult\.data[\s\S]*isAdminAttendanceAlertExempt/);
  assert.match(read("lib/adminAttendanceAlertPolicy.ts"), /f0521a4f-7343-473d-958f-74a8c6353d4d/);
});

test("attendance records remain available to non-alert views", () => {
  const server = read("lib/adminAttendanceServer.ts");
  assert.match(server, /eligible_class_register_entries/);
  assert.match(server, /getAdminStudentAttendance/);
  assert.match(server, /getAdminAttendanceStudentDetails/);
  assert.doesNotMatch(server, /profile_student_id.*f0521a4f-7343-473d-958f-74a8c6353d4d/);
});
