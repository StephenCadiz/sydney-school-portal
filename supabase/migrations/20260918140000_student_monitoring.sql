begin;

set local search_path = pg_catalog, public, app_private, pg_temp;

create table public.student_monitoring_records (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles(id) on delete restrict,
  class_id uuid not null references public.classes(id) on delete restrict,
  level_id bigint not null references public.levels(id) on delete restrict,
  teacher_id uuid not null references public.profiles(id) on delete restrict,
  reason text not null check (nullif(btrim(reason), '') is not null),
  feedback_due_on date not null,
  status text not null default 'awaiting_teacher_feedback' check (status in (
    'awaiting_teacher_feedback','monitoring_continued','overdue',
    'feedback_submitted','kept','moved_up','moved_down','continued','closed'
  )),
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  submitted_at timestamptz,
  decided_at timestamptz,
  decided_by uuid references public.profiles(id) on delete restrict,
  decision text,
  admin_notes text,
  previous_class_id uuid references public.classes(id) on delete restrict,
  previous_level_id bigint references public.levels(id) on delete restrict,
  new_class_id uuid references public.classes(id) on delete restrict,
  new_level_id bigint references public.levels(id) on delete restrict,
  continue_count integer not null default 0 check (continue_count >= 0),
  constraint student_monitoring_decision_check check (
    decision is null or decision in ('kept','moved_up','moved_down','continued','closed')
  )
);

create table public.student_monitoring_feedback (
  id uuid primary key default gen_random_uuid(),
  monitoring_id uuid not null references public.student_monitoring_records(id) on delete cascade,
  teacher_id uuid not null references public.profiles(id) on delete restrict,
  observations text not null,
  strengths text,
  difficulties text,
  level_suitability text,
  recommendation text,
  submitted_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table public.student_monitoring_history (
  id uuid primary key default gen_random_uuid(),
  monitoring_id uuid not null references public.student_monitoring_records(id) on delete cascade,
  event_type text not null,
  actor_id uuid not null references public.profiles(id) on delete restrict,
  from_status text,
  to_status text,
  previous_deadline date,
  new_deadline date,
  previous_class_id uuid,
  new_class_id uuid,
  previous_level_id bigint,
  new_level_id bigint,
  notes text,
  created_at timestamptz not null default now()
);

create unique index student_monitoring_one_active_per_student_class
  on public.student_monitoring_records(student_id, class_id)
  where status in ('awaiting_teacher_feedback','monitoring_continued','overdue','feedback_submitted');
create index student_monitoring_teacher_status_idx
  on public.student_monitoring_records(teacher_id, status, feedback_due_on);
create index student_monitoring_student_idx
  on public.student_monitoring_records(student_id, created_at desc);
create index student_monitoring_history_record_idx
  on public.student_monitoring_history(monitoring_id, created_at desc);

alter table public.student_monitoring_records enable row level security;
alter table public.student_monitoring_feedback enable row level security;
alter table public.student_monitoring_history enable row level security;
revoke all on public.student_monitoring_records, public.student_monitoring_feedback, public.student_monitoring_history from public, anon, authenticated;
grant select on public.student_monitoring_records, public.student_monitoring_feedback, public.student_monitoring_history to authenticated, service_role;

create policy student_monitoring_records_admin_read on public.student_monitoring_records
  for select to authenticated using (app_private.is_admin());
create policy student_monitoring_records_teacher_read on public.student_monitoring_records
  for select to authenticated using (
    app_private.is_teacher() and teacher_id = auth.uid() and exists (
      select 1 from public.classes classroom where classroom.id = class_id and classroom.teacher_id = auth.uid()
    )
  );
create policy student_monitoring_feedback_admin_read on public.student_monitoring_feedback
  for select to authenticated using (app_private.is_admin());
create policy student_monitoring_feedback_teacher_read on public.student_monitoring_feedback
  for select to authenticated using (
    app_private.is_teacher() and teacher_id = auth.uid() and exists (
      select 1 from public.student_monitoring_records record join public.classes classroom on classroom.id=record.class_id
      where record.id = monitoring_id and record.teacher_id = auth.uid() and classroom.teacher_id = auth.uid()
    )
  );
create policy student_monitoring_history_admin_read on public.student_monitoring_history
  for select to authenticated using (app_private.is_admin());
create policy student_monitoring_history_teacher_read on public.student_monitoring_history
  for select to authenticated using (
    app_private.is_teacher() and exists (
      select 1 from public.student_monitoring_records record
      join public.classes classroom on classroom.id=record.class_id
      where record.id = monitoring_id and record.teacher_id = auth.uid() and classroom.teacher_id = auth.uid()
    )
  );

create or replace function public.create_student_monitoring(
  p_actor_id uuid, p_student_id uuid, p_class_id uuid, p_level_id bigint,
  p_reason text, p_feedback_due_on date
) returns public.student_monitoring_records
language plpgsql security definer
set search_path = pg_catalog, public, app_private, pg_temp
as $$
declare v_record public.student_monitoring_records;
declare v_class public.classes;
declare v_level_name text;
begin
  if auth.role() <> 'service_role' and auth.uid() is distinct from p_actor_id then
    raise exception 'Acting user does not match the authenticated account.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.profiles where id=p_actor_id and role='admin') then
    raise exception 'Only Admin users can create monitoring records.' using errcode = '42501';
  end if;
  select * into v_class from public.classes where id=p_class_id for update;
  if not found or v_class.teacher_id is null or v_class.level_id is distinct from p_level_id then
    raise exception 'The selected class and level do not match.' using errcode = '22023';
  end if;
  select name into v_level_name from public.levels where id=p_level_id;
  if v_level_name is null or lower(v_level_name) like '%intensive%' or lower(v_level_name) like '%express%' then
    raise exception 'This level is not eligible for Student Monitoring.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.profiles where id=p_student_id and role='student') then
    raise exception 'The selected student is invalid.' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.class_enrolment_periods enrolment
    where enrolment.class_id = p_class_id and enrolment.student_type = 'profile'
      and enrolment.profile_student_id = p_student_id and enrolment.cancelled_at is null
      and enrolment.starts_on <= (now() at time zone 'Europe/Madrid')::date
      and (enrolment.ends_before is null or (now() at time zone 'Europe/Madrid')::date < enrolment.ends_before)
  ) then
    raise exception 'The selected student is not currently enrolled in this class.' using errcode = '22023';
  end if;
  if p_feedback_due_on is null or p_feedback_due_on < (now() at time zone 'Europe/Madrid')::date then
    raise exception 'The feedback deadline must be today or later.' using errcode = '22023';
  end if;
  if exists (select 1 from public.student_monitoring_records where student_id=p_student_id and class_id=p_class_id
    and status in ('awaiting_teacher_feedback','monitoring_continued','overdue','feedback_submitted')) then
    raise exception 'An active monitoring record already exists for this student and class.' using errcode = '23505';
  end if;
  insert into public.student_monitoring_records(student_id,class_id,level_id,teacher_id,reason,feedback_due_on,created_by)
  values (p_student_id,p_class_id,p_level_id,nullif(btrim(p_reason),''),p_feedback_due_on,p_actor_id)
  returning * into v_record;
  insert into public.student_monitoring_history(monitoring_id,event_type,actor_id,to_status,new_deadline,new_class_id,new_level_id,notes)
  values (v_record.id,'created',p_actor_id,v_record.status,v_record.feedback_due_on,v_record.class_id,v_record.level_id,v_record.reason);
  return v_record;
end;
$$;

create or replace function public.continue_student_monitoring(
  p_actor_id uuid, p_monitoring_id uuid, p_new_deadline date
) returns public.student_monitoring_records
language plpgsql security definer
set search_path = pg_catalog, public, app_private, pg_temp
as $$
declare v_record public.student_monitoring_records; v_previous_status text; v_previous_deadline date;
begin
  if auth.role() <> 'service_role' and auth.uid() is distinct from p_actor_id then
    raise exception 'Acting user does not match the authenticated account.' using errcode = '42501';
  end if;
  select * into v_record from public.student_monitoring_records where id=p_monitoring_id for update;
  if not found or v_record.teacher_id is distinct from p_actor_id or not exists (select 1 from public.classes where id=v_record.class_id and teacher_id=p_actor_id) then
    raise exception 'Monitoring task access denied.' using errcode = '42501';
  end if;
  if v_record.status not in ('awaiting_teacher_feedback','monitoring_continued')
    or p_new_deadline is null or p_new_deadline <= (now() at time zone 'Europe/Madrid')::date then
    raise exception 'This monitoring task cannot be continued.' using errcode = '22023';
  end if;
  v_previous_status := v_record.status; v_previous_deadline := v_record.feedback_due_on;
  update public.student_monitoring_records set status='monitoring_continued', feedback_due_on=p_new_deadline,
    continue_count=continue_count+1, updated_at=now() where id=v_record.id returning * into v_record;
  insert into public.student_monitoring_history(monitoring_id,event_type,actor_id,from_status,to_status,previous_deadline,new_deadline,notes)
  values (v_record.id,'continued',p_actor_id,v_previous_status,'monitoring_continued',v_previous_deadline,p_new_deadline,'Teacher continued monitoring.');
  return v_record;
end;
$$;

create or replace function public.submit_student_monitoring_feedback(
  p_actor_id uuid, p_monitoring_id uuid, p_observations text, p_strengths text,
  p_difficulties text, p_level_suitability text, p_recommendation text
) returns public.student_monitoring_records
language plpgsql security definer
set search_path = pg_catalog, public, app_private, pg_temp
as $$
declare v_record public.student_monitoring_records; v_previous_status text;
begin
  if auth.role() <> 'service_role' and auth.uid() is distinct from p_actor_id then
    raise exception 'Acting user does not match the authenticated account.' using errcode = '42501';
  end if;
  select * into v_record from public.student_monitoring_records where id=p_monitoring_id for update;
  if not found or v_record.teacher_id is distinct from p_actor_id or not exists (select 1 from public.classes where id=v_record.class_id and teacher_id=p_actor_id) then
    raise exception 'Monitoring task access denied.' using errcode = '42501';
  end if;
  if nullif(btrim(p_observations),'') is null or v_record.status not in ('awaiting_teacher_feedback','monitoring_continued','overdue') then
    raise exception 'This monitoring task is not ready for feedback.' using errcode = '22023';
  end if;
  v_previous_status := case when v_record.feedback_due_on < (now() at time zone 'Europe/Madrid')::date then 'overdue' else v_record.status end;
  insert into public.student_monitoring_feedback(monitoring_id,teacher_id,observations,strengths,difficulties,level_suitability,recommendation)
  values (v_record.id,p_actor_id,btrim(p_observations),nullif(btrim(p_strengths),''),nullif(btrim(p_difficulties),''),nullif(btrim(p_level_suitability),''),nullif(btrim(p_recommendation),''));
  update public.student_monitoring_records set status='feedback_submitted', submitted_at=now(), updated_at=now()
  where id=v_record.id returning * into v_record;
  insert into public.student_monitoring_history(monitoring_id,event_type,actor_id,from_status,to_status,notes)
  values (v_record.id,'feedback_submitted',p_actor_id,v_previous_status,'feedback_submitted','Teacher feedback submitted.');
  return v_record;
end;
$$;

create or replace function public.decide_student_monitoring(
  p_actor_id uuid, p_monitoring_id uuid, p_decision text, p_admin_notes text default null,
  p_new_deadline date default null, p_new_class_id uuid default null, p_new_level_id bigint default null
) returns public.student_monitoring_records
language plpgsql security definer
set search_path = pg_catalog, public, app_private, pg_temp
as $$
declare v_record public.student_monitoring_records; v_class public.classes;
declare v_previous_status text; v_previous_deadline date; v_previous_class_id uuid; v_previous_level_id bigint;
begin
  if auth.role() <> 'service_role' and auth.uid() is distinct from p_actor_id then
    raise exception 'Acting user does not match the authenticated account.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.profiles where id=p_actor_id and role='admin') then
    raise exception 'Only Admin users can decide monitoring records.' using errcode = '42501';
  end if;
  if p_decision not in ('kept','moved_up','moved_down','continued','closed') then
    raise exception 'Invalid monitoring decision.' using errcode = '22023';
  end if;
  select * into v_record from public.student_monitoring_records where id=p_monitoring_id for update;
  if not found or v_record.status <> 'feedback_submitted' then
    raise exception 'Feedback must be submitted before an Admin decision.' using errcode = '22023';
  end if;
  if p_decision='continued' and (p_new_deadline is null or p_new_deadline <= (now() at time zone 'Europe/Madrid')::date) then
    raise exception 'A future deadline is required to continue monitoring.' using errcode = '22023';
  end if;
  if p_new_class_id is not null then
    select * into v_class from public.classes where id=p_new_class_id;
    if not found or v_class.teacher_id is null then raise exception 'The new class is invalid.' using errcode = '22023'; end if;
  end if;
  v_previous_status := v_record.status;
  v_previous_deadline := v_record.feedback_due_on;
  v_previous_class_id := v_record.class_id;
  v_previous_level_id := v_record.level_id;
  update public.student_monitoring_records set status=case when p_decision='continued' then 'monitoring_continued' else p_decision end, decision=p_decision, decided_by=p_actor_id, decided_at=now(),
    admin_notes=nullif(btrim(p_admin_notes),''), feedback_due_on=coalesce(p_new_deadline,feedback_due_on),
    previous_class_id=case when p_new_class_id is not null then class_id else previous_class_id end,
    previous_level_id=case when p_new_level_id is not null then level_id else previous_level_id end,
    new_class_id=coalesce(p_new_class_id,new_class_id), new_level_id=coalesce(p_new_level_id,new_level_id), updated_at=now()
  where id=v_record.id returning * into v_record;
  insert into public.student_monitoring_history(monitoring_id,event_type,actor_id,from_status,to_status,previous_deadline,new_deadline,previous_class_id,new_class_id,previous_level_id,new_level_id,notes)
  values (v_record.id,'admin_decision',p_actor_id,v_previous_status,v_record.status,v_previous_deadline,v_record.feedback_due_on,v_previous_class_id,v_record.new_class_id,v_previous_level_id,v_record.new_level_id,p_admin_notes);
  return v_record;
end;
$$;

alter function public.create_student_monitoring(uuid,uuid,uuid,bigint,text,date) owner to postgres;
alter function public.continue_student_monitoring(uuid,uuid,date) owner to postgres;
alter function public.submit_student_monitoring_feedback(uuid,uuid,text,text,text,text,text) owner to postgres;
alter function public.decide_student_monitoring(uuid,uuid,text,text,date,uuid,bigint) owner to postgres;
revoke all on function public.create_student_monitoring(uuid,uuid,uuid,bigint,text,date), public.continue_student_monitoring(uuid,uuid,date), public.submit_student_monitoring_feedback(uuid,uuid,text,text,text,text,text), public.decide_student_monitoring(uuid,uuid,text,text,date,uuid,bigint) from public, anon, authenticated;
grant execute on function public.create_student_monitoring(uuid,uuid,uuid,bigint,text,date), public.continue_student_monitoring(uuid,uuid,date), public.submit_student_monitoring_feedback(uuid,uuid,text,text,text,text,text), public.decide_student_monitoring(uuid,uuid,text,text,date,uuid,bigint) to service_role;

commit;
