create table if not exists public.push_notification_queue (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  event_key text not null,
  title text not null,
  body text not null,
  url text not null default '/',
  tag text,
  available_at timestamptz not null,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, event_key)
);

create index if not exists push_notification_queue_pending_idx
  on public.push_notification_queue (available_at)
  where sent_at is null;

alter table public.push_notification_queue enable row level security;
revoke all on public.push_notification_queue from anon, authenticated;
grant all on public.push_notification_queue to service_role;

comment on table public.push_notification_queue is
  'Queued automated Student PWA notifications released during the Madrid 10:00–22:00 delivery window.';
