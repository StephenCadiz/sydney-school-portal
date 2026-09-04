begin;

alter table public.teacher_resources
  drop constraint if exists teacher_resources_scope_check;

alter table public.teacher_resources
  drop constraint if exists teacher_resources_scope_level_check;

alter table public.teacher_resources
  alter column level_id drop not null;

alter table public.teacher_resources
  add constraint teacher_resources_scope_check
  check (
    resource_scope in (
      'shared_teacher',
      'official_teacher',
      'cambridge_student',
      'general_teacher'
    )
  );

alter table public.teacher_resources
  add constraint teacher_resources_scope_level_check
  check (
    (
      resource_scope = 'general_teacher'
      and level_id is null
    )
    or
    (
      resource_scope in (
        'shared_teacher',
        'official_teacher',
        'cambridge_student'
      )
      and level_id is not null
    )
  );

comment on table public.teacher_resources is
  'Teacher and student resource library. general_teacher is Admin-managed and available to every Teacher; all other scopes remain level-specific.';

comment on column public.teacher_resources.resource_scope is
  'Allowed values: shared_teacher, official_teacher, cambridge_student or general_teacher.';

comment on column public.teacher_resources.level_id is
  'Required for level-specific scopes and null only for general_teacher resources.';

create index if not exists teacher_resources_general_teacher_created_at_idx
on public.teacher_resources (created_at desc)
where resource_scope = 'general_teacher';

drop policy if exists "Teachers can read resources for taught levels"
on public.teacher_resources;

drop policy if exists "Teachers can read permitted teacher resources"
on public.teacher_resources;

create policy "Teachers can read permitted teacher resources"
on public.teacher_resources
for select
to authenticated
using (
  app_private.is_teacher()
  and (
    (
      resource_scope = 'general_teacher'
      and level_id is null
    )
    or
    (
      resource_scope in (
        'shared_teacher',
        'official_teacher',
        'cambridge_student'
      )
      and app_private.teacher_teaches_level(level_id)
    )
  )
);

commit;
