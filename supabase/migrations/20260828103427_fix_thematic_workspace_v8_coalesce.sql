create or replace function public.apply_matchday_editorial_profile_workspace_v8(
  p_matchday_id uuid,
  p_profile_key text,
  p_expected_revision bigint,
  p_expected_state_token text,
  p_overrides jsonb,
  p_zone_items jsonb,
  p_faixa_source_ids jsonb,
  p_opening jsonb,
  p_page_controls jsonb,
  p_selection_bank_item_ids jsonb,
  p_video_module jsonb,
  p_worked_source_ids jsonb
)
returns table(
  revision bigint,
  state_token text,
  applied_override_count integer,
  applied_zone_item_count integer,
  applied_faixa_count integer,
  applied_opening_count integer,
  applied_selection_count integer
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_apply record;
begin
  if p_worked_source_ids is null
    or pg_catalog.jsonb_typeof(p_worked_source_ids) <> 'array'
    or exists (
      select 1
      from pg_catalog.jsonb_array_elements(p_worked_source_ids)
        as worked_row(value)
      where pg_catalog.jsonb_typeof(worked_row.value) <> 'string'
        or nullif(pg_catalog.btrim(worked_row.value #>> '{}'), '') is null
    )
    or (
      select pg_catalog.count(*)
      from pg_catalog.jsonb_array_elements(p_worked_source_ids)
    ) <> (
      select pg_catalog.count(
        distinct pg_catalog.lower(
          pg_catalog.btrim(worked_row.value #>> '{}')
        )
      )
      from pg_catalog.jsonb_array_elements(p_worked_source_ids)
        as worked_row(value)
    )
  then
    raise exception
      'matchday-editorial-profile-workspace-v8-invalid-worked-sources';
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(p_worked_source_ids)
      as worked_row(value)
    where not exists (
      select 1
      from public.matchday_editorial_profile_workspace_sources(
        p_matchday_id
      ) as source_row
      where source_row.source_type = 'editorial_article'
        and source_row.source_id = pg_catalog.lower(
          pg_catalog.btrim(worked_row.value #>> '{}')
        )
    )
  ) then
    raise exception
      'matchday-editorial-profile-workspace-v8-worked-source-not-active';
  end if;

  if exists (
    with selected_sources as (
      select
        pg_catalog.lower(pg_catalog.btrim(bank_row.source_type))
          as source_type,
        pg_catalog.lower(pg_catalog.btrim(bank_row.source_id))
          as source_id
      from pg_catalog.jsonb_array_elements(p_selection_bank_item_ids)
        as selection_row(value)
      join public.matchday_editorial_bank_items as bank_row
        on bank_row.id::text = pg_catalog.btrim(
          selection_row.value #>> '{}'
        )
       and bank_row.matchday_id = p_matchday_id
      where pg_catalog.jsonb_typeof(selection_row.value) = 'string'
    )
    select 1
    from selected_sources as selected_row
    where selected_row.source_type = 'editorial_article'
      and (
        exists (
          select 1
          from pg_catalog.jsonb_each(p_opening)
            as opening_row(slot_key, value)
          where pg_catalog.jsonb_typeof(opening_row.value) = 'string'
            and pg_catalog.lower(
              pg_catalog.btrim(opening_row.value #>> '{}')
            ) = selected_row.source_id
        )
        or exists (
          select 1
          from pg_catalog.jsonb_array_elements(p_zone_items)
            as zone_row(value)
          where pg_catalog.lower(
              pg_catalog.btrim(zone_row.value ->> 'source_type')
            ) = selected_row.source_type
            and pg_catalog.lower(
              pg_catalog.btrim(zone_row.value ->> 'source_id')
            ) = selected_row.source_id
        )
        or exists (
          select 1
          from pg_catalog.jsonb_array_elements(p_faixa_source_ids)
            as faixa_row(value)
          where pg_catalog.lower(
              pg_catalog.btrim(faixa_row.value #>> '{}')
            ) = selected_row.source_id
        )
      )
  ) then
    raise exception
      'matchday-editorial-profile-workspace-v8-duplicate-public-placement';
  end if;

  select *
  into v_apply
  from public.apply_matchday_editorial_profile_workspace_v7(
    p_matchday_id,
    p_profile_key,
    p_expected_revision,
    p_expected_state_token,
    p_overrides,
    p_zone_items,
    p_faixa_source_ids,
    p_opening,
    p_page_controls,
    p_selection_bank_item_ids,
    p_video_module
  );

  update public.matchday_editorial_bank_items as bank_row
  set editorially_worked_at = coalesce(
    bank_row.editorially_worked_at,
    pg_catalog.statement_timestamp()
  )
  where bank_row.matchday_id = p_matchday_id
    and pg_catalog.lower(pg_catalog.btrim(bank_row.status)) = 'active'
    and pg_catalog.lower(pg_catalog.btrim(bank_row.source_type))
      = 'editorial_article'
    and bank_row.editorially_worked_at is null
    and (
      pg_catalog.lower(pg_catalog.btrim(bank_row.source_id)) in (
        select pg_catalog.lower(
          pg_catalog.btrim(worked_row.value #>> '{}')
        )
        from pg_catalog.jsonb_array_elements(p_worked_source_ids)
          as worked_row(value)
      )
      or bank_row.id::text in (
        select pg_catalog.btrim(selection_row.value #>> '{}')
        from pg_catalog.jsonb_array_elements(p_selection_bank_item_ids)
          as selection_row(value)
        where pg_catalog.jsonb_typeof(selection_row.value) = 'string'
      )
    );

  return query
  select
    v_apply.revision,
    v_apply.state_token,
    v_apply.applied_override_count,
    v_apply.applied_zone_item_count,
    v_apply.applied_faixa_count,
    v_apply.applied_opening_count,
    v_apply.applied_selection_count;
end;
$function$;

revoke all on function
  public.apply_matchday_editorial_profile_workspace_v8(
    uuid,text,bigint,text,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb
  )
from public;

grant execute on function
  public.apply_matchday_editorial_profile_workspace_v8(
    uuid,text,bigint,text,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb
  )
to service_role;