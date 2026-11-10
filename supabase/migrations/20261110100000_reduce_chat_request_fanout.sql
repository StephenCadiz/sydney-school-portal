-- Consolidate chat list and unread-count reads into server-side queries.
-- The existing server code previously issued one REST request per conversation
-- for the latest preview and another per conversation for unread counts.
-- These functions are callable only by the service role used by server routes.

create or replace function public.chat_latest_messages(p_conversation_ids uuid[])
returns table (
  id uuid,
  conversation_id uuid,
  sender_id uuid,
  body text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select distinct on (m.conversation_id)
    m.id,
    m.conversation_id,
    m.sender_id,
    m.body,
    m.created_at
  from public.chat_messages m
  where m.conversation_id = any(p_conversation_ids)
  order by m.conversation_id, m.created_at desc, m.id desc
$$;

revoke all on function public.chat_latest_messages(uuid[]) from public, anon, authenticated;
grant execute on function public.chat_latest_messages(uuid[]) to service_role;

create or replace function public.chat_unread_counts(
  p_profile_id uuid,
  p_hidden_profile_id uuid
)
returns table (
  conversation_id uuid,
  unread_count bigint
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    cp.conversation_id,
    count(m.id)::bigint as unread_count
  from public.chat_participants cp
  join public.chat_conversations c on c.id = cp.conversation_id
  left join public.chat_messages m
    on m.conversation_id = cp.conversation_id
    and m.sender_id <> p_profile_id
    and (cp.last_read_at is null or m.created_at > cp.last_read_at)
  where cp.profile_id = p_profile_id
    and cp.left_at is null
    and not (
      c.kind = 'direct'
      and exists (
        select 1
        from public.chat_participants hidden_cp
        where hidden_cp.conversation_id = c.id
          and hidden_cp.profile_id = p_hidden_profile_id
          and hidden_cp.left_at is null
      )
    )
  group by cp.conversation_id
$$;

revoke all on function public.chat_unread_counts(uuid, uuid) from public, anon, authenticated;
grant execute on function public.chat_unread_counts(uuid, uuid) to service_role;
