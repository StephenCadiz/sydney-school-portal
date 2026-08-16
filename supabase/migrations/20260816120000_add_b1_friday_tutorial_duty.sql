begin;

alter table public.friday_at_6_duties
  add column if not exists b1_teacher_id uuid null
  references public.profiles(id) on delete set null;

comment on column public.friday_at_6_duties.b1_teacher_id is
  'Teacher assigned to B1 Tutorial Duty on Junior 4, Teens 1 and B1 rotation Fridays.';

create index if not exists friday_at_6_duties_b1_teacher_date_idx
  on public.friday_at_6_duties (b1_teacher_id, session_date)
  where b1_teacher_id is not null;

drop policy if exists "B1 duty teachers can read assigned Friday at 6 duties"
  on public.friday_at_6_duties;

create policy "B1 duty teachers can read assigned Friday at 6 duties"
  on public.friday_at_6_duties
  for select
  to authenticated
  using (
    app_private.is_teacher()
    and b1_teacher_id = auth.uid()
  );

commit;
