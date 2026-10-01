-- Per-student scores for non-speaking Express and Intensive Cambridge exam parts.
-- This migration is additive and intentionally must be reviewed/applied separately.

create table public.course_plan_exam_scores (
  id uuid primary key default gen_random_uuid(),
  course_plan_day_id uuid not null references public.course_plan_days(id) on delete cascade,
  class_id uuid not null references public.classes(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  exam_set_id uuid not null references public.cambridge_exam_sets(id) on delete restrict,
  exam_part_id uuid not null references public.cambridge_exam_parts(id) on delete restrict,
  purpose text not null check (purpose in ('class_practice', 'homework')),
  percentage numeric(5,2) not null check (percentage >= 0 and percentage <= 100),
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (course_plan_day_id, student_id, exam_part_id, purpose)
);

create index course_plan_exam_scores_student_class_idx
  on public.course_plan_exam_scores (student_id, class_id, course_plan_day_id);

create index course_plan_exam_scores_part_idx
  on public.course_plan_exam_scores (exam_part_id, purpose);

create table public.course_plan_exam_score_history (
  id uuid primary key default gen_random_uuid(),
  course_plan_day_id uuid not null references public.course_plan_days(id) on delete cascade,
  class_id uuid not null references public.classes(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  exam_set_id uuid not null references public.cambridge_exam_sets(id) on delete restrict,
  exam_part_id uuid not null references public.cambridge_exam_parts(id) on delete restrict,
  purpose text not null check (purpose in ('class_practice', 'homework')),
  percentage numeric(5,2) not null check (percentage >= 0 and percentage <= 100),
  recorded_by uuid references public.profiles(id) on delete set null,
  recorded_at timestamptz not null default now()
);

create index course_plan_exam_score_history_lookup_idx
  on public.course_plan_exam_score_history (student_id, class_id, course_plan_day_id, recorded_at desc);

create or replace function public.set_course_plan_exam_score_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger course_plan_exam_scores_set_updated_at
before update on public.course_plan_exam_scores
for each row execute function public.set_course_plan_exam_score_updated_at();

alter table public.course_plan_exam_scores enable row level security;
alter table public.course_plan_exam_score_history enable row level security;
revoke all on table public.course_plan_exam_scores from anon, authenticated;
revoke all on table public.course_plan_exam_score_history from anon, authenticated;
grant select, insert, update on table public.course_plan_exam_scores to service_role;
grant select, insert on table public.course_plan_exam_score_history to service_role;
revoke all on function public.set_course_plan_exam_score_updated_at() from public, anon, authenticated, service_role;
