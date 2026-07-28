-- Phase 2: Admin-managed Cambridge Exam Bank assignments.
-- Assignment rows reference master parts and never copy resource URLs.

create table public.cambridge_exam_assignments (
  id uuid primary key default gen_random_uuid(),
  exam_part_id uuid not null
    references public.cambridge_exam_parts(id) on delete restrict,
  course_type text not null,
  release_date date,
  due_date date,
  active boolean not null default false,
  archived_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cambridge_exam_assignments_course_type_check
    check (course_type in ('regular', 'intensive', 'express', 'online')),
  constraint cambridge_exam_assignments_dates_check
    check (due_date is null or release_date is null or due_date >= release_date),
  constraint cambridge_exam_assignments_archive_check
    check (archived_at is null or active = false)
);

create unique index cambridge_exam_assignments_current_unique_idx
on public.cambridge_exam_assignments (exam_part_id, course_type)
where archived_at is null;

create index cambridge_exam_assignments_part_idx
on public.cambridge_exam_assignments (exam_part_id);

create index cambridge_exam_assignments_course_idx
on public.cambridge_exam_assignments (course_type);

create index cambridge_exam_assignments_active_release_idx
on public.cambridge_exam_assignments (active, release_date);

create index cambridge_exam_assignments_archived_idx
on public.cambridge_exam_assignments (archived_at)
where archived_at is not null;

create trigger cambridge_exam_assignments_set_updated_at
before update on public.cambridge_exam_assignments
for each row execute function public.set_cambridge_exam_bank_updated_at();

alter table public.cambridge_exam_assignments enable row level security;
revoke all on table public.cambridge_exam_assignments from anon, authenticated;
grant select, insert, update, delete
on table public.cambridge_exam_assignments to service_role;

create or replace function public.prevent_assigned_cambridge_exam_archive()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.archived_at is not null
    and old.archived_at is null
    and exists (
      select 1
      from public.cambridge_exam_parts as part
      join public.cambridge_exam_assignments as assignment
        on assignment.exam_part_id = part.id
      where part.exam_set_id = new.id
        and assignment.archived_at is null
    )
  then
    raise exception using
      errcode = '23514',
      message = 'EXAM_HAS_CURRENT_ASSIGNMENTS';
  end if;
  return new;
end;
$$;

create trigger cambridge_exam_sets_prevent_assigned_archive
before update of archived_at on public.cambridge_exam_sets
for each row execute function public.prevent_assigned_cambridge_exam_archive();

revoke all on function public.prevent_assigned_cambridge_exam_archive()
from public, anon, authenticated, service_role;

create or replace function public.create_cambridge_exam_assignments(
  p_exam_set_id uuid,
  p_part_types text[],
  p_course_types text[],
  p_release_date date,
  p_due_date date,
  p_active boolean,
  p_actor_id uuid
)
returns uuid[]
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_level_name text;
  v_part_type text;
  v_course_type text;
  v_part_id uuid;
  v_missing text;
  v_created_ids uuid[] := array[]::uuid[];
  v_created_id uuid;
begin
  if not exists (select 1 from public.profiles where id = p_actor_id) then
    raise exception using errcode = '22023', message = 'INVALID_ACTOR';
  end if;

  select upper(btrim(level.name))
  into v_level_name
  from public.cambridge_exam_sets as exam_set
  join public.levels as level on level.id = exam_set.level_id
  where exam_set.id = p_exam_set_id
  for update of exam_set;

  if v_level_name is null then
    raise exception using errcode = 'P0002', message = 'EXAM_NOT_FOUND';
  end if;
  if not exists (
    select 1 from public.cambridge_exam_sets
    where id = p_exam_set_id and active = true and archived_at is null
  ) then
    raise exception using errcode = '23514', message = 'EXAM_NOT_ACTIVE';
  end if;
  if not (v_level_name = any(array['B1', 'B2', 'C1', 'C2'])) then
    raise exception using errcode = '22023', message = 'INVALID_EXAM_LEVEL';
  end if;

  if coalesce(cardinality(p_part_types), 0) = 0
    or coalesce(cardinality(p_course_types), 0) = 0
  then
    raise exception using errcode = '22023', message = 'SELECTION_REQUIRED';
  end if;
  if cardinality(p_part_types) <> (
    select count(distinct selected.value)
    from unnest(p_part_types) as selected(value)
  ) or cardinality(p_course_types) <> (
    select count(distinct selected.value)
    from unnest(p_course_types) as selected(value)
  ) then
    raise exception using errcode = '22023', message = 'DUPLICATE_SELECTION';
  end if;
  if exists (
    select 1 from unnest(p_part_types) as selected(value)
    where selected.value not in ('reading', 'listening', 'writing', 'speaking')
  ) or exists (
    select 1 from unnest(p_course_types) as selected(value)
    where selected.value not in ('regular', 'intensive', 'express', 'online')
  ) then
    raise exception using errcode = '22023', message = 'INVALID_SELECTION';
  end if;
  if p_due_date is not null and p_release_date is not null
    and p_due_date < p_release_date
  then
    raise exception using errcode = '22023', message = 'INVALID_DATE_RANGE';
  end if;

  foreach v_part_type in array p_part_types loop
    select id into v_part_id
    from public.cambridge_exam_parts
    where exam_set_id = p_exam_set_id and part_type = v_part_type;
    if v_part_id is null then
      raise exception using errcode = 'P0002', message = 'PART_NOT_FOUND';
    end if;

    select required.resource_type
    into v_missing
    from unnest(
      case v_part_type
        when 'reading' then array['paper', 'key']
        when 'listening' then array['paper', 'audio', 'key']
        when 'writing' then array['paper', 'sample_writing']
        else array['paper']
      end
    ) as required(resource_type)
    where not exists (
      select 1
      from public.cambridge_exam_part_resources as resource
      where resource.exam_part_id = v_part_id
        and resource.resource_type = required.resource_type
    )
    limit 1;
    if v_missing is not null then
      raise exception using
        errcode = '23514',
        message = 'INCOMPLETE_PART:' || v_part_type || ':' || v_missing;
    end if;

    foreach v_course_type in array p_course_types loop
      if exists (
        select 1 from public.cambridge_exam_assignments
        where exam_part_id = v_part_id
          and course_type = v_course_type
          and archived_at is null
      ) then
        raise exception using
          errcode = '23505',
          message = 'DUPLICATE_ASSIGNMENT:' || v_part_type || ':' || v_course_type;
      end if;

      begin
        insert into public.cambridge_exam_assignments (
          exam_part_id, course_type, release_date, due_date, active,
          created_by, updated_by
        ) values (
          v_part_id, v_course_type, p_release_date, p_due_date,
          coalesce(p_active, false), p_actor_id, p_actor_id
        ) returning id into v_created_id;
      exception
        when unique_violation then
          raise exception using
            errcode = '23505',
            message = 'DUPLICATE_ASSIGNMENT:' || v_part_type || ':' || v_course_type;
      end;
      v_created_ids := array_append(v_created_ids, v_created_id);
    end loop;
  end loop;

  return v_created_ids;
end;
$$;

revoke all on function public.create_cambridge_exam_assignments(
  uuid, text[], text[], date, date, boolean, uuid
) from public, anon, authenticated;
grant execute on function public.create_cambridge_exam_assignments(
  uuid, text[], text[], date, date, boolean, uuid
) to service_role;

create or replace function public.restore_cambridge_exam_assignment(
  p_assignment_id uuid,
  p_actor_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_exam_set_id uuid;
  v_exam_part_id uuid;
  v_course_type text;
  v_part_type text;
  v_archived_at timestamptz;
  v_level_name text;
  v_exam_active boolean;
  v_exam_archived_at timestamptz;
  v_missing text;
begin
  if not exists (select 1 from public.profiles where id = p_actor_id) then
    raise exception using errcode = '22023', message = 'INVALID_ACTOR';
  end if;

  select part.exam_set_id
  into v_exam_set_id
  from public.cambridge_exam_assignments as assignment
  join public.cambridge_exam_parts as part on part.id = assignment.exam_part_id
  where assignment.id = p_assignment_id;
  if v_exam_set_id is null then
    raise exception using errcode = 'P0002', message = 'ASSIGNMENT_NOT_FOUND';
  end if;

  select exam_set.active, exam_set.archived_at, upper(btrim(level.name))
  into v_exam_active, v_exam_archived_at, v_level_name
  from public.cambridge_exam_sets as exam_set
  join public.levels as level on level.id = exam_set.level_id
  where exam_set.id = v_exam_set_id
  for update of exam_set;
  if v_level_name is null or not (v_level_name = any(array['B1', 'B2', 'C1', 'C2']))
    or not v_exam_active or v_exam_archived_at is not null
  then
    raise exception using errcode = '23514', message = 'RESTORE_EXAM_UNAVAILABLE';
  end if;

  select assignment.exam_part_id, assignment.course_type,
    assignment.archived_at, part.part_type
  into v_exam_part_id, v_course_type, v_archived_at, v_part_type
  from public.cambridge_exam_assignments as assignment
  join public.cambridge_exam_parts as part on part.id = assignment.exam_part_id
  where assignment.id = p_assignment_id
    and part.exam_set_id = v_exam_set_id
  for update of assignment;
  if v_exam_part_id is null then
    raise exception using errcode = 'P0002', message = 'ASSIGNMENT_NOT_FOUND';
  end if;
  if v_archived_at is null then
    raise exception using errcode = '23514', message = 'ASSIGNMENT_NOT_ARCHIVED';
  end if;

  select required.resource_type
  into v_missing
  from unnest(
    case v_part_type
      when 'reading' then array['paper', 'key']
      when 'listening' then array['paper', 'audio', 'key']
      when 'writing' then array['paper', 'sample_writing']
      else array['paper']
    end
  ) as required(resource_type)
  where not exists (
    select 1 from public.cambridge_exam_part_resources as resource
    where resource.exam_part_id = v_exam_part_id
      and resource.resource_type = required.resource_type
  )
  limit 1;
  if v_missing is not null then
    raise exception using errcode = '23514',
      message = 'RESTORE_PART_INCOMPLETE:' || v_part_type || ':' || v_missing;
  end if;

  if exists (
    select 1 from public.cambridge_exam_assignments
    where exam_part_id = v_exam_part_id
      and course_type = v_course_type
      and archived_at is null
      and id <> p_assignment_id
  ) then
    raise exception using errcode = '23505', message = 'RESTORE_DUPLICATE';
  end if;

  begin
    update public.cambridge_exam_assignments
    set archived_at = null, active = false, updated_by = p_actor_id
    where id = p_assignment_id;
  exception
    when unique_violation then
      raise exception using errcode = '23505', message = 'RESTORE_DUPLICATE';
  end;
  return p_assignment_id;
end;
$$;

revoke all on function public.restore_cambridge_exam_assignment(uuid, uuid)
from public, anon, authenticated;
grant execute on function public.restore_cambridge_exam_assignment(uuid, uuid)
to service_role;

create or replace function public.list_cambridge_exam_assignments_admin(
  p_level text,
  p_course_type text,
  p_status text,
  p_scope text,
  p_offset integer,
  p_limit integer
)
returns jsonb
language sql
security definer
set search_path = public, pg_temp
as $$
  with filtered as materialized (
    select assignment.id, assignment.updated_at
    from public.cambridge_exam_assignments as assignment
    join public.cambridge_exam_parts as part on part.id = assignment.exam_part_id
    join public.cambridge_exam_sets as exam_set on exam_set.id = part.exam_set_id
    join public.levels as level on level.id = exam_set.level_id
    where (p_level is null or upper(btrim(level.name)) = p_level)
      and (p_course_type is null or assignment.course_type = p_course_type)
      and (
        p_scope = 'all'
        or (p_scope = 'current' and assignment.archived_at is null)
        or (p_scope = 'archived' and assignment.archived_at is not null)
      )
      and (
        p_status is null
        or (p_status = 'archived' and assignment.archived_at is not null)
        or (p_status = 'draft' and assignment.archived_at is null and assignment.active = false)
        or (p_status = 'scheduled' and assignment.archived_at is null
          and assignment.active = true
          and assignment.release_date > (now() at time zone 'UTC')::date)
        or (p_status = 'past' and assignment.archived_at is null
          and assignment.active = true
          and (assignment.release_date is null
            or assignment.release_date <= (now() at time zone 'UTC')::date)
          and assignment.due_date < (now() at time zone 'UTC')::date)
        or (p_status = 'active' and assignment.archived_at is null
          and assignment.active = true
          and (assignment.release_date is null
            or assignment.release_date <= (now() at time zone 'UTC')::date)
          and (assignment.due_date is null
            or assignment.due_date >= (now() at time zone 'UTC')::date))
      )
  ),
  page_rows as (
    select id, updated_at
    from filtered
    order by updated_at desc, id desc
    offset greatest(coalesce(p_offset, 0), 0)
    limit least(greatest(coalesce(p_limit, 50), 1), 100)
  )
  select jsonb_build_object(
    'ids',
    coalesce(
      (select jsonb_agg(id order by updated_at desc, id desc) from page_rows),
      '[]'::jsonb
    ),
    'total',
    (select count(*) from filtered)
  );
$$;

revoke all on function public.list_cambridge_exam_assignments_admin(
  text, text, text, text, integer, integer
) from public, anon, authenticated;
grant execute on function public.list_cambridge_exam_assignments_admin(
  text, text, text, text, integer, integer
) to service_role;

-- Preserve the Phase 1 signature while preventing assigned parts from becoming
-- incomplete before the function replaces their resource rows.
create or replace function public.save_cambridge_exam_bank_exam(
  p_exam_set_id uuid,
  p_level_id bigint,
  p_exam_number integer,
  p_title text,
  p_active boolean,
  p_parts jsonb,
  p_actor_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_exam_set_id uuid;
  v_level_name text;
  v_part_type text;
  v_part_id uuid;
  v_part_payload jsonb;
  v_resource record;
  v_required_resource text;
  v_expected_parts constant text[] :=
    array['reading', 'listening', 'writing', 'speaking'];
begin
  select upper(btrim(name)) into v_level_name
  from public.levels where id = p_level_id;
  if v_level_name is null or not (v_level_name = any(array['B1', 'B2', 'C1', 'C2'])) then
    raise exception using errcode = '22023', message = 'Invalid Cambridge Exam Bank level.';
  end if;
  if p_exam_number is null or p_exam_number <= 0 then
    raise exception using errcode = '22023', message = 'Invalid Cambridge exam number.';
  end if;
  if p_title is not null and (
    p_title <> btrim(p_title) or length(p_title) = 0 or length(p_title) > 120
  ) then
    raise exception using errcode = '22023', message = 'Invalid Cambridge exam title.';
  end if;
  if p_parts is null or jsonb_typeof(p_parts) <> 'object' or (
    select array_agg(key order by key) from jsonb_object_keys(p_parts) as key
  ) is distinct from array['listening', 'reading', 'speaking', 'writing'] then
    raise exception using errcode = '22023',
      message = 'Exactly four canonical Cambridge exam parts are required.';
  end if;

  if p_exam_set_id is null then
    insert into public.cambridge_exam_sets (
      level_id, exam_number, title, active, created_by, updated_by
    ) values (
      p_level_id, p_exam_number, p_title, coalesce(p_active, true),
      p_actor_id, p_actor_id
    ) returning id into v_exam_set_id;
  else
    -- This update obtains the authoritative exam-set row lock before any
    -- assignment-completeness check or resource replacement below.
    update public.cambridge_exam_sets set
      level_id = p_level_id,
      exam_number = p_exam_number,
      title = p_title,
      active = case when archived_at is null then coalesce(p_active, active) else false end,
      updated_by = p_actor_id
    where id = p_exam_set_id returning id into v_exam_set_id;
    if v_exam_set_id is null then
      raise exception using errcode = 'P0002',
        message = 'Cambridge Exam Bank entry not found.';
    end if;
  end if;

  foreach v_part_type in array v_expected_parts loop
    v_part_payload := p_parts -> v_part_type;
    if jsonb_typeof(v_part_payload) <> 'object' then
      raise exception using errcode = '22023',
        message = 'Each Cambridge exam part must be an object.';
    end if;

    insert into public.cambridge_exam_parts (exam_set_id, part_type)
    values (v_exam_set_id, v_part_type)
    on conflict (exam_set_id, part_type)
    do update set part_type = excluded.part_type
    returning id into v_part_id;

    if exists (
      select 1 from public.cambridge_exam_assignments
      where exam_part_id = v_part_id and archived_at is null
    ) then
      foreach v_required_resource in array (
        case v_part_type
          when 'reading' then array['paper', 'key']
          when 'listening' then array['paper', 'audio', 'key']
          when 'writing' then array['paper', 'sample_writing']
          else array['paper']
        end
      ) loop
        if not (v_part_payload ? v_required_resource)
          or nullif(btrim(v_part_payload ->> v_required_resource), '') is null
        then
          raise exception using errcode = '23514',
            message = 'ASSIGNED_PART_MUST_REMAIN_COMPLETE';
        end if;
      end loop;
    end if;

    delete from public.cambridge_exam_part_resources where exam_part_id = v_part_id;
    for v_resource in
      select key as resource_type, value #>> '{}' as external_url
      from jsonb_each(v_part_payload)
    loop
      if not (
        (v_part_type = 'reading' and v_resource.resource_type in ('paper', 'key'))
        or (v_part_type = 'listening' and v_resource.resource_type in ('paper', 'audio', 'key'))
        or (v_part_type = 'writing' and v_resource.resource_type in ('paper', 'sample_writing'))
        or (v_part_type = 'speaking' and v_resource.resource_type = 'paper')
      ) then
        raise exception using errcode = '23514',
          message = 'Invalid Cambridge exam part/resource combination.';
      end if;
      if v_resource.external_url is null
        or v_resource.external_url <> btrim(v_resource.external_url)
        or length(v_resource.external_url) > 2048
        or v_resource.external_url !~* '^https?://[^[:space:]]+$'
      then
        raise exception using errcode = '22023',
          message = 'Invalid Cambridge exam resource URL.';
      end if;
      insert into public.cambridge_exam_part_resources (
        exam_part_id, resource_type, external_url
      ) values (v_part_id, v_resource.resource_type, v_resource.external_url);
    end loop;
  end loop;

  update public.cambridge_exam_sets set updated_by = p_actor_id
  where id = v_exam_set_id;
  return v_exam_set_id;
end;
$$;

revoke all on function public.save_cambridge_exam_bank_exam(
  uuid, bigint, integer, text, boolean, jsonb, uuid
) from public, anon, authenticated;
grant execute on function public.save_cambridge_exam_bank_exam(
  uuid, bigint, integer, text, boolean, jsonb, uuid
) to service_role;
