begin;
set local search_path = pg_catalog, public, extensions;

-- A class can meet on several days while an individual learner attends only
-- some of them. These exclusions affect future roster snapshots only; existing
-- register history remains unchanged.
create table if not exists public.class_register_student_weekday_exclusions (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes(id) on delete restrict,
  student_type text not null check (student_type in ('profile', 'young_learner')),
  profile_student_id uuid references public.profiles(id) on delete restrict,
  young_learner_id uuid references public.young_learners(id) on delete restrict,
  student_id uuid generated always as (coalesce(profile_student_id, young_learner_id)) stored,
  weekday text not null check (weekday in ('Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday')),
  effective_from date not null default current_date,
  active boolean not null default true,
  reason text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint class_register_weekday_exclusion_identity check (
    (student_type = 'profile' and profile_student_id is not null and young_learner_id is null)
    or
    (student_type = 'young_learner' and profile_student_id is null and young_learner_id is not null)
  ),
  constraint class_register_weekday_exclusion_unique
    unique (class_id, student_type, student_id, weekday)
);

alter table public.class_register_student_weekday_exclusions owner to postgres;
alter table public.class_register_student_weekday_exclusions enable row level security;
revoke all on public.class_register_student_weekday_exclusions from public, anon, authenticated, service_role;
grant select on public.class_register_student_weekday_exclusions to service_role;
create index if not exists class_register_weekday_exclusions_lookup_idx
  on public.class_register_student_weekday_exclusions(class_id, weekday, effective_from)
  where active = true;

-- Alma Beltran Martin attends Pre-Kids 3 on Monday and Wednesday only. Resolve
-- the row by its staff-facing identity so this remains safe across environments
-- whose UUIDs differ, and fail loudly if the target is ambiguous or missing.
do $$
declare
  v_class_id uuid;
  v_student_id uuid;
  v_match_count integer;
begin
  select count(*)::integer
    into v_match_count
  from public.young_learners student
  join public.classes classroom on classroom.id = student.class_id
  join public.profiles teacher on teacher.id = classroom.teacher_id
  where lower(trim(student.first_name)) = 'alma'
    and lower(trim(student.last_name)) like 'beltran%'
    and lower(trim(classroom.class_name)) = 'pre-kids 3'
    and left(trim(classroom.start_time::text), 5) = '17:00'
    and left(trim(classroom.end_time::text), 5) = '18:00'
    and lower(trim(teacher.first_name)) = 'bernadett'
    and lower(trim(teacher.last_name)) = 'csuvar';

  if v_match_count <> 1 then
    raise exception 'Expected exactly one Alma Beltran Pre-Kids 3 / Bernadett class record, found %.', v_match_count;
  end if;

  select classroom.id, student.id
    into v_class_id, v_student_id
  from public.young_learners student
  join public.classes classroom on classroom.id = student.class_id
  join public.profiles teacher on teacher.id = classroom.teacher_id
  where lower(trim(student.first_name)) = 'alma'
    and lower(trim(student.last_name)) like 'beltran%'
    and lower(trim(classroom.class_name)) = 'pre-kids 3'
    and left(trim(classroom.start_time::text), 5) = '17:00'
    and left(trim(classroom.end_time::text), 5) = '18:00'
    and lower(trim(teacher.first_name)) = 'bernadett'
    and lower(trim(teacher.last_name)) = 'csuvar';

  insert into public.class_register_student_weekday_exclusions (
    class_id,
    student_type,
    young_learner_id,
    weekday,
    effective_from,
    reason
  ) values (
    v_class_id,
    'young_learner',
    v_student_id,
    'Friday',
    current_date,
    'Attends Monday and Wednesday only.'
  )
  on conflict (class_id, student_type, student_id, weekday)
  do update set
    active = true,
    effective_from = least(
      public.class_register_student_weekday_exclusions.effective_from,
      excluded.effective_from
    ),
    reason = excluded.reason;
end;
$$;

commit;
