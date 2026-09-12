begin;

set local search_path = pg_catalog, public, app_private, pg_temp;

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

  -- Coordinator eligibility comes from the syllabus level catalogue, not classes
  -- taught by the target teacher (or whether any class currently exists).
  if exists (
    select 1
    from unnest(coalesce(p_level_ids, '{}'::bigint[])) requested(level_id)
    left join public.levels level_row on level_row.id = requested.level_id
    where level_row.id is null
      or lower(trim(coalesce(level_row.name, ''))) ~ '(intensive|express)'
  ) then
    raise exception 'Only syllabus-supported levels can have a syllabus coordinator. Intensive and Express levels are not eligible.' using errcode = '22023';
  end if;

  -- Lock each requested level before checking or replacing its coordinator.
  if coalesce(array_length(p_level_ids, 1), 0) > 0 then
    perform 1
    from public.levels
    where id = any(p_level_ids)
    order by id
    for update;
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

commit;
