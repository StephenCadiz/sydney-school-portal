import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");
const page = read("app/student/resources/page.tsx");
const styles = read("app/globals.css");
const resourcesRoute = read("app/api/student/resources/route.ts");

test("Student resources use structured source, content, metadata, and action areas", () => {
  assert.match(page, /student-resources-item-header/);
  assert.match(page, /student-resources-item-content/);
  assert.match(page, /student-resources-metadata/);
  assert.match(page, /student-resources-item-actions/);
  assert.match(page, /resourceTypeLabel/);
  assert.match(page, /Open Resource/);
});

test("official resources and private class documents retain their existing open behavior", () => {
  assert.match(page, /resource\.resource_url/);
  assert.match(page, /resource\.requires_signed_url/);
  assert.match(page, /handleOpenPrivateResource\(resource\)/);
  assert.match(resourcesRoute, /resource_scope.*cambridge_class/);
  assert.match(resourcesRoute, /resource_scope.*cambridge_student/);
  assert.match(resourcesRoute, /createSignedUrl/);
});

test("resource metadata wraps safely and actions have consistent placement", () => {
  assert.match(styles, /\.student-resources-item\s*\{[\s\S]*grid-template-areas:[\s\S]*"header actions"[\s\S]*"content actions"/);
  assert.match(styles, /\.student-resources-metadata\s*\{[\s\S]*flex-wrap:\s*wrap/);
  assert.match(styles, /\.student-resources-metadata span\s*\{[\s\S]*overflow-wrap:\s*anywhere/);
  assert.match(styles, /\.student-resources-item-actions\s*\{[\s\S]*grid-area:\s*actions/);
  assert.match(styles, /\.student-resources-action\s*\{[\s\S]*min-width:\s*148px/);
});

test("uploaded storage filenames and raw MIME strings are not rendered", () => {
  const metadataStart = page.indexOf("className=\"student-resources-metadata\"");
  const metadataEnd = page.indexOf("</div>", metadataStart);
  const metadata = page.slice(metadataStart, metadataEnd);

  assert.notEqual(metadataStart, -1);
  assert.notEqual(metadataEnd, -1);
  assert.doesNotMatch(metadata, /original_filename/);
  assert.doesNotMatch(metadata, /resource\.mime_type\}/);
  assert.match(page, /formatResourceFileType/);
  assert.match(page, /student-resources-action/);
  assert.match(page, /resource\.title \|\| "Learning resource"/);
  assert.match(page, /resource\.description/);
});

test("mobile resources stack metadata and actions without horizontal overflow", () => {
  assert.match(styles, /@media \(max-width: 768px\)[\s\S]*\.student-resources-item\s*\{[\s\S]*"header"[\s\S]*"content"[\s\S]*"actions"/);
  assert.match(styles, /@media \(max-width: 768px\)[\s\S]*\.student-resources-item-actions\s*\{[\s\S]*width:\s*100%/);
  assert.match(styles, /\.student-resources-page[\s\S]*min-width:\s*0/);
});
