create or replace function public.delete_orphan_teacher_with_dependencies(
  p_actor_id uuid,
  p_teacher_id uuid,
  p_message_id uuid,
  p_friday_duty_id uuid
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_dependency record;
  v_count integer;
  v_message_id uuid;
  v_duty_id uuid;
  v_duty_teacher_id uuid;
begin
  if not exists (
    select 1
    from public.profiles
    where id = p_actor_id
      and role = 'admin'
  ) then
    raise exception 'Only admins can delete teachers.' using errcode = '42501';
  end if;

  if p_actor_id = p_teacher_id then
    raise exception 'You cannot delete your own account.' using errcode = '42501';
  end if;

  perform 1
  from public.profiles
  where id = p_teacher_id
    and role = 'teacher'
  for update;

  if not found then
    raise exception 'Teacher profile not found.' using errcode = 'P0002';
  end if;

  for v_dependency in
    select *
    from (values
      ('classes', 'teacher_id'),
      ('classrooms', 'teacher_id'),
      ('results', 'teacher_id'),
      ('follow_up_entries', 'teacher_id'),
      ('unit_exam_results', 'teacher_id'),
      ('teacher_notes', 'teacher_id'),
      ('teacher_calendar_events', 'teacher_id'),
      ('friday_tutorial_students', 'teacher_id'),
      ('class_progress_entries', 'teacher_id'),
      ('young_learner_class_point_entries', 'teacher_id'),
      ('follow_up_documents', 'teacher_id'),
      ('staff_time_employment_records', 'teacher_id'),
      ('staff_work_schedules', 'teacher_id'),
      ('staff_remote_work_authorisations', 'teacher_id'),
      ('staff_clock_sessions', 'teacher_id'),
      ('staff_clock_events', 'teacher_id'),
      ('staff_clock_attempts', 'teacher_id'),
      ('staff_time_corrections', 'teacher_id'),
      ('staff_time_incidences', 'teacher_id'),
      ('staff_time_admin_enrollment_events', 'admin_id'),
      ('admin_staff_permissions', 'admin_id')
    ) as dependency(table_name, column_name)
  loop
    execute format(
      'select count(*) from public.%I where %I = $1',
      v_dependency.table_name,
      v_dependency.column_name
    )
    into v_count
    using p_teacher_id;

    if v_count > 0 then
      raise exception 'Teacher has dependent records in %.', v_dependency.table_name
        using errcode = '23514';
    end if;
  end loop;

  select id
  into v_message_id
  from public.messages
  where id = p_message_id
    and sender_id = p_teacher_id
  for update;

  if v_message_id is null
     or (select count(*) from public.messages where sender_id = p_teacher_id or receiver_id = p_teacher_id) <> 1
     or exists (select 1 from public.messages where receiver_id = p_teacher_id) then
    raise exception 'Unexpected teacher message dependencies.' using errcode = '23514';
  end if;

  select id, teacher_id
  into v_duty_id, v_duty_teacher_id
  from public.friday_at_6_duties
  where id = p_friday_duty_id
    and (teacher_id = p_teacher_id or teacher_id is null)
  for update;

  if v_duty_id is null
     or (v_duty_teacher_id is not null and
         (select count(*) from public.friday_at_6_duties where teacher_id = p_teacher_id) <> 1)
     or (v_duty_teacher_id is null and
         (select count(*) from public.friday_at_6_duties where teacher_id = p_teacher_id) <> 0)
     or exists (select 1 from public.friday_at_6_duties where b1_teacher_id = p_teacher_id)
     or exists (
       select 1
       from public.friday_at_6_duties
       where id = p_friday_duty_id
         and b1_teacher_id is null
     ) then
    raise exception 'Unexpected Friday duty dependencies.' using errcode = '23514';
  end if;

  delete from public.messages
  where id = v_message_id
    and sender_id = p_teacher_id;

  get diagnostics v_count = row_count;
  if v_count <> 1 then
    raise exception 'Teacher message cleanup could not be confirmed.' using errcode = '23514';
  end if;

  if v_duty_teacher_id is not null then
    update public.friday_at_6_duties
    set teacher_id = null
    where id = v_duty_id
      and teacher_id = p_teacher_id;

    get diagnostics v_count = row_count;
    if v_count <> 1 then
      raise exception 'Friday duty cleanup could not be confirmed.' using errcode = '23514';
    end if;
  end if;

  delete from public.profiles
  where id = p_teacher_id
    and role = 'teacher';

  get diagnostics v_count = row_count;
  if v_count <> 1 then
    raise exception 'Teacher profile deletion could not be confirmed.' using errcode = '23514';
  end if;
end;
$$;

revoke all on function public.delete_orphan_teacher_with_dependencies(uuid, uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.delete_orphan_teacher_with_dependencies(uuid, uuid, uuid, uuid)
  to service_role;
