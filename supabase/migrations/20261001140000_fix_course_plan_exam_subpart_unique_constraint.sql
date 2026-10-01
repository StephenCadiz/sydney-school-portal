-- The initial Course Planning migration left a parent-part-only unique
-- constraint in place under a truncated PostgreSQL-generated name. That
-- constraint rejects two numbered subparts from the same skill even though
-- exam_subpart_id is now part of the authoritative identity.

alter table public.course_plan_exam_items
  drop constraint if exists course_plan_exam_items_course_plan_day_id_purpose_exam_set__key,
  drop constraint if exists course_plan_exam_items_course_plan_day_id_purpose_exam_set_id_exam_part_id_key;

drop index if exists public.course_plan_exam_items_selection_unique_idx;

create unique index course_plan_exam_items_selection_unique_idx
  on public.course_plan_exam_items (
    course_plan_day_id,
    purpose,
    exam_set_id,
    coalesce(exam_part_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(exam_subpart_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );
