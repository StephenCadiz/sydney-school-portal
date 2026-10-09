-- Separate staff chat model. Existing email-style messages remain unchanged.
create table if not exists public.chat_conversations (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('direct', 'group')),
  direct_key text unique,
  name text,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_message_at timestamptz
);

create table if not exists public.chat_participants (
  conversation_id uuid not null references public.chat_conversations(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  last_read_at timestamptz,
  primary key (conversation_id, profile_id)
);

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.chat_conversations(id) on delete cascade,
  sender_id uuid not null references public.profiles(id),
  body text not null check (char_length(trim(body)) between 1 and 10000),
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  unique (conversation_id, sender_id, idempotency_key)
);

create table if not exists public.chat_message_reads (
  message_id uuid not null references public.chat_messages(id) on delete cascade,
  reader_id uuid not null references public.profiles(id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (message_id, reader_id)
);

create table if not exists public.chat_attachments (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.chat_messages(id) on delete cascade,
  storage_path text not null unique,
  file_name text not null,
  mime_type text not null,
  byte_size bigint not null check (byte_size > 0),
  created_at timestamptz not null default now()
);

create index if not exists chat_participants_profile_idx on public.chat_participants(profile_id, conversation_id);
create index if not exists chat_messages_conversation_idx on public.chat_messages(conversation_id, created_at desc);
create index if not exists chat_attachments_message_idx on public.chat_attachments(message_id);

create or replace function app_private.chat_profile_id()
returns uuid
language sql
stable
security definer
set search_path = public, auth, pg_temp
as $$
  select p.id
  from public.profiles p
  left join auth.users u on u.id = auth.uid()
  where (p.id = auth.uid() or (u.email is not null and lower(p.email) = lower(u.email)))
    and p.role in ('admin', 'teacher')
    and coalesce(p.active, true)
  order by (p.id = auth.uid()) desc
  limit 1
$$;

revoke all on function app_private.chat_profile_id() from public;
grant execute on function app_private.chat_profile_id() to authenticated;

create or replace function app_private.is_chat_member(p_conversation_id uuid, p_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.chat_participants cp
    where cp.conversation_id = p_conversation_id
      and cp.profile_id = p_profile_id
      and cp.left_at is null
  )
$$;

revoke all on function app_private.is_chat_member(uuid, uuid) from public;
grant execute on function app_private.is_chat_member(uuid, uuid) to authenticated;

alter table public.chat_conversations enable row level security;
alter table public.chat_participants enable row level security;
alter table public.chat_messages enable row level security;
alter table public.chat_message_reads enable row level security;
alter table public.chat_attachments enable row level security;

revoke all on public.chat_conversations, public.chat_participants, public.chat_messages, public.chat_message_reads, public.chat_attachments from anon, authenticated;
grant all on public.chat_conversations, public.chat_participants, public.chat_messages, public.chat_message_reads, public.chat_attachments to service_role;

create policy chat_conversations_participant_select on public.chat_conversations
  for select to authenticated using (
    app_private.is_chat_member(id, app_private.chat_profile_id())
  );
create policy chat_participants_self_select on public.chat_participants
  for select to authenticated using (
    profile_id = app_private.chat_profile_id()
    or app_private.is_chat_member(conversation_id, app_private.chat_profile_id())
  );
create policy chat_messages_participant_select on public.chat_messages
  for select to authenticated using (
    app_private.is_chat_member(conversation_id, app_private.chat_profile_id())
  );
create policy chat_reads_participant_select on public.chat_message_reads
  for select to authenticated using (reader_id = app_private.chat_profile_id());
create policy chat_attachments_participant_select on public.chat_attachments
  for select to authenticated using (
    exists (select 1 from public.chat_messages m where m.id = message_id and app_private.is_chat_member(m.conversation_id, app_private.chat_profile_id()))
  );

comment on table public.chat_conversations is 'Private staff chat conversations; use server routes for writes.';
comment on table public.chat_participants is 'Participant membership for private staff chat conversations.';
comment on table public.chat_messages is 'Private staff chat messages with sender-scoped idempotency.';
comment on table public.chat_attachments is 'Private signed-download metadata for staff chat attachments.';
