begin;

alter table public.results
add column if not exists published_at timestamptz null;

update public.results
set published_at = now()
where result_type = 'mock'
  and published_at is null;

comment on column public.results.published_at is
  'For Mock Exam results, null means an unpublished draft and non-null means visible to the student. Homework results do not require publishing.';

create index if not exists results_student_mock_published_idx
on public.results (student_id, published_at)
where result_type = 'mock';

drop policy if exists results_select_allowed
on public.results;

create policy results_select_allowed
on public.results
for select
to authenticated
using (
  app_private.is_admin()
  or app_private.teacher_owns_class(class_id)
  or (
    student_id = auth.uid()
    and (
      result_type is distinct from 'mock'
      or published_at is not null
    )
  )
);

commit;
