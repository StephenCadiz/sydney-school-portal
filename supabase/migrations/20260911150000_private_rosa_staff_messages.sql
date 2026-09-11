-- Keep private Rosa conversations participant-only while preserving shared Admin messages.
create policy "Staff participants can read direct staff messages"
on public.messages
for select
to authenticated
using (
  recipient_group is null
  and auth.uid() in (sender_id, receiver_id)
  and exists (
    select 1
    from public.profiles sender_profile
    where sender_profile.id = messages.sender_id
      and sender_profile.role in ('admin', 'teacher')
  )
  and exists (
    select 1
    from public.profiles receiver_profile
    where receiver_profile.id = messages.receiver_id
      and receiver_profile.role in ('admin', 'teacher')
  )
);

-- Teachers may direct a staff message to Rosa only; shared Admin messages use the existing policy.
create policy "Teachers can send private Rosa staff messages"
on public.messages
for insert
to authenticated
with check (
  auth.uid() = sender_id
  and app_private.is_teacher()
  and recipient_group is null
  and receiver_id = '7f4d3e64-94a7-47f0-b069-ed0e77b29369'::uuid
  and receiver_id <> auth.uid()
  and exists (
    select 1
    from public.profiles receiver_profile
    where receiver_profile.id = receiver_id
      and receiver_profile.role in ('admin', 'teacher')
  )
);

-- Keep Rosa's direct replies participant-scoped without broadening Admin visibility.
create policy "Rosa can send private staff replies"
on public.messages
for insert
to authenticated
with check (
  auth.uid() = sender_id
  and sender_id = '7f4d3e64-94a7-47f0-b069-ed0e77b29369'::uuid
  and recipient_group is null
  and receiver_id is not null
  and receiver_id <> sender_id
  and exists (
    select 1
    from public.profiles sender_profile
    where sender_profile.id = sender_id
      and sender_profile.role in ('admin', 'teacher')
  )
  and exists (
    select 1
    from public.profiles receiver_profile
    where receiver_profile.id = receiver_id
      and receiver_profile.role in ('admin', 'teacher')
  )
);

create or replace function public.mark_direct_staff_message_as_read(p_message_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor_id uuid := auth.uid();
begin
  if v_actor_id is null then
    raise exception 'You must be logged in to mark this message as read.';
  end if;

  update public.messages
  set read_at = coalesce(read_at, now())
  where id = p_message_id
    and receiver_id = v_actor_id
    and recipient_group is null;

  if not found then
    raise exception 'Message not found.';
  end if;

  return jsonb_build_object('success', true);
end;
$$;

revoke all on function public.mark_direct_staff_message_as_read(uuid) from public;
grant execute on function public.mark_direct_staff_message_as_read(uuid) to authenticated;
