begin;

alter table public.friday_tutorial_result_sheets
  drop constraint friday_tutorial_result_sheets_tutorial_session_id_fkey;

alter table public.friday_tutorial_result_sheets
  add constraint friday_tutorial_result_sheets_tutorial_session_id_fkey
  foreign key (tutorial_session_id)
  references public.friday_exam_practice_sessions(id)
  on delete cascade;

commit;
