-- Make manual Staff Time recovery idempotent and provide a controlled
-- Admin action for stale real clock sessions.

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
  v_existing public.staff_time_corrections;
  v_sign_in_id uuid;
  v_sign_out_id uuid;
  v_result public.staff_time_corrections;
begin
  perform app_private.staff_time_require_admin(p_actor_id);
  if p_actor_id = p_teacher_id then
    raise exception 'A tracked Admin cannot create a manual correction for their own record.'
      using errcode = '42501';
  end if;
  if not coalesce(app_private.staff_time_is_participant(p_teacher_id, p_work_date), false) then
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

  perform pg_advisory_xact_lock(hashtextextended(p_teacher_id::text, 0));

  -- An exact retry returns the existing audited correction instead of creating
  -- a second synthetic session.
  select * into v_existing
  from public.staff_time_corrections correction
  where correction.teacher_id = p_teacher_id
    and correction.work_date = p_work_date
    and correction.session_id is not distinct from p_session_id
    and correction.requested_sign_in_at is not distinct from p_requested_sign_in_at
    and correction.requested_sign_out_at is not distinct from p_requested_sign_out_at
    and correction.status = 'approved'
    and correction.superseded_at is null
  order by correction.reviewed_at desc nulls last, correction.submitted_at desc, correction.id desc
  limit 1;
  if v_existing.id is not null then
    return v_existing;
  end if;

  if p_session_id is null and exists (
    select 1 from public.staff_clock_sessions session
    where session.teacher_id = p_teacher_id
      and (session.closed_at is null or session.work_date = p_work_date)
  ) then
    raise exception 'Select the exact existing clock session for this staff member.'
      using errcode = '22023';
  end if;

  if p_session_id is not null then
    select * into v_session
    from public.staff_clock_sessions
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

create or replace function public.staff_admin_close_stale_session(
  p_actor_id uuid,
  p_teacher_id uuid,
  p_session_id uuid,
  p_request_ip inet,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_session public.staff_clock_sessions;
  v_now timestamptz := clock_timestamp();
  v_network_id uuid;
  v_event public.staff_clock_events;
begin
  perform app_private.staff_time_require_admin(p_actor_id);
  if p_actor_id = p_teacher_id then
    raise exception 'A tracked Admin cannot close their own Staff Time session.' using errcode = '42501';
  end if;
  if p_request_ip is null then
    raise exception 'A server-detected request IP is required.' using errcode = '22023';
  end if;
  if nullif(btrim(p_reason), '') is null or char_length(p_reason) > 2000 then
    raise exception 'A closure reason is required.' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_teacher_id::text, 0));

  select network.id into v_network_id
  from public.staff_allowed_networks network
  where network.active and p_request_ip <<= network.network
  order by masklen(network.network) desc
  limit 1;
  if v_network_id is null then
    raise exception 'The Admin request must come from an authorised Staff Time network.'
      using errcode = '42501';
  end if;

  select * into v_session
  from public.staff_clock_sessions
  where id = p_session_id and teacher_id = p_teacher_id
  for update;
  if v_session.id is null then
    raise exception 'The selected clock session was not found.' using errcode = '22023';
  end if;
  if v_session.closed_at is not null then
    return jsonb_build_object(
      'ok', true,
      'already_closed', true,
      'session_id', v_session.id,
      'closed_at', v_session.closed_at
    );
  end if;

  update public.staff_clock_sessions
  set closed_at = v_now
  where id = v_session.id;

  insert into public.staff_clock_events (
    session_id, teacher_id, event_type, occurred_at, request_ip,
    verification_result, allowed_network_id
  ) values (
    v_session.id, p_teacher_id, 'sign_out', v_now, p_request_ip,
    'verified_school_network', v_network_id
  ) returning * into v_event;

  insert into public.staff_clock_attempts (
    teacher_id, session_id, event_id, action_type, attempted_at,
    request_ip, accepted, verification_result
  ) values (
    p_teacher_id, v_session.id, v_event.id, 'sign_out', v_now,
    p_request_ip, true, 'verified_school_network'
  );

  update public.staff_time_incidences
  set status = 'resolved', resolved_by = p_actor_id, resolved_at = v_now,
      resolution_note = btrim(p_reason)
  where teacher_id = p_teacher_id and session_id = v_session.id
    and status = 'open' and incidence_type = 'missing_sign_out';

  return jsonb_build_object(
    'ok', true,
    'already_closed', false,
    'session_id', v_session.id,
    'closed_at', v_now,
    'event_id', v_event.id
  );
end;
$$;

-- One-time, exact-ID repair for Natalia Rusnak's duplicate 22 September
-- corrections. The function is intentionally not parameterised by arbitrary
-- record IDs so it cannot be repurposed as a broad cleanup endpoint.
create or replace function public.repair_natalia_staff_time_corrections(p_actor_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_teacher_id constant uuid := 'c8abfb2d-192c-428d-bbdb-7088ae2f6269';
  v_authoritative_id constant uuid := 'd83ebe54-ad6d-4607-bc81-2f64c136e9fe';
  v_duplicate_ids constant uuid[] := array[
    'a2ab0f4e-11ce-41df-b121-1af480b70e28'::uuid,
    '81682039-e013-4167-a1f0-40eb64f20c48'::uuid,
    '9624e7b5-e1c8-4bbf-a951-a961cf4860a5'::uuid
  ];
  v_count integer;
begin
  perform app_private.staff_time_require_admin(p_actor_id);
  perform pg_advisory_xact_lock(hashtextextended(v_teacher_id::text, 0));

  if not exists (
    select 1 from public.staff_time_corrections correction
    where correction.id = v_authoritative_id
      and correction.teacher_id = v_teacher_id
      and correction.work_date = date '2026-09-22'
      and correction.session_id is null
      and correction.status = 'approved'
      and correction.superseded_at is null
      and correction.requested_sign_in_at = timestamptz '2026-09-22 14:30:00+00'
      and correction.requested_sign_out_at = timestamptz '2026-09-22 17:30:00+00'
  ) then
    raise exception 'Natalia authoritative correction no longer matches the approved repair scope.' using errcode = '22023';
  end if;

  if exists (
    select 1 from public.staff_time_corrections correction
    where correction.id = any(v_duplicate_ids)
      and (
        correction.teacher_id <> v_teacher_id
        or correction.work_date <> date '2026-09-22'
        or correction.session_id is not null
        or correction.status <> 'approved'
      )
  ) or (
    select count(*) from public.staff_time_corrections correction
    where correction.id = any(v_duplicate_ids)
  ) <> 3 then
    raise exception 'Natalia duplicate corrections no longer match the approved repair scope.' using errcode = '22023';
  end if;

  update public.staff_time_corrections
  set superseded_at = coalesce(superseded_at, now()),
      superseded_by = coalesce(superseded_by, p_actor_id),
      superseded_reason = coalesce(
        superseded_reason,
        'Superseded by the authoritative 16:30–19:30 correction.'
      )
  where id = any(v_duplicate_ids)
    and superseded_at is null;
  get diagnostics v_count = row_count;

  return jsonb_build_object(
    'ok', true,
    'teacher_id', v_teacher_id,
    'work_date', '2026-09-22',
    'authoritative_correction_id', v_authoritative_id,
    'superseded_count', v_count
  );
end;
$$;

revoke all on function public.staff_admin_close_stale_session(uuid, uuid, uuid, inet, text)
  from public, anon, authenticated;
revoke all on function public.repair_natalia_staff_time_corrections(uuid)
  from public, anon, authenticated;
grant execute on function public.staff_admin_close_stale_session(uuid, uuid, uuid, inet, text)
  to service_role;
grant execute on function public.repair_natalia_staff_time_corrections(uuid)
  to service_role;

comment on function public.staff_admin_close_stale_session(uuid, uuid, uuid, inet, text)
  is 'Admin-only idempotent closure of one exact stale Staff Time session.';
comment on function public.repair_natalia_staff_time_corrections(uuid)
  is 'Exact one-time repair for Natalia Rusnak duplicate 2026-09-22 corrections.';
