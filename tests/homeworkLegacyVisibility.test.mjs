import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");
const homework = read("lib/homework.ts");
const teacherLoader = read("lib/teacherHomeworkServer.ts");
const studentLoader = read("lib/studentHomeworkServer.ts");
const studentProgressRoute = read("app/api/student/progress/route.ts");
const adminPage = read("app/admin/homework/page.tsx");

const legacyId = "38ce8640-edb0-4c53-8d4e-9ce13b87bfd0";

test("the identified B2 legacy row is suppressed by database ID", () => {
  assert.match(homework, new RegExp(legacyId));
  assert.match(homework, /isSuppressedLegacyHomework/);
  assert.doesNotMatch(homework, /Reading and Use of English Week 1/);
});

test("Teacher and Student homework views filter the same legacy source", () => {
  assert.match(teacherLoader, /\.filter\(\(row\) => !isSuppressedLegacyHomework\(row\)\)/);
  assert.match(studentLoader, /\.filter\(\(row\) => !isSuppressedLegacyHomework\(row\)\)/);
  assert.match(studentProgressRoute, /isSuppressedLegacyHomework/);
  assert.match(homework, /\.filter\(\(item\) => !isSuppressedLegacyHomework\(item\)\)/);
});

test("valid homework and Admin legacy management remain available", () => {
  assert.match(teacherLoader, /cambridge_exam_assignments/);
  assert.match(studentLoader, /cambridge_exam_assignments/);
  assert.match(adminPage, /getAllHomework\(\)/);
  assert.match(adminPage, /Legacy Cambridge Homework/);
  assert.doesNotMatch(adminPage, /isSuppressedLegacyHomework/);
});

test("the suppression does not alter authorization or class scoping", () => {
  assert.match(teacherLoader, /authorizeTeacherHomeworkClass/);
  assert.match(teacherLoader, /You can only access homework for your own classes/);
  assert.match(studentLoader, /authenticateStudentHomework/);
  assert.match(studentLoader, /resolveStudentHomeworkContext/);
});

test("legacy suppression is not date-only and does not affect unrelated levels", () => {
  assert.match(homework, /suppressedLegacyHomeworkIds/);
  assert.match(teacherLoader, /\.eq\("level", context\.level\)/);
  assert.match(studentLoader, /\.eq\("level", context\.level\)/);
});
