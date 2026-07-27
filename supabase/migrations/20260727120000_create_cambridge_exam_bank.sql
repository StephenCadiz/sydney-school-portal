-- Reusable Cambridge Exam Bank master records.
-- Phase 1 is Admin/API only: no Teacher, Student, or assignment access.

create table public.cambridge_exam_sets (
  id uuid primary key default gen_random_uuid(),
  level_id bigint not null references public.levels(id) on delete restrict,
  exam_number integer not null,
  title text,
  active boolean not null default true,
  archived_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cambridge_exam_sets_exam_number_check
    check (exam_number > 0),
  constraint cambridge_exam_sets_title_check
    check (
      title is null
      or (
        title = btrim(title)
        and length(title) between 1 and 120
      )
    ),
  constraint cambridge_exam_sets_archive_check
    check (archived_at is null or active = false),
  constraint cambridge_exam_sets_level_exam_unique
    unique (level_id, exam_number)
);

create table public.cambridge_exam_parts (
  id uuid primary key default gen_random_uuid(),
  exam_set_id uuid not null
    references public.cambridge_exam_sets(id) on delete cascade,
  part_type text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cambridge_exam_parts_type_check
    check (part_type in ('reading', 'listening', 'writing', 'speaking')),
  constraint cambridge_exam_parts_set_type_unique
    unique (exam_set_id, part_type)
);

create table public.cambridge_exam_part_resources (
  id uuid primary key default gen_random_uuid(),
  exam_part_id uuid not null
    references public.cambridge_exam_parts(id) on delete cascade,
  resource_type text not null,
  external_url text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cambridge_exam_part_resources_type_check
    check (resource_type in ('paper', 'key', 'audio', 'sample_writing')),
  constraint cambridge_exam_part_resources_url_check
    check (
      external_url = btrim(external_url)
      and length(external_url) between 1 and 2048
      and external_url ~* '^https?://[^[:space:]]+$'
    ),
  constraint cambridge_exam_part_resources_part_type_unique
    unique (exam_part_id, resource_type)
);

create index cambridge_exam_sets_level_number_idx
on public.cambridge_exam_sets (level_id, exam_number);

create index cambridge_exam_sets_archived_idx
on public.cambridge_exam_sets (archived_at)
where archived_at is not null;

create index cambridge_exam_parts_exam_set_idx
on public.cambridge_exam_parts (exam_set_id);

create index cambridge_exam_part_resources_part_type_idx
on public.cambridge_exam_part_resources (exam_part_id, resource_type);

create or replace function public.set_cambridge_exam_bank_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger cambridge_exam_sets_set_updated_at
before update on public.cambridge_exam_sets
for each row execute function public.set_cambridge_exam_bank_updated_at();

create trigger cambridge_exam_parts_set_updated_at
before update on public.cambridge_exam_parts
for each row execute function public.set_cambridge_exam_bank_updated_at();

create trigger cambridge_exam_resources_set_updated_at
before update on public.cambridge_exam_part_resources
for each row execute function public.set_cambridge_exam_bank_updated_at();

create or replace function public.validate_cambridge_exam_resource_combination()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_part_type text;
begin
  select part_type
  into v_part_type
  from public.cambridge_exam_parts
  where id = new.exam_part_id;

  if v_part_type is null then
    raise exception using
      errcode = '23503',
      message = 'Exam part was not found.';
  end if;

  if not (
    (v_part_type = 'reading' and new.resource_type in ('paper', 'key'))
    or
    (v_part_type = 'listening' and new.resource_type in ('paper', 'audio', 'key'))
    or
    (v_part_type = 'writing' and new.resource_type in ('paper', 'sample_writing'))
    or
    (v_part_type = 'speaking' and new.resource_type = 'paper')
  ) then
    raise exception using
      errcode = '23514',
      message = 'Invalid Cambridge exam part/resource combination.';
  end if;

  return new;
end;
$$;

create trigger cambridge_exam_resources_validate_combination
before insert or update on public.cambridge_exam_part_resources
for each row execute function public.validate_cambridge_exam_resource_combination();

create or replace function public.validate_cambridge_exam_part_type_change()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if exists (
    select 1
    from public.cambridge_exam_part_resources as resource
    where resource.exam_part_id = new.id
      and not (
        (new.part_type = 'reading' and resource.resource_type in ('paper', 'key'))
        or
        (new.part_type = 'listening' and resource.resource_type in ('paper', 'audio', 'key'))
        or
        (new.part_type = 'writing' and resource.resource_type in ('paper', 'sample_writing'))
        or
        (new.part_type = 'speaking' and resource.resource_type = 'paper')
      )
  ) then
    raise exception using
      errcode = '23514',
      message = 'Existing resources are invalid for the new Cambridge exam part type.';
  end if;

  return new;
end;
$$;

create trigger cambridge_exam_parts_validate_type_change
before update of part_type on public.cambridge_exam_parts
for each row execute function public.validate_cambridge_exam_part_type_change();

alter table public.cambridge_exam_sets enable row level security;
alter table public.cambridge_exam_parts enable row level security;
alter table public.cambridge_exam_part_resources enable row level security;

revoke all on table public.cambridge_exam_sets from anon, authenticated;
revoke all on table public.cambridge_exam_parts from anon, authenticated;
revoke all on table public.cambridge_exam_part_resources from anon, authenticated;

grant select, insert, update, delete
on table public.cambridge_exam_sets to service_role;
grant select, insert, update, delete
on table public.cambridge_exam_parts to service_role;
grant select, insert, update, delete
on table public.cambridge_exam_part_resources to service_role;

-- Structural writes must use save_cambridge_exam_bank_exam so every normal save
-- recreates all four canonical parts. Raw service-role part deletion remains a
-- trusted service-boundary operation in Phase 1.
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
  v_expected_parts constant text[] :=
    array['reading', 'listening', 'writing', 'speaking'];
begin
  select upper(btrim(name))
  into v_level_name
  from public.levels
  where id = p_level_id;

  if v_level_name is null or not (v_level_name = any(array['B1', 'B2', 'C1', 'C2'])) then
    raise exception using
      errcode = '22023',
      message = 'Invalid Cambridge Exam Bank level.';
  end if;

  if p_exam_number is null or p_exam_number <= 0 then
    raise exception using
      errcode = '22023',
      message = 'Invalid Cambridge exam number.';
  end if;

  if p_title is not null and (
    p_title <> btrim(p_title)
    or length(p_title) = 0
    or length(p_title) > 120
  ) then
    raise exception using
      errcode = '22023',
      message = 'Invalid Cambridge exam title.';
  end if;

  if p_parts is null
    or jsonb_typeof(p_parts) <> 'object'
    or (
      select array_agg(key order by key)
      from jsonb_object_keys(p_parts) as key
    ) is distinct from array['listening', 'reading', 'speaking', 'writing']
  then
    raise exception using
      errcode = '22023',
      message = 'Exactly four canonical Cambridge exam parts are required.';
  end if;

  if p_exam_set_id is null then
    insert into public.cambridge_exam_sets (
      level_id,
      exam_number,
      title,
      active,
      created_by,
      updated_by
    )
    values (
      p_level_id,
      p_exam_number,
      p_title,
      coalesce(p_active, true),
      p_actor_id,
      p_actor_id
    )
    returning id into v_exam_set_id;
  else
    update public.cambridge_exam_sets
    set
      level_id = p_level_id,
      exam_number = p_exam_number,
      title = p_title,
      active = case when archived_at is null then coalesce(p_active, active) else false end,
      updated_by = p_actor_id
    where id = p_exam_set_id
    returning id into v_exam_set_id;

    if v_exam_set_id is null then
      raise exception using
        errcode = 'P0002',
        message = 'Cambridge Exam Bank entry not found.';
    end if;
  end if;

  foreach v_part_type in array v_expected_parts loop
    v_part_payload := p_parts -> v_part_type;

    if jsonb_typeof(v_part_payload) <> 'object' then
      raise exception using
        errcode = '22023',
        message = 'Each Cambridge exam part must be an object.';
    end if;

    insert into public.cambridge_exam_parts (exam_set_id, part_type)
    values (v_exam_set_id, v_part_type)
    on conflict (exam_set_id, part_type)
    do update set part_type = excluded.part_type
    returning id into v_part_id;

    delete from public.cambridge_exam_part_resources
    where exam_part_id = v_part_id;

    for v_resource in
      select key as resource_type, value #>> '{}' as external_url
      from jsonb_each(v_part_payload)
    loop
      if not (
        (v_part_type = 'reading' and v_resource.resource_type in ('paper', 'key'))
        or
        (v_part_type = 'listening' and v_resource.resource_type in ('paper', 'audio', 'key'))
        or
        (v_part_type = 'writing' and v_resource.resource_type in ('paper', 'sample_writing'))
        or
        (v_part_type = 'speaking' and v_resource.resource_type = 'paper')
      ) then
        raise exception using
          errcode = '23514',
          message = 'Invalid Cambridge exam part/resource combination.';
      end if;

      if v_resource.external_url is null
        or v_resource.external_url <> btrim(v_resource.external_url)
        or length(v_resource.external_url) > 2048
        or v_resource.external_url !~* '^https?://[^[:space:]]+$'
      then
        raise exception using
          errcode = '22023',
          message = 'Invalid Cambridge exam resource URL.';
      end if;

      insert into public.cambridge_exam_part_resources (
        exam_part_id,
        resource_type,
        external_url
      )
      values (
        v_part_id,
        v_resource.resource_type,
        v_resource.external_url
      );
    end loop;
  end loop;

  update public.cambridge_exam_sets
  set updated_by = p_actor_id
  where id = v_exam_set_id;

  return v_exam_set_id;
end;
$$;

revoke all on function public.save_cambridge_exam_bank_exam(
  uuid, bigint, integer, text, boolean, jsonb, uuid
) from public;
revoke all on function public.save_cambridge_exam_bank_exam(
  uuid, bigint, integer, text, boolean, jsonb, uuid
) from anon;
revoke all on function public.save_cambridge_exam_bank_exam(
  uuid, bigint, integer, text, boolean, jsonb, uuid
) from authenticated;
grant execute on function public.save_cambridge_exam_bank_exam(
  uuid, bigint, integer, text, boolean, jsonb, uuid
) to service_role;

revoke all on function public.set_cambridge_exam_bank_updated_at()
from public, anon, authenticated, service_role;
revoke all on function public.validate_cambridge_exam_resource_combination()
from public, anon, authenticated, service_role;
revoke all on function public.validate_cambridge_exam_part_type_change()
from public, anon, authenticated, service_role;
