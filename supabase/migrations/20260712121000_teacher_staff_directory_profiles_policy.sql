create schema if not exists app_private;

do $$
begin
  if to_regprocedure('app_private.is_teacher()') is null then
    execute $function$
      create function app_private.is_teacher()
      returns boolean
      language sql
      stable
      security definer
      set search_path = public, pg_temp
      as $body$
        select exists (
          select 1
          from public.profiles
          where id = auth.uid()
            and role = 'teacher'
        )
      $body$
    $function$;

    revoke all on function app_private.is_teacher() from public;
    grant execute on function app_private.is_teacher() to authenticated;
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'profiles'
      and policyname = 'Teachers can read staff directory profiles'
  ) then
    execute $policy$
      create policy "Teachers can read staff directory profiles"
      on public.profiles
      for select
      to authenticated
      using (
        app_private.is_teacher()
        and role in ('admin', 'teacher')
      )
    $policy$;
  end if;
end
$$;
