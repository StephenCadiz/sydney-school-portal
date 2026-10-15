import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const component = read("app/teacher/class/AssignmentHomeworkResultsSection.tsx");
const styles = read("app/globals.css");

test("Teacher homework grading opens in an accessible modal instead of a bottom form", () => {
  assert.match(component, /assignment-homework-result-modal-backdrop/);
  assert.match(component, /role="dialog"/);
  assert.match(component, /aria-modal="true"/);
  assert.match(component, /aria-labelledby="assignment-homework-result-modal-title"/);
  assert.match(component, /Percentage/);
  assert.match(component, /Comments/);
  assert.match(component, /Save Result/);
  assert.match(component, /Cancel/);
  assert.doesNotMatch(component, /assignment-homework-result-form/);
});

test("Teacher homework grading modal closes from Escape, outside click, and close controls", () => {
  assert.match(component, /event\.key !== "Escape"/);
  assert.match(component, /event\.target === event\.currentTarget/);
  assert.match(component, /aria-label="Close homework result"/);
  assert.match(component, /document\.body\.style\.overflow = "hidden"/);
  assert.match(styles, /\.assignment-homework-result-modal-backdrop[\s\S]*backdrop-filter: blur/);
  assert.match(styles, /\.assignment-homework-result-modal[\s\S]*max-height/);
});
