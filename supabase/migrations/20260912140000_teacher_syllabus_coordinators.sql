begin;

set local search_path = pg_catalog, public, app_private, pg_temp;

create table public.syllabus_coordinators (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.profiles(id) on delete restrict,
  level_id bigint not null references public.levels(id) on delete restrict,
  assigned_by uuid not null references public.profiles(id) on delete restrict,
  assigned_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoke_reason text,
  constraint syllabus_coordinators_teacher_level_dates check (
    revoked_at is null or revoked_at >= assigned_at
  ),
  constraint syllabus_coordinators_revoke_reason_check check (
    revoked_at is null or nullif(btrim(revoke_reason), '') is not null
  )
);

create unique index syllabus_coordinators_one_active_level
  on public.syllabus_coordinators(level_id)
  where revoked_at is null;

create unique index syllabus_coordinators_one_active_teacher_level
  on public.syllabus_coordinators(teacher_id, level_id)
  where revoked_at is null;

create index syllabus_coordinators_teacher_history
  on public.syllabus_coordinators(teacher_id, assigned_at desc);

alter table public.syllabus_coordinators enable row level security;
revoke all on table public.syllabus_coordinators from public, anon, authenticated;
grant select on table public.syllabus_coordinators to authenticated, service_role;
create policy syllabus_coordinators_admin_read
  on public.syllabus_coordinators
  for select to authenticated
  using (app_private.is_admin());

create or replace function app_private.teacher_is_syllabus_coordinator(
  p_teacher_id uuid,
  p_level_id bigint
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, app_private, pg_temp
as $$
  select exists (
    select 1
    from public.syllabus_coordinators assignment
    where assignment.teacher_id = p_teacher_id
      and assignment.level_id = p_level_id
      and assignment.revoked_at is null
  );
$$;

alter function app_private.teacher_is_syllabus_coordinator(uuid, bigint) owner to postgres;
revoke all on function app_private.teacher_is_syllabus_coordinator(uuid, bigint) from public, anon, authenticated;
grant execute on function app_private.teacher_is_syllabus_coordinator(uuid, bigint) to service_role;

create or replace function public.set_teacher_syllabus_coordinators(
  p_actor_id uuid,
  p_teacher_id uuid,
  p_level_ids bigint[],
  p_replace_existing boolean default false
)
returns table(level_id bigint, teacher_id uuid, level_name text)
language plpgsql
security definer
set search_path = pg_catalog, public, app_private, pg_temp
as $$
declare
  v_level_id bigint;
  v_existing public.syllabus_coordinators;
begin
  if auth.role() <> 'service_role' and auth.uid() is distinct from p_actor_id then
    raise exception 'The acting user does not match the authenticated account.' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.profiles where id = p_actor_id and role = 'admin'
  ) then
    raise exception 'Only Admin users can assign syllabus coordinators.' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.profiles where id = p_teacher_id and role = 'teacher'
  ) then
    raise exception 'The selected profile is not a Teacher.' using errcode = '22023';
  end if;

  -- Lock each requested level before checking or replacing its coordinator.
  if coalesce(array_length(p_level_ids, 1), 0) > 0 then
    perform 1
    from public.levels
    where id = any(p_level_ids)
    order by id
    for update;
  end if;

  if exists (
    select 1
    from unnest(coalesce(p_level_ids, '{}'::bigint[])) requested(level_id)
    where not exists (
      select 1
      from public.levels level_row
      where level_row.id = requested.level_id
    )
    or not exists (
      select 1
      from public.classes classroom
      where classroom.level_id = requested.level_id
        and lower(trim(coalesce(classroom.course_type, ''))) in ('regular', 'online')
    )
  ) then
    raise exception 'Only levels with eligible Regular or Online classes can have a syllabus coordinator.' using errcode = '22023';
  end if;

  -- Lock active assignments in a stable order so concurrent Admin updates serialize.
  perform 1
  from public.syllabus_coordinators assignment
  where assignment.level_id = any(coalesce(p_level_ids, '{}'::bigint[]))
    and assignment.revoked_at is null
  order by assignment.level_id, assignment.id
  for update;

  foreach v_level_id in array coalesce(p_level_ids, '{}'::bigint[]) loop
    select * into v_existing
    from public.syllabus_coordinators assignment
    where assignment.level_id = v_level_id
      and assignment.revoked_at is null
    order by assignment.id
    limit 1
    for update;

    if v_existing.id is not null and v_existing.teacher_id <> p_teacher_id then
      if not p_replace_existing then
        raise exception 'This level already has a syllabus coordinator. Explicit replacement is required.' using errcode = '23505';
      end if;

      update public.syllabus_coordinators
      set revoked_at = now(), revoke_reason = 'Replaced by an Admin.'
      where id = v_existing.id;
    end if;

    if not exists (
      select 1
      from public.syllabus_coordinators assignment
      where assignment.teacher_id = p_teacher_id
        and assignment.level_id = v_level_id
        and assignment.revoked_at is null
    ) then
      insert into public.syllabus_coordinators(teacher_id, level_id, assigned_by)
      values (p_teacher_id, v_level_id, p_actor_id);
    end if;
  end loop;

  -- A teacher's selected levels are authoritative; retain all history when unassigning.
  update public.syllabus_coordinators assignment
  set revoked_at = now(), revoke_reason = 'Removed by an Admin.'
  where assignment.teacher_id = p_teacher_id
    and assignment.revoked_at is null
    and not (assignment.level_id = any(coalesce(p_level_ids, '{}'::bigint[])));

  return query
  select assignment.level_id, assignment.teacher_id, trim(level_row.name)
  from public.syllabus_coordinators assignment
  join public.levels level_row on level_row.id = assignment.level_id
  where assignment.teacher_id = p_teacher_id
    and assignment.revoked_at is null
  order by assignment.level_id;
end;
$$;

alter function public.set_teacher_syllabus_coordinators(uuid, uuid, bigint[], boolean) owner to postgres;
revoke all on function public.set_teacher_syllabus_coordinators(uuid, uuid, bigint[], boolean) from public, anon;
grant execute on function public.set_teacher_syllabus_coordinators(uuid, uuid, bigint[], boolean) to authenticated, service_role;

-- Keep the existing transactional reorder RPCs, while allowing a coordinator
-- to reorder only units/materials belonging to an assigned level.
create or replace function public.reorder_syllabus_units(
  p_actor_id uuid,
  p_syllabus_id uuid,
  p_unit_ids uuid[]
)
returns void language plpgsql security definer
set search_path = public, app_private, pg_temp
as $$
declare v_expected_count integer;
begin
  if not exists (select 1 from public.profiles where id = p_actor_id and role = 'admin')
    and not exists (
      select 1 from public.syllabuses s
      where s.id = p_syllabus_id
        and app_private.teacher_is_syllabus_coordinator(p_actor_id, s.level_id)
    ) then
    raise exception 'Syllabus coordinator access required.' using errcode = '42501';
  end if;
  if p_syllabus_id is null or p_unit_ids is null or cardinality(p_unit_ids) = 0 then
    raise exception 'A complete unit order is required.' using errcode = '22023';
  end if;
  perform 1 from public.syllabuses where id = p_syllabus_id for update;
  if not found then raise exception 'Syllabus was not found.' using errcode = 'P0002'; end if;
  select count(*) into v_expected_count from public.syllabus_units where syllabus_id = p_syllabus_id;
  if v_expected_count <> cardinality(p_unit_ids)
    or v_expected_count <> (select count(distinct requested.unit_id) from unnest(p_unit_ids) requested(unit_id))
    or exists (
      select 1 from unnest(p_unit_ids) requested(unit_id)
      left join public.syllabus_units unit_row on unit_row.id = requested.unit_id and unit_row.syllabus_id = p_syllabus_id
      where unit_row.id is null
    ) then
    raise exception 'The unit order must contain every unit exactly once.' using errcode = '22023';
  end if;
  update public.syllabus_units set sort_order = sort_order + 1000000 where syllabus_id = p_syllabus_id;
  update public.syllabus_units unit_row
  set sort_order = requested.ordinality::integer
  from unnest(p_unit_ids) with ordinality requested(unit_id, ordinality)
  where unit_row.id = requested.unit_id and unit_row.syllabus_id = p_syllabus_id;
  update public.syllabuses set updated_by = p_actor_id where id = p_syllabus_id;
end;
$$;

create or replace function public.reorder_syllabus_materials(
  p_actor_id uuid,
  p_syllabus_id uuid,
  p_unit_id uuid,
  p_material_ids uuid[]
)
returns void language plpgsql security definer
set search_path = public, app_private, pg_temp
as $$
declare v_expected_count integer;
begin
  if not exists (select 1 from public.profiles where id = p_actor_id and role = 'admin')
    and not exists (
      select 1 from public.syllabuses s
      join public.syllabus_units u on u.syllabus_id = s.id
      where s.id = p_syllabus_id and u.id = p_unit_id
        and app_private.teacher_is_syllabus_coordinator(p_actor_id, s.level_id)
    ) then
    raise exception 'Syllabus coordinator access required.' using errcode = '42501';
  end if;
  if p_unit_id is null or p_material_ids is null or cardinality(p_material_ids) = 0 then
    raise exception 'A complete material order is required.' using errcode = '22023';
  end if;
  perform 1 from public.syllabus_units where id = p_unit_id and syllabus_id = p_syllabus_id for update;
  if not found then raise exception 'Syllabus unit was not found.' using errcode = 'P0002'; end if;
  select count(*) into v_expected_count from public.syllabus_unit_materials where unit_id = p_unit_id;
  if v_expected_count <> cardinality(p_material_ids)
    or v_expected_count <> (select count(distinct requested.material_id) from unnest(p_material_ids) requested(material_id))
    or exists (
      select 1 from unnest(p_material_ids) requested(material_id)
      left join public.syllabus_unit_materials material on material.id = requested.material_id and material.unit_id = p_unit_id
      where material.id is null
    ) then
    raise exception 'The material order must contain every material exactly once.' using errcode = '22023';
  end if;
  update public.syllabus_unit_materials set sort_order = sort_order + 1000000 where unit_id = p_unit_id;
  update public.syllabus_unit_materials material
  set sort_order = requested.ordinality::integer
  from unnest(p_material_ids) with ordinality requested(material_id, ordinality)
  where material.id = requested.material_id and material.unit_id = p_unit_id;
  update public.syllabuses set updated_by = p_actor_id where id = p_syllabus_id;
end;
$$;

alter function public.reorder_syllabus_units(uuid, uuid, uuid[]) owner to postgres;
alter function public.reorder_syllabus_materials(uuid, uuid, uuid, uuid[]) owner to postgres;
revoke all on function public.reorder_syllabus_units(uuid, uuid, uuid[]) from public, anon, authenticated;
revoke all on function public.reorder_syllabus_materials(uuid, uuid, uuid, uuid[]) from public, anon, authenticated;
grant execute on function public.reorder_syllabus_units(uuid, uuid, uuid[]) to service_role;
grant execute on function public.reorder_syllabus_materials(uuid, uuid, uuid, uuid[]) to service_role;

commit;
