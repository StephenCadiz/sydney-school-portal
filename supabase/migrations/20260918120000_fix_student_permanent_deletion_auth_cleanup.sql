begin;

-- Keep the previously deployed, application-data cleanup function as an
-- internal implementation.  The public wrapper below resolves legacy Auth
-- identities before invoking it, so the whole operation remains one database
-- transaction and rolls back if any step fails.
alter function public.purge_test_students(jsonb, text)
  rename to purge_test_students_legacy;

create or replace function public.purge_test_students(
  p_students jsonb,
  p_confirmation text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_profile_ids uuid[];
  v_young_learner_ids uuid[];
  v_auth_user_ids uuid[] := array[]::uuid[];
  v_result jsonb;
  v_retry_profile_id uuid;
  v_deleted_auth_users integer;
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

  -- A completed purge is a safe no-op when the exact profile is already gone
  -- and no dependent identity/data remains.  Malformed or partially retained
  -- selections still go through the normal validator and fail closed.
  if jsonb_typeof(p_students) = 'array'
     and jsonb_array_length(p_students) = 1
     and p_students -> 0 ->> 'student_type' = 'profile'
     and (p_students -> 0 ->> 'student_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  then
    v_retry_profile_id := (p_students -> 0 ->> 'student_id')::uuid;
    if not exists (select 1 from public.profiles where id = v_retry_profile_id)
       and not exists (select 1 from public.student_portal_accounts where profile_id = v_retry_profile_id)
       and not exists (select 1 from public.class_enrolments where student_id = v_retry_profile_id)
       and not exists (select 1 from public.class_enrolment_periods where profile_student_id = v_retry_profile_id)
       and not exists (select 1 from public.class_register_entries where profile_student_id = v_retry_profile_id)
       and not exists (select 1 from public.attendance_alerts where profile_student_id = v_retry_profile_id)
       and not exists (select 1 from public.results where student_id = v_retry_profile_id)
       and not exists (select 1 from public.teacher_notes where student_id = v_retry_profile_id)
       and not exists (select 1 from public.student_homework_reads where student_id = v_retry_profile_id)
       and not exists (select 1 from public.student_assignment_homework_reads where student_id = v_retry_profile_id)
       and not exists (select 1 from public.announcement_reads where user_id = v_retry_profile_id)
       and not exists (select 1 from public.messages where sender_id = v_retry_profile_id or receiver_id = v_retry_profile_id)
       and not exists (select 1 from auth.users where id = v_retry_profile_id)
    then
      return jsonb_build_object(
        'success', true,
        'idempotent', true,
        'students', jsonb_build_object('profile', 0, 'young_learner', 0, 'total', 0, 'auth_users', 0),
        'dependencies', '{}'::jsonb
      );
    end if;
  end if;

  select selection.profile_ids, selection.young_learner_ids
    into v_profile_ids, v_young_learner_ids
  from app_private.validate_test_student_purge_selection(p_students, true)
    as selection;

  -- Never infer an identity from a name.  Exact normalized email fallback is
  -- allowed only for the selected profile and is rejected when ambiguous.
  if exists (
    select 1
    from public.profiles target
    join public.profiles other
      on other.id <> target.id
     and nullif(btrim(other.email), '') is not null
     and lower(btrim(other.email)) = lower(btrim(target.email))
    where target.id = any(v_profile_ids)
      and nullif(btrim(target.email), '') is not null
  ) then
    raise exception using
      errcode = '23514',
      message = 'A selected student email is linked to multiple profiles.';
  end if;

  if exists (
    select 1
    from public.profiles target
    join auth.users auth_user
      on nullif(btrim(target.email), '') is not null
     and lower(btrim(auth_user.email)) = lower(btrim(target.email))
    where target.id = any(v_profile_ids)
    group by target.id, lower(btrim(target.email))
    having count(distinct auth_user.id) > 1
  ) then
    raise exception using
      errcode = '23514',
      message = 'A selected student email matches multiple Auth accounts.';
  end if;

  select coalesce(array_agg(distinct auth_user.id), array[]::uuid[])
    into v_auth_user_ids
  from auth.users auth_user
  where auth_user.id = any(v_profile_ids)
     or exists (
       select 1
       from public.student_portal_accounts account
       where account.profile_id = any(v_profile_ids)
         and account.auth_user_id = auth_user.id
     )
     or exists (
       select 1
       from public.profiles profile
       where profile.id = any(v_profile_ids)
         and nullif(btrim(profile.email), '') is not null
         and lower(btrim(auth_user.email)) = lower(btrim(profile.email))
     );

  -- Lock and remove explicit mappings first.  Auth and application deletes
  -- then participate in the same transaction as the legacy child cleanup.
  perform 1
  from auth.users auth_user
  where auth_user.id = any(v_auth_user_ids)
  order by auth_user.id
  for update;

  delete from public.student_portal_accounts
  where profile_id = any(v_profile_ids)
     or auth_user_id = any(v_auth_user_ids);

  delete from auth.users
  where id = any(v_auth_user_ids);

  get diagnostics v_deleted_auth_users = row_count;
  if v_deleted_auth_users <> cardinality(v_auth_user_ids) then
    raise exception using
      errcode = 'P0001',
      message = 'Selected student Auth accounts could not be removed safely.';
  end if;

  -- This function performs the existing child/profile cleanup and returns the
  -- dependency preview.  Any failure rolls back the mapping/Auth deletions.
  v_result := public.purge_test_students_legacy(p_students, p_confirmation);
  return v_result || jsonb_build_object('auth_users_deleted', cardinality(v_auth_user_ids));
end;
$$;

alter function public.purge_test_students(jsonb, text) owner to postgres;
alter function public.purge_test_students(jsonb, text)
  set search_path = pg_catalog, public, pg_temp;
revoke all on function public.purge_test_students(jsonb, text)
  from public, anon, authenticated;
grant execute on function public.purge_test_students(jsonb, text)
  to service_role;

-- The renamed implementation is callable only from the wrapper above.
revoke all on function public.purge_test_students_legacy(jsonb, text)
  from public, anon, authenticated, service_role;

comment on function public.purge_test_students(jsonb, text) is
  'Service-role-only atomic purge of explicitly selected students, including legacy Auth IDs resolved by mapping or exact normalized email.';

commit;
