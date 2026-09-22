-- Preserve approved correction history while allowing a narrowly scoped,
-- auditable supersession of an accidental duplicate correction.
alter table public.staff_time_corrections
  add column if not exists superseded_at timestamptz,
  add column if not exists superseded_by uuid references public.profiles(id) on delete restrict,
  add column if not exists superseded_reason text;

alter table public.staff_time_corrections
  drop constraint if exists staff_time_correction_superseded_state_check;

alter table public.staff_time_corrections
  add constraint staff_time_correction_superseded_state_check check (
    (superseded_at is null and superseded_by is null and superseded_reason is null)
    or (
      status = 'approved'
      and superseded_at is not null
      and superseded_by is not null
      and nullif(btrim(superseded_reason), '') is not null
    )
  );

create index if not exists staff_time_corrections_active_idx
  on public.staff_time_corrections (teacher_id, work_date, session_id)
  where status = 'approved' and superseded_at is null;

create or replace function app_private.staff_time_protect_correction()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Staff Time correction history cannot be deleted.' using errcode = '55000';
  end if;

  if old.status = 'approved'
    and old.superseded_at is null
    and new.status = 'approved'
    and new.superseded_at is not null
    and new.superseded_by is not null
    and nullif(btrim(new.superseded_reason), '') is not null
    and (to_jsonb(new) - array['superseded_at', 'superseded_by', 'superseded_reason'])
      is not distinct from
      (to_jsonb(old) - array['superseded_at', 'superseded_by', 'superseded_reason'])
  then
    return new;
  end if;

  if old.status <> 'pending'
    or new.status not in ('approved', 'rejected')
    or new.reviewed_by is null
    or new.reviewed_at is null
    or (to_jsonb(new) - array['status', 'reviewed_by', 'reviewed_at', 'review_note'])
      is distinct from
      (to_jsonb(old) - array['status', 'reviewed_by', 'reviewed_at', 'review_note'])
  then
    raise exception 'Corrections retain their request and may only receive one review decision.'
      using errcode = '55000';
  end if;
  return new;
end;
$$;

create or replace function public.staff_admin_create_time_correction(
  p_actor_id uuid,
  p_teacher_id uuid,
  p_work_date date,
  p_session_id uuid,
  p_requested_sign_in_at timestamptz,
  p_requested_sign_out_at timestamptz,
  p_reason text
)
returns public.staff_time_corrections
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_session public.staff_clock_sessions;
  v_sign_in_id uuid;
  v_sign_out_id uuid;
  v_result public.staff_time_corrections;
begin
  perform app_private.staff_time_require_admin(p_actor_id);
  if p_actor_id = p_teacher_id then
    raise exception 'A tracked Admin cannot create a manual correction for their own record.'
      using errcode = '42501';
  end if;
  if not coalesce(
    app_private.staff_time_is_participant(p_teacher_id, p_work_date),
    false
  ) then
    raise exception 'The selected staff member was not enrolled in Staff Time on this date.'
      using errcode = '22023';
  end if;
  if p_work_date is null or (p_requested_sign_in_at is null and p_requested_sign_out_at is null) then
    raise exception 'Choose the work date and at least one corrected time.' using errcode = '22023';
  end if;
  if p_requested_sign_in_at is not null
    and (p_requested_sign_in_at at time zone 'Europe/Madrid')::date <> p_work_date
  then
    raise exception 'The corrected sign-in time must be on the selected Madrid work date.'
      using errcode = '22023';
  end if;
  if p_requested_sign_out_at is not null
    and (p_requested_sign_out_at at time zone 'Europe/Madrid')::date <> p_work_date
  then
    raise exception 'The corrected sign-out time must be on the selected Madrid work date.'
      using errcode = '22023';
  end if;
  if p_session_id is null and exists (
    select 1 from public.staff_clock_sessions session
    where session.teacher_id = p_teacher_id and session.work_date = p_work_date
  ) then
    raise exception 'Select the existing clock session for this Teacher and work date.'
      using errcode = '22023';
  end if;
  if p_session_id is not null then
    select * into v_session from public.staff_clock_sessions
    where id = p_session_id and teacher_id = p_teacher_id and work_date = p_work_date;
    if v_session.id is null then
      raise exception 'The selected session does not match this staff member and work date.'
        using errcode = '22023';
    end if;
    select id into v_sign_in_id from public.staff_clock_events
      where session_id = p_session_id and event_type = 'sign_in';
    select id into v_sign_out_id from public.staff_clock_events
      where session_id = p_session_id and event_type = 'sign_out';
  end if;

  insert into public.staff_time_corrections (
    teacher_id, work_date, session_id, original_sign_in_event_id,
    original_sign_out_event_id, requested_sign_in_at, requested_sign_out_at,
    request_type, reason, submission_source, submitted_by,
    status, reviewed_by, reviewed_at, review_note
  ) values (
    p_teacher_id, p_work_date, p_session_id, v_sign_in_id, v_sign_out_id,
    p_requested_sign_in_at, p_requested_sign_out_at,
    'admin_manual_resolution', btrim(p_reason), 'admin_manual', p_actor_id,
    'approved', p_actor_id, now(), 'Approved manual incidence resolution.'
  ) returning * into v_result;

  update public.staff_time_incidences
  set status = 'resolved', resolved_by = p_actor_id, resolved_at = now(),
      correction_id = v_result.id,
      resolution_note = 'Resolved through an approved audited correction.'
  where teacher_id = p_teacher_id and work_date = p_work_date
    and status = 'open'
    and incidence_type in ('missing_sign_in', 'missing_sign_out');
  return v_result;
end;
$$;

create or replace function public.repair_staff_time_duplicate_correction(
  p_actor_id uuid,
  p_teacher_id uuid,
  p_work_date date,
  p_session_id uuid,
  p_superseded_correction_id uuid
)
returns public.staff_time_corrections
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_expected_teacher constant uuid := '4dc8e050-349e-4354-a25c-aed1c804a0f7';
  v_expected_session constant uuid := 'e873a73b-0937-4573-8f5f-745c57df8264';
  v_expected_correction constant uuid := '00772f87-e46a-4aec-bdeb-84b6d0098258';
  v_session public.staff_clock_sessions;
  v_old public.staff_time_corrections;
  v_result public.staff_time_corrections;
  v_sign_in_id uuid;
  v_sign_out_id uuid;
  v_sign_in timestamptz := timestamp '2026-09-15 16:44:00' at time zone 'Europe/Madrid';
  v_sign_out timestamptz := timestamp '2026-09-15 21:11:00' at time zone 'Europe/Madrid';
begin
  perform app_private.staff_time_require_admin(p_actor_id);
  if p_teacher_id <> v_expected_teacher
    or p_work_date <> date '2026-09-15'
    or p_session_id <> v_expected_session
    or p_superseded_correction_id <> v_expected_correction
  then
    raise exception 'This repair RPC is restricted to its approved Staff Time record.'
      using errcode = '42501';
  end if;

  select * into v_session from public.staff_clock_sessions
  where id = v_expected_session and teacher_id = v_expected_teacher
    and work_date = date '2026-09-15'
  for update;
  if v_session.id is null then
    raise exception 'The approved Staff Time session was not found.' using errcode = '22023';
  end if;

  select * into v_old from public.staff_time_corrections
  where id = v_expected_correction and teacher_id = v_expected_teacher
    and work_date = date '2026-09-15' and session_id is null
  for update;
  if v_old.id is null then
    select * into v_result from public.staff_time_corrections
    where teacher_id = v_expected_teacher and work_date = date '2026-09-15'
      and session_id = v_expected_session and status = 'approved'
      and superseded_at is null
    order by submitted_at desc, id desc limit 1;
    if v_result.id is not null then return v_result; end if;
    raise exception 'The approved duplicate correction was not found.' using errcode = '22023';
  end if;
  if v_old.status <> 'approved' then
    raise exception 'The target correction is not approved.' using errcode = '22023';
  end if;
  if v_old.superseded_at is not null then
    select * into v_result from public.staff_time_corrections
    where teacher_id = v_expected_teacher and work_date = date '2026-09-15'
      and session_id = v_expected_session and status = 'approved'
      and superseded_at is null
    order by submitted_at desc, id desc limit 1;
    if v_result.id is null then
      raise exception 'The target correction is superseded but its linked replacement is missing.'
        using errcode = '55000';
    end if;
    return v_result;
  end if;

  select id into v_sign_in_id from public.staff_clock_events
    where session_id = v_expected_session and event_type = 'sign_in';
  select id into v_sign_out_id from public.staff_clock_events
    where session_id = v_expected_session and event_type = 'sign_out';

  select * into v_result from public.staff_time_corrections
  where teacher_id = v_expected_teacher and work_date = date '2026-09-15'
    and session_id = v_expected_session and status = 'approved'
    and superseded_at is null
  order by submitted_at desc, id desc limit 1
  for update;

  if v_result.id is null then
    insert into public.staff_time_corrections (
      teacher_id, work_date, session_id, original_sign_in_event_id,
      original_sign_out_event_id, requested_sign_in_at, requested_sign_out_at,
      request_type, reason, submission_source, submitted_by,
      status, reviewed_by, reviewed_at, review_note
    ) values (
      v_expected_teacher, date '2026-09-15', v_expected_session, v_sign_in_id, v_sign_out_id,
      v_sign_in, v_sign_out, 'admin_manual_resolution',
      'Scoped repair of the duplicate unlinked correction.', 'admin_manual', p_actor_id,
      'approved', p_actor_id, now(), 'Approved targeted Staff Time repair.'
    ) returning * into v_result;
  end if;

  update public.staff_time_corrections
  set superseded_at = coalesce(superseded_at, now()),
      superseded_by = coalesce(superseded_by, p_actor_id),
      superseded_reason = coalesce(superseded_reason, 'Superseded by the linked session repair.')
  where id = v_expected_correction;
  return v_result;
end;
$$;

revoke all on function public.repair_staff_time_duplicate_correction(uuid, uuid, date, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.repair_staff_time_duplicate_correction(uuid, uuid, date, uuid, uuid)
  to service_role;

comment on column public.staff_time_corrections.superseded_at is
  'Auditable timestamp for an approved correction replaced by a later correction.';
comment on function public.repair_staff_time_duplicate_correction(uuid, uuid, date, uuid, uuid) is
  'One-time, exact-ID Admin repair for the approved duplicate Staff Time correction.';
