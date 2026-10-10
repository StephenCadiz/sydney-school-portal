alter table public.push_subscriptions
  drop constraint if exists push_subscriptions_role_check;

alter table public.push_subscriptions
  add constraint push_subscriptions_role_check
  check (role in ('teacher', 'student', 'admin'));

comment on table public.push_subscriptions is 'Private Teacher, Student, and Admin browser push subscriptions; accessed only by authorized server routes.';
