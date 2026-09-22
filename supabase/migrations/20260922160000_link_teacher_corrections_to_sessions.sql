-- Resolve a Teacher correction to a unique same-day clock session at the
-- database boundary. This prevents a late sign-in followed by a correction
-- request from becoming a second, open synthetic session.
create or replace function public.staff_submit_time_correction(
  p_actor_id uuid,
  p_work_date date,
  p_session_id uuid,
  p_requested_sign_in_at timestamptz,
  p_requested_sign_out_at timestamptz,
  p_request_type text,
  p_reason text
)
returns public.staff_time_corrections
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_session public.staff_clock_sessions;
  v_existing public.staff_time_corrections;
  v_session_count integer := 0;
  v_resolved_session_id uuid := p_session_id;
  v_sign_in_id uuid;
  v_sign_out_id uuid;
  v_result public.staff_time_corrections;
begin
  perform app_private.staff_time_require_teacher(p_actor_id);
  if p_work_date is null or (p_requested_sign_in_at is null and p_requested_sign_out_at is null) then
    raise exception 'Choose the work date and at least one corrected time.' using errcode = '22023';
  end if;
  if p_requested_sign_in_at is not null
    and (p_requested_sign_in_at at time zone 'Europe/Madrid')::date <> p_work_date
  then
    raise exception 'The requested sign-in time must be on the selected Madrid work date.'
      using errcode = '22023';
  end if;
  if p_requested_sign_out_at is not null
    and (p_requested_sign_out_at at time zone 'Europe/Madrid')::date <> p_work_date
  then
    raise exception 'The requested sign-out time must be on the selected Madrid work date.'
      using errcode = '22023';
  end if;

  -- Serialize retries and session discovery for this Teacher. The client may
  -- be stale, so the server is authoritative for the related session.
  perform pg_advisory_xact_lock(hashtextextended(p_actor_id::text, 0));
  if v_resolved_session_id is null then
    select count(*) into v_session_count
    from public.staff_clock_sessions session
    where session.teacher_id = p_actor_id
      and session.work_date = p_work_date;
    if v_session_count > 1 then
      raise exception 'Select the exact existing clock session for this work date.'
        using errcode = '22023';
    elsif v_session_count = 1 then
      select * into v_session
      from public.staff_clock_sessions session
      where session.teacher_id = p_actor_id
        and session.work_date = p_work_date
      order by session.opened_at asc, session.id asc
      limit 1
      for update;
      v_resolved_session_id := v_session.id;
    end if;
  else
    select * into v_session
    from public.staff_clock_sessions session
    where session.id = v_resolved_session_id
      and session.teacher_id = p_actor_id
      and session.work_date = p_work_date
    for update;
    if v_session.id is null then
      raise exception 'The selected session does not belong to this Teacher and work date.'
        using errcode = '42501';
    end if;
  end if;

  -- An exact retry returns the existing request instead of creating another
  -- correction or synthetic report row.
  select * into v_existing
  from public.staff_time_corrections correction
  where correction.teacher_id = p_actor_id
    and correction.work_date = p_work_date
    and correction.session_id is not distinct from v_resolved_session_id
    and correction.requested_sign_in_at is not distinct from p_requested_sign_in_at
    and correction.requested_sign_out_at is not distinct from p_requested_sign_out_at
    and correction.status in ('pending', 'approved')
    and correction.superseded_at is null
  order by correction.submitted_at desc, correction.id desc
  limit 1;
  if v_existing.id is not null then
    return v_existing;
  end if;

  if v_resolved_session_id is not null then
    select id into v_sign_in_id
    from public.staff_clock_events
    where session_id = v_resolved_session_id and event_type = 'sign_in'
    order by occurred_at asc, id asc
    limit 1;
    select id into v_sign_out_id
    from public.staff_clock_events
    where session_id = v_resolved_session_id and event_type = 'sign_out'
    order by occurred_at desc, id desc
    limit 1;
  end if;

  insert into public.staff_time_corrections (
    teacher_id, work_date, session_id, original_sign_in_event_id,
    original_sign_out_event_id, requested_sign_in_at, requested_sign_out_at,
    request_type, reason, submission_source, submitted_by
  ) values (
    p_actor_id, p_work_date, v_resolved_session_id, v_sign_in_id, v_sign_out_id,
    p_requested_sign_in_at, p_requested_sign_out_at, p_request_type,
    btrim(p_reason), 'teacher_request', p_actor_id
  ) returning * into v_result;
  return v_result;
end;
$$;

revoke all on function public.staff_submit_time_correction(
  uuid, date, uuid, timestamptz, timestamptz, text, text
) from public, anon, authenticated;

grant execute on function public.staff_submit_time_correction(
  uuid, date, uuid, timestamptz, timestamptz, text, text
) to service_role;

comment on function public.staff_submit_time_correction(
  uuid, date, uuid, timestamptz, timestamptz, text, text
) is
  'Creates an append-only Teacher correction and resolves a unique same-day clock session under an advisory lock.';

-- One-time, exact-ID repair for Lucia's approved unlinked late-sign-in
-- correction. The original row is retained and superseded; the replacement
-- is linked to the real closed session so the real sign-out remains official.
create or replace function public.repair_lucia_staff_time_correction(p_actor_id uuid)
returns public.staff_time_corrections
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_teacher constant uuid := '0fd24d3e-d87e-49bc-8ed6-c53bd380f449';
  v_session_id constant uuid := 'de8b15d2-dd81-4aac-9f83-532ba0eeadc0';
  v_old_id constant uuid := '57232ba6-9110-4c8a-92c6-e0014ec70706';
  v_session public.staff_clock_sessions;
  v_old public.staff_time_corrections;
  v_result public.staff_time_corrections;
  v_sign_in_id uuid;
  v_sign_out_id uuid;
begin
  perform app_private.staff_time_require_admin(p_actor_id);
  perform pg_advisory_xact_lock(hashtextextended(v_teacher::text, 0));

  select * into v_session
  from public.staff_clock_sessions
  where id = v_session_id and teacher_id = v_teacher and work_date = date '2026-09-22'
  for update;
  if v_session.id is null or v_session.closed_at is null then
    raise exception 'The exact Lucia clock session is missing or still open.' using errcode = '22023';
  end if;

  select * into v_old
  from public.staff_time_corrections
  where id = v_old_id and teacher_id = v_teacher and work_date = date '2026-09-22'
  for update;

  if v_old.id is null then
    select * into v_result
    from public.staff_time_corrections
    where teacher_id = v_teacher and work_date = date '2026-09-22'
      and session_id = v_session_id and status = 'approved' and superseded_at is null
    order by submitted_at desc, id desc limit 1;
    if v_result.id is not null then return v_result; end if;
    raise exception 'The exact Lucia correction was not found.' using errcode = '22023';
  end if;

  if v_old.superseded_at is not null then
    select * into v_result
    from public.staff_time_corrections
    where teacher_id = v_teacher and work_date = date '2026-09-22'
      and session_id = v_session_id and status = 'approved' and superseded_at is null
    order by submitted_at desc, id desc limit 1;
    if v_result.id is not null then return v_result; end if;
    raise exception 'Lucia correction is superseded but its linked replacement is missing.' using errcode = '55000';
  end if;

  if v_old.status <> 'approved'
    or v_old.session_id is not null
    or v_old.requested_sign_in_at is distinct from timestamptz '2026-09-22 14:30:00+00'
    or v_old.requested_sign_out_at is not null
  then
    raise exception 'The exact Lucia correction is not the approved unlinked start correction.' using errcode = '22023';
  end if;

  select * into v_result
  from public.staff_time_corrections
  where teacher_id = v_teacher and work_date = date '2026-09-22'
    and session_id = v_session_id and status = 'approved' and superseded_at is null
  order by submitted_at desc, id desc limit 1
  for update;

  select id into v_sign_in_id
  from public.staff_clock_events
  where session_id = v_session_id and event_type = 'sign_in'
  order by occurred_at asc, id asc limit 1;
  select id into v_sign_out_id
  from public.staff_clock_events
  where session_id = v_session_id and event_type = 'sign_out'
  order by occurred_at desc, id desc limit 1;

  if v_result.id is null then
    insert into public.staff_time_corrections (
      teacher_id, work_date, session_id, original_sign_in_event_id,
      original_sign_out_event_id, requested_sign_in_at, requested_sign_out_at,
      request_type, reason, submission_source, submitted_by,
      status, reviewed_by, reviewed_at, review_note
    ) values (
      v_teacher, date '2026-09-22', v_session_id, v_sign_in_id, v_sign_out_id,
      v_old.requested_sign_in_at, null, 'admin_manual_resolution',
      'Linked repair of the approved unlinked late-sign-in correction.',
      'admin_manual', p_actor_id, 'approved', p_actor_id, now(),
      'Approved exact-ID Lucia late-sign-in repair.'
    ) returning * into v_result;
  end if;

  update public.staff_time_corrections
  set superseded_at = coalesce(superseded_at, now()),
      superseded_by = coalesce(superseded_by, p_actor_id),
      superseded_reason = coalesce(superseded_reason, 'Superseded by the linked Lucia session repair.')
  where id = v_old_id;
  return v_result;
end;
$$;

revoke all on function public.repair_lucia_staff_time_correction(uuid)
  from public, anon, authenticated;
grant execute on function public.repair_lucia_staff_time_correction(uuid)
  to service_role;

comment on function public.repair_lucia_staff_time_correction(uuid) is
  'One-time exact-ID Admin repair for Lucia''s approved unlinked late-sign-in correction.';
