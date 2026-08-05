create table if not exists public.admin_staff_permissions (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid not null references public.profiles(id) on delete cascade,
  permission_key text not null,
  created_at timestamptz not null default now(),
  granted_by uuid references public.profiles(id) on delete set null,
  constraint admin_staff_permissions_permission_key_check
    check (permission_key ~ '^[a-z][a-z0-9_]{2,100}$'),
  constraint admin_staff_permissions_admin_permission_key_unique
    unique (admin_id, permission_key)
);

create or replace function public.enforce_admin_staff_permission_role()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_role text;
begin
  select role
  into v_role
  from public.profiles
  where id = new.admin_id;

  if v_role is distinct from 'admin' then
    raise exception 'Admin permissions may only be assigned to Admin profiles.';
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_admin_staff_permission_role
  on public.admin_staff_permissions;

create trigger enforce_admin_staff_permission_role
before insert or update of admin_id
on public.admin_staff_permissions
for each row
execute function public.enforce_admin_staff_permission_role();

alter table public.admin_staff_permissions enable row level security;

revoke all on table public.admin_staff_permissions from anon, authenticated;
grant select, insert, update, delete on table public.admin_staff_permissions to service_role;

alter table public.messages
  add column if not exists admin_deleted_at timestamptz,
  add column if not exists admin_deleted_by uuid
    references public.profiles(id) on delete set null;

create index if not exists messages_admin_visible_queue_idx
  on public.messages (dealt_with_at, created_at desc)
  where admin_deleted_at is null;

create index if not exists messages_admin_visible_sender_idx
  on public.messages (sender_id, created_at desc)
  where admin_deleted_at is null;

insert into public.admin_staff_permissions (admin_id, permission_key)
select p.id, 'delete_admin_messages'
from public.profiles p
join auth.users u on u.id = p.id
where p.role = 'admin'
  and lower(coalesce(u.email, '')) = 'admin@sydneyschool.es'
on conflict (admin_id, permission_key) do nothing;
