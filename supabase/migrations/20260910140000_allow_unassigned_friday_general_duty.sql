alter table public.friday_at_6_duties
  alter column teacher_id drop not null;

comment on column public.friday_at_6_duties.teacher_id is
  'General Tutorial Duty teacher; null when only the separate B1 Tutorial Duty remains assigned.';
