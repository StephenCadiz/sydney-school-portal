-- Alternative effective dates for standard classes.  This migration is prepared
-- for review and must be applied through the normal Supabase release process.
begin;
set local search_path = pg_catalog, public, extensions;

-- A missing side inherits the selected academic-term boundary.  Express and
-- Intensive classes continue to use their explicit course dates.
alter table public.classes drop constraint if exists classes_course_dates_pair_check;

create table if not exists public.class_date_change_events (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes(id) on delete restrict,
  actor_id uuid not null references public.profiles(id) on delete restrict,
  previous_start_date date,
  previous_end_date date,
  new_start_date date,
  new_end_date date,
  affected_enrolments integer not null default 0 check (affected_enrolments >= 0),
  created_at timestamptz not null default now()
);
alter table public.class_date_change_events owner to postgres;
alter table public.class_date_change_events enable row level security;
revoke all on public.class_date_change_events from public, anon, authenticated, service_role;
grant select on public.class_date_change_events to service_role;
create index if not exists class_date_change_events_class_idx
  on public.class_date_change_events(class_id, created_at desc);

create or replace function app_private.class_date_is_current(p_class_id uuid,p_date date)
returns boolean language sql stable security definer
set search_path = pg_catalog, pg_temp
as $$
  select coalesce((select p_date between
    coalesce(c.start_date, y.start_date)
    and coalesce(c.end_date, y.end_date)
    from public.classes c
    left join public.academic_years y on y.id = c.academic_year_id
    where c.id = p_class_id), false);
$$;
alter function app_private.class_date_is_current(uuid,date) owner to postgres;
revoke all on function app_private.class_date_is_current(uuid,date) from public, anon;
grant execute on function app_private.class_date_is_current(uuid,date) to authenticated, service_role;

create or replace function public.manage_class_enrolment_period_effective(
  p_actor_id uuid, p_student_type text, p_student_id uuid, p_action text,
  p_class_id uuid, p_starts_on date, p_ends_before date, p_period_id uuid
) returns uuid language plpgsql security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_old public.class_enrolment_periods%rowtype;
  v_new public.class_enrolment_periods%rowtype;
  v_class public.classes%rowtype;
  v_year public.academic_years%rowtype;
  v_start date;
  v_end date;
begin
  if auth.role() is distinct from 'service_role' or not exists (
    select 1 from public.profiles where id = p_actor_id and role = 'admin' and active is distinct from false
  ) then
    raise exception 'Admin access required.' using errcode='42501';
  end if;
  if p_student_type not in ('profile','young_learner') or p_student_id is null
     or p_action not in ('enrol','transfer','withdraw','correct','cancel') then
    raise exception 'Invalid enrolment operation.' using errcode='22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('class-enrolment:' || p_student_type || ':' || p_student_id::text,0));
  if (p_student_type='profile' and not exists(select 1 from public.profiles where id=p_student_id and role='student'))
     or (p_student_type='young_learner' and not exists(select 1 from public.young_learners where id=p_student_id)) then
    raise exception 'Student was not found.' using errcode='22023';
  end if;
  if p_action <> 'enrol' then
    select * into v_old from public.class_enrolment_periods
      where id=p_period_id and student_type=p_student_type and student_id=p_student_id for update;
    if not found then raise exception 'Enrolment period was not found.' using errcode='22023'; end if;
  elsif p_period_id is not null then
    raise exception 'A new enrolment must not reuse a period.' using errcode='22023';
  end if;
  perform id from public.classes where id=p_class_id or id=v_old.class_id order by id for update;
  if p_action in ('withdraw','correct','cancel') and p_class_id is distinct from v_old.class_id then
    raise exception 'This operation cannot change the class.' using errcode='22023';
  end if;
  if v_old.cancelled_at is not null then
    if p_action='cancel' then return v_old.id; end if;
    raise exception 'A cancelled period is immutable; create a new enrolment.' using errcode='22023';
  end if;

  if p_action='cancel' then
    if v_old.starts_on <= (now() at time zone 'Europe/Madrid')::date
       or p_starts_on is distinct from v_old.starts_on
       or p_ends_before is distinct from v_old.ends_before then
      raise exception 'Only a never-effective future period can be cancelled.' using errcode='22023';
    end if;
    update public.class_enrolment_periods set cancelled_at=now(),cancelled_by=p_actor_id
      where id=v_old.id returning * into v_new;
  elsif p_action='withdraw' then
    if p_starts_on is distinct from v_old.starts_on or p_ends_before is null
       or p_ends_before <= v_old.starts_on
       or (v_old.ends_before is not null and p_ends_before > v_old.ends_before) then
      raise exception 'Choose a valid first non-enrolled day after the start.' using errcode='22023';
    end if;
    update public.class_enrolment_periods set ends_before=p_ends_before
      where id=v_old.id returning * into v_new;
  else
    select * into v_class from public.classes where id=p_class_id;
    if not found or coalesce(v_class.is_cambridge,false) <> (p_student_type='profile') then
      raise exception 'The class is not compatible with this student type.' using errcode='22023';
    end if;
    if lower(trim(coalesce(v_class.course_type,'regular'))) not in ('intensive','express')
       and v_class.academic_year_id is null then
      raise exception 'Assign an academic year before enrolling a student.' using errcode='22023';
    end if;
    select * into v_year from public.academic_years where id=v_class.academic_year_id;
    if lower(trim(coalesce(v_class.course_type,'regular'))) in ('intensive','express') then
      v_start := v_class.start_date; v_end := v_class.end_date;
    else
      v_start := coalesce(v_class.start_date, v_year.start_date);
      v_end := coalesce(v_class.end_date, v_year.end_date);
    end if;
    if p_starts_on is null or v_start is null or v_end is null or v_end < v_start
       or p_starts_on < v_start or p_starts_on > v_end
       or (p_ends_before is not null and (p_ends_before <= p_starts_on or p_ends_before > v_end + 1)) then
      raise exception 'Enrolment dates must be inside the effective class dates.' using errcode='22023';
    end if;
    if p_action='transfer' then
      if p_class_id=v_old.class_id or p_starts_on <= v_old.starts_on
         or (v_old.ends_before is not null and p_starts_on > v_old.ends_before) then
        raise exception 'The transfer must close an existing period and open a different class on the same date.' using errcode='22023';
      end if;
      update public.class_enrolment_periods set ends_before=p_starts_on where id=v_old.id returning * into v_new;
      insert into public.class_enrolment_period_events(period_id,actor_id,action,previous_period,resulting_period)
        values(v_old.id,p_actor_id,'transfer',to_jsonb(v_old),to_jsonb(v_new));
    elsif p_action='correct' then
      update public.class_enrolment_periods set starts_on=p_starts_on,ends_before=p_ends_before
        where id=v_old.id returning * into v_new;
    else
      insert into public.class_enrolment_periods(class_id,student_type,profile_student_id,young_learner_id,starts_on,ends_before,created_by)
        values(p_class_id,p_student_type,case when p_student_type='profile' then p_student_id end,
          case when p_student_type='young_learner' then p_student_id end,p_starts_on,p_ends_before,p_actor_id)
        returning * into v_new;
    end if;
  end if;
  if exists (
    select 1 from public.class_enrolment_periods other
    where other.student_type=p_student_type and other.student_id=p_student_id
      and other.cancelled_at is null and other.id <> v_new.id
      and daterange(other.starts_on,other.ends_before,'[)') && daterange(v_new.starts_on,v_new.ends_before,'[)')
  ) then
    raise exception 'Use a transfer or close the overlapping class period first.' using errcode='23P01';
  end if;
  insert into public.class_enrolment_period_events(period_id,actor_id,action,previous_period,resulting_period)
    values(v_new.id,p_actor_id,p_action,case when p_action in ('withdraw','correct','cancel') then to_jsonb(v_old) end,to_jsonb(v_new));
  if p_student_type='profile' then
    insert into public.class_enrolments(student_id,class_id,enrolled_at,active)
      values(p_student_id,v_new.class_id,v_new.starts_on,true) on conflict(student_id,class_id) do nothing;
  else
    insert into public.young_learner_enrolments(young_learner_id,class_id,enrolled_at)
      values(p_student_id,v_new.class_id,v_new.starts_on) on conflict(young_learner_id,class_id) do nothing;
  end if;
  if v_old.id is not null then
    perform app_private.reconcile_attendance_alerts_for_student(v_old.class_id,p_student_type,v_old.profile_student_id,v_old.young_learner_id);
  end if;
  if v_old.class_id is distinct from v_new.class_id then
    perform app_private.reconcile_attendance_alerts_for_student(v_new.class_id,p_student_type,v_new.profile_student_id,v_new.young_learner_id);
  end if;
  return v_new.id;
end;
$$;
alter function public.manage_class_enrolment_period_effective(uuid,text,uuid,text,uuid,date,date,uuid) owner to postgres;
revoke all on function public.manage_class_enrolment_period_effective(uuid,text,uuid,text,uuid,date,date,uuid) from public, anon, authenticated, service_role;
grant execute on function public.manage_class_enrolment_period_effective(uuid,text,uuid,text,uuid,date,date,uuid) to service_role;

create or replace function public.manage_class_enrolment_period_with_reason(
  p_actor_id uuid,p_student_type text,p_student_id uuid,p_action text,p_class_id uuid,
  p_starts_on date,p_ends_before date,p_period_id uuid,p_reason text
) returns uuid language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare v_period_id uuid;
begin
  if auth.role() is distinct from 'service_role' or not exists(select 1 from public.profiles where id=p_actor_id and role='admin' and active is distinct from false)
    then raise exception 'Admin access required.' using errcode='42501'; end if;
  if p_reason is not null and char_length(btrim(p_reason)) not between 1 and 500 then
    raise exception 'Provide a reason of no more than 500 characters.' using errcode='22023'; end if;
  if p_action='withdraw' and nullif(btrim(coalesce(p_reason,'')),'') is null then
    raise exception 'A withdrawal reason is required.' using errcode='22023'; end if;
  v_period_id := public.manage_class_enrolment_period_effective(p_actor_id,p_student_type,p_student_id,p_action,p_class_id,p_starts_on,p_ends_before,p_period_id);
  update public.class_enrolment_period_events set reason=nullif(btrim(p_reason),'') where id=(
    select event.id from public.class_enrolment_period_events event
    where event.period_id=v_period_id and event.actor_id=p_actor_id and event.action=p_action
    order by event.created_at desc,event.id desc limit 1);
  return v_period_id;
end;
$$;
alter function public.manage_class_enrolment_period_with_reason(uuid,text,uuid,text,uuid,date,date,uuid,text) owner to postgres;
revoke all on function public.manage_class_enrolment_period_with_reason(uuid,text,uuid,text,uuid,date,date,uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.manage_class_enrolment_period_with_reason(uuid,text,uuid,text,uuid,date,date,uuid,text) to service_role;

create or replace function public.create_young_learner_enrolments_effective(
  p_actor_id uuid,p_class_id uuid,p_starts_on date,p_students jsonb
) returns integer language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare v_student jsonb; v_id uuid; v_count integer:=0;
begin
  if auth.role() is distinct from 'service_role' or not exists(select 1 from public.profiles where id=p_actor_id and role='admin' and active is distinct from false)
    then raise exception 'Admin access required.' using errcode='42501'; end if;
  if jsonb_typeof(p_students) is distinct from 'array' or jsonb_array_length(p_students) not between 1 and 100 then
    raise exception 'Provide between one and 100 students.' using errcode='22023'; end if;
  for v_student in select value from jsonb_array_elements(p_students) loop
    if jsonb_typeof(v_student) is distinct from 'object'
      or exists(select 1 from jsonb_object_keys(v_student) k where k not in ('first_name','last_name'))
      or length(trim(coalesce(v_student->>'first_name',''))) not between 1 and 80
      or length(trim(coalesce(v_student->>'last_name',''))) not between 1 and 80 then
      raise exception 'Provide valid student names.' using errcode='22023'; end if;
    insert into public.young_learners(first_name,last_name,class_id,active)
      values(trim(v_student->>'first_name'),trim(v_student->>'last_name'),p_class_id,true) returning id into v_id;
    perform public.manage_class_enrolment_period_effective(p_actor_id,'young_learner',v_id,'enrol',p_class_id,p_starts_on,null,null);
    v_count:=v_count+1;
  end loop;
  return v_count;
end;
$$;
alter function public.create_young_learner_enrolments_effective(uuid,uuid,date,jsonb) owner to postgres;
revoke all on function public.create_young_learner_enrolments_effective(uuid,uuid,date,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.create_young_learner_enrolments_effective(uuid,uuid,date,jsonb) to service_role;

create or replace function public.update_class_with_effective_dates(
  p_actor_id uuid,p_class_id uuid,p_class_name text,p_level_id bigint,p_teacher_id uuid,
  p_classroom_id uuid,p_course_type text,p_days text,p_start_time time,p_end_time time,
  p_meet_link text,p_is_cambridge boolean,p_academic_year_id uuid,p_start_date date,
  p_end_date date,p_confirm_date_impact boolean default false
) returns jsonb language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare
  v_class public.classes%rowtype; v_year public.academic_years%rowtype;
  v_start date; v_end date; v_affected jsonb := '[]'::jsonb; v_count integer := 0;
  v_period public.class_enrolment_periods%rowtype; v_before public.class_enrolment_periods%rowtype; v_new_start date; v_new_end date;
begin
  if auth.role() is distinct from 'service_role' or not exists(select 1 from public.profiles where id=p_actor_id and role='admin' and active is distinct from false)
    then raise exception 'Admin access required.' using errcode='42501'; end if;
  select * into v_class from public.classes where id=p_class_id for update;
  if not found then raise exception 'Class not found.' using errcode='22023'; end if;
  if lower(trim(coalesce(p_course_type,'regular'))) in ('intensive','express') then
    v_start:=p_start_date; v_end:=p_end_date;
  else
    if p_academic_year_id is null then raise exception 'Assign an academic year before saving this class.' using errcode='22023'; end if;
    select * into v_year from public.academic_years where id=p_academic_year_id;
    if not found then raise exception 'Academic year was not found.' using errcode='22023'; end if;
    v_start:=coalesce(p_start_date,v_year.start_date); v_end:=coalesce(p_end_date,v_year.end_date);
  end if;
  if v_start is null or v_end is null or v_end < v_start then
    raise exception 'The effective class start date must not be after the effective end date.' using errcode='22023'; end if;
  for v_period in select * from public.class_enrolment_periods where class_id=p_class_id and cancelled_at is null for update loop
    if v_period.starts_on < v_start or coalesce(v_period.ends_before,v_end+1) > v_end+1 then
      v_count:=v_count+1;
      v_affected:=v_affected || jsonb_build_array(jsonb_build_object('period_id',v_period.id,'student_id',v_period.student_id,'starts_on',v_period.starts_on,'ends_before',v_period.ends_before));
    end if;
  end loop;
  if v_count>0 and not p_confirm_date_impact then
    return jsonb_build_object('requires_confirmation',true,'affected_count',v_count,'affected_enrolments',v_affected);
  end if;
  update public.classes set class_name=p_class_name,level_id=p_level_id,teacher_id=p_teacher_id,classroom_id=p_classroom_id,
    course_type=p_course_type,days=p_days,start_time=p_start_time,end_time=p_end_time,meet_link=p_meet_link,
    is_cambridge=p_is_cambridge,academic_year_id=p_academic_year_id,start_date=p_start_date,end_date=p_end_date
    where id=p_class_id;
  for v_period in select * from public.class_enrolment_periods where class_id=p_class_id and cancelled_at is null for update loop
    v_before:=v_period;
    v_new_start:=greatest(v_period.starts_on,v_start);
    v_new_end:=least(coalesce(v_period.ends_before,v_end+1),v_end+1);
    if v_new_end<=v_new_start then
      update public.class_enrolment_periods set cancelled_at=now(),cancelled_by=p_actor_id where id=v_period.id returning * into v_period;
      insert into public.class_enrolment_period_events(period_id,actor_id,action,previous_period,resulting_period,reason)
        values(v_period.id,p_actor_id,'cancel',to_jsonb(v_before),to_jsonb(v_period),'Class effective dates changed');
    elsif v_new_start is distinct from v_period.starts_on or v_new_end is distinct from v_period.ends_before then
      update public.class_enrolment_periods set starts_on=v_new_start,ends_before=v_new_end-1 where id=v_period.id returning * into v_period;
      insert into public.class_enrolment_period_events(period_id,actor_id,action,previous_period,resulting_period,reason)
        values(v_period.id,p_actor_id,'correct',to_jsonb(v_before),to_jsonb(v_period),'Class effective dates changed');
    end if;
  end loop;
  if v_class.start_date is distinct from p_start_date or v_class.end_date is distinct from p_end_date then
    insert into public.class_date_change_events(class_id,actor_id,previous_start_date,previous_end_date,new_start_date,new_end_date,affected_enrolments)
      values(p_class_id,p_actor_id,v_class.start_date,v_class.end_date,p_start_date,p_end_date,v_count);
  end if;
  return jsonb_build_object('requires_confirmation',false,'affected_count',v_count,'class_id',p_class_id);
end;
$$;
alter function public.update_class_with_effective_dates(uuid,uuid,text,bigint,uuid,uuid,text,text,time,time,text,boolean,uuid,date,date,boolean) owner to postgres;
revoke all on function public.update_class_with_effective_dates(uuid,uuid,text,bigint,uuid,uuid,text,text,time,time,text,boolean,uuid,date,date,boolean) from public,anon,authenticated,service_role;
grant execute on function public.update_class_with_effective_dates(uuid,uuid,text,bigint,uuid,uuid,text,text,time,time,text,boolean,uuid,date,date,boolean) to service_role;

commit;
