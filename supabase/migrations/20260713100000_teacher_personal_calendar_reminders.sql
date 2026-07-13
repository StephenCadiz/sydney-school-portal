alter table public.teacher_calendar_events
add column if not exists completed boolean not null default false;

drop policy if exists "Admins and teachers can read teacher calendar events"
on public.teacher_calendar_events;

drop policy if exists "Admins can read all teacher calendar events"
on public.teacher_calendar_events;

drop policy if exists "Teachers can read school and own calendar events"
on public.teacher_calendar_events;

drop policy if exists "Teachers can insert own personal calendar reminders"
on public.teacher_calendar_events;

drop policy if exists "Teachers can update own personal calendar reminders"
on public.teacher_calendar_events;

drop policy if exists "Teachers can delete own personal calendar reminders"
on public.teacher_calendar_events;

create policy "Admins can read all teacher calendar events"
on public.teacher_calendar_events
for select
to authenticated
using (
  app_private.is_admin()
);

create policy "Teachers can read school and own calendar events"
on public.teacher_calendar_events
for select
to authenticated
using (
  app_private.is_teacher()
  and (
    audience = 'all_teachers'
    or teacher_id = auth.uid()
  )
);

create policy "Teachers can insert own personal calendar reminders"
on public.teacher_calendar_events
for insert
to authenticated
with check (
  app_private.is_teacher()
  and teacher_id = auth.uid()
  and created_by = auth.uid()
  and audience = 'personal'
);

create policy "Teachers can update own personal calendar reminders"
on public.teacher_calendar_events
for update
to authenticated
using (
  app_private.is_teacher()
  and teacher_id = auth.uid()
  and created_by = auth.uid()
  and audience = 'personal'
)
with check (
  app_private.is_teacher()
  and teacher_id = auth.uid()
  and created_by = auth.uid()
  and audience = 'personal'
);

create policy "Teachers can delete own personal calendar reminders"
on public.teacher_calendar_events
for delete
to authenticated
using (
  app_private.is_teacher()
  and teacher_id = auth.uid()
  and created_by = auth.uid()
  and audience = 'personal'
);

create index if not exists teacher_calendar_events_teacher_date_idx
on public.teacher_calendar_events (teacher_id, event_date);

create index if not exists teacher_calendar_events_audience_date_idx
on public.teacher_calendar_events (audience, event_date);
