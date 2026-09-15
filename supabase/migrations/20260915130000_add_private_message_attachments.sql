-- Private, multi-file attachments for messages.
-- Files are uploaded and opened only through authenticated server routes. The
-- storage bucket intentionally has no authenticated object policy; service role
-- routes create short-lived signed URLs after checking message visibility.

alter table public.messages
  add column if not exists attachments jsonb not null default '[]'::jsonb;

comment on column public.messages.attachments is
  'JSON array of private message attachment metadata: id, name, type, size, path.';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'messages_attachments_array_check'
      and conrelid = 'public.messages'::regclass
  ) then
    alter table public.messages
      add constraint messages_attachments_array_check
      check (jsonb_typeof(attachments) = 'array');
  end if;
end;
$$;

create or replace function public.validate_message_attachments()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  item jsonb;
  attachment_id text;
  attachment_name text;
  attachment_type text;
  attachment_path text;
  attachment_size bigint;
begin
  if new.attachments is null then
    new.attachments := '[]'::jsonb;
  end if;

  if jsonb_typeof(new.attachments) <> 'array' then
    raise exception 'Message attachments must be an array.' using errcode = '22023';
  end if;

  if jsonb_array_length(new.attachments) > 10 then
    raise exception 'A message may contain at most 10 attachments.' using errcode = '22023';
  end if;

  for item in select value from jsonb_array_elements(new.attachments)
  loop
    if jsonb_typeof(item) <> 'object' then
      raise exception 'Invalid message attachment metadata.' using errcode = '22023';
    end if;

    attachment_id := nullif(btrim(item->>'id'), '');
    attachment_name := nullif(btrim(item->>'name'), '');
    attachment_type := nullif(btrim(item->>'type'), '');
    attachment_path := nullif(btrim(item->>'path'), '');
    attachment_size := nullif(item->>'size', '')::bigint;

    if attachment_id is null
      or attachment_id !~ '^[0-9a-fA-F-]{36}$'
      or attachment_name is null
      or attachment_type is null
      or attachment_type not in (
        'application/pdf',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'text/plain',
        'text/csv',
        'image/jpeg',
        'image/png',
        'image/webp',
        'audio/mpeg',
        'audio/mp4',
        'audio/x-m4a',
        'audio/m4a'
      )
      or attachment_path is null
      or attachment_size is null
      or attachment_size <= 0
      or attachment_size > 26214400
      or length(attachment_name) > 255
      or attachment_path <> new.sender_id::text || '/' || attachment_id then
      raise exception 'Invalid message attachment metadata.' using errcode = '22023';
    end if;
  end loop;

  return new;
end;
$$;

alter function public.validate_message_attachments() owner to postgres;

drop trigger if exists messages_validate_attachments
on public.messages;

create trigger messages_validate_attachments
before insert or update of sender_id, attachments on public.messages
for each row
execute function public.validate_message_attachments();

revoke all on function public.validate_message_attachments() from public;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'message-attachments',
  'message-attachments',
  false,
  26214400,
  array[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain',
    'text/csv',
    'image/jpeg',
    'image/png',
    'image/webp',
    'audio/mpeg',
    'audio/mp4',
    'audio/x-m4a',
    'audio/m4a'
  ]::text[]
)
on conflict (id) do update
set
  name = excluded.name,
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Explicit deny policy documents that browser clients never receive direct
-- object access; authenticated server routes use service_role and bypass RLS.
drop policy if exists "No direct access to private message attachments"
on storage.objects;

create policy "No direct access to private message attachments"
on storage.objects
for all
to authenticated
using (bucket_id = 'message-attachments' and false)
with check (bucket_id = 'message-attachments' and false);
