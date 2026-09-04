begin;

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

  if exists (
    select 1
    from public.class_register_entries as entry
    where entry.profile_student_id = any(v_profile_ids)
      or entry.young_learner_id = any(v_young_learner_ids)
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'Selected student Class Register entries could not be removed safely.';
  end if;

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
  'Service-role-only atomic purge of explicitly selected profile students and Young Learners plus their student-specific data, including Class Register entries.';

commit;
