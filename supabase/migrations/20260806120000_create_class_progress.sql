create table public.class_progress_entries (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null
    references public.classes(id) on delete cascade,
  teacher_id uuid not null
    references public.profiles(id) on delete restrict,
  last_edited_by uuid
    references public.profiles(id) on delete set null,
  lesson_date date not null,
  scheduled_start_time time not null,
  scheduled_end_time time not null,
  pupils_book_page integer,
  activity_book_page integer,
  homework text,
  extra_activities text,
  completed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint class_progress_entries_pupils_book_page_check
    check (pupils_book_page is null or pupils_book_page > 0),
  constraint class_progress_entries_activity_book_page_check
    check (activity_book_page is null or activity_book_page > 0),
  constraint class_progress_entries_scheduled_time_check
    check (scheduled_end_time <> scheduled_start_time),
  constraint class_progress_entries_meaningful_progress_check
    check (
      pupils_book_page is not null
      or activity_book_page is not null
      or nullif(btrim(coalesce(homework, '')), '') is not null
      or nullif(btrim(coalesce(extra_activities, '')), '') is not null
    ),
  constraint class_progress_entries_class_lesson_start_unique
    unique (class_id, lesson_date, scheduled_start_time)
);

create index class_progress_entries_class_lesson_idx
  on public.class_progress_entries (class_id, lesson_date desc, scheduled_start_time desc);

create index class_progress_entries_class_completed_idx
  on public.class_progress_entries (class_id, completed_at desc);

create index class_progress_entries_teacher_completed_idx
  on public.class_progress_entries (teacher_id, completed_at desc);

create or replace function public.set_class_progress_entries_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger class_progress_entries_set_updated_at
before update on public.class_progress_entries
for each row
execute function public.set_class_progress_entries_updated_at();

alter table public.class_progress_entries enable row level security;

revoke all on table public.class_progress_entries from anon, authenticated;

grant select, insert, update, delete
  on table public.class_progress_entries to service_role;
