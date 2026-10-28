begin;

alter table public.follow_up_entries
  add column if not exists author_role text not null default 'teacher';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.follow_up_entries'::regclass
      and conname = 'follow_up_entries_author_role_check'
  ) then
    alter table public.follow_up_entries
      add constraint follow_up_entries_author_role_check
      check (author_role in ('teacher', 'admin'));
  end if;
end;
$$;

alter table public.follow_up_documents
  add column if not exists last_admin_action_at timestamptz;

alter table public.follow_up_documents
  add column if not exists teacher_action_seen_at timestamptz;

create index if not exists follow_up_documents_teacher_action_idx
  on public.follow_up_documents (teacher_id, last_admin_action_at)
  where last_admin_action_at is not null;

comment on column public.follow_up_entries.author_role is
  'Role of the staff member who wrote the dated follow-up entry.';

comment on column public.follow_up_documents.last_admin_action_at is
  'Timestamp of the latest action recorded by Admin for this follow-up.';

comment on column public.follow_up_documents.teacher_action_seen_at is
  'Latest Admin action timestamp opened by the responsible teacher.';

commit;
