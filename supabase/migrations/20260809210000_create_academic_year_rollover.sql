begin;

create table if not exists public.academic_year_rollovers (
  id uuid primary key default gen_random_uuid(),
  source_academic_year_id uuid not null
    references public.academic_years(id) on delete restrict,
  target_academic_year_id uuid not null
    references public.academic_years(id) on delete restrict,
  status text not null default 'draft',
  created_by uuid not null references public.profiles(id) on delete restrict,
  updated_by uuid null references public.profiles(id) on delete set null,
  applied_by uuid null references public.profiles(id) on delete set null,
  applied_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint academic_year_rollovers_years_differ_check
    check (source_academic_year_id <> target_academic_year_id),
  constraint academic_year_rollovers_status_check
    check (status in ('draft', 'partially_applied', 'completed')),
  constraint academic_year_rollovers_source_target_key
    unique (source_academic_year_id, target_academic_year_id)
);

create table if not exists public.academic_year_rollover_classes (
  id uuid primary key default gen_random_uuid(),
  rollover_id uuid not null
    references public.academic_year_rollovers(id) on delete cascade,
  source_class_id uuid not null references public.classes(id) on delete restrict,
  target_class_id uuid not null references public.classes(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint academic_year_rollover_classes_source_key
    unique (rollover_id, source_class_id),
  constraint academic_year_rollover_classes_target_key
    unique (rollover_id, target_class_id)
);

create table if not exists public.academic_year_rollover_students (
  id uuid primary key default gen_random_uuid(),
  rollover_id uuid not null
    references public.academic_year_rollovers(id) on delete cascade,
  student_type text not null,
  profile_student_id uuid null references public.profiles(id) on delete restrict,
  young_learner_id uuid null
    references public.young_learners(id) on delete restrict,
  source_class_id uuid not null references public.classes(id) on delete restrict,
  decision text not null default 'decide_later',
  target_class_id uuid null references public.classes(id) on delete restrict,
  suggested_level_id bigint null references public.levels(id) on delete set null,
  notes text null,
  updated_by uuid null references public.profiles(id) on delete set null,
  applied_by uuid null references public.profiles(id) on delete set null,
  applied_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint academic_year_rollover_students_type_check
    check (student_type in ('profile', 'young_learner')),
  constraint academic_year_rollover_students_identity_check
    check (
      (student_type = 'profile'
        and profile_student_id is not null
        and young_learner_id is null)
      or
      (student_type = 'young_learner'
        and profile_student_id is null
        and young_learner_id is not null)
    ),
  constraint academic_year_rollover_students_decision_check
    check (
      decision in (
        'decide_later',
        'promote',
        'repeat',
        'different_level',
        'not_returning'
      )
    ),
  constraint academic_year_rollover_students_target_check
    check (
      (decision in ('decide_later', 'not_returning')
        and target_class_id is null)
      or
      (decision in ('promote', 'repeat', 'different_level')
        and target_class_id is not null)
    ),
  constraint academic_year_rollover_students_notes_length_check
    check (notes is null or length(notes) <= 2000)
);

create unique index if not exists academic_year_rollover_students_profile_key
on public.academic_year_rollover_students (rollover_id, profile_student_id)
where profile_student_id is not null;

create unique index if not exists academic_year_rollover_students_young_key
on public.academic_year_rollover_students (rollover_id, young_learner_id)
where young_learner_id is not null;

create index if not exists academic_year_rollovers_target_idx
on public.academic_year_rollovers (target_academic_year_id, status);

create index if not exists academic_year_rollover_students_rollover_decision_idx
on public.academic_year_rollover_students (rollover_id, decision, applied_at);

create index if not exists academic_year_rollover_students_source_class_idx
on public.academic_year_rollover_students (source_class_id);

create index if not exists academic_year_rollover_students_target_class_idx
on public.academic_year_rollover_students (target_class_id)
where target_class_id is not null;

comment on table public.academic_year_rollovers is
  'Admin-controlled preparation and application of one future academic year from one source year.';

comment on table public.academic_year_rollover_classes is
  'Idempotent source-to-target class copies created within an academic-year rollover.';

comment on table public.academic_year_rollover_students is
  'Saved profile-student and Young Learner progression decisions for an academic-year rollover.';

create or replace function public.set_academic_year_rollover_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists academic_year_rollovers_set_updated_at
on public.academic_year_rollovers;
create trigger academic_year_rollovers_set_updated_at
before update on public.academic_year_rollovers
for each row execute function public.set_academic_year_rollover_updated_at();

drop trigger if exists academic_year_rollover_students_set_updated_at
on public.academic_year_rollover_students;
create trigger academic_year_rollover_students_set_updated_at
before update on public.academic_year_rollover_students
for each row execute function public.set_academic_year_rollover_updated_at();

create or replace function public.copy_academic_year_rollover_class(
  p_rollover_id uuid,
  p_source_class_id uuid,
  p_teacher_id uuid,
  p_actor_id uuid,
  p_classroom_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_rollover public.academic_year_rollovers;
  v_source public.classes;
  v_existing_target_id uuid;
  v_target_id uuid;
  v_is_online boolean;
begin
  if not exists (
    select 1 from public.profiles
    where id = p_actor_id and role = 'admin'
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

  if not exists (
    select 1 from public.academic_years
    where id = v_rollover.target_academic_year_id
      and status = 'future'
  ) then
    raise exception 'Classes can only be copied into a Future academic year.';
  end if;

  select target_class_id into v_existing_target_id
  from public.academic_year_rollover_classes
  where rollover_id = p_rollover_id
    and source_class_id = p_source_class_id;

  if v_existing_target_id is not null then
    return v_existing_target_id;
  end if;

  select * into v_source
  from public.classes
  where id = p_source_class_id
  for share;

  if not found
    or v_source.academic_year_id <> v_rollover.source_academic_year_id
    or lower(trim(coalesce(v_source.course_type, 'regular')))
      in ('intensive', 'express') then
    raise exception 'The source class is not eligible for this rollover.';
  end if;

  if not exists (
    select 1 from public.profiles
    where id = p_teacher_id and role = 'teacher'
  ) then
    raise exception 'Choose a valid teacher.';
  end if;

  v_is_online := lower(trim(coalesce(v_source.course_type, 'regular'))) = 'online';

  if not v_is_online and (
    p_classroom_id is null
    or not exists (
      select 1 from public.classrooms where id = p_classroom_id
    )
  ) then
    raise exception 'Choose a classroom for the copied class.';
  end if;

  insert into public.classes (
    class_name,
    level_id,
    teacher_id,
    classroom_id,
    course_type,
    days,
    start_time,
    end_time,
    meet_link,
    is_cambridge,
    start_date,
    end_date,
    academic_year_id
  ) values (
    v_source.class_name,
    v_source.level_id,
    p_teacher_id,
    case when v_is_online then null else p_classroom_id end,
    coalesce(nullif(trim(v_source.course_type), ''), 'regular'),
    v_source.days,
    v_source.start_time,
    v_source.end_time,
    case when v_is_online then v_source.meet_link else null end,
    v_source.is_cambridge,
    null,
    null,
    v_rollover.target_academic_year_id
  )
  returning id into v_target_id;

  insert into public.academic_year_rollover_classes (
    rollover_id,
    source_class_id,
    target_class_id
  ) values (
    p_rollover_id,
    p_source_class_id,
    v_target_id
  );

  update public.academic_year_rollovers
  set updated_by = p_actor_id
  where id = p_rollover_id;

  return v_target_id;
end;
$$;

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
set search_path = public, pg_temp
as $$
declare
  v_row public.academic_year_rollover_students;
  v_rollover public.academic_year_rollovers;
  v_source public.classes;
  v_target public.classes;
  v_result public.academic_year_rollover_students;
  v_notes text := nullif(trim(coalesce(p_notes, '')), '');
  v_assignment_changed boolean;
begin
  if not exists (
    select 1 from public.profiles
    where id = p_actor_id and role = 'admin'
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
  where id = p_decision_id
  for update;

  if not found then
    raise exception 'Student rollover decision not found.';
  end if;

  select * into v_rollover
  from public.academic_year_rollovers
  where id = v_row.rollover_id
  for update;

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
        select 1 from public.class_enrolments
        where student_id = v_row.profile_student_id
          and class_id = v_row.source_class_id
      ) then
      raise exception 'The profile student does not belong to the source class.';
    end if;
  else
    if v_source.is_cambridge is true
      or not exists (
        select 1 from public.young_learner_enrolments
        where young_learner_id = v_row.young_learner_id
          and class_id = v_row.source_class_id
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

  if v_row.applied_at is not null
    and v_assignment_changed
    and v_row.target_class_id is not null then
    if exists (
      select 1 from public.classes
      where id = v_row.target_class_id
        and academic_year_id = v_rollover.target_academic_year_id
    ) then
      if v_row.student_type = 'profile' then
        delete from public.class_enrolments
        where student_id = v_row.profile_student_id
          and class_id = v_row.target_class_id;
      else
        delete from public.young_learner_enrolments
        where young_learner_id = v_row.young_learner_id
          and class_id = v_row.target_class_id;
      end if;
    end if;
  end if;

  update public.academic_year_rollover_students
  set decision = p_decision,
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
set search_path = public, pg_temp
as $$
declare
  v_rollover public.academic_year_rollovers;
  v_target_status text;
  v_target_start_date date;
  v_newly_applied integer := 0;
  v_total_applied integer := 0;
  v_undecided integer := 0;
  v_status text;
begin
  if not exists (
    select 1 from public.profiles
    where id = p_actor_id and role = 'admin'
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
          select 1 from public.class_enrolments enrolment
          where enrolment.student_id = student.profile_student_id
            and enrolment.class_id = student.source_class_id
        ))
        or
        (student.student_type = 'young_learner' and not exists (
          select 1 from public.young_learner_enrolments enrolment
          where enrolment.young_learner_id = student.young_learner_id
            and enrolment.class_id = student.source_class_id
        ))
      )
  ) then
    raise exception 'One or more students no longer belong to their source class.';
  end if;

  insert into public.class_enrolments (student_id, class_id, enrolled_at)
  select
    student.profile_student_id,
    student.target_class_id,
    v_target_start_date
  from public.academic_year_rollover_students student
  where student.rollover_id = p_rollover_id
    and student.student_type = 'profile'
    and student.decision in ('promote', 'repeat', 'different_level')
    and student.applied_at is null
  on conflict (student_id, class_id) do nothing;

  insert into public.young_learner_enrolments (
    young_learner_id,
    class_id,
    enrolled_at
  )
  select
    student.young_learner_id,
    student.target_class_id,
    v_target_start_date
  from public.academic_year_rollover_students student
  where student.rollover_id = p_rollover_id
    and student.student_type = 'young_learner'
    and student.decision in ('promote', 'repeat', 'different_level')
    and student.applied_at is null
  on conflict (young_learner_id, class_id) do nothing;

  update public.academic_year_rollover_students
  set applied_at = now(),
      applied_by = p_actor_id,
      updated_by = p_actor_id
  where rollover_id = p_rollover_id
    and decision <> 'decide_later'
    and applied_at is null;
  get diagnostics v_newly_applied = row_count;

  if v_target_status = 'current' then
    update public.young_learners learner
    set class_id = student.target_class_id
    from public.academic_year_rollover_students student
    where student.rollover_id = p_rollover_id
      and student.student_type = 'young_learner'
      and student.young_learner_id = learner.id
      and student.decision in ('promote', 'repeat', 'different_level')
      and student.applied_at is not null;
  end if;

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

create or replace function public.save_academic_year_rollover_student_decisions(
  p_rollover_id uuid,
  p_decisions jsonb,
  p_actor_id uuid
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_item jsonb;
  v_decision_id uuid;
  v_target_class_id uuid;
  v_updated integer := 0;
begin
  if jsonb_typeof(p_decisions) <> 'array' then
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

create or replace function public.set_current_academic_year(
  p_academic_year_id uuid
)
returns public.academic_years
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_target public.academic_years;
  v_today date := (now() at time zone 'Europe/Madrid')::date;
  v_previous_academic_year_id uuid;
begin
  perform pg_advisory_xact_lock(hashtext('public.academic_years.current'));

  select * into v_target
  from public.academic_years
  where id = p_academic_year_id
  for update;

  if not found then
    raise exception 'Academic year not found.';
  end if;

  select id into v_previous_academic_year_id
  from public.academic_years
  where status = 'current'
    and id <> p_academic_year_id
  limit 1;

  update public.academic_years
  set status = case when end_date < v_today then 'archived' else 'future' end
  where status = 'current'
    and id <> p_academic_year_id;

  update public.academic_years
  set status = 'current'
  where id = p_academic_year_id
  returning * into v_target;

  update public.young_learners learner
  set class_id = case
    when exists (
      select 1
      from public.academic_year_rollovers rollover
      inner join public.academic_year_rollover_students student
        on student.rollover_id = rollover.id
      where rollover.source_academic_year_id = v_previous_academic_year_id
        and rollover.target_academic_year_id = p_academic_year_id
        and student.student_type = 'young_learner'
        and student.young_learner_id = learner.id
    ) then (
      select case
        when student.decision in ('promote', 'repeat', 'different_level')
          and student.applied_at is not null
          and exists (
            select 1 from public.classes target_class
            where target_class.id = student.target_class_id
              and target_class.academic_year_id = p_academic_year_id
          )
        then student.target_class_id
        else null
      end
      from public.academic_year_rollovers rollover
      inner join public.academic_year_rollover_students student
        on student.rollover_id = rollover.id
      where rollover.source_academic_year_id = v_previous_academic_year_id
        and rollover.target_academic_year_id = p_academic_year_id
        and student.student_type = 'young_learner'
        and student.young_learner_id = learner.id
      limit 1
    )
    else (
      select case
        when count(*) = 1 then (array_agg(enrolment.class_id))[1]
        else null
      end
      from public.young_learner_enrolments enrolment
      inner join public.classes classroom on classroom.id = enrolment.class_id
      where enrolment.young_learner_id = learner.id
        and classroom.academic_year_id = p_academic_year_id
        and lower(trim(coalesce(classroom.course_type, 'regular')))
          not in ('intensive', 'express')
    )
  end;

  return v_target;
end;
$$;

alter table public.academic_year_rollovers enable row level security;
alter table public.academic_year_rollover_classes enable row level security;
alter table public.academic_year_rollover_students enable row level security;

revoke all on table public.academic_year_rollovers from anon, authenticated;
revoke all on table public.academic_year_rollover_classes from anon, authenticated;
revoke all on table public.academic_year_rollover_students from anon, authenticated;

grant all on table public.academic_year_rollovers to service_role;
grant all on table public.academic_year_rollover_classes to service_role;
grant all on table public.academic_year_rollover_students to service_role;

revoke execute on function public.copy_academic_year_rollover_class(
  uuid, uuid, uuid, uuid, uuid
) from public, anon, authenticated;
revoke execute on function public.save_academic_year_rollover_student_decision(
  uuid, text, uuid, text, uuid
) from public, anon, authenticated;
revoke execute on function public.apply_academic_year_rollover(uuid, uuid)
from public, anon, authenticated;
revoke execute on function public.save_academic_year_rollover_student_decisions(
  uuid, jsonb, uuid
) from public, anon, authenticated;
revoke execute on function public.set_current_academic_year(uuid)
from public, anon, authenticated;

grant execute on function public.copy_academic_year_rollover_class(
  uuid, uuid, uuid, uuid, uuid
) to service_role;
grant execute on function public.save_academic_year_rollover_student_decision(
  uuid, text, uuid, text, uuid
) to service_role;
grant execute on function public.apply_academic_year_rollover(uuid, uuid)
to service_role;
grant execute on function public.save_academic_year_rollover_student_decisions(
  uuid, jsonb, uuid
) to service_role;
grant execute on function public.set_current_academic_year(uuid)
to service_role;

commit;
