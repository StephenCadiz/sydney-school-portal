import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const page = read("app/teacher/page.tsx");
const styles = read("app/globals.css");

test("Teacher notification cards render once at the top before work panels", () => {
  const feedStart = page.indexOf("teacher-dashboard-notification-feed");
  const primaryGrid = page.indexOf("teacher-dashboard-primary-grid");
  assert.ok(feedStart >= 0);
  assert.ok(primaryGrid > feedStart);
  assert.equal(page.split("<TeacherMessageNotifications").length - 1, 1);
  assert.equal(page.split("<FridayTutorialTeacherMaterialReminderCard").length - 1, 1);
  assert.equal(page.split("<FridayTutorialDutyReminderCard").length - 1, 1);
});

test("Notification feed keeps existing order and actions", () => {
  assert.ok(page.indexOf("<TeacherAnnouncementBanner") < page.indexOf("<TeacherMessageNotifications"));
  assert.ok(page.indexOf("<TeacherMessageNotifications") < page.indexOf("<FridayTutorialTeacherMaterialReminderCard"));
  assert.ok(page.indexOf("<FridayTutorialTeacherMaterialReminderCard") < page.indexOf("<FridayTutorialDutyReminderCard"));
  assert.match(page, /aria-label="Teacher notifications"/);
});

test("Top notification cards receive a restrained red attention accent", () => {
  assert.match(styles, /\.teacher-dashboard-notification-feed/);
  assert.match(styles, /border-left: 4px solid #dc2626/);
  assert.match(styles, /\.teacher-dashboard-notification-feed > \.teacher-dashboard-section h2/);
});
