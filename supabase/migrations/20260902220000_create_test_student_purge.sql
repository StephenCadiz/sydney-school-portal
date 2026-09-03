begin;

create or replace function app_private.validate_test_student_purge_selection(
  p_students jsonb,
  p_lock_rows boolean default false
)
returns table (
  profile_ids uuid[],
  young_learner_ids uuid[]
)
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_selected_count integer;
  v_distinct_count integer;
  v_profile_ids uuid[] := array[]::uuid[];
  v_young_learner_ids uuid[] := array[]::uuid[];
  v_matching_count integer;
begin
  if jsonb_typeof(p_students) is distinct from 'array' then
    raise exception using
      errcode = '22023',
      message = 'The student selection must be a JSON array.';
  end if;

  v_selected_count := jsonb_array_length(p_students);

  if v_selected_count < 1 or v_selected_count > 500 then
    raise exception using
      errcode = '22023',
      message = 'Select between 1 and 500 students.';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_students) as selected(item)
    where jsonb_typeof(selected.item) is distinct from 'object'
      or coalesce(selected.item ->> 'student_type', '')
        not in ('profile', 'young_learner')
      or coalesce(selected.item ->> 'student_id', '')
        !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  ) then
    raise exception using
      errcode = '22023',
      message = 'Every selected student must have a valid type and ID.';
  end if;

  select count(*)
  into v_distinct_count
  from (
    select distinct
      selected.item ->> 'student_type' as student_type,
      (selected.item ->> 'student_id')::uuid as student_id
    from jsonb_array_elements(p_students) as selected(item)
  ) as distinct_students;

  if v_distinct_count <> v_selected_count then
    raise exception using
      errcode = '22023',
      message = 'The student selection contains duplicate identities.';
  end if;

  select coalesce(
    array_agg((selected.item ->> 'student_id')::uuid order by selected.item ->> 'student_id'),
    array[]::uuid[]
  )
  into v_profile_ids
  from jsonb_array_elements(p_students) as selected(item)
  where selected.item ->> 'student_type' = 'profile';

  select coalesce(
    array_agg((selected.item ->> 'student_id')::uuid order by selected.item ->> 'student_id'),
    array[]::uuid[]
  )
  into v_young_learner_ids
  from jsonb_array_elements(p_students) as selected(item)
  where selected.item ->> 'student_type' = 'young_learner';

  select count(*)
  into v_matching_count
  from public.profiles as profile
  where profile.id = any(v_profile_ids)
    and profile.role = 'student';

  if v_matching_count <> cardinality(v_profile_ids) then
    raise exception using
      errcode = '22023',
      message = 'A selected profile is missing or is not a student.';
  end if;

  select count(*)
  into v_matching_count
  from public.young_learners as learner
  where learner.id = any(v_young_learner_ids);

  if v_matching_count <> cardinality(v_young_learner_ids) then
    raise exception using
      errcode = '22023',
      message = 'A selected Young Learner is missing.';
  end if;

  if p_lock_rows then
    perform 1
    from public.profiles as profile
    where profile.id = any(v_profile_ids)
    order by profile.id
    for update;

    perform 1
    from public.young_learners as learner
    where learner.id = any(v_young_learner_ids)
    order by learner.id
    for update;
  end if;

  return query select v_profile_ids, v_young_learner_ids;
end;
$$;

revoke all on function app_private.validate_test_student_purge_selection(jsonb, boolean)
from public, anon, authenticated;

create or replace function app_private.get_test_student_purge_preview(
  p_profile_ids uuid[],
  p_young_learner_ids uuid[]
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_auth_users integer;
  v_dependencies jsonb;
  v_total_dependent_rows bigint;
  v_warnings jsonb := '[]'::jsonb;
begin
  select count(*)
  into v_auth_users
  from auth.users as auth_user
  where auth_user.id = any(p_profile_ids);

  select jsonb_build_object(
    'class_register_entries', (
      select count(*) from public.class_register_entries as entry
      where entry.profile_student_id = any(p_profile_ids)
        or entry.young_learner_id = any(p_young_learner_ids)
    ),
    'attendance_alerts', (
      select count(*) from public.attendance_alerts as alert
      where alert.profile_student_id = any(p_profile_ids)
        or alert.young_learner_id = any(p_young_learner_ids)
    ),
    'class_enrolments', (
      select count(*) from public.class_enrolments as enrolment
      where enrolment.student_id = any(p_profile_ids)
    ),
    'young_learner_enrolments', (
      select count(*) from public.young_learner_enrolments as enrolment
      where enrolment.young_learner_id = any(p_young_learner_ids)
    ),
    'academic_year_rollover_students', (
      select count(*) from public.academic_year_rollover_students as student
      where student.profile_student_id = any(p_profile_ids)
        or student.young_learner_id = any(p_young_learner_ids)
    ),
    'follow_up_documents', (
      select count(*) from public.follow_up_documents as document
      where document.student_id = any(p_profile_ids)
        or document.young_learner_id = any(p_young_learner_ids)
    ),
    'follow_up_entries', (
      select count(*)
      from public.follow_up_entries as entry
      inner join public.follow_up_documents as document
        on document.id = entry.follow_up_document_id
      where document.student_id = any(p_profile_ids)
        or document.young_learner_id = any(p_young_learner_ids)
    ),
    'friday_tutorial_students', (
      select count(*) from public.friday_tutorial_students as student
      where student.profile_student_id = any(p_profile_ids)
        or student.young_learner_id = any(p_young_learner_ids)
    ),
    'friday_tutorial_session_students', (
      select count(*)
      from public.friday_tutorial_session_students as session_student
      inner join public.friday_tutorial_students as student
        on student.id = session_student.tutorial_student_id
      where student.profile_student_id = any(p_profile_ids)
        or student.young_learner_id = any(p_young_learner_ids)
    ),
    'friday_tutorial_results', (
      select count(*) from public.friday_tutorial_results as result
      where result.student_id = any(p_profile_ids)
    ),
    'friday_tutorial_reminder_reads', (
      select count(*) from public.friday_tutorial_reminder_reads as reminder
      where reminder.student_id = any(p_profile_ids)
    ),
    'results', (
      select count(*) from public.results as result
      where result.student_id = any(p_profile_ids)
    ),
    'mock_result_reviews', (
      select count(*)
      from public.mock_result_reviews as review
      inner join public.results as result on result.id = review.result_id
      where result.student_id = any(p_profile_ids)
    ),
    'teacher_notes', (
      select count(*) from public.teacher_notes as note
      where note.student_id = any(p_profile_ids)
    ),
    'student_homework_reads', (
      select count(*) from public.student_homework_reads as homework_read
      where homework_read.student_id = any(p_profile_ids)
    ),
    'student_assignment_homework_reads', (
      select count(*) from public.student_assignment_homework_reads as homework_read
      where homework_read.student_id = any(p_profile_ids)
    ),
    'announcement_reads', (
      select count(*) from public.announcement_reads as announcement_read
      where announcement_read.user_id = any(p_profile_ids)
    ),
    'messages', (
      select count(*) from public.messages as message
      where message.sender_id = any(p_profile_ids)
        or message.receiver_id = any(p_profile_ids)
    ),
    'unit_exam_results', (
      select count(*) from public.unit_exam_results as result
      where result.young_learner_id = any(p_young_learner_ids)
    ),
    'young_learner_notes', (
      select count(*) from public.young_learner_notes as note
      where note.young_learner_id = any(p_young_learner_ids)
    ),
    'young_learner_class_point_entries', (
      select count(*) from public.young_learner_class_point_entries as point_entry
      where point_entry.young_learner_id = any(p_young_learner_ids)
    )
  )
  into v_dependencies;

  select coalesce(sum(dependency.value::text::bigint), 0)
  into v_total_dependent_rows
  from jsonb_each(v_dependencies) as dependency(key, value);

  if v_auth_users < cardinality(p_profile_ids) then
    v_warnings := jsonb_build_array(
      format(
        '%s selected Cambridge profile(s) do not currently have a matching Auth user. Their portal data will still be purged.',
        cardinality(p_profile_ids) - v_auth_users
      )
    );
  end if;

  return jsonb_build_object(
    'students', jsonb_build_object(
      'profile', cardinality(p_profile_ids),
      'young_learner', cardinality(p_young_learner_ids),
      'total', cardinality(p_profile_ids) + cardinality(p_young_learner_ids),
      'auth_users', v_auth_users
    ),
    'dependencies', v_dependencies,
    'total_dependent_rows', v_total_dependent_rows,
    'warnings', v_warnings,
    'preserved', jsonb_build_array(
      'Classes and levels',
      'Class Registers (including registers left empty)',
      'Class Progress records',
      'Homework and exam assignments',
      'Friday Tutorial sessions and result sheets',
      'Academic years and rollover batches',
      'Announcements and resources'
    )
  );
end;
$$;

revoke all on function app_private.get_test_student_purge_preview(uuid[], uuid[])
from public, anon, authenticated;

create or replace function public.preview_test_student_purge(p_students jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_profile_ids uuid[];
  v_young_learner_ids uuid[];
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception using
      errcode = '42501',
      message = 'Test student purge preview requires service role.';
  end if;

  select selection.profile_ids, selection.young_learner_ids
  into v_profile_ids, v_young_learner_ids
  from app_private.validate_test_student_purge_selection(p_students, false)
    as selection;

  return app_private.get_test_student_purge_preview(
    v_profile_ids,
    v_young_learner_ids
  );
end;
$$;

revoke all on function public.preview_test_student_purge(jsonb)
from public, anon, authenticated;
grant execute on function public.preview_test_student_purge(jsonb)
to service_role;

comment on function public.preview_test_student_purge(jsonb) is
  'Service-role-only, read-only preview of rows belonging to explicitly selected test students.';

create or replace function public.purge_test_students(
  p_students jsonb,
  p_confirmation text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_profile_ids uuid[];
  v_young_learner_ids uuid[];
  v_preview jsonb;
  v_deleted_profiles integer;
  v_deleted_young_learners integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception using
      errcode = '42501',
      message = 'Test student purge requires service role.';
  end if;

  if p_confirmation is distinct from 'DELETE' then
    raise exception using
      errcode = '22023',
      message = 'The confirmation value must be DELETE.';
  end if;

  select selection.profile_ids, selection.young_learner_ids
  into v_profile_ids, v_young_learner_ids
  from app_private.validate_test_student_purge_selection(p_students, true)
    as selection;

  v_preview := app_private.get_test_student_purge_preview(
    v_profile_ids,
    v_young_learner_ids
  );

  delete from public.friday_tutorial_session_students as session_student
  using public.friday_tutorial_students as student
  where session_student.tutorial_student_id = student.id
    and (
      student.profile_student_id = any(v_profile_ids)
      or student.young_learner_id = any(v_young_learner_ids)
    );

  delete from public.friday_tutorial_students as student
  where student.profile_student_id = any(v_profile_ids)
    or student.young_learner_id = any(v_young_learner_ids);

  delete from public.follow_up_entries as entry
  using public.follow_up_documents as document
  where entry.follow_up_document_id = document.id
    and (
      document.student_id = any(v_profile_ids)
      or document.young_learner_id = any(v_young_learner_ids)
    );

  delete from public.follow_up_documents as document
  where document.student_id = any(v_profile_ids)
    or document.young_learner_id = any(v_young_learner_ids);

  delete from public.mock_result_reviews as review
  using public.results as result
  where review.result_id = result.id
    and result.student_id = any(v_profile_ids);

  delete from public.class_register_entries as entry
  where entry.profile_student_id = any(v_profile_ids)
    or entry.young_learner_id = any(v_young_learner_ids);

  delete from public.attendance_alerts as alert
  where alert.profile_student_id = any(v_profile_ids)
    or alert.young_learner_id = any(v_young_learner_ids);

  delete from public.academic_year_rollover_students as student
  where student.profile_student_id = any(v_profile_ids)
    or student.young_learner_id = any(v_young_learner_ids);

  delete from public.friday_tutorial_results as result
  where result.student_id = any(v_profile_ids);

  delete from public.friday_tutorial_reminder_reads as reminder
  where reminder.student_id = any(v_profile_ids);

  delete from public.student_assignment_homework_reads as homework_read
  where homework_read.student_id = any(v_profile_ids);

  delete from public.student_homework_reads as homework_read
  where homework_read.student_id = any(v_profile_ids);

  delete from public.teacher_notes as note
  where note.student_id = any(v_profile_ids);

  delete from public.announcement_reads as announcement_read
  where announcement_read.user_id = any(v_profile_ids);

  delete from public.messages as message
  where message.sender_id = any(v_profile_ids)
    or message.receiver_id = any(v_profile_ids);

  delete from public.results as result
  where result.student_id = any(v_profile_ids);

  delete from public.class_enrolments as enrolment
  where enrolment.student_id = any(v_profile_ids);

  delete from public.unit_exam_results as result
  where result.young_learner_id = any(v_young_learner_ids);

  delete from public.young_learner_notes as note
  where note.young_learner_id = any(v_young_learner_ids);

  delete from public.young_learner_class_point_entries as point_entry
  where point_entry.young_learner_id = any(v_young_learner_ids);

  delete from public.young_learner_enrolments as enrolment
  where enrolment.young_learner_id = any(v_young_learner_ids);

  delete from public.profiles as profile
  where profile.id = any(v_profile_ids)
    and profile.role = 'student';

  get diagnostics v_deleted_profiles = row_count;

  if v_deleted_profiles <> cardinality(v_profile_ids) then
    raise exception using
      errcode = 'P0001',
      message = 'The selected profile students could not all be deleted.';
  end if;

  delete from auth.users as auth_user
  where auth_user.id = any(v_profile_ids);

  delete from public.young_learners as learner
  where learner.id = any(v_young_learner_ids);

  get diagnostics v_deleted_young_learners = row_count;

  if v_deleted_young_learners <> cardinality(v_young_learner_ids) then
    raise exception using
      errcode = 'P0001',
      message = 'The selected Young Learners could not all be deleted.';
  end if;

  return v_preview || jsonb_build_object('success', true);
end;
$$;

revoke all on function public.purge_test_students(jsonb, text)
from public, anon, authenticated;
grant execute on function public.purge_test_students(jsonb, text)
to service_role;

comment on function public.purge_test_students(jsonb, text) is
  'Service-role-only atomic purge of explicitly selected profile students and Young Learners plus their student-specific data.';

commit;
