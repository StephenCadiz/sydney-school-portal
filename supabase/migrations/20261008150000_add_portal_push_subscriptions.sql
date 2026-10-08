create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check (role in ('teacher', 'student')),
  endpoint text not null,
  expiration_time bigint,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, endpoint)
);

create index if not exists push_subscriptions_user_idx on public.push_subscriptions(user_id);

create table if not exists public.push_notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references public.push_subscriptions(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  event_key text not null,
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  unique (subscription_id, event_key)
);

alter table public.push_subscriptions enable row level security;
alter table public.push_notification_deliveries enable row level security;
revoke all on public.push_subscriptions from anon, authenticated;
revoke all on public.push_notification_deliveries from anon, authenticated;
grant all on public.push_subscriptions to service_role;
grant all on public.push_notification_deliveries to service_role;

comment on table public.push_subscriptions is 'Private Teacher/Student browser push subscriptions; accessed only by authorized server routes.';
comment on table public.push_notification_deliveries is 'Idempotency records for server-side portal push delivery.';
