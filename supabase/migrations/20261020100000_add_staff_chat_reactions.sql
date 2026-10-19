-- One optional thumbs-up reaction per staff member and chat message.
create table if not exists public.chat_message_reactions (
  message_id uuid not null references public.chat_messages(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (message_id, profile_id)
);

create index if not exists chat_message_reactions_message_idx
  on public.chat_message_reactions(message_id, created_at);

alter table public.chat_message_reactions enable row level security;

revoke all on public.chat_message_reactions from anon, authenticated;
grant all on public.chat_message_reactions to service_role;

create policy chat_message_reactions_participant_select
  on public.chat_message_reactions
  for select to authenticated using (
    exists (
      select 1
      from public.chat_messages m
      where m.id = message_id
        and app_private.is_chat_member(m.conversation_id, app_private.chat_profile_id())
    )
  );

comment on table public.chat_message_reactions is 'Staff chat thumbs-up reactions; use server routes for writes.';
