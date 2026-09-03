begin;

create or replace function app_private.get_test_class_purge_preview(
  p_class_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_cambridge_students integer;
  v_young_learners integer;
  v_dependencies jsonb;
  v_total_dependent_rows bigint;
  v_storage_files integer;
  v_warnings jsonb := '[]'::jsonb;
begin
  select count(*)
  into v_cambridge_students
  from public.class_enrolments as enrolment
  where enrolment.class_id = p_class_id
    and enrolment.active is distinct from false;

  select count(*)
  into v_young_learners
  from public.young_learners as learner
  where learner.class_id = p_class_id;

  select jsonb_build_object(
    'class_registers', (
      select count(*) from public.class_registers as register
      where register.class_id = p_class_id
    ),
    'class_register_entries', (
      select count(*)
      from public.class_register_entries as entry
      inner join public.class_registers as register
        on register.id = entry.register_id
      where register.class_id = p_class_id
    ),
    'attendance_alerts', (
      select count(*) from public.attendance_alerts as alert
      where alert.class_id = p_class_id
    ),
    'class_progress_entries', (
      select count(*) from public.class_progress_entries as progress
      where progress.class_id = p_class_id
    ),
    'class_enrolments', (
      select count(*) from public.class_enrolments as enrolment
      where enrolment.class_id = p_class_id
    ),
    'young_learner_enrolments', (
      select count(*) from public.young_learner_enrolments as enrolment
      where enrolment.class_id = p_class_id
    ),
    'results', (
      select count(*)
      from public.results as result
      where result.class_id = p_class_id
        or result.cambridge_exam_assignment_id in (
          select assignment.id
          from public.cambridge_exam_assignments as assignment
          where assignment.course_plan_class_id = p_class_id
            or assignment.course_plan_day_id in (
              select day.id
              from public.course_plan_days as day
              inner join public.course_plans as plan
                on plan.id = day.course_plan_id
              where plan.class_id = p_class_id
            )
            or assignment.id in (
              select homework.cambridge_exam_assignment_id
              from public.course_plan_homework_assignments as homework
              inner join public.course_plan_exam_items as item
                on item.id = homework.course_plan_exam_item_id
              inner join public.course_plan_days as day
                on day.id = item.course_plan_day_id
              inner join public.course_plans as plan
                on plan.id = day.course_plan_id
              where plan.class_id = p_class_id
            )
        )
    ),
    'mock_result_reviews', (
      select count(*)
      from public.mock_result_reviews as review
      inner join public.results as result on result.id = review.result_id
      where result.class_id = p_class_id
        or result.cambridge_exam_assignment_id in (
          select assignment.id
          from public.cambridge_exam_assignments as assignment
          where assignment.course_plan_class_id = p_class_id
            or assignment.course_plan_day_id in (
              select day.id
              from public.course_plan_days as day
              inner join public.course_plans as plan
                on plan.id = day.course_plan_id
              where plan.class_id = p_class_id
            )
            or assignment.id in (
              select homework.cambridge_exam_assignment_id
              from public.course_plan_homework_assignments as homework
              inner join public.course_plan_exam_items as item
                on item.id = homework.course_plan_exam_item_id
              inner join public.course_plan_days as day
                on day.id = item.course_plan_day_id
              inner join public.course_plans as plan
                on plan.id = day.course_plan_id
              where plan.class_id = p_class_id
            )
        )
    ),
    'teacher_notes', (
      select count(*) from public.teacher_notes as note
      where note.class_id = p_class_id
    ),
    'follow_up_documents', (
      select count(*) from public.follow_up_documents as document
      where document.class_id = p_class_id
    ),
    'follow_up_entries', (
      select count(*)
      from public.follow_up_entries as entry
      inner join public.follow_up_documents as document
        on document.id = entry.follow_up_document_id
      where document.class_id = p_class_id
    ),
    'friday_tutorial_students', (
      select count(*) from public.friday_tutorial_students as student
      where student.class_id = p_class_id
        or student.follow_up_document_id in (
          select document.id
          from public.follow_up_documents as document
          where document.class_id = p_class_id
        )
    ),
    'friday_tutorial_session_students', (
      select count(*)
      from public.friday_tutorial_session_students as session_student
      inner join public.friday_tutorial_students as student
        on student.id = session_student.tutorial_student_id
      where student.class_id = p_class_id
        or student.follow_up_document_id in (
          select document.id
          from public.follow_up_documents as document
          where document.class_id = p_class_id
        )
    ),
    'friday_tutorial_result_sheets', (
      select count(*) from public.friday_tutorial_result_sheets as sheet
      where sheet.class_id = p_class_id
    ),
    'friday_tutorial_results', (
      select count(*)
      from public.friday_tutorial_results as result
      inner join public.friday_tutorial_result_sheets as sheet
        on sheet.id = result.result_sheet_id
      where sheet.class_id = p_class_id
    ),
    'unit_exam_results', (
      select count(*) from public.unit_exam_results as result
      where result.class_id = p_class_id
    ),
    'young_learner_notes', (
      select count(*) from public.young_learner_notes as note
      where note.class_id = p_class_id
    ),
    'young_learner_class_point_entries', (
      select count(*) from public.young_learner_class_point_entries as point_entry
      where point_entry.class_id = p_class_id
    ),
    'resources', (
      select count(*) from public.resources as resource
      where resource.class_id = p_class_id
    ),
    'announcements', (
      select count(*) from public.announcements as announcement
      where announcement.classes_id = p_class_id
    ),
    'announcement_reads', (
      select count(*)
      from public.announcement_reads as announcement_read
      inner join public.announcements as announcement
        on announcement.id = announcement_read.announcement_id
      where announcement.classes_id = p_class_id
    ),
    'course_plans', (
      select count(*) from public.course_plans as plan
      where plan.class_id = p_class_id
    ),
    'course_plan_days', (
      select count(*)
      from public.course_plan_days as day
      inner join public.course_plans as plan on plan.id = day.course_plan_id
      where plan.class_id = p_class_id
    ),
    'course_plan_exam_items', (
      select count(*)
      from public.course_plan_exam_items as item
      inner join public.course_plan_days as day on day.id = item.course_plan_day_id
      inner join public.course_plans as plan on plan.id = day.course_plan_id
      where plan.class_id = p_class_id
    ),
    'course_plan_resources', (
      select count(*)
      from public.course_plan_resources as resource
      inner join public.course_plan_days as day on day.id = resource.course_plan_day_id
      inner join public.course_plans as plan on plan.id = day.course_plan_id
      where plan.class_id = p_class_id
    ),
    'course_plan_homework_assignments', (
      select count(*)
      from public.course_plan_homework_assignments as homework
      where homework.course_plan_exam_item_id in (
        select item.id
        from public.course_plan_exam_items as item
        inner join public.course_plan_days as day on day.id = item.course_plan_day_id
        inner join public.course_plans as plan on plan.id = day.course_plan_id
        where plan.class_id = p_class_id
      )
        or homework.cambridge_exam_assignment_id in (
          select assignment.id
          from public.cambridge_exam_assignments as assignment
          where assignment.course_plan_class_id = p_class_id
        )
    ),
    'cambridge_exam_assignments', (
      select count(*)
      from public.cambridge_exam_assignments as assignment
      where assignment.course_plan_class_id = p_class_id
        or assignment.course_plan_day_id in (
          select day.id
          from public.course_plan_days as day
          inner join public.course_plans as plan on plan.id = day.course_plan_id
          where plan.class_id = p_class_id
        )
        or assignment.id in (
          select homework.cambridge_exam_assignment_id
          from public.course_plan_homework_assignments as homework
          inner join public.course_plan_exam_items as item
            on item.id = homework.course_plan_exam_item_id
          inner join public.course_plan_days as day
            on day.id = item.course_plan_day_id
          inner join public.course_plans as plan
            on plan.id = day.course_plan_id
          where plan.class_id = p_class_id
        )
    ),
    'student_assignment_homework_reads', (
      select count(*)
      from public.student_assignment_homework_reads as homework_read
      where homework_read.cambridge_exam_assignment_id in (
        select assignment.id
        from public.cambridge_exam_assignments as assignment
        where assignment.course_plan_class_id = p_class_id
          or assignment.course_plan_day_id in (
            select day.id
            from public.course_plan_days as day
            inner join public.course_plans as plan on plan.id = day.course_plan_id
            where plan.class_id = p_class_id
          )
          or assignment.id in (
            select homework.cambridge_exam_assignment_id
            from public.course_plan_homework_assignments as homework
            inner join public.course_plan_exam_items as item
              on item.id = homework.course_plan_exam_item_id
            inner join public.course_plan_days as day
              on day.id = item.course_plan_day_id
            inner join public.course_plans as plan
              on plan.id = day.course_plan_id
            where plan.class_id = p_class_id
          )
      )
    ),
    'academic_year_rollover_classes', (
      select count(*) from public.academic_year_rollover_classes as mapping
      where mapping.source_class_id = p_class_id
        or mapping.target_class_id = p_class_id
    ),
    'academic_year_rollover_students', (
      select count(*) from public.academic_year_rollover_students as student
      where student.source_class_id = p_class_id
        or student.target_class_id = p_class_id
    )
  )
  into v_dependencies;

  select count(*)
  into v_storage_files
  from public.course_plan_resources as resource
  inner join public.course_plan_days as day on day.id = resource.course_plan_day_id
  inner join public.course_plans as plan on plan.id = day.course_plan_id
  where plan.class_id = p_class_id
    and resource.storage_path is not null;

  select coalesce(sum(dependency.value::text::bigint), 0)
  into v_total_dependent_rows
  from jsonb_each(v_dependencies) as dependency(key, value);

  if v_cambridge_students + v_young_learners > 0 then
    v_warnings := jsonb_build_array(
      'This class still has current students. Purge those test students or move them before permanently deleting the class.'
    );
  end if;

  return jsonb_build_object(
    'students', jsonb_build_object(
      'cambridge_current', v_cambridge_students,
      'young_learners_current', v_young_learners,
      'total_current', v_cambridge_students + v_young_learners
    ),
    'dependencies', v_dependencies,
    'total_dependent_rows', v_total_dependent_rows,
    'storage_files', v_storage_files,
    'can_purge', v_cambridge_students + v_young_learners = 0,
    'warnings', v_warnings,
    'preserved', jsonb_build_array(
      'Student profiles and Supabase Auth users',
      'Young Learner identities',
      'Other classes and their records',
      'Levels, classrooms and academic years',
      'Shared and level-wide teacher/student resources',
      'Friday Tutorial schedules and unrelated student records',
      'Academic-year rollover batches'
    )
  );
end;
$$;

revoke all on function app_private.get_test_class_purge_preview(uuid)
from public, anon, authenticated;

create or replace function public.preview_test_class_purge(p_class_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception using
      errcode = '42501',
      message = 'Test class purge preview requires service role.';
  end if;

  if not exists (
    select 1 from public.classes as classroom where classroom.id = p_class_id
  ) then
    raise exception using
      errcode = 'P0002',
      message = 'The selected class does not exist.';
  end if;

  return app_private.get_test_class_purge_preview(p_class_id);
end;
$$;

revoke all on function public.preview_test_class_purge(uuid)
from public, anon, authenticated;
grant execute on function public.preview_test_class_purge(uuid)
to service_role;

comment on function public.preview_test_class_purge(uuid) is
  'Service-role-only, read-only preview of class-specific rows for an explicit test-class purge.';

create or replace function public.purge_test_class(
  p_class_id uuid,
  p_confirmation text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_preview jsonb;
  v_register_ids uuid[] := array[]::uuid[];
  v_follow_up_ids uuid[] := array[]::uuid[];
  v_friday_student_ids uuid[] := array[]::uuid[];
  v_friday_sheet_ids uuid[] := array[]::uuid[];
  v_announcement_ids uuid[] := array[]::uuid[];
  v_plan_ids uuid[] := array[]::uuid[];
  v_day_ids uuid[] := array[]::uuid[];
  v_exam_item_ids uuid[] := array[]::uuid[];
  v_assignment_ids uuid[] := array[]::uuid[];
  v_deleted_classes integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception using
      errcode = '42501',
      message = 'Test class purge requires service role.';
  end if;

  if p_confirmation is distinct from 'DELETE' then
    raise exception using
      errcode = '22023',
      message = 'The confirmation value must be DELETE.';
  end if;

  perform 1
  from public.classes as classroom
  where classroom.id = p_class_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'The selected class does not exist.';
  end if;

  v_preview := app_private.get_test_class_purge_preview(p_class_id);

  if not (v_preview ->> 'can_purge')::boolean then
    raise exception using
      errcode = '23514',
      message = 'The class still has current students.';
  end if;

  select coalesce(array_agg(register.id), array[]::uuid[])
  into v_register_ids
  from public.class_registers as register
  where register.class_id = p_class_id;

  select coalesce(array_agg(document.id), array[]::uuid[])
  into v_follow_up_ids
  from public.follow_up_documents as document
  where document.class_id = p_class_id;

  select coalesce(array_agg(student.id), array[]::uuid[])
  into v_friday_student_ids
  from public.friday_tutorial_students as student
  where student.class_id = p_class_id
    or student.follow_up_document_id = any(v_follow_up_ids);

  select coalesce(array_agg(sheet.id), array[]::uuid[])
  into v_friday_sheet_ids
  from public.friday_tutorial_result_sheets as sheet
  where sheet.class_id = p_class_id;

  select coalesce(array_agg(announcement.id), array[]::uuid[])
  into v_announcement_ids
  from public.announcements as announcement
  where announcement.classes_id = p_class_id;

  select coalesce(array_agg(plan.id), array[]::uuid[])
  into v_plan_ids
  from public.course_plans as plan
  where plan.class_id = p_class_id;

  select coalesce(array_agg(day.id), array[]::uuid[])
  into v_day_ids
  from public.course_plan_days as day
  where day.course_plan_id = any(v_plan_ids);

  select coalesce(array_agg(item.id), array[]::uuid[])
  into v_exam_item_ids
  from public.course_plan_exam_items as item
  where item.course_plan_day_id = any(v_day_ids);

  select coalesce(array_agg(assignment.id), array[]::uuid[])
  into v_assignment_ids
  from public.cambridge_exam_assignments as assignment
  where assignment.course_plan_class_id = p_class_id
    or assignment.course_plan_day_id = any(v_day_ids)
    or assignment.id in (
      select homework.cambridge_exam_assignment_id
      from public.course_plan_homework_assignments as homework
      where homework.course_plan_exam_item_id = any(v_exam_item_ids)
    );

  delete from public.class_register_entries as entry
  where entry.register_id = any(v_register_ids);

  delete from public.attendance_alerts as alert
  where alert.class_id = p_class_id;

  delete from public.class_registers as register
  where register.id = any(v_register_ids);

  delete from public.mock_result_reviews as review
  using public.results as result
  where review.result_id = result.id
    and (
      result.class_id = p_class_id
      or result.cambridge_exam_assignment_id = any(v_assignment_ids)
    );

  delete from public.student_assignment_homework_reads as homework_read
  where homework_read.cambridge_exam_assignment_id = any(v_assignment_ids);

  delete from public.results as result
  where result.class_id = p_class_id
    or result.cambridge_exam_assignment_id = any(v_assignment_ids);

  delete from public.course_plan_homework_assignments as homework
  where homework.course_plan_exam_item_id = any(v_exam_item_ids)
    or homework.cambridge_exam_assignment_id = any(v_assignment_ids);

  delete from public.cambridge_exam_assignments as assignment
  where assignment.id = any(v_assignment_ids);

  delete from public.course_plan_resources as resource
  where resource.course_plan_day_id = any(v_day_ids);

  delete from public.course_plan_exam_items as item
  where item.id = any(v_exam_item_ids);

  delete from public.course_plan_days as day
  where day.id = any(v_day_ids);

  delete from public.course_plans as plan
  where plan.id = any(v_plan_ids);

  delete from public.announcement_reads as announcement_read
  where announcement_read.announcement_id = any(v_announcement_ids);

  delete from public.announcements as announcement
  where announcement.id = any(v_announcement_ids);

  delete from public.friday_tutorial_session_students as session_student
  where session_student.tutorial_student_id = any(v_friday_student_ids);

  delete from public.friday_tutorial_students as student
  where student.id = any(v_friday_student_ids);

  delete from public.friday_tutorial_results as result
  where result.result_sheet_id = any(v_friday_sheet_ids);

  delete from public.friday_tutorial_result_sheets as sheet
  where sheet.id = any(v_friday_sheet_ids);

  delete from public.follow_up_entries as entry
  where entry.follow_up_document_id = any(v_follow_up_ids);

  delete from public.follow_up_documents as document
  where document.id = any(v_follow_up_ids);

  delete from public.teacher_notes as note
  where note.class_id = p_class_id;

  delete from public.class_progress_entries as progress
  where progress.class_id = p_class_id;

  delete from public.resources as resource
  where resource.class_id = p_class_id;

  delete from public.unit_exam_results as result
  where result.class_id = p_class_id;

  delete from public.young_learner_notes as note
  where note.class_id = p_class_id;

  delete from public.young_learner_class_point_entries as point_entry
  where point_entry.class_id = p_class_id;

  delete from public.class_enrolments as enrolment
  where enrolment.class_id = p_class_id;

  delete from public.young_learner_enrolments as enrolment
  where enrolment.class_id = p_class_id;

  delete from public.academic_year_rollover_students as student
  where student.source_class_id = p_class_id
    or student.target_class_id = p_class_id;

  delete from public.academic_year_rollover_classes as mapping
  where mapping.source_class_id = p_class_id
    or mapping.target_class_id = p_class_id;

  delete from public.classes as classroom
  where classroom.id = p_class_id;

  get diagnostics v_deleted_classes = row_count;

  if v_deleted_classes <> 1 then
    raise exception using
      errcode = 'P0001',
      message = 'The selected class could not be deleted.';
  end if;

  return v_preview || jsonb_build_object('success', true);
end;
$$;

revoke all on function public.purge_test_class(uuid, text)
from public, anon, authenticated;
grant execute on function public.purge_test_class(uuid, text)
to service_role;

comment on function public.purge_test_class(uuid, text) is
  'Service-role-only atomic purge of one zero-current-student test class and its class-specific records.';

commit;
