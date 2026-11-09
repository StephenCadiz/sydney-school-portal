-- Read-path indexes for the portal's high-frequency unread and mailbox queries.
-- This migration is intentionally additive: it changes no rows and removes no
-- existing indexes. Apply it only after reviewing the Supabase Database Health
-- query plan on the target project.

create index if not exists messages_recipient_unread_idx
  on public.messages (receiver_id, created_at desc)
  where recipient_group is null
    and read_at is null
    and recipient_deleted_at is null;

create index if not exists messages_sender_mailbox_idx
  on public.messages (sender_id, created_at desc)
  where sender_deleted_at is null;

create index if not exists messages_admin_receiver_dealt_idx
  on public.messages (receiver_id, dealt_with_at, created_at desc)
  where admin_deleted_at is null;

create index if not exists messages_admin_group_dealt_idx
  on public.messages (recipient_group, dealt_with_at, created_at desc)
  where admin_deleted_at is null
    and recipient_group = 'admin';

create index if not exists chat_participants_active_profile_idx
  on public.chat_participants (profile_id, conversation_id)
  where left_at is null;

create index if not exists chat_messages_conversation_sender_idx
  on public.chat_messages (conversation_id, sender_id, created_at desc);

create index if not exists chat_message_reads_message_reader_idx
  on public.chat_message_reads (message_id, reader_id);

create index if not exists announcement_reads_user_announcement_idx
  on public.announcement_reads (user_id, announcement_id);
