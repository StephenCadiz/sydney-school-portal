import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");
const agenda = read("app/components/teacher/TeacherCalendarAgenda.tsx");
const calendar = read("lib/teacherCalendar.ts");
const route = read("app/api/teacher/calendar/closures/route.ts");
const styles = read("app/globals.css");

test("Teacher Dashboard reuses the Admin school_closures source through an authenticated no-store route", () => {
  assert.match(route, /loadSchoolClosures/);
  assert.match(route, /from "\.\.\/\.\.\/\.\.\/\.\.\/\.\.\/lib\/schoolClosuresServer"/);
  assert.match(route, /profile\?\.role !== "teacher"/);
  assert.match(route, /Cache-Control.*no-store/);
  assert.match(calendar, /fetch\("\/api\/teacher\/calendar\/closures"/);
  assert.match(calendar, /cache: "no-store"/);
  assert.doesNotMatch(route, /notes/);
});

test("Closure notices use Madrid dates, remain alongside normal events, and avoid duplicates", () => {
  assert.match(calendar, /getMadridSchoolDate/);
  assert.match(calendar, /closureAlreadyRepresented/);
  assert.match(calendar, /items: TeacherCalendarAgendaItem\[\] = \[\.\.\.events\]/);
  assert.match(calendar, /closure\.start_date === closure\.end_date/);
  assert.match(calendar, /Public holiday: \$\{closure\.name\}/);
  assert.match(calendar, /School closed from \$\{formatTeacherCalendarClosureDate\(closure\.start_date\)\} to \$\{formatTeacherCalendarClosureDate\(closure\.end_date\)\}/);
  assert.match(calendar, /Classes resume after the break/);
  assert.match(calendar, /nextOpenDateAfter/);
  assert.match(calendar, /is_closure_notice/);
});

test("Dashboard renders closure notices with accessible red styling without changing controls", () => {
  assert.match(agenda, /getUpcomingTeacherSchoolClosures/);
  assert.match(agenda, /mergeTeacherCalendarEventsWithClosures/);
  assert.match(agenda, /teacher-dashboard-event\$\{isClosure \? " is-closure"/);
  assert.match(agenda, /View future holidays and school closures/);
  assert.match(styles, /\.teacher-dashboard-event\.is-closure/);
  assert.match(styles, /border-left: 4px solid #b42318/);
  assert.match(styles, /\.teacher-dashboard-event\.is-closure \.teacher-dashboard-event-date[\s\S]*background: #f3f6fa/);
  assert.match(styles, /\.teacher-dashboard-event\.is-closure \.teacher-dashboard-event-date span[\s\S]*color: #b42318/);
  assert.match(styles, /overflow-wrap: anywhere/);
});

test("Closure notices are bounded to the existing three-item responsive agenda", () => {
  assert.match(agenda, /events\.slice\(0, 3\)/);
  assert.match(styles, /\.teacher-dashboard-event-list[\s\S]*overflow-y: auto/);
  assert.match(styles, /\.teacher-dashboard-event-content \{[\s\S]*min-width: 0/);
  assert.match(styles, /@media \(max-width: 840px\)[\s\S]*grid-template-columns: 1fr/);
});

test("Future closures have an accessible expandable view with chronological ranges", () => {
  assert.match(agenda, /View future holidays and school closures/);
  assert.doesNotMatch(agenda, /className="teacher-dashboard-closures-link"/);
  assert.doesNotMatch(agenda, /className="teacher-dashboard-closures"/);
  assert.doesNotMatch(agenda, /Public holiday on/);
  assert.match(agenda, /teacher-dashboard-inline-closures-link/);
  assert.match(agenda, /aria-expanded=\{closuresOpen\}/);
  assert.match(agenda, /aria-controls="teacher-dashboard-future-closures-dialog"/);
  assert.match(agenda, /role="dialog"/);
  assert.match(agenda, /aria-modal="true"/);
  assert.match(agenda, /Future holidays and school closures/);
  assert.match(agenda, /aria-label="Close future holidays and school closures"/);
  assert.match(agenda, /<span aria-hidden="true">×<\/span>/);
  assert.doesNotMatch(agenda, /className="teacher-dashboard-future-closures"/);
  assert.match(agenda, /No future school closures are currently scheduled\./);
  assert.match(agenda, /teacher-dashboard-future-closure-item/);
  assert.match(agenda, /formatTeacherCalendarClosureRange\(closure\)/);
  assert.match(calendar, /getFutureTeacherSchoolClosures/);
  assert.match(calendar, /\.filter\(\(closure\) => closure\.end_date >= today\)/);
  assert.match(calendar, /\.sort\([\s\S]*a\.start_date\.localeCompare\(b\.start_date\)/);
  assert.match(calendar, /start_date === closure\.end_date/);
  assert.match(agenda, /setClosures\(latestClosures\)/);
  assert.match(agenda, /setInterval/);
  assert.match(styles, /\.teacher-dashboard-closures-backdrop \{/);
  assert.match(styles, /\.teacher-dashboard-future-closures-modal \{/);
  assert.match(styles, /background: #ffffff/);
  assert.match(styles, /color: #173f70/);
  assert.match(styles, /background: rgba\(15, 28, 48, 0\.46\)/);
  assert.match(styles, /backdrop-filter: blur\(5px\)/);
  assert.match(styles, /box-sizing: border-box/);
  assert.match(styles, /overflow-x: hidden/);
  assert.match(styles, /max-width: 780px/);
  assert.match(styles, /\.teacher-dashboard-future-closures-content \{[\s\S]*border-top/);
  assert.match(styles, /\.teacher-dashboard-future-closures-list \{/);
  assert.match(styles, /\.teacher-dashboard-future-closure-item[\s\S]*overflow-wrap: anywhere/);
  assert.match(styles, /teacher-dashboard-inline-closures-link:focus-visible/);
  assert.match(styles, /max-width: 440px[\s\S]*teacher-dashboard-inline-closures-link[\s\S]*width: 100%/);
});

test("Future-closures modal supports focus return, Escape, backdrop close, and safe mobile sizing", () => {
  assert.match(agenda, /closureTriggerRef/);
  assert.match(agenda, /closureDialogRef/);
  assert.match(agenda, /document\.activeElement/);
  assert.match(agenda, /event\.key === "Escape"/);
  assert.match(agenda, /document\.addEventListener\("keydown"/);
  assert.match(agenda, /previouslyFocused\.focus\(\)/);
  assert.match(agenda, /document\.body\.style\.overflow = "hidden"/);
  assert.match(agenda, /previousBodyOverflow/);
  assert.match(agenda, /event\.target === event\.currentTarget/);
  assert.match(styles, /position: fixed/);
  assert.match(styles, /max-height: min\(680px, calc\(100vh - 48px\)\)/);
  assert.match(styles, /overflow-y: auto/);
  assert.match(styles, /max-height: calc\(100vh - 24px\)/);
});
