begin;

create table if not exists public.attendance_alerts (
  id uuid primary key default gen_random_uuid(),
  alert_type text not null,
  class_id uuid not null
    references public.classes(id) on delete cascade,
  student_type text not null,
  profile_student_id uuid
    references public.profiles(id) on delete cascade,
  young_learner_id uuid
    references public.young_learners(id) on delete cascade,
  condition_active boolean not null default true,
  triggered_at timestamptz not null default now(),
  resolved_at timestamptz,
  dealt_with_at timestamptz,
  dealt_with_by uuid
    references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint attendance_alerts_type_check
    check (alert_type in ('consecutive_absence', 'low_attendance')),
  constraint attendance_alerts_student_type_check
    check (student_type in ('profile', 'young_learner')),
  constraint attendance_alerts_identity_check
    check (
      (
        student_type = 'profile'
        and profile_student_id is not null
        and young_learner_id is null
      )
      or (
        student_type = 'young_learner'
        and profile_student_id is null
        and young_learner_id is not null
      )
    ),
  constraint attendance_alerts_resolution_check
    check (
      (condition_active and resolved_at is null)
      or (not condition_active and resolved_at is not null)
    )
);

create unique index if not exists attendance_alerts_active_profile_episode_key
on public.attendance_alerts (
  alert_type,
  class_id,
  profile_student_id
)
where condition_active and profile_student_id is not null;

create unique index if not exists attendance_alerts_active_young_learner_episode_key
on public.attendance_alerts (
  alert_type,
  class_id,
  young_learner_id
)
where condition_active and young_learner_id is not null;

create index if not exists attendance_alerts_unresolved_queue_idx
on public.attendance_alerts (triggered_at, alert_type)
where condition_active and dealt_with_at is null;

create index if not exists attendance_alerts_class_idx
on public.attendance_alerts (class_id, condition_active, alert_type);

create index if not exists attendance_alerts_profile_student_idx
on public.attendance_alerts (profile_student_id, triggered_at desc)
where profile_student_id is not null;

create index if not exists attendance_alerts_young_learner_idx
on public.attendance_alerts (young_learner_id, triggered_at desc)
where young_learner_id is not null;

create index if not exists attendance_alerts_dealt_with_idx
on public.attendance_alerts (dealt_with_at, condition_active);

create index if not exists attendance_alerts_type_status_idx
on public.attendance_alerts (alert_type, condition_active, dealt_with_at);

comment on table public.attendance_alerts is
  'Historical Admin alert episodes derived from completed Class Register entries.';

comment on column public.attendance_alerts.condition_active is
  'True while the underlying class-scoped attendance condition remains active. Dealt With does not resolve the condition.';

comment on column public.attendance_alerts.dealt_with_at is
  'Records Admin follow-up without modifying or resolving the underlying attendance condition.';

create or replace function app_private.set_attendance_alert_updated_at()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke all on function app_private.set_attendance_alert_updated_at()
from public, anon, authenticated;

drop trigger if exists attendance_alerts_set_updated_at
on public.attendance_alerts;

create trigger attendance_alerts_set_updated_at
before update on public.attendance_alerts
for each row
execute function app_private.set_attendance_alert_updated_at();

create or replace function app_private.sync_attendance_alert_episode(
  p_class_id uuid,
  p_alert_type text,
  p_student_type text,
  p_profile_student_id uuid,
  p_young_learner_id uuid,
  p_condition_active boolean
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
begin
  if p_alert_type not in ('consecutive_absence', 'low_attendance') then
    raise exception 'Invalid attendance alert type';
  end if;

  if not (
    (
      p_student_type = 'profile'
      and p_profile_student_id is not null
      and p_young_learner_id is null
    )
    or (
      p_student_type = 'young_learner'
      and p_profile_student_id is null
      and p_young_learner_id is not null
    )
  ) then
    raise exception 'Invalid attendance alert student identity';
  end if;

  if p_condition_active then
    insert into public.attendance_alerts (
      alert_type,
      class_id,
      student_type,
      profile_student_id,
      young_learner_id,
      condition_active
    )
    select
      p_alert_type,
      p_class_id,
      p_student_type,
      p_profile_student_id,
      p_young_learner_id,
      true
    where not exists (
      select 1
      from public.attendance_alerts alert
      where alert.alert_type = p_alert_type
        and alert.class_id = p_class_id
        and alert.student_type = p_student_type
        and alert.profile_student_id is not distinct from p_profile_student_id
        and alert.young_learner_id is not distinct from p_young_learner_id
        and alert.condition_active
    )
    on conflict do nothing;
  else
    update public.attendance_alerts alert
    set
      condition_active = false,
      resolved_at = coalesce(alert.resolved_at, now())
    where alert.alert_type = p_alert_type
      and alert.class_id = p_class_id
      and alert.student_type = p_student_type
      and alert.profile_student_id is not distinct from p_profile_student_id
      and alert.young_learner_id is not distinct from p_young_learner_id
      and alert.condition_active;
  end if;
end;
$$;

revoke all on function app_private.sync_attendance_alert_episode(
  uuid,
  text,
  text,
  uuid,
  uuid,
  boolean
) from public, anon, authenticated;

create or replace function app_private.reconcile_attendance_alerts_for_student(
  p_class_id uuid,
  p_student_type text,
  p_profile_student_id uuid,
  p_young_learner_id uuid
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_present_count integer := 0;
  v_absent_count integer := 0;
  v_total_count integer := 0;
  v_consecutive_absence boolean := false;
  v_low_attendance boolean := false;
begin
  if not (
    (
      p_student_type = 'profile'
      and p_profile_student_id is not null
      and p_young_learner_id is null
    )
    or (
      p_student_type = 'young_learner'
      and p_profile_student_id is null
      and p_young_learner_id is not null
    )
  ) then
    raise exception 'Invalid attendance alert student identity';
  end if;

  with ordered_attendance as (
    select
      entry.attendance_status,
      row_number() over (
        order by
          register.lesson_date desc,
          register.scheduled_start_time desc,
          register.id desc
      ) as attendance_position
    from public.class_register_entries entry
    inner join public.class_registers register
      on register.id = entry.register_id
    where register.class_id = p_class_id
      and register.completed_at is not null
      and entry.attendance_status in ('present', 'absent')
      and entry.student_type = p_student_type
      and entry.profile_student_id is not distinct from p_profile_student_id
      and entry.young_learner_id is not distinct from p_young_learner_id
  )
  select
    count(*) = 2
    and count(*) filter (where attendance_status = 'absent') = 2
  into v_consecutive_absence
  from ordered_attendance
  where attendance_position <= 2;

  select
    count(*) filter (where entry.attendance_status = 'present'),
    count(*) filter (where entry.attendance_status = 'absent')
  into v_present_count, v_absent_count
  from public.class_register_entries entry
  inner join public.class_registers register
    on register.id = entry.register_id
  where register.class_id = p_class_id
    and register.completed_at is not null
    and entry.attendance_status in ('present', 'absent')
    and entry.student_type = p_student_type
    and entry.profile_student_id is not distinct from p_profile_student_id
    and entry.young_learner_id is not distinct from p_young_learner_id;

  v_total_count := v_present_count + v_absent_count;
  v_low_attendance := case
    when v_total_count >= 15
      then (v_present_count::numeric * 100 / v_total_count) < 70
    else false
  end;

  perform app_private.sync_attendance_alert_episode(
    p_class_id,
    'consecutive_absence',
    p_student_type,
    p_profile_student_id,
    p_young_learner_id,
    v_consecutive_absence
  );

  perform app_private.sync_attendance_alert_episode(
    p_class_id,
    'low_attendance',
    p_student_type,
    p_profile_student_id,
    p_young_learner_id,
    v_low_attendance
  );
end;
$$;

revoke all on function app_private.reconcile_attendance_alerts_for_student(
  uuid,
  text,
  uuid,
  uuid
) from public, anon, authenticated;

create or replace function app_private.reconcile_attendance_entry_alerts()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_class_id uuid;
  v_completed_at timestamptz;
begin
  select register.class_id, register.completed_at
  into v_class_id, v_completed_at
  from public.class_registers register
  where register.id = new.register_id;

  if v_completed_at is not null then
    perform app_private.reconcile_attendance_alerts_for_student(
      v_class_id,
      new.student_type,
      new.profile_student_id,
      new.young_learner_id
    );
  end if;

  return new;
end;
$$;

revoke all on function app_private.reconcile_attendance_entry_alerts()
from public, anon, authenticated;

drop trigger if exists class_register_entries_reconcile_alerts
on public.class_register_entries;

create trigger class_register_entries_reconcile_alerts
after update of attendance_status on public.class_register_entries
for each row
when (old.attendance_status is distinct from new.attendance_status)
execute function app_private.reconcile_attendance_entry_alerts();

create or replace function app_private.reconcile_completed_register_alerts()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_entry record;
begin
  if new.completed_at is not null and old.completed_at is null then
    for v_entry in
      select
        entry.student_type,
        entry.profile_student_id,
        entry.young_learner_id
      from public.class_register_entries entry
      where entry.register_id = new.id
    loop
      perform app_private.reconcile_attendance_alerts_for_student(
        new.class_id,
        v_entry.student_type,
        v_entry.profile_student_id,
        v_entry.young_learner_id
      );
    end loop;
  end if;

  return new;
end;
$$;

revoke all on function app_private.reconcile_completed_register_alerts()
from public, anon, authenticated;

drop trigger if exists class_registers_reconcile_alerts
on public.class_registers;

create trigger class_registers_reconcile_alerts
after update of completed_at on public.class_registers
for each row
when (old.completed_at is distinct from new.completed_at)
execute function app_private.reconcile_completed_register_alerts();

do $$
declare
  v_student record;
begin
  for v_student in
    select distinct
      register.class_id,
      entry.student_type,
      entry.profile_student_id,
      entry.young_learner_id
    from public.class_register_entries entry
    inner join public.class_registers register
      on register.id = entry.register_id
    where register.completed_at is not null
      and entry.attendance_status in ('present', 'absent')
  loop
    perform app_private.reconcile_attendance_alerts_for_student(
      v_student.class_id,
      v_student.student_type,
      v_student.profile_student_id,
      v_student.young_learner_id
    );
  end loop;
end;
$$;

alter table public.attendance_alerts enable row level security;

revoke all on table public.attendance_alerts from anon, authenticated;
grant all on table public.attendance_alerts to service_role;

commit;
