begin;

update public.levels
set
  name = 'Support Classes',
  catagory = 'support'
where upper(trim(name)) = 'SUPPORT CLASSES';

insert into public.levels (name, catagory)
select
  'Support Classes',
  'support'
where not exists (
  select 1
  from public.levels
  where upper(trim(name)) = 'SUPPORT CLASSES'
);

commit;
