-- Half-open class membership periods. Historical attendance is never rewritten.
-- DRAFT: do not apply before full-schema/PostgREST/concurrency validation,
-- independent security review and resolution of any guarded legacy ambiguity.
begin;
set local search_path = pg_catalog, public, extensions;
create extension if not exists btree_gist with schema extensions;

-- Keep the backfill and alert reconciliation on one stable set of relationships
-- and snapshots. Existing writers finish before the migration takes these locks;
-- new writes wait for the transaction to commit or roll back.
lock table public.academic_years,public.profiles,public.classes,public.young_learners,
  public.class_enrolments,public.young_learner_enrolments,
  public.academic_year_rollovers,public.academic_year_rollover_students,
  public.class_registers,public.class_register_entries,
  public.friday_tutorial_result_sheets,public.friday_tutorial_results,
  public.attendance_alerts in share row exclusive mode;

create table public.class_enrolment_periods (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes(id) on delete restrict,
  student_type text not null check (student_type in ('profile', 'young_learner')),
  profile_student_id uuid references public.profiles(id) on delete restrict,
  young_learner_id uuid references public.young_learners(id) on delete restrict,
  student_id uuid generated always as (coalesce(profile_student_id, young_learner_id)) stored,
  starts_on date not null,
  ends_before date,
  cancelled_at timestamptz,
  cancelled_by uuid references public.profiles(id) on delete restrict,
  created_by uuid references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  legacy_source text,
  constraint class_enrolment_period_identity check (
    (student_type = 'profile' and profile_student_id is not null and young_learner_id is null)
    or (student_type = 'young_learner' and young_learner_id is not null and profile_student_id is null)
  ),
  constraint class_enrolment_period_dates check (ends_before is null or ends_before > starts_on),
  constraint class_enrolment_period_cancellation check (
    (cancelled_at is null and cancelled_by is null) or
    (cancelled_at is not null and cancelled_by is not null
      and starts_on > (cancelled_at at time zone 'Europe/Madrid')::date)
  ),
  constraint class_enrolment_period_no_overlap exclude using gist (
    class_id with =, student_type with =, student_id with =,
    daterange(starts_on, ends_before, '[)') with &&
  ) where (cancelled_at is null)
);
create index class_enrolment_period_student_idx
  on public.class_enrolment_periods(student_type, student_id, class_id, starts_on);
alter table public.class_enrolment_periods owner to postgres;
alter table public.class_enrolment_periods enable row level security;
revoke all on public.class_enrolment_periods from public, anon, authenticated, service_role;
grant select on public.class_enrolment_periods to service_role;

-- We cannot infer departure dates for disabled or previously transferred pupils.
-- Refuse ambiguous legacy data rather than fabricate dates. An Admin must resolve
-- these cases through an independently reviewed migration before applying this file.
do $$
begin
  if exists (
      select 1 from public.class_enrolments e
      join public.profiles s on s.id = e.student_id
      where e.class_id is null or e.active = false or s.active = false or s.role is distinct from 'student'
    )
    or exists (
      select 1 from public.young_learner_enrolments e
      join public.young_learners s on s.id = e.young_learner_id
      where s.class_id is distinct from e.class_id or s.active = false
    )
    or exists (
      select 1 from public.young_learners s where s.class_id is not null
        and not exists(select 1 from public.young_learner_enrolments e
          where e.young_learner_id=s.id and e.class_id=s.class_id)
    )
  then
    raise exception 'Legacy enrolment history requires an Admin decision about missing withdrawal dates.';
  end if;
  if exists (
    select 1 from public.class_enrolments e
    join public.classes c on c.id=e.class_id
    where c.academic_year_id is not null
    group by e.student_id,c.academic_year_id having count(*) > 1
  ) then
    raise exception 'Multiple legacy classes in one academic year require an Admin decision about period boundaries.';
  end if;
  if exists (
    select 1 from public.class_register_entries e
    join public.class_registers r on r.id = e.register_id
    where not exists (select 1 from public.class_enrolments m
      where m.student_id = e.profile_student_id and m.class_id = r.class_id)
    and not exists (select 1 from public.young_learner_enrolments m
      where m.young_learner_id = e.young_learner_id and m.class_id = r.class_id)
  ) then
    raise exception 'Historical register entries have no recoverable membership; Admin review is required.';
  end if;
  if exists (
    select 1 from public.friday_tutorial_results r
    join public.friday_tutorial_result_sheets s on s.id = r.result_sheet_id
    where not exists (select 1 from public.class_enrolments e
      where e.student_id = r.student_id and e.class_id = s.class_id)
  ) then
    raise exception 'Historical Friday results have no recoverable membership; Admin review is required.';
  end if;
end;
$$;

insert into public.class_enrolment_periods
  (class_id, student_type, profile_student_id, starts_on, legacy_source)
select class_id, 'profile', student_id, enrolled_at, 'class_enrolments'
from public.class_enrolments;
insert into public.class_enrolment_periods
  (class_id, student_type, young_learner_id, starts_on, legacy_source)
select class_id, 'young_learner', young_learner_id, enrolled_at, 'young_learner_enrolments'
from public.young_learner_enrolments;

create or replace function public.is_class_member_on(
  p_class_id uuid, p_student_type text, p_student_id uuid, p_date date
) returns boolean language sql stable security definer
set search_path = pg_catalog, pg_temp
as $$
  select exists (
    select 1 from public.class_enrolment_periods p
    where p.class_id = p_class_id and p.student_type = p_student_type
      and p.student_id = p_student_id and p.cancelled_at is null and p.starts_on <= p_date
      and (p.ends_before is null or p_date < p.ends_before)
  );
$$;
alter function public.is_class_member_on(uuid,text,uuid,date) owner to postgres;
revoke all on function public.is_class_member_on(uuid,text,uuid,date) from public, anon, authenticated;
grant execute on function public.is_class_member_on(uuid,text,uuid,date) to service_role;

-- Service-only views retain invalid snapshots in the underlying tables for audit.
create view public.eligible_class_register_entries with (security_invoker = true) as
select e.* from public.class_register_entries e
join public.class_registers r on r.id = e.register_id
where public.is_class_member_on(r.class_id, e.student_type,
  coalesce(e.profile_student_id, e.young_learner_id), r.lesson_date);
create view public.eligible_friday_tutorial_results with (security_invoker = true) as
select result.* from public.friday_tutorial_results result
join public.friday_tutorial_result_sheets sheet on sheet.id = result.result_sheet_id
join public.friday_exam_practice_sessions session on session.id = sheet.tutorial_session_id
where public.is_class_member_on(sheet.class_id, 'profile', result.student_id, session.session_date);
alter view public.eligible_class_register_entries owner to postgres;
alter view public.eligible_friday_tutorial_results owner to postgres;
revoke all on public.eligible_class_register_entries, public.eligible_friday_tutorial_results from public, anon, authenticated;
grant select on public.eligible_class_register_entries, public.eligible_friday_tutorial_results to service_role;

-- Preserve the existing Teacher authorization, lifecycle and status validation.
create or replace function public.open_class_register(
  p_actor_id uuid,
  p_class_id uuid,
  p_lesson_date date,
  p_scheduled_start_time time,
  p_scheduled_end_time time,
  p_roster jsonb
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_register_id uuid;
  v_is_cambridge boolean;
  v_today date := (now() at time zone 'Europe/Madrid')::date;
  v_time time := (now() at time zone 'Europe/Madrid')::time;
begin
  -- Serialize period corrections against roster snapshot creation.
  perform id from public.classes where id = p_class_id for share;
  select coalesce(classroom.is_cambridge, false)
  into v_is_cambridge
  from public.classes classroom
  inner join public.profiles actor on actor.id = p_actor_id
  where classroom.id = p_class_id
    and classroom.teacher_id = p_actor_id
    and actor.role = 'teacher';

  if not found then
    raise exception 'Class Register access denied' using errcode = '42501';
  end if;

  if p_lesson_date is null
    or p_scheduled_start_time is null
    or p_scheduled_end_time is null
    or p_scheduled_end_time <= p_scheduled_start_time then
    raise exception 'Invalid scheduled lesson';
  end if;

  if p_lesson_date > v_today
    or (
      p_lesson_date = v_today
      and p_scheduled_start_time > v_time
    ) then
    raise exception 'Future Class Registers cannot be opened';
  end if;

  select register.id
  into v_register_id
  from public.class_registers register
  where register.class_id = p_class_id
    and register.lesson_date = p_lesson_date
    and register.scheduled_start_time = p_scheduled_start_time;

  if found then
    return v_register_id;
  end if;

  if jsonb_typeof(p_roster) is distinct from 'array' then
    raise exception 'Invalid Class Register roster';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_roster) item
    where jsonb_typeof(item) is distinct from 'object'
  ) then
    raise exception 'Invalid Class Register roster';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_roster) item
    where exists (
      select 1
      from jsonb_object_keys(item) key
      where key not in (
        'student_type',
        'profile_student_id',
        'young_learner_id'
      )
    )
  ) then
    raise exception 'Unsupported Class Register roster fields';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_roster) as submitted(
      student_type text,
      profile_student_id uuid,
      young_learner_id uuid
    )
    where (
      v_is_cambridge
      and (
        submitted.student_type is distinct from 'profile'
        or submitted.profile_student_id is null
        or submitted.young_learner_id is not null
      )
    )
    or (
      not v_is_cambridge
      and (
        submitted.student_type is distinct from 'young_learner'
        or submitted.profile_student_id is not null
        or submitted.young_learner_id is null
      )
    )
  ) then
    raise exception 'Invalid Class Register student identity';
  end if;

  if exists (
    select submitted.profile_student_id
    from jsonb_to_recordset(p_roster) as submitted(
      student_type text,
      profile_student_id uuid,
      young_learner_id uuid
    )
    where submitted.profile_student_id is not null
    group by submitted.profile_student_id
    having count(*) > 1
  ) or exists (
    select submitted.young_learner_id
    from jsonb_to_recordset(p_roster) as submitted(
      student_type text,
      profile_student_id uuid,
      young_learner_id uuid
    )
    where submitted.young_learner_id is not null
    group by submitted.young_learner_id
    having count(*) > 1
  ) then
    raise exception 'Duplicate Class Register students are not allowed';
  end if;

  if exists (
    select 1 from jsonb_to_recordset(p_roster) as submitted(
      student_type text, profile_student_id uuid, young_learner_id uuid
    )
    where not public.is_class_member_on(p_class_id, submitted.student_type,
      coalesce(submitted.profile_student_id, submitted.young_learner_id), p_lesson_date)
  ) then
    raise exception 'The submitted roster contains a student outside their enrolment period';
  end if;

  insert into public.class_registers (
    class_id,
    lesson_date,
    scheduled_start_time,
    scheduled_end_time,
    created_by
  )
  values (
    p_class_id,
    p_lesson_date,
    p_scheduled_start_time,
    p_scheduled_end_time,
    p_actor_id
  )
  on conflict (class_id, lesson_date, scheduled_start_time) do nothing
  returning id into v_register_id;

  if v_register_id is null then
    select register.id
    into v_register_id
    from public.class_registers register
    where register.class_id = p_class_id
      and register.lesson_date = p_lesson_date
      and register.scheduled_start_time = p_scheduled_start_time;

    return v_register_id;
  end if;

  insert into public.class_register_entries (
    register_id,
    student_type,
    profile_student_id,
    young_learner_id
  )
  select
    v_register_id,
    submitted.student_type,
    submitted.profile_student_id,
    submitted.young_learner_id
  from jsonb_to_recordset(p_roster) as submitted(
    student_type text,
    profile_student_id uuid,
    young_learner_id uuid
  );

  return v_register_id;
end;
$$;

create or replace function public.save_class_register_attendance(
  p_actor_id uuid,
  p_register_id uuid,
  p_entries jsonb,
  p_complete boolean
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_register public.class_registers%rowtype;
  v_now timestamptz := now();
  v_today date := (now() at time zone 'Europe/Madrid')::date;
  v_time time := (now() at time zone 'Europe/Madrid')::time;
  v_entry_count integer;
  v_payload_count integer;
begin
  if not exists (
    select 1
    from public.profiles actor
    where actor.id = p_actor_id
      and actor.role = 'teacher'
  ) then
    raise exception 'Teacher access required' using errcode = '42501';
  end if;

  select register.*
  into v_register
  from public.class_registers register
  join public.classes classroom on classroom.id = register.class_id
  where register.id = p_register_id
    and classroom.teacher_id = p_actor_id
  for update of register;

  if not found then
    raise exception 'Class Register was not found' using errcode = 'P0002';
  end if;

  perform id from public.classes where id = v_register.class_id for share;

  if v_register.lesson_date > v_today
    or (
      v_register.lesson_date = v_today
      and v_register.scheduled_start_time > v_time
    ) then
    raise exception 'Future Class Registers cannot be edited';
  end if;

  if jsonb_typeof(p_entries) is distinct from 'array' then
    raise exception 'Invalid Class Register entries';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_entries) item
    where jsonb_typeof(item) is distinct from 'object'
  ) then
    raise exception 'Invalid Class Register entries';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_entries) item
    where exists (
      select 1
      from jsonb_object_keys(item) key
      where key not in ('entry_id', 'attendance_status')
    )
  ) then
    raise exception 'Unsupported Class Register entry fields';
  end if;

  select count(*)
  into v_entry_count
  from public.eligible_class_register_entries entry
  where entry.register_id = v_register.id;

  select count(*), count(distinct submitted.entry_id)
  into v_payload_count, v_entry_count
  from jsonb_to_recordset(p_entries) as submitted(
    entry_id uuid,
    attendance_status text
  );

  if v_payload_count <> v_entry_count then
    raise exception 'Duplicate Class Register entries are not allowed';
  end if;

  select count(*)
  into v_entry_count
  from public.eligible_class_register_entries entry
  where entry.register_id = v_register.id;

  if v_payload_count <> v_entry_count
    or exists (
      select 1
      from jsonb_to_recordset(p_entries) as submitted(
        entry_id uuid,
        attendance_status text
      )
      where not exists (
        select 1
        from public.eligible_class_register_entries entry
        where entry.id = submitted.entry_id
          and entry.register_id = v_register.id
      )
    ) then
    raise exception 'The submitted roster does not match this Class Register';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_entries) as submitted(
      entry_id uuid,
      attendance_status text
    )
    where submitted.attendance_status is not null
      and submitted.attendance_status not in ('present', 'absent')
  ) then
    raise exception 'Attendance must be Present or Absent';
  end if;

  if coalesce(p_complete, false) and exists (
    select 1
    from jsonb_to_recordset(p_entries) as submitted(
      entry_id uuid,
      attendance_status text
    )
    where submitted.attendance_status is null
  ) then
    raise exception 'Mark every student Present or Absent before completing the register';
  end if;

  if not coalesce(p_complete, false) and v_register.completed_at is not null then
    raise exception 'Completed Class Registers must remain complete';
  end if;

  update public.class_register_entries entry
  set
    attendance_status = submitted.attendance_status,
    marked_at = case
      when submitted.attendance_status is null then null
      else v_now
    end,
    marked_by = case
      when submitted.attendance_status is null then null
      else p_actor_id
    end
  from jsonb_to_recordset(p_entries) as submitted(
    entry_id uuid,
    attendance_status text
  )
  where entry.id = submitted.entry_id
    and entry.register_id = v_register.id
    and entry.attendance_status is distinct from submitted.attendance_status;

  if coalesce(p_complete, false) then
    update public.class_registers
    set
      completed_at = coalesce(completed_at, v_now),
      completed_by = coalesce(completed_by, p_actor_id)
    where id = v_register.id;
  end if;

  return v_register.id;
end;
$$;

create or replace function app_private.reconcile_attendance_alerts_for_student(
  p_class_id uuid,
  p_student_type text,
  p_profile_student_id uuid,
  p_young_learner_id uuid
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_present_count integer := 0;
  v_absent_count integer := 0;
  v_total_count integer := 0;
  v_consecutive_absence boolean := false;
  v_low_attendance boolean := false;
begin
  if not (
    (
      p_student_type = 'profile'
      and p_profile_student_id is not null
      and p_young_learner_id is null
    )
    or (
      p_student_type = 'young_learner'
      and p_profile_student_id is null
      and p_young_learner_id is not null
    )
  ) then
    raise exception 'Invalid attendance alert student identity';
  end if;

  with ordered_attendance as (
    select
      entry.attendance_status,
      row_number() over (
        order by
          register.lesson_date desc,
          register.scheduled_start_time desc,
          register.id desc
      ) as attendance_position
    from public.eligible_class_register_entries entry
    inner join public.class_registers register
      on register.id = entry.register_id
    where register.class_id = p_class_id
      and register.completed_at is not null
      and entry.attendance_status in ('present', 'absent')
      and entry.student_type = p_student_type
      and entry.profile_student_id is not distinct from p_profile_student_id
      and entry.young_learner_id is not distinct from p_young_learner_id
      and not public.is_school_closed(register.lesson_date)
  )
  select
    count(*) = 2
    and count(*) filter (where attendance_status = 'absent') = 2
  into v_consecutive_absence
  from ordered_attendance
  where attendance_position <= 2;

  select
    count(*) filter (where entry.attendance_status = 'present'),
    count(*) filter (where entry.attendance_status = 'absent')
  into v_present_count, v_absent_count
  from public.eligible_class_register_entries entry
  inner join public.class_registers register
    on register.id = entry.register_id
  where register.class_id = p_class_id
    and register.completed_at is not null
    and entry.attendance_status in ('present', 'absent')
    and entry.student_type = p_student_type
    and entry.profile_student_id is not distinct from p_profile_student_id
    and entry.young_learner_id is not distinct from p_young_learner_id
    and not public.is_school_closed(register.lesson_date);

  v_total_count := v_present_count + v_absent_count;
  v_low_attendance := case
    when v_total_count >= 15
      then (v_present_count::numeric * 100 / v_total_count) < 70
    else false
  end;

  perform app_private.sync_attendance_alert_episode(
    p_class_id,
    'consecutive_absence',
    p_student_type,
    p_profile_student_id,
    p_young_learner_id,
    v_consecutive_absence
  );

  perform app_private.sync_attendance_alert_episode(
    p_class_id,
    'low_attendance',
    p_student_type,
    p_profile_student_id,
    p_young_learner_id,
    v_low_attendance
  );
end;
$$;

-- CREATE OR REPLACE preserves the existing restricted execution ACLs.
alter function public.open_class_register(uuid,uuid,date,time,time,jsonb) owner to postgres;
alter function public.save_class_register_attendance(uuid,uuid,jsonb,boolean) owner to postgres;
alter function app_private.reconcile_attendance_alerts_for_student(uuid,text,uuid,uuid) owner to postgres;

create or replace function public.save_friday_tutorial_result_sheet(
  p_actor_id uuid,
  p_tutorial_session_id uuid,
  p_class_id uuid,
  p_results jsonb
)
returns table (
  result_sheet_id uuid,
  created_or_updated_count integer,
  attended_count integer,
  absent_count integer,
  first_submission boolean
)
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_actor_role text;
  v_class record;
  v_class_level text;
  v_session record;
  v_session_level text;
  v_session_date date;
  v_today_madrid date := (now() at time zone 'Europe/Madrid')::date;
  v_sheet record;
  v_result_sheet_id uuid;
  v_expected_count integer := 0;
  v_submitted_count integer := 0;
  v_duplicate_count integer := 0;
  v_invalid_count integer := 0;
  v_unknown_count integer := 0;
  v_missing_count integer := 0;
begin
  perform id from public.classes where id = p_class_id for share;
  select role
  into v_actor_role
  from public.profiles
  where id = p_actor_id;

  if v_actor_role is null or v_actor_role not in ('teacher', 'admin') then
    raise exception using message = 'unauthorized';
  end if;

  select
    c.id,
    c.teacher_id,
    c.level_id,
    c.is_cambridge,
    l.name as level_name
  into v_class
  from public.classes c
  left join public.levels l on l.id = c.level_id
  where c.id = p_class_id;

  if not found then
    raise exception using message = 'class_not_found';
  end if;

  if coalesce(v_class.is_cambridge, false) is not true then
    raise exception using message = 'class_not_cambridge';
  end if;

  v_class_level := upper(trim(coalesce(v_class.level_name, '')));

  if v_class_level not in ('B1', 'B2', 'C1', 'C2') then
    raise exception using message = 'unsupported_class_level';
  end if;

  if v_actor_role = 'teacher' and v_class.teacher_id is distinct from p_actor_id then
    raise exception using message = 'teacher_not_assigned_to_class';
  end if;

  select *
  into v_session
  from public.friday_exam_practice_sessions
  where id = p_tutorial_session_id;

  if not found then
    raise exception using message = 'session_not_found';
  end if;

  if coalesce(v_session.active, false) is not true then
    raise exception using message = 'inactive_session';
  end if;

  v_session_date := v_session.session_date::date;

  if v_session_date > v_today_madrid then
    raise exception using message = 'future_session';
  end if;

  v_session_level := upper(trim(coalesce(v_session.level_name, '')));

  if v_session_level <> v_class_level then
    raise exception using message = 'session_level_mismatch';
  end if;

  if p_results is null or jsonb_typeof(p_results) <> 'array' then
    raise exception using message = 'invalid_results_payload';
  end if;

  select count(*)
  into v_invalid_count
  from jsonb_array_elements(p_results) as item(value)
  where jsonb_typeof(value) <> 'object'
    or not (value ? 'student_id')
    or not (
      (value ->> 'student_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    )
    or (
      value ? 'percentage'
      and jsonb_typeof(value -> 'percentage') <> 'null'
      and nullif(trim(value ->> 'percentage'), '') is not null
      and not ((value ->> 'percentage') ~ '^[[:space:]]*[0-9]+(\.[0-9]+)?[[:space:]]*$')
    );

  if v_invalid_count > 0 then
    raise exception using message = 'invalid_results_payload';
  end if;

  drop table if exists pg_temp.friday_tutorial_submitted;
  create temporary table friday_tutorial_submitted (
    student_id uuid not null,
    percentage numeric(5,2) null
  ) on commit drop;

  insert into friday_tutorial_submitted (student_id, percentage)
  select
    (value ->> 'student_id')::uuid,
    case
      when not (value ? 'percentage') then null
      when jsonb_typeof(value -> 'percentage') = 'null' then null
      when nullif(trim(value ->> 'percentage'), '') is null then null
      else round((value ->> 'percentage')::numeric, 2)
    end
  from jsonb_array_elements(p_results) as item(value);

  select count(*)
  into v_invalid_count
  from friday_tutorial_submitted
  where percentage is not null
    and (percentage < 0 or percentage > 100);

  if v_invalid_count > 0 then
    raise exception using message = 'percentage_out_of_range';
  end if;

  select count(*) - count(distinct student_id)
  into v_duplicate_count
  from friday_tutorial_submitted;

  if v_duplicate_count > 0 then
    raise exception using message = 'duplicate_students';
  end if;

  select *
  into v_sheet
  from public.friday_tutorial_result_sheets
  where tutorial_session_id = p_tutorial_session_id
    and class_id = p_class_id
  for update;

  first_submission := not found;

  drop table if exists pg_temp.friday_tutorial_expected;
  create temporary table friday_tutorial_expected (
    student_id uuid primary key
  ) on commit drop;

  if first_submission then
    insert into friday_tutorial_expected (student_id)
    select ce.student_id
    from public.class_enrolment_periods ce
    inner join public.profiles p on p.id = ce.student_id
    where ce.class_id = p_class_id
      and ce.student_type = 'profile'
      and ce.cancelled_at is null
      and ce.starts_on <= v_session_date
      and (ce.ends_before is null or v_session_date < ce.ends_before)
      and p.role = 'student';
  else
    insert into friday_tutorial_expected (student_id)
    select result.student_id
    from public.eligible_friday_tutorial_results result
    where result.result_sheet_id = v_sheet.id;
  end if;

  select count(*)
  into v_expected_count
  from friday_tutorial_expected;

  if v_expected_count = 0 then
    raise exception using message = 'no_eligible_students';
  end if;

  select count(*)
  into v_submitted_count
  from friday_tutorial_submitted;

  if v_submitted_count <> v_expected_count then
    raise exception using message = 'submitted_student_count_mismatch';
  end if;

  select count(*)
  into v_unknown_count
  from friday_tutorial_submitted submitted
  left join friday_tutorial_expected expected using (student_id)
  where expected.student_id is null;

  if v_unknown_count > 0 then
    raise exception using message = 'unexpected_students';
  end if;

  select count(*)
  into v_missing_count
  from friday_tutorial_expected expected
  left join friday_tutorial_submitted submitted using (student_id)
  where submitted.student_id is null;

  if v_missing_count > 0 then
    raise exception using message = 'missing_students';
  end if;

  if first_submission then
    insert into public.friday_tutorial_result_sheets (
      tutorial_session_id,
      class_id,
      submitted_by,
      updated_by
    )
    values (
      p_tutorial_session_id,
      p_class_id,
      p_actor_id,
      p_actor_id
    )
    returning id into v_result_sheet_id;
  else
    update public.friday_tutorial_result_sheets
    set
      updated_at = now(),
      updated_by = p_actor_id
    where id = v_sheet.id
    returning id into v_result_sheet_id;
  end if;

  insert into public.friday_tutorial_results (
    result_sheet_id,
    student_id,
    percentage,
    attended
  )
  select
    v_result_sheet_id,
    submitted.student_id,
    submitted.percentage,
    submitted.percentage is not null
  from friday_tutorial_submitted submitted
  on conflict on constraint friday_tutorial_results_sheet_student_key
  do update set
    percentage = excluded.percentage,
    attended = excluded.attended,
    updated_at = now();

  select count(*)
  into created_or_updated_count
  from friday_tutorial_submitted;

  result_sheet_id := v_result_sheet_id;

  select count(*)
  into attended_count
  from friday_tutorial_submitted
  where percentage is not null;

  absent_count := created_or_updated_count - attended_count;

  return next;
end;
$$;

revoke all on function public.open_class_register(uuid,uuid,date,time,time,jsonb),
  public.save_class_register_attendance(uuid,uuid,jsonb,boolean),
  public.save_friday_tutorial_result_sheet(uuid,uuid,uuid,jsonb),
  app_private.reconcile_attendance_alerts_for_student(uuid,text,uuid,uuid)
  from public, anon, authenticated;
grant execute on function public.open_class_register(uuid,uuid,date,time,time,jsonb),
  public.save_class_register_attendance(uuid,uuid,jsonb,boolean),
  public.save_friday_tutorial_result_sheet(uuid,uuid,uuid,jsonb) to service_role;
alter function public.save_friday_tutorial_result_sheet(uuid,uuid,uuid,jsonb) owner to postgres;

-- Cover the single-student Friday API as well as the whole-sheet RPC.
create or replace function app_private.check_friday_result_enrolment()
returns trigger language plpgsql security definer
set search_path = pg_catalog, pg_temp
as $$
declare v_class_id uuid; v_date date;
begin
  select s.class_id, session.session_date into v_class_id, v_date
  from public.friday_tutorial_result_sheets s
  join public.friday_exam_practice_sessions session on session.id = s.tutorial_session_id
  where s.id = new.result_sheet_id;
  perform id from public.classes where id = v_class_id for share;
  if not public.is_class_member_on(v_class_id, 'profile', new.student_id, v_date) then
    raise exception 'The student is outside their class enrolment period.' using errcode = '23514';
  end if;
  return new;
end;
$$;
alter function app_private.check_friday_result_enrolment() owner to postgres;
revoke all on function app_private.check_friday_result_enrolment() from public, anon, authenticated, service_role;
create trigger friday_result_enrolment_check
before insert or update of result_sheet_id, student_id, percentage, attended
on public.friday_tutorial_results
for each row execute function app_private.check_friday_result_enrolment();

-- Current-class reads are derived at query time. A future transfer must not
-- require a midnight job or prematurely replace the old class pointer.
create or replace function app_private.can_read_class_enrolment(p_class_id uuid,p_type text,p_student_id uuid)
returns boolean language sql stable security definer
set search_path = pg_catalog, pg_temp
as $$
  select exists(select 1 from public.profiles actor where actor.id=auth.uid() and (
    actor.role='admin' or (actor.role='student' and p_type='profile' and actor.id=p_student_id)
    or (actor.role='teacher' and exists(select 1 from public.classes c where c.id=p_class_id and c.teacher_id=actor.id))
  ));
$$;
alter function app_private.can_read_class_enrolment(uuid,text,uuid) owner to postgres;
revoke all on function app_private.can_read_class_enrolment(uuid,text,uuid) from public, anon;
grant execute on function app_private.can_read_class_enrolment(uuid,text,uuid) to authenticated, service_role;
grant select(id,class_id,student_type,student_id,profile_student_id,young_learner_id,starts_on,ends_before,cancelled_at,created_at)
on public.class_enrolment_periods to authenticated;
create policy class_enrolment_periods_read on public.class_enrolment_periods
for select to authenticated using(app_private.can_read_class_enrolment(class_id,student_type,student_id));

create or replace function app_private.class_date_is_current(p_class_id uuid,p_date date)
returns boolean language sql stable security definer set search_path=pg_catalog,pg_temp as $$
  select coalesce((select p_date between
    greatest(y.start_date,case when c.start_date is not null and c.end_date is not null then c.start_date end)
    and least(y.end_date,case when c.start_date is not null and c.end_date is not null then c.end_date end)
    from public.classes c left join public.academic_years y on y.id=c.academic_year_id where c.id=p_class_id),false);
$$;
alter function app_private.class_date_is_current(uuid,date) owner to postgres;
revoke all on function app_private.class_date_is_current(uuid,date) from public,anon;
grant execute on function app_private.class_date_is_current(uuid,date) to authenticated,service_role;

create view public.current_class_enrolments with(security_invoker=true) as
select p.id,p.student_id,p.class_id,true as active,p.created_at,p.starts_on as enrolled_at
from public.class_enrolment_periods p
where p.student_type='profile' and p.cancelled_at is null
  and p.starts_on <= (now() at time zone 'Europe/Madrid')::date
  and (p.ends_before is null or (now() at time zone 'Europe/Madrid')::date < p.ends_before)
  and app_private.class_date_is_current(p.class_id,(now() at time zone 'Europe/Madrid')::date);
create view public.current_young_learners with(security_invoker=true) as
select y.id,y.first_name,y.last_name,current_period.class_id,y.active,y.created_at,y.updated_at
from public.young_learners y
left join lateral (
  select p.class_id from public.class_enrolment_periods p
  where p.student_type='young_learner' and p.student_id=y.id and p.cancelled_at is null
    and p.starts_on <= (now() at time zone 'Europe/Madrid')::date
    and (p.ends_before is null or (now() at time zone 'Europe/Madrid')::date < p.ends_before)
    and app_private.class_date_is_current(p.class_id,(now() at time zone 'Europe/Madrid')::date)
  order by p.starts_on desc,p.id limit 1
) current_period on true;
alter view public.current_class_enrolments owner to postgres;
alter view public.current_young_learners owner to postgres;
revoke all on public.current_class_enrolments,public.current_young_learners from public,anon;
grant select on public.current_class_enrolments,public.current_young_learners to authenticated,service_role;

-- Preserve the existing ownership policies, replacing only their relationship
-- lookup. These helpers also govern messaging, homework and announcements.
create or replace function app_private.student_in_class(p_class_id uuid)
returns boolean language sql stable security definer set search_path=pg_catalog,pg_temp as $$
  select exists(select 1 from public.current_class_enrolments where class_id=p_class_id and student_id=auth.uid());
$$;
create or replace function app_private.student_can_access_teacher(p_teacher_id uuid)
returns boolean language sql stable security definer set search_path=pg_catalog,pg_temp as $$
  select exists(select 1 from public.current_class_enrolments ce join public.classes c on c.id=ce.class_id
    where ce.student_id=auth.uid() and c.teacher_id=p_teacher_id);
$$;
create or replace function app_private.teacher_teaches_student(p_student_id uuid)
returns boolean language sql stable security definer set search_path=pg_catalog,pg_temp as $$
  select exists(select 1 from public.current_class_enrolments ce join public.classes c on c.id=ce.class_id
    where ce.student_id=p_student_id and c.teacher_id=auth.uid());
$$;
create or replace function app_private.teacher_owns_young_learner(p_young_learner_id uuid)
returns boolean language sql stable security definer set search_path=pg_catalog,pg_temp as $$
  select exists(select 1 from public.class_enrolment_periods p join public.classes c on c.id=p.class_id
    where p.student_type='young_learner' and p.student_id=p_young_learner_id and c.teacher_id=auth.uid() and p.cancelled_at is null
      and p.starts_on <= (now() at time zone 'Europe/Madrid')::date
      and (p.ends_before is null or (now() at time zone 'Europe/Madrid')::date < p.ends_before)
      and app_private.class_date_is_current(p.class_id,(now() at time zone 'Europe/Madrid')::date));
$$;
create or replace function app_private.student_announcement_allowed(p_classes_id uuid,p_audience_type text,p_target_level text)
returns boolean language sql stable security definer set search_path=pg_catalog,pg_temp as $$
  select exists(select 1 from public.current_class_enrolments ce join public.classes c on c.id=ce.class_id
    left join public.levels l on l.id=c.level_id where ce.student_id=auth.uid() and (
      p_classes_id=c.id or lower(coalesce(p_target_level,''))=lower(coalesce(l.name,''))
      or lower(coalesce(p_audience_type,'')) in ('all students','all_students','all cambridge students','all_cambridge_students','all-cambridge-students')
      or lower(coalesce(p_audience_type,'')) like '%cambridge%'));
$$;
create or replace function app_private.user_can_access_cambridge_homework(p_level text,p_course_type text)
returns boolean language sql stable security definer set search_path=pg_catalog,pg_temp as $$
  select exists(select 1 from public.classes c join public.levels l on l.id=c.level_id
    left join public.current_class_enrolments ce on ce.class_id=c.id
    where lower(coalesce(l.name,''))=lower(coalesce(p_level,''))
      and lower(coalesce(c.course_type,''))=lower(coalesce(p_course_type,''))
      and (c.teacher_id=auth.uid() or ce.student_id=auth.uid()));
$$;
drop policy if exists young_learners_select_allowed on public.young_learners;
create policy young_learners_select_allowed on public.young_learners for select to authenticated
using (app_private.is_admin() or app_private.teacher_owns_young_learner(id));

alter function app_private.student_in_class(uuid) owner to postgres;
alter function app_private.student_can_access_teacher(uuid) owner to postgres;
alter function app_private.teacher_teaches_student(uuid) owner to postgres;
alter function app_private.teacher_owns_young_learner(uuid) owner to postgres;
alter function app_private.student_announcement_allowed(uuid,text,text) owner to postgres;
alter function app_private.user_can_access_cambridge_homework(text,text) owner to postgres;
revoke all on function app_private.student_in_class(uuid),app_private.student_can_access_teacher(uuid),
  app_private.teacher_teaches_student(uuid),app_private.teacher_owns_young_learner(uuid),
  app_private.student_announcement_allowed(uuid,text,text),app_private.user_can_access_cambridge_homework(text,text)
  from public,anon;
grant execute on function app_private.student_in_class(uuid),app_private.student_can_access_teacher(uuid),
  app_private.teacher_teaches_student(uuid),app_private.teacher_owns_young_learner(uuid),
  app_private.student_announcement_allowed(uuid,text,text),app_private.user_can_access_cambridge_homework(text,text)
  to authenticated,service_role;

create table public.class_enrolment_period_events (
  id uuid primary key default gen_random_uuid(),
  period_id uuid not null references public.class_enrolment_periods(id) on delete restrict,
  actor_id uuid not null references public.profiles(id) on delete restrict,
  action text not null check (action in ('enrol','transfer','withdraw','correct','cancel')),
  previous_period jsonb,
  resulting_period jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.class_enrolment_period_events owner to postgres;
alter table public.class_enrolment_period_events enable row level security;
revoke all on public.class_enrolment_period_events from public, anon, authenticated, service_role;
grant select on public.class_enrolment_period_events to service_role;
create index class_enrolment_period_events_period_idx
  on public.class_enrolment_period_events(period_id,created_at,id);

-- Direct authenticated Homework writes must obey the same current-roster rule
-- as their HTTP handlers. Historical result reads and score formulas stay intact.
create or replace function app_private.can_record_current_student_result(p_class_id uuid,p_student_id uuid)
returns boolean language sql stable security definer set search_path=pg_catalog,pg_temp as $$
  select app_private.teacher_owns_class(p_class_id) and exists(
    select 1 from public.current_class_enrolments where class_id=p_class_id and student_id=p_student_id);
$$;
alter function app_private.can_record_current_student_result(uuid,uuid) owner to postgres;
revoke all on function app_private.can_record_current_student_result(uuid,uuid) from public,anon;
grant execute on function app_private.can_record_current_student_result(uuid,uuid) to authenticated,service_role;
drop policy if exists results_insert_allowed on public.results;
create policy results_insert_allowed on public.results for insert to authenticated with check(
  app_private.is_admin() or (result_type='homework' and app_private.can_record_current_student_result(class_id,student_id)));
drop policy if exists results_update_allowed on public.results;
create policy results_update_allowed on public.results for update to authenticated using(
  app_private.is_admin() or (result_type='homework' and app_private.can_record_current_student_result(class_id,student_id)))
with check(app_private.is_admin() or (result_type='homework' and app_private.can_record_current_student_result(class_id,student_id)));
drop policy if exists results_delete_allowed on public.results;
create policy results_delete_allowed on public.results for delete to authenticated using(
  app_private.is_admin() or (result_type='homework' and app_private.can_record_current_student_result(class_id,student_id)));

create or replace function public.manage_class_enrolment_period(
  p_actor_id uuid, p_student_type text, p_student_id uuid, p_action text,
  p_class_id uuid, p_starts_on date, p_ends_before date, p_period_id uuid
) returns uuid language plpgsql security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_old public.class_enrolment_periods%rowtype;
  v_new public.class_enrolment_periods%rowtype;
  v_class public.classes%rowtype;
  v_year public.academic_years%rowtype;
  v_start date; v_end date;
begin
  if auth.role() is distinct from 'service_role' or not exists (
    select 1 from public.profiles where id=p_actor_id and role='admin' and active is distinct from false
  ) then
    raise exception 'Admin access required.' using errcode='42501';
  end if;
  if p_student_type is null or p_student_type not in ('profile','young_learner')
    or p_student_id is null or p_action is null or p_action not in ('enrol','transfer','withdraw','correct','cancel') then
    raise exception 'Invalid enrolment operation.' using errcode='22023';
  end if;
  -- One student's concurrent Admin operations must serialize even across classes.
  perform pg_advisory_xact_lock(hashtextextended('class-enrolment:' || p_student_type || ':' || p_student_id::text,0));
  if (p_student_type='profile' and not exists(select 1 from public.profiles where id=p_student_id and role='student'))
    or (p_student_type='young_learner' and not exists(select 1 from public.young_learners where id=p_student_id)) then
    raise exception 'Student was not found.' using errcode='22023';
  end if;
  if p_action <> 'enrol' then
    select * into v_old from public.class_enrolment_periods
      where id=p_period_id and student_type=p_student_type and student_id=p_student_id for update;
    if not found then
      raise exception 'Enrolment period was not found.' using errcode='22023';
    end if;
  elsif p_period_id is not null then
    raise exception 'A new enrolment must not reuse a period.' using errcode='22023';
  end if;
  -- Lock classes in a deterministic order, against register and Friday saves.
  perform id from public.classes where id=p_class_id or id=v_old.class_id order by id for update;

  if p_action in ('withdraw','correct','cancel') and p_class_id is distinct from v_old.class_id then
    raise exception 'A date correction cannot change the class.' using errcode='22023';
  end if;
  if v_old.cancelled_at is not null then
    if p_action='cancel' then return v_old.id; end if;
    raise exception 'A cancelled period is immutable; create a new enrolment.' using errcode='22023';
  end if;
  if p_action='cancel' then
    if v_old.starts_on <= (now() at time zone 'Europe/Madrid')::date
      or p_starts_on is distinct from v_old.starts_on
      or p_ends_before is distinct from v_old.ends_before then
      raise exception 'Only a never-effective future period can be cancelled. Use correction, transfer or withdrawal for effective periods.' using errcode='22023';
    end if;
    if exists(select 1 from public.eligible_class_register_entries e join public.class_registers r on r.id=e.register_id
      where r.class_id=v_old.class_id and e.student_type=p_student_type
        and coalesce(e.profile_student_id,e.young_learner_id)=p_student_id
        and r.lesson_date >= v_old.starts_on and (v_old.ends_before is null or r.lesson_date < v_old.ends_before))
      or exists(select 1 from public.eligible_friday_tutorial_results r
        join public.friday_tutorial_result_sheets s on s.id=r.result_sheet_id
        join public.friday_exam_practice_sessions session on session.id=s.tutorial_session_id
        where p_student_type='profile' and r.student_id=p_student_id and s.class_id=v_old.class_id
          and session.session_date >= v_old.starts_on and (v_old.ends_before is null or session.session_date < v_old.ends_before)) then
      raise exception 'This period already has attendance or results; use a dated correction.' using errcode='22023';
    end if;
    if exists(select 1 from public.results r where p_student_type='profile'
      and r.class_id=v_old.class_id and r.student_id=p_student_id
      and (r.exam_date is null or (r.exam_date >= v_old.starts_on and (v_old.ends_before is null or r.exam_date < v_old.ends_before))))
      or exists(select 1 from public.unit_exam_results r where p_student_type='young_learner'
        and r.class_id=v_old.class_id and r.young_learner_id=p_student_id
        and (r.created_at is null or ((r.created_at at time zone 'Europe/Madrid')::date >= v_old.starts_on
          and (v_old.ends_before is null or (r.created_at at time zone 'Europe/Madrid')::date < v_old.ends_before)))) then
      raise exception 'This period already has attendance or results; use a dated correction.' using errcode='22023';
    end if;
    update public.class_enrolment_periods set cancelled_at=now(),cancelled_by=p_actor_id
      where id=v_old.id returning * into v_new;
    insert into public.class_enrolment_period_events(period_id,actor_id,action,previous_period,resulting_period)
      values(v_new.id,p_actor_id,'cancel',to_jsonb(v_old),to_jsonb(v_new));
    perform app_private.reconcile_attendance_alerts_for_student(v_old.class_id,p_student_type,v_old.profile_student_id,v_old.young_learner_id);
    return v_new.id;
  elsif p_action='withdraw' then
    if p_starts_on is distinct from v_old.starts_on or p_ends_before is null
      or p_ends_before <= v_old.starts_on
      or (v_old.ends_before is not null and p_ends_before > v_old.ends_before) then
      raise exception 'Choose a valid first non-enrolled day after the start.' using errcode='22023';
    end if;
    update public.class_enrolment_periods set ends_before=p_ends_before where id=v_old.id returning * into v_new;
  else
    select * into v_class from public.classes where id=p_class_id;
    if not found or coalesce(v_class.is_cambridge,false) <> (p_student_type='profile') then
      raise exception 'The class is not compatible with this student type.' using errcode='22023';
    end if;
    if lower(trim(coalesce(v_class.course_type,'regular'))) not in ('intensive','express')
      and v_class.academic_year_id is null then
      raise exception 'Assign an academic year before enrolling a student.' using errcode='22023';
    end if;
    select * into v_year from public.academic_years where id=v_class.academic_year_id;
    -- Match the existing intersection of complete class and academic-year ranges.
    v_start := greatest(v_year.start_date, case when v_class.start_date is not null and v_class.end_date is not null then v_class.start_date end);
    v_end := least(v_year.end_date, case when v_class.start_date is not null and v_class.end_date is not null then v_class.end_date end);
    if p_starts_on is null or v_start is null or v_end is null or v_end < v_start
      or p_starts_on < v_start or p_starts_on > v_end
      or (p_ends_before is not null and (p_ends_before <= p_starts_on or p_ends_before > v_end+1)) then
      raise exception 'Enrolment dates must be inside the class and academic-year dates.' using errcode='22023';
    end if;
    if p_action='transfer' then
      if p_class_id=v_old.class_id or p_starts_on <= v_old.starts_on
        or (v_old.ends_before is not null and p_starts_on > v_old.ends_before) then
        raise exception 'The transfer must close an existing period and open a different class on the same date.' using errcode='22023';
      end if;
      update public.class_enrolment_periods set ends_before=p_starts_on where id=v_old.id returning * into v_new;
      insert into public.class_enrolment_period_events(period_id,actor_id,action,previous_period,resulting_period)
        values(v_old.id,p_actor_id,p_action,to_jsonb(v_old),to_jsonb(v_new));
    end if;
    if p_action='correct' then
      update public.class_enrolment_periods set starts_on=p_starts_on,ends_before=p_ends_before
        where id=v_old.id returning * into v_new;
    else
      insert into public.class_enrolment_periods(class_id,student_type,profile_student_id,young_learner_id,starts_on,ends_before,created_by)
      values(p_class_id,p_student_type,case when p_student_type='profile' then p_student_id end,
        case when p_student_type='young_learner' then p_student_id end,p_starts_on,p_ends_before,p_actor_id)
      returning * into v_new;
    end if;
  end if;
  if exists (
    select 1 from public.class_enrolment_periods other
    join public.classes old_class on old_class.id=other.class_id
    join public.classes new_class on new_class.id=v_new.class_id
    where other.student_type=p_student_type and other.student_id=p_student_id and other.cancelled_at is null
      and other.class_id <> v_new.class_id
      and new_class.academic_year_id is not null
      and old_class.academic_year_id=new_class.academic_year_id
      and daterange(other.starts_on,other.ends_before,'[)') && daterange(v_new.starts_on,v_new.ends_before,'[)')
  ) then
    raise exception 'Use a transfer or close the overlapping class period first.' using errcode='23P01';
  end if;
  insert into public.class_enrolment_period_events(period_id,actor_id,action,previous_period,resulting_period)
    values(v_new.id,p_actor_id,p_action,case when p_action in ('withdraw','correct') then to_jsonb(v_old) end,to_jsonb(v_new));
  -- Retain one legacy relationship for FK/rollover compatibility. Current rosters
  -- read the dated views, never these historical compatibility records.
  if p_student_type='profile' then
    insert into public.class_enrolments(student_id,class_id,enrolled_at,active)
      values(p_student_id,v_new.class_id,v_new.starts_on,true)
      on conflict(student_id,class_id) do nothing;
  else
    insert into public.young_learner_enrolments(young_learner_id,class_id,enrolled_at)
      values(p_student_id,v_new.class_id,v_new.starts_on)
      on conflict(young_learner_id,class_id) do nothing;
  end if;
  -- Both affected histories are reconciled in this same transaction.
  if v_old.id is not null then
    perform app_private.reconcile_attendance_alerts_for_student(v_old.class_id,p_student_type,v_old.profile_student_id,v_old.young_learner_id);
  end if;
  if v_old.class_id is distinct from v_new.class_id then
    perform app_private.reconcile_attendance_alerts_for_student(v_new.class_id,p_student_type,v_new.profile_student_id,v_new.young_learner_id);
  end if;
  return v_new.id;
end;
$$;
alter function public.manage_class_enrolment_period(uuid,text,uuid,text,uuid,date,date,uuid) owner to postgres;
revoke all on function public.manage_class_enrolment_period(uuid,text,uuid,text,uuid,date,date,uuid) from public, anon, authenticated;
grant execute on function public.manage_class_enrolment_period(uuid,text,uuid,text,uuid,date,date,uuid) to service_role;

-- Initial Young Learner identity and its effective enrolment are one transaction.
drop trigger if exists young_learners_record_enrolment on public.young_learners;
create or replace function public.create_young_learner_enrolments(
  p_actor_id uuid,p_class_id uuid,p_starts_on date,p_students jsonb
) returns integer language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare v_student jsonb; v_id uuid; v_count integer := 0;
begin
  if auth.role() is distinct from 'service_role' or not exists(
    select 1 from public.profiles where id=p_actor_id and role='admin' and active is distinct from false
  ) then raise exception 'Admin access required.' using errcode='42501'; end if;
  if jsonb_typeof(p_students) is distinct from 'array' or jsonb_array_length(p_students) not between 1 and 100 then
    raise exception 'Provide between one and 100 students.' using errcode='22023';
  end if;
  for v_student in select value from jsonb_array_elements(p_students) loop
    if jsonb_typeof(v_student) is distinct from 'object'
      or exists(select 1 from jsonb_object_keys(v_student) k where k not in ('first_name','last_name'))
      or length(trim(coalesce(v_student->>'first_name',''))) not between 1 and 80
      or length(trim(coalesce(v_student->>'last_name',''))) not between 1 and 80 then
      raise exception 'Provide valid student names.' using errcode='22023';
    end if;
    insert into public.young_learners(first_name,last_name,class_id,active)
      values(trim(v_student->>'first_name'),trim(v_student->>'last_name'),p_class_id,true) returning id into v_id;
    perform public.manage_class_enrolment_period(p_actor_id,'young_learner',v_id,'enrol',p_class_id,p_starts_on,null,null);
    v_count := v_count+1;
  end loop;
  return v_count;
end;
$$;
alter function public.create_young_learner_enrolments(uuid,uuid,date,jsonb) owner to postgres;
revoke all on function public.create_young_learner_enrolments(uuid,uuid,date,jsonb) from public,anon,authenticated;
grant execute on function public.create_young_learner_enrolments(uuid,uuid,date,jsonb) to service_role;

-- Existing base relationships are compatibility history, not an alternate
-- write API. Only vetted security-definer Admin transactions may create them.
revoke insert,update on public.class_enrolments,public.young_learner_enrolments from authenticated,anon,service_role;
revoke insert on public.young_learners from authenticated,anon,service_role;
create or replace function app_private.protect_legacy_young_learner_class()
returns trigger language plpgsql set search_path=pg_catalog,pg_temp as $$
begin
  if new.class_id is distinct from old.class_id and current_user <> 'postgres' then
    raise exception 'Use the Admin effective-dated enrolment controls.' using errcode='42501';
  end if;
  return new;
end;
$$;
alter function app_private.protect_legacy_young_learner_class() owner to postgres;
revoke all on function app_private.protect_legacy_young_learner_class() from public,anon,authenticated,service_role;
create trigger protect_legacy_young_learner_class before update of class_id on public.young_learners
for each row execute function app_private.protect_legacy_young_learner_class();

-- Rollover retains an explicit link to the period created by each assignment.
create or replace function app_private.rollover_source_date(p_year_id uuid)
returns date language sql stable security definer set search_path=pg_catalog,pg_temp as $$
  select least(greatest((now() at time zone 'Europe/Madrid')::date,start_date),end_date)
  from public.academic_years where id=p_year_id;
$$;
alter function app_private.rollover_source_date(uuid) owner to postgres;
revoke all on function app_private.rollover_source_date(uuid) from public,anon,authenticated,service_role;

alter table public.academic_year_rollover_students add column enrolment_period_id uuid
  references public.class_enrolment_periods(id) on delete restrict;
create unique index academic_year_rollover_students_period_key
  on public.academic_year_rollover_students(enrolment_period_id) where enrolment_period_id is not null;
update public.academic_year_rollover_students s set enrolment_period_id=p.id
from public.class_enrolment_periods p,public.academic_year_rollovers r,public.academic_years y
where s.rollover_id=r.id and y.id=r.target_academic_year_id and s.applied_at is not null
  and s.target_class_id=p.class_id and p.student_type=s.student_type
  and p.student_id=coalesce(s.profile_student_id,s.young_learner_id) and p.starts_on=y.start_date;
do $$ begin
  if exists(select 1 from public.academic_year_rollover_students where applied_at is not null
    and target_class_id is not null and enrolment_period_id is null) then
    raise exception 'Applied rollover assignment has no exact recoverable period; Admin review required.';
  end if;
end; $$;

create or replace function public.save_academic_year_rollover_student_decision(
  p_decision_id uuid,
  p_decision text,
  p_target_class_id uuid,
  p_notes text,
  p_actor_id uuid
)
returns public.academic_year_rollover_students
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_row public.academic_year_rollover_students;
  v_rollover public.academic_year_rollovers;
  v_source public.classes;
  v_target public.classes;
  v_result public.academic_year_rollover_students;
  v_notes text := nullif(trim(coalesce(p_notes, '')), '');
  v_assignment_changed boolean;
  v_period public.class_enrolment_periods;
begin
  if auth.role() is distinct from 'service_role' or not exists (
    select 1 from public.profiles
    where id = p_actor_id and role = 'admin' and active is distinct from false
  ) then
    raise exception 'Admin access required.';
  end if;

  if p_decision is null or p_decision not in (
    'decide_later', 'promote', 'repeat', 'different_level', 'not_returning'
  ) then
    raise exception 'Choose a valid progression decision.';
  end if;

  if v_notes is not null and length(v_notes) > 2000 then
    raise exception 'Notes must contain no more than 2000 characters.';
  end if;

  select * into v_row
  from public.academic_year_rollover_students
  where id = p_decision_id;

  if not found then
    raise exception 'Student rollover decision not found.';
  end if;

  select * into v_rollover
  from public.academic_year_rollovers
  where id = v_row.rollover_id
  for update;

  -- Match apply's parent-before-child lock order.
  select * into strict v_row from public.academic_year_rollover_students
  where id=p_decision_id for update;

  if not exists (
    select 1 from public.academic_years
    where id = v_rollover.target_academic_year_id
      and status = 'future'
  ) then
    raise exception 'Decisions can only be changed while the target year is Future.';
  end if;

  select * into v_source
  from public.classes
  where id = v_row.source_class_id;

  if not found
    or v_source.academic_year_id <> v_rollover.source_academic_year_id
    or lower(trim(coalesce(v_source.course_type, 'regular')))
      in ('intensive', 'express') then
    raise exception 'The source class is not eligible for this rollover.';
  end if;

  if v_row.student_type = 'profile' then
    if v_source.is_cambridge is not true
      or not exists (
        select 1 from public.class_enrolment_periods
        where student_type='profile' and cancelled_at is null and student_id = v_row.profile_student_id
          and class_id = v_row.source_class_id
          and public.is_class_member_on(class_id,student_type,student_id,app_private.rollover_source_date(v_rollover.source_academic_year_id))
      ) then
      raise exception 'The profile student does not belong to the source class.';
    end if;
  else
    if v_source.is_cambridge is true
      or not exists (
        select 1 from public.class_enrolment_periods
        where student_type='young_learner' and cancelled_at is null and student_id = v_row.young_learner_id
          and class_id = v_row.source_class_id
          and public.is_class_member_on(class_id,student_type,student_id,app_private.rollover_source_date(v_rollover.source_academic_year_id))
      ) then
      raise exception 'The Young Learner does not belong to the source class.';
    end if;
  end if;

  if p_decision in ('decide_later', 'not_returning') then
    if p_target_class_id is not null then
      raise exception 'This decision must not have a target class.';
    end if;
  else
    if p_target_class_id is null then
      raise exception 'Choose a target class.';
    end if;

    select * into v_target
    from public.classes
    where id = p_target_class_id;

    if not found
      or v_target.academic_year_id <> v_rollover.target_academic_year_id
      or lower(trim(coalesce(v_target.course_type, 'regular')))
        in ('intensive', 'express')
      or v_target.is_cambridge is distinct from v_source.is_cambridge then
      raise exception 'The selected target class is not compatible.';
    end if;

    if p_decision = 'promote' and (
      v_row.suggested_level_id is null
      or v_target.level_id <> v_row.suggested_level_id
    ) then
      raise exception 'Promote requires a class at the suggested next level.';
    end if;

    if p_decision = 'repeat' and v_target.level_id <> v_source.level_id then
      raise exception 'Repeat Level requires a class at the current level.';
    end if;

    if p_decision = 'different_level'
      and v_target.level_id = v_source.level_id then
      raise exception 'Different Level requires a class at another level.';
    end if;
  end if;

  v_assignment_changed :=
    v_row.decision is distinct from p_decision
    or v_row.target_class_id is distinct from p_target_class_id;

  if v_row.applied_at is not null and v_assignment_changed and v_row.enrolment_period_id is not null then
    select * into strict v_period from public.class_enrolment_periods where id=v_row.enrolment_period_id;
    perform public.manage_class_enrolment_period(p_actor_id,v_row.student_type,
      coalesce(v_row.profile_student_id,v_row.young_learner_id),'cancel',v_period.class_id,
      v_period.starts_on,v_period.ends_before,v_period.id);
  end if;

  update public.academic_year_rollover_students
  set decision = p_decision,
      enrolment_period_id = case when v_assignment_changed then null else enrolment_period_id end,
      target_class_id = p_target_class_id,
      notes = v_notes,
      updated_by = p_actor_id,
      applied_by = case when v_assignment_changed then null else applied_by end,
      applied_at = case when v_assignment_changed then null else applied_at end
  where id = p_decision_id
  returning * into v_result;

  update public.academic_year_rollovers rollover
  set status = case
        when not exists (
          select 1 from public.academic_year_rollover_students student
          where student.rollover_id = rollover.id
            and student.decision = 'decide_later'
        ) and not exists (
          select 1 from public.academic_year_rollover_students student
          where student.rollover_id = rollover.id
            and student.decision <> 'decide_later'
            and student.applied_at is null
        ) then 'completed'
        when exists (
          select 1 from public.academic_year_rollover_students student
          where student.rollover_id = rollover.id
            and student.applied_at is not null
        ) then 'partially_applied'
        else 'draft'
      end,
      updated_by = p_actor_id
  where id = v_row.rollover_id;

  return v_result;
end;
$$;

create or replace function public.apply_academic_year_rollover(
  p_rollover_id uuid,
  p_actor_id uuid
)
returns table (
  newly_applied_count integer,
  total_applied_count integer,
  undecided_count integer,
  rollover_status text
)
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_rollover public.academic_year_rollovers;
  v_target_status text;
  v_target_start_date date;
  v_newly_applied integer := 0;
  v_total_applied integer := 0;
  v_undecided integer := 0;
  v_status text;
  v_student public.academic_year_rollover_students;
  v_period_id uuid;
begin
  if auth.role() is distinct from 'service_role' or not exists (
    select 1 from public.profiles
    where id = p_actor_id and role = 'admin' and active is distinct from false
  ) then
    raise exception 'Admin access required.';
  end if;

  select * into v_rollover
  from public.academic_year_rollovers
  where id = p_rollover_id
  for update;

  if not found then
    raise exception 'Academic year rollover not found.';
  end if;

  select status, start_date
  into v_target_status, v_target_start_date
  from public.academic_years
  where id = v_rollover.target_academic_year_id;

  if v_target_status not in ('future', 'current') then
    raise exception 'Assignments cannot be applied to an Archived academic year.';
  end if;

  if exists (
    select 1
    from public.academic_year_rollover_students student
    left join public.classes source_class
      on source_class.id = student.source_class_id
    left join public.classes target_class
      on target_class.id = student.target_class_id
    where student.rollover_id = p_rollover_id
      and student.decision <> 'decide_later'
      and (
        source_class.id is null
        or source_class.academic_year_id <> v_rollover.source_academic_year_id
        or lower(trim(coalesce(source_class.course_type, 'regular')))
          in ('intensive', 'express')
        or (student.student_type = 'profile'
          and source_class.is_cambridge is not true)
        or (student.student_type = 'young_learner'
          and source_class.is_cambridge is true)
        or (
          student.decision in ('promote', 'repeat', 'different_level')
          and (
            target_class.id is null
            or target_class.academic_year_id <> v_rollover.target_academic_year_id
            or lower(trim(coalesce(target_class.course_type, 'regular')))
              in ('intensive', 'express')
            or target_class.is_cambridge is distinct from source_class.is_cambridge
            or (student.decision = 'promote' and (
              student.suggested_level_id is null
              or target_class.level_id <> student.suggested_level_id
            ))
            or (student.decision = 'repeat'
              and target_class.level_id <> source_class.level_id)
            or (student.decision = 'different_level'
              and target_class.level_id = source_class.level_id)
          )
        )
      )
  ) then
    raise exception 'One or more rollover decisions are no longer valid.';
  end if;

  if exists (
    select 1
    from public.academic_year_rollover_students student
    where student.rollover_id = p_rollover_id
      and student.decision <> 'decide_later'
      and (
        (student.student_type = 'profile' and not exists (
          select 1 from public.class_enrolment_periods enrolment
          where enrolment.student_type='profile' and enrolment.cancelled_at is null and enrolment.student_id = student.profile_student_id
            and enrolment.class_id = student.source_class_id
            and public.is_class_member_on(enrolment.class_id,enrolment.student_type,enrolment.student_id,app_private.rollover_source_date(v_rollover.source_academic_year_id))
        ))
        or
        (student.student_type = 'young_learner' and not exists (
          select 1 from public.class_enrolment_periods enrolment
          where enrolment.student_type='young_learner' and enrolment.cancelled_at is null and enrolment.student_id = student.young_learner_id
            and enrolment.class_id = student.source_class_id
            and public.is_class_member_on(enrolment.class_id,enrolment.student_type,enrolment.student_id,app_private.rollover_source_date(v_rollover.source_academic_year_id))
        ))
      )
  ) then
    raise exception 'One or more students no longer belong to their source class.';
  end if;

  if exists(select 1 from public.academic_year_rollover_students s
    left join public.class_enrolment_periods p on p.id=s.enrolment_period_id
    where s.rollover_id=p_rollover_id and s.applied_at is not null and s.target_class_id is not null
      and (p.id is null or p.cancelled_at is not null)) then
    raise exception 'An applied assignment was cancelled; revise its rollover decision before applying.';
  end if;
  for v_student in select * from public.academic_year_rollover_students
    where rollover_id=p_rollover_id and decision in ('promote','repeat','different_level') and applied_at is null
    order by student_type,coalesce(profile_student_id,young_learner_id),id for update
  loop
    v_period_id := public.manage_class_enrolment_period(p_actor_id,v_student.student_type,
      coalesce(v_student.profile_student_id,v_student.young_learner_id),'enrol',
      v_student.target_class_id,v_target_start_date,null,null);
    update public.academic_year_rollover_students set enrolment_period_id=v_period_id where id=v_student.id;
  end loop;

  update public.academic_year_rollover_students
  set applied_at = now(),
      applied_by = p_actor_id,
      updated_by = p_actor_id
  where rollover_id = p_rollover_id
    and decision <> 'decide_later'
    and applied_at is null;
  get diagnostics v_newly_applied = row_count;

  -- Current Young Learner class is derived from periods; never rewrite its legacy pointer.

  select count(*)::integer into v_total_applied
  from public.academic_year_rollover_students
  where rollover_id = p_rollover_id
    and applied_at is not null;

  select count(*)::integer into v_undecided
  from public.academic_year_rollover_students
  where rollover_id = p_rollover_id
    and decision = 'decide_later';

  v_status := case
    when v_total_applied = 0 then 'draft'
    when v_undecided = 0 then 'completed'
    else 'partially_applied'
  end;

  update public.academic_year_rollovers
  set status = v_status,
      applied_at = case when v_total_applied > 0 then now() else applied_at end,
      applied_by = case when v_total_applied > 0 then p_actor_id else applied_by end,
      updated_by = p_actor_id
  where id = p_rollover_id;

  return query select
    v_newly_applied,
    v_total_applied,
    v_undecided,
    v_status;
end;
$$;

alter function public.save_academic_year_rollover_student_decision(uuid,text,uuid,text,uuid) owner to postgres;
alter function public.apply_academic_year_rollover(uuid,uuid) owner to postgres;
revoke all on function public.save_academic_year_rollover_student_decision(uuid,text,uuid,text,uuid),
  public.apply_academic_year_rollover(uuid,uuid) from public,anon,authenticated;
grant execute on function public.save_academic_year_rollover_student_decision(uuid,text,uuid,text,uuid),
  public.apply_academic_year_rollover(uuid,uuid) to service_role;

create or replace function public.set_current_academic_year(
  p_academic_year_id uuid
)
returns public.academic_years
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_target public.academic_years;
  v_today date := (now() at time zone 'Europe/Madrid')::date;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Service access required.' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtext('public.academic_years.current'));

  select * into v_target
  from public.academic_years
  where id = p_academic_year_id
  for update;

  if not found then
    raise exception 'Academic year not found.';
  end if;

  update public.academic_years
  set status = case when end_date < v_today then 'archived' else 'future' end
  where status = 'current'
    and id <> p_academic_year_id;

  update public.academic_years
  set status = 'current'
  where id = p_academic_year_id
  returning * into v_target;

  -- Membership is derived by Madrid date, not by this administrative status switch.

  return v_target;
end;
$$;

create or replace function public.save_academic_year_rollover_student_decisions(
  p_rollover_id uuid,
  p_decisions jsonb,
  p_actor_id uuid
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_item jsonb;
  v_decision_id uuid;
  v_target_class_id uuid;
  v_updated integer := 0;
begin
  if auth.role() is distinct from 'service_role' or not exists(select 1 from public.profiles
    where id=p_actor_id and role='admin' and active is distinct from false) then
    raise exception 'Admin access required.' using errcode='42501';
  end if;
  perform 1 from public.academic_year_rollovers where id=p_rollover_id for update;
  if jsonb_typeof(p_decisions) is distinct from 'array' then
    raise exception 'Student decisions must be supplied as an array.';
  end if;

  for v_item in select value from jsonb_array_elements(p_decisions)
  loop
    v_decision_id := nullif(v_item->>'id', '')::uuid;
    v_target_class_id := nullif(v_item->>'target_class_id', '')::uuid;

    if not exists (
      select 1 from public.academic_year_rollover_students
      where id = v_decision_id
        and rollover_id = p_rollover_id
    ) then
      raise exception 'A student decision does not belong to this rollover.';
    end if;

    perform public.save_academic_year_rollover_student_decision(
      v_decision_id,
      v_item->>'decision',
      v_target_class_id,
      v_item->>'notes',
      p_actor_id
    );
    v_updated := v_updated + 1;
  end loop;

  return v_updated;
end;
$$;

alter function public.set_current_academic_year(uuid) owner to postgres;
alter function public.save_academic_year_rollover_student_decisions(uuid,jsonb,uuid) owner to postgres;
revoke all on function public.set_current_academic_year(uuid),public.save_academic_year_rollover_student_decisions(uuid,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.set_current_academic_year(uuid),public.save_academic_year_rollover_student_decisions(uuid,jsonb,uuid) to service_role;

-- Explicit permanent-deletion workflows remove children before parents inside
create or replace function public.preview_academic_year_rollover_periods(p_rollover_id uuid,p_actor_id uuid)
returns table(decision_id uuid,period_action text,starts_on date,conflict text,cancelled_periods bigint)
language plpgsql stable security definer set search_path=pg_catalog,pg_temp as $$
begin
  if auth.role() is distinct from 'service_role' or not exists(select 1 from public.profiles
    where id=p_actor_id and role='admin' and active is distinct from false) then
    raise exception 'Admin access required.' using errcode='42501';
  end if;
  return query
  select s.id,case when s.applied_at is not null then 'keep_applied'
    when s.target_class_id is null then 'no_period' else 'create_period' end,
    case when s.target_class_id is not null then y.start_date end,
    case
      when not public.is_class_member_on(s.source_class_id,s.student_type,coalesce(s.profile_student_id,s.young_learner_id),
        app_private.rollover_source_date(r.source_academic_year_id)) then 'Student is outside the source-year enrolment period.'
      when s.applied_at is not null and s.target_class_id is not null and (linked.id is null or linked.cancelled_at is not null)
        then 'Applied assignment is cancelled or missing; revise the decision.'
      when s.target_class_id is not null and c.academic_year_id is distinct from r.target_academic_year_id then 'Target class is outside the target year.'
      when s.target_class_id is not null and c.start_date is not null and c.end_date is not null
        and y.start_date not between c.start_date and c.end_date then 'Target-year start is outside the class dates.'
      when s.applied_at is null and s.target_class_id is not null and exists(
        select 1 from public.class_enrolment_periods p join public.classes pc on pc.id=p.class_id
        where p.student_type=s.student_type and p.student_id=coalesce(s.profile_student_id,s.young_learner_id)
          and p.cancelled_at is null and pc.academic_year_id=r.target_academic_year_id
          and daterange(p.starts_on,p.ends_before,'[)') && daterange(y.start_date,null,'[)')
      ) then 'An existing target-year period overlaps the proposed assignment.'
      else null end,
    (select count(*) from public.class_enrolment_periods p join public.classes pc on pc.id=p.class_id
      where p.student_type=s.student_type and p.student_id=coalesce(s.profile_student_id,s.young_learner_id)
        and p.cancelled_at is not null and pc.academic_year_id=r.target_academic_year_id)
  from public.academic_year_rollover_students s join public.academic_year_rollovers r on r.id=s.rollover_id
  join public.academic_years y on y.id=r.target_academic_year_id
  left join public.classes c on c.id=s.target_class_id
  left join public.class_enrolment_periods linked on linked.id=s.enrolment_period_id
  where s.rollover_id=p_rollover_id order by s.id;
end;
$$;
alter function public.preview_academic_year_rollover_periods(uuid,uuid) owner to postgres;
revoke all on function public.preview_academic_year_rollover_periods(uuid,uuid) from public,anon,authenticated;
grant execute on function public.preview_academic_year_rollover_periods(uuid,uuid) to service_role;

-- Explicit permanent-deletion workflows remove children before parents inside
-- the existing database transaction. Soft changes never invoke this cleanup.
alter table public.young_learners alter column class_id drop not null;

create or replace function app_private.get_test_student_purge_preview(
  p_profile_ids uuid[],
  p_young_learner_ids uuid[]
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_auth_users integer;
  v_dependencies jsonb;
  v_total_dependent_rows bigint;
  v_warnings jsonb := '[]'::jsonb;
begin
  select count(*)
  into v_auth_users
  from auth.users as auth_user
  where auth_user.id = any(p_profile_ids);

  select jsonb_build_object(
    'class_enrolment_periods', (select count(*) from public.class_enrolment_periods p where p.profile_student_id=any(p_profile_ids) or p.young_learner_id=any(p_young_learner_ids)),
    'class_enrolment_period_events', (select count(*) from public.class_enrolment_period_events e join public.class_enrolment_periods p on p.id=e.period_id where p.profile_student_id=any(p_profile_ids) or p.young_learner_id=any(p_young_learner_ids)),
    'class_register_entries', (
      select count(*) from public.class_register_entries as entry
      where entry.profile_student_id = any(p_profile_ids)
        or entry.young_learner_id = any(p_young_learner_ids)
    ),
    'attendance_alerts', (
      select count(*) from public.attendance_alerts as alert
      where alert.profile_student_id = any(p_profile_ids)
        or alert.young_learner_id = any(p_young_learner_ids)
    ),
    'class_enrolments', (
      select count(*) from public.class_enrolments as enrolment
      where enrolment.student_id = any(p_profile_ids)
    ),
    'young_learner_enrolments', (
      select count(*) from public.young_learner_enrolments as enrolment
      where enrolment.young_learner_id = any(p_young_learner_ids)
    ),
    'academic_year_rollover_students', (
      select count(*) from public.academic_year_rollover_students as student
      where student.profile_student_id = any(p_profile_ids)
        or student.young_learner_id = any(p_young_learner_ids)
    ),
    'follow_up_documents', (
      select count(*) from public.follow_up_documents as document
      where document.student_id = any(p_profile_ids)
        or document.young_learner_id = any(p_young_learner_ids)
    ),
    'follow_up_entries', (
      select count(*)
      from public.follow_up_entries as entry
      inner join public.follow_up_documents as document
        on document.id = entry.follow_up_document_id
      where document.student_id = any(p_profile_ids)
        or document.young_learner_id = any(p_young_learner_ids)
    ),
    'friday_tutorial_students', (
      select count(*) from public.friday_tutorial_students as student
      where student.profile_student_id = any(p_profile_ids)
        or student.young_learner_id = any(p_young_learner_ids)
    ),
    'friday_tutorial_session_students', (
      select count(*)
      from public.friday_tutorial_session_students as session_student
      inner join public.friday_tutorial_students as student
        on student.id = session_student.tutorial_student_id
      where student.profile_student_id = any(p_profile_ids)
        or student.young_learner_id = any(p_young_learner_ids)
    ),
    'friday_tutorial_results', (
      select count(*) from public.friday_tutorial_results as result
      where result.student_id = any(p_profile_ids)
    ),
    'friday_tutorial_reminder_reads', (
      select count(*) from public.friday_tutorial_reminder_reads as reminder
      where reminder.student_id = any(p_profile_ids)
    ),
    'results', (
      select count(*) from public.results as result
      where result.student_id = any(p_profile_ids)
    ),
    'mock_result_reviews', (
      select count(*)
      from public.mock_result_reviews as review
      inner join public.results as result on result.id = review.result_id
      where result.student_id = any(p_profile_ids)
    ),
    'teacher_notes', (
      select count(*) from public.teacher_notes as note
      where note.student_id = any(p_profile_ids)
    ),
    'student_homework_reads', (
      select count(*) from public.student_homework_reads as homework_read
      where homework_read.student_id = any(p_profile_ids)
    ),
    'student_assignment_homework_reads', (
      select count(*) from public.student_assignment_homework_reads as homework_read
      where homework_read.student_id = any(p_profile_ids)
    ),
    'announcement_reads', (
      select count(*) from public.announcement_reads as announcement_read
      where announcement_read.user_id = any(p_profile_ids)
    ),
    'messages', (
      select count(*) from public.messages as message
      where message.sender_id = any(p_profile_ids)
        or message.receiver_id = any(p_profile_ids)
    ),
    'unit_exam_results', (
      select count(*) from public.unit_exam_results as result
      where result.young_learner_id = any(p_young_learner_ids)
    ),
    'young_learner_notes', (
      select count(*) from public.young_learner_notes as note
      where note.young_learner_id = any(p_young_learner_ids)
    ),
    'young_learner_class_point_entries', (
      select count(*) from public.young_learner_class_point_entries as point_entry
      where point_entry.young_learner_id = any(p_young_learner_ids)
    )
  )
  into v_dependencies;

  select coalesce(sum(dependency.value::text::bigint), 0)
  into v_total_dependent_rows
  from jsonb_each(v_dependencies) as dependency(key, value);

  if v_auth_users < cardinality(p_profile_ids) then
    v_warnings := jsonb_build_array(
      format(
        '%s selected Cambridge profile(s) do not currently have a matching Auth user. Their portal data will still be purged.',
        cardinality(p_profile_ids) - v_auth_users
      )
    );
  end if;

  return jsonb_build_object(
    'students', jsonb_build_object(
      'profile', cardinality(p_profile_ids),
      'young_learner', cardinality(p_young_learner_ids),
      'total', cardinality(p_profile_ids) + cardinality(p_young_learner_ids),
      'auth_users', v_auth_users
    ),
    'dependencies', v_dependencies,
    'total_dependent_rows', v_total_dependent_rows,
    'warnings', v_warnings,
    'preserved', jsonb_build_array(
      'Classes and levels',
      'Class Registers (including registers left empty)',
      'Class Progress records',
      'Homework and exam assignments',
      'Friday Tutorial sessions and result sheets',
      'Academic years and rollover batches',
      'Announcements and resources'
    )
  );
end;
$$;

create or replace function public.purge_test_students(
  p_students jsonb,
  p_confirmation text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_profile_ids uuid[];
  v_young_learner_ids uuid[];
  v_preview jsonb;
  v_deleted_profiles integer;
  v_deleted_young_learners integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception using
      errcode = '42501',
      message = 'Test student purge requires service role.';
  end if;

  if p_confirmation is distinct from 'DELETE' then
    raise exception using
      errcode = '22023',
      message = 'The confirmation value must be DELETE.';
  end if;

  select selection.profile_ids, selection.young_learner_ids
  into v_profile_ids, v_young_learner_ids
  from app_private.validate_test_student_purge_selection(p_students, true)
    as selection;

  v_preview := app_private.get_test_student_purge_preview(
    v_profile_ids,
    v_young_learner_ids
  );

  delete from public.friday_tutorial_session_students as session_student
  using public.friday_tutorial_students as student
  where session_student.tutorial_student_id = student.id
    and (
      student.profile_student_id = any(v_profile_ids)
      or student.young_learner_id = any(v_young_learner_ids)
    );

  delete from public.friday_tutorial_students as student
  where student.profile_student_id = any(v_profile_ids)
    or student.young_learner_id = any(v_young_learner_ids);

  delete from public.follow_up_entries as entry
  using public.follow_up_documents as document
  where entry.follow_up_document_id = document.id
    and (
      document.student_id = any(v_profile_ids)
      or document.young_learner_id = any(v_young_learner_ids)
    );

  delete from public.follow_up_documents as document
  where document.student_id = any(v_profile_ids)
    or document.young_learner_id = any(v_young_learner_ids);

  delete from public.mock_result_reviews as review
  using public.results as result
  where review.result_id = result.id
    and result.student_id = any(v_profile_ids);

  delete from public.class_register_entries as entry
  where entry.profile_student_id = any(v_profile_ids)
    or entry.young_learner_id = any(v_young_learner_ids);

  if exists (
    select 1
    from public.class_register_entries as entry
    where entry.profile_student_id = any(v_profile_ids)
      or entry.young_learner_id = any(v_young_learner_ids)
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'Selected student Class Register entries could not be removed safely.';
  end if;

  delete from public.attendance_alerts as alert
  where alert.profile_student_id = any(v_profile_ids)
    or alert.young_learner_id = any(v_young_learner_ids);

  delete from public.academic_year_rollover_students as student
  where student.profile_student_id = any(v_profile_ids)
    or student.young_learner_id = any(v_young_learner_ids);

  delete from public.friday_tutorial_results as result
  where result.student_id = any(v_profile_ids);

  delete from public.friday_tutorial_reminder_reads as reminder
  where reminder.student_id = any(v_profile_ids);

  delete from public.student_assignment_homework_reads as homework_read
  where homework_read.student_id = any(v_profile_ids);

  delete from public.student_homework_reads as homework_read
  where homework_read.student_id = any(v_profile_ids);

  delete from public.teacher_notes as note
  where note.student_id = any(v_profile_ids);

  delete from public.announcement_reads as announcement_read
  where announcement_read.user_id = any(v_profile_ids);

  delete from public.messages as message
  where message.sender_id = any(v_profile_ids)
    or message.receiver_id = any(v_profile_ids);

  delete from public.results as result
  where result.student_id = any(v_profile_ids);

  delete from public.class_enrolments as enrolment
  where enrolment.student_id = any(v_profile_ids);

  delete from public.unit_exam_results as result
  where result.young_learner_id = any(v_young_learner_ids);

  delete from public.young_learner_notes as note
  where note.young_learner_id = any(v_young_learner_ids);

  delete from public.young_learner_class_point_entries as point_entry
  where point_entry.young_learner_id = any(v_young_learner_ids);

  delete from public.young_learner_enrolments as enrolment
  where enrolment.young_learner_id = any(v_young_learner_ids);

  delete from public.class_enrolment_period_events e using public.class_enrolment_periods p
  where e.period_id=p.id and (p.profile_student_id=any(v_profile_ids) or p.young_learner_id=any(v_young_learner_ids));
  delete from public.class_enrolment_periods p
  where p.profile_student_id=any(v_profile_ids) or p.young_learner_id=any(v_young_learner_ids);

  delete from public.profiles as profile
  where profile.id = any(v_profile_ids)
    and profile.role = 'student';

  get diagnostics v_deleted_profiles = row_count;

  if v_deleted_profiles <> cardinality(v_profile_ids) then
    raise exception using
      errcode = 'P0001',
      message = 'The selected profile students could not all be deleted.';
  end if;

  delete from auth.users as auth_user
  where auth_user.id = any(v_profile_ids);

  delete from public.young_learners as learner
  where learner.id = any(v_young_learner_ids);

  get diagnostics v_deleted_young_learners = row_count;

  if v_deleted_young_learners <> cardinality(v_young_learner_ids) then
    raise exception using
      errcode = 'P0001',
      message = 'The selected Young Learners could not all be deleted.';
  end if;

  return v_preview || jsonb_build_object('success', true);
end;
$$;

create or replace function app_private.get_test_class_purge_preview(
  p_class_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_cambridge_students integer;
  v_young_learners integer;
  v_dependencies jsonb;
  v_total_dependent_rows bigint;
  v_storage_files integer;
  v_warnings jsonb := '[]'::jsonb;
begin
  select count(*)
  into v_cambridge_students
  from public.current_class_enrolments as enrolment
  where enrolment.class_id = p_class_id
    and enrolment.active is distinct from false;

  select count(*)
  into v_young_learners
  from public.current_young_learners as learner
  where learner.class_id = p_class_id;

  select jsonb_build_object(
    'class_enrolment_periods', (select count(*) from public.class_enrolment_periods where class_id=p_class_id),
    'class_enrolment_period_events', (select count(*) from public.class_enrolment_period_events e join public.class_enrolment_periods p on p.id=e.period_id where p.class_id=p_class_id),
    'class_registers', (
      select count(*) from public.class_registers as register
      where register.class_id = p_class_id
    ),
    'class_register_entries', (
      select count(*)
      from public.class_register_entries as entry
      inner join public.class_registers as register
        on register.id = entry.register_id
      where register.class_id = p_class_id
    ),
    'attendance_alerts', (
      select count(*) from public.attendance_alerts as alert
      where alert.class_id = p_class_id
    ),
    'class_progress_entries', (
      select count(*) from public.class_progress_entries as progress
      where progress.class_id = p_class_id
    ),
    'class_enrolments', (
      select count(*) from public.class_enrolments as enrolment
      where enrolment.class_id = p_class_id
    ),
    'young_learner_enrolments', (
      select count(*) from public.young_learner_enrolments as enrolment
      where enrolment.class_id = p_class_id
    ),
    'results', (
      select count(*)
      from public.results as result
      where result.class_id = p_class_id
        or result.cambridge_exam_assignment_id in (
          select assignment.id
          from public.cambridge_exam_assignments as assignment
          where assignment.course_plan_class_id = p_class_id
            or assignment.course_plan_day_id in (
              select day.id
              from public.course_plan_days as day
              inner join public.course_plans as plan
                on plan.id = day.course_plan_id
              where plan.class_id = p_class_id
            )
            or assignment.id in (
              select homework.cambridge_exam_assignment_id
              from public.course_plan_homework_assignments as homework
              inner join public.course_plan_exam_items as item
                on item.id = homework.course_plan_exam_item_id
              inner join public.course_plan_days as day
                on day.id = item.course_plan_day_id
              inner join public.course_plans as plan
                on plan.id = day.course_plan_id
              where plan.class_id = p_class_id
            )
        )
    ),
    'mock_result_reviews', (
      select count(*)
      from public.mock_result_reviews as review
      inner join public.results as result on result.id = review.result_id
      where result.class_id = p_class_id
        or result.cambridge_exam_assignment_id in (
          select assignment.id
          from public.cambridge_exam_assignments as assignment
          where assignment.course_plan_class_id = p_class_id
            or assignment.course_plan_day_id in (
              select day.id
              from public.course_plan_days as day
              inner join public.course_plans as plan
                on plan.id = day.course_plan_id
              where plan.class_id = p_class_id
            )
            or assignment.id in (
              select homework.cambridge_exam_assignment_id
              from public.course_plan_homework_assignments as homework
              inner join public.course_plan_exam_items as item
                on item.id = homework.course_plan_exam_item_id
              inner join public.course_plan_days as day
                on day.id = item.course_plan_day_id
              inner join public.course_plans as plan
                on plan.id = day.course_plan_id
              where plan.class_id = p_class_id
            )
        )
    ),
    'teacher_notes', (
      select count(*) from public.teacher_notes as note
      where note.class_id = p_class_id
    ),
    'follow_up_documents', (
      select count(*) from public.follow_up_documents as document
      where document.class_id = p_class_id
    ),
    'follow_up_entries', (
      select count(*)
      from public.follow_up_entries as entry
      inner join public.follow_up_documents as document
        on document.id = entry.follow_up_document_id
      where document.class_id = p_class_id
    ),
    'friday_tutorial_students', (
      select count(*) from public.friday_tutorial_students as student
      where student.class_id = p_class_id
        or student.follow_up_document_id in (
          select document.id
          from public.follow_up_documents as document
          where document.class_id = p_class_id
        )
    ),
    'friday_tutorial_session_students', (
      select count(*)
      from public.friday_tutorial_session_students as session_student
      inner join public.friday_tutorial_students as student
        on student.id = session_student.tutorial_student_id
      where student.class_id = p_class_id
        or student.follow_up_document_id in (
          select document.id
          from public.follow_up_documents as document
          where document.class_id = p_class_id
        )
    ),
    'friday_tutorial_result_sheets', (
      select count(*) from public.friday_tutorial_result_sheets as sheet
      where sheet.class_id = p_class_id
    ),
    'friday_tutorial_results', (
      select count(*)
      from public.friday_tutorial_results as result
      inner join public.friday_tutorial_result_sheets as sheet
        on sheet.id = result.result_sheet_id
      where sheet.class_id = p_class_id
    ),
    'unit_exam_results', (
      select count(*) from public.unit_exam_results as result
      where result.class_id = p_class_id
    ),
    'young_learner_notes', (
      select count(*) from public.young_learner_notes as note
      where note.class_id = p_class_id
    ),
    'young_learner_class_point_entries', (
      select count(*) from public.young_learner_class_point_entries as point_entry
      where point_entry.class_id = p_class_id
    ),
    'resources', (
      select count(*) from public.resources as resource
      where resource.class_id = p_class_id
    ),
    'announcements', (
      select count(*) from public.announcements as announcement
      where announcement.classes_id = p_class_id
    ),
    'announcement_reads', (
      select count(*)
      from public.announcement_reads as announcement_read
      inner join public.announcements as announcement
        on announcement.id = announcement_read.announcement_id
      where announcement.classes_id = p_class_id
    ),
    'course_plans', (
      select count(*) from public.course_plans as plan
      where plan.class_id = p_class_id
    ),
    'course_plan_days', (
      select count(*)
      from public.course_plan_days as day
      inner join public.course_plans as plan on plan.id = day.course_plan_id
      where plan.class_id = p_class_id
    ),
    'course_plan_exam_items', (
      select count(*)
      from public.course_plan_exam_items as item
      inner join public.course_plan_days as day on day.id = item.course_plan_day_id
      inner join public.course_plans as plan on plan.id = day.course_plan_id
      where plan.class_id = p_class_id
    ),
    'course_plan_resources', (
      select count(*)
      from public.course_plan_resources as resource
      inner join public.course_plan_days as day on day.id = resource.course_plan_day_id
      inner join public.course_plans as plan on plan.id = day.course_plan_id
      where plan.class_id = p_class_id
    ),
    'course_plan_homework_assignments', (
      select count(*)
      from public.course_plan_homework_assignments as homework
      where homework.course_plan_exam_item_id in (
        select item.id
        from public.course_plan_exam_items as item
        inner join public.course_plan_days as day on day.id = item.course_plan_day_id
        inner join public.course_plans as plan on plan.id = day.course_plan_id
        where plan.class_id = p_class_id
      )
        or homework.cambridge_exam_assignment_id in (
          select assignment.id
          from public.cambridge_exam_assignments as assignment
          where assignment.course_plan_class_id = p_class_id
        )
    ),
    'cambridge_exam_assignments', (
      select count(*)
      from public.cambridge_exam_assignments as assignment
      where assignment.course_plan_class_id = p_class_id
        or assignment.course_plan_day_id in (
          select day.id
          from public.course_plan_days as day
          inner join public.course_plans as plan on plan.id = day.course_plan_id
          where plan.class_id = p_class_id
        )
        or assignment.id in (
          select homework.cambridge_exam_assignment_id
          from public.course_plan_homework_assignments as homework
          inner join public.course_plan_exam_items as item
            on item.id = homework.course_plan_exam_item_id
          inner join public.course_plan_days as day
            on day.id = item.course_plan_day_id
          inner join public.course_plans as plan
            on plan.id = day.course_plan_id
          where plan.class_id = p_class_id
        )
    ),
    'student_assignment_homework_reads', (
      select count(*)
      from public.student_assignment_homework_reads as homework_read
      where homework_read.cambridge_exam_assignment_id in (
        select assignment.id
        from public.cambridge_exam_assignments as assignment
        where assignment.course_plan_class_id = p_class_id
          or assignment.course_plan_day_id in (
            select day.id
            from public.course_plan_days as day
            inner join public.course_plans as plan on plan.id = day.course_plan_id
            where plan.class_id = p_class_id
          )
          or assignment.id in (
            select homework.cambridge_exam_assignment_id
            from public.course_plan_homework_assignments as homework
            inner join public.course_plan_exam_items as item
              on item.id = homework.course_plan_exam_item_id
            inner join public.course_plan_days as day
              on day.id = item.course_plan_day_id
            inner join public.course_plans as plan
              on plan.id = day.course_plan_id
            where plan.class_id = p_class_id
          )
      )
    ),
    'academic_year_rollover_classes', (
      select count(*) from public.academic_year_rollover_classes as mapping
      where mapping.source_class_id = p_class_id
        or mapping.target_class_id = p_class_id
    ),
    'academic_year_rollover_students', (
      select count(*) from public.academic_year_rollover_students as student
      where student.source_class_id = p_class_id
        or student.target_class_id = p_class_id
    )
  )
  into v_dependencies;

  select count(*)
  into v_storage_files
  from public.course_plan_resources as resource
  inner join public.course_plan_days as day on day.id = resource.course_plan_day_id
  inner join public.course_plans as plan on plan.id = day.course_plan_id
  where plan.class_id = p_class_id
    and resource.storage_path is not null;

  select coalesce(sum(dependency.value::text::bigint), 0)
  into v_total_dependent_rows
  from jsonb_each(v_dependencies) as dependency(key, value);

  if v_cambridge_students + v_young_learners > 0 then
    v_warnings := jsonb_build_array(
      'This class still has current students. Purge those test students or move them before permanently deleting the class.'
    );
  end if;

  return jsonb_build_object(
    'students', jsonb_build_object(
      'cambridge_current', v_cambridge_students,
      'young_learners_current', v_young_learners,
      'total_current', v_cambridge_students + v_young_learners
    ),
    'dependencies', v_dependencies,
    'total_dependent_rows', v_total_dependent_rows,
    'storage_files', v_storage_files,
    'can_purge', v_cambridge_students + v_young_learners = 0,
    'warnings', v_warnings,
    'preserved', jsonb_build_array(
      'Student profiles and Supabase Auth users',
      'Young Learner identities',
      'Other classes and their records',
      'Levels, classrooms and academic years',
      'Shared and level-wide teacher/student resources',
      'Friday Tutorial schedules and unrelated student records',
      'Academic-year rollover batches'
    )
  );
end;
$$;

create or replace function public.purge_test_class(
  p_class_id uuid,
  p_confirmation text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_preview jsonb;
  v_register_ids uuid[] := array[]::uuid[];
  v_follow_up_ids uuid[] := array[]::uuid[];
  v_friday_student_ids uuid[] := array[]::uuid[];
  v_friday_sheet_ids uuid[] := array[]::uuid[];
  v_announcement_ids uuid[] := array[]::uuid[];
  v_plan_ids uuid[] := array[]::uuid[];
  v_day_ids uuid[] := array[]::uuid[];
  v_exam_item_ids uuid[] := array[]::uuid[];
  v_assignment_ids uuid[] := array[]::uuid[];
  v_deleted_classes integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception using
      errcode = '42501',
      message = 'Test class purge requires service role.';
  end if;

  if p_confirmation is distinct from 'DELETE' then
    raise exception using
      errcode = '22023',
      message = 'The confirmation value must be DELETE.';
  end if;

  perform 1
  from public.classes as classroom
  where classroom.id = p_class_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'The selected class does not exist.';
  end if;

  v_preview := app_private.get_test_class_purge_preview(p_class_id);

  if not (v_preview ->> 'can_purge')::boolean then
    raise exception using
      errcode = '23514',
      message = 'The class still has current students.';
  end if;

  select coalesce(array_agg(register.id), array[]::uuid[])
  into v_register_ids
  from public.class_registers as register
  where register.class_id = p_class_id;

  select coalesce(array_agg(document.id), array[]::uuid[])
  into v_follow_up_ids
  from public.follow_up_documents as document
  where document.class_id = p_class_id;

  select coalesce(array_agg(student.id), array[]::uuid[])
  into v_friday_student_ids
  from public.friday_tutorial_students as student
  where student.class_id = p_class_id
    or student.follow_up_document_id = any(v_follow_up_ids);

  select coalesce(array_agg(sheet.id), array[]::uuid[])
  into v_friday_sheet_ids
  from public.friday_tutorial_result_sheets as sheet
  where sheet.class_id = p_class_id;

  select coalesce(array_agg(announcement.id), array[]::uuid[])
  into v_announcement_ids
  from public.announcements as announcement
  where announcement.classes_id = p_class_id;

  select coalesce(array_agg(plan.id), array[]::uuid[])
  into v_plan_ids
  from public.course_plans as plan
  where plan.class_id = p_class_id;

  select coalesce(array_agg(day.id), array[]::uuid[])
  into v_day_ids
  from public.course_plan_days as day
  where day.course_plan_id = any(v_plan_ids);

  select coalesce(array_agg(item.id), array[]::uuid[])
  into v_exam_item_ids
  from public.course_plan_exam_items as item
  where item.course_plan_day_id = any(v_day_ids);

  select coalesce(array_agg(assignment.id), array[]::uuid[])
  into v_assignment_ids
  from public.cambridge_exam_assignments as assignment
  where assignment.course_plan_class_id = p_class_id
    or assignment.course_plan_day_id = any(v_day_ids)
    or assignment.id in (
      select homework.cambridge_exam_assignment_id
      from public.course_plan_homework_assignments as homework
      where homework.course_plan_exam_item_id = any(v_exam_item_ids)
    );

  delete from public.class_register_entries as entry
  where entry.register_id = any(v_register_ids);

  delete from public.attendance_alerts as alert
  where alert.class_id = p_class_id;

  delete from public.class_registers as register
  where register.id = any(v_register_ids);

  delete from public.mock_result_reviews as review
  using public.results as result
  where review.result_id = result.id
    and (
      result.class_id = p_class_id
      or result.cambridge_exam_assignment_id = any(v_assignment_ids)
    );

  delete from public.student_assignment_homework_reads as homework_read
  where homework_read.cambridge_exam_assignment_id = any(v_assignment_ids);

  delete from public.results as result
  where result.class_id = p_class_id
    or result.cambridge_exam_assignment_id = any(v_assignment_ids);

  delete from public.course_plan_homework_assignments as homework
  where homework.course_plan_exam_item_id = any(v_exam_item_ids)
    or homework.cambridge_exam_assignment_id = any(v_assignment_ids);

  delete from public.cambridge_exam_assignments as assignment
  where assignment.id = any(v_assignment_ids);

  delete from public.course_plan_resources as resource
  where resource.course_plan_day_id = any(v_day_ids);

  delete from public.course_plan_exam_items as item
  where item.id = any(v_exam_item_ids);

  delete from public.course_plan_days as day
  where day.id = any(v_day_ids);

  delete from public.course_plans as plan
  where plan.id = any(v_plan_ids);

  delete from public.announcement_reads as announcement_read
  where announcement_read.announcement_id = any(v_announcement_ids);

  delete from public.announcements as announcement
  where announcement.id = any(v_announcement_ids);

  delete from public.friday_tutorial_session_students as session_student
  where session_student.tutorial_student_id = any(v_friday_student_ids);

  delete from public.friday_tutorial_students as student
  where student.id = any(v_friday_student_ids);

  delete from public.friday_tutorial_results as result
  where result.result_sheet_id = any(v_friday_sheet_ids);

  delete from public.friday_tutorial_result_sheets as sheet
  where sheet.id = any(v_friday_sheet_ids);

  delete from public.follow_up_entries as entry
  where entry.follow_up_document_id = any(v_follow_up_ids);

  delete from public.follow_up_documents as document
  where document.id = any(v_follow_up_ids);

  delete from public.teacher_notes as note
  where note.class_id = p_class_id;

  delete from public.class_progress_entries as progress
  where progress.class_id = p_class_id;

  delete from public.resources as resource
  where resource.class_id = p_class_id;

  delete from public.unit_exam_results as result
  where result.class_id = p_class_id;

  delete from public.young_learner_notes as note
  where note.class_id = p_class_id;

  delete from public.young_learner_class_point_entries as point_entry
  where point_entry.class_id = p_class_id;

  delete from public.class_enrolments as enrolment
  where enrolment.class_id = p_class_id;

  delete from public.young_learner_enrolments as enrolment
  where enrolment.class_id = p_class_id;

  delete from public.academic_year_rollover_students as student
  where student.source_class_id = p_class_id
    or student.target_class_id = p_class_id;

  delete from public.academic_year_rollover_classes as mapping
  where mapping.source_class_id = p_class_id
    or mapping.target_class_id = p_class_id;

  delete from public.class_enrolment_period_events e using public.class_enrolment_periods p
  where e.period_id=p.id and p.class_id=p_class_id;
  delete from public.class_enrolment_periods where class_id=p_class_id;
  -- This obsolete compatibility pointer is not an effective class assignment.
  -- Keep the identity when permanently deleting its last historical class.
  update public.young_learners set class_id=null where class_id=p_class_id;

  delete from public.classes as classroom
  where classroom.id = p_class_id;

  get diagnostics v_deleted_classes = row_count;

  if v_deleted_classes <> 1 then
    raise exception using
      errcode = 'P0001',
      message = 'The selected class could not be deleted.';
  end if;

  return v_preview || jsonb_build_object('success', true);
end;
$$;

alter function app_private.get_test_student_purge_preview(uuid[],uuid[]) owner to postgres;
alter function app_private.get_test_class_purge_preview(uuid) owner to postgres;
alter function public.purge_test_students(jsonb,text) owner to postgres;
alter function public.purge_test_class(uuid,text) owner to postgres;
revoke all on function app_private.get_test_student_purge_preview(uuid[],uuid[]),
  app_private.get_test_class_purge_preview(uuid) from public,anon,authenticated,service_role;
revoke all on function public.purge_test_students(jsonb,text),public.purge_test_class(uuid,text) from public,anon,authenticated;
grant execute on function public.purge_test_students(jsonb,text),public.purge_test_class(uuid,text) to service_role;

create or replace function public.save_teacher_mock_result_review(
  p_actor_id uuid,
  p_result_id uuid,
  p_class_id uuid,
  p_student_id uuid,
  p_mock_number integer,
  p_reading numeric,
  p_writing numeric,
  p_listening numeric,
  p_speaking numeric,
  p_comments text,
  p_action text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_result public.results%rowtype;
  v_review public.mock_result_reviews%rowtype;
  v_title text;
  v_overall numeric;
  v_next_status text;
  v_now timestamptz := now();
begin
  if not exists (
    select 1 from public.profiles
    where id = p_actor_id and role = 'teacher'
  ) then
    raise exception 'Teacher access required' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.classes as classroom
    join public.levels as level on level.id = classroom.level_id
    where classroom.id = p_class_id
      and classroom.teacher_id = p_actor_id
      and classroom.is_cambridge = true
      and upper(trim(level.name)) in ('B1', 'B2', 'C1', 'C2')
  ) then
    raise exception 'Teacher does not own this Cambridge class' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.current_class_enrolments
    where class_id = p_class_id and student_id = p_student_id
  ) then
    raise exception 'Student is not enrolled in this class' using errcode = '42501';
  end if;

  if p_action not in ('save_draft', 'submit') then
    raise exception 'Invalid Mock Result action';
  end if;

  if p_mock_number is null or p_mock_number < 1 then
    raise exception 'Mock number must be a positive whole number';
  end if;

  if (p_reading is not null and (p_reading < 0 or p_reading > 100))
    or (p_writing is not null and (p_writing < 0 or p_writing > 100))
    or (p_listening is not null and (p_listening < 0 or p_listening > 100))
    or (p_speaking is not null and (p_speaking < 0 or p_speaking > 100)) then
    raise exception 'Mock scores must be between 0 and 100';
  end if;

  if length(coalesce(p_comments, '')) > 5000 then
    raise exception 'Comments must be 5000 characters or fewer';
  end if;

  if p_action = 'submit' and (
    p_reading is null or p_writing is null or
    p_listening is null or p_speaking is null
  ) then
    raise exception 'All four Mock Exam scores are required before submission';
  end if;

  v_title := 'Mock ' || p_mock_number;
  v_overall := case
    when p_reading is not null and p_writing is not null
      and p_listening is not null and p_speaking is not null
    then (p_reading + p_writing + p_listening + p_speaking) / 4
    else null
  end;

  if p_result_id is null then
    if exists (
      select 1 from public.results
      where class_id = p_class_id
        and student_id = p_student_id
        and result_type = 'mock'
        and mock_number = p_mock_number
    ) then
      raise exception 'A result already exists for this student and Mock Exam number';
    end if;

    insert into public.results (
      student_id, teacher_id, class_id, result_type, title, mock_number,
      reading, writing, listening, speaking, overall, comments, published_at
    ) values (
      p_student_id, p_actor_id, p_class_id, 'mock', v_title, p_mock_number,
      p_reading, p_writing, p_listening, p_speaking, v_overall,
      nullif(trim(coalesce(p_comments, '')), ''), null
    ) returning * into v_result;

    insert into public.mock_result_reviews (
      result_id, status, mock_number, title, reading, writing, listening,
      speaking, overall, comments, submitted_at, submitted_by
    ) values (
      v_result.id,
      case when p_action = 'submit' then 'awaiting_review' else 'draft' end,
      p_mock_number, v_title, p_reading, p_writing, p_listening, p_speaking,
      v_overall, nullif(trim(coalesce(p_comments, '')), ''),
      case when p_action = 'submit' then v_now else null end,
      case when p_action = 'submit' then p_actor_id else null end
    ) returning * into v_review;
  else
    select * into v_result
    from public.results
    where id = p_result_id
      and class_id = p_class_id
      and student_id = p_student_id
      and result_type = 'mock'
    for update;

    if not found then
      raise exception 'Mock Result was not found';
    end if;

    select * into v_review
    from public.mock_result_reviews
    where result_id = v_result.id
    for update;

    if not found then
      raise exception 'Mock Result review state was not found';
    end if;

    if v_review.status = 'awaiting_review' then
      raise exception 'Mock Result is awaiting Admin review and cannot be edited';
    end if;

    v_next_status := case
      when p_action = 'submit' then 'awaiting_review'
      when v_review.status = 'changes_required' then 'changes_required'
      else 'draft'
    end;

    if v_result.published_at is null then
      update public.results
      set
        teacher_id = p_actor_id,
        title = v_title,
        mock_number = p_mock_number,
        reading = p_reading,
        writing = p_writing,
        listening = p_listening,
        speaking = p_speaking,
        overall = v_overall,
        comments = nullif(trim(coalesce(p_comments, '')), '')
      where id = v_result.id;
    end if;

    update public.mock_result_reviews
    set
      status = v_next_status,
      mock_number = p_mock_number,
      title = v_title,
      reading = p_reading,
      writing = p_writing,
      listening = p_listening,
      speaking = p_speaking,
      overall = v_overall,
      comments = nullif(trim(coalesce(p_comments, '')), ''),
      submitted_at = case
        when p_action = 'submit' then v_now
        when v_review.status = 'published' then null
        else v_review.submitted_at
      end,
      submitted_by = case
        when p_action = 'submit' then p_actor_id
        when v_review.status = 'published' then null
        else v_review.submitted_by
      end,
      review_note = case
        when p_action = 'submit' or v_review.status = 'published' then null
        else v_review.review_note
      end,
      reviewed_at = case
        when p_action = 'submit' or v_review.status = 'published' then null
        else v_review.reviewed_at
      end,
      reviewed_by = case
        when p_action = 'submit' or v_review.status = 'published' then null
        else v_review.reviewed_by
      end
    where result_id = v_result.id
    returning * into v_review;
  end if;

  return jsonb_build_object(
    'result_id', v_result.id,
    'status', v_review.status,
    'published_at', v_result.published_at
  );
end;
$$;

alter function public.save_teacher_mock_result_review(uuid,uuid,uuid,uuid,integer,numeric,numeric,numeric,numeric,text,text) owner to postgres;
revoke all on function public.save_teacher_mock_result_review(uuid,uuid,uuid,uuid,integer,numeric,numeric,numeric,numeric,text,text) from public,anon,authenticated;
grant execute on function public.save_teacher_mock_result_review(uuid,uuid,uuid,uuid,integer,numeric,numeric,numeric,numeric,text,text) to service_role;

-- Rollout is set-based and retains every historical episode. The same rules as
-- reconcile_attendance_alerts_for_student are applied before either mutation.
-- No outbound messaging is involved in the attendance_alerts table triggers.
create or replace function app_private.reconcile_enrolment_alert_rollout()
returns void language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
begin
  lock table public.attendance_alerts in share row exclusive mode;
  with identities as materialized (
    select r.class_id,e.student_type,e.profile_student_id,e.young_learner_id
      from public.class_register_entries e join public.class_registers r on r.id=e.register_id
    union
    select class_id,student_type,profile_student_id,young_learner_id from public.attendance_alerts
  ), ordered as materialized (
    select r.class_id,e.student_type,e.profile_student_id,e.young_learner_id,e.attendance_status,
      row_number() over(partition by r.class_id,e.student_type,coalesce(e.profile_student_id,e.young_learner_id)
        order by r.lesson_date desc,r.scheduled_start_time desc,r.id desc) as position
    from public.eligible_class_register_entries e join public.class_registers r on r.id=e.register_id
    where r.completed_at is not null and e.attendance_status in ('present','absent')
      and not public.is_school_closed(r.lesson_date)
  ), totals as (
    select i.class_id,i.student_type,i.profile_student_id,i.young_learner_id,
      count(o.attendance_status) as total,
      count(*) filter(where o.attendance_status='present') as present,
      count(*) filter(where o.position<=2 and o.attendance_status='absent')=2 as consecutive
    from identities i left join ordered o on o.class_id=i.class_id and o.student_type=i.student_type
      and coalesce(o.profile_student_id,o.young_learner_id)=coalesce(i.profile_student_id,i.young_learner_id)
    group by i.class_id,i.student_type,i.profile_student_id,i.young_learner_id
  ), desired as materialized (
    select t.*,rule.alert_type,case rule.alert_type when 'consecutive_absence' then t.consecutive
      else t.total>=15 and (t.present::numeric/nullif(t.total,0))*100<70 end as active
    from totals t cross join (values('consecutive_absence'),('low_attendance')) rule(alert_type)
  ), resolved as (
    update public.attendance_alerts a set condition_active=false,resolved_at=now(),updated_at=now()
    from desired d where a.class_id=d.class_id and a.student_type=d.student_type and a.alert_type=d.alert_type
      and coalesce(a.profile_student_id,a.young_learner_id)=coalesce(d.profile_student_id,d.young_learner_id)
      and a.condition_active and not coalesce(d.active,false) returning a.id
  )
  insert into public.attendance_alerts(alert_type,class_id,student_type,profile_student_id,young_learner_id)
    select d.alert_type,d.class_id,d.student_type,d.profile_student_id,d.young_learner_id from desired d
    where d.active and not exists(select 1 from public.attendance_alerts a
      where a.class_id=d.class_id and a.student_type=d.student_type and a.alert_type=d.alert_type
        and coalesce(a.profile_student_id,a.young_learner_id)=coalesce(d.profile_student_id,d.young_learner_id)
        and a.condition_active)
    on conflict do nothing;
end;
$$;
alter function app_private.reconcile_enrolment_alert_rollout() owner to postgres;
revoke all on function app_private.reconcile_enrolment_alert_rollout() from public,anon,authenticated,service_role;
select app_private.reconcile_enrolment_alert_rollout();

commit;
