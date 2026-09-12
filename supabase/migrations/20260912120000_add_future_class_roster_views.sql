begin;
set local search_path = pg_catalog, public, extensions;

-- Roster views include scheduled future enrolments for planning and class
-- preparation. Attendance and register eligibility continue to use the
-- date-effective current_* views.
create view public.class_roster_profiles as
select
  p.id,
  p.student_id,
  p.class_id,
  p.starts_on as enrolled_at,
  p.ends_before,
  s.first_name,
  s.last_name,
  s.email,
  s.active
from public.class_enrolment_periods p
join public.profiles s on s.id = p.student_id
where p.student_type = 'profile'
  and p.cancelled_at is null
  and s.role = 'student'
  and s.active is distinct from false
  and (p.ends_before is null or (now() at time zone 'Europe/Madrid')::date < p.ends_before)
  and (
    auth.role() = 'service_role'
    or app_private.can_read_class_enrolment(p.class_id, p.student_type, p.student_id)
  );

create view public.class_roster_young_learners as
select
  y.id,
  y.first_name,
  y.last_name,
  p.class_id,
  p.starts_on as enrolled_at,
  p.ends_before,
  y.active,
  y.created_at,
  y.updated_at
from public.class_enrolment_periods p
join public.young_learners y on y.id = p.student_id
where p.student_type = 'young_learner'
  and p.cancelled_at is null
  and y.active = true
  and (p.ends_before is null or (now() at time zone 'Europe/Madrid')::date < p.ends_before)
  and (
    auth.role() = 'service_role'
    or app_private.can_read_class_enrolment(p.class_id, p.student_type, p.student_id)
  );

alter view public.class_roster_profiles owner to postgres;
alter view public.class_roster_young_learners owner to postgres;
revoke all on public.class_roster_profiles, public.class_roster_young_learners from public, anon;
grant select on public.class_roster_profiles, public.class_roster_young_learners to authenticated, service_role;

commit;
