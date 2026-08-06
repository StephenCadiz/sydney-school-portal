-- Admin-defined Cambridge Intensive / Express course dates and Course Planning.
-- This migration is intentionally additive and leaves existing classes untouched.

alter table public.classes
  add column start_date date,
  add column end_date date,
  add constraint classes_course_dates_pair_check
    check (
      (start_date is null and end_date is null)
      or (start_date is not null and end_date is not null)
    ),
  add constraint classes_course_dates_order_check
    check (end_date is null or start_date is null or end_date >= start_date);

create table public.course_plans (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null unique references public.classes(id) on delete cascade,
  book_name text not null check (char_length(btrim(book_name)) > 0),
  status text not null default 'draft'
    check (status in ('draft', 'published')),
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  published_by uuid references public.profiles(id) on delete set null,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint course_plans_published_audit_check
    check (status <> 'published' or (published_by is not null and published_at is not null))
);

create table public.course_plan_days (
  id uuid primary key default gen_random_uuid(),
  course_plan_id uuid not null references public.course_plans(id) on delete cascade,
  lesson_date date not null,
  scheduled_start_time time not null,
  scheduled_end_time time not null,
  pages_to_cover text,
  other_activities text,
  homework_instructions text,
  homework_due_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint course_plan_days_time_order_check
    check (scheduled_end_time > scheduled_start_time),
  constraint course_plan_days_homework_due_check
    check (homework_due_date is null or homework_due_date >= lesson_date),
  unique (course_plan_id, lesson_date)
);

create table public.course_plan_exam_items (
  id uuid primary key default gen_random_uuid(),
  course_plan_day_id uuid not null references public.course_plan_days(id) on delete cascade,
  exam_set_id uuid not null references public.cambridge_exam_sets(id) on delete restrict,
  exam_part_id uuid references public.cambridge_exam_parts(id) on delete restrict,
  purpose text not null check (purpose in ('class_practice', 'homework')),
  selection_scope text not null check (selection_scope in ('full_exam', 'part')),
  sort_order integer not null default 0 check (sort_order >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint course_plan_exam_items_selection_check
    check (
      (selection_scope = 'full_exam' and exam_part_id is null)
      or (selection_scope = 'part' and exam_part_id is not null)
    ),
  unique (course_plan_day_id, purpose, exam_set_id, exam_part_id)
);

create table public.course_plan_resources (
  id uuid primary key default gen_random_uuid(),
  course_plan_day_id uuid not null references public.course_plan_days(id) on delete cascade,
  resource_type text not null
    check (resource_type in ('pdf', 'audio', 'external_link', 'class_resource')),
  label text not null check (char_length(btrim(label)) between 1 and 160),
  external_url text,
  storage_path text,
  original_filename text,
  mime_type text,
  file_size bigint,
  class_resource_id uuid references public.resources(id) on delete set null,
  sort_order integer not null default 0 check (sort_order >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint course_plan_resources_source_check
    check (
      (resource_type = 'external_link' and external_url is not null and storage_path is null and class_resource_id is null)
      or (resource_type in ('pdf', 'audio') and storage_path is not null and mime_type is not null and external_url is null and class_resource_id is null)
      or (resource_type = 'class_resource' and class_resource_id is not null and external_url is null and storage_path is null)
    )
);

create table public.course_plan_homework_assignments (
  course_plan_exam_item_id uuid not null
    references public.course_plan_exam_items(id) on delete cascade,
  cambridge_exam_assignment_id uuid not null
    references public.cambridge_exam_assignments(id) on delete cascade,
  primary key (course_plan_exam_item_id, cambridge_exam_assignment_id),
  unique (cambridge_exam_assignment_id)
);

alter table public.cambridge_exam_assignments
  add column course_plan_day_id uuid references public.course_plan_days(id) on delete set null,
  add column course_plan_class_id uuid references public.classes(id) on delete set null;

drop index if exists public.cambridge_exam_assignments_current_unique_idx;

create unique index cambridge_exam_assignments_global_unique_idx
  on public.cambridge_exam_assignments (exam_part_id, course_type)
  where archived_at is null and course_plan_day_id is null;

create unique index cambridge_exam_assignments_course_plan_unique_idx
  on public.cambridge_exam_assignments (course_plan_day_id, exam_part_id)
  where archived_at is null and course_plan_day_id is not null;

create index course_plan_days_plan_date_idx
  on public.course_plan_days (course_plan_id, lesson_date);
create index course_plan_exam_items_day_idx
  on public.course_plan_exam_items (course_plan_day_id, purpose, sort_order);
create unique index course_plan_exam_items_full_exam_unique_idx
  on public.course_plan_exam_items (course_plan_day_id, purpose, exam_set_id)
  where selection_scope = 'full_exam';
create index course_plan_resources_day_idx
  on public.course_plan_resources (course_plan_day_id, sort_order);
create index cambridge_exam_assignments_course_plan_class_idx
  on public.cambridge_exam_assignments (course_plan_class_id, active, release_date)
  where archived_at is null;

create or replace function public.set_course_planning_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger course_plans_set_updated_at
before update on public.course_plans
for each row execute function public.set_course_planning_updated_at();

create trigger course_plan_days_set_updated_at
before update on public.course_plan_days
for each row execute function public.set_course_planning_updated_at();

create trigger course_plan_exam_items_set_updated_at
before update on public.course_plan_exam_items
for each row execute function public.set_course_planning_updated_at();

create trigger course_plan_resources_set_updated_at
before update on public.course_plan_resources
for each row execute function public.set_course_planning_updated_at();

alter table public.course_plans enable row level security;
alter table public.course_plan_days enable row level security;
alter table public.course_plan_exam_items enable row level security;
alter table public.course_plan_resources enable row level security;
alter table public.course_plan_homework_assignments enable row level security;

revoke all on table public.course_plans, public.course_plan_days,
  public.course_plan_exam_items, public.course_plan_resources,
  public.course_plan_homework_assignments from anon, authenticated;
grant select, insert, update, delete on table public.course_plans,
  public.course_plan_days, public.course_plan_exam_items,
  public.course_plan_resources, public.course_plan_homework_assignments to service_role;

revoke all on function public.set_course_planning_updated_at()
  from public, anon, authenticated, service_role;
