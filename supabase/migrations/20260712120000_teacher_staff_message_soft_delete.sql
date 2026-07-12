alter table public.messages
add column if not exists sender_deleted_at timestamptz;

alter table public.messages
add column if not exists recipient_deleted_at timestamptz;

create or replace function public.hide_received_staff_message(p_message_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor_id uuid := auth.uid();
  v_actor_role text;
  v_sender_role text;
  v_message public.messages%rowtype;
begin
  if v_actor_id is null then
    raise exception 'You must be logged in to remove this message.';
  end if;

  select role
  into v_actor_role
  from public.profiles
  where id = v_actor_id;

  if v_actor_role is distinct from 'teacher' then
    raise exception 'Only teachers can remove staff messages from this view.';
  end if;

  select *
  into v_message
  from public.messages
  where id = p_message_id
  for update;

  if not found then
    raise exception 'Message not found.';
  end if;

  if v_message.receiver_id is distinct from v_actor_id then
    raise exception 'You can only remove messages from your own inbox.';
  end if;

  if v_message.read_at is null then
    raise exception 'Open this message before removing it from your inbox.';
  end if;

  select role
  into v_sender_role
  from public.profiles
  where id = v_message.sender_id;

  if coalesce(v_sender_role, '') not in ('admin', 'teacher') then
    raise exception 'Only staff messages can be removed from this view.';
  end if;

  if v_message.recipient_deleted_at is not null then
    return jsonb_build_object('success', true);
  end if;

  update public.messages
  set recipient_deleted_at = now()
  where id = p_message_id
    and receiver_id = v_actor_id
    and recipient_deleted_at is null;

  return jsonb_build_object('success', true);
end;
$$;

create or replace function public.hide_sent_staff_message(p_message_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor_id uuid := auth.uid();
  v_actor_role text;
  v_receiver_role text;
  v_message public.messages%rowtype;
begin
  if v_actor_id is null then
    raise exception 'You must be logged in to remove this message.';
  end if;

  select role
  into v_actor_role
  from public.profiles
  where id = v_actor_id;

  if v_actor_role is distinct from 'teacher' then
    raise exception 'Only teachers can remove staff messages from this view.';
  end if;

  select *
  into v_message
  from public.messages
  where id = p_message_id
  for update;

  if not found then
    raise exception 'Message not found.';
  end if;

  if v_message.sender_id is distinct from v_actor_id then
    raise exception 'You can only remove messages from your own sent view.';
  end if;

  select role
  into v_receiver_role
  from public.profiles
  where id = v_message.receiver_id;

  if coalesce(v_receiver_role, '') not in ('admin', 'teacher') then
    raise exception 'Only staff messages can be removed from this view.';
  end if;

  if v_message.sender_deleted_at is not null then
    return jsonb_build_object('success', true);
  end if;

  update public.messages
  set sender_deleted_at = now()
  where id = p_message_id
    and sender_id = v_actor_id
    and sender_deleted_at is null;

  return jsonb_build_object('success', true);
end;
$$;

revoke all on function public.hide_received_staff_message(uuid) from public;
revoke all on function public.hide_sent_staff_message(uuid) from public;

grant execute on function public.hide_received_staff_message(uuid) to authenticated;
grant execute on function public.hide_sent_staff_message(uuid) to authenticated;
