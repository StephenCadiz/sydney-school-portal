-- Restrict direct messages to their participants while keeping shared Admin messages global.
drop policy if exists messages_select_allowed
on public.messages;

create policy messages_select_allowed
on public.messages
for select
to authenticated
using (
  (app_private.is_admin() and recipient_group = 'admin')
  or sender_id = auth.uid()
  or receiver_id = auth.uid()
);

-- Anonymous clients must not be able to invoke the read-status RPC.
revoke all on function public.mark_direct_staff_message_as_read(uuid) from public;
revoke all on function public.mark_direct_staff_message_as_read(uuid) from anon;
grant execute on function public.mark_direct_staff_message_as_read(uuid) to authenticated;
grant execute on function public.mark_direct_staff_message_as_read(uuid) to service_role;
