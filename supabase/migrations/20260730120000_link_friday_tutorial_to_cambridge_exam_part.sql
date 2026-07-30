alter table public.friday_exam_practice_sessions
  add column if not exists cambridge_exam_part_id uuid null;

alter table public.friday_exam_practice_sessions
  alter column pdf_url drop not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname =
      'friday_exam_practice_sessions_cambridge_exam_part_id_fkey'
      and conrelid =
        'public.friday_exam_practice_sessions'::regclass
  ) then
    alter table public.friday_exam_practice_sessions
      add constraint friday_exam_practice_sessions_cambridge_exam_part_id_fkey
      foreign key (cambridge_exam_part_id)
      references public.cambridge_exam_parts(id)
      on delete restrict;
  end if;
end
$$;

create index if not exists
  friday_exam_practice_sessions_cambridge_exam_part_id_idx
on public.friday_exam_practice_sessions (cambridge_exam_part_id);
