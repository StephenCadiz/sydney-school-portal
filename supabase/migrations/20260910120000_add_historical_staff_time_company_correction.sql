begin;

alter table public.staff_time_company_settings
  add column if not exists correction_reason text;

comment on column public.staff_time_company_settings.correction_reason is
  'Required audit reason for an Admin-created historical legal-details correction.';

create or replace function public.correct_historical_staff_time_company_settings(
  p_actor_id uuid,
  p_effective_from date,
  p_legal_employer_name text,
  p_tax_identifier text,
  p_workplace_name text,
  p_workplace_address text,
  p_postcode text,
  p_city text,
  p_province text,
  p_country text,
  p_correction_reason text
)
returns public.staff_time_company_settings
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_next public.staff_time_company_settings;
  v_result public.staff_time_company_settings;
  v_reason text;
begin
  perform app_private.staff_time_require_admin(p_actor_id);
  perform pg_advisory_xact_lock(hashtextextended('staff_time_company_history', 0));

  if p_effective_from is null then
    raise exception 'An effective date is required.' using errcode = '22023';
  end if;

  if nullif(btrim(p_legal_employer_name), '') is null then
    raise exception 'Legal employer name is required.' using errcode = '22023';
  end if;
  if nullif(btrim(p_tax_identifier), '') is null then
    raise exception 'CIF/NIF is required.' using errcode = '22023';
  end if;
  if nullif(btrim(p_workplace_name), '') is null then
    raise exception 'Workplace name is required.' using errcode = '22023';
  end if;
  if nullif(btrim(p_workplace_address), '') is null then
    raise exception 'Workplace address is required.' using errcode = '22023';
  end if;
  if nullif(btrim(p_postcode), '') is null then
    raise exception 'Postcode is required.' using errcode = '22023';
  end if;
  if nullif(btrim(p_city), '') is null then
    raise exception 'City is required.' using errcode = '22023';
  end if;
  if nullif(btrim(p_province), '') is null then
    raise exception 'Province is required.' using errcode = '22023';
  end if;
  if nullif(btrim(p_country), '') is null then
    raise exception 'Country is required.' using errcode = '22023';
  end if;

  v_reason := nullif(btrim(p_correction_reason), '');
  if v_reason is null then
    raise exception 'A correction reason is required.' using errcode = '22023';
  end if;
  if char_length(v_reason) > 2000 then
    raise exception 'Correction reason must be 2000 characters or fewer.' using errcode = '22023';
  end if;

  if exists (
    select 1
    from public.staff_time_company_settings
    where effective_from = p_effective_from
  ) then
    raise exception 'A company settings period would overlap an existing record.' using errcode = '23P01';
  end if;

  select * into v_next
  from public.staff_time_company_settings
  where effective_from > p_effective_from
  order by effective_from asc
  limit 1
  for update;

  if v_next.id is null then
    raise exception 'A historical correction must precede an existing company settings record.'
      using errcode = '22023';
  end if;

  if exists (
    select 1
    from public.staff_time_company_settings
    where effective_from <= v_next.effective_from - 1
      and (effective_to is null or effective_to >= p_effective_from)
  ) then
    raise exception 'A company settings period would overlap an existing record.' using errcode = '23P01';
  end if;

  insert into public.staff_time_company_settings (
    effective_from,
    effective_to,
    legal_employer_name,
    tax_identifier,
    workplace_name,
    workplace_address,
    postcode,
    city,
    province,
    country,
    correction_reason,
    created_by
  ) values (
    p_effective_from,
    v_next.effective_from - 1,
    btrim(p_legal_employer_name),
    upper(btrim(p_tax_identifier)),
    btrim(p_workplace_name),
    btrim(p_workplace_address),
    btrim(p_postcode),
    btrim(p_city),
    btrim(p_province),
    btrim(p_country),
    v_reason,
    p_actor_id
  ) returning * into v_result;

  return v_result;
end;
$$;

revoke all on function public.correct_historical_staff_time_company_settings(
  uuid, date, text, text, text, text, text, text, text, text, text
) from public, anon, authenticated;

grant execute on function public.correct_historical_staff_time_company_settings(
  uuid, date, text, text, text, text, text, text, text, text, text
) to service_role;

commit;
