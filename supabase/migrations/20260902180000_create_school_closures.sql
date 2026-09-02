begin;

create table public.school_closures (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  closure_type text not null,
  start_date date not null,
  end_date date not null,
  notes text,
  created_by uuid
    references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint school_closures_name_check
    check (nullif(btrim(name), '') is not null and char_length(name) <= 160),
  constraint school_closures_type_check
    check (closure_type in ('public_holiday', 'school_holiday', 'other')),
  constraint school_closures_date_order_check
    check (end_date >= start_date),
  constraint school_closures_notes_length_check
    check (notes is null or char_length(notes) <= 2000),
  constraint school_closures_no_overlapping_dates
    exclude using gist (daterange(start_date, end_date, '[]') with &&)
);

create index school_closures_dates_idx
  on public.school_closures (start_date, end_date);

comment on table public.school_closures is
  'Inclusive school-wide no-teaching date ranges using Europe/Madrid school dates.';

comment on constraint school_closures_no_overlapping_dates
  on public.school_closures is
  'Prevents two School Closure ranges from covering the same date.';

create or replace function app_private.set_school_closure_updated_at()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke all on function app_private.set_school_closure_updated_at()
from public, anon, authenticated;

create trigger school_closures_set_updated_at
before update on public.school_closures
for each row
execute function app_private.set_school_closure_updated_at();

create or replace function public.is_school_closed(p_date date)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, pg_temp
as $$
  select exists (
    select 1
    from public.school_closures closure
    where p_date between closure.start_date and closure.end_date
  );
$$;

revoke all on function public.is_school_closed(date)
from public, anon, authenticated;
grant execute on function public.is_school_closed(date)
to authenticated, service_role;

create or replace function app_private.reject_school_closure_dated_row()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_date date;
begin
  v_date := nullif(to_jsonb(new) ->> tg_argv[0], '')::date;

  if public.is_school_closed(v_date) then
    raise exception 'School is closed on this date. No lesson obligation can be created or updated.'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all on function app_private.reject_school_closure_dated_row()
from public, anon, authenticated;

create trigger class_registers_reject_school_closure
before insert or update on public.class_registers
for each row
execute function app_private.reject_school_closure_dated_row('lesson_date');

create trigger class_progress_entries_reject_school_closure
before insert or update on public.class_progress_entries
for each row
execute function app_private.reject_school_closure_dated_row('lesson_date');

create trigger friday_tutorial_sessions_reject_school_closure
before insert or update on public.friday_tutorial_sessions
for each row
execute function app_private.reject_school_closure_dated_row('session_date');

create trigger friday_at_6_duties_reject_school_closure
before insert or update on public.friday_at_6_duties
for each row
execute function app_private.reject_school_closure_dated_row('session_date');

create trigger friday_exam_practice_sessions_reject_school_closure
before insert or update on public.friday_exam_practice_sessions
for each row
execute function app_private.reject_school_closure_dated_row('session_date');

create or replace function app_private.reject_closed_friday_tutorial_attendance()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
begin
  if exists (
    select 1
    from public.friday_tutorial_sessions session
    where session.id = new.session_id
      and public.is_school_closed(session.session_date::date)
  ) then
    raise exception 'School is closed on this date. No Friday Tutorial attendance is required.'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all on function app_private.reject_closed_friday_tutorial_attendance()
from public, anon, authenticated;

create trigger friday_tutorial_attendance_reject_school_closure
before insert or update on public.friday_tutorial_session_students
for each row
execute function app_private.reject_closed_friday_tutorial_attendance();

create or replace function app_private.reject_closed_friday_result_sheet()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
begin
  if exists (
    select 1
    from public.friday_exam_practice_sessions session
    where session.id = new.tutorial_session_id
      and public.is_school_closed(session.session_date::date)
  ) then
    raise exception 'School is closed on this date. No Friday Tutorial results are required.'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all on function app_private.reject_closed_friday_result_sheet()
from public, anon, authenticated;

create trigger friday_result_sheets_reject_school_closure
before insert or update on public.friday_tutorial_result_sheets
for each row
execute function app_private.reject_closed_friday_result_sheet();

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
    from public.class_register_entries entry
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
  from public.class_register_entries entry
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

revoke all on function app_private.reconcile_attendance_alerts_for_student(
  uuid,
  text,
  uuid,
  uuid
) from public, anon, authenticated;

create or replace function app_private.reconcile_alerts_after_closure_change()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_start_date date;
  v_end_date date;
  v_student record;
begin
  if tg_op = 'INSERT' then
    v_start_date := new.start_date;
    v_end_date := new.end_date;
  elsif tg_op = 'DELETE' then
    v_start_date := old.start_date;
    v_end_date := old.end_date;
  else
    v_start_date := least(old.start_date, new.start_date);
    v_end_date := greatest(old.end_date, new.end_date);
  end if;

  for v_student in
    select distinct
      register.class_id,
      entry.student_type,
      entry.profile_student_id,
      entry.young_learner_id
    from public.class_register_entries entry
    inner join public.class_registers register
      on register.id = entry.register_id
    where register.completed_at is not null
      and entry.attendance_status in ('present', 'absent')
      and register.lesson_date between v_start_date and v_end_date
  loop
    perform app_private.reconcile_attendance_alerts_for_student(
      v_student.class_id,
      v_student.student_type,
      v_student.profile_student_id,
      v_student.young_learner_id
    );
  end loop;

  return null;
end;
$$;

revoke all on function app_private.reconcile_alerts_after_closure_change()
from public, anon, authenticated;

create trigger school_closures_reconcile_attendance_alerts
after insert or update or delete
on public.school_closures
for each row
execute function app_private.reconcile_alerts_after_closure_change();

alter table public.school_closures enable row level security;

revoke all on table public.school_closures from anon, authenticated;
grant all on table public.school_closures to service_role;

commit;
