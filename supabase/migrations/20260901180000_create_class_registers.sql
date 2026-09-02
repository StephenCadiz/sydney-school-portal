begin;

create table public.class_registers (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null
    references public.classes(id) on delete restrict,
  lesson_date date not null,
  scheduled_start_time time not null,
  scheduled_end_time time not null,
  completed_at timestamptz,
  completed_by uuid
    references public.profiles(id) on delete set null,
  created_by uuid
    references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint class_registers_lesson_time_check
    check (scheduled_end_time > scheduled_start_time),
  constraint class_registers_completion_actor_check
    check (
      completed_at is not null
      or completed_by is null
    ),
  constraint class_registers_class_lesson_start_key
    unique (class_id, lesson_date, scheduled_start_time)
);

create table public.class_register_entries (
  id uuid primary key default gen_random_uuid(),
  register_id uuid not null
    references public.class_registers(id) on delete cascade,
  student_type text not null,
  profile_student_id uuid
    references public.profiles(id) on delete restrict,
  young_learner_id uuid
    references public.young_learners(id) on delete restrict,
  attendance_status text,
  marked_at timestamptz,
  marked_by uuid
    references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint class_register_entries_student_type_check
    check (student_type in ('profile', 'young_learner')),
  constraint class_register_entries_identity_check
    check (
      (
        student_type = 'profile'
        and profile_student_id is not null
        and young_learner_id is null
      )
      or (
        student_type = 'young_learner'
        and profile_student_id is null
        and young_learner_id is not null
      )
    ),
  constraint class_register_entries_attendance_status_check
    check (
      attendance_status is null
      or attendance_status in ('present', 'absent')
    ),
  constraint class_register_entries_marking_audit_check
    check (
      (
        attendance_status is null
        and marked_at is null
        and marked_by is null
      )
      or (
        attendance_status is not null
        and marked_at is not null
      )
    )
);

create unique index class_register_entries_register_profile_key
on public.class_register_entries (register_id, profile_student_id)
where profile_student_id is not null;

create unique index class_register_entries_register_young_learner_key
on public.class_register_entries (register_id, young_learner_id)
where young_learner_id is not null;

create index class_registers_class_lesson_idx
on public.class_registers (
  class_id,
  lesson_date desc,
  scheduled_start_time desc
);

create index class_registers_incomplete_lesson_idx
on public.class_registers (
  class_id,
  lesson_date,
  scheduled_start_time
)
where completed_at is null;

create index class_register_entries_register_status_idx
on public.class_register_entries (register_id, attendance_status);

create index class_register_entries_profile_history_idx
on public.class_register_entries (profile_student_id, register_id)
where profile_student_id is not null;

create index class_register_entries_young_learner_history_idx
on public.class_register_entries (young_learner_id, register_id)
where young_learner_id is not null;

create or replace function public.set_class_register_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger class_registers_set_updated_at
before update on public.class_registers
for each row
execute function public.set_class_register_updated_at();

create trigger class_register_entries_set_updated_at
before update on public.class_register_entries
for each row
execute function public.set_class_register_updated_at();

comment on table public.class_registers is
  'One roster register for one legitimate scheduled class lesson.';

comment on table public.class_register_entries is
  'Historical roster snapshot and Present/Absent state for a class register. A null attendance_status means the entry is not yet marked and never implies absence.';

comment on column public.class_registers.completed_at is
  'Set only after every snapshotted student has an explicit Present or Absent status.';

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

  if v_is_cambridge and exists (
    select 1
    from jsonb_to_recordset(p_roster) as submitted(
      student_type text,
      profile_student_id uuid,
      young_learner_id uuid
    )
    where not exists (
      select 1
      from public.class_enrolments enrolment
      inner join public.profiles student
        on student.id = enrolment.student_id
      where enrolment.class_id = p_class_id
        and enrolment.student_id = submitted.profile_student_id
        and enrolment.enrolled_at <= p_lesson_date
        and student.role = 'student'
        and coalesce(student.active, true)
    )
  ) then
    raise exception 'The submitted roster contains an invalid class student';
  end if;

  if not v_is_cambridge and exists (
    select 1
    from jsonb_to_recordset(p_roster) as submitted(
      student_type text,
      profile_student_id uuid,
      young_learner_id uuid
    )
    where not exists (
      select 1
      from public.young_learners student
      inner join public.young_learner_enrolments enrolment
        on enrolment.young_learner_id = student.id
       and enrolment.class_id = p_class_id
      where student.id = submitted.young_learner_id
        and student.class_id = p_class_id
        and student.active = true
        and enrolment.enrolled_at <= p_lesson_date
    )
  ) then
    raise exception 'The submitted roster contains an invalid Young Learner';
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

revoke all on function public.open_class_register(
  uuid,
  uuid,
  date,
  time,
  time,
  jsonb
) from public, anon, authenticated;

grant execute on function public.open_class_register(
  uuid,
  uuid,
  date,
  time,
  time,
  jsonb
) to service_role;

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
  from public.class_register_entries entry
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
  from public.class_register_entries entry
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
        from public.class_register_entries entry
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

revoke all on function public.save_class_register_attendance(
  uuid,
  uuid,
  jsonb,
  boolean
) from public, anon, authenticated;

grant execute on function public.save_class_register_attendance(
  uuid,
  uuid,
  jsonb,
  boolean
) to service_role;

alter table public.class_registers enable row level security;
alter table public.class_register_entries enable row level security;

revoke all on table public.class_registers from anon, authenticated;
revoke all on table public.class_register_entries from anon, authenticated;

grant all on table public.class_registers to service_role;
grant all on table public.class_register_entries to service_role;

commit;
