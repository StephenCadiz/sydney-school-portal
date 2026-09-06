begin;

create table public.syllabuses (
  id uuid primary key default gen_random_uuid(),
  academic_year_id uuid not null,
  level_id bigint not null,
  title text not null,
  status text not null default 'draft',
  created_by uuid not null,
  updated_by uuid not null,
  published_by uuid null,
  published_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint syllabuses_academic_year_id_fkey
    foreign key (academic_year_id)
    references public.academic_years(id)
    on delete restrict,
  constraint syllabuses_level_id_fkey
    foreign key (level_id)
    references public.levels(id)
    on delete restrict,
  constraint syllabuses_created_by_fkey
    foreign key (created_by)
    references public.profiles(id)
    on delete restrict,
  constraint syllabuses_updated_by_fkey
    foreign key (updated_by)
    references public.profiles(id)
    on delete restrict,
  constraint syllabuses_published_by_fkey
    foreign key (published_by)
    references public.profiles(id)
    on delete restrict,
  constraint syllabuses_academic_year_level_key
    unique (academic_year_id, level_id),
  constraint syllabuses_title_check
    check (
      title = btrim(title)
      and length(title) between 1 and 160
    ),
  constraint syllabuses_status_check
    check (status in ('draft', 'published')),
  constraint syllabuses_publication_state_check
    check (
      (
        status = 'draft'
        and published_by is null
        and published_at is null
      )
      or
      (
        status = 'published'
        and published_by is not null
        and published_at is not null
      )
    )
);

create table public.syllabus_units (
  id uuid primary key default gen_random_uuid(),
  syllabus_id uuid not null,
  title text not null,
  pages_text text not null default '',
  content_text text not null,
  target_completion_date date not null,
  exam_week_start_date date null,
  exam_week_end_date date null,
  exam_information text not null default '',
  sort_order integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint syllabus_units_syllabus_id_fkey
    foreign key (syllabus_id)
    references public.syllabuses(id)
    on delete cascade,
  constraint syllabus_units_title_check
    check (
      title = btrim(title)
      and length(title) between 1 and 160
    ),
  constraint syllabus_units_pages_check
    check (length(pages_text) <= 1000),
  constraint syllabus_units_content_check
    check (
      content_text = btrim(content_text)
      and length(content_text) between 1 and 6000
    ),
  constraint syllabus_units_exam_information_check
    check (length(exam_information) <= 3000),
  constraint syllabus_units_exam_date_order_check
    check (
      exam_week_start_date is null
      or exam_week_end_date is null
      or exam_week_end_date >= exam_week_start_date
    ),
  constraint syllabus_units_sort_order_check
    check (sort_order > 0),
  constraint syllabus_units_syllabus_sort_key
    unique (syllabus_id, sort_order)
);

create table public.syllabus_unit_materials (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null,
  material_type text not null,
  label text not null,
  description text not null default '',
  external_url text null,
  storage_path text null,
  original_filename text null,
  mime_type text null,
  file_size bigint null,
  sort_order integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint syllabus_unit_materials_unit_id_fkey
    foreign key (unit_id)
    references public.syllabus_units(id)
    on delete cascade,
  constraint syllabus_unit_materials_type_check
    check (material_type in ('file', 'link')),
  constraint syllabus_unit_materials_label_check
    check (
      label = btrim(label)
      and length(label) between 1 and 160
    ),
  constraint syllabus_unit_materials_description_check
    check (length(description) <= 1000),
  constraint syllabus_unit_materials_source_check
    check (
      (
        material_type = 'link'
        and external_url is not null
        and external_url = btrim(external_url)
        and external_url ~ '^https://[^[:space:]]+$'
        and storage_path is null
        and original_filename is null
        and mime_type is null
        and file_size is null
      )
      or
      (
        material_type = 'file'
        and external_url is null
        and nullif(btrim(storage_path), '') is not null
        and nullif(btrim(original_filename), '') is not null
        and nullif(btrim(mime_type), '') is not null
        and file_size > 0
      )
    ),
  constraint syllabus_unit_materials_sort_order_check
    check (sort_order > 0),
  constraint syllabus_unit_materials_unit_sort_key
    unique (unit_id, sort_order)
);

create index syllabuses_status_year_level_idx
on public.syllabuses (status, academic_year_id, level_id);

create index syllabus_units_syllabus_order_idx
on public.syllabus_units (syllabus_id, sort_order);

create index syllabus_unit_materials_unit_order_idx
on public.syllabus_unit_materials (unit_id, sort_order);

create index syllabus_unit_materials_storage_path_idx
on public.syllabus_unit_materials (storage_path)
where storage_path is not null;

create or replace function public.set_syllabus_record_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger syllabuses_set_updated_at
before update on public.syllabuses
for each row
execute function public.set_syllabus_record_updated_at();

create trigger syllabus_units_set_updated_at
before update on public.syllabus_units
for each row
execute function public.set_syllabus_record_updated_at();

create trigger syllabus_unit_materials_set_updated_at
before update on public.syllabus_unit_materials
for each row
execute function public.set_syllabus_record_updated_at();

create or replace function public.touch_syllabus_from_unit()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_syllabus_id uuid;
begin
  v_syllabus_id := case when tg_op = 'DELETE' then old.syllabus_id else new.syllabus_id end;
  update public.syllabuses
  set updated_at = now()
  where id = v_syllabus_id;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger syllabus_units_touch_syllabus
after insert or update or delete on public.syllabus_units
for each row
execute function public.touch_syllabus_from_unit();

create or replace function public.touch_syllabus_from_material()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_unit_id uuid;
begin
  v_unit_id := case when tg_op = 'DELETE' then old.unit_id else new.unit_id end;
  update public.syllabuses syllabus
  set updated_at = now()
  from public.syllabus_units unit_row
  where unit_row.id = v_unit_id
    and syllabus.id = unit_row.syllabus_id;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger syllabus_unit_materials_touch_syllabus
after insert or update or delete on public.syllabus_unit_materials
for each row
execute function public.touch_syllabus_from_material();

create or replace function public.reorder_syllabus_units(
  p_actor_id uuid,
  p_syllabus_id uuid,
  p_unit_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  v_expected_count integer;
begin
  if not exists (
    select 1
    from public.profiles
    where id = p_actor_id
      and role = 'admin'
  ) then
    raise exception 'Admin access required.' using errcode = '42501';
  end if;

  if p_syllabus_id is null or p_unit_ids is null or cardinality(p_unit_ids) = 0 then
    raise exception 'A complete unit order is required.' using errcode = '22023';
  end if;

  perform 1
  from public.syllabuses
  where id = p_syllabus_id
  for update;

  if not found then
    raise exception 'Syllabus was not found.' using errcode = 'P0002';
  end if;

  select count(*)
  into v_expected_count
  from public.syllabus_units
  where syllabus_id = p_syllabus_id;

  if v_expected_count <> cardinality(p_unit_ids)
    or v_expected_count <> (
      select count(distinct requested.unit_id)
      from unnest(p_unit_ids) as requested(unit_id)
    )
    or exists (
      select 1
      from unnest(p_unit_ids) as requested(unit_id)
      left join public.syllabus_units unit_row
        on unit_row.id = requested.unit_id
       and unit_row.syllabus_id = p_syllabus_id
      where unit_row.id is null
    ) then
    raise exception 'The unit order must contain every unit exactly once.' using errcode = '22023';
  end if;

  update public.syllabus_units
  set sort_order = sort_order + 1000000
  where syllabus_id = p_syllabus_id;

  update public.syllabus_units unit_row
  set sort_order = requested.ordinality::integer
  from unnest(p_unit_ids) with ordinality as requested(unit_id, ordinality)
  where unit_row.id = requested.unit_id
    and unit_row.syllabus_id = p_syllabus_id;

  update public.syllabuses
  set updated_by = p_actor_id
  where id = p_syllabus_id;
end;
$$;

create or replace function public.reorder_syllabus_materials(
  p_actor_id uuid,
  p_syllabus_id uuid,
  p_unit_id uuid,
  p_material_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  v_expected_count integer;
begin
  if not exists (
    select 1
    from public.profiles
    where id = p_actor_id
      and role = 'admin'
  ) then
    raise exception 'Admin access required.' using errcode = '42501';
  end if;

  if p_unit_id is null or p_material_ids is null or cardinality(p_material_ids) = 0 then
    raise exception 'A complete material order is required.' using errcode = '22023';
  end if;

  perform 1
  from public.syllabus_units
  where id = p_unit_id
    and syllabus_id = p_syllabus_id
  for update;

  if not found then
    raise exception 'Syllabus unit was not found.' using errcode = 'P0002';
  end if;

  select count(*)
  into v_expected_count
  from public.syllabus_unit_materials
  where unit_id = p_unit_id;

  if v_expected_count <> cardinality(p_material_ids)
    or v_expected_count <> (
      select count(distinct requested.material_id)
      from unnest(p_material_ids) as requested(material_id)
    )
    or exists (
      select 1
      from unnest(p_material_ids) as requested(material_id)
      left join public.syllabus_unit_materials material
        on material.id = requested.material_id
       and material.unit_id = p_unit_id
      where material.id is null
    ) then
    raise exception 'The material order must contain every material exactly once.' using errcode = '22023';
  end if;

  update public.syllabus_unit_materials
  set sort_order = sort_order + 1000000
  where unit_id = p_unit_id;

  update public.syllabus_unit_materials material
  set sort_order = requested.ordinality::integer
  from unnest(p_material_ids) with ordinality as requested(material_id, ordinality)
  where material.id = requested.material_id
    and material.unit_id = p_unit_id;

  update public.syllabuses
  set updated_by = p_actor_id
  where id = p_syllabus_id;
end;
$$;

revoke all on function public.reorder_syllabus_units(uuid, uuid, uuid[])
from public, anon, authenticated;
revoke all on function public.reorder_syllabus_materials(uuid, uuid, uuid, uuid[])
from public, anon, authenticated;
grant execute on function public.reorder_syllabus_units(uuid, uuid, uuid[])
to service_role;
grant execute on function public.reorder_syllabus_materials(uuid, uuid, uuid, uuid[])
to service_role;

alter table public.syllabuses enable row level security;
alter table public.syllabus_units enable row level security;
alter table public.syllabus_unit_materials enable row level security;

revoke all on table public.syllabuses from anon, authenticated;
revoke all on table public.syllabus_units from anon, authenticated;
revoke all on table public.syllabus_unit_materials from anon, authenticated;

comment on table public.syllabuses is
  'Admin-managed annual level syllabuses. Access is provided only through protected server APIs.';
comment on column public.syllabuses.status is
  'Draft syllabuses are Admin-only. Published syllabuses may be returned to the assigned Teacher of an eligible class.';
comment on column public.syllabus_unit_materials.storage_path is
  'Private teacher-resources bucket path. Never return this value from Teacher APIs.';

commit;
