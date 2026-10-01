-- Level-specific Cambridge exam-part definitions for Express and Intensive planning.
-- This migration is additive and must be reviewed/applied separately.

create table public.cambridge_exam_subparts (
  id uuid primary key default gen_random_uuid(),
  exam_part_id uuid not null references public.cambridge_exam_parts(id) on delete cascade,
  part_number integer not null check (part_number > 0),
  label text not null check (btrim(label) <> ''),
  sort_order integer not null check (sort_order > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (exam_part_id, part_number),
  unique (exam_part_id, sort_order)
);

create index cambridge_exam_subparts_exam_part_idx
  on public.cambridge_exam_subparts (exam_part_id, sort_order);

create or replace function public.cambridge_exam_subpart_count(p_level text, p_part_type text)
returns integer
language sql
immutable
set search_path = public, pg_temp
as $$
  select case upper(btrim(p_level))
    when 'B1' then case lower(btrim(p_part_type)) when 'reading' then 6 when 'listening' then 4 when 'writing' then 2 else 0 end
    when 'B2' then case lower(btrim(p_part_type)) when 'reading' then 7 when 'listening' then 4 when 'writing' then 2 else 0 end
    when 'C1' then case lower(btrim(p_part_type)) when 'reading' then 8 when 'listening' then 4 when 'writing' then 2 else 0 end
    when 'C2' then case lower(btrim(p_part_type)) when 'reading' then 7 when 'listening' then 4 when 'writing' then 2 else 0 end
    else 0
  end;
$$;

create or replace function public.populate_cambridge_exam_subparts()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_level text;
  v_count integer;
begin
  select level.name into v_level
  from public.cambridge_exam_sets exam
  join public.levels level on level.id = exam.level_id
  where exam.id = new.exam_set_id;

  v_count := public.cambridge_exam_subpart_count(v_level, new.part_type);
  if v_count > 0 then
    insert into public.cambridge_exam_subparts (exam_part_id, part_number, label, sort_order)
    select new.id, n, 'Part ' || n, n
    from generate_series(1, v_count) as series(n)
    on conflict (exam_part_id, part_number) do nothing;
  end if;
  return new;
end;
$$;

create trigger cambridge_exam_parts_populate_subparts
after insert on public.cambridge_exam_parts
for each row execute function public.populate_cambridge_exam_subparts();

insert into public.cambridge_exam_subparts (exam_part_id, part_number, label, sort_order)
select part.id, series.n, 'Part ' || series.n, series.n
from public.cambridge_exam_parts part
join public.cambridge_exam_sets exam on exam.id = part.exam_set_id
join public.levels level on level.id = exam.level_id
cross join lateral generate_series(1, public.cambridge_exam_subpart_count(level.name, part.part_type)) series(n)
where public.cambridge_exam_subpart_count(level.name, part.part_type) > 0
on conflict (exam_part_id, part_number) do nothing;

alter table public.course_plan_exam_items
  add column exam_subpart_id uuid references public.cambridge_exam_subparts(id) on delete restrict;

alter table public.course_plan_exam_items
  drop constraint if exists course_plan_exam_items_selection_check;

alter table public.course_plan_exam_items
  add constraint course_plan_exam_items_selection_check check (
    (selection_scope = 'full_exam' and exam_part_id is null and exam_subpart_id is null)
    or (selection_scope = 'skill' and exam_part_id is not null and exam_subpart_id is null)
    or (selection_scope = 'part' and exam_part_id is not null)
  );

drop index if exists public.course_plan_exam_items_full_exam_unique_idx;
alter table public.course_plan_exam_items
  drop constraint if exists course_plan_exam_items_course_plan_day_id_purpose_exam_set_id_exam_part_id_key;
create unique index course_plan_exam_items_selection_unique_idx
  on public.course_plan_exam_items (
    course_plan_day_id,
    purpose,
    exam_set_id,
    coalesce(exam_part_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(exam_subpart_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );

alter table public.cambridge_exam_assignments
  add column exam_subpart_id uuid references public.cambridge_exam_subparts(id) on delete restrict;

drop index if exists public.cambridge_exam_assignments_global_unique_idx;
drop index if exists public.cambridge_exam_assignments_course_plan_unique_idx;
create unique index cambridge_exam_assignments_global_unique_idx
  on public.cambridge_exam_assignments (
    coalesce(exam_subpart_id, exam_part_id), course_type
  ) where archived_at is null and course_plan_day_id is null;
create unique index cambridge_exam_assignments_course_plan_unique_idx
  on public.cambridge_exam_assignments (
    course_plan_day_id, coalesce(exam_subpart_id, exam_part_id)
  ) where archived_at is null and course_plan_day_id is not null;

alter table public.course_plan_exam_scores
  add column exam_subpart_id uuid references public.cambridge_exam_subparts(id) on delete restrict;
alter table public.course_plan_exam_score_history
  add column exam_subpart_id uuid references public.cambridge_exam_subparts(id) on delete restrict;
drop index if exists public.course_plan_exam_scores_part_idx;
create index course_plan_exam_scores_part_idx
  on public.course_plan_exam_scores (coalesce(exam_subpart_id, exam_part_id), purpose);
alter table public.course_plan_exam_scores
  drop constraint if exists course_plan_exam_scores_course_plan_day_id_student_id_exam_part_id_purpose_key;
create unique index course_plan_exam_scores_selection_unique_idx
  on public.course_plan_exam_scores (
    course_plan_day_id,
    student_id,
    coalesce(exam_subpart_id, exam_part_id),
    purpose
  );

alter table public.cambridge_exam_subparts enable row level security;
revoke all on table public.cambridge_exam_subparts from anon, authenticated;
grant select on table public.cambridge_exam_subparts to service_role;
revoke all on function public.cambridge_exam_subpart_count(text, text) from public, anon, authenticated;
revoke all on function public.populate_cambridge_exam_subparts() from public, anon, authenticated, service_role;

comment on table public.cambridge_exam_subparts is
  'Authoritative level-specific non-speaking Cambridge exam part definitions used by Express and Intensive planning.';
