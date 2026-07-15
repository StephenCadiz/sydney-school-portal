-- Level-wide, teacher-only resource library.
-- shared_teacher resources are contributed by teachers for levels they teach.
-- official_teacher resources are managed by Admin and visible to teachers by level.
-- Uploaded files stay in a private bucket and will be opened with temporary signed URLs.

create schema if not exists app_private;

create or replace function app_private.teacher_teaches_level(target_level_id bigint)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select auth.uid() is not null
    and target_level_id is not null
    and exists (
      select 1
      from public.classes
      where teacher_id = auth.uid()
        and level_id = target_level_id
    );
$$;

revoke all on function app_private.teacher_teaches_level(bigint) from public;
grant execute on function app_private.teacher_teaches_level(bigint) to authenticated;

create table if not exists public.teacher_resources (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null,
  resource_scope text not null,
  level_id bigint not null references public.levels(id),
  created_by uuid references public.profiles(id) on delete set null,
  external_url text,
  storage_path text,
  original_filename text,
  mime_type text,
  file_size bigint,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint teacher_resources_scope_check
    check (resource_scope in ('shared_teacher', 'official_teacher')),
  constraint teacher_resources_title_check
    check (
      length(btrim(title)) > 0
      and length(btrim(title)) <= 120
    ),
  constraint teacher_resources_description_check
    check (
      length(btrim(description)) > 0
      and length(btrim(description)) <= 500
    ),
  constraint teacher_resources_source_check
    check (
      (
        external_url is not null
        and storage_path is null
        and original_filename is null
        and mime_type is null
        and file_size is null
      )
      or
      (
        external_url is null
        and storage_path is not null
        and nullif(btrim(storage_path), '') is not null
        and nullif(btrim(original_filename), '') is not null
        and nullif(btrim(mime_type), '') is not null
        and file_size > 0
      )
    ),
  constraint teacher_resources_external_url_check
    check (
      external_url is null
      or (
        external_url = btrim(external_url)
        and external_url ~ '^https://[^[:space:]]+$'
      )
    )
);

comment on table public.teacher_resources is
  'Teacher-only level-wide resources. shared_teacher is teacher-contributed; official_teacher is Admin-managed.';
comment on column public.teacher_resources.resource_scope is
  'Allowed values: shared_teacher or official_teacher.';
comment on column public.teacher_resources.level_id is
  'Resources belong to a level, never to an individual class.';
comment on column public.teacher_resources.storage_path is
  'Private Storage object path. Do not store permanent public file URLs.';

create index if not exists teacher_resources_level_id_idx
on public.teacher_resources (level_id);

create index if not exists teacher_resources_scope_level_idx
on public.teacher_resources (resource_scope, level_id);

create index if not exists teacher_resources_created_by_idx
on public.teacher_resources (created_by);

create index if not exists teacher_resources_created_at_idx
on public.teacher_resources (created_at desc);

create or replace function public.set_teacher_resources_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists teacher_resources_set_updated_at
on public.teacher_resources;

create trigger teacher_resources_set_updated_at
before update on public.teacher_resources
for each row
execute function public.set_teacher_resources_updated_at();

alter table public.teacher_resources enable row level security;

drop policy if exists "Admins can read all teacher resources"
on public.teacher_resources;

drop policy if exists "Admins can insert teacher resources"
on public.teacher_resources;

drop policy if exists "Admins can update teacher resources"
on public.teacher_resources;

drop policy if exists "Admins can delete teacher resources"
on public.teacher_resources;

drop policy if exists "Teachers can read resources for taught levels"
on public.teacher_resources;

drop policy if exists "Teachers can insert own shared resources"
on public.teacher_resources;

drop policy if exists "Teachers can update own shared resources"
on public.teacher_resources;

drop policy if exists "Teachers can delete own shared resources"
on public.teacher_resources;

create policy "Admins can read all teacher resources"
on public.teacher_resources
for select
to authenticated
using (
  app_private.is_admin()
);

create policy "Admins can insert teacher resources"
on public.teacher_resources
for insert
to authenticated
with check (
  app_private.is_admin()
);

create policy "Admins can update teacher resources"
on public.teacher_resources
for update
to authenticated
using (
  app_private.is_admin()
)
with check (
  app_private.is_admin()
);

create policy "Admins can delete teacher resources"
on public.teacher_resources
for delete
to authenticated
using (
  app_private.is_admin()
);

create policy "Teachers can read resources for taught levels"
on public.teacher_resources
for select
to authenticated
using (
  app_private.is_teacher()
  and resource_scope in ('shared_teacher', 'official_teacher')
  and app_private.teacher_teaches_level(level_id)
);

create policy "Teachers can insert own shared resources"
on public.teacher_resources
for insert
to authenticated
with check (
  app_private.is_teacher()
  and resource_scope = 'shared_teacher'
  and created_by = auth.uid()
  and app_private.teacher_teaches_level(level_id)
);

create policy "Teachers can update own shared resources"
on public.teacher_resources
for update
to authenticated
using (
  app_private.is_teacher()
  and resource_scope = 'shared_teacher'
  and created_by = auth.uid()
  and app_private.teacher_teaches_level(level_id)
)
with check (
  app_private.is_teacher()
  and resource_scope = 'shared_teacher'
  and created_by = auth.uid()
  and app_private.teacher_teaches_level(level_id)
);

create policy "Teachers can delete own shared resources"
on public.teacher_resources
for delete
to authenticated
using (
  app_private.is_teacher()
  and resource_scope = 'shared_teacher'
  and created_by = auth.uid()
  and app_private.teacher_teaches_level(level_id)
);

-- Private bucket only. Future server routes will verify access and create signed URLs.
insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'teacher-resources',
  'teacher-resources',
  false,
  52428800,
  array[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'image/jpeg',
    'image/png',
    'image/webp',
    'audio/mpeg',
    'audio/mp4',
    'audio/x-m4a',
    'audio/m4a'
  ]::text[]
)
on conflict (id) do update
set
  name = excluded.name,
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
