begin;
set local search_path = pg_catalog, public, extensions;

alter table public.classes
  add column if not exists delivery_mode text not null default 'in_person';

update public.classes
set delivery_mode = 'online'
where lower(trim(coalesce(course_type, ''))) = 'online';

alter table public.classes
  drop constraint if exists classes_delivery_mode_check;

alter table public.classes
  add constraint classes_delivery_mode_check
  check (delivery_mode in ('in_person', 'online', 'hybrid'));

create index if not exists classes_cambridge_delivery_mode_idx
  on public.classes(is_cambridge, delivery_mode);

commit;
