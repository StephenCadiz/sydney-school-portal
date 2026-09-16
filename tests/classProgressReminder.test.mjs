import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");

const reminder = read("app/components/teacher/TeacherClassProgressReminder.tsx");
const progressTab = read("app/teacher/class/ClassProgressTab.tsx");
const remindersRoute = read("app/api/teacher/class-progress/reminders/route.ts");
const progressRoute = read("app/api/teacher/classes/[id]/class-progress/route.ts");

test("one reminder is keyed by its class and scheduled lesson", () => {
  assert.match(reminder, /function reminderKey\(reminder: ClassProgressReminder\)/);
  assert.match(reminder, /return `\$\{reminder\.class_id\}:\$\{reminder\.lesson_date\}:\$\{reminder\.scheduled_start_time\}`/);
  assert.match(reminder, /nextReminders\.find\(\(reminder\) => !isDismissed\(reminder\)\)/);
});

test("Complete now is idempotent and hides the trigger before navigation", () => {
  assert.match(reminder, /const openingReminderKeyRef = useRef<string \| null>\(null\)/);
  assert.match(reminder, /if \(openingReminderKeyRef\.current\) return;/);
  assert.match(reminder, /openingReminderKeyRef\.current = reminderKey\(reminder\);/);
  assert.match(reminder, /openingReminderKeyRef\.current = reminderKey\(reminder\);[\s\S]*setActiveReminder\(null\);[\s\S]*router\.push/);
});

test("background refreshes cannot reopen a reminder while its form is active", () => {
  assert.match(reminder, /const requestIdRef = useRef\(0\)/);
  assert.match(reminder, /const requestId = requestIdRef\.current \+ 1/);
  assert.match(reminder, /if \(requestId !== requestIdRef\.current\) return;/);
  assert.match(reminder, /const openingKey = openingReminderKeyRef\.current;[\s\S]*setActiveReminder\(null\);[\s\S]*return;/);
  assert.match(reminder, /pathname !== "\/teacher\/class"/);
});

test("dismissing a reminder closes the surface without replacing it immediately", () => {
  assert.match(reminder, /dismiss\(activeReminder\);[\s\S]*setActiveReminder\(null\);/);
  assert.doesNotMatch(
    reminder,
    /dismiss\(activeReminder\);[\s\S]*reminders\.find\([\s\S]*setActiveReminder/
  );
});

test("progress saves are single-submit, retryable, and notify the reminder", () => {
  assert.match(progressTab, /const \[saving, setSaving\] = useState\(false\)/);
  assert.match(progressTab, /setSaving\(true\)/);
  assert.match(progressTab, /<button type="submit" disabled=\{saving\}>/);
  assert.match(progressTab, /\{saving\s*\n\s*\? "Saving\.\.\."/);
  assert.match(progressTab, /if \(!response\.ok\) \{[\s\S]*throw new Error/);
  assert.match(progressTab, /window\.dispatchEvent\(new Event\("teacher-class-progress-updated"\)\)/);
  assert.match(progressTab, /finally \{[\s\S]*setSaving\(false\)/);
});

test("reminder and progress APIs preserve authenticated teacher authorization", () => {
  assert.match(remindersRoute, /loadClassProgressReminders\(request\)/);
  assert.match(progressRoute, /getClassProgressContext\(request, id\)/);
  assert.match(progressRoute, /parseClassProgressInput/);
  assert.match(reminder, /cache: "no-store"/);
});

test("save failures leave the existing form available", () => {
  assert.match(progressTab, /catch \(saveError: any\)/);
  assert.match(progressTab, /setError\(saveError\?\.message \|\| "Unable to save Class Progress\."\)/);
  assert.match(progressTab, /setForm\(formFromEntry\(selectedLesson\.entry\)\)/);
});
