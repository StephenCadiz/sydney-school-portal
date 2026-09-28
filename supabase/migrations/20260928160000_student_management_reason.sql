begin;

-- Student Management keeps the existing dated enrolment transaction and adds
-- an explicit, auditable reason without changing historical enrolment rows.
alter table public.class_enrolment_period_events
  add column if not exists reason text;

alter table public.class_enrolment_period_events
  drop constraint if exists class_enrolment_period_events_reason_length;
alter table public.class_enrolment_period_events
  add constraint class_enrolment_period_events_reason_length
  check (reason is null or char_length(btrim(reason)) between 1 and 500);

create or replace function public.manage_class_enrolment_period_with_reason(
  p_actor_id uuid,
  p_student_type text,
  p_student_id uuid,
  p_action text,
  p_class_id uuid,
  p_starts_on date,
  p_ends_before date,
  p_period_id uuid,
  p_reason text
) returns uuid
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_period_id uuid;
begin
  if auth.role() is distinct from 'service_role'
     or not exists (
       select 1 from public.profiles
       where id = p_actor_id and role = 'admin' and active is distinct from false
     ) then
    raise exception 'Admin access required.' using errcode = '42501';
  end if;
  if p_reason is not null and char_length(btrim(p_reason)) not between 1 and 500 then
    raise exception 'Provide a reason of no more than 500 characters.' using errcode = '22023';
  end if;
  if p_action = 'withdraw' and nullif(btrim(coalesce(p_reason, '')), '') is null then
    raise exception 'A withdrawal reason is required.' using errcode = '22023';
  end if;

  v_period_id := public.manage_class_enrolment_period(
    p_actor_id, p_student_type, p_student_id, p_action,
    p_class_id, p_starts_on, p_ends_before, p_period_id
  );

  update public.class_enrolment_period_events
  set reason = nullif(btrim(p_reason), '')
  where id = (
    select event.id
    from public.class_enrolment_period_events event
    where event.period_id = v_period_id
      and event.actor_id = p_actor_id
      and event.action = p_action
    order by event.created_at desc, event.id desc
    limit 1
  );

  return v_period_id;
end;
$$;

alter function public.manage_class_enrolment_period_with_reason(uuid,text,uuid,text,uuid,date,date,uuid,text) owner to postgres;
revoke all on function public.manage_class_enrolment_period_with_reason(uuid,text,uuid,text,uuid,date,date,uuid,text)
  from public, anon, authenticated, service_role;
grant execute on function public.manage_class_enrolment_period_with_reason(uuid,text,uuid,text,uuid,date,date,uuid,text)
  to service_role;

commit;
