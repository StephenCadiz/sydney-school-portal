begin;

alter table public.friday_exam_practice_sessions
  add column if not exists start_time time without time zone;

alter table public.friday_exam_practice_sessions
  add column if not exists end_time time without time zone;

update public.friday_exam_practice_sessions practice
set start_time = schedule.start_time,
    end_time = schedule.end_time
from public.friday_tutorial_sessions schedule
where schedule.session_date = practice.session_date
  and schedule.start_time is not null
  and schedule.end_time is not null
  and (practice.start_time is null or practice.end_time is null);

do $$
begin
  if exists (
    select 1
    from public.friday_exam_practice_sessions
    where start_time is null or end_time is null
  ) then
    raise exception
      'Every Friday Exam Practice row must have a configured matching Friday schedule before time columns become required';
  end if;
end
$$;

alter table public.friday_exam_practice_sessions
  alter column start_time set default time '18:00',
  alter column end_time set default time '19:00';

alter table public.friday_exam_practice_sessions
  alter column start_time set not null,
  alter column end_time set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'friday_exam_practice_sessions_time_range_check'
      and conrelid = 'public.friday_exam_practice_sessions'::regclass
  ) then
    alter table public.friday_exam_practice_sessions
      add constraint friday_exam_practice_sessions_time_range_check
      check (end_time > start_time);
  end if;
end
$$;

comment on column public.friday_exam_practice_sessions.start_time is
  'Madrid-local scheduled start time for the active teacher exam-practice workspace.';
comment on column public.friday_exam_practice_sessions.end_time is
  'Madrid-local scheduled end time for the active teacher exam-practice workspace.';

commit;
