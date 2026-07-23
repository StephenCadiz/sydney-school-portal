begin;

create table if not exists public.friday_tutorial_reminder_reads (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles(id) on delete cascade,
  session_id uuid not null references public.friday_exam_practice_sessions(id) on delete cascade,
  reminder_stage text not null,
  dismissed_at timestamptz not null default now(),
  constraint friday_tutorial_reminder_reads_stage_check
    check (reminder_stage in ('monday', 'thursday')),
  constraint friday_tutorial_reminder_reads_student_session_stage_key
    unique (student_id, session_id, reminder_stage)
);

create index if not exists friday_tutorial_reminder_reads_session_idx
on public.friday_tutorial_reminder_reads (session_id);

alter table public.friday_tutorial_reminder_reads enable row level security;

drop policy if exists "Students can read own Friday tutorial reminder dismissals"
on public.friday_tutorial_reminder_reads;

create policy "Students can read own Friday tutorial reminder dismissals"
on public.friday_tutorial_reminder_reads
for select
to authenticated
using (student_id = auth.uid());

drop policy if exists "Students can insert own Friday tutorial reminder dismissals"
on public.friday_tutorial_reminder_reads;

create policy "Students can insert own Friday tutorial reminder dismissals"
on public.friday_tutorial_reminder_reads
for insert
to authenticated
with check (student_id = auth.uid());

drop policy if exists "Students can update own Friday tutorial reminder dismissals"
on public.friday_tutorial_reminder_reads;

create policy "Students can update own Friday tutorial reminder dismissals"
on public.friday_tutorial_reminder_reads
for update
to authenticated
using (student_id = auth.uid())
with check (student_id = auth.uid());

revoke all on table public.friday_tutorial_reminder_reads from anon;
grant select, insert, update on table public.friday_tutorial_reminder_reads to authenticated;
grant all on table public.friday_tutorial_reminder_reads to service_role;

commit;
