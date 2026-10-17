-- Repair older Course Planning databases that still reject selection_scope='skill'
-- or retain the original parent-part-only uniqueness constraint. This is
-- intentionally idempotent so it is safe on databases already at the current
-- subpart-aware schema.

do $$
declare
  constraint_name text;
begin
  for constraint_name in
    select constraint_row.conname
    from pg_constraint constraint_row
    join pg_class table_row on table_row.oid = constraint_row.conrelid
    join pg_namespace schema_row on schema_row.oid = table_row.relnamespace
    where schema_row.nspname = 'public'
      and table_row.relname = 'course_plan_exam_items'
      and constraint_row.contype = 'c'
      and pg_get_constraintdef(constraint_row.oid) ilike '%selection_scope%'
  loop
    execute format(
      'alter table public.course_plan_exam_items drop constraint %I',
      constraint_name
    );
  end loop;
end $$;

alter table public.course_plan_exam_items
  add constraint course_plan_exam_items_selection_scope_check check (
    (selection_scope = 'full_exam' and exam_part_id is null and exam_subpart_id is null)
    or (selection_scope = 'skill' and exam_part_id is not null and exam_subpart_id is null)
    or (selection_scope = 'part' and exam_part_id is not null)
  );

do $$
declare
  constraint_name text;
begin
  for constraint_name in
    select constraint_row.conname
    from pg_constraint constraint_row
    join pg_class table_row on table_row.oid = constraint_row.conrelid
    join pg_namespace schema_row on schema_row.oid = table_row.relnamespace
    where schema_row.nspname = 'public'
      and table_row.relname = 'course_plan_exam_items'
      and constraint_row.contype = 'u'
      and pg_get_constraintdef(constraint_row.oid) ilike '%course_plan_day_id%'
      and pg_get_constraintdef(constraint_row.oid) ilike '%purpose%'
      and pg_get_constraintdef(constraint_row.oid) ilike '%exam_set_id%'
      and pg_get_constraintdef(constraint_row.oid) ilike '%exam_part_id%'
      and pg_get_constraintdef(constraint_row.oid) not ilike '%exam_subpart_id%'
  loop
    execute format(
      'alter table public.course_plan_exam_items drop constraint %I',
      constraint_name
    );
  end loop;
end $$;

drop index if exists public.course_plan_exam_items_selection_unique_idx;

create unique index course_plan_exam_items_selection_unique_idx
  on public.course_plan_exam_items (
    course_plan_day_id,
    purpose,
    exam_set_id,
    coalesce(exam_part_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(exam_subpart_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );
