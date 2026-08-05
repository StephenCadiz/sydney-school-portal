create table public.young_learner_class_point_entries (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null
    references public.classes(id) on delete cascade,
  young_learner_id uuid not null
    references public.young_learners(id) on delete cascade,
  teacher_id uuid not null
    references public.profiles(id) on delete restrict,
  academic_year text not null,
  homework_done boolean,
  speaking_english boolean,
  good_behaviour boolean,
  exam_mark integer,
  points_delta integer not null,
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid
    references public.profiles(id) on delete set null,
  constraint young_learner_class_point_entries_academic_year_check
    check (academic_year ~ '^[0-9]{4}-[0-9]{4}$'),
  constraint young_learner_class_point_entries_exam_mark_check
    check (exam_mark is null or exam_mark between 1 and 10),
  constraint young_learner_class_point_entries_scoring_selection_check
    check (
      homework_done is not null
      or speaking_english is not null
      or good_behaviour is not null
      or exam_mark is not null
    ),
  constraint young_learner_class_point_entries_delta_check
    check (
      points_delta =
        case homework_done when true then 1 when false then -1 else 0 end
        + case speaking_english when true then 1 when false then -1 else 0 end
        + case good_behaviour when true then 1 when false then -1 else 0 end
        + coalesce(exam_mark, 0)
    ),
  constraint young_learner_class_point_entries_soft_delete_check
    check ((deleted_at is null) = (deleted_by is null))
);

create index young_learner_class_point_entries_class_year_active_idx
  on public.young_learner_class_point_entries (class_id, academic_year)
  where deleted_at is null;

create index young_learner_class_point_entries_learner_year_active_idx
  on public.young_learner_class_point_entries (young_learner_id, academic_year)
  where deleted_at is null;

create index young_learner_class_point_entries_class_created_active_idx
  on public.young_learner_class_point_entries (class_id, created_at desc)
  where deleted_at is null;

alter table public.young_learner_class_point_entries enable row level security;

revoke all on table public.young_learner_class_point_entries from anon, authenticated;

grant select, insert, update, delete
  on table public.young_learner_class_point_entries to service_role;
