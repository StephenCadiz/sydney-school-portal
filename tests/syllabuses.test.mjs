import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const repositoryRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const buildDirectory = mkdtempSync(join(tmpdir(), "syllabus-test-"));
const require = createRequire(import.meta.url);

for (const filename of ["academicYearRules.ts", "syllabusValidation.ts"]) {
  const source = readFileSync(join(repositoryRoot, "lib", filename), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
    fileName: filename,
  });
  writeFileSync(
    join(buildDirectory, filename.replace(/\.ts$/, ".js")),
    compiled.outputText
  );
}

const {
  classCanReceiveSyllabus,
  isSyllabusCourseTypeEligible,
  validateSyllabusCreateInput,
  validateSyllabusMaterialDetails,
  validateSyllabusMaterialType,
  validateSyllabusOrderedIds,
  validateSyllabusUnitInput,
} = require(join(buildDirectory, "syllabusValidation.js"));

test.after(() => rmSync(buildDirectory, { recursive: true }));

const migration = readFileSync(
  join(
    repositoryRoot,
    "supabase",
    "migrations",
    "20260906120000_create_syllabuses.sql"
  ),
  "utf8"
);
const teacherRoute = readFileSync(
  join(repositoryRoot, "app/api/teacher/classes/[id]/syllabus/route.ts"),
  "utf8"
);
const teacherOpenRoute = readFileSync(
  join(
    repositoryRoot,
    "app/api/teacher/classes/[id]/syllabus/materials/[materialId]/open/route.ts"
  ),
  "utf8"
);
const syllabusServer = readFileSync(
  join(repositoryRoot, "lib/syllabusServer.ts"),
  "utf8"
);
const classPage = readFileSync(
  join(repositoryRoot, "app/teacher/class/page.tsx"),
  "utf8"
);
const adminRoutes = [
  "app/api/admin/syllabuses/route.ts",
  "app/api/admin/syllabuses/[id]/route.ts",
  "app/api/admin/syllabuses/[id]/units/route.ts",
  "app/api/admin/syllabuses/[id]/units/[unitId]/route.ts",
  "app/api/admin/syllabuses/[id]/units/[unitId]/materials/route.ts",
  "app/api/admin/syllabuses/[id]/units/[unitId]/materials/[materialId]/route.ts",
].map((path) => readFileSync(join(repositoryRoot, path), "utf8"));

test("only one syllabus is allowed per academic year and level", () => {
  assert.match(
    migration,
    /unique\s*\(academic_year_id,\s*level_id\)/i
  );
  assert.doesNotMatch(migration, /unique\s*\(level_id\)/i);
  assert.match(
    readFileSync(join(repositoryRoot, "app/api/admin/syllabuses/route.ts"), "utf8"),
    /error\.code === "23505"/
  );
});

test("different academic years can store syllabuses for the same level", () => {
  const first = validateSyllabusCreateInput({
    academic_year_id: "00000000-0000-4000-8000-000000000001",
    level_id: 7,
    title: "First year",
  });
  const second = validateSyllabusCreateInput({
    academic_year_id: "00000000-0000-4000-8000-000000000002",
    level_id: 7,
    title: "Second year",
  });
  assert.equal(first.error, "");
  assert.equal(second.error, "");
  assert.notEqual(first.value.academicYearId, second.value.academicYearId);
});

test("course eligibility excludes Intensive and Express and permits normalized Regular and Online", () => {
  assert.equal(isSyllabusCourseTypeEligible("regular"), true);
  assert.equal(isSyllabusCourseTypeEligible(" Regular "), true);
  assert.equal(isSyllabusCourseTypeEligible("online"), true);
  assert.equal(isSyllabusCourseTypeEligible("intensive"), false);
  assert.equal(isSyllabusCourseTypeEligible("EXPRESS"), false);
  assert.equal(isSyllabusCourseTypeEligible(""), false);
});

test("eligible classes require their own valid academic year and level", () => {
  const base = {
    academicYearId: "00000000-0000-4000-8000-000000000001",
    levelId: 4,
    courseType: "regular",
  };
  assert.equal(classCanReceiveSyllabus(base), true);
  assert.equal(classCanReceiveSyllabus({ ...base, academicYearId: null }), false);
  assert.equal(classCanReceiveSyllabus({ ...base, levelId: null }), false);
  assert.equal(classCanReceiveSyllabus({ ...base, courseType: "express" }), false);
});

test("unit validation preserves pages text and rejects reversed exam weeks", () => {
  const valid = validateSyllabusUnitInput({
    title: "Introductions",
    pages_text: "Coursebook pages 12–25; Workbook pages 8–14",
    content_text: "Greetings\nIntroducing yourself",
    target_completion_date: "2026-10-09",
    exam_week_start_date: "2026-10-12",
    exam_week_end_date: "2026-10-16",
    exam_information: "Revise Units 1–2.",
  });
  assert.equal(valid.error, "");
  assert.equal(valid.value.pages_text.includes("Workbook"), true);

  const invalid = validateSyllabusUnitInput({
    ...valid.value,
    exam_week_start_date: "2026-10-16",
    exam_week_end_date: "2026-10-12",
  });
  assert.match(invalid.error, /cannot be before/i);
});

test("material validation rejects unsupported types, blank labels, and forged fields", () => {
  assert.match(validateSyllabusMaterialType("video").error, /file upload or external link/i);
  assert.match(
    validateSyllabusMaterialDetails({ label: "", description: "", external_url: "" }).error,
    /label is required/i
  );
  assert.match(
    validateSyllabusMaterialDetails({
      label: "Guide",
      description: "",
      external_url: "https://example.com",
      storage_path: "forged/private/path",
    }).error,
    /unsupported material fields/i
  );
  assert.match(migration, /syllabus_unit_materials_source_check/i);
  assert.match(migration, /material_type = 'link'[\s\S]*storage_path is null/i);
  assert.match(migration, /material_type = 'file'[\s\S]*external_url is null/i);
});

test("unit and material order is complete, unique, stable, and database constrained", () => {
  const ids = [
    "00000000-0000-4000-8000-000000000001",
    "00000000-0000-4000-8000-000000000002",
  ];
  assert.deepEqual(validateSyllabusOrderedIds(ids, "unit").value, ids);
  assert.match(validateSyllabusOrderedIds([ids[0], ids[0]], "unit").error, /valid unit order/i);
  assert.match(migration, /unique\s*\(syllabus_id,\s*sort_order\)/i);
  assert.match(migration, /unique\s*\(unit_id,\s*sort_order\)/i);
  assert.match(migration, /reorder_syllabus_units/i);
  assert.match(migration, /reorder_syllabus_materials/i);
  assert.match(
    migration,
    /reorder_syllabus_units\([\s\S]*p_actor_id uuid[\s\S]*from public\.syllabuses[\s\S]*for update/i
  );
  assert.match(
    migration,
    /reorder_syllabus_materials\([\s\S]*p_actor_id uuid[\s\S]*p_syllabus_id uuid[\s\S]*from public\.syllabus_units[\s\S]*syllabus_id = p_syllabus_id[\s\S]*for update/i
  );
  assert.equal(
    (migration.match(/where id = p_actor_id\s+and role = 'admin'/gi) || []).length,
    2
  );
  assert.match(adminRoutes[2], /p_actor_id: admin\.userId/);
  assert.match(adminRoutes[4], /p_actor_id: admin\.userId/);
  assert.match(adminRoutes[4], /p_syllabus_id: routeIds\.syllabusId/);
});

test("Teacher access is assigned-class only and derives year, level, and course type from classes", () => {
  assert.match(syllabusServer, /\.from\("classes"\)/);
  assert.match(syllabusServer, /teacher_id, academic_year_id, level_id, course_type/);
  assert.match(syllabusServer, /String\(classroom\.teacher_id \|\| ""\) !== profile\.userId/);
  assert.match(syllabusServer, /profile\.role !== "teacher"/);
  assert.match(syllabusServer, /isSyllabusCourseTypeEligible\(classroom\.course_type\)/);
  assert.doesNotMatch(teacherRoute, /searchParams|get\("level|academic_year_id.*request/i);
});

test("Teachers receive only published matching records and no private storage paths", () => {
  assert.match(teacherRoute, /\.eq\("academic_year_id", access\.context\.academicYearId\)/);
  assert.match(teacherRoute, /\.eq\("level_id", access\.context\.levelId\)/);
  assert.match(teacherRoute, /\.eq\("status", "published"\)/);
  assert.match(teacherRoute, /serializeSyllabus\(data, true\)/);
  assert.match(
    syllabusServer,
    /teacherView\s*\?\s*\{ has_private_file: Boolean\(material\.storage_path\) \}\s*:\s*\{\s*storage_path:/
  );
});

test("publishing records the Admin and timestamp while unpublishing clears publication state", () => {
  const detailRoute = adminRoutes[1];
  assert.match(detailRoute, /action === "publish"/);
  assert.match(
    detailRoute,
    /\.from\("syllabuses"\)[\s\S]*\.maybeSingle\(\)[\s\S]*if \(!syllabusResult\.data\)[\s\S]*404/
  );
  assert.match(detailRoute, /status: "published"/);
  assert.match(detailRoute, /published_by: admin\.userId/);
  assert.match(detailRoute, /published_at: new Date\(\)\.toISOString\(\)/);
  assert.match(detailRoute, /action === "unpublish"/);
  assert.match(detailRoute, /status: "draft"/);
  assert.match(detailRoute, /published_by: null/);
  assert.match(detailRoute, /published_at: null/);
  assert.match(migration, /syllabuses_publication_state_check/i);
});

test("secure material opening revalidates class, published syllabus, unit relationship, and material", () => {
  assert.match(teacherOpenRoute, /requireTeacherSyllabusClass\(request, classId\)/);
  assert.match(teacherOpenRoute, /\.eq\("status", "published"\)/);
  assert.match(teacherOpenRoute, /\.eq\("academic_year_id", access\.context\.academicYearId\)/);
  assert.match(teacherOpenRoute, /\.eq\("level_id", access\.context\.levelId\)/);
  assert.match(teacherOpenRoute, /\.eq\("unit\.syllabus_id", syllabus\.id\)/);
  assert.match(teacherOpenRoute, /\.createSignedUrl\(/);
  assert.match(teacherOpenRoute, /SYLLABUS_SIGNED_URL_SECONDS/);
});

test("Admin mutations require Admin auth and reject client ownership fields", () => {
  for (const route of adminRoutes) {
    assert.match(route, /requireSyllabusAdmin\(request\)/);
  }
  const createRoute = adminRoutes[0];
  assert.match(createRoute, /created_by: admin\.userId/);
  assert.match(createRoute, /updated_by: admin\.userId/);
  assert.doesNotMatch(createRoute, /created_by:\s*(body|validation\.value)\./);
  assert.match(
    readFileSync(join(repositoryRoot, "lib/syllabusValidation.ts"), "utf8"),
    /unsupported syllabus fields/
  );
});

test("RLS blocks direct anonymous, Student, and authenticated table access", () => {
  assert.match(migration, /alter table public\.syllabuses enable row level security/i);
  assert.match(migration, /alter table public\.syllabus_units enable row level security/i);
  assert.match(migration, /alter table public\.syllabus_unit_materials enable row level security/i);
  assert.match(migration, /revoke all on table public\.syllabuses from anon, authenticated/i);
  assert.doesNotMatch(migration, /create policy/i);
  assert.doesNotMatch(migration, /app_private\.is_student/i);
});

test("class workspace adds a read-only Syllabus tab only through eligibility", () => {
  assert.match(classPage, /const syllabusTab = \{ id: "syllabus", label: "Syllabus" \}/);
  assert.match(classPage, /actorRole === "teacher"[\s\S]*classCanReceiveSyllabus/);
  assert.match(classPage, /<SyllabusTab classId=\{String\(classData\.id\)\}/);
  const teacherComponent = readFileSync(
    join(repositoryRoot, "app/teacher/class/SyllabusTab.tsx"),
    "utf8"
  );
  assert.match(teacherComponent, /A syllabus has not been published for this class yet\./);
  assert.doesNotMatch(teacherComponent, /deleteSyllabus|updateSyllabus|createSyllabus/);
});

test("Admin UI includes filters, lifecycle actions, confirmations, and resilient states", () => {
  const adminPage = readFileSync(
    join(repositoryRoot, "app/admin/syllabuses/page.tsx"),
    "utf8"
  );
  assert.match(adminPage, /Academic year/);
  assert.match(adminPage, /All levels/);
  assert.match(adminPage, /Draft and Published/);
  assert.match(adminPage, /Unpublish this syllabus\?/);
  assert.match(adminPage, /Delete this published syllabus\?/);
  assert.match(adminPage, /Loading syllabuses/);
  assert.match(adminPage, /No syllabuses have been created yet/);
  assert.match(adminPage, /Try again/);
});

test("database-first deletion reports private storage cleanup failures accurately", () => {
  const deleteRoutes = `${adminRoutes[1]}\n${adminRoutes[3]}\n${adminRoutes[5]}`;
  assert.match(deleteRoutes, /storageCleanupFailed/);
  assert.match(deleteRoutes, /manual storage cleanup/);
  assert.match(deleteRoutes, /\.delete\(\)[\s\S]*\.remove\(/);
});
