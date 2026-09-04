import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const repositoryRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const testBuildDirectory = mkdtempSync(join(tmpdir(), "teacher-resource-test-"));
const validationSource = readFileSync(
  join(repositoryRoot, "lib", "teacherResourceValidation.ts"),
  "utf8"
);
const compiledValidation = ts.transpileModule(validationSource, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
    esModuleInterop: true,
  },
  fileName: "teacherResourceValidation.ts",
});
writeFileSync(
  join(testBuildDirectory, "teacherResourceValidation.js"),
  compiledValidation.outputText
);

const require = createRequire(import.meta.url);
const {
  isAdminManagedTeacherResourceScope,
  isTeacherResourceScope,
  teacherResourceScopeRequiresLevel,
  validateTeacherResourceLevelForScope,
} = require(join(testBuildDirectory, "teacherResourceValidation.js"));

test.after(() => rmSync(testBuildDirectory, { recursive: true }));

test("general_teacher is a valid Admin-managed teacher resource scope", () => {
  assert.equal(isTeacherResourceScope("general_teacher"), true);
  assert.equal(isAdminManagedTeacherResourceScope("general_teacher"), true);
  assert.equal(isAdminManagedTeacherResourceScope("shared_teacher"), false);
  assert.equal(isTeacherResourceScope("student_resource"), false);
});

test("general teacher resources require a null level", () => {
  assert.equal(teacherResourceScopeRequiresLevel("general_teacher"), false);
  assert.deepEqual(
    validateTeacherResourceLevelForScope("general_teacher", null),
    { value: null, error: "" }
  );
  assert.deepEqual(
    validateTeacherResourceLevelForScope("general_teacher", ""),
    { value: null, error: "" }
  );
  assert.match(
    validateTeacherResourceLevelForScope("general_teacher", "12").error,
    /cannot be assigned to a level/i
  );
});

test("every non-general scope still requires a valid level", () => {
  for (const scope of [
    "official_teacher",
    "shared_teacher",
    "cambridge_student",
  ]) {
    assert.equal(teacherResourceScopeRequiresLevel(scope), true);
    assert.match(
      validateTeacherResourceLevelForScope(scope, null).error,
      /valid class level is required/i
    );
    assert.deepEqual(validateTeacherResourceLevelForScope(scope, "42"), {
      value: 42,
      error: "",
    });
  }
});

test("Teacher and Student listing routes keep their resource scopes separate", () => {
  const teacherRoute = readFileSync(
    join(repositoryRoot, "app", "api", "teacher", "resources", "route.ts"),
    "utf8"
  );
  const studentRoute = readFileSync(
    join(repositoryRoot, "app", "api", "student", "resources", "route.ts"),
    "utf8"
  );
  const resourceLibrary = readFileSync(
    join(repositoryRoot, "lib", "teacherResources.ts"),
    "utf8"
  );

  assert.match(
    teacherRoute,
    /\.eq\("resource_scope", "general_teacher"\)/
  );
  assert.match(teacherRoute, /\.is\("level_id", null\)/);
  assert.doesNotMatch(teacherRoute, /\.eq\("resource_scope", "official_teacher"\)/);
  assert.match(
    studentRoute,
    /\.eq\("resource_scope", "cambridge_student"\)/
  );
  assert.doesNotMatch(studentRoute, /general_teacher/);
  assert.match(
    resourceLibrary,
    /getTeacherResourcesForLevel\(levelId, "official_teacher"\)/
  );
  assert.match(
    resourceLibrary,
    /getTeacherResourcesForLevel\(levelId, "shared_teacher"\)/
  );
});

test("migration permits null levels only for general teacher resources", () => {
  const migration = readFileSync(
    join(
      repositoryRoot,
      "supabase",
      "migrations",
      "20260904180000_add_general_teacher_resources.sql"
    ),
    "utf8"
  );

  assert.match(migration, /alter column level_id drop not null/i);
  assert.match(
    migration,
    /resource_scope = 'general_teacher'\s+and level_id is null/i
  );
  assert.match(
    migration,
    /resource_scope in \(\s*'shared_teacher',\s*'official_teacher',\s*'cambridge_student'\s*\)\s+and level_id is not null/i
  );
  assert.match(migration, /app_private\.is_teacher\(\)/i);
  assert.doesNotMatch(migration, /app_private\.is_student\(\)/i);
});
