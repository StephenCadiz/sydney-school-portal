-- Keep email-style Messages linked into conversations so replies can be
-- displayed with their original message and the full reply history.

alter table public.messages
  add column if not exists conversation_id uuid;

update public.messages
set conversation_id = id
where conversation_id is null;

alter table public.messages
  alter column conversation_id set default gen_random_uuid(),
  alter column conversation_id set not null;

create index if not exists messages_conversation_created_at_idx
  on public.messages (conversation_id, created_at asc);

comment on column public.messages.conversation_id is
  'Email-style message conversation identifier. Root messages receive a new identifier; replies copy the source message conversation.';
