begin;

alter table public.friday_exam_practice_sessions
  add column if not exists exam_part text null;

alter table public.class_enrolments
  add column if not exists enrolled_at date null;

do $$
declare
  v_created_at_type text;
begin
  select data_type
  into v_created_at_type
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'class_enrolments'
    and column_name = 'created_at';

  if v_created_at_type = 'timestamp with time zone' then
    update public.class_enrolments
    set enrolled_at = coalesce(
      enrolled_at,
      (created_at at time zone 'Europe/Madrid')::date
    )
    where enrolled_at is null;
  elsif v_created_at_type = 'timestamp without time zone' then
    update public.class_enrolments
    set enrolled_at = coalesce(enrolled_at, created_at::date)
    where enrolled_at is null;
  end if;
end;
$$;

update public.class_enrolments
set enrolled_at = (now() at time zone 'Europe/Madrid')::date
where enrolled_at is null;

alter table public.class_enrolments
  alter column enrolled_at set default ((now() at time zone 'Europe/Madrid')::date);

alter table public.class_enrolments
  alter column enrolled_at set not null;

create table if not exists public.friday_tutorial_result_sheets (
  id uuid primary key default gen_random_uuid(),
  tutorial_session_id uuid not null references public.friday_exam_practice_sessions(id) on delete restrict,
  class_id uuid not null references public.classes(id) on delete restrict,
  submitted_at timestamptz not null default now(),
  submitted_by uuid null references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid null references public.profiles(id) on delete set null,
  constraint friday_tutorial_result_sheets_session_class_key unique (tutorial_session_id, class_id)
);

create table if not exists public.friday_tutorial_results (
  id uuid primary key default gen_random_uuid(),
  result_sheet_id uuid not null references public.friday_tutorial_result_sheets(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  percentage numeric(5,2) null,
  attended boolean not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint friday_tutorial_results_sheet_student_key unique (result_sheet_id, student_id),
  constraint friday_tutorial_results_percentage_range_check check (
    percentage is null or (percentage >= 0 and percentage <= 100)
  ),
  constraint friday_tutorial_results_attendance_percentage_check check (
    (attended = false and percentage is null)
    or
    (attended = true and percentage is not null)
  )
);

create index if not exists friday_tutorial_result_sheets_session_idx
  on public.friday_tutorial_result_sheets (tutorial_session_id);

create index if not exists friday_tutorial_result_sheets_class_idx
  on public.friday_tutorial_result_sheets (class_id);

create index if not exists friday_tutorial_result_sheets_submitted_by_idx
  on public.friday_tutorial_result_sheets (submitted_by);

create index if not exists friday_tutorial_result_sheets_updated_by_idx
  on public.friday_tutorial_result_sheets (updated_by);

create index if not exists friday_tutorial_results_student_idx
  on public.friday_tutorial_results (student_id);

create or replace function public.set_friday_tutorial_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_friday_tutorial_result_sheets_updated_at
on public.friday_tutorial_result_sheets;

create trigger set_friday_tutorial_result_sheets_updated_at
before update on public.friday_tutorial_result_sheets
for each row
execute function public.set_friday_tutorial_updated_at();

drop trigger if exists set_friday_tutorial_results_updated_at
on public.friday_tutorial_results;

create trigger set_friday_tutorial_results_updated_at
before update on public.friday_tutorial_results
for each row
execute function public.set_friday_tutorial_updated_at();

comment on table public.friday_tutorial_result_sheets is
  'Class-specific submitted Friday @ 6 tutorial result sheets.';

comment on table public.friday_tutorial_results is
  'Student rows for submitted Friday @ 6 tutorial result sheets.';

comment on column public.friday_exam_practice_sessions.exam_part is
  'The specific exam paper part used for Friday @ 6 tutorial result tracking.';

comment on column public.class_enrolments.enrolled_at is
  'Madrid-local enrolment date used to determine Friday @ 6 result eligibility.';

drop function if exists app_private.can_read_friday_tutorial_sheet_as_student(uuid, uuid);

create or replace function app_private.can_read_friday_tutorial_sheet_as_student(
  p_sheet_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.friday_tutorial_result_sheets sheet
    inner join public.friday_exam_practice_sessions session
      on session.id = sheet.tutorial_session_id
    inner join public.friday_tutorial_results result
      on result.result_sheet_id = sheet.id
    where sheet.id = p_sheet_id
      and result.student_id = auth.uid()
      and coalesce(session.active, false) = true
      and session.session_date::date <= (now() at time zone 'Europe/Madrid')::date
  );
$$;

revoke all on function app_private.can_read_friday_tutorial_sheet_as_student(uuid)
from public;

revoke all on function app_private.can_read_friday_tutorial_sheet_as_student(uuid)
from anon;

revoke all on function app_private.can_read_friday_tutorial_sheet_as_student(uuid)
from authenticated;

grant execute on function app_private.can_read_friday_tutorial_sheet_as_student(uuid)
to authenticated;

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
set search_path = public, pg_temp
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
    from public.class_enrolments ce
    inner join public.profiles p on p.id = ce.student_id
    where ce.class_id = p_class_id
      and ce.enrolled_at <= v_session_date
      and p.role = 'student';
  else
    insert into friday_tutorial_expected (student_id)
    select result.student_id
    from public.friday_tutorial_results result
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
  on conflict (result_sheet_id, student_id)
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

revoke all on function public.save_friday_tutorial_result_sheet(uuid, uuid, uuid, jsonb)
from public;

revoke all on function public.save_friday_tutorial_result_sheet(uuid, uuid, uuid, jsonb)
from anon;

revoke all on function public.save_friday_tutorial_result_sheet(uuid, uuid, uuid, jsonb)
from authenticated;

grant execute on function public.save_friday_tutorial_result_sheet(uuid, uuid, uuid, jsonb)
to service_role;

alter table public.friday_tutorial_result_sheets enable row level security;
alter table public.friday_tutorial_results enable row level security;

drop policy if exists "Admins can read all Friday tutorial result sheets"
on public.friday_tutorial_result_sheets;

create policy "Admins can read all Friday tutorial result sheets"
on public.friday_tutorial_result_sheets
for select
to authenticated
using (app_private.is_admin());

drop policy if exists "Teachers can read own class Friday tutorial result sheets"
on public.friday_tutorial_result_sheets;

create policy "Teachers can read own class Friday tutorial result sheets"
on public.friday_tutorial_result_sheets
for select
to authenticated
using (
  app_private.is_teacher()
  and exists (
    select 1
    from public.classes c
    where c.id = friday_tutorial_result_sheets.class_id
      and c.teacher_id = auth.uid()
  )
);

drop policy if exists "Students can read own submitted Friday tutorial result sheets"
on public.friday_tutorial_result_sheets;

create policy "Students can read own submitted Friday tutorial result sheets"
on public.friday_tutorial_result_sheets
for select
to authenticated
using (
  app_private.can_read_friday_tutorial_sheet_as_student(
    friday_tutorial_result_sheets.id
  )
);

drop policy if exists "Admins can read all Friday tutorial results"
on public.friday_tutorial_results;

create policy "Admins can read all Friday tutorial results"
on public.friday_tutorial_results
for select
to authenticated
using (app_private.is_admin());

drop policy if exists "Teachers can read own class Friday tutorial results"
on public.friday_tutorial_results;

create policy "Teachers can read own class Friday tutorial results"
on public.friday_tutorial_results
for select
to authenticated
using (
  app_private.is_teacher()
  and exists (
    select 1
    from public.friday_tutorial_result_sheets sheet
    inner join public.classes c on c.id = sheet.class_id
    where sheet.id = friday_tutorial_results.result_sheet_id
      and c.teacher_id = auth.uid()
  )
);

drop policy if exists "Students can read own submitted Friday tutorial results"
on public.friday_tutorial_results;

create policy "Students can read own submitted Friday tutorial results"
on public.friday_tutorial_results
for select
to authenticated
using (
  student_id = auth.uid()
  and app_private.can_read_friday_tutorial_sheet_as_student(
    friday_tutorial_results.result_sheet_id
  )
);

commit;
