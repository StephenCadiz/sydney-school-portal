-- Extend Student Monitoring to the existing Young Learner enrolment model.
-- This migration is intentionally separate from the original monitoring schema;
-- it does not alter existing records or backfill production data.
begin;
set local search_path = pg_catalog, public, app_private, pg_temp;

alter table public.student_monitoring_records
  add column if not exists student_type text not null default 'profile',
  add column if not exists young_learner_id uuid references public.young_learners(id) on delete restrict;

alter table public.student_monitoring_records
  alter column student_id drop not null;

alter table public.student_monitoring_records
  drop constraint if exists student_monitoring_student_identity_check;

alter table public.student_monitoring_records
  add constraint student_monitoring_student_identity_check check (
    (student_type = 'profile' and student_id is not null and young_learner_id is null)
    or (student_type = 'young_learner' and student_id is null and young_learner_id is not null)
  );

drop index if exists public.student_monitoring_one_active_per_student_class;
create unique index student_monitoring_one_active_per_student_class
  on public.student_monitoring_records(student_type, coalesce(student_id, young_learner_id), class_id)
  where status in ('awaiting_teacher_feedback', 'monitoring_continued', 'overdue', 'feedback_submitted');

drop function if exists public.create_student_monitoring(uuid,uuid,uuid,bigint,text,date);
create or replace function public.create_student_monitoring(
  p_actor_id uuid,
  p_student_type text,
  p_profile_student_id uuid,
  p_young_learner_id uuid,
  p_class_id uuid,
  p_level_id bigint,
  p_reason text,
  p_feedback_due_on date
) returns public.student_monitoring_records
language plpgsql
security definer
set search_path = pg_catalog, public, app_private, pg_temp
as $$
declare
  v_record public.student_monitoring_records;
  v_class public.classes;
  v_level_name text;
  v_today date := (now() at time zone 'Europe/Madrid')::date;
begin
  if auth.role() <> 'service_role' and auth.uid() is distinct from p_actor_id then
    raise exception 'Acting user does not match the authenticated account.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.profiles where id = p_actor_id and role = 'admin') then
    raise exception 'Only Admin users can create monitoring records.' using errcode = '42501';
  end if;
  if p_student_type not in ('profile', 'young_learner') then
    raise exception 'The selected student type is invalid.' using errcode = '22023';
  end if;
  if (p_student_type = 'profile' and (p_profile_student_id is null or p_young_learner_id is not null))
     or (p_student_type = 'young_learner' and (p_young_learner_id is null or p_profile_student_id is not null)) then
    raise exception 'The selected student identity is invalid.' using errcode = '22023';
  end if;

  select * into v_class from public.classes where id = p_class_id for update;
  if not found or v_class.teacher_id is null or v_class.level_id is distinct from p_level_id then
    raise exception 'The selected class and level do not match.' using errcode = '22023';
  end if;
  if (p_student_type = 'profile' and v_class.is_cambridge is distinct from true)
     or (p_student_type = 'young_learner' and v_class.is_cambridge is true) then
    raise exception 'The selected class does not match the student programme.' using errcode = '22023';
  end if;

  select name into v_level_name from public.levels where id = p_level_id;
  if v_level_name is null or lower(v_level_name) like '%intensive%' or lower(v_level_name) like '%express%' then
    raise exception 'This level is not eligible for Student Monitoring.' using errcode = '22023';
  end if;
  if p_student_type = 'profile' then
    if not exists (select 1 from public.profiles where id = p_profile_student_id and role = 'student' and active is distinct from false) then
      raise exception 'The selected student is invalid.' using errcode = '22023';
    end if;
  elsif not exists (select 1 from public.young_learners where id = p_young_learner_id and active is true) then
    raise exception 'The selected student is invalid.' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.class_enrolment_periods enrolment
    where enrolment.class_id = p_class_id
      and enrolment.student_type = p_student_type
      and ((p_student_type = 'profile' and enrolment.profile_student_id = p_profile_student_id)
        or (p_student_type = 'young_learner' and enrolment.young_learner_id = p_young_learner_id))
      and enrolment.cancelled_at is null
      and enrolment.starts_on <= v_today
      and (enrolment.ends_before is null or v_today < enrolment.ends_before)
  ) then
    raise exception 'The selected student is not currently enrolled in this class.' using errcode = '22023';
  end if;
  if p_feedback_due_on is null or p_feedback_due_on < v_today then
    raise exception 'The feedback deadline must be today or later.' using errcode = '22023';
  end if;
  if exists (
    select 1 from public.student_monitoring_records
    where student_type = p_student_type
      and coalesce(student_id, young_learner_id) = coalesce(p_profile_student_id, p_young_learner_id)
      and class_id = p_class_id
      and status in ('awaiting_teacher_feedback', 'monitoring_continued', 'overdue', 'feedback_submitted')
  ) then
    raise exception 'An active monitoring record already exists for this student and class.' using errcode = '23505';
  end if;

  insert into public.student_monitoring_records(
    student_id, student_type, young_learner_id, class_id, level_id, teacher_id, reason, feedback_due_on, created_by
  ) values (
    p_profile_student_id, p_student_type, p_young_learner_id, p_class_id, p_level_id, v_class.teacher_id,
    nullif(btrim(p_reason), ''), p_feedback_due_on, p_actor_id
  ) returning * into v_record;
  insert into public.student_monitoring_history(
    monitoring_id, event_type, actor_id, to_status, new_deadline, new_class_id, new_level_id, notes
  ) values (
    v_record.id, 'created', p_actor_id, v_record.status, v_record.feedback_due_on,
    v_record.class_id, v_record.level_id, v_record.reason
  );
  return v_record;
end;
$$;

alter function public.create_student_monitoring(uuid,text,uuid,uuid,uuid,bigint,text,date) owner to postgres;
revoke all on function public.create_student_monitoring(uuid,text,uuid,uuid,uuid,bigint,text,date) from public, anon, authenticated;
grant execute on function public.create_student_monitoring(uuid,text,uuid,uuid,uuid,bigint,text,date) to service_role;

commit;
