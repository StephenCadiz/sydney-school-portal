alter table public.messages
add column if not exists recipient_group text;

alter table public.messages
alter column receiver_id drop not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'messages_recipient_group_supported_check'
      and conrelid = 'public.messages'::regclass
  ) then
    alter table public.messages
    add constraint messages_recipient_group_supported_check
    check (
      recipient_group is null
      or recipient_group = 'admin'
    );
  end if;
end
$$;

create schema if not exists app_private;

do $$
begin
  if to_regprocedure('app_private.is_admin()') is null then
    execute $function$
      create function app_private.is_admin()
      returns boolean
      language sql
      stable
      security definer
      set search_path = public, pg_temp
      as $body$
        select exists (
          select 1
          from public.profiles
          where id = auth.uid()
            and role = 'admin'
        )
      $body$
    $function$;

    revoke all on function app_private.is_admin() from public;
    grant execute on function app_private.is_admin() to authenticated;
  end if;
end
$$;

do $$
begin
  if to_regprocedure('app_private.is_teacher()') is null then
    execute $function$
      create function app_private.is_teacher()
      returns boolean
      language sql
      stable
      security definer
      set search_path = public, pg_temp
      as $body$
        select exists (
          select 1
          from public.profiles
          where id = auth.uid()
            and role = 'teacher'
        )
      $body$
    $function$;

    revoke all on function app_private.is_teacher() from public;
    grant execute on function app_private.is_teacher() to authenticated;
  end if;
end
$$;

create or replace function public.mark_shared_admin_message_as_read(
  p_message_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor_id uuid := auth.uid();
  v_message public.messages%rowtype;
begin
  if v_actor_id is null then
    raise exception 'You must be logged in to mark this message as read.';
  end if;

  if not app_private.is_admin() then
    raise exception 'Only admins can mark shared admin messages as read.';
  end if;

  select *
  into v_message
  from public.messages
  where id = p_message_id
  for update;

  if not found then
    raise exception 'Message not found.';
  end if;

  if v_message.recipient_group is distinct from 'admin'
    or v_message.receiver_id is not null then
    raise exception 'This is not a shared admin message.';
  end if;

  update public.messages
  set read_at = coalesce(read_at, now())
  where id = p_message_id
    and recipient_group = 'admin'
    and receiver_id is null
    and read_at is null;

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

  if not (
    v_message.recipient_group = 'admin'
    and v_message.receiver_id is null
  ) then
    select role
    into v_receiver_role
    from public.profiles
    where id = v_message.receiver_id;

    if coalesce(v_receiver_role, '') not in ('admin', 'teacher') then
      raise exception 'Only staff messages can be removed from this view.';
    end if;
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

revoke all on function public.mark_shared_admin_message_as_read(uuid) from public;
grant execute on function public.mark_shared_admin_message_as_read(uuid) to authenticated;

revoke all on function public.hide_sent_staff_message(uuid) from public;
grant execute on function public.hide_sent_staff_message(uuid) to authenticated;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'messages'
      and policyname = 'Teachers can insert shared admin messages'
  ) then
    execute $policy$
      create policy "Teachers can insert shared admin messages"
      on public.messages
      for insert
      to authenticated
      with check (
        auth.uid() = sender_id
        and app_private.is_teacher()
        and recipient_group = 'admin'
        and receiver_id is null
      )
    $policy$;
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'messages'
      and policyname = 'Admins can read shared admin messages'
  ) then
    execute $policy$
      create policy "Admins can read shared admin messages"
      on public.messages
      for select
      to authenticated
      using (
        app_private.is_admin()
        and recipient_group = 'admin'
      )
    $policy$;
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'messages'
      and policyname = 'Teachers can read own sent shared admin messages'
  ) then
    execute $policy$
      create policy "Teachers can read own sent shared admin messages"
      on public.messages
      for select
      to authenticated
      using (
        auth.uid() = sender_id
        and app_private.is_teacher()
        and recipient_group = 'admin'
      )
    $policy$;
  end if;
end
$$;
