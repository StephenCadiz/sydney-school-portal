import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  buildStaffTimeReportSessionViews,
  canAdminManageStaffTimeRecord,
  isAdminTimeRegistrationRequired,
  isStaffTimeReportStaffEligible,
  isStaffTimeStaffTabEligible,
  isStaffTimeTrackingEligible,
  minutesBetween,
  staffTimeRoleLabel,
  wasAdminTimeRegistrationRequiredDuring,
} from "../lib/staffTime.ts";

const migration = readFileSync(
  new URL(
    "../supabase/migrations/20260904210000_extend_staff_time_to_admin_staff.sql",
    import.meta.url
  ),
  "utf8"
);
const baseMigration = readFileSync(
  new URL(
    "../supabase/migrations/20260903180000_create_staff_time_register.sql",
    import.meta.url
  ),
  "utf8"
);
const historicalCompanyMigration = readFileSync(
  new URL(
    "../supabase/migrations/20260910120000_add_historical_staff_time_company_correction.sql",
    import.meta.url
  ),
  "utf8"
);
const duplicateCorrectionMigration = readFileSync(
  new URL(
    "../supabase/migrations/20260922130000_repair_staff_time_duplicate_correction.sql",
    import.meta.url
  ),
  "utf8"
);
const manualSignoutMigration = readFileSync(
  new URL(
    "../supabase/migrations/20260922150000_harden_staff_time_manual_signout.sql",
    import.meta.url
  ),
  "utf8"
);
const historicalCorrectionMigration = readFileSync(
  new URL(
    "../supabase/migrations/20260911130000_allow_historical_staff_time_corrections.sql",
    import.meta.url
  ),
  "utf8"
);
const adminSelfRoute = readFileSync(
  new URL("../app/api/admin/staff-time/self/route.ts", import.meta.url),
  "utf8"
);
const adminStaffTimeRoute = readFileSync(
  new URL("../app/api/admin/staff-time/route.ts", import.meta.url),
  "utf8"
);
const teacherRoute = readFileSync(
  new URL("../app/api/teacher/staff-time/route.ts", import.meta.url),
  "utf8"
);
const adminCreateRoute = readFileSync(
  new URL("../app/api/admin/admin-staff/create-manual/route.ts", import.meta.url),
  "utf8"
);
const adminUpdateRoute = readFileSync(
  new URL("../app/api/admin/admin-staff/[id]/route.ts", import.meta.url),
  "utf8"
);
const adminEditDialog = readFileSync(
  new URL("../app/components/admin/AdminStaffEditDialog.tsx", import.meta.url),
  "utf8"
);
const addUsersPage = readFileSync(
  new URL("../app/admin/add-users/page.tsx", import.meta.url),
  "utf8"
);
const serverSource = readFileSync(
  new URL("../lib/staffTimeServer.ts", import.meta.url),
  "utf8"
);
const reportPdfRoute = readFileSync(
  new URL("../app/api/admin/staff-time/reports/pdf/route.ts", import.meta.url),
  "utf8"
);
const reportXlsxRoute = readFileSync(
  new URL("../app/api/admin/staff-time/reports/xlsx/route.ts", import.meta.url),
  "utf8"
);
const pdfSource = readFileSync(
  new URL("../lib/staffTimePdf.ts", import.meta.url),
  "utf8"
);
const xlsxSource = readFileSync(
  new URL("../lib/staffTimeXlsx.ts", import.meta.url),
  "utf8"
);
const staffTimePage = readFileSync(
  new URL("../app/admin/staff-time/page.tsx", import.meta.url),
  "utf8"
);

const enabled = {
  id: "enabled",
  admin_id: "admin",
  requires_time_registration: true,
  effective_from: "2026-09-04",
  changed_at: "2026-09-04T08:00:00.000Z",
};
const disabled = {
  id: "disabled",
  admin_id: "admin",
  requires_time_registration: false,
  effective_from: "2026-10-01",
  changed_at: "2026-09-20T08:00:00.000Z",
};
const reenabled = {
  id: "reenabled",
  admin_id: "admin",
  requires_time_registration: true,
  effective_from: "2026-10-15",
  changed_at: "2026-10-15T08:00:00.000Z",
};

test("existing Admin accounts default to time registration disabled", () => {
  assert.equal(isAdminTimeRegistrationRequired([], "2026-09-04"), false);
});

test("Admin enrollment is effective-dated and preserves historical tracking", () => {
  const events = [enabled, disabled, reenabled];
  assert.equal(isAdminTimeRegistrationRequired(events, "2026-09-30"), true);
  assert.equal(isAdminTimeRegistrationRequired(events, "2026-10-01"), false);
  assert.equal(isAdminTimeRegistrationRequired(events, "2026-10-14"), false);
  assert.equal(isAdminTimeRegistrationRequired(events, "2026-10-15"), true);
  assert.equal(
    wasAdminTimeRegistrationRequiredDuring(events, "2026-09-01", "2026-09-30"),
    true
  );
  assert.equal(
    wasAdminTimeRegistrationRequiredDuring(events, "2026-10-01", "2026-10-14"),
    false
  );
  assert.equal(
    wasAdminTimeRegistrationRequiredDuring(events, "2026-10-15", "2026-10-31"),
    true
  );
});

test("same-day enrollment changes use the latest audited event", () => {
  const sameDayDisable = {
    ...disabled,
    effective_from: enabled.effective_from,
    changed_at: "2026-09-04T09:00:00.000Z",
  };
  assert.equal(
    isAdminTimeRegistrationRequired([enabled, sameDayDisable], "2026-09-04"),
    false
  );
});

test("identical effective dates and timestamps use the database ID tie-break", () => {
  const sameTimestampEnable = {
    ...enabled,
    id: "00000000-0000-4000-8000-000000000001",
  };
  const sameTimestampDisable = {
    ...enabled,
    id: "00000000-0000-4000-8000-000000000002",
    requires_time_registration: false,
  };
  assert.equal(
    isAdminTimeRegistrationRequired(
      [sameTimestampEnable, sameTimestampDisable],
      enabled.effective_from
    ),
    false
  );
});

test("Teacher and Admin staff labels are explicit", () => {
  assert.equal(staffTimeRoleLabel("teacher"), "Teacher");
  assert.equal(staffTimeRoleLabel("admin"), "Admin staff");
});

test("Staff tab includes every active Teacher regardless of employment tracking", () => {
  assert.equal(isStaffTimeStaffTabEligible("teacher", true, false), true);
  assert.equal(isStaffTimeStaffTabEligible("teacher", true, true), true);
  assert.equal(isStaffTimeStaffTabEligible("teacher", false, true), false);
});

test("Admin Staff tab eligibility still follows Staff Time enrollment", () => {
  const today = "2026-09-10";
  assert.equal(isStaffTimeStaffTabEligible("admin", true, true), true);
  assert.equal(isStaffTimeStaffTabEligible("admin", true, false), false);
  assert.equal(isStaffTimeStaffTabEligible("admin", false, true), true);
  assert.equal(isStaffTimeTrackingEligible("admin", [], [enabled], today), true);
  assert.equal(isStaffTimeTrackingEligible("admin", [], [disabled], today), false);
});

test("Reports include Teachers and enrolled Admin staff only", () => {
  assert.equal(isStaffTimeReportStaffEligible("teacher", false), true);
  assert.equal(isStaffTimeReportStaffEligible("teacher", true), true);
  assert.equal(isStaffTimeReportStaffEligible("admin", true), true);
  assert.equal(isStaffTimeReportStaffEligible("admin", false), false);
});

test("Staff dropdown is filtered independently from the historical Reports dropdown", () => {
  assert.match(staffTimePage, /staffTabTeachers = teachers\.filter\(\(teacher\) =>/);
  assert.match(staffTimePage, /isStaffTimeStaffTabEligible\(/);
  assert.match(staffTimePage, /staffTabTeachers\.map\(\(teacher\) => <option/);
  assert.match(staffTimePage, /setSelectedTeacherId\(staffTabTeachers\[0\]\?\.id \|\| ""\)/);
  assert.match(staffTimePage, /disabled=\{!staffTabTeachers\.length\}/);
  assert.match(staffTimePage, /No staff members currently require time recording/);
  assert.match(staffTimePage, /\{\(todayData\?\.rows \|\| \[\]\)\.map/);
  assert.match(staffTimePage, /reportTeachers = teachers\.filter\(\(teacher\) =>/);
  assert.match(staffTimePage, /<option value="all">All enrolled staff<\/option>\{reportTeachers\.map/);
  assert.match(serverSource, /staff_time_eligible: isStaffTimeTrackingEligible/);
});

test("Teacher and Admin employment share whole-number contracted-hours validation", () => {
  assert.match(migration, /profile\.role in \('teacher', 'admin'\)/i);
  assert.match(
    serverSource,
    /validateContractedWeeklyHours\(\s*value\.contracted_weekly_hours\s*\)/
  );
  assert.match(
    staffTimePage,
    /validateContractedWeeklyHours\(\s*employmentForm\.contracted_weekly_hours\s*\)/
  );
  assert.match(
    staffTimePage,
    /Contracted weekly hours<input type="number" min="0\.01" max="168" step="0\.01"/
  );
  assert.doesNotMatch(staffTimePage, /contracted_weekly_hours[\s\S]{0,300}step="0\.25"/);
  assert.match(baseMigration, /contracted_weekly_hours numeric\(5, 2\) not null/i);
  assert.match(
    baseMigration,
    /contracted_weekly_hours > 0 and contracted_weekly_hours <= 168/i
  );
});

test("an Admin cannot manage their own protected Staff Time record", () => {
  assert.equal(canAdminManageStaffTimeRecord("admin-a", "admin-a"), false);
  assert.equal(canAdminManageStaffTimeRecord("admin-a", "admin-b"), true);
});

test("migration keeps legacy profile references and adds append-only Admin enrollment", () => {
  assert.match(migration, /create table public\.staff_time_admin_enrollment_events/i);
  assert.match(migration, /No row means not enrolled/i);
  assert.match(migration, /before update or delete[\s\S]*staff_time_reject_change/i);
  assert.match(migration, /Legacy column name retained for compatibility/i);
  assert.doesNotMatch(migration, /drop column\s+teacher_id/i);
  assert.doesNotMatch(migration, /alter table[\s\S]*rename column\s+teacher_id/i);
  assert.match(migration, /changed_by uuid not null[\s\S]*on delete restrict/i);
  assert.match(migration, /changed_at timestamptz not null default now\(\)/i);
});

test("Admin creation defaults to disabled and validates optional enrollment server-side", () => {
  assert.match(addUsersPage, /requires_time_registration:\s*false/);
  assert.match(adminCreateRoute, /body\.requires_time_registration === true/);
  assert.match(
    adminCreateRoute,
    /typeof body\.requires_time_registration !== "boolean"/
  );
  assert.match(
    adminCreateRoute,
    /if \(requiresTimeRegistration\)[\s\S]*set_staff_time_admin_enrollment/
  );
  assert.match(adminCreateRoute, /cleanup could not be confirmed/);
});

test("unrelated Admin edits do not resend or alter enrollment", () => {
  assert.match(adminEditDialog, /const trackingChanged =/);
  assert.match(
    adminEditDialog,
    /\.\.\.\(trackingChanged[\s\S]*requires_time_registration/
  );
  assert.match(
    adminUpdateRoute,
    /hasTrackingEffectiveDate && !hasTrackingSetting/
  );
  assert.match(adminUpdateRoute, /if \(trackingChanged\)/);
});

test("database participant rule accepts Teachers, conditionally accepts Admins, and rejects Students", () => {
  assert.match(migration, /when 'teacher' then true/i);
  assert.match(migration, /when 'admin' then coalesce/i);
  assert.match(migration, /else false/i);
  assert.match(migration, /profile\.role in \('teacher', 'admin'\)/i);
});

test("disabled Admins are excluded from clocking and automatic incidents", () => {
  assert.match(migration, /staff_time_require_teacher[\s\S]*staff_time_is_participant/i);
  assert.match(
    migration,
    /refresh_staff_time_incidences[\s\S]*staff_time_is_participant\(employment\.teacher_id, v_date\)/i
  );
  assert.match(adminSelfRoute, /requireTrackedStaffTimeAdmin\(request\)/);
  assert.doesNotMatch(adminSelfRoute, /teacher_id\s*[:=].*body/i);
});

test("enrollment and clock-session writes are serialized at the database boundary", () => {
  assert.match(
    migration,
    /set_staff_time_admin_enrollment[\s\S]*pg_advisory_xact_lock\(hashtextextended\(p_admin_id::text, 0\)\)/i
  );
  assert.match(
    migration,
    /insert into public\.staff_time_admin_enrollment_events[\s\S]*clock_timestamp\(\)/i
  );
  assert.match(migration, /staff_clock_sessions_participant_guard/i);
  assert.match(
    migration,
    /staff_time_require_session_participant[\s\S]*staff_time_is_participant\(new\.teacher_id, new\.work_date\)/i
  );
});

test("Admin self-service reuses the shared Madrid/network/closure clocking path", () => {
  assert.match(adminSelfRoute, /loadTeacherWorkingDay/);
  assert.match(adminSelfRoute, /clockTeacher/);
  assert.match(adminSelfRoute, /submitTeacherCorrection/);
  assert.match(serverSource, /staff_clock_in/);
  assert.match(serverSource, /getMadridDate/);
  assert.match(serverSource, /loadSchoolClosures/);
  assert.match(serverSource, /requestIpIsAuthorised/);
  assert.doesNotMatch(adminSelfRoute, /occurred_at\s*[:=].*body/i);
  assert.doesNotMatch(adminSelfRoute, /work_date\s*[:=].*body/i);
  assert.doesNotMatch(adminSelfRoute, /request_ip\s*[:=].*body/i);
});

test("the existing Teacher endpoint remains Teacher-only and uses the same clocking core", () => {
  assert.match(teacherRoute, /requireStaffTimeTeacher/);
  assert.match(teacherRoute, /clockTeacher/);
  assert.match(teacherRoute, /loadTeacherWorkingDay/);
  assert.match(serverSource, /data\?\.role !== "teacher"/);
  assert.match(serverSource, /Teacher access required/);
});

test("self-review, manual correction, incident resolution, and self-disable are blocked in SQL", () => {
  assert.match(migration, /p_actor_id = p_admin_id and not p_requires_time_registration/i);
  assert.match(migration, /p_actor_id = p_teacher_id[\s\S]*manual correction/i);
  assert.match(migration, /v_pending\.teacher_id = p_actor_id/i);
  assert.match(migration, /v_incidence\.teacher_id = p_actor_id/i);
});

test("duplicate clock attempts are serialized and become idempotent no-ops", () => {
  assert.match(
    baseMigration,
    /create unique index staff_clock_sessions_one_open_per_teacher_idx[\s\S]*on public\.staff_clock_sessions \(teacher_id\)[\s\S]*closed_at is null/i
  );
  assert.match(
    baseMigration,
    /staff_clock_in\([\s\S]*pg_advisory_xact_lock\(hashtextextended\(p_actor_id::text, 0\)\)[\s\S]*denied_already_signed_in/i
  );
  assert.match(
    baseMigration,
    /staff_clock_out\([\s\S]*pg_advisory_xact_lock\(hashtextextended\(p_actor_id::text, 0\)\)[\s\S]*denied_no_open_session/i
  );
});

test("manual correction retries require an exact session when one exists", () => {
  assert.match(
    duplicateCorrectionMigration,
    /if p_session_id is null and exists \([\s\S]*staff_clock_sessions session[\s\S]*session\.teacher_id = p_teacher_id[\s\S]*session\.work_date = p_work_date[\s\S]*Select the existing clock session/i
  );
  assert.match(
    duplicateCorrectionMigration,
    /where id = p_session_id and teacher_id = p_teacher_id and work_date = p_work_date/i
  );
  assert.match(
    serverSource,
    /submitTeacherCorrection|createManualCorrection/
  );
});

test("unlinked correction retries collapse to one authoritative daily session", () => {
  const correction = (id, signIn, signOut, submittedAt) => ({
    id,
    teacher_id: "natalia",
    work_date: "2026-09-22",
    session_id: null,
    requested_sign_in_at: signIn,
    requested_sign_out_at: signOut,
    reason: "Admin repair",
    submitted_at: submittedAt,
    reviewed_at: submittedAt,
    status: "approved",
  });
  const views = buildStaffTimeReportSessionViews(
    [],
    [],
    [
      correction("open-in", "2026-09-22T14:00:00.000Z", null, "2026-09-22T14:38:00.000Z"),
      correction("open-out", null, "2026-09-22T17:30:00.000Z", "2026-09-22T17:37:00.000Z"),
      correction("complete", "2026-09-22T14:30:00.000Z", "2026-09-22T17:30:00.000Z", "2026-09-22T17:39:00.000Z"),
    ],
    "2026-09-22",
    "2026-09-22"
  );
  assert.equal(views.length, 1);
  assert.equal(views[0].id, "correction-complete");
  assert.equal(views[0].clocking_mode, "correction");
  assert.equal(views[0].effective_sign_in_at, "2026-09-22T14:30:00.000Z");
  assert.equal(views[0].effective_sign_out_at, "2026-09-22T17:30:00.000Z");
});

test("the durable Admin stale-session and Natalia repair RPCs are restricted and idempotent", () => {
  assert.match(manualSignoutMigration, /staff_admin_close_stale_session\(/i);
  assert.match(manualSignoutMigration, /repair_natalia_staff_time_corrections\(/i);
  assert.match(manualSignoutMigration, /pg_advisory_xact_lock\(hashtextextended\(p_teacher_id::text, 0\)\)/i);
  assert.match(manualSignoutMigration, /already_closed/);
  assert.match(manualSignoutMigration, /return v_existing/);
  assert.match(manualSignoutMigration, /revoke all on function public\.staff_admin_close_stale_session[\s\S]*from public, anon, authenticated/i);
  assert.match(manualSignoutMigration, /grant execute on function public\.staff_admin_close_stale_session[\s\S]*to service_role/i);
  assert.match(manualSignoutMigration, /c8abfb2d-192c-428d-bbdb-7088ae2f6269/);
  assert.match(manualSignoutMigration, /d83ebe54-ad6d-4607-bc81-2f64c136e9fe/);
  assert.match(manualSignoutMigration, /a2ab0f4e-11ce-41df-b121-1af480b70e28/);
  assert.match(manualSignoutMigration, /81682039-e013-4167-a1f0-40eb64f20c48/);
  assert.match(manualSignoutMigration, /9624e7b5-e1c8-4bbf-a951-a961cf4860a5/);
});

test("Admin manual corrections can cover pre-enrollment dates without opening live clocking", () => {
  assert.match(
    historicalCorrectionMigration,
    /create or replace function public\.staff_admin_create_time_correction\(/i
  );
  assert.match(
    historicalCorrectionMigration,
    /perform app_private\.staff_time_require_admin\(p_actor_id\)/i
  );
  assert.match(
    historicalCorrectionMigration,
    /role in \('teacher', 'admin'\)/i
  );
  assert.doesNotMatch(
    historicalCorrectionMigration,
    /The selected staff member was not enrolled in Staff Time on this date/i
  );
  assert.match(historicalCorrectionMigration, /admin_manual_resolution/);
  assert.match(serverSource, /workDate > getMadridDate\(\)/);
  assert.match(serverSource, /includeApprovedCorrections/);
  assert.match(serverSource, /eq\("status", "approved"\)/);
  assert.match(serverSource, /loadStaffTimeProfiles\(input\.startDate, input\.endDate, true\)/);
  assert.match(serverSource, /reportEmployment/);
  assert.match(serverSource, /loadEmploymentRecords\(\s*"1900-01-01"/);
  assert.match(serverSource, /staff_clock_in|staff_clock_out/);
});

test("another authenticated Admin remains allowed to perform protected management actions", () => {
  assert.match(migration, /perform app_private\.staff_time_require_admin\(p_actor_id\)/i);
  assert.doesNotMatch(migration, /p_actor_id\s*<>\s*p_teacher_id[\s\S]*raise exception/i);
  assert.equal(canAdminManageStaffTimeRecord("admin-a", "admin-b"), true);
});

test("Admin employment cannot become a conflicting second enrollment toggle", () => {
  assert.match(
    migration,
    /v_profile\.role = 'admin' and not p_time_recording_enabled[\s\S]*controlled by the Admin account enrollment setting/i
  );
  assert.match(migration, /staff_time_is_participant\(employment\.teacher_id, v_date\)/i);
});

test("enrollment and resolution surfaces remain service-role-only", () => {
  assert.match(
    migration,
    /revoke all on table public\.staff_time_admin_enrollment_events from anon, authenticated/i
  );
  assert.match(
    migration,
    /grant select, insert on table public\.staff_time_admin_enrollment_events to service_role/i
  );
  assert.match(
    migration,
    /revoke all on function public\.set_staff_time_admin_enrollment[\s\S]*from public, anon, authenticated/i
  );
});

test("PDF and XLSX reports both identify each staff member's role", () => {
  assert.match(pdfSource, /teacher\.staff_role_label/);
  assert.match(pdfSource, /formatContractedWeeklyHours/);
  assert.match(xlsxSource, /"Perfil"/);
  assert.match(xlsxSource, /teacher\.staff_role_label/);
  assert.match(xlsxSource, /columnNumber === 6\) cell\.numFmt = "0\.##"/);
});

test("PDF and XLSX routes build the same enrollment-aware report dataset", () => {
  assert.match(reportPdfRoute, /buildStaffTimeReport\(query\)/);
  assert.match(reportXlsxRoute, /buildStaffTimeReport\(query\)/);
  assert.match(reportPdfRoute, /generateStaffTimePdf\(report\)/);
  assert.match(reportXlsxRoute, /generateStaffTimeXlsx\(report\)/);
  assert.match(
    serverSource,
    /isAdminTimeRegistrationRequired\(profileEnrollmentEvents, date\)/
  );
  assert.match(serverSource, /No incluido en el registro de jornada/);
});

test("reports include inclusive manual records, exclude outside dates, and deduplicate linked corrections", () => {
  const teacherId = "teacher-1";
  const sessions = [{
    id: "clock-10",
    teacher_id: teacherId,
    work_date: "2026-09-10",
    clocking_mode: "school_network",
    opened_at: "2026-09-10T16:00:00.000Z",
  }];
  const events = [
    { session_id: "clock-10", event_type: "sign_in", occurred_at: "2026-09-10T16:00:00.000Z", verification_result: "verified_school_network" },
    { session_id: "clock-10", event_type: "sign_out", occurred_at: "2026-09-10T17:30:00.000Z", verification_result: "verified_school_network" },
  ];
  const correction = (id, work_date, signIn, signOut, session_id = null) => ({
    id,
    teacher_id: teacherId,
    work_date,
    session_id,
    requested_sign_in_at: signIn,
    requested_sign_out_at: signOut,
    reason: "Audited manual record",
    submitted_at: `${work_date}T18:00:00.000Z`,
    reviewed_at: `${work_date}T18:05:00.000Z`,
    status: "approved",
  });
  const views = buildStaffTimeReportSessionViews(
    sessions,
    events,
    [
      correction("manual-07", "2026-09-07", "2026-09-07T16:00:00.000Z", "2026-09-07T17:30:00.000Z"),
      correction("manual-08", "2026-09-08", "2026-09-08T16:00:00.000Z", "2026-09-08T17:30:00.000Z"),
      correction("manual-09", "2026-09-09", "2026-09-09T16:00:00.000Z", "2026-09-09T17:30:00.000Z"),
      correction("linked-10", "2026-09-10", "2026-09-10T16:00:00.000Z", "2026-09-10T17:30:00.000Z", "clock-10"),
      correction("outside-06", "2026-09-06", "2026-09-06T16:00:00.000Z", "2026-09-06T17:30:00.000Z"),
    ],
    "2026-09-07",
    "2026-09-10"
  );
  assert.deepEqual(views.map((view) => view.work_date), [
    "2026-09-07",
    "2026-09-08",
    "2026-09-09",
    "2026-09-10",
  ]);
  assert.equal(views.length, 4);
  assert.equal(views.filter((view) => view.work_date === "2026-09-10").length, 1);
  assert.equal(views.filter((view) => view.corrected).length, 4);
});

test("a linked duplicate-punch correction replaces the session span and recalculates exact minutes", () => {
  const teacherId = "teacher-stephen";
  const session = {
    id: "clock-stephen-15",
    teacher_id: teacherId,
    work_date: "2026-09-15",
    clocking_mode: "school_network",
    opened_at: "2026-09-15T14:44:48.753Z",
  };
  const views = buildStaffTimeReportSessionViews(
    [session],
    [
      {
        session_id: session.id,
        event_type: "sign_in",
        occurred_at: "2026-09-15T14:44:48.753Z",
        verification_result: "verified_school_network",
      },
      {
        session_id: session.id,
        event_type: "sign_out",
        occurred_at: "2026-09-16T19:11:01.701Z",
        verification_result: "verified_school_network",
      },
    ],
    [{
      id: "linked-correction-15",
      teacher_id: teacherId,
      work_date: "2026-09-15",
      session_id: session.id,
      requested_sign_in_at: "2026-09-15T14:44:00.000Z",
      requested_sign_out_at: "2026-09-15T19:11:00.000Z",
      reason: "Correct duplicate-punch span",
      submitted_at: "2026-09-17T12:00:00.000Z",
      reviewed_at: "2026-09-17T12:05:00.000Z",
      status: "approved",
    }],
    "2026-09-15",
    "2026-09-15"
  );

  assert.equal(views.length, 1);
  assert.equal(views[0].corrected, true);
  assert.equal(
    minutesBetween(views[0].effective_sign_in_at, views[0].effective_sign_out_at),
    267
  );
});

test("superseded duplicate corrections are excluded while the linked repair remains authoritative", () => {
  const teacherId = "teacher-stephen";
  const sessionId = "clock-stephen-15";
  const views = buildStaffTimeReportSessionViews(
    [{
      id: sessionId,
      teacher_id: teacherId,
      work_date: "2026-09-15",
      clocking_mode: "school_network",
      opened_at: "2026-09-15T14:44:48.753Z",
    }],
    [{
      session_id: sessionId,
      event_type: "sign_in",
      occurred_at: "2026-09-15T14:44:48.753Z",
      verification_result: "verified_school_network",
    }],
    [
      {
        id: "superseded-orphan",
        teacher_id: teacherId,
        work_date: "2026-09-15",
        session_id: null,
        requested_sign_in_at: "2026-09-15T14:30:00.000Z",
        requested_sign_out_at: "2026-09-15T19:00:00.000Z",
        reason: "Original duplicate",
        submitted_at: "2026-09-17T12:00:00.000Z",
        reviewed_at: "2026-09-17T12:05:00.000Z",
        status: "approved",
        superseded_at: "2026-09-18T12:00:00.000Z",
      },
      {
        id: "active-linked-repair",
        teacher_id: teacherId,
        work_date: "2026-09-15",
        session_id: sessionId,
        requested_sign_in_at: "2026-09-15T14:44:00.000Z",
        requested_sign_out_at: "2026-09-15T19:11:00.000Z",
        reason: "Linked repair",
        submitted_at: "2026-09-18T12:01:00.000Z",
        reviewed_at: "2026-09-18T12:02:00.000Z",
        status: "approved",
      },
    ],
    "2026-09-15",
    "2026-09-15"
  );

  assert.equal(views.length, 1);
  assert.equal(views[0].corrected, true);
  assert.equal(
    minutesBetween(views[0].effective_sign_in_at, views[0].effective_sign_out_at),
    267
  );
  assert.match(duplicateCorrectionMigration, /superseded_at/);
  assert.match(duplicateCorrectionMigration, /repair_staff_time_duplicate_correction/);
  assert.match(duplicateCorrectionMigration, /Select the existing clock session/);
  assert.match(duplicateCorrectionMigration, /security definer[\s\S]*set search_path = pg_catalog, pg_temp/i);
  assert.match(duplicateCorrectionMigration, /grant execute on function public\.repair_staff_time_duplicate_correction[\s\S]*to service_role/i);
  assert.match(duplicateCorrectionMigration, /4dc8e050-349e-4354-a25c-aed1c804a0f7/);
  assert.match(duplicateCorrectionMigration, /e873a73b-0937-4573-8f5f-745c57df8264/);
  assert.match(duplicateCorrectionMigration, /00772f87-e46a-4aec-bdeb-84b6d0098258/);
});

test("historical company corrections are Admin-only, append-only, and period-bounded", () => {
  assert.match(
    historicalCompanyMigration,
    /create or replace function public\.correct_historical_staff_time_company_settings\(/i
  );
  assert.match(
    historicalCompanyMigration,
    /perform app_private\.staff_time_require_admin\(p_actor_id\)/i
  );
  assert.match(
    historicalCompanyMigration,
    /pg_advisory_xact_lock\(hashtextextended\('staff_time_company_history', 0\)\)/i
  );
  assert.match(
    historicalCompanyMigration,
    /p_correction_reason text[\s\S]*A correction reason is required/i
  );
  for (const field of [
    "legal_employer_name",
    "tax_identifier",
    "workplace_name",
    "workplace_address",
    "postcode",
    "city",
    "province",
    "country",
  ]) {
    assert.match(historicalCompanyMigration, new RegExp(`p_${field} text`, "i"));
    assert.match(
      historicalCompanyMigration,
      new RegExp(`nullif\\(btrim\\(p_${field}\\), ''\\) is null`, "i")
    );
  }
  assert.match(
    historicalCompanyMigration,
    /where effective_from > p_effective_from[\s\S]*order by effective_from asc[\s\S]*limit 1[\s\S]*for update/i
  );
  assert.match(
    historicalCompanyMigration,
    /effective_to,[\s\S]*v_next\.effective_from - 1/i
  );
  assert.match(historicalCompanyMigration, /returns public\.staff_time_company_settings/i);
  assert.match(historicalCompanyMigration, /security definer/i);
  assert.match(historicalCompanyMigration, /set search_path = pg_catalog, pg_temp/i);
  assert.match(historicalCompanyMigration, /insert into public\.staff_time_company_settings/i);
  assert.doesNotMatch(
    historicalCompanyMigration,
    /update public\.staff_time_company_settings/i
  );
  assert.match(
    historicalCompanyMigration,
    /revoke all on function public\.correct_historical_staff_time_company_settings\([\s\S]*from public, anon, authenticated/i
  );
  assert.match(
    historicalCompanyMigration,
    /grant execute on function public\.correct_historical_staff_time_company_settings\([\s\S]*to service_role/i
  );
  assert.match(serverSource, /correct_historical_staff_time_company_settings/);
  assert.match(adminStaffTimeRoute, /case "correct_historical_company"/);
  assert.match(staffTimePage, /Historical correction/);
  assert.match(staffTimePage, /Correction reason<textarea/);
});

test("historical periods select the correction while future records remain unchanged", () => {
  const records = [
    { id: "current", effective_from: "2026-09-14", effective_to: null },
    { id: "historical", effective_from: "2026-09-07", effective_to: "2026-09-13" },
  ];
  const forDate = (date) => records.find(
    (record) => record.effective_from <= date && (!record.effective_to || record.effective_to >= date)
  );
  assert.equal(forDate("2026-09-07")?.id, "historical");
  assert.equal(forDate("2026-09-13")?.id, "historical");
  assert.equal(forDate("2026-09-14")?.id, "current");
  assert.equal(records.find((record) => record.id === "current")?.effective_from, "2026-09-14");
  assert.match(serverSource, /companySettingsForDate\(input\.startDate\)/);
  assert.match(serverSource, /\.lte\("effective_from", date\)/);
  assert.match(serverSource, /effective_to\.is\.null,effective_to\.gte\.\$\{date\}/);
  assert.match(reportPdfRoute, /buildStaffTimeReport\(query\)/);
  assert.match(reportXlsxRoute, /buildStaffTimeReport\(query\)/);
});
