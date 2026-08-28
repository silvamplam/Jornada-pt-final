create or replace function public.apply_matchday_editorial_profile_workspace_v9(
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
  v_requested_layouts jsonb;
  v_apply record;
begin
  if p_zone_items is null
    or pg_catalog.jsonb_typeof(p_zone_items) <> 'array'
    or p_page_controls is null
    or pg_catalog.jsonb_typeof(p_page_controls) <> 'object'
  then
    raise exception
      'matchday-editorial-profile-workspace-v9-invalid-input';
  end if;

  v_requested_layouts :=
    p_page_controls -> 'thematic_zone_layouts';

  if pg_catalog.jsonb_typeof(v_requested_layouts) <> 'object'
    or not (
      v_requested_layouts ?& array[
        'benfica',
        'sporting',
        'fc_porto',
        'other_liga_clubs',
        'outside_liga_other'
      ]
    )
    or (
      v_requested_layouts - array[
        'benfica',
        'sporting',
        'fc_porto',
        'other_liga_clubs',
        'outside_liga_other'
      ]::text[]
    ) <> '{}'::jsonb
  then
    raise exception
      'matchday-editorial-profile-workspace-v9-invalid-zone-layouts';
  end if;

  if p_selection_bank_item_ids is null
    or pg_catalog.jsonb_typeof(p_selection_bank_item_ids) <> 'array'
    or pg_catalog.jsonb_array_length(p_selection_bank_item_ids) <> 4
    or exists (
      select 1
      from pg_catalog.jsonb_array_elements(p_selection_bank_item_ids)
        as selection_row(value)
      where pg_catalog.jsonb_typeof(selection_row.value) <> 'string'
        or nullif(
          pg_catalog.btrim(selection_row.value #>> '{}'),
          ''
        ) is null
    )
  then
    raise exception
      'matchday-editorial-profile-workspace-v9-incomplete-selection';
  end if;

  if (
    select pg_catalog.count(
      distinct pg_catalog.lower(
        pg_catalog.btrim(selection_row.value #>> '{}')
      )
    )
    from pg_catalog.jsonb_array_elements(p_selection_bank_item_ids)
      as selection_row(value)
  ) <> 4
  then
    raise exception
      'matchday-editorial-profile-workspace-v9-duplicate-selection';
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(p_zone_items)
      as zone_row(value)
    where zone_row.value ->> 'zone_key' not in (
      'benfica',
      'sporting',
      'fc_porto',
      'other_liga_clubs',
      'outside_liga_other'
    )
  ) then
    raise exception
      'matchday-editorial-profile-workspace-v9-invalid-zone';
  end if;

  if exists (
    with expected_zones(zone_key, capacity) as (
      values
        (
          'benfica'::text,
          case v_requested_layouts ->> 'benfica'
            when 'six_news' then 6
            when 'five_news_balanced' then 5
            when 'five_news_secondary' then 5
            else 0
          end
        ),
        (
          'sporting'::text,
          case v_requested_layouts ->> 'sporting'
            when 'six_news' then 6
            when 'five_news_balanced' then 5
            when 'five_news_secondary' then 5
            else 0
          end
        ),
        (
          'fc_porto'::text,
          case v_requested_layouts ->> 'fc_porto'
            when 'six_news' then 6
            when 'five_news_balanced' then 5
            when 'five_news_secondary' then 5
            else 0
          end
        ),
        (
          'other_liga_clubs'::text,
          case v_requested_layouts ->> 'other_liga_clubs'
            when 'six_news' then 6
            when 'five_news_balanced' then 5
            when 'five_news_secondary' then 5
            else 0
          end
        ),
        (
          'outside_liga_other'::text,
          case v_requested_layouts ->> 'outside_liga_other'
            when 'six_news' then 6
            when 'five_news_balanced' then 5
            when 'five_news_secondary' then 5
            else 0
          end
        )
    ),
    actual_zones as (
      select
        zone_row.value ->> 'zone_key' as zone_key,
        pg_catalog.count(*)::integer as item_count
      from pg_catalog.jsonb_array_elements(p_zone_items)
        as zone_row(value)
      group by zone_row.value ->> 'zone_key'
    )
    select 1
    from expected_zones as expected
    left join actual_zones as actual
      on actual.zone_key = expected.zone_key
    where coalesce(actual.item_count, 0) <> expected.capacity
  ) then
    raise exception
      'matchday-editorial-profile-workspace-v9-incomplete-zone';
  end if;

  if exists (
    with expected_zones(zone_key, capacity) as (
      values
        (
          'benfica'::text,
          case v_requested_layouts ->> 'benfica'
            when 'six_news' then 6
            else 5
          end
        ),
        (
          'sporting'::text,
          case v_requested_layouts ->> 'sporting'
            when 'six_news' then 6
            else 5
          end
        ),
        (
          'fc_porto'::text,
          case v_requested_layouts ->> 'fc_porto'
            when 'six_news' then 6
            else 5
          end
        ),
        (
          'other_liga_clubs'::text,
          case v_requested_layouts ->> 'other_liga_clubs'
            when 'six_news' then 6
            else 5
          end
        ),
        (
          'outside_liga_other'::text,
          case v_requested_layouts ->> 'outside_liga_other'
            when 'six_news' then 6
            else 5
          end
        )
    )
    select 1
    from expected_zones as expected
    where exists (
      select 1
      from pg_catalog.generate_series(
        1,
        expected.capacity
      ) as required_position(position)
      where not exists (
        select 1
        from pg_catalog.jsonb_array_elements(p_zone_items)
          as zone_row(value)
        where zone_row.value ->> 'zone_key' = expected.zone_key
          and pg_catalog.jsonb_typeof(
            zone_row.value -> 'sort_order'
          ) = 'number'
          and zone_row.value ->> 'sort_order' ~ '^[1-9][0-9]*$'
          and (zone_row.value ->> 'sort_order')::integer
            = required_position.position
      )
    )
  ) then
    raise exception
      'matchday-editorial-profile-workspace-v9-invalid-zone-positions';
  end if;

  select *
  into v_apply
  from public.apply_matchday_editorial_profile_workspace_v8(
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
    p_video_module,
    p_worked_source_ids
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
  public.apply_matchday_editorial_profile_workspace_v9(
    uuid,text,bigint,text,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb
  )
from public;

grant execute on function
  public.apply_matchday_editorial_profile_workspace_v9(
    uuid,text,bigint,text,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb
  )
to service_role;