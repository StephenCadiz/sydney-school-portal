begin;

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
  v_target_profile public.profiles;
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

  select * into v_target_profile
  from public.profiles
  where id = p_teacher_id
    and role in ('teacher', 'admin')
  for share;
  if v_target_profile.id is null then
    raise exception 'The selected staff member was not found.' using errcode = '22023';
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

revoke all on function public.staff_admin_create_time_correction(
  uuid, uuid, date, uuid, timestamptz, timestamptz, text
) from public, anon, authenticated;
grant execute on function public.staff_admin_create_time_correction(
  uuid, uuid, date, uuid, timestamptz, timestamptz, text
) to service_role;

commit;
