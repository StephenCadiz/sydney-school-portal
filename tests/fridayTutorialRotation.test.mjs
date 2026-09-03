import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const repositoryRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const testBuildDirectory = mkdtempSync(join(tmpdir(), "friday-rotation-test-"));
for (const sourceName of ["schoolClosures", "fridayTutorialRotation"]) {
  const source = readFileSync(
    join(repositoryRoot, "lib", `${sourceName}.ts`),
    "utf8"
  );
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
    fileName: `${sourceName}.ts`,
  });
  writeFileSync(join(testBuildDirectory, `${sourceName}.js`), compiled.outputText);
}
const require = createRequire(import.meta.url);
const {
  FRIDAY_TUTORIAL_SESSION_TYPES,
  assignEffectiveFridayTutorialDutyDates,
  buildFridayTutorialReconciliationPlan,
  calculateFridayTutorialCalendar,
  calculateUpcomingFridayTutorials,
  getFridayTutorialSessionTypeForDate,
  isB1FridayTutorialSession,
} = require(join(testBuildDirectory, "fridayTutorialRotation.js"));

test.after(() => rmSync(testBuildDirectory, { recursive: true }));

const A = FRIDAY_TUTORIAL_SESSION_TYPES.KIDS_2_TO_JUNIOR_3;
const B = FRIDAY_TUTORIAL_SESSION_TYPES.JUNIOR_4_TEENS_1_B1;
const settings = {
  first_friday_date: "2026-09-04",
  first_session_type: A,
};

function closure(startDate, endDate = startDate, name = "School closed") {
  return {
    id: `${startDate}:${endDate}`,
    name,
    closure_type: "school_holiday",
    start_date: startDate,
    end_date: endDate,
  };
}

function groups(dates, closures = []) {
  return dates.map((date) =>
    getFridayTutorialSessionTypeForDate(settings, date, closures)
  );
}

test("calendar Fridays alternate A/B when there are no closures", () => {
  assert.deepEqual(
    groups([
      "2026-09-04",
      "2026-09-11",
      "2026-09-18",
      "2026-09-25",
      "2026-10-02",
    ]),
    [A, B, A, B, A]
  );
});

test("a closed B Friday pauses rather than consumes the rotation", () => {
  const closures = [closure("2026-09-25", "2026-09-25", "Free Day")];
  assert.deepEqual(
    groups(
      [
        "2026-09-04",
        "2026-09-11",
        "2026-09-18",
        "2026-09-25",
        "2026-10-02",
        "2026-10-09",
      ],
      closures
    ),
    [A, B, A, null, B, A]
  );
});

test("consecutive closures keep the same group pending", () => {
  const closures = [closure("2026-09-25", "2026-10-02")];
  assert.deepEqual(
    groups(
      ["2026-09-18", "2026-09-25", "2026-10-02", "2026-10-09", "2026-10-16"],
      closures
    ),
    [A, null, null, B, A]
  );
});

test("a closed series start leaves slot one for the next open Friday", () => {
  const closures = [closure("2026-09-04")];
  assert.deepEqual(
    groups(["2026-09-04", "2026-09-11", "2026-09-18"], closures),
    [null, A, B]
  );
});

test("open-Friday lists omit closure dates without skipping their group", () => {
  const entries = calculateUpcomingFridayTutorials(settings, 5, [
    closure("2026-09-25"),
  ]);
  assert.deepEqual(
    entries.map((entry) => [entry.session_date, entry.tutorial_group]),
    [
      ["2026-09-04", A],
      ["2026-09-11", B],
      ["2026-09-18", A],
      ["2026-10-02", B],
      ["2026-10-09", A],
    ]
  );
});

test("calendar preview marks the closure and exposes its name", () => {
  const entries = calculateFridayTutorialCalendar(settings, 5, [
    closure("2026-09-25", "2026-09-25", "Free Day"),
  ]);
  assert.equal(entries[3].school_closed, true);
  assert.equal(entries[3].tutorial_group, null);
  assert.equal(entries[3].closure?.name, "Free Day");
  assert.equal(entries[4].tutorial_group, B);
});

test("B1 duty follows the shifted Friday B", () => {
  const closures = [closure("2026-09-25")];
  assert.equal(
    isB1FridayTutorialSession(
      getFridayTutorialSessionTypeForDate(settings, "2026-09-25", closures)
    ),
    false
  );
  assert.equal(
    isB1FridayTutorialSession(
      getFridayTutorialSessionTypeForDate(settings, "2026-10-02", closures)
    ),
    true
  );
});

test("general and B1 duty assignments defer to open Fridays in order", () => {
  const duties = [
    { id: "a", session_date: "2026-09-18", active: true, teacher_id: "one" },
    {
      id: "b",
      session_date: "2026-09-25",
      active: true,
      teacher_id: "two",
      b1_teacher_id: "b1-two",
    },
    { id: "c", session_date: "2026-10-02", active: true, teacher_id: "three" },
  ];
  const shifted = assignEffectiveFridayTutorialDutyDates(
    settings,
    [closure("2026-09-25")],
    duties
  );
  assert.deepEqual(
    shifted.map((duty) => [duty.id, duty.effective_session_date]),
    [
      ["a", "2026-09-18"],
      ["b", "2026-10-02"],
      ["c", "2026-10-09"],
    ]
  );
  assert.equal(shifted[1].b1_teacher_id, "b1-two");
  assert.equal(
    getFridayTutorialSessionTypeForDate(
      settings,
      shifted[1].effective_session_date,
      [closure("2026-09-25")]
    ),
    B
  );
});

test("removing a future closure restores original duty dates", () => {
  const duties = [
    { id: "b", session_date: "2026-09-25", active: true },
    { id: "c", session_date: "2026-10-02", active: true },
  ];
  const restored = assignEffectiveFridayTutorialDutyDates(settings, [], duties);
  assert.deepEqual(
    restored.map((duty) => duty.effective_session_date),
    ["2026-09-25", "2026-10-02"]
  );
});

test("historical duties before the configured series do not shift future duties", () => {
  const duties = [
    { id: "historical", session_date: "2026-08-28", active: true },
    { id: "series-start", session_date: "2026-09-04", active: true },
  ];
  const assigned = assignEffectiveFridayTutorialDutyDates(settings, [], duties);
  assert.deepEqual(
    assigned.map((duty) => [duty.id, duty.effective_session_date]),
    [
      ["historical", "2026-08-28"],
      ["series-start", "2026-09-04"],
    ]
  );
});

test("dates before the configured start and non-series dates are ineligible", () => {
  assert.equal(
    getFridayTutorialSessionTypeForDate(settings, "2026-08-28", []),
    null
  );
  assert.equal(
    getFridayTutorialSessionTypeForDate(settings, "2026-09-05", []),
    null
  );
});

test("future uncompleted sessions are removed or regrouped after a closure", () => {
  const plan = buildFridayTutorialReconciliationPlan(
    settings,
    [closure("2026-09-25")],
    [
      { id: "closed", session_date: "2026-09-25", tutorial_group: B },
      { id: "shifted", session_date: "2026-10-02", tutorial_group: A },
    ],
    new Set(),
    "2026-09-03"
  );
  assert.deepEqual(plan.actions, [
    { action: "delete", id: "closed", session_date: "2026-09-25" },
    {
      action: "update",
      id: "shifted",
      session_date: "2026-10-02",
      tutorial_group: B,
    },
  ]);
});

test("past and attendance-bearing sessions remain historical truth", () => {
  const plan = buildFridayTutorialReconciliationPlan(
    settings,
    [closure("2026-09-25")],
    [
      { id: "past", session_date: "2026-09-18", tutorial_group: B },
      { id: "completed", session_date: "2026-10-02", tutorial_group: A },
    ],
    new Set(["completed"]),
    "2026-09-20"
  );
  assert.deepEqual(plan.actions, []);
  assert.deepEqual(plan.preservedSessionIds, ["past", "completed"]);
});

test("removing a future closure restores the original future sequence", () => {
  assert.equal(
    getFridayTutorialSessionTypeForDate(
      settings,
      "2026-10-02",
      [closure("2026-09-25")]
    ),
    B
  );
  assert.equal(
    getFridayTutorialSessionTypeForDate(settings, "2026-10-02", []),
    A
  );
});
