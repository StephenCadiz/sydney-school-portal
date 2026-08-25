begin;

alter table public.teacher_resources
  drop constraint if exists teacher_resources_scope_check;

alter table public.teacher_resources
  add constraint teacher_resources_scope_check
  check (
    resource_scope in (
      'shared_teacher',
      'official_teacher',
      'cambridge_student'
    )
  );

comment on table public.teacher_resources is
  'Level-wide resources. shared_teacher and official_teacher are for teachers; cambridge_student is Admin-managed and available to students at the matching Cambridge level.';

comment on column public.teacher_resources.resource_scope is
  'Allowed values: shared_teacher, official_teacher or cambridge_student.';

drop policy if exists "Teachers can read resources for taught levels"
on public.teacher_resources;

create policy "Teachers can read resources for taught levels"
on public.teacher_resources
for select
to authenticated
using (
  app_private.is_teacher()
  and resource_scope in (
    'shared_teacher',
    'official_teacher',
    'cambridge_student'
  )
  and app_private.teacher_teaches_level(level_id)
);

commit;
