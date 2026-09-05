begin;

create table public.staff_time_admin_enrollment_events (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid not null references public.profiles(id) on delete restrict,
  requires_time_registration boolean not null,
  effective_from date not null,
  changed_by uuid not null references public.profiles(id) on delete restrict,
  changed_at timestamptz not null default now()
);

create index staff_time_admin_enrollment_effective_idx
  on public.staff_time_admin_enrollment_events
  (admin_id, effective_from desc, changed_at desc, id desc);

comment on table public.staff_time_admin_enrollment_events is
  'Append-only effective-dated audit of whether an Admin profile participates in the shared Staff Time Register. No row means not enrolled.';

comment on column public.staff_time_employment_records.teacher_id is
  'Legacy column name retained for compatibility; references an eligible Staff Time participant profile (Teacher or enrolled Admin staff).';
comment on column public.staff_work_schedules.teacher_id is
  'Legacy column name retained for compatibility; references an eligible Staff Time participant profile (Teacher or enrolled Admin staff).';
comment on column public.staff_clock_sessions.teacher_id is
  'Legacy column name retained for compatibility; references the Staff Time participant profile that owns the session.';

create trigger staff_time_admin_enrollment_events_immutable
before update or delete on public.staff_time_admin_enrollment_events
for each row execute function app_private.staff_time_reject_change();

create or replace function app_private.staff_time_is_participant(
  p_profile_id uuid,
  p_work_date date
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, pg_temp
as $$
  select case profile.role
    when 'teacher' then true
    when 'admin' then coalesce((
      select event.requires_time_registration
      from public.staff_time_admin_enrollment_events event
      where event.admin_id = profile.id
        and event.effective_from <= p_work_date
      order by event.effective_from desc, event.changed_at desc, event.id desc
      limit 1
    ), false)
    else false
  end
  from public.profiles profile
  where profile.id = p_profile_id
    and profile.role in ('teacher', 'admin');
$$;

create or replace function app_private.staff_time_require_teacher(p_actor_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_work_date date := (clock_timestamp() at time zone 'Europe/Madrid')::date;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'Staff Time operations require the server service role.'
      using errcode = '42501';
  end if;

  if not coalesce(
    app_private.staff_time_is_participant(p_actor_id, v_work_date),
    false
  ) then
    raise exception 'Eligible Staff Time participant access required.'
      using errcode = '42501';
  end if;
end;
$$;

comment on function app_private.staff_time_require_teacher(uuid) is
  'Legacy function name retained for compatibility. Requires a Teacher or an Admin enrolled in Staff Time on the current Madrid work date.';

create or replace function app_private.staff_time_require_session_participant()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
begin
  if not coalesce(
    app_private.staff_time_is_participant(new.teacher_id, new.work_date),
    false
  ) then
    raise exception 'The profile is not enrolled in Staff Time for this work date.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger staff_clock_sessions_participant_guard
before insert on public.staff_clock_sessions
for each row execute function app_private.staff_time_require_session_participant();

create or replace function public.set_staff_time_admin_enrollment(
  p_actor_id uuid,
  p_admin_id uuid,
  p_requires_time_registration boolean,
  p_effective_from date
)
returns public.staff_time_admin_enrollment_events
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_result public.staff_time_admin_enrollment_events;
  v_current boolean := false;
  v_today date := (clock_timestamp() at time zone 'Europe/Madrid')::date;
begin
  perform app_private.staff_time_require_admin(p_actor_id);
  if p_effective_from is null or p_requires_time_registration is null then
    raise exception 'A Staff Time setting and effective date are required.'
      using errcode = '22023';
  end if;
  if p_effective_from <> v_today then
    raise exception 'Admin Staff Time enrollment changes must take effect on the current Madrid date.'
      using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.profiles profile
    where profile.id = p_admin_id and profile.role = 'admin'
  ) then
    raise exception 'The selected Admin staff account was not found.'
      using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_admin_id::text, 0));
  if p_actor_id = p_admin_id and not p_requires_time_registration then
    raise exception 'A tracked Admin cannot disable their own time-registration requirement.'
      using errcode = '42501';
  end if;
  if not p_requires_time_registration
    and p_effective_from <= v_today
    and exists (
      select 1 from public.staff_clock_sessions session
      where session.teacher_id = p_admin_id and session.closed_at is null
    )
  then
    raise exception 'The Admin staff member must sign out before time registration can be disabled.'
      using errcode = '55000';
  end if;

  select coalesce(event.requires_time_registration, false)
  into v_current
  from public.staff_time_admin_enrollment_events event
  where event.admin_id = p_admin_id
    and event.effective_from <= p_effective_from
  order by event.effective_from desc, event.changed_at desc, event.id desc
  limit 1;

  if coalesce(v_current, false) = p_requires_time_registration then
    select * into v_result
    from public.staff_time_admin_enrollment_events event
    where event.admin_id = p_admin_id
      and event.effective_from <= p_effective_from
    order by event.effective_from desc, event.changed_at desc, event.id desc
    limit 1;
    return v_result;
  end if;

  insert into public.staff_time_admin_enrollment_events (
    admin_id, requires_time_registration, effective_from, changed_by, changed_at
  ) values (
    p_admin_id, p_requires_time_registration, p_effective_from, p_actor_id,
    clock_timestamp()
  ) returning * into v_result;
  return v_result;
end;
$$;

create or replace function public.save_staff_time_employment_record(
  p_actor_id uuid,
  p_teacher_id uuid,
  p_effective_from date,
  p_dni_nie text,
  p_job_title text,
  p_working_time_type text,
  p_contracted_weekly_hours numeric,
  p_time_recording_enabled boolean,
  p_clocking_location_policy text
)
returns public.staff_time_employment_records
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_profile public.profiles;
  v_current public.staff_time_employment_records;
  v_result public.staff_time_employment_records;
begin
  perform app_private.staff_time_require_admin(p_actor_id);
  select * into v_profile from public.profiles
  where id = p_teacher_id and role in ('teacher', 'admin');
  if v_profile.id is not null then
    perform pg_advisory_xact_lock(hashtextextended(p_teacher_id::text, 0));
  end if;
  if v_profile.id is null
    or not coalesce(
      app_private.staff_time_is_participant(p_teacher_id, p_effective_from),
      false
    )
  then
    raise exception 'The selected Staff Time participant was not found or is not enrolled on the effective date.'
      using errcode = '22023';
  end if;
  if v_profile.role = 'admin' and not p_time_recording_enabled then
    raise exception 'Admin time registration is controlled by the Admin account enrollment setting.'
      using errcode = '22023';
  end if;
  if p_effective_from is null then
    raise exception 'An effective date is required.' using errcode = '22023';
  end if;

  select * into v_current
  from public.staff_time_employment_records
  where teacher_id = p_teacher_id and effective_to is null
  for update;
  if v_current.id is not null then
    if p_effective_from <= v_current.effective_from then
      raise exception 'The new employment record must start after the current record.'
        using errcode = '22023';
    end if;
    update public.staff_time_employment_records
      set effective_to = p_effective_from - 1
      where id = v_current.id;
  end if;

  insert into public.staff_time_employment_records (
    teacher_id, effective_from, legal_first_name, legal_last_name, dni_nie,
    job_title, working_time_type, contracted_weekly_hours,
    time_recording_enabled, clocking_location_policy, created_by
  ) values (
    p_teacher_id, p_effective_from, btrim(v_profile.first_name),
    btrim(coalesce(v_profile.last_name, '')), upper(btrim(p_dni_nie)),
    btrim(p_job_title), p_working_time_type, p_contracted_weekly_hours,
    p_time_recording_enabled, p_clocking_location_policy, p_actor_id
  ) returning * into v_result;
  return v_result;
end;
$$;

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
      from jsonb_to_recordset(p_intervals) with ordinality
        as item(weekday smallint, start_time time, end_time time, ordinality bigint)
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
    from jsonb_to_recordset(p_intervals)
      as item(weekday smallint, start_time time, end_time time)
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
  v_sign_in_id uuid;
  v_sign_out_id uuid;
  v_result public.staff_time_corrections;
begin
  perform app_private.staff_time_require_teacher(p_actor_id);
  if not coalesce(
    app_private.staff_time_is_participant(p_actor_id, p_work_date),
    false
  ) then
    raise exception 'The selected work date is outside your Staff Time enrollment.'
      using errcode = '42501';
  end if;
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
  if p_session_id is not null then
    select * into v_session from public.staff_clock_sessions
    where id = p_session_id and teacher_id = p_actor_id and work_date = p_work_date;
    if v_session.id is null then
      raise exception 'The selected session does not belong to this staff member and work date.'
        using errcode = '42501';
    end if;
    select id into v_sign_in_id from public.staff_clock_events
      where session_id = p_session_id and event_type = 'sign_in';
    select id into v_sign_out_id from public.staff_clock_events
      where session_id = p_session_id and event_type = 'sign_out';
  end if;

  insert into public.staff_time_corrections (
    teacher_id, work_date, session_id, original_sign_in_event_id,
    original_sign_out_event_id, requested_sign_in_at, requested_sign_out_at,
    request_type, reason, submission_source, submitted_by
  ) values (
    p_actor_id, p_work_date, p_session_id, v_sign_in_id, v_sign_out_id,
    p_requested_sign_in_at, p_requested_sign_out_at, p_request_type,
    btrim(p_reason), 'teacher_request', p_actor_id
  ) returning * into v_result;
  return v_result;
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

create or replace function public.staff_review_time_correction(
  p_actor_id uuid,
  p_correction_id uuid,
  p_decision text,
  p_review_note text
)
returns public.staff_time_corrections
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_pending public.staff_time_corrections;
  v_result public.staff_time_corrections;
begin
  perform app_private.staff_time_require_admin(p_actor_id);
  if p_decision not in ('approved', 'rejected') then
    raise exception 'Choose Approve or Reject.' using errcode = '22023';
  end if;
  select * into v_pending from public.staff_time_corrections
  where id = p_correction_id and status = 'pending'
  for update;
  if v_pending.id is null then
    raise exception 'The correction is no longer pending.' using errcode = 'P0002';
  end if;
  if v_pending.teacher_id = p_actor_id then
    raise exception 'A tracked Admin cannot approve or reject their own correction request.'
      using errcode = '42501';
  end if;

  update public.staff_time_corrections
  set status = p_decision, reviewed_by = p_actor_id, reviewed_at = now(),
      review_note = nullif(btrim(p_review_note), '')
  where id = p_correction_id and status = 'pending'
  returning * into v_result;

  if p_decision = 'approved' then
    update public.staff_time_incidences
    set status = 'resolved', resolved_by = p_actor_id, resolved_at = now(),
        correction_id = v_result.id,
        resolution_note = 'Resolved by an approved staff correction.'
    where teacher_id = v_result.teacher_id and work_date = v_result.work_date
      and status = 'open'
      and incidence_type in ('missing_sign_in', 'missing_sign_out');
  end if;
  return v_result;
end;
$$;

create or replace function public.staff_resolve_time_incidence(
  p_actor_id uuid,
  p_incidence_id uuid,
  p_status text,
  p_resolution_note text
)
returns public.staff_time_incidences
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_incidence public.staff_time_incidences;
  v_result public.staff_time_incidences;
begin
  perform app_private.staff_time_require_admin(p_actor_id);
  if p_status not in ('resolved', 'dismissed') then
    raise exception 'Choose a valid incidence resolution.' using errcode = '22023';
  end if;
  if nullif(btrim(p_resolution_note), '') is null
    or char_length(p_resolution_note) > 2000
  then
    raise exception 'A resolution note of no more than 2,000 characters is required.'
      using errcode = '22023';
  end if;
  select * into v_incidence from public.staff_time_incidences
  where id = p_incidence_id and status = 'open'
  for update;
  if v_incidence.id is null then
    raise exception 'The incidence is no longer open.' using errcode = 'P0002';
  end if;
  if v_incidence.teacher_id = p_actor_id then
    raise exception 'A tracked Admin cannot resolve or dismiss their own Staff Time incidence.'
      using errcode = '42501';
  end if;

  update public.staff_time_incidences
  set status = p_status, resolved_by = p_actor_id, resolved_at = now(),
      resolution_note = btrim(p_resolution_note)
  where id = p_incidence_id and status = 'open'
  returning * into v_result;
  return v_result;
end;
$$;

create or replace function public.refresh_staff_time_incidences(
  p_actor_id uuid,
  p_start_date date,
  p_end_date date
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_date date;
  v_today date := (clock_timestamp() at time zone 'Europe/Madrid')::date;
  v_now_local timestamp := clock_timestamp() at time zone 'Europe/Madrid';
  v_staff record;
  v_last_end time;
  v_inserted integer := 0;
  v_count integer;
begin
  perform app_private.staff_time_require_admin(p_actor_id);
  if p_start_date is null or p_end_date is null or p_end_date < p_start_date
    or p_end_date - p_start_date > 366
  then
    raise exception 'Choose an incidence scan range of no more than 367 days.'
      using errcode = '22023';
  end if;

  for v_date in select generate_series(p_start_date, least(p_end_date, v_today), interval '1 day')::date
  loop
    if public.is_school_closed(v_date) then
      update public.staff_time_incidences
      set status = 'dismissed', resolved_at = now(),
          resolution_note = 'School Closure overrides the planned work obligation.'
      where work_date = v_date and status = 'open' and source = 'automatic'
        and incidence_type in ('missing_sign_in', 'missing_sign_out');
      continue;
    end if;

    for v_staff in
      select employment.teacher_id, schedule.id as schedule_id
      from public.staff_time_employment_records employment
      join public.staff_work_schedules schedule
        on schedule.teacher_id = employment.teacher_id
        and schedule.effective_from <= v_date
        and (schedule.effective_to is null or schedule.effective_to >= v_date)
      where employment.effective_from <= v_date
        and (employment.effective_to is null or employment.effective_to >= v_date)
        and employment.time_recording_enabled
        and app_private.staff_time_is_participant(employment.teacher_id, v_date)
    loop
      select max(interval.end_time) into v_last_end
      from public.staff_work_schedule_intervals interval
      where interval.schedule_id = v_staff.schedule_id
        and interval.weekday = extract(isodow from v_date)::smallint;
      if v_last_end is null then
        continue;
      end if;

      if (
        v_date < v_today
        or v_now_local > (v_date + v_last_end + interval '60 minutes')
      ) and not exists (
        select 1 from public.staff_clock_sessions session
        where session.teacher_id = v_staff.teacher_id and session.work_date = v_date
      ) and not exists (
        select 1 from public.staff_time_corrections correction
        where correction.teacher_id = v_staff.teacher_id
          and correction.work_date = v_date and correction.status = 'approved'
          and correction.requested_sign_in_at is not null
      ) then
        insert into public.staff_time_incidences (
          teacher_id, work_date, incidence_type, source, description
        ) values (
          v_staff.teacher_id, v_date, 'missing_sign_in', 'automatic',
          'No actual sign-in has been recorded for a planned working day.'
        ) on conflict do nothing;
        get diagnostics v_count = row_count;
        v_inserted := v_inserted + v_count;
      end if;

      insert into public.staff_time_incidences (
        teacher_id, work_date, session_id, incidence_type, source, description
      )
      select session.teacher_id, session.work_date, session.id,
        'missing_sign_out', 'automatic',
        'A verified sign-in remains open beyond the planned working day.'
      from public.staff_clock_sessions session
      where session.teacher_id = v_staff.teacher_id
        and session.work_date = v_date and session.closed_at is null
        and (
          v_date < v_today
          or v_now_local > (v_date + v_last_end + interval '120 minutes')
          or clock_timestamp() > session.opened_at + interval '16 hours'
        )
      on conflict do nothing;
      get diagnostics v_count = row_count;
      v_inserted := v_inserted + v_count;
    end loop;
  end loop;
  return v_inserted;
end;
$$;

alter table public.staff_time_admin_enrollment_events enable row level security;
revoke all on table public.staff_time_admin_enrollment_events from anon, authenticated;
grant select, insert on table public.staff_time_admin_enrollment_events to service_role;

revoke all on function app_private.staff_time_is_participant(uuid, date)
  from public, anon, authenticated;
revoke all on function app_private.staff_time_require_session_participant()
  from public, anon, authenticated;
revoke all on function public.set_staff_time_admin_enrollment(uuid, uuid, boolean, date)
  from public, anon, authenticated;
revoke all on function public.staff_resolve_time_incidence(uuid, uuid, text, text)
  from public, anon, authenticated;

grant execute on function public.set_staff_time_admin_enrollment(uuid, uuid, boolean, date)
  to service_role;
grant execute on function public.staff_resolve_time_incidence(uuid, uuid, text, text)
  to service_role;

commit;
