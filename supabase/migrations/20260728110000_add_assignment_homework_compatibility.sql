-- Phase 3A: durable assignment identity for Cambridge weekly homework.
-- Legacy result and homework-read rows remain unchanged.

alter table public.results
add column cambridge_exam_assignment_id uuid;

alter table public.results
add constraint results_cambridge_exam_assignment_id_fkey
foreign key (cambridge_exam_assignment_id)
references public.cambridge_exam_assignments(id)
on delete restrict;

create index results_cambridge_exam_assignment_id_idx
on public.results (cambridge_exam_assignment_id);

create unique index results_student_assignment_unique_idx
on public.results (student_id, cambridge_exam_assignment_id)
where cambridge_exam_assignment_id is not null;

create table public.student_assignment_homework_reads (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null,
  cambridge_exam_assignment_id uuid not null,
  viewed_at timestamptz not null default now(),
  constraint student_assignment_homework_reads_student_id_fkey
    foreign key (student_id)
    references public.profiles(id)
    on delete cascade,
  constraint student_assignment_homework_reads_assignment_id_fkey
    foreign key (cambridge_exam_assignment_id)
    references public.cambridge_exam_assignments(id)
    on delete cascade,
  constraint student_assignment_homework_reads_student_assignment_unique
    unique (student_id, cambridge_exam_assignment_id)
);

create index student_assignment_homework_reads_assignment_id_idx
on public.student_assignment_homework_reads (cambridge_exam_assignment_id);

alter table public.student_assignment_homework_reads enable row level security;

revoke all on table public.student_assignment_homework_reads
from public, anon, authenticated;

grant select, insert, update, delete
on table public.student_assignment_homework_reads
to service_role;
