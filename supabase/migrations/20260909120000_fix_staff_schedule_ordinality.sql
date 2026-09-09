-- Forward-only replacement; existing ownership and ACLs are retained by CREATE OR REPLACE.
-- ROWS FROM keeps record conversion/validation while legally attaching ordinality.
begin;

create or replace function public.save_staff_work_schedule(
  p_actor_id uuid,
  p_teacher_id uuid,
  p_effective_from date,
  p_label text,
  p_intervals jsonb
)
returns public.staff_work_schedules
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_current public.staff_work_schedules;
  v_result public.staff_work_schedules;
  v_interval record;
begin
  perform app_private.staff_time_require_admin(p_actor_id);
  if exists (
    select 1 from public.profiles profile
    where profile.id = p_teacher_id and profile.role = 'admin'
  ) then
    perform pg_advisory_xact_lock(hashtextextended(p_teacher_id::text, 0));
  end if;
  if not coalesce(
    app_private.staff_time_is_participant(p_teacher_id, p_effective_from),
    false
  ) then
    raise exception 'The selected Staff Time participant was not found or is not enrolled on the effective date.'
      using errcode = '22023';
  end if;
  if p_effective_from is null then
    raise exception 'An effective date is required.' using errcode = '22023';
  end if;
  if p_intervals is null or jsonb_typeof(p_intervals) <> 'array'
    or jsonb_array_length(p_intervals) > 35
  then
    raise exception 'Schedule intervals must be an array with at most 35 entries.'
      using errcode = '22023';
  end if;

  if exists (
    with items as (
      select ordinality, weekday, start_time, end_time
      from rows from (
        jsonb_to_recordset(p_intervals) as (weekday smallint, start_time time, end_time time)
      ) with ordinality as item(weekday, start_time, end_time, ordinality)
    )
    select 1 from items first
    join items second
      on second.ordinality > first.ordinality
      and second.weekday = first.weekday
      and first.start_time < second.end_time
      and second.start_time < first.end_time
  ) then
    raise exception 'Planned work intervals on the same day cannot overlap.'
      using errcode = '23P01';
  end if;

  select * into v_current
  from public.staff_work_schedules
  where teacher_id = p_teacher_id and effective_to is null
  for update;
  if v_current.id is not null then
    if p_effective_from <= v_current.effective_from then
      raise exception 'The new schedule must start after the current schedule.'
        using errcode = '22023';
    end if;
    update public.staff_work_schedules
      set effective_to = p_effective_from - 1
      where id = v_current.id;
  end if;

  insert into public.staff_work_schedules (
    teacher_id, effective_from, label, created_by
  ) values (
    p_teacher_id, p_effective_from, nullif(btrim(p_label), ''), p_actor_id
  ) returning * into v_result;

  for v_interval in
    select weekday, start_time, end_time
    from rows from (
      jsonb_to_recordset(p_intervals) as (weekday smallint, start_time time, end_time time)
    ) with ordinality as item(weekday, start_time, end_time, ordinality)
    order by weekday, start_time, ordinality
  loop
    insert into public.staff_work_schedule_intervals (
      schedule_id, weekday, start_time, end_time
    ) values (
      v_result.id, v_interval.weekday, v_interval.start_time, v_interval.end_time
    );
  end loop;
  return v_result;
end;
$$;

commit;
