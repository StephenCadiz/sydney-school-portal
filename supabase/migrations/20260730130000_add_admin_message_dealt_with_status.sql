alter table public.messages
  add column dealt_with_at timestamptz null,
  add column dealt_with_by uuid null
    references public.profiles(id)
    on delete set null;

create index messages_dealt_with_at_created_at_idx
  on public.messages (dealt_with_at, created_at desc);
