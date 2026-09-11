-- Replace the stale profile-id checks with the current Admin profile identity.
drop policy if exists "Teachers can send private Rosa staff messages"
on public.messages;

drop policy if exists "Rosa can send private staff replies"
on public.messages;

create policy "Teachers can send private Rosa staff messages"
on public.messages
for insert
to authenticated
with check (
  auth.uid() = sender_id
  and app_private.is_teacher()
  and recipient_group is null
  and receiver_id is not null
  and receiver_id <> auth.uid()
  and exists (
    select 1
    from public.profiles receiver_profile
    where receiver_profile.id = receiver_id
      and receiver_profile.role = 'admin'
      and lower(trim(receiver_profile.first_name)) like 'rosa%'
      and lower(trim(receiver_profile.last_name)) = 'vara'
  )
);

create policy "Rosa can send private staff replies"
on public.messages
for insert
to authenticated
with check (
  auth.uid() = sender_id
  and recipient_group is null
  and receiver_id is not null
  and receiver_id <> sender_id
  and exists (
    select 1
    from public.profiles sender_profile
    where sender_profile.id = sender_id
      and sender_profile.role = 'admin'
      and lower(trim(sender_profile.first_name)) like 'rosa%'
      and lower(trim(sender_profile.last_name)) = 'vara'
  )
  and exists (
    select 1
    from public.profiles receiver_profile
    where receiver_profile.id = receiver_id
      and receiver_profile.role in ('admin', 'teacher')
  )
);
