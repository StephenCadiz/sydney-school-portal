begin;

do $$
declare
  pre_kids_catagory text;
begin
  select level.catagory
  into pre_kids_catagory
  from public.levels as level
  where upper(trim(level.name)) = 'PRE-KIDS 2'
  order by level.id
  limit 1;

  if not found then
    raise exception 'Pre-Kids 2 must exist before Pre-Kids 1 can be added';
  end if;

  update public.levels
  set
    name = 'Pre-Kids 1',
    catagory = pre_kids_catagory
  where upper(trim(name)) = 'PRE-KIDS 1';

  if not found then
    insert into public.levels (name, catagory)
    values ('Pre-Kids 1', pre_kids_catagory);
  end if;
end;
$$;

commit;
