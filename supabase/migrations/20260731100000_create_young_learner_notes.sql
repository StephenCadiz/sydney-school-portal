create table public.young_learner_notes (
  id uuid primary key default gen_random_uuid(),
  young_learner_id uuid not null
    references public.young_learners(id) on delete cascade,
  class_id uuid not null
    references public.classes(id) on delete restrict,
  note text not null check (length(btrim(note)) between 1 and 4000),
  created_by uuid null
    references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index young_learner_notes_learner_class_created_idx
  on public.young_learner_notes (young_learner_id, class_id, created_at desc);

alter table public.young_learner_notes enable row level security;

revoke all on table public.young_learner_notes from anon, authenticated;

grant select, insert, update, delete
  on table public.young_learner_notes to service_role;
