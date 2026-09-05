import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  canAdminManageStaffTimeRecord,
  isAdminTimeRegistrationRequired,
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
const adminSelfRoute = readFileSync(
  new URL("../app/api/admin/staff-time/self/route.ts", import.meta.url),
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
  assert.match(xlsxSource, /"Perfil"/);
  assert.match(xlsxSource, /teacher\.staff_role_label/);
});

test("PDF and XLSX routes build the same enrollment-aware report dataset", () => {
  assert.match(reportPdfRoute, /buildStaffTimeReport\(query\)/);
  assert.match(reportXlsxRoute, /buildStaffTimeReport\(query\)/);
  assert.match(
    serverSource,
    /isAdminTimeRegistrationRequired\(profileEnrollmentEvents, date\)/
  );
  assert.match(serverSource, /No incluido en el registro de jornada/);
});
