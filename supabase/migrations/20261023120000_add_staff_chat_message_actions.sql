-- Allow staff to edit or delete their own chat messages for everyone.
alter table public.chat_messages
  add column if not exists edited_at timestamptz,
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references public.profiles(id);

comment on column public.chat_messages.edited_at is 'When the sender last edited the message.';
comment on column public.chat_messages.deleted_at is 'When the sender deleted the message for all participants.';
comment on column public.chat_messages.deleted_by is 'The sender who deleted the message.';
