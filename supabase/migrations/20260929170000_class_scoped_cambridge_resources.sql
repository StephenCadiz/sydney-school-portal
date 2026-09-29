begin;

-- Class-scoped Cambridge resources use the existing private resource table,
-- while keeping level-wide links and files backwards compatible.
alter table public.teacher_resources
  add column if not exists class_id uuid references public.classes(id) on delete cascade;

alter table public.teacher_resources
  drop constraint if exists teacher_resources_scope_check;

alter table public.teacher_resources
  add constraint teacher_resources_scope_check
  check (
    resource_scope in (
      'shared_teacher',
      'official_teacher',
      'cambridge_student',
      'general_teacher',
      'cambridge_class'
    )
  );

alter table public.teacher_resources
  drop constraint if exists teacher_resources_scope_level_check;

alter table public.teacher_resources
  add constraint teacher_resources_scope_level_check
  check (
    (
      resource_scope = 'general_teacher'
      and level_id is null
      and class_id is null
    )
    or (
      resource_scope = 'cambridge_class'
      and level_id is not null
      and class_id is not null
    )
    or (
      resource_scope <> 'general_teacher'
      and resource_scope <> 'cambridge_class'
      and level_id is not null
      and class_id is null
    )
  );

create index if not exists teacher_resources_class_id_idx
  on public.teacher_resources (class_id, created_at desc)
  where resource_scope = 'cambridge_class';

comment on column public.teacher_resources.class_id is
  'Set only for cambridge_class resources; class-scoped files are visible to that class only.';

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
      resource_scope in ('shared_teacher', 'official_teacher')
      and app_private.teacher_teaches_level(level_id)
    )
    or (
      resource_scope = 'cambridge_class'
      and exists (
        select 1
        from public.classes as class_row
        where class_row.id = teacher_resources.class_id
          and class_row.teacher_id = auth.uid()
      )
    )
  )
);

drop policy if exists "Teachers can insert own class resources"
on public.teacher_resources;

create policy "Teachers can insert own class resources"
on public.teacher_resources
for insert
to authenticated
with check (
  app_private.is_teacher()
  and resource_scope = 'cambridge_class'
  and created_by = auth.uid()
  and exists (
    select 1
    from public.classes as class_row
    where class_row.id = teacher_resources.class_id
      and class_row.teacher_id = auth.uid()
  )
);

drop policy if exists "Teachers can update own class resources"
on public.teacher_resources;

create policy "Teachers can update own class resources"
on public.teacher_resources
for update
to authenticated
using (
  app_private.is_teacher()
  and resource_scope = 'cambridge_class'
  and created_by = auth.uid()
  and exists (
    select 1
    from public.classes as class_row
    where class_row.id = teacher_resources.class_id
      and class_row.teacher_id = auth.uid()
  )
)
with check (
  app_private.is_teacher()
  and resource_scope = 'cambridge_class'
  and created_by = auth.uid()
  and exists (
    select 1
    from public.classes as class_row
    where class_row.id = teacher_resources.class_id
      and class_row.teacher_id = auth.uid()
  )
);

drop policy if exists "Teachers can delete own class resources"
on public.teacher_resources;

create policy "Teachers can delete own class resources"
on public.teacher_resources
for delete
to authenticated
using (
  app_private.is_teacher()
  and resource_scope = 'cambridge_class'
  and created_by = auth.uid()
  and exists (
    select 1
    from public.classes as class_row
    where class_row.id = teacher_resources.class_id
      and class_row.teacher_id = auth.uid()
  )
);

-- Class-scoped files are private and intentionally have no application-level
-- type or size allow-list; the storage provider remains the enforcement point.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('class-resources', 'class-resources', false, null, null)
on conflict (id) do update
set name = excluded.name,
    public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "No direct access to private class resources"
on storage.objects;

create policy "No direct access to private class resources"
on storage.objects
for all
to authenticated
using (bucket_id = 'class-resources' and false)
with check (bucket_id = 'class-resources' and false);

commit;
