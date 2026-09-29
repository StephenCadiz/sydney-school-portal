import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = (file) => fs.readFileSync(file, "utf8");
const migration = read("supabase/migrations/20260929170000_class_scoped_cambridge_resources.sql");
const uploadRoute = read("app/api/teacher/classes/[id]/resource-documents/route.ts");
const manageRoute = read("app/api/teacher/classes/[id]/resource-documents/[resourceId]/route.ts");
const studentRoute = read("app/api/student/resources/route.ts");
const classDocuments = read("app/teacher/class/ClassDocumentResources.tsx");
const classPage = read("app/teacher/class/ClassResourcesTab.tsx");

test("class-scoped private resource schema and storage policy are present", () => {
  assert.match(migration, /resource_scope.*cambridge_class/s);
  assert.match(migration, /add column if not exists class_id uuid references public\.classes/i);
  assert.match(migration, /'class-resources', 'class-resources', false, null, null/i);
  assert.match(migration, /No direct access to private class resources/i);
});

test("teacher/admin document upload is class-authorized and provider-limited", () => {
  assert.match(uploadRoute, /authorizeTeacherHomeworkClass/);
  assert.match(uploadRoute, /resource_scope: "cambridge_class"/);
  assert.match(uploadRoute, /classes\/\$\{classId\}/);
  assert.match(uploadRoute, /hasDangerousResourceFilename/);
  assert.doesNotMatch(uploadRoute, /TEACHER_RESOURCE_MAX_FILE_SIZE_BYTES/);
  assert.doesNotMatch(uploadRoute, /TEACHER_RESOURCE_ALLOWED_MIME_TYPES/);
  assert.match(manageRoute, /created_by.*context\.actorId/);
  assert.match(manageRoute, /method.*PATCH|export async function PATCH/);
});

test("teacher class UI supports drag/drop, picker, progress, retry states, and replacement", () => {
  assert.match(classDocuments, /onDrop=/);
  assert.match(classDocuments, /type="file"/);
  assert.match(classDocuments, /xhr\.upload\.onprogress/);
  assert.match(classDocuments, /Uploading/);
  assert.match(classDocuments, /Replace/);
  assert.match(classDocuments, /Delete/);
  assert.match(classPage, /ClassDocumentResources/);
});

test("student resources are class-scoped and files use signed URLs", () => {
  assert.match(studentRoute, /resource_scope.*cambridge_class/);
  assert.match(studentRoute, /\.eq\("class_id", classId\)/);
  assert.match(studentRoute, /classResourcesBucket/);
  assert.match(studentRoute, /createSignedUrl/);
  assert.match(studentRoute, /requires_signed_url/);
});

test("existing class links remain a separate read/write path", () => {
  assert.match(classPage, /\.from\("resources"\)/);
  assert.match(classPage, /Google Drive Link/);
  assert.match(classPage, /Class resource added/);
});
