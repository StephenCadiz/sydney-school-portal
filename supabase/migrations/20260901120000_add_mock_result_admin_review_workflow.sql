begin;

create table if not exists public.mock_result_reviews (
  id uuid primary key default gen_random_uuid(),
  result_id uuid not null unique references public.results(id) on delete cascade,
  status text not null default 'draft'
    check (status in ('draft', 'awaiting_review', 'changes_required', 'published')),
  mock_number integer not null check (mock_number > 0),
  title text not null,
  reading numeric check (reading is null or (reading >= 0 and reading <= 100)),
  writing numeric check (writing is null or (writing >= 0 and writing <= 100)),
  listening numeric check (listening is null or (listening >= 0 and listening <= 100)),
  speaking numeric check (speaking is null or (speaking >= 0 and speaking <= 100)),
  overall numeric check (overall is null or (overall >= 0 and overall <= 100)),
  comments text,
  submitted_at timestamptz,
  submitted_by uuid references public.profiles(id) on delete set null,
  review_note text,
  reviewed_at timestamptz,
  reviewed_by uuid references public.profiles(id) on delete set null,
  published_at timestamptz,
  published_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.mock_result_reviews is
  'Teacher working versions and Admin approval state for Cambridge Mock Exam results. public.results remains the last student-visible approved version.';

comment on column public.mock_result_reviews.status is
  'Mock Exam review state: draft, awaiting_review, changes_required or published.';

create index if not exists mock_result_reviews_status_updated_idx
on public.mock_result_reviews (status, updated_at desc);

create index if not exists mock_result_reviews_submitted_idx
on public.mock_result_reviews (submitted_at desc)
where status = 'awaiting_review';

insert into public.mock_result_reviews (
  result_id,
  status,
  mock_number,
  title,
  reading,
  writing,
  listening,
  speaking,
  overall,
  comments,
  published_at,
  created_at,
  updated_at
)
select
  result.id,
  case when result.published_at is null then 'draft' else 'published' end,
  greatest(coalesce(result.mock_number, 1), 1),
  coalesce(nullif(trim(result.title), ''), 'Mock ' || greatest(coalesce(result.mock_number, 1), 1)),
  result.reading,
  result.writing,
  result.listening,
  result.speaking,
  result.overall,
  result.comments,
  result.published_at,
  now(),
  now()
from public.results as result
where result.result_type = 'mock'
on conflict (result_id) do nothing;

create or replace function app_private.set_mock_result_review_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists set_mock_result_review_updated_at
on public.mock_result_reviews;

create trigger set_mock_result_review_updated_at
before update on public.mock_result_reviews
for each row
execute function app_private.set_mock_result_review_updated_at();

alter table public.mock_result_reviews enable row level security;

drop policy if exists "Admins can read all mock result reviews"
on public.mock_result_reviews;

create policy "Admins can read all mock result reviews"
on public.mock_result_reviews
for select
to authenticated
using (app_private.is_admin());

drop policy if exists "Teachers can read own class mock result reviews"
on public.mock_result_reviews;

create policy "Teachers can read own class mock result reviews"
on public.mock_result_reviews
for select
to authenticated
using (
  app_private.is_teacher()
  and exists (
    select 1
    from public.results as result
    where result.id = mock_result_reviews.result_id
      and result.result_type = 'mock'
      and app_private.teacher_owns_class(result.class_id)
  )
);

revoke insert, update, delete on public.mock_result_reviews from public, anon, authenticated;
grant select on public.mock_result_reviews to authenticated;

drop policy if exists results_insert_allowed
on public.results;

create policy results_insert_allowed
on public.results
for insert
to authenticated
with check (
  app_private.is_admin()
  or (
    app_private.teacher_owns_class(class_id)
    and result_type = 'homework'
  )
);

drop policy if exists results_update_allowed
on public.results;

create policy results_update_allowed
on public.results
for update
to authenticated
using (
  app_private.is_admin()
  or (
    app_private.teacher_owns_class(class_id)
    and result_type = 'homework'
  )
)
with check (
  app_private.is_admin()
  or (
    app_private.teacher_owns_class(class_id)
    and result_type = 'homework'
  )
);

drop policy if exists results_delete_allowed
on public.results;

create policy results_delete_allowed
on public.results
for delete
to authenticated
using (
  app_private.is_admin()
  or (
    app_private.teacher_owns_class(class_id)
    and result_type = 'homework'
  )
);

create or replace function public.save_teacher_mock_result_review(
  p_actor_id uuid,
  p_result_id uuid,
  p_class_id uuid,
  p_student_id uuid,
  p_mock_number integer,
  p_reading numeric,
  p_writing numeric,
  p_listening numeric,
  p_speaking numeric,
  p_comments text,
  p_action text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_result public.results%rowtype;
  v_review public.mock_result_reviews%rowtype;
  v_title text;
  v_overall numeric;
  v_next_status text;
  v_now timestamptz := now();
begin
  if not exists (
    select 1 from public.profiles
    where id = p_actor_id and role = 'teacher'
  ) then
    raise exception 'Teacher access required' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.classes as classroom
    join public.levels as level on level.id = classroom.level_id
    where classroom.id = p_class_id
      and classroom.teacher_id = p_actor_id
      and classroom.is_cambridge = true
      and upper(trim(level.name)) in ('B1', 'B2', 'C1', 'C2')
  ) then
    raise exception 'Teacher does not own this Cambridge class' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.class_enrolments
    where class_id = p_class_id and student_id = p_student_id
  ) then
    raise exception 'Student is not enrolled in this class' using errcode = '42501';
  end if;

  if p_action not in ('save_draft', 'submit') then
    raise exception 'Invalid Mock Result action';
  end if;

  if p_mock_number is null or p_mock_number < 1 then
    raise exception 'Mock number must be a positive whole number';
  end if;

  if (p_reading is not null and (p_reading < 0 or p_reading > 100))
    or (p_writing is not null and (p_writing < 0 or p_writing > 100))
    or (p_listening is not null and (p_listening < 0 or p_listening > 100))
    or (p_speaking is not null and (p_speaking < 0 or p_speaking > 100)) then
    raise exception 'Mock scores must be between 0 and 100';
  end if;

  if length(coalesce(p_comments, '')) > 5000 then
    raise exception 'Comments must be 5000 characters or fewer';
  end if;

  if p_action = 'submit' and (
    p_reading is null or p_writing is null or
    p_listening is null or p_speaking is null
  ) then
    raise exception 'All four Mock Exam scores are required before submission';
  end if;

  v_title := 'Mock ' || p_mock_number;
  v_overall := case
    when p_reading is not null and p_writing is not null
      and p_listening is not null and p_speaking is not null
    then (p_reading + p_writing + p_listening + p_speaking) / 4
    else null
  end;

  if p_result_id is null then
    if exists (
      select 1 from public.results
      where class_id = p_class_id
        and student_id = p_student_id
        and result_type = 'mock'
        and mock_number = p_mock_number
    ) then
      raise exception 'A result already exists for this student and Mock Exam number';
    end if;

    insert into public.results (
      student_id, teacher_id, class_id, result_type, title, mock_number,
      reading, writing, listening, speaking, overall, comments, published_at
    ) values (
      p_student_id, p_actor_id, p_class_id, 'mock', v_title, p_mock_number,
      p_reading, p_writing, p_listening, p_speaking, v_overall,
      nullif(trim(coalesce(p_comments, '')), ''), null
    ) returning * into v_result;

    insert into public.mock_result_reviews (
      result_id, status, mock_number, title, reading, writing, listening,
      speaking, overall, comments, submitted_at, submitted_by
    ) values (
      v_result.id,
      case when p_action = 'submit' then 'awaiting_review' else 'draft' end,
      p_mock_number, v_title, p_reading, p_writing, p_listening, p_speaking,
      v_overall, nullif(trim(coalesce(p_comments, '')), ''),
      case when p_action = 'submit' then v_now else null end,
      case when p_action = 'submit' then p_actor_id else null end
    ) returning * into v_review;
  else
    select * into v_result
    from public.results
    where id = p_result_id
      and class_id = p_class_id
      and student_id = p_student_id
      and result_type = 'mock'
    for update;

    if not found then
      raise exception 'Mock Result was not found';
    end if;

    select * into v_review
    from public.mock_result_reviews
    where result_id = v_result.id
    for update;

    if not found then
      raise exception 'Mock Result review state was not found';
    end if;

    if v_review.status = 'awaiting_review' then
      raise exception 'Mock Result is awaiting Admin review and cannot be edited';
    end if;

    v_next_status := case
      when p_action = 'submit' then 'awaiting_review'
      when v_review.status = 'changes_required' then 'changes_required'
      else 'draft'
    end;

    if v_result.published_at is null then
      update public.results
      set
        teacher_id = p_actor_id,
        title = v_title,
        mock_number = p_mock_number,
        reading = p_reading,
        writing = p_writing,
        listening = p_listening,
        speaking = p_speaking,
        overall = v_overall,
        comments = nullif(trim(coalesce(p_comments, '')), '')
      where id = v_result.id;
    end if;

    update public.mock_result_reviews
    set
      status = v_next_status,
      mock_number = p_mock_number,
      title = v_title,
      reading = p_reading,
      writing = p_writing,
      listening = p_listening,
      speaking = p_speaking,
      overall = v_overall,
      comments = nullif(trim(coalesce(p_comments, '')), ''),
      submitted_at = case
        when p_action = 'submit' then v_now
        when v_review.status = 'published' then null
        else v_review.submitted_at
      end,
      submitted_by = case
        when p_action = 'submit' then p_actor_id
        when v_review.status = 'published' then null
        else v_review.submitted_by
      end,
      review_note = case
        when p_action = 'submit' or v_review.status = 'published' then null
        else v_review.review_note
      end,
      reviewed_at = case
        when p_action = 'submit' or v_review.status = 'published' then null
        else v_review.reviewed_at
      end,
      reviewed_by = case
        when p_action = 'submit' or v_review.status = 'published' then null
        else v_review.reviewed_by
      end
    where result_id = v_result.id
    returning * into v_review;
  end if;

  return jsonb_build_object(
    'result_id', v_result.id,
    'status', v_review.status,
    'published_at', v_result.published_at
  );
end;
$$;

create or replace function public.review_teacher_mock_result(
  p_actor_id uuid,
  p_result_id uuid,
  p_action text,
  p_review_note text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_result public.results%rowtype;
  v_review public.mock_result_reviews%rowtype;
  v_now timestamptz := now();
  v_note text := nullif(trim(coalesce(p_review_note, '')), '');
begin
  if not exists (
    select 1 from public.profiles
    where id = p_actor_id and role = 'admin'
  ) then
    raise exception 'Admin access required' using errcode = '42501';
  end if;

  if p_action not in ('publish', 'return') then
    raise exception 'Invalid Mock Result review action';
  end if;

  select * into v_result
  from public.results
  where id = p_result_id and result_type = 'mock'
  for update;

  if not found then
    raise exception 'Mock Result was not found';
  end if;

  select * into v_review
  from public.mock_result_reviews
  where result_id = v_result.id
  for update;

  if not found or v_review.status <> 'awaiting_review' then
    raise exception 'Mock Result is not awaiting Admin review';
  end if;

  if p_action = 'return' then
    if v_note is null then
      raise exception 'A correction note is required';
    end if;
    if length(v_note) > 1000 then
      raise exception 'Correction note must be 1000 characters or fewer';
    end if;

    update public.mock_result_reviews
    set
      status = 'changes_required',
      review_note = v_note,
      reviewed_at = v_now,
      reviewed_by = p_actor_id
    where result_id = v_result.id
    returning * into v_review;
  else
    if v_review.reading is null or v_review.writing is null
      or v_review.listening is null or v_review.speaking is null
      or v_review.overall is null then
      raise exception 'All four Mock Exam scores are required before publishing';
    end if;

    update public.results
    set
      title = v_review.title,
      mock_number = v_review.mock_number,
      reading = v_review.reading,
      writing = v_review.writing,
      listening = v_review.listening,
      speaking = v_review.speaking,
      overall = v_review.overall,
      comments = v_review.comments,
      published_at = v_now
    where id = v_result.id;

    update public.mock_result_reviews
    set
      status = 'published',
      review_note = null,
      reviewed_at = v_now,
      reviewed_by = p_actor_id,
      published_at = v_now,
      published_by = p_actor_id
    where result_id = v_result.id
    returning * into v_review;
  end if;

  return jsonb_build_object(
    'result_id', v_result.id,
    'status', v_review.status,
    'published_at', case when p_action = 'publish' then v_now else v_result.published_at end
  );
end;
$$;

create or replace function public.edit_admin_mock_result_review(
  p_actor_id uuid,
  p_result_id uuid,
  p_reading numeric,
  p_writing numeric,
  p_listening numeric,
  p_speaking numeric,
  p_comments text,
  p_action text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_result public.results%rowtype;
  v_review public.mock_result_reviews%rowtype;
  v_overall numeric;
  v_now timestamptz := now();
  v_comments text := nullif(trim(coalesce(p_comments, '')), '');
begin
  if not exists (
    select 1 from public.profiles
    where id = p_actor_id and role = 'admin'
  ) then
    raise exception 'Admin access required' using errcode = '42501';
  end if;

  if p_action not in ('save_changes', 'save_and_publish', 'save_published') then
    raise exception 'Invalid Admin Mock Result edit action';
  end if;

  if p_reading is null or p_writing is null
    or p_listening is null or p_speaking is null then
    raise exception 'All four Mock Exam scores are required';
  end if;

  if p_reading < 0 or p_reading > 100
    or p_writing < 0 or p_writing > 100
    or p_listening < 0 or p_listening > 100
    or p_speaking < 0 or p_speaking > 100 then
    raise exception 'Mock scores must be between 0 and 100';
  end if;

  if length(coalesce(p_comments, '')) > 5000 then
    raise exception 'Comments must be 5000 characters or fewer';
  end if;

  select * into v_result
  from public.results
  where id = p_result_id and result_type = 'mock'
  for update;

  if not found then
    raise exception 'Mock Result was not found';
  end if;

  select * into v_review
  from public.mock_result_reviews
  where result_id = v_result.id
  for update;

  if not found then
    raise exception 'Mock Result review state was not found';
  end if;

  v_overall := (p_reading + p_writing + p_listening + p_speaking) / 4;

  if v_review.status = 'awaiting_review' then
    if p_action = 'save_published' then
      raise exception 'Awaiting Review results cannot use the Published edit action';
    end if;

    if p_action = 'save_changes' then
      update public.mock_result_reviews
      set
        reading = p_reading,
        writing = p_writing,
        listening = p_listening,
        speaking = p_speaking,
        overall = v_overall,
        comments = v_comments,
        reviewed_at = v_now,
        reviewed_by = p_actor_id
      where result_id = v_result.id
      returning * into v_review;

      return jsonb_build_object(
        'result_id', v_result.id,
        'status', v_review.status,
        'published_at', v_result.published_at
      );
    end if;

    update public.results
    set
      reading = p_reading,
      writing = p_writing,
      listening = p_listening,
      speaking = p_speaking,
      overall = v_overall,
      comments = v_comments,
      published_at = v_now
    where id = v_result.id;

    update public.mock_result_reviews
    set
      status = 'published',
      reading = p_reading,
      writing = p_writing,
      listening = p_listening,
      speaking = p_speaking,
      overall = v_overall,
      comments = v_comments,
      review_note = null,
      reviewed_at = v_now,
      reviewed_by = p_actor_id,
      published_at = v_now,
      published_by = p_actor_id
    where result_id = v_result.id
    returning * into v_review;

    return jsonb_build_object(
      'result_id', v_result.id,
      'status', v_review.status,
      'published_at', v_now
    );
  end if;

  if v_review.status = 'published' then
    if p_action <> 'save_published' then
      raise exception 'Published results require the Published edit action';
    end if;

    update public.results
    set
      reading = p_reading,
      writing = p_writing,
      listening = p_listening,
      speaking = p_speaking,
      overall = v_overall,
      comments = v_comments,
      published_at = coalesce(published_at, v_review.published_at, v_now)
    where id = v_result.id
    returning * into v_result;

    update public.mock_result_reviews
    set
      status = 'published',
      reading = p_reading,
      writing = p_writing,
      listening = p_listening,
      speaking = p_speaking,
      overall = v_overall,
      comments = v_comments,
      review_note = null,
      reviewed_at = v_now,
      reviewed_by = p_actor_id,
      published_at = coalesce(v_review.published_at, v_result.published_at, v_now),
      published_by = coalesce(v_review.published_by, p_actor_id)
    where result_id = v_result.id
    returning * into v_review;

    return jsonb_build_object(
      'result_id', v_result.id,
      'status', v_review.status,
      'published_at', v_result.published_at
    );
  end if;

  raise exception 'Only Awaiting Admin Review or Published results can be edited by Admin';
end;
$$;

create or replace function public.delete_teacher_mock_result_review(
  p_actor_id uuid,
  p_result_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_result public.results%rowtype;
  v_review public.mock_result_reviews%rowtype;
begin
  if not exists (
    select 1 from public.profiles
    where id = p_actor_id and role = 'teacher'
  ) then
    raise exception 'Teacher access required' using errcode = '42501';
  end if;

  select result.* into v_result
  from public.results as result
  join public.classes as classroom on classroom.id = result.class_id
  where result.id = p_result_id
    and result.result_type = 'mock'
    and classroom.teacher_id = p_actor_id
  for update of result;

  if not found then
    raise exception 'Mock Result was not found';
  end if;

  select * into v_review
  from public.mock_result_reviews
  where result_id = v_result.id
  for update;

  if not found or v_review.status not in ('draft', 'changes_required') then
    raise exception 'Only Draft or Changes Required results can be removed';
  end if;

  if v_result.published_at is not null then
    update public.mock_result_reviews
    set
      status = 'published',
      mock_number = greatest(coalesce(v_result.mock_number, 1), 1),
      title = coalesce(nullif(trim(v_result.title), ''), 'Mock ' || greatest(coalesce(v_result.mock_number, 1), 1)),
      reading = v_result.reading,
      writing = v_result.writing,
      listening = v_result.listening,
      speaking = v_result.speaking,
      overall = v_result.overall,
      comments = v_result.comments,
      submitted_at = null,
      submitted_by = null,
      review_note = null,
      reviewed_at = null,
      reviewed_by = null
    where result_id = v_result.id;

    return jsonb_build_object(
      'result_id', v_result.id,
      'status', 'published',
      'outcome', 'revision_discarded'
    );
  end if;

  delete from public.results where id = v_result.id;

  return jsonb_build_object(
    'result_id', v_result.id,
    'status', 'deleted',
    'outcome', 'draft_deleted'
  );
end;
$$;

revoke all on function public.save_teacher_mock_result_review(
  uuid, uuid, uuid, uuid, integer, numeric, numeric, numeric, numeric, text, text
) from public, anon, authenticated;
grant execute on function public.save_teacher_mock_result_review(
  uuid, uuid, uuid, uuid, integer, numeric, numeric, numeric, numeric, text, text
) to service_role;

revoke all on function public.review_teacher_mock_result(uuid, uuid, text, text)
from public, anon, authenticated;
grant execute on function public.review_teacher_mock_result(uuid, uuid, text, text)
to service_role;

revoke all on function public.edit_admin_mock_result_review(
  uuid, uuid, numeric, numeric, numeric, numeric, text, text
) from public, anon, authenticated;
grant execute on function public.edit_admin_mock_result_review(
  uuid, uuid, numeric, numeric, numeric, numeric, text, text
) to service_role;

revoke all on function public.delete_teacher_mock_result_review(uuid, uuid)
from public, anon, authenticated;
grant execute on function public.delete_teacher_mock_result_review(uuid, uuid)
to service_role;

commit;
