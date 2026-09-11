-- Allow Admin users to send teacher-directed messages through the shared Admin identity.
-- The existing Rosa-specific policy continues to protect direct Rosa messages.
drop policy if exists "Admins can send shared staff messages"
on public.messages;

create policy "Admins can send shared staff messages"
on public.messages
for insert
to authenticated
with check (
  auth.uid() = sender_id
  and app_private.is_admin()
  and recipient_group = 'admin'
  and receiver_id is not null
  and exists (
    select 1
    from public.profiles receiver_profile
    where receiver_profile.id = receiver_id
      and receiver_profile.role = 'teacher'
  )
);

-- Teacher-directed shared Admin messages are still read by their teacher recipient.
-- Keep the RPC participant-scoped while allowing that per-message identity mode.
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
    and receiver_id = v_actor_id;

  if not found then
    raise exception 'Message not found.';
  end if;

  return jsonb_build_object('success', true);
end;
$$;

revoke all on function public.mark_direct_staff_message_as_read(uuid) from public;
revoke all on function public.mark_direct_staff_message_as_read(uuid) from anon;
grant execute on function public.mark_direct_staff_message_as_read(uuid) to authenticated;
grant execute on function public.mark_direct_staff_message_as_read(uuid) to service_role;
