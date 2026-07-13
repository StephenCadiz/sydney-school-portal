do $$
declare
  v_data_type text;
begin
  select data_type
  into v_data_type
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'messages'
    and column_name = 'created_at';

  if v_data_type = 'timestamp without time zone' then
    alter table public.messages
      alter column created_at drop default;

    alter table public.messages
      alter column created_at type timestamptz
      using created_at at time zone 'UTC';

    alter table public.messages
      alter column created_at set default now();
  end if;
end;
$$;
