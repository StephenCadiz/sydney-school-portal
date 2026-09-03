begin;

create extension if not exists btree_gist with schema extensions;

create table public.staff_time_company_settings (
  id uuid primary key default gen_random_uuid(),
  effective_from date not null,
  effective_to date,
  legal_employer_name text not null,
  tax_identifier text not null,
  workplace_name text not null,
  workplace_address text not null,
  postcode text not null,
  city text not null,
  province text not null,
  country text not null,
  retention_years smallint not null default 4,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint staff_time_company_dates_check
    check (effective_to is null or effective_to >= effective_from),
  constraint staff_time_company_required_text_check check (
    nullif(btrim(legal_employer_name), '') is not null
    and nullif(btrim(tax_identifier), '') is not null
    and nullif(btrim(workplace_name), '') is not null
    and nullif(btrim(workplace_address), '') is not null
    and nullif(btrim(postcode), '') is not null
    and nullif(btrim(city), '') is not null
    and nullif(btrim(province), '') is not null
    and nullif(btrim(country), '') is not null
  ),
  constraint staff_time_company_retention_check check (retention_years >= 4),
  constraint staff_time_company_periods_exclude
    exclude using gist (
      daterange(effective_from, coalesce(effective_to, 'infinity'::date), '[]') with &&
    )
);

comment on table public.staff_time_company_settings is
  'Effective-dated legal employer and workplace identity used by official working-time reports.';

create table public.staff_time_employment_records (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.profiles(id) on delete restrict,
  effective_from date not null,
  effective_to date,
  legal_first_name text not null,
  legal_last_name text not null,
  dni_nie text not null,
  job_title text not null,
  working_time_type text not null,
  contracted_weekly_hours numeric(5, 2) not null,
  time_recording_enabled boolean not null default true,
  clocking_location_policy text not null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint staff_time_employment_dates_check
    check (effective_to is null or effective_to >= effective_from),
  constraint staff_time_employment_names_check check (
    nullif(btrim(legal_first_name), '') is not null
    and nullif(btrim(legal_last_name), '') is not null
  ),
  constraint staff_time_employment_dni_check
    check (nullif(btrim(dni_nie), '') is not null and char_length(dni_nie) <= 32),
  constraint staff_time_employment_job_check
    check (nullif(btrim(job_title), '') is not null and char_length(job_title) <= 160),
  constraint staff_time_employment_type_check
    check (working_time_type in ('full_time', 'part_time')),
  constraint staff_time_employment_hours_check
    check (contracted_weekly_hours > 0 and contracted_weekly_hours <= 168),
  constraint staff_time_employment_policy_check check (
    clocking_location_policy in (
      'school_network_only',
      'school_or_authorised_remote'
    )
  ),
  constraint staff_time_employment_periods_exclude
    exclude using gist (
      teacher_id with =,
      daterange(effective_from, coalesce(effective_to, 'infinity'::date), '[]') with &&
    )
);

comment on table public.staff_time_employment_records is
  'Immutable effective-dated employment snapshots. Legal names are copied from profiles when each snapshot is created.';

create table public.staff_work_schedules (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.profiles(id) on delete restrict,
  effective_from date not null,
  effective_to date,
  label text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint staff_work_schedule_dates_check
    check (effective_to is null or effective_to >= effective_from),
  constraint staff_work_schedule_label_check
    check (label is null or char_length(label) <= 160),
  constraint staff_work_schedule_periods_exclude
    exclude using gist (
      teacher_id with =,
      daterange(effective_from, coalesce(effective_to, 'infinity'::date), '[]') with &&
    )
);

create table public.staff_work_schedule_intervals (
  id uuid primary key default gen_random_uuid(),
  schedule_id uuid not null references public.staff_work_schedules(id) on delete restrict,
  weekday smallint not null,
  start_time time not null,
  end_time time not null,
  created_at timestamptz not null default now(),
  constraint staff_work_schedule_interval_weekday_check check (weekday between 1 and 7),
  constraint staff_work_schedule_interval_time_check check (end_time > start_time),
  constraint staff_work_schedule_interval_unique unique (schedule_id, weekday, start_time)
);

comment on column public.staff_work_schedule_intervals.weekday is
  'ISO weekday: Monday=1 through Sunday=7.';

create table public.staff_allowed_networks (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  network cidr not null,
  active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint staff_allowed_network_label_check
    check (nullif(btrim(label), '') is not null and char_length(label) <= 120),
  constraint staff_allowed_network_unique unique (network)
);

create table public.staff_remote_work_authorisations (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.profiles(id) on delete restrict,
  start_date date not null,
  end_date date not null,
  reason text,
  authorised_by uuid references public.profiles(id) on delete set null,
  authorised_at timestamptz not null default now(),
  revoked_by uuid references public.profiles(id) on delete set null,
  revoked_at timestamptz,
  revocation_reason text,
  constraint staff_remote_authorisation_dates_check check (end_date >= start_date),
  constraint staff_remote_authorisation_reason_check
    check (reason is null or char_length(reason) <= 1000),
  constraint staff_remote_authorisation_revocation_check check (
    (revoked_at is null and revoked_by is null and revocation_reason is null)
    or revoked_at is not null
  ),
  constraint staff_remote_authorisation_periods_exclude
    exclude using gist (
      teacher_id with =,
      daterange(start_date, end_date, '[]') with &&
    ) where (revoked_at is null)
);

create table public.staff_clock_sessions (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.profiles(id) on delete restrict,
  work_date date not null,
  clocking_mode text not null,
  opened_at timestamptz not null,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint staff_clock_session_mode_check
    check (clocking_mode in ('school_network', 'authorised_remote')),
  constraint staff_clock_session_close_check
    check (closed_at is null or closed_at >= opened_at),
  constraint staff_clock_session_identity_unique unique (id, teacher_id)
);

create unique index staff_clock_sessions_one_open_per_teacher_idx
  on public.staff_clock_sessions (teacher_id)
  where closed_at is null;

create table public.staff_clock_events (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null,
  teacher_id uuid not null,
  event_type text not null,
  occurred_at timestamptz not null,
  request_ip inet not null,
  verification_result text not null,
  allowed_network_id uuid references public.staff_allowed_networks(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint staff_clock_event_session_teacher_fk
    foreign key (session_id, teacher_id)
    references public.staff_clock_sessions(id, teacher_id) on delete restrict,
  constraint staff_clock_event_type_check check (event_type in ('sign_in', 'sign_out')),
  constraint staff_clock_event_verification_check check (
    verification_result in ('verified_school_network', 'authorised_remote')
  ),
  constraint staff_clock_event_network_evidence_check check (
    (verification_result = 'verified_school_network' and allowed_network_id is not null)
    or (verification_result = 'authorised_remote' and allowed_network_id is null)
  ),
  constraint staff_clock_event_session_type_unique unique (session_id, event_type)
);

create table public.staff_clock_attempts (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.profiles(id) on delete restrict,
  session_id uuid references public.staff_clock_sessions(id) on delete restrict,
  event_id uuid references public.staff_clock_events(id) on delete restrict,
  action_type text not null,
  attempted_at timestamptz not null,
  request_ip inet not null,
  accepted boolean not null,
  verification_result text not null,
  created_at timestamptz not null default now(),
  constraint staff_clock_attempt_action_check check (action_type in ('sign_in', 'sign_out')),
  constraint staff_clock_attempt_result_check check (
    verification_result in (
      'verified_school_network',
      'authorised_remote',
      'denied_no_employment_record',
      'denied_recording_disabled',
      'denied_school_closed',
      'denied_unauthorised_network',
      'denied_already_signed_in',
      'denied_no_open_session'
    )
  ),
  constraint staff_clock_attempt_acceptance_check check (
    (accepted and event_id is not null and session_id is not null
      and verification_result in ('verified_school_network', 'authorised_remote'))
    or (not accepted and event_id is null)
  )
);

create table public.staff_time_corrections (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.profiles(id) on delete restrict,
  work_date date not null,
  session_id uuid references public.staff_clock_sessions(id) on delete restrict,
  original_sign_in_event_id uuid references public.staff_clock_events(id) on delete restrict,
  original_sign_out_event_id uuid references public.staff_clock_events(id) on delete restrict,
  requested_sign_in_at timestamptz,
  requested_sign_out_at timestamptz,
  request_type text not null,
  reason text not null,
  submission_source text not null,
  submitted_by uuid not null references public.profiles(id) on delete restrict,
  submitted_at timestamptz not null default now(),
  status text not null default 'pending',
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  review_note text,
  constraint staff_time_correction_requested_value_check check (
    requested_sign_in_at is not null or requested_sign_out_at is not null
  ),
  constraint staff_time_correction_order_check check (
    requested_sign_in_at is null
    or requested_sign_out_at is null
    or requested_sign_out_at > requested_sign_in_at
  ),
  constraint staff_time_correction_type_check check (
    request_type in (
      'forgot_sign_in',
      'forgot_sign_out',
      'incorrect_clock_action',
      'technical_problem',
      'admin_manual_resolution',
      'other'
    )
  ),
  constraint staff_time_correction_reason_check
    check (nullif(btrim(reason), '') is not null and char_length(reason) <= 2000),
  constraint staff_time_correction_source_check
    check (submission_source in ('teacher_request', 'admin_manual')),
  constraint staff_time_correction_status_check
    check (status in ('pending', 'approved', 'rejected')),
  constraint staff_time_correction_review_check check (
    (status = 'pending' and reviewed_by is null and reviewed_at is null)
    or (status in ('approved', 'rejected') and reviewed_by is not null and reviewed_at is not null)
  ),
  constraint staff_time_correction_review_note_check
    check (review_note is null or char_length(review_note) <= 2000)
);

create table public.staff_time_incidences (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.profiles(id) on delete restrict,
  work_date date not null,
  session_id uuid references public.staff_clock_sessions(id) on delete restrict,
  correction_id uuid references public.staff_time_corrections(id) on delete restrict,
  incidence_type text not null,
  source text not null,
  description text,
  status text not null default 'open',
  detected_at timestamptz not null default now(),
  resolved_by uuid references public.profiles(id) on delete set null,
  resolved_at timestamptz,
  resolution_note text,
  constraint staff_time_incidence_type_check check (
    incidence_type in (
      'missing_sign_in',
      'missing_sign_out',
      'network_problem',
      'other'
    )
  ),
  constraint staff_time_incidence_source_check
    check (source in ('automatic', 'clock_attempt', 'admin')),
  constraint staff_time_incidence_status_check
    check (status in ('open', 'resolved', 'dismissed')),
  constraint staff_time_incidence_resolution_check check (
    (status = 'open' and resolved_at is null and resolved_by is null)
    or (status in ('resolved', 'dismissed') and resolved_at is not null)
  ),
  constraint staff_time_incidence_description_check
    check (description is null or char_length(description) <= 2000),
  constraint staff_time_incidence_resolution_note_check
    check (resolution_note is null or char_length(resolution_note) <= 2000)
);

create unique index staff_time_incidences_open_identity_idx
  on public.staff_time_incidences (
    teacher_id,
    work_date,
    incidence_type,
    coalesce(session_id, '00000000-0000-0000-0000-000000000000'::uuid)
  )
  where status = 'open';

create index staff_time_employment_teacher_period_idx
  on public.staff_time_employment_records (teacher_id, effective_from desc, effective_to);
create index staff_work_schedules_teacher_period_idx
  on public.staff_work_schedules (teacher_id, effective_from desc, effective_to);
create index staff_work_schedule_intervals_lookup_idx
  on public.staff_work_schedule_intervals (schedule_id, weekday, start_time);
create index staff_remote_work_teacher_dates_idx
  on public.staff_remote_work_authorisations (teacher_id, start_date, end_date)
  where revoked_at is null;
create index staff_clock_sessions_teacher_date_idx
  on public.staff_clock_sessions (teacher_id, work_date desc, opened_at);
create index staff_clock_sessions_work_date_idx
  on public.staff_clock_sessions (work_date desc, teacher_id);
create index staff_clock_events_teacher_time_idx
  on public.staff_clock_events (teacher_id, occurred_at desc);
create index staff_clock_events_session_time_idx
  on public.staff_clock_events (session_id, occurred_at);
create index staff_clock_attempts_teacher_time_idx
  on public.staff_clock_attempts (teacher_id, attempted_at desc);
create index staff_clock_attempts_denied_time_idx
  on public.staff_clock_attempts (attempted_at desc)
  where not accepted;
create index staff_time_corrections_teacher_date_idx
  on public.staff_time_corrections (teacher_id, work_date desc, submitted_at desc);
create index staff_time_corrections_pending_idx
  on public.staff_time_corrections (submitted_at)
  where status = 'pending';
create index staff_time_incidences_teacher_date_idx
  on public.staff_time_incidences (teacher_id, work_date desc, detected_at desc);
create index staff_time_incidences_open_idx
  on public.staff_time_incidences (work_date desc, detected_at)
  where status = 'open';

create or replace function app_private.staff_time_require_admin(p_actor_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = pg_catalog, pg_temp
as $$
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'Staff Time operations require the server service role.'
      using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.profiles profile
    where profile.id = p_actor_id and profile.role = 'admin'
  ) then
    raise exception 'Admin access required.' using errcode = '42501';
  end if;
end;
$$;

create or replace function app_private.staff_time_require_teacher(p_actor_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = pg_catalog, pg_temp
as $$
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'Staff Time operations require the server service role.'
      using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.profiles profile
    where profile.id = p_actor_id and profile.role = 'teacher'
  ) then
    raise exception 'Teacher access required.' using errcode = '42501';
  end if;
end;
$$;

create or replace function app_private.staff_time_reject_delete()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
begin
  raise exception 'Official Staff Time records cannot be deleted.' using errcode = '55000';
end;
$$;

create or replace function app_private.staff_time_reject_change()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
begin
  raise exception 'Original Staff Time audit records are immutable.' using errcode = '55000';
end;
$$;

create or replace function app_private.staff_time_close_effective_record()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Historical Staff Time configuration cannot be deleted.' using errcode = '55000';
  end if;

  if old.effective_to is not null
    or new.effective_to is null
    or new.effective_to < old.effective_from
    or (to_jsonb(new) - 'effective_to') is distinct from (to_jsonb(old) - 'effective_to')
  then
    raise exception 'Create a new effective-dated Staff Time record instead of editing history.'
      using errcode = '55000';
  end if;
  return new;
end;
$$;

create trigger staff_time_company_settings_protect_history
before update or delete on public.staff_time_company_settings
for each row execute function app_private.staff_time_close_effective_record();

create trigger staff_time_employment_records_protect_history
before update or delete on public.staff_time_employment_records
for each row execute function app_private.staff_time_close_effective_record();

create trigger staff_work_schedules_protect_history
before update or delete on public.staff_work_schedules
for each row execute function app_private.staff_time_close_effective_record();

create trigger staff_work_schedule_intervals_immutable
before update or delete on public.staff_work_schedule_intervals
for each row execute function app_private.staff_time_reject_change();

create or replace function app_private.staff_time_check_schedule_interval_overlap()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
begin
  if exists (
    select 1
    from public.staff_work_schedule_intervals interval
    where interval.schedule_id = new.schedule_id
      and interval.weekday = new.weekday
      and interval.id <> new.id
      and interval.start_time < new.end_time
      and new.start_time < interval.end_time
  ) then
    raise exception 'Planned work intervals on the same day cannot overlap.'
      using errcode = '23P01';
  end if;
  return new;
end;
$$;

create trigger staff_work_schedule_intervals_no_overlap
before insert or update on public.staff_work_schedule_intervals
for each row execute function app_private.staff_time_check_schedule_interval_overlap();

create or replace function app_private.staff_time_touch_network()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger staff_allowed_networks_touch
before update on public.staff_allowed_networks
for each row execute function app_private.staff_time_touch_network();

create trigger staff_allowed_networks_no_delete
before delete on public.staff_allowed_networks
for each row execute function app_private.staff_time_reject_delete();

create or replace function app_private.staff_time_protect_remote_authorisation()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Remote-work authorisations must be retained for audit.' using errcode = '55000';
  end if;
  if old.revoked_at is not null
    or new.revoked_at is null
    or (to_jsonb(new) - array['revoked_by', 'revoked_at', 'revocation_reason'])
      is distinct from
      (to_jsonb(old) - array['revoked_by', 'revoked_at', 'revocation_reason'])
  then
    raise exception 'Remote-work authorisations may only be revoked, not rewritten.'
      using errcode = '55000';
  end if;
  return new;
end;
$$;

create trigger staff_remote_work_authorisations_protect
before update or delete on public.staff_remote_work_authorisations
for each row execute function app_private.staff_time_protect_remote_authorisation();

create or replace function app_private.staff_time_protect_session()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Official clock sessions cannot be deleted.' using errcode = '55000';
  end if;
  if old.closed_at is not null
    or new.closed_at is null
    or (to_jsonb(new) - 'closed_at') is distinct from (to_jsonb(old) - 'closed_at')
  then
    raise exception 'An official clock session can only be closed once.' using errcode = '55000';
  end if;
  return new;
end;
$$;

create trigger staff_clock_sessions_protect
before update or delete on public.staff_clock_sessions
for each row execute function app_private.staff_time_protect_session();

create trigger staff_clock_events_immutable
before update or delete on public.staff_clock_events
for each row execute function app_private.staff_time_reject_change();

create trigger staff_clock_attempts_immutable
before update or delete on public.staff_clock_attempts
for each row execute function app_private.staff_time_reject_change();

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

create trigger staff_time_corrections_protect
before update or delete on public.staff_time_corrections
for each row execute function app_private.staff_time_protect_correction();

create or replace function app_private.staff_time_protect_incidence()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Staff Time incidence history cannot be deleted.' using errcode = '55000';
  end if;
  if old.status <> 'open'
    or new.status not in ('resolved', 'dismissed')
    or new.resolved_at is null
    or (to_jsonb(new) - array['status', 'resolved_by', 'resolved_at', 'resolution_note', 'correction_id'])
      is distinct from
      (to_jsonb(old) - array['status', 'resolved_by', 'resolved_at', 'resolution_note', 'correction_id'])
  then
    raise exception 'Incidences retain their source and may only be resolved once.'
      using errcode = '55000';
  end if;
  return new;
end;
$$;

create trigger staff_time_incidences_protect
before update or delete on public.staff_time_incidences
for each row execute function app_private.staff_time_protect_incidence();

create or replace function public.save_staff_time_company_settings(
  p_actor_id uuid,
  p_effective_from date,
  p_legal_employer_name text,
  p_tax_identifier text,
  p_workplace_name text,
  p_workplace_address text,
  p_postcode text,
  p_city text,
  p_province text,
  p_country text
)
returns public.staff_time_company_settings
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_current public.staff_time_company_settings;
  v_result public.staff_time_company_settings;
begin
  perform app_private.staff_time_require_admin(p_actor_id);
  if p_effective_from is null then
    raise exception 'An effective date is required.' using errcode = '22023';
  end if;

  select * into v_current
  from public.staff_time_company_settings
  where effective_to is null
  for update;

  if v_current.id is not null then
    if p_effective_from <= v_current.effective_from then
      raise exception 'The new company settings must start after the current record.'
        using errcode = '22023';
    end if;
    update public.staff_time_company_settings
      set effective_to = p_effective_from - 1
      where id = v_current.id;
  end if;

  insert into public.staff_time_company_settings (
    effective_from, legal_employer_name, tax_identifier, workplace_name,
    workplace_address, postcode, city, province, country, created_by
  ) values (
    p_effective_from, btrim(p_legal_employer_name), upper(btrim(p_tax_identifier)),
    btrim(p_workplace_name), btrim(p_workplace_address), btrim(p_postcode),
    btrim(p_city), btrim(p_province), btrim(p_country), p_actor_id
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
  where id = p_teacher_id and role = 'teacher';
  if v_profile.id is null then
    raise exception 'The selected Teacher was not found.' using errcode = '22023';
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
  if not exists (
    select 1 from public.profiles where id = p_teacher_id and role = 'teacher'
  ) then
    raise exception 'The selected Teacher was not found.' using errcode = '22023';
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

create or replace function app_private.staff_time_add_network_incidence(
  p_teacher_id uuid,
  p_work_date date,
  p_description text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
begin
  insert into public.staff_time_incidences (
    teacher_id, work_date, incidence_type, source, description
  ) values (
    p_teacher_id, p_work_date, 'network_problem', 'clock_attempt', p_description
  ) on conflict do nothing;
end;
$$;

create or replace function public.staff_match_allowed_network(p_request_ip inet)
returns table (id uuid, label text, network cidr)
language sql
stable
security definer
set search_path = pg_catalog, pg_temp
as $$
  select allowed.id, allowed.label, allowed.network
  from public.staff_allowed_networks allowed
  where allowed.active and p_request_ip <<= allowed.network
  order by masklen(allowed.network) desc
  limit 1;
$$;

create or replace function public.staff_clock_in(
  p_actor_id uuid,
  p_request_ip inet
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_work_date date;
  v_employment public.staff_time_employment_records;
  v_remote boolean := false;
  v_network_id uuid;
  v_mode text;
  v_verification text;
  v_session public.staff_clock_sessions;
  v_event public.staff_clock_events;
  v_denial text;
begin
  perform app_private.staff_time_require_teacher(p_actor_id);
  if p_request_ip is null then
    raise exception 'A server-detected request IP is required.' using errcode = '22023';
  end if;
  v_work_date := (v_now at time zone 'Europe/Madrid')::date;
  perform pg_advisory_xact_lock(hashtextextended(p_actor_id::text, 0));

  select * into v_employment
  from public.staff_time_employment_records employment
  where employment.teacher_id = p_actor_id
    and employment.effective_from <= v_work_date
    and (employment.effective_to is null or employment.effective_to >= v_work_date)
  order by employment.effective_from desc
  limit 1;

  if v_employment.id is null then
    v_denial := 'denied_no_employment_record';
  elsif not v_employment.time_recording_enabled then
    v_denial := 'denied_recording_disabled';
  elsif exists (
    select 1 from public.staff_clock_sessions
    where teacher_id = p_actor_id and closed_at is null
  ) then
    v_denial := 'denied_already_signed_in';
  else
    select exists (
      select 1 from public.staff_remote_work_authorisations remote
      where remote.teacher_id = p_actor_id
        and remote.revoked_at is null
        and v_work_date between remote.start_date and remote.end_date
    ) into v_remote;

    if v_employment.clocking_location_policy = 'school_or_authorised_remote'
      and v_remote
    then
      v_mode := 'authorised_remote';
      v_verification := 'authorised_remote';
    else
      select network.id into v_network_id
      from public.staff_allowed_networks network
      where network.active and p_request_ip <<= network.network
      order by masklen(network.network) desc
      limit 1;
      if v_network_id is null then
        v_denial := 'denied_unauthorised_network';
      else
        v_mode := 'school_network';
        v_verification := 'verified_school_network';
      end if;
    end if;

    if v_denial is null
      and public.is_school_closed(v_work_date)
      and v_mode <> 'authorised_remote'
    then
      v_denial := 'denied_school_closed';
    end if;
  end if;

  if v_denial is not null then
    insert into public.staff_clock_attempts (
      teacher_id, action_type, attempted_at, request_ip, accepted, verification_result
    ) values (
      p_actor_id, 'sign_in', v_now, p_request_ip, false, v_denial
    );
    if v_denial = 'denied_unauthorised_network' then
      perform app_private.staff_time_add_network_incidence(
        p_actor_id, v_work_date,
        'A clock-in attempt could not be verified against an authorised network.'
      );
    end if;
    return jsonb_build_object('ok', false, 'reason', v_denial);
  end if;

  insert into public.staff_clock_sessions (
    teacher_id, work_date, clocking_mode, opened_at
  ) values (
    p_actor_id, v_work_date, v_mode, v_now
  ) returning * into v_session;

  insert into public.staff_clock_events (
    session_id, teacher_id, event_type, occurred_at, request_ip,
    verification_result, allowed_network_id
  ) values (
    v_session.id, p_actor_id, 'sign_in', v_now, p_request_ip,
    v_verification, v_network_id
  ) returning * into v_event;

  insert into public.staff_clock_attempts (
    teacher_id, session_id, event_id, action_type, attempted_at,
    request_ip, accepted, verification_result
  ) values (
    p_actor_id, v_session.id, v_event.id, 'sign_in', v_now,
    p_request_ip, true, v_verification
  );

  update public.staff_time_incidences
  set status = 'resolved', resolved_at = v_now,
      resolution_note = 'Resolved by a later verified sign-in.'
  where teacher_id = p_actor_id and work_date = v_work_date
    and incidence_type = 'missing_sign_in' and status = 'open';

  return jsonb_build_object(
    'ok', true,
    'session_id', v_session.id,
    'occurred_at', v_now,
    'clocking_mode', v_mode,
    'verification_result', v_verification
  );
end;
$$;

create or replace function public.staff_clock_out(
  p_actor_id uuid,
  p_request_ip inet
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_action_date date;
  v_employment public.staff_time_employment_records;
  v_session public.staff_clock_sessions;
  v_remote boolean := false;
  v_network_id uuid;
  v_mode text;
  v_verification text;
  v_event public.staff_clock_events;
  v_denial text;
begin
  perform app_private.staff_time_require_teacher(p_actor_id);
  if p_request_ip is null then
    raise exception 'A server-detected request IP is required.' using errcode = '22023';
  end if;
  v_action_date := (v_now at time zone 'Europe/Madrid')::date;
  perform pg_advisory_xact_lock(hashtextextended(p_actor_id::text, 0));

  select * into v_session
  from public.staff_clock_sessions
  where teacher_id = p_actor_id and closed_at is null
  order by opened_at desc
  limit 1
  for update;

  select * into v_employment
  from public.staff_time_employment_records employment
  where employment.teacher_id = p_actor_id
    and employment.effective_from <= v_action_date
    and (employment.effective_to is null or employment.effective_to >= v_action_date)
  order by employment.effective_from desc
  limit 1;

  if v_session.id is null then
    v_denial := 'denied_no_open_session';
  elsif v_employment.id is null then
    v_denial := 'denied_no_employment_record';
  elsif not v_employment.time_recording_enabled then
    v_denial := 'denied_recording_disabled';
  else
    select exists (
      select 1 from public.staff_remote_work_authorisations remote
      where remote.teacher_id = p_actor_id
        and remote.revoked_at is null
        and v_action_date between remote.start_date and remote.end_date
    ) into v_remote;
    if v_employment.clocking_location_policy = 'school_or_authorised_remote'
      and v_remote
    then
      v_mode := 'authorised_remote';
      v_verification := 'authorised_remote';
    else
      select network.id into v_network_id
      from public.staff_allowed_networks network
      where network.active and p_request_ip <<= network.network
      order by masklen(network.network) desc
      limit 1;
      if v_network_id is null then
        v_denial := 'denied_unauthorised_network';
      else
        v_mode := 'school_network';
        v_verification := 'verified_school_network';
      end if;
    end if;
  end if;

  if v_denial is not null then
    insert into public.staff_clock_attempts (
      teacher_id, session_id, action_type, attempted_at, request_ip,
      accepted, verification_result
    ) values (
      p_actor_id, v_session.id, 'sign_out', v_now, p_request_ip,
      false, v_denial
    );
    if v_denial = 'denied_unauthorised_network' then
      perform app_private.staff_time_add_network_incidence(
        p_actor_id, coalesce(v_session.work_date, v_action_date),
        'A clock-out attempt could not be verified against an authorised network.'
      );
    end if;
    return jsonb_build_object('ok', false, 'reason', v_denial);
  end if;

  update public.staff_clock_sessions
  set closed_at = v_now
  where id = v_session.id;

  insert into public.staff_clock_events (
    session_id, teacher_id, event_type, occurred_at, request_ip,
    verification_result, allowed_network_id
  ) values (
    v_session.id, p_actor_id, 'sign_out', v_now, p_request_ip,
    v_verification, v_network_id
  ) returning * into v_event;

  insert into public.staff_clock_attempts (
    teacher_id, session_id, event_id, action_type, attempted_at,
    request_ip, accepted, verification_result
  ) values (
    p_actor_id, v_session.id, v_event.id, 'sign_out', v_now,
    p_request_ip, true, v_verification
  );

  update public.staff_time_incidences
  set status = 'resolved', resolved_at = v_now,
      resolution_note = 'Resolved by a later verified sign-out.'
  where teacher_id = p_actor_id and session_id = v_session.id
    and incidence_type = 'missing_sign_out' and status = 'open';

  return jsonb_build_object(
    'ok', true,
    'session_id', v_session.id,
    'occurred_at', v_now,
    'clocking_mode', v_mode,
    'verification_result', v_verification
  );
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
      raise exception 'The selected session does not belong to this Teacher and work date.'
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
  if not exists (select 1 from public.profiles where id = p_teacher_id and role = 'teacher') then
    raise exception 'The selected Teacher was not found.' using errcode = '22023';
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
      raise exception 'The selected session does not match this Teacher and work date.'
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
  v_result public.staff_time_corrections;
begin
  perform app_private.staff_time_require_admin(p_actor_id);
  if p_decision not in ('approved', 'rejected') then
    raise exception 'Choose Approve or Reject.' using errcode = '22023';
  end if;
  update public.staff_time_corrections
  set status = p_decision, reviewed_by = p_actor_id, reviewed_at = now(),
      review_note = nullif(btrim(p_review_note), '')
  where id = p_correction_id and status = 'pending'
  returning * into v_result;
  if v_result.id is null then
    raise exception 'The correction is no longer pending.' using errcode = 'P0002';
  end if;

  if p_decision = 'approved' then
    update public.staff_time_incidences
    set status = 'resolved', resolved_by = p_actor_id, resolved_at = now(),
        correction_id = v_result.id,
        resolution_note = 'Resolved by an approved Teacher correction.'
    where teacher_id = v_result.teacher_id and work_date = v_result.work_date
      and status = 'open'
      and incidence_type in ('missing_sign_in', 'missing_sign_out');
  end if;
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
  v_teacher record;
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

    for v_teacher in
      select employment.teacher_id, schedule.id as schedule_id
      from public.staff_time_employment_records employment
      join public.staff_work_schedules schedule
        on schedule.teacher_id = employment.teacher_id
        and schedule.effective_from <= v_date
        and (schedule.effective_to is null or schedule.effective_to >= v_date)
      where employment.effective_from <= v_date
        and (employment.effective_to is null or employment.effective_to >= v_date)
        and employment.time_recording_enabled
    loop
      select max(interval.end_time) into v_last_end
      from public.staff_work_schedule_intervals interval
      where interval.schedule_id = v_teacher.schedule_id
        and interval.weekday = extract(isodow from v_date)::smallint;
      if v_last_end is null then
        continue;
      end if;

      if (
        v_date < v_today
        or v_now_local > (v_date + v_last_end + interval '60 minutes')
      ) and not exists (
        select 1 from public.staff_clock_sessions session
        where session.teacher_id = v_teacher.teacher_id and session.work_date = v_date
      ) and not exists (
        select 1 from public.staff_time_corrections correction
        where correction.teacher_id = v_teacher.teacher_id
          and correction.work_date = v_date and correction.status = 'approved'
          and correction.requested_sign_in_at is not null
      ) then
        insert into public.staff_time_incidences (
          teacher_id, work_date, incidence_type, source, description
        ) values (
          v_teacher.teacher_id, v_date, 'missing_sign_in', 'automatic',
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
      where session.teacher_id = v_teacher.teacher_id
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

create or replace function app_private.staff_time_dismiss_closure_incidences()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
begin
  update public.staff_time_incidences
  set status = 'dismissed', resolved_at = now(),
      resolution_note = 'School Closure overrides the planned work obligation.'
  where work_date between new.start_date and new.end_date
    and status = 'open' and source = 'automatic'
    and incidence_type in ('missing_sign_in', 'missing_sign_out');
  return null;
end;
$$;

create trigger school_closures_dismiss_staff_time_incidences
after insert or update on public.school_closures
for each row execute function app_private.staff_time_dismiss_closure_incidences();

alter table public.staff_time_company_settings enable row level security;
alter table public.staff_time_employment_records enable row level security;
alter table public.staff_work_schedules enable row level security;
alter table public.staff_work_schedule_intervals enable row level security;
alter table public.staff_allowed_networks enable row level security;
alter table public.staff_remote_work_authorisations enable row level security;
alter table public.staff_clock_sessions enable row level security;
alter table public.staff_clock_events enable row level security;
alter table public.staff_clock_attempts enable row level security;
alter table public.staff_time_corrections enable row level security;
alter table public.staff_time_incidences enable row level security;

revoke all on table public.staff_time_company_settings from anon, authenticated;
revoke all on table public.staff_time_employment_records from anon, authenticated;
revoke all on table public.staff_work_schedules from anon, authenticated;
revoke all on table public.staff_work_schedule_intervals from anon, authenticated;
revoke all on table public.staff_allowed_networks from anon, authenticated;
revoke all on table public.staff_remote_work_authorisations from anon, authenticated;
revoke all on table public.staff_clock_sessions from anon, authenticated;
revoke all on table public.staff_clock_events from anon, authenticated;
revoke all on table public.staff_clock_attempts from anon, authenticated;
revoke all on table public.staff_time_corrections from anon, authenticated;
revoke all on table public.staff_time_incidences from anon, authenticated;

grant select, insert, update on table public.staff_time_company_settings to service_role;
grant select, insert, update on table public.staff_time_employment_records to service_role;
grant select, insert, update on table public.staff_work_schedules to service_role;
grant select, insert on table public.staff_work_schedule_intervals to service_role;
grant select, insert, update on table public.staff_allowed_networks to service_role;
grant select, insert, update on table public.staff_remote_work_authorisations to service_role;
grant select, insert, update on table public.staff_clock_sessions to service_role;
grant select, insert on table public.staff_clock_events to service_role;
grant select, insert on table public.staff_clock_attempts to service_role;
grant select, insert, update on table public.staff_time_corrections to service_role;
grant select, insert, update on table public.staff_time_incidences to service_role;

revoke all on function app_private.staff_time_require_admin(uuid) from public, anon, authenticated;
revoke all on function app_private.staff_time_require_teacher(uuid) from public, anon, authenticated;
revoke all on function app_private.staff_time_reject_delete() from public, anon, authenticated;
revoke all on function app_private.staff_time_reject_change() from public, anon, authenticated;
revoke all on function app_private.staff_time_close_effective_record() from public, anon, authenticated;
revoke all on function app_private.staff_time_check_schedule_interval_overlap() from public, anon, authenticated;
revoke all on function app_private.staff_time_touch_network() from public, anon, authenticated;
revoke all on function app_private.staff_time_protect_remote_authorisation() from public, anon, authenticated;
revoke all on function app_private.staff_time_protect_session() from public, anon, authenticated;
revoke all on function app_private.staff_time_protect_correction() from public, anon, authenticated;
revoke all on function app_private.staff_time_protect_incidence() from public, anon, authenticated;
revoke all on function app_private.staff_time_add_network_incidence(uuid, date, text) from public, anon, authenticated;
revoke all on function app_private.staff_time_dismiss_closure_incidences() from public, anon, authenticated;

revoke all on function public.save_staff_time_company_settings(
  uuid, date, text, text, text, text, text, text, text, text
) from public, anon, authenticated;
revoke all on function public.save_staff_time_employment_record(
  uuid, uuid, date, text, text, text, numeric, boolean, text
) from public, anon, authenticated;
revoke all on function public.save_staff_work_schedule(
  uuid, uuid, date, text, jsonb
) from public, anon, authenticated;
revoke all on function public.staff_clock_in(uuid, inet) from public, anon, authenticated;
revoke all on function public.staff_match_allowed_network(inet) from public, anon, authenticated;
revoke all on function public.staff_clock_out(uuid, inet) from public, anon, authenticated;
revoke all on function public.staff_submit_time_correction(
  uuid, date, uuid, timestamptz, timestamptz, text, text
) from public, anon, authenticated;
revoke all on function public.staff_admin_create_time_correction(
  uuid, uuid, date, uuid, timestamptz, timestamptz, text
) from public, anon, authenticated;
revoke all on function public.staff_review_time_correction(
  uuid, uuid, text, text
) from public, anon, authenticated;
revoke all on function public.refresh_staff_time_incidences(
  uuid, date, date
) from public, anon, authenticated;

grant execute on function public.save_staff_time_company_settings(
  uuid, date, text, text, text, text, text, text, text, text
) to service_role;
grant execute on function public.save_staff_time_employment_record(
  uuid, uuid, date, text, text, text, numeric, boolean, text
) to service_role;
grant execute on function public.save_staff_work_schedule(
  uuid, uuid, date, text, jsonb
) to service_role;
grant execute on function public.staff_clock_in(uuid, inet) to service_role;
grant execute on function public.staff_match_allowed_network(inet) to service_role;
grant execute on function public.staff_clock_out(uuid, inet) to service_role;
grant execute on function public.staff_submit_time_correction(
  uuid, date, uuid, timestamptz, timestamptz, text, text
) to service_role;
grant execute on function public.staff_admin_create_time_correction(
  uuid, uuid, date, uuid, timestamptz, timestamptz, text
) to service_role;
grant execute on function public.staff_review_time_correction(
  uuid, uuid, text, text
) to service_role;
grant execute on function public.refresh_staff_time_incidences(
  uuid, date, date
) to service_role;

comment on table public.staff_clock_events is
  'Append-only original server-timestamped sign-in and sign-out events. Corrections never update these rows.';
comment on table public.staff_clock_attempts is
  'Append-only audit of accepted and rejected clock actions, including the server-observed request IP.';
comment on table public.staff_time_corrections is
  'Audited correction requests and decisions. Approved values are effective for reports without replacing originals.';
comment on table public.staff_time_incidences is
  'Non-punitive operational queue for missing clock actions and clocking problems.';

commit;
