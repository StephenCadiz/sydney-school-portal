begin;

create table if not exists public.class_register_entry_audit (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid
    references public.class_register_entries(id) on delete set null,
  register_id uuid
    references public.class_registers(id) on delete set null,
  original_status text,
  new_status text,
  teacher_id uuid not null
    references public.profiles(id) on delete restrict,
  changed_at timestamptz not null default now(),
  constraint class_register_entry_audit_original_status_check
    check (original_status is null or original_status in ('present', 'absent')),
  constraint class_register_entry_audit_new_status_check
    check (new_status is null or new_status in ('present', 'absent')),
  constraint class_register_entry_audit_status_change_check
    check (original_status is distinct from new_status)
);

create index if not exists class_register_entry_audit_entry_idx
  on public.class_register_entry_audit (entry_id, changed_at desc);

create index if not exists class_register_entry_audit_register_idx
  on public.class_register_entry_audit (register_id, changed_at desc);

alter table public.class_register_entry_audit enable row level security;
revoke all on public.class_register_entry_audit from public, anon, authenticated;
grant all on public.class_register_entry_audit to service_role;

create or replace function public.edit_class_register_attendance(
  p_actor_id uuid,
  p_register_id uuid,
  p_entries jsonb,
  p_complete boolean
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_register public.class_registers%rowtype;
  v_now timestamptz := now();
  v_today date := (now() at time zone 'Europe/Madrid')::date;
  v_time time := (now() at time zone 'Europe/Madrid')::time;
  v_entry_count integer;
  v_payload_count integer;
begin
  if not coalesce(p_complete, false) then
    raise exception 'Completed Class Registers must remain complete';
  end if;

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

  if v_register.completed_at is null then
    raise exception 'Class Register must be completed before it can be edited';
  end if;

  if v_register.lesson_date <> v_today
    or v_time < v_register.scheduled_start_time
    or v_time >= v_register.scheduled_end_time then
    raise exception 'Completed Class Registers may only be edited during the scheduled class session';
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

  select count(*) into v_entry_count
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

  select count(*) into v_entry_count
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
    where submitted.attendance_status is null
      or submitted.attendance_status not in ('present', 'absent')
  ) then
    raise exception 'Attendance must be Present or Absent';
  end if;

  insert into public.class_register_entry_audit (
    entry_id,
    register_id,
    original_status,
    new_status,
    teacher_id,
    changed_at
  )
  select
    entry.id,
    v_register.id,
    entry.attendance_status,
    submitted.attendance_status,
    p_actor_id,
    v_now
  from public.class_register_entries entry
  join jsonb_to_recordset(p_entries) as submitted(
    entry_id uuid,
    attendance_status text
  ) on submitted.entry_id = entry.id
  where entry.register_id = v_register.id
    and entry.attendance_status is distinct from submitted.attendance_status;

  update public.class_register_entries entry
  set
    attendance_status = submitted.attendance_status,
    marked_at = v_now,
    marked_by = p_actor_id
  from jsonb_to_recordset(p_entries) as submitted(
    entry_id uuid,
    attendance_status text
  )
  where entry.id = submitted.entry_id
    and entry.register_id = v_register.id
    and entry.attendance_status is distinct from submitted.attendance_status;

  update public.class_registers
  set updated_at = v_now
  where id = v_register.id;

  return v_register.id;
end;
$$;

alter function public.edit_class_register_attendance(uuid, uuid, jsonb, boolean)
  owner to postgres;

revoke all on function public.edit_class_register_attendance(uuid, uuid, jsonb, boolean)
  from public, anon, authenticated;
grant execute on function public.edit_class_register_attendance(uuid, uuid, jsonb, boolean)
  to service_role;

commit;
