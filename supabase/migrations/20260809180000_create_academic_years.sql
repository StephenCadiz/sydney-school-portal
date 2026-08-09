begin;

create table if not exists public.academic_years (
  id uuid primary key default gen_random_uuid(),
  label text not null unique,
  start_date date not null,
  end_date date not null,
  status text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint academic_years_label_not_blank check (length(trim(label)) > 0),
  constraint academic_years_date_order check (end_date >= start_date),
  constraint academic_years_status_check check (
    status in ('current', 'future', 'archived')
  )
);

create unique index if not exists academic_years_one_current_idx
on public.academic_years ((status))
where status = 'current';

create index if not exists academic_years_dates_idx
on public.academic_years (start_date, end_date);

create or replace function public.set_academic_years_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists academic_years_set_updated_at
on public.academic_years;

create trigger academic_years_set_updated_at
before update on public.academic_years
for each row
execute function public.set_academic_years_updated_at();

insert into public.academic_years (label, start_date, end_date, status)
select
  '2026–2027',
  date '2026-09-01',
  date '2027-06-30',
  case
    when exists (
      select 1
      from public.academic_years
      where status = 'current'
    ) then 'future'
    else 'current'
  end
where not exists (
  select 1
  from public.academic_years
  where upper(trim(label)) in ('2026–2027', '2026-2027')
);

alter table public.classes
  add column if not exists academic_year_id uuid null
  references public.academic_years(id) on delete restrict;

create index if not exists classes_academic_year_id_idx
on public.classes (academic_year_id);

comment on column public.classes.academic_year_id is
  'Annual course context. Null for legacy rows and date-based Intensive/Express courses.';

do $$
declare
  v_student_attnum smallint;
  v_class_attnum smallint;
  v_constraint record;
  v_index record;
  v_dropped_primary_key boolean := false;
  v_has_primary_key boolean;
  v_has_student_class_key boolean;
begin
  select attnum
  into v_student_attnum
  from pg_attribute
  where attrelid = 'public.class_enrolments'::regclass
    and attname = 'student_id'
    and not attisdropped;

  select attnum
  into v_class_attnum
  from pg_attribute
  where attrelid = 'public.class_enrolments'::regclass
    and attname = 'class_id'
    and not attisdropped;

  for v_constraint in
    select conname, contype
    from pg_constraint
    where conrelid = 'public.class_enrolments'::regclass
      and contype in ('p', 'u')
      and conkey = array[v_student_attnum]::smallint[]
  loop
    execute format(
      'alter table public.class_enrolments drop constraint %I',
      v_constraint.conname
    );
    v_dropped_primary_key :=
      v_dropped_primary_key or v_constraint.contype = 'p';
  end loop;

  for v_index in
    select index_namespace.nspname as schema_name,
           index_relation.relname as index_name
    from pg_index index_definition
    join pg_class index_relation
      on index_relation.oid = index_definition.indexrelid
    join pg_namespace index_namespace
      on index_namespace.oid = index_relation.relnamespace
    where index_definition.indrelid = 'public.class_enrolments'::regclass
      and index_definition.indisunique
      and not index_definition.indisprimary
      and index_definition.indnkeyatts = 1
      and split_part(index_definition.indkey::text, ' ', 1)::smallint =
        v_student_attnum
      and not exists (
        select 1
        from pg_constraint backing_constraint
        where backing_constraint.conindid = index_definition.indexrelid
      )
  loop
    execute format(
      'drop index if exists %I.%I',
      v_index.schema_name,
      v_index.index_name
    );
  end loop;

  select exists (
    select 1
    from pg_constraint
    where conrelid = 'public.class_enrolments'::regclass
      and contype = 'p'
  )
  into v_has_primary_key;

  select exists (
    select 1
    from pg_constraint
    where conrelid = 'public.class_enrolments'::regclass
      and contype in ('p', 'u')
      and (
        conkey = array[v_student_attnum, v_class_attnum]::smallint[]
        or conkey = array[v_class_attnum, v_student_attnum]::smallint[]
      )
  )
  into v_has_student_class_key;

  if v_dropped_primary_key and not v_has_primary_key then
    alter table public.class_enrolments
      add constraint class_enrolments_pkey
      primary key (student_id, class_id);
  elsif not v_has_student_class_key then
    alter table public.class_enrolments
      add constraint class_enrolments_student_class_key
      unique (student_id, class_id);
  end if;
end;
$$;

create table if not exists public.young_learner_enrolments (
  id uuid primary key default gen_random_uuid(),
  young_learner_id uuid not null
    references public.young_learners(id) on delete cascade,
  class_id uuid not null
    references public.classes(id) on delete restrict,
  enrolled_at date not null
    default ((now() at time zone 'Europe/Madrid')::date),
  created_at timestamptz not null default now(),
  constraint young_learner_enrolments_learner_class_key
    unique (young_learner_id, class_id)
);

create index if not exists young_learner_enrolments_learner_idx
on public.young_learner_enrolments (young_learner_id, enrolled_at desc);

create index if not exists young_learner_enrolments_class_idx
on public.young_learner_enrolments (class_id);

comment on table public.young_learner_enrolments is
  'Immutable class-assignment history for Young Learners; the class determines the academic year.';

insert into public.young_learner_enrolments (
  young_learner_id,
  class_id,
  enrolled_at,
  created_at
)
select
  learner.id,
  learner.class_id,
  coalesce(
    learner.created_at::date,
    (now() at time zone 'Europe/Madrid')::date
  ),
  coalesce(learner.created_at, now())
from public.young_learners learner
where learner.class_id is not null
on conflict (young_learner_id, class_id) do nothing;

create or replace function public.record_young_learner_enrolment()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.class_id is null then
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if old.class_id is not distinct from new.class_id then
      return new;
    end if;
  end if;

  insert into public.young_learner_enrolments (
    young_learner_id,
    class_id,
    enrolled_at
  )
  values (
    new.id,
    new.class_id,
    (now() at time zone 'Europe/Madrid')::date
  )
  on conflict (young_learner_id, class_id) do nothing;

  return new;
end;
$$;

revoke execute on function public.record_young_learner_enrolment()
from public, anon, authenticated;

drop trigger if exists young_learners_record_enrolment
on public.young_learners;

create trigger young_learners_record_enrolment
after insert or update of class_id on public.young_learners
for each row
execute function public.record_young_learner_enrolment();

create or replace function public.set_current_academic_year(
  p_academic_year_id uuid
)
returns public.academic_years
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_target public.academic_years;
  v_today date := (now() at time zone 'Europe/Madrid')::date;
begin
  perform pg_advisory_xact_lock(hashtext('public.academic_years.current'));

  select *
  into v_target
  from public.academic_years
  where id = p_academic_year_id
  for update;

  if not found then
    raise exception 'Academic year not found.';
  end if;

  update public.academic_years
  set status = case
    when end_date < v_today then 'archived'
    else 'future'
  end
  where status = 'current'
    and id <> p_academic_year_id;

  update public.academic_years
  set status = 'current'
  where id = p_academic_year_id
  returning * into v_target;

  return v_target;
end;
$$;

revoke execute on function public.set_current_academic_year(uuid)
from public, anon, authenticated;
grant execute on function public.set_current_academic_year(uuid)
to service_role;

alter table public.academic_years enable row level security;

drop policy if exists "Admins can read all academic years"
on public.academic_years;
create policy "Admins can read all academic years"
on public.academic_years
for select
to authenticated
using (app_private.is_admin());

drop policy if exists "Authenticated users can read current academic year"
on public.academic_years;
create policy "Authenticated users can read current academic year"
on public.academic_years
for select
to authenticated
using (status = 'current');

revoke all on table public.academic_years from anon;
revoke insert, update, delete, truncate, references, trigger
on table public.academic_years from authenticated;
grant select on table public.academic_years to authenticated;
grant all on table public.academic_years to service_role;

alter table public.young_learner_enrolments enable row level security;
revoke all on table public.young_learner_enrolments from anon, authenticated;
grant all on table public.young_learner_enrolments to service_role;

commit;
