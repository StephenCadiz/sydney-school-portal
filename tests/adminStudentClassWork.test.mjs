import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const page = read("app/admin/student-information/page.tsx");
const component = read("app/components/admin/AdminStudentClassWork.tsx");
const route = read("app/api/admin/student-information/class-work/route.ts");
const server = read("lib/adminClassWorkServer.ts");
const migration = read("supabase/migrations/20260806120000_create_class_progress.sql");
const styles = read("app/globals.css");

test("Admin student information exposes Class Work for Cambridge and Young Learners", () => {
  assert.match(page, /id: "class-work", label: "Class Work"/g);
  assert.match(page, /activeSection === "class-work"/);
  assert.match(page, /<AdminStudentClassWork/);
});

test("Class Work reuses teacher-entered class progress fields and newest-first history", () => {
  assert.match(migration, /create table public\.class_progress_entries/);
  for (const field of ["pupils_book_page", "activity_book_page", "homework", "extra_activities", "completed_at"]) {
    assert.match(server, new RegExp(field));
    assert.match(component, new RegExp(field));
  }
  assert.match(server, /order\("lesson_date", \{ ascending: false \}\)/);
  assert.match(server, /order\("scheduled_start_time", \{ ascending: false \}\)/);
  assert.match(component, /Latest class work/);
  assert.match(component, /Previous class work/);
});

test("Class Work API is Admin-only, scoped to the student, and uncached", () => {
  assert.match(route, /requireExamBankAdmin/);
  assert.match(route, /studentType/);
  assert.match(route, /studentId/);
  assert.match(route, /Cache-Control.*no-store/);
  assert.match(server, /\.eq\("student_type", studentType\)/);
  assert.match(server, /\.eq\("student_id", studentId\)/);
  assert.match(server, /\.is\("cancelled_at", null\)/);
  assert.match(server, /periodIncludesLesson/);
});

test("Class Work supports loading, error, empty, and mobile-safe states", () => {
  assert.match(component, /Loading class work/);
  assert.match(component, /role="alert"/);
  assert.match(component, /No class-work has been recorded/);
  assert.match(styles, /\.admin-student-class-work[\s\S]*min-width: 0/);
  assert.match(styles, /overflow-wrap: anywhere/);
  assert.match(styles, /@media \(max-width: 600px\)[\s\S]*admin-student-class-work-heading/);
});
