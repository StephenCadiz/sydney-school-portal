drop policy if exists "Teachers can insert teacher staff messages"
on public.messages;

create policy "Teachers can insert teacher staff messages"
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
      and receiver_profile.role = 'teacher'
  )
);
