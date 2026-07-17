begin;

alter table public.friday_tutorial_students
  add column if not exists approved_at timestamptz null;

update public.friday_tutorial_students
set approved_at = coalesce(updated_at, created_at, now())
where approval_status = 'approved'
  and approved_at is null;

comment on column public.friday_tutorial_students.approved_at is
  'Records when a student enters the active approved Friday list. Historical backfilled dates are best-effort because the previous schema did not record the approval moment separately.';

commit;
