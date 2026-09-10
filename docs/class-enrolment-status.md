# Effective-dated class enrolment — implementation and validation report

Status: **migration applied; local schema/PostgREST verification complete.
Genuine multi-session contention testing remains unavailable.**

## Safety and Git state

Repository: `/Users/stephenferreira/sydney-school-portal`.

This continuation started on `main` at
`2f55ad43d0fdc9492aea2115577474db3af4c418`, with an empty staging area.
The 36 modified/untracked paths matched the previous checkpoint exactly.
All 36 existing implementation paths were retained. No unrelated changes appeared.

The final list below has 43 paths: the original 36 plus:
- `app/admin/academic-years/rollover/page.tsx`
- `app/admin/classes/page.tsx`
- `app/api/admin/students/delete/route.ts`
- `app/api/teacher/classes/[id]/class-points/route.ts`
- `lib/academicYearRolloverRules.ts`
- `lib/academicYearRolloverServer.ts`
- `tests/classEnrolmentRoutes.test.mjs`

HEAD and the branch were unchanged at that checkpoint. Nothing was staged,
committed, pushed or deployed then; the class-enrolment migration was applied
subsequently as recorded in the post-application update. The applied Staff Time
migration and every historical migration remain untouched. No production
student, membership, attendance, result or other application records were
accessed during the review.

## Root cause and authoritative dates

Legacy `class_enrolments.enrolled_at` and
`young_learner_enrolments.enrolled_at` are class-specific joining dates.
Their unique student/class rows cannot represent withdrawal gaps or repeated
enrolment. Earlier Cambridge transfers overwrote relationships; Young Learner
current-class resolution relied on a mutable pointer. Register and Friday
snapshots could survive a membership change and then enter totals or alerts.

The authoritative model is now `class_enrolment_periods`:

```text
cancelled_at is null
and starts_on <= lesson_date
and (ends_before is null or lesson_date < ends_before)
```

Dates are school calendar dates in Europe/Madrid. The start is inclusive; the end
is the first non-enrolled day. Multiple non-overlapping periods per student/class
are allowed. Transfers close and open on the same date. A 15 September course
with a 1 October joining date contributes nothing from 15–30 September, and
1 October is eligible. Missing/unmarked entries contribute nothing; the formula
remains present / (present + absent), with the existing display rounding.

## Schema, security and locking

The migration subsequently applied is
`supabase/migrations/20260909130000_class_enrolment_periods.sql`.

- Typed profile/Young Learner identity, restrictive foreign keys, generated
  student identity, valid non-empty ranges, and a partial GiST exclusion
  constraint prevent overlapping non-cancelled periods in the same class.
- Student/class/start and event/period/date indexes support eligibility/history.
  Each rollover assignment links to at most one period, with a unique reverse
  link preventing two decisions from claiming the same period.
- Cancelled periods have paired `cancelled_at` / `cancelled_by` metadata, and
  a constraint requires cancellation before the Madrid start date.
- Audit events store before/after period data and enrol/transfer/withdraw/correct/
  cancel actions. Events are service-readable, not exposed through the new UI API.
- Direct period/event writes are denied to anon, authenticated and service roles.
  Only vetted security-definer functions mutate them.
- Mutations require service access plus the server-verified active Admin identity;
  the new HTTP API rejects client-supplied actor fields. Permanent purge retains
  its existing service-only SQL boundary and authenticated Admin route checks.
- Authenticated period reads have scoped RLS and a restricted column grant;
  actor/source metadata is not granted. Current views use security-invoker
  semantics. Student, Teacher and Admin visibility is checked through the
  existing ownership model, now using periods where appropriate.
- New/replaced security-definer functions have explicit postgres ownership,
  fixed `pg_catalog, pg_temp` search paths and restricted grants.
- Enrolment mutations serialize per student with an advisory transaction lock
  and lock affected classes in deterministic order. Register/Friday saves take
  class share locks. Rollover uses parent-before-child row locks; bulk decisions
  remain transactional. The migration locks membership/snapshot inputs for a
  stable backfill and alert reconciliation.
- Direct authenticated Homework result insert/update/delete policies now check
  current student membership, matching the existing HTTP guard. Historical
  result reads and all academic formulas remain unchanged.

The tests confirm an index-capable eligibility plan with sequential scans
disabled. This is not a production-cardinality performance benchmark.

## Admin workflows and cancellation

Initial profile/manual/invitation and Young Learner flows require an explicit
enrolment start date. Add Users supplies Madrid-default batch date inputs.
Date/type/class/year validation runs before account creation or invitation;
the SQL transaction independently validates membership.

Admin Students shows period history and distinct enrol/re-enrol, transfer,
withdrawal, correction and future-cancellation controls. Withdrawal is labelled
“First non-enrolled day”. Cancelled entries remain labelled “Cancelled before
start”. Cancelled periods cannot be edited or revived: re-enrolment creates a
new period. Repeating cancellation is idempotent.

Cancellation is limited to never-effective future periods and is rejected when
the period contains register/Friday snapshots or dated exam results. Undated
profile results are conservatively treated as ambiguous and block cancellation.
Effective periods must use correction, transfer or withdrawal, retaining events.

Profile Auth account creation and invitation delivery remain outside the database
transaction, as in the existing system. Young Learner batch identity+enrolment
creation is atomic. Failed profile batch setup now uses the atomic purge for an
existing student profile; it does not run separate destructive table calls.

## Register, Friday, calculations and displays

- `is_class_member_on` is the SQL date rule.
- `eligible_class_register_entries` and
  `eligible_friday_tutorial_results` filter before application aggregation.
  Underlying out-of-period snapshots remain stored, unchanged.
- Roster creation uses lesson-date periods for both types. Existing register
  loading/counting/history uses eligible entries. The save RPC rejects stale
  submitted entries independently and preserves completed-register requirements.
- Shared attendance helpers feed Teacher/Young Learner workspaces, Student
  Progress, Admin Student Information and Admin Attendance student/class/level/
  overall consumers. Admin historical datasets use non-cancelled periods rather
  than current-only profile memberships or legacy Young Learner rows.
- Current class, messaging, announcements, homework, course planning and directory
  counts use current period views. Future assignments do not replace today's
  class; dates, not a midnight pointer-update job, determine membership.
- Friday whole-sheet expected rosters and resubmissions use eligible periods/
  snapshots. A database trigger independently protects individual result writes.
  Progress and analytics read the eligible view. Scoring, score rounding and
  Friday attendance definitions were not changed.
- Existing school-closure, class/course/year boundary and P/A/null rules remain
  in place. No late/excused status or new attendance formula was introduced.

## Academic-year rollover

Rollover source lists and readiness use periods at the source year's relevant
Madrid date (today clamped to that year's start/end). Cancelled periods are
excluded. Target application calls the same Admin enrolment RPC at the target
year's start, creating the period and compatibility relationship together.

Repeated application of the same applied decision creates nothing. Future
revision cancels the old linked period, retains its event/history, and clears
the applied link; the existing Save Draft → Apply workflow creates the revised
assignment. Not Returning / Decide Later do not invent a one-day period.

A saved preview reports the proposed period action, start, overlap/date/source
conflict and number of retained cancellations. Unsaved UI edits explicitly ask
for Save to refresh the checked preview. Revising an already-applied assignment
has an additional explanation/confirmation. A cancellation made through general
enrolment controls is detected by rollover preview/application; Admin must revise
the stale decision. Readiness does not count a cancelled period as assigned.

The original level/type/annual-course/target-year business rules remain.
The same class ID cannot belong to both source and target years; that invalid
cross-year reuse is rejected. Reapplying the same target assignment is supported.
Already-started target periods cannot be cancelled by changing a “Future”
administrative status flag. Academic-year switching no longer rewrites Young
Learner pointers from legacy relationships.

## Permanent deletion and soft changes

The existing student/class purge SQL is extended in the draft, not in historical
migrations. Previews include period and audit-event counts. Execution deletes
rollover references, events, then periods before their parent identities/classes,
within the original transaction. Confirmation requirements remain intact.

The ordinary Admin student-delete route now uses the same atomic SQL purge
instead of sequential application-table and Auth API deletions. Profile and
Young Learner purges cannot remove another identity's period history. A remaining
restrictive dependency fails the whole database transaction, not a late partial
cleanup.

Class purge counts current membership through period views, retains historical
period counts in its dependency preview, and clears only the obsolete raw Young
Learner pointer when its historical class is permanently deleted. That pointer
is made nullable; its foreign key is not removed or changed to cascading.
Young Learner identity survives class deletion. Normal class deletion still
refuses linked data using the shared dependency preview. No separate academic-
year permanent-delete endpoint exists; existing class/year foreign keys continue
to protect referenced years.

Soft disabling, ordinary removal, withdrawal and date correction never invoke
period/event deletion. Existing class-resource object-storage cleanup remains a
separate post-database operation in its existing route; it is not claimed to be
transactional with PostgreSQL.

## Stored-alert rollout reconciliation

The migration runs a set-based reconciliation after backfill. Its identity set
includes all stored register-entry identities plus existing alert identities,
including both student types. Only eligible P/A entries from completed,
non-closure registers enter the window/aggregate calculations.

- Last two eligible marked entries both absent: consecutive-absence condition.
- At least 15 eligible marked entries and present percentage below 70:
  low-attendance condition.
- Invalid active episodes are resolved, not deleted. Historical timestamps,
  Admin follow-up and resolved episodes are retained.
- Genuinely missing active episodes are inserted; existing active episodes are
  not duplicated or re-notified by an external messaging call.
- Repeating reconciliation makes no further change once conditions match.
- It runs in the migration transaction; an error rolls back schema/backfill and
  alert changes together. No outbound-email or message operation is added.

When eventually applied, the migration may legitimately update
`attendance_alerts.condition_active/resolved_at/updated_at` and create needed
alert episodes. It does not change attendance statuses or academic results.

## Legacy audit

Broad repository searches covered enrolment/enrollment, register/attendance,
absence/present/missed/percentage, membership, class_id, active and enrolled_at.
Read-only deployed function/policy catalogs were also checked because some
baseline helpers predate the repository migrations.

| Remaining reference / area | Classification and reason |
| --- | --- |
| Draft backfill SELECTs from both legacy enrolment tables | Relationship backfill: preserves known dates; guarded against ambiguity. |
| Draft `manage_class_enrolment_period` compatibility INSERTs | Relationship creation: same transaction as the authoritative period; current lookup never relies on these rows. |
| Draft student/class purge legacy DELETEs and preview counts | Explicit permanent deletion: preserve dependency accounting and remove legacy children before parents. |
| `app/api/admin/students/invite/route.ts` legacy lookup | Historical identity/setup guard: prevents a fresh invitation from overwriting an already-established student's profile/membership. Re-enrolment uses the Admin period controls. |
| `app/api/admin/accounts/[id]/set-password/route.ts` legacy lookup | Admin-only account classification, not attendance or class access. Future/withdrawn account holders may still need password management. |
| Admin Students / Classes legacy table-name labels | Display labels for accurate purge dependency counts, not roster filtering. |
| `enrolled_at` aliases on current views / rollover reads | Compatibility naming only: the value comes from period `starts_on`. |
| Original Friday, register, rollover, Mock and purge migrations | Historical definitions left untouched. Corresponding live functions are replaced by this draft. |
| Original `record_young_learner_enrolment` trigger function | Historical function retained, but its automatic pointer-based trigger is removed by this draft. |
| Student/Teacher messaging, announcements, homework and class ownership helpers | Authorization/current lookup: replaced with current period views; Homework direct-write RLS strengthened. |
| Mock review SQL | Authorization: current period view replaces legacy membership; formulas unchanged. |
| Friday result and register-entry reads in application code | Reporting/history: every such attendance read uses eligible views. Remaining raw Friday result access is the protected write path. |
| Young Learner base reads in follow-ups, Friday support, result-name lookups and name updates | Identity/name/history operations, not current-roster selection. Class Points write validation now uses the current view. |
| Friday support follow-up/session memberships | Separate targeted support-attendance relationship, intentionally not the Cambridge practice result-sheet membership model. |
| Other class_id / active fields | Classes, teachers, resources, exams, syllabus publication, closures and unrelated Staff Time state; not student joining dates. |

Deployed catalog membership-dependent functions found during this continuation
are all accounted for: ownership/announcement/homework helpers, register open,
Friday save, Mock review, rollover apply/revise/year switch and purge helpers.
No current-membership reader remains on a legacy enrolment table merely for
roster/attendance calculation.

## Backfill guards and Admin decisions

The migration does not assume production is still empty. It has not inspected
production records to decide whether these guards will pass.

It rejects ambiguous disabled/non-student/null-class profile relationships,
inactive or pointer-mismatched Young Learner legacy relationships, a Young
Learner pointer with no known enrolment date, multiple profile source classes in
one academic year, register/Friday snapshots without recoverable membership,
and applied rollover assignments without an exact recoverable target period.

Known `enrolled_at` values are retained. Lost transfer, joining or withdrawal
dates cannot be reconstructed from profile/class creation timestamps. An Admin
must supply evidence and review an explicit remediation before rollout if a
guard fires. The migration intentionally refuses to fabricate those dates.

The whole migration is forward-only and **not rerunnable** after application.
Supabase migration history governs one-time execution. Reconciliation,
cancellation and repeat application of an already-applied rollover are separately
idempotent.

## Test evidence and limitations

Current evidence:

- 26 focused enrolment tests, executing the actual full draft SQL in disposable
  PGlite with synthetic dependency fixtures and selected historical definitions.
- 5 request/consumer tests execute real NextRequest/Response handlers and actual
  role-checking/shared aggregation code, with synthetic Auth/database transport.
- Full repository suite: **128 passed, 0 failed, 0 skipped**.
- Coverage includes both identities, inclusive/exclusive boundaries, gaps,
  transfer rollback, same-class overlap rejection, stale register saves,
  completed-register rules, Friday individual-trigger and whole-sheet behavior,
  future cancellation, rollover preview/apply/repeat/revise/cancel, Young Learner
  rollover, already-effective revision rejection, purge previews/dependency
  order/forced rollback, real alert episodes and rollout idempotence, 15-record/
  below-70 thresholds, selected RLS dependency chains, grants/owners/search paths,
  index capability and unique callable overloads.
- Real HTTP handler tests reject anonymous, invalid-token, Student, Teacher and
  other non-Admin period mutations; reject cross-student progress; check Teacher
  class ownership; and verify the Admin actor comes from authentication.
- Shared and Admin class/level/overall consumers are tested against filtered-view
  transport responses; SQL filtering itself is separately exercised in PGlite.

These are **not** complete full-schema Supabase tests. The fixture tables model
the dependency paths used by these tests, not every deployed constraint,
extension, Auth/Storage relation, trigger or policy. PGlite serializes execution;
true concurrent sessions and PostgREST schema-cache exposure are not verified.
The entire requested authenticated end-to-end matrix is therefore not yet
established. These remain blocking verification items.

## Visual validation

No legitimate disposable authenticated Supabase environment was available.
Neither Docker nor psql was found on PATH. No production accounts were used,
no authentication was bypassed, and no screenshot/desktop/mobile success is
claimed.

Source/component review confirmed explicit labels, half-open wording, stable
period IDs, cancellation history, disabled pending controls, responsive
single-column mobile fields and an overflow-contained history table. TypeScript
and a clean Next production build pass. Actual desktop/mobile interactions,
hydration, console and accessibility checks still require the disposable
authenticated environment.

## Validation and migration history

- TypeScript: passed, `npx tsc --noEmit --incremental false`.
- Focused ESLint vs HEAD: no added diagnostics after normalizing line locations
  embedded in existing React diagnostic frames. Current: 195 errors / 11 warnings;
  HEAD across the same tracked paths: 204 errors / 11 warnings. These are existing
  baseline diagnostics, not a clean repository-wide lint result.
- `git diff --check`: passed. All untracked paths are also checked with
  `git diff --no-index --check /dev/null <path>`, without staging.
- Clean production build: passed, including TypeScript and 119 static pages.
  Previous build output is preserved outside the repository.
- Initial migration history ended at `20260909120000`; the migration was later
  applied successfully and local and remote history now match through
  `20260909130000`.
- The real database push was subsequently completed successfully; see the
  post-application release update below.

Exact dry-run output:

```text
Initialising login role...
DRY RUN: migrations will *not* be pushed to the database.
Connecting to remote database...
Would push these migrations:
 • 20260909130000_class_enrolment_periods.sql
{"upToDate":false,"dryRun":true,"migrations":["20260909130000_class_enrolment_periods.sql"],"seeds":[],"roles":[],"message":"Finished supabase db push."}
```

A dry run lists migration files; it does not execute their SQL or prove rollout
readiness.

## Final changed-file list

Paths below are relative to the repository. Staging is empty; all are unstaged
or untracked implementation work.

```text
 M app/admin/academic-years/rollover/page.tsx
 M app/admin/add-users/page.tsx
 M app/admin/classes/page.tsx
 M app/admin/page.tsx
 M app/admin/students/page.tsx
 M app/api/admin/students/create-bulk/route.ts
 M app/api/admin/students/create-manual/route.ts
 M app/api/admin/students/delete/route.ts
 M app/api/admin/students/invite/route.ts
 M app/api/admin/young-learners/create-bulk/route.ts
 M app/api/admin/young-learners/create/route.ts
 M app/api/admin/young-learners/update/route.ts
 M app/api/friday-tutorial-progress/route.ts
 M app/api/teacher/classes/[id]/class-points/route.ts
 M app/api/teacher/classes/[id]/homework/results/route.ts
 M app/api/teacher/friday-tutorial-results/route.ts
 M app/api/teacher/mock-results/route.ts
 M app/api/teacher/results/route.ts
 M app/api/teacher/student-progress/route.ts
 M app/api/teacher/young-learners/[studentId]/workspace/route.ts
 M app/teacher/class/page.tsx
 M app/teacher/my-classes/page.tsx
 M lib/academicYearRolloverRules.ts
 M lib/academicYearRolloverServer.ts
 M lib/academicYearsServer.ts
 M lib/adminAttendanceServer.ts
 M lib/adminClasses.ts
 M lib/adminStudents.ts
 M lib/classPointsServer.ts
 M lib/classRegisterServer.ts
 M lib/messages.ts
 M lib/studentCoursePlanningServer.ts
 M lib/studentInformation.ts
 M lib/teacherStudentMessagesServer.ts
 M lib/user.ts
?? app/api/admin/class-enrolments/route.ts
?? app/components/admin/AdminClassEnrolments.tsx
?? docs/class-enrolment-status.md
?? lib/classEnrolment.ts
?? lib/classEnrolmentServer.ts
?? supabase/migrations/20260909130000_class_enrolment_periods.sql
?? tests/classEnrolment.test.mjs
?? tests/classEnrolmentRoutes.test.mjs
```

## Required next step

### Incremental review — 10 September 2026

Only this status document changed during this review; application code, tests and
the draft SQL were left unchanged. The existing 43-path working set and empty
staging area were preserved.

- Re-ran only `tests/classEnrolment.test.mjs` and
  `tests/classEnrolmentRoutes.test.mjs`, using the existing external PGlite
  installation: **31 passed, 0 failed, 0 skipped**. This covers stale register and
  Friday submissions, rollover, permanent-purge rollback and alert reconciliation.
- Refreshed `npx supabase db push --dry-run`: exactly
  `20260909130000_class_enrolment_periods.sql`; `seeds: []`, `roles: []`.
  The exact output remains the same as the dry-run block above.
- Read deployed `pg_trigger` metadata for the affected membership, register,
  Friday-result and alert tables, plus the three attendance trigger-function
  definitions. No application records were read. Entry changes and register
  completion call `app_private.reconcile_attendance_alerts_for_student`, which
  the draft replaces with eligible-entry calculations. The completion trigger's
  raw-entry loop enumerates identities; it does not itself calculate attendance.
  The alert-table update trigger only sets `updated_at`; no outbound notification
  call was found in these inspected functions.
- Reviewed class share/update locks and the post-lock eligible-roster validation.
  Stale-payload rejection is tested. Actual competing database sessions are still
  untested; source inspection is not concurrency proof.
- No Docker/PostgreSQL runtime was found on PATH or in the checked conventional
  Docker.app, Postgres.app and Homebrew PostgreSQL 16 locations. PGlite remains
  available, but is not a full Supabase/Auth/PostgREST environment.
- Authenticated desktop/mobile verification remains unavailable without a
  legitimate disposable session/environment. Source layout checks and the prior
  passing build remain the evidence; neither is a visual end-to-end pass.
- No code changed, so TypeScript, lint, the full suite and the production build
  were not repeated. Their earlier results remain historical evidence.

**Legacy-date release gate:** the guard is a pre-application SQL stop, not an
Admin UI remediation workflow. The new period UI cannot resolve a failed
backfill before its tables exist. If a guard fires, do not disable the guard,
overwrite legacy dates with course/year starts, or treat profile creation as
joining evidence. An Admin must identify the affected class-specific membership,
provide the actual joining/withdrawal/transfer dates and supporting evidence,
and approve an independently reviewed remediation before another apply attempt.
Any such data remediation requires separate authorization; none was performed.
Passing the structural guards does not establish that every legacy `enrolled_at`
value reflects an historically accurate joining date. That provenance review is
still outstanding. No speculative UI/server change was made to conceal it.

**Historical release decision:** the targeted checks passed, but the initial
review had not yet completed full-schema/PostgREST or real concurrent-session
verification. The migration was later applied after the schema and focused
PostgREST checks passed; genuine multi-session contention remains unavailable.

### Focused blocker review — subsequent continuation, 10 September 2026

Changed only `app/components/admin/AdminClassEnrolments.tsx`,
`tests/classEnrolment.test.mjs` and this report in this continuation. The draft
migration was not changed.

**Catalog compatibility checks passed within the inspected scope:**

- The 19 existing functions replaced by the draft each have one matching
  deployed signature, including argument names and return types. Owners are
  postgres. Existing service-only RPC grants match the draft's intended boundary;
  the draft explicitly restricts the older broadly executable private helpers.
- PostgreSQL is 17.6; `btree_gist` 1.7 is already installed in `extensions`.
  The required roles and schemas exist. All 40 existing public table dependencies
  found in the draft's relation statements exist. The six new table/view names
  do not collide with deployed relations.
- Membership/register/Friday join keys have the expected UUID/date/text types.
  Service-role reads are granted on the inspected join columns; authenticated
  users cannot directly read the register tables. Relevant foreign keys and
  profile/class/Young Learner/result RLS policies were inspected against the
  draft. No incompatible definition was found in these checks.
- No `pgrst.db_schemas` or `pgrst.db_extra_search_path` entry was returned from
  database role-setting metadata. This does not establish the external
  PostgREST configuration. New view relationship discovery, schema-cache loading
  and real RPC HTTP execution cannot be verified on the unchanged deployed
  schema. Catalog compatibility is not a full-stack execution pass.
- The refreshed dry run lists exactly
  `20260909130000_class_enrolment_periods.sql`, with no seeds or role changes.
  No production application records were queried.

**Stale-save simulation passed:** added one focused SQL regression covering both
serialized orderings for both profile students and Young Learners. It loads a
30 September roster, then corrects joining from 15 September to 1 October before
or after a teacher save. Subsequent stale submissions fail; eligible rows,
present/absent totals and the denominator are all zero. An already-saved absence
remains stored but excluded. 1 October remains eligible. This executes the real
register and Admin RPCs with synthetic fixtures and rolls back every scenario.
PGlite still cannot prove actual multi-session waiting, lock contention or
transaction-isolation behavior.

**Admin wording gap addressed:** the enrolment panel and its existing blocking
save confirmation now explicitly require class-specific supporting registration,
withdrawal or transfer records and instruct Admin to stop if historical dates
are uncertain. Profile/course/year dates are explicitly not proof. This is an
Admin confirmation, not automated evidence verification or a new evidence store.
It does not replace the pre-migration backfill guard or authorize remediation.
Actual historical-date verification still needs Admin evidence; production
record inspection requires the user's explicit permission first.

**Validation this continuation:** focused SQL/helper test file: **27 passed,
0 failed, 0 skipped**; ESLint for the edited component and test: passed with no
diagnostics. Only wording and a test changed, so no full-suite/build rerun was
necessary. The previously reported build remains historical evidence. Browser
inventory exposed only an empty in-app browser, with no accessible authenticated
test session. Authenticated desktop/mobile behavior remains unverified; no
production student page was opened.

**Historical limitation:** read-only catalog checks and serialized-outcome
testing strengthened the evidence but did not clear actual concurrent-session
verification or historical-date provenance at that checkpoint. No files were
staged, committed, pushed or deployed at that checkpoint; the migration was
applied subsequently as recorded above.

The pre-application recommendation was to provision a disposable local
Supabase/PostgreSQL environment with the complete baseline schema, Auth and
PostgREST, then finish multi-session concurrency/full dependency tests and the
authenticated desktop/mobile matrix. The disposable runtime could not be
restarted, so genuine contention remains the only outstanding verification
note; the linked production migration has nevertheless been applied safely.

HISTORICAL STATUS: IMPLEMENTATION INCOMPLETE — REVIEW REQUIRED

## Post-application release update — 10 September 2026

Migration `20260909130000_class_enrolment_periods.sql` has since been applied
successfully to the linked Sydney School Portal production project. The local
schema-only baseline and focused PostgREST/RPC verification passed, and local
and remote migration histories now match through this migration. Read-only
post-application checks found the expected tables, views, RPCs and access
boundaries; existing student, class, attendance and register records were not
modified. The production application has not been deployed from this working
tree. Genuine two-session lock-contention testing remains unavailable because
the disposable runtime could not be restarted, so that limitation is retained
as the only outstanding verification note.
