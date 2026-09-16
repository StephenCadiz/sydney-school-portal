-- Cambridge student portal access is an explicit, auditable link between an
-- application profile and an Auth account.  Existing profiles whose id is also
-- an Auth user continue to work without a mapping row.
begin;

create table if not exists public.student_portal_accounts (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  auth_user_id uuid not null unique references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists student_portal_accounts_auth_user_idx
  on public.student_portal_accounts(auth_user_id);

alter table public.student_portal_accounts enable row level security;
revoke all on public.student_portal_accounts from public, anon, authenticated;
grant select on public.student_portal_accounts to authenticated;
grant all on public.student_portal_accounts to service_role;

drop policy if exists student_portal_accounts_select on public.student_portal_accounts;
create policy student_portal_accounts_select
on public.student_portal_accounts
for select
to authenticated
using (
  auth.uid() = auth_user_id
  or exists (
    select 1 from public.profiles actor
    where actor.id = auth.uid() and actor.role = 'admin'
      and actor.active is distinct from false
  )
  or exists (
    select 1
    from public.profiles actor
    join public.classes c on c.teacher_id = actor.id
    join public.class_enrolment_periods e on e.class_id = c.id
    where actor.id = auth.uid() and actor.role = 'teacher'
      and e.student_type = 'profile'
      and e.profile_student_id = student_portal_accounts.profile_id
      and e.cancelled_at is null
      and (e.ends_before is null or e.ends_before > (now() at time zone 'Europe/Madrid')::date)
  )
);

create or replace function public.touch_student_portal_account_updated_at()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
alter function public.touch_student_portal_account_updated_at() owner to postgres;
revoke all on function public.touch_student_portal_account_updated_at() from public, anon, authenticated;

drop trigger if exists student_portal_accounts_touch_updated_at on public.student_portal_accounts;
create trigger student_portal_accounts_touch_updated_at
before update on public.student_portal_accounts
for each row execute function public.touch_student_portal_account_updated_at();

commit;
