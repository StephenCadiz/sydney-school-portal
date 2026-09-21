-- Resolve legacy Cambridge Student Auth accounts to their application profile
-- before evaluating Student Portal row-level access.  Existing accounts whose
-- Auth and profile IDs match continue to resolve through the fallback.
begin;

create or replace function app_private.current_profile_id()
returns uuid
language sql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
  select coalesce(
    (
      select account.profile_id
      from public.student_portal_accounts account
      where account.auth_user_id = auth.uid()
      limit 1
    ),
    auth.uid()
  );
$$;
alter function app_private.current_profile_id() owner to postgres;
revoke all on function app_private.current_profile_id() from public, anon;
grant execute on function app_private.current_profile_id() to authenticated, service_role;

create or replace function app_private.can_read_class_enrolment(
  p_class_id uuid,
  p_type text,
  p_student_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
  select exists(
    select 1
    from public.profiles actor
    where actor.id = app_private.current_profile_id()
      and (
        actor.role = 'admin'
        or (
          actor.role = 'student'
          and p_type = 'profile'
          and actor.id = p_student_id
        )
        or (
          actor.role = 'teacher'
          and exists(
            select 1 from public.classes c
            where c.id = p_class_id and c.teacher_id = actor.id
          )
        )
      )
  );
$$;
alter function app_private.can_read_class_enrolment(uuid, text, uuid) owner to postgres;
revoke all on function app_private.can_read_class_enrolment(uuid, text, uuid) from public, anon;
grant execute on function app_private.can_read_class_enrolment(uuid, text, uuid) to authenticated, service_role;

create or replace function app_private.student_in_class(p_class_id uuid)
returns boolean
language sql stable security definer
set search_path = pg_catalog, public, pg_temp
as $$
  select exists(
    select 1 from public.current_class_enrolments
    where class_id = p_class_id
      and student_id = app_private.current_profile_id()
  );
$$;

create or replace function app_private.student_can_access_teacher(p_teacher_id uuid)
returns boolean
language sql stable security definer
set search_path = pg_catalog, public, pg_temp
as $$
  select exists(
    select 1
    from public.current_class_enrolments ce
    join public.classes c on c.id = ce.class_id
    where ce.student_id = app_private.current_profile_id()
      and c.teacher_id = p_teacher_id
  );
$$;

create or replace function app_private.student_announcement_allowed(
  p_classes_id uuid,
  p_audience_type text,
  p_target_level text
)
returns boolean
language sql stable security definer
set search_path = pg_catalog, public, pg_temp
as $$
  select exists(
    select 1
    from public.current_class_enrolments ce
    join public.classes c on c.id = ce.class_id
    left join public.levels l on l.id = c.level_id
    where ce.student_id = app_private.current_profile_id()
      and (
        p_classes_id = c.id
        or lower(coalesce(p_target_level, '')) = lower(coalesce(l.name, ''))
        or lower(coalesce(p_audience_type, '')) in (
          'all students', 'all_students', 'all cambridge students',
          'all_cambridge_students', 'all-cambridge-students'
        )
        or lower(coalesce(p_audience_type, '')) like '%cambridge%'
      )
  );
$$;

create or replace function app_private.user_can_access_cambridge_homework(
  p_level text,
  p_course_type text
)
returns boolean
language sql stable security definer
set search_path = pg_catalog, public, pg_temp
as $$
  select exists(
    select 1
    from public.classes c
    join public.levels l on l.id = c.level_id
    left join public.current_class_enrolments ce on ce.class_id = c.id
    where lower(coalesce(l.name, '')) = lower(coalesce(p_level, ''))
      and lower(coalesce(c.course_type, '')) = lower(coalesce(p_course_type, ''))
      and (
        c.teacher_id = app_private.current_profile_id()
        or ce.student_id = app_private.current_profile_id()
      )
  );
$$;

alter function app_private.student_in_class(uuid) owner to postgres;
alter function app_private.student_can_access_teacher(uuid) owner to postgres;
alter function app_private.student_announcement_allowed(uuid, text, text) owner to postgres;
alter function app_private.user_can_access_cambridge_homework(text, text) owner to postgres;
revoke all on function app_private.student_in_class(uuid), app_private.student_can_access_teacher(uuid),
  app_private.student_announcement_allowed(uuid, text, text),
  app_private.user_can_access_cambridge_homework(text, text) from public, anon;
grant execute on function app_private.student_in_class(uuid), app_private.student_can_access_teacher(uuid),
  app_private.student_announcement_allowed(uuid, text, text),
  app_private.user_can_access_cambridge_homework(text, text) to authenticated, service_role;

drop policy if exists messages_select_allowed on public.messages;
create policy messages_select_allowed
on public.messages
for select to authenticated
using (
  (app_private.is_admin() and recipient_group = 'admin')
  or sender_id = app_private.current_profile_id()
  or receiver_id = app_private.current_profile_id()
);

create or replace function app_private.can_read_friday_tutorial_sheet_as_student(
  p_sheet_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
  select exists (
    select 1
    from public.friday_tutorial_result_sheets sheet
    inner join public.friday_exam_practice_sessions session
      on session.id = sheet.tutorial_session_id
    inner join public.friday_tutorial_results result
      on result.result_sheet_id = sheet.id
    where sheet.id = p_sheet_id
      and result.student_id = app_private.current_profile_id()
      and coalesce(session.active, false) = true
      and session.session_date::date <= (now() at time zone 'Europe/Madrid')::date
  );
$$;
alter function app_private.can_read_friday_tutorial_sheet_as_student(uuid) owner to postgres;
revoke all on function app_private.can_read_friday_tutorial_sheet_as_student(uuid) from public, anon;
grant execute on function app_private.can_read_friday_tutorial_sheet_as_student(uuid) to authenticated, service_role;

drop policy if exists results_select_allowed on public.results;
create policy results_select_allowed
on public.results
for select to authenticated
using (
  app_private.is_admin()
  or app_private.teacher_owns_class(class_id)
  or (
    student_id = app_private.current_profile_id()
    and (
      result_type is distinct from 'mock'
      or published_at is not null
    )
  )
);

drop policy if exists "Students can read own Friday tutorial result sheets"
on public.friday_tutorial_result_sheets;
drop policy if exists "Students can read own submitted Friday tutorial result sheets"
on public.friday_tutorial_result_sheets;
create policy "Students can read own submitted Friday tutorial result sheets"
on public.friday_tutorial_result_sheets
for select to authenticated
using (app_private.can_read_friday_tutorial_sheet_as_student(id));

drop policy if exists "Students can read own Friday tutorial results"
on public.friday_tutorial_results;
create policy "Students can read own Friday tutorial results"
on public.friday_tutorial_results
for select to authenticated
using (
  student_id = app_private.current_profile_id()
  and app_private.can_read_friday_tutorial_sheet_as_student(result_sheet_id)
);

drop policy if exists "Students can read own Friday tutorial reminder dismissals"
on public.friday_tutorial_reminder_reads;
create policy "Students can read own Friday tutorial reminder dismissals"
on public.friday_tutorial_reminder_reads
for select to authenticated
using (student_id = app_private.current_profile_id());

drop policy if exists "Students can insert own Friday tutorial reminder dismissals"
on public.friday_tutorial_reminder_reads;
create policy "Students can insert own Friday tutorial reminder dismissals"
on public.friday_tutorial_reminder_reads
for insert to authenticated
with check (student_id = app_private.current_profile_id());

drop policy if exists "Students can update own Friday tutorial reminder dismissals"
on public.friday_tutorial_reminder_reads;
create policy "Students can update own Friday tutorial reminder dismissals"
on public.friday_tutorial_reminder_reads
for update to authenticated
using (student_id = app_private.current_profile_id())
with check (student_id = app_private.current_profile_id());

commit;
