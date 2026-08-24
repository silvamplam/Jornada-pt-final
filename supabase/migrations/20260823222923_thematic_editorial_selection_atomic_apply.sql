create or replace function public.matchday_editorial_profile_workspace_token(
  p_matchday_id uuid,
  p_profile_key text
)
returns table(state_token text)
language sql
stable
security definer
set search_path to ''
as $function$
  select pg_catalog.md5(
    pg_catalog.jsonb_build_object(
      'thematic_reconcile',
      coalesce(
        (
          select token_row.state_token
          from public.matchday_editorial_profile_reconcile_token(
            p_matchday_id,
            p_profile_key
          ) as token_row
        ),
        ''
      ),
      'opening_editorial',
      coalesce(
        (
          select pg_catalog.to_jsonb(editorial_row)
          from public.matchday_editorials as editorial_row
          where editorial_row.matchday_id = p_matchday_id
        ),
        'null'::jsonb
      ),
      'opening_highlights',
      coalesce(
        (
          select pg_catalog.jsonb_agg(
            pg_catalog.to_jsonb(highlight_row)
            order by highlight_row.sort_order,
                     highlight_row.id
          )
          from public.matchday_highlights as highlight_row
          where highlight_row.matchday_id = p_matchday_id
        ),
        '[]'::jsonb
      ),
      'editorial_selection',
      coalesce(
        (
          select pg_catalog.jsonb_agg(
            pg_catalog.to_jsonb(selection_row)
            order by selection_row.slot_type
          )
          from public.matchday_live_layout_items as selection_row
          where selection_row.matchday_id = p_matchday_id
            and selection_row.slot_type in (
              'live_four_news:1',
              'live_four_news:2',
              'live_four_news:3',
              'live_four_news:4'
            )
        ),
        '[]'::jsonb
      )
    )::text
  ) as state_token;
$function$;

create or replace function
public.apply_matchday_editorial_profile_workspace_v5(
  p_matchday_id uuid,
  p_profile_key text,
  p_expected_revision bigint,
  p_expected_state_token text,
  p_overrides jsonb,
  p_zone_items jsonb,
  p_faixa_source_ids jsonb,
  p_opening jsonb,
  p_page_controls jsonb,
  p_selection_bank_item_ids jsonb
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
set search_path to ''
as $function$
declare
  v_apply record;
  v_final_revision bigint;
  v_selection_changed boolean := false;
  v_requested_count integer := 0;
  v_distinct_requested_count integer := 0;
  v_valid_requested_count integer := 0;
  v_now timestamptz := pg_catalog.now();
begin
  if p_selection_bank_item_ids is null
    or pg_catalog.jsonb_typeof(
      p_selection_bank_item_ids
    ) <> 'array'
    or pg_catalog.jsonb_array_length(
      p_selection_bank_item_ids
    ) <> 4
  then
    raise exception
      'matchday-editorial-profile-workspace-v5-invalid-selection';
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(
      p_selection_bank_item_ids
    ) as item(value)
    where pg_catalog.jsonb_typeof(item.value)
      not in ('string', 'null')
      or (
        pg_catalog.jsonb_typeof(item.value) = 'string'
        and pg_catalog.btrim(
          item.value #>> '{}'
        ) !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      )
  ) then
    raise exception
      'matchday-editorial-profile-workspace-v5-invalid-selection';
  end if;

  select
    count(*) filter (
      where requested.bank_item_id is not null
    ),
    count(
      distinct requested.bank_item_id
    ) filter (
      where requested.bank_item_id is not null
    )
  into
    v_requested_count,
    v_distinct_requested_count
  from (
    select
      nullif(
        pg_catalog.btrim(
          item.value #>> '{}'
        ),
        ''
      )::uuid as bank_item_id
    from pg_catalog.jsonb_array_elements(
      p_selection_bank_item_ids
    ) as item(value)
  ) as requested;

  if v_requested_count
    <> v_distinct_requested_count
  then
    raise exception
      'matchday-editorial-profile-workspace-v5-duplicate-selection';
  end if;

  select count(*)
  into v_valid_requested_count
  from public.matchday_editorial_bank_items
    as bank_row
  where bank_row.id in (
    select
      nullif(
        pg_catalog.btrim(
          item.value #>> '{}'
        ),
        ''
      )::uuid
    from pg_catalog.jsonb_array_elements(
      p_selection_bank_item_ids
    ) as item(value)
    where pg_catalog.jsonb_typeof(
      item.value
    ) = 'string'
  )
    and bank_row.matchday_id = p_matchday_id
    and bank_row.status = 'active'
    and lower(
      pg_catalog.btrim(
        coalesce(
          bank_row.source_type,
          ''
        )
      )
    ) in (
      'editorial_article',
      'editorial_content'
    )
    and pg_catalog.btrim(
      coalesce(
        bank_row.source_id,
        ''
      )
    ) <> ''
    and pg_catalog.btrim(
      coalesce(
        bank_row.title,
        ''
      )
    ) <> ''
    and pg_catalog.btrim(
      coalesce(
        bank_row.link_url,
        ''
      )
    ) <> '';

  if v_valid_requested_count
    <> v_requested_count
  then
    raise exception
      'matchday-editorial-profile-workspace-v5-selection-not-found';
  end if;

  with requested as (
    select
      item.ordinality::integer as position,
      nullif(
        pg_catalog.btrim(
          item.value #>> '{}'
        ),
        ''
      )::uuid as bank_item_id
    from pg_catalog.jsonb_array_elements(
      p_selection_bank_item_ids
    ) with ordinality
      as item(value, ordinality)
  ),
  requested_identity as (
    select
      requested.position,
      lower(
        pg_catalog.btrim(
          coalesce(
            bank_row.source_type,
            ''
          )
        )
      ) as source_type,
      pg_catalog.btrim(
        coalesce(
          bank_row.source_id,
          ''
        )
      ) as source_id
    from requested
    left join public.matchday_editorial_bank_items
      as bank_row
      on bank_row.id =
        requested.bank_item_id
  ),
  current_identity as (
    select
      substring(
        live_row.slot_type
        from '([1-4])$'
      )::integer as position,
      lower(
        pg_catalog.btrim(
          coalesce(
            live_row.source_type,
            ''
          )
        )
      ) as source_type,
      pg_catalog.btrim(
        coalesce(
          live_row.source_id,
          ''
        )
      ) as source_id
    from public.matchday_live_layout_items
      as live_row
    where live_row.matchday_id =
      p_matchday_id
      and live_row.slot_type in (
        'live_four_news:1',
        'live_four_news:2',
        'live_four_news:3',
        'live_four_news:4'
      )
  ),
  compared as (
    select
      requested_identity.position,
      requested_identity.source_type
        as requested_source_type,
      requested_identity.source_id
        as requested_source_id,
      current_identity.source_type
        as current_source_type,
      current_identity.source_id
        as current_source_id
    from requested_identity
    left join current_identity
      on current_identity.position =
        requested_identity.position
  )
  select exists (
    select 1
    from compared
    where coalesce(
      requested_source_type,
      ''
    ) is distinct from coalesce(
      current_source_type,
      ''
    )
       or coalesce(
         requested_source_id,
         ''
       ) is distinct from coalesce(
         current_source_id,
         ''
       )
  )
  into v_selection_changed;

  select *
  into v_apply
  from public.apply_matchday_editorial_profile_workspace_v4(
    p_matchday_id,
    p_profile_key,
    p_expected_revision,
    p_expected_state_token,
    p_overrides,
    p_zone_items,
    p_faixa_source_ids,
    p_opening,
    p_page_controls
  );

  if v_selection_changed then
    delete
    from public.matchday_live_layout_items
      as live_row
    where live_row.matchday_id =
      p_matchday_id
      and live_row.slot_type in (
        'live_four_news:1',
        'live_four_news:2',
        'live_four_news:3',
        'live_four_news:4'
      );

    insert into public.matchday_live_layout_items (
      matchday_id,
      slot_type,
      article_id,
      source_type,
      source_id,
      label,
      title,
      subtitle,
      image_url,
      link_url,
      updated_at
    )
    select
      p_matchday_id,
      'live_four_news:'
        || requested.position::text,
      case
        when lower(
          pg_catalog.btrim(
            coalesce(
              bank_row.source_type,
              ''
            )
          )
        ) = 'editorial_article'
          and pg_catalog.btrim(
            coalesce(
              bank_row.source_id,
              ''
            )
          ) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then pg_catalog.btrim(
          bank_row.source_id
        )::uuid
        else null
      end,
      lower(
        pg_catalog.btrim(
          bank_row.source_type
        )
      ),
      pg_catalog.btrim(
        bank_row.source_id
      ),
      nullif(
        pg_catalog.btrim(
          bank_row.label
        ),
        ''
      ),
      pg_catalog.btrim(
        bank_row.title
      ),
      nullif(
        pg_catalog.btrim(
          bank_row.subtitle
        ),
        ''
      ),
      nullif(
        pg_catalog.btrim(
          bank_row.image_url
        ),
        ''
      ),
      nullif(
        pg_catalog.btrim(
          bank_row.link_url
        ),
        ''
      ),
      v_now
    from (
      select
        item.ordinality::integer
          as position,
        nullif(
          pg_catalog.btrim(
            item.value #>> '{}'
          ),
          ''
        )::uuid
          as bank_item_id
      from pg_catalog.jsonb_array_elements(
        p_selection_bank_item_ids
      ) with ordinality
        as item(value, ordinality)
    ) as requested
    join public.matchday_editorial_bank_items
      as bank_row
      on bank_row.id =
        requested.bank_item_id;
  end if;

  v_final_revision :=
    v_apply.revision;

  if v_selection_changed
    and v_final_revision =
      p_expected_revision
  then
    update public.matchday_editorial_profile_reconcile_control
      as control_row
    set revision =
          control_row.revision + 1,
        last_applied_at = v_now,
        updated_at = v_now
    where control_row.matchday_id =
      p_matchday_id
      and control_row.profile_key =
        p_profile_key
    returning control_row.revision
    into v_final_revision;
  end if;

  return query
  select
    v_final_revision,
    token_row.state_token,
    v_apply.applied_override_count,
    v_apply.applied_zone_item_count,
    v_apply.applied_faixa_count,
    v_apply.applied_opening_count,
    v_requested_count
  from public.matchday_editorial_profile_workspace_token(
    p_matchday_id,
    p_profile_key
  ) as token_row;
end;
$function$;

revoke all
on function
public.apply_matchday_editorial_profile_workspace_v5(
  uuid,
  text,
  bigint,
  text,
  jsonb,
  jsonb,
  jsonb,
  jsonb,
  jsonb,
  jsonb
)
from public;

revoke all
on function
public.apply_matchday_editorial_profile_workspace_v5(
  uuid,
  text,
  bigint,
  text,
  jsonb,
  jsonb,
  jsonb,
  jsonb,
  jsonb,
  jsonb
)
from anon;

revoke all
on function
public.apply_matchday_editorial_profile_workspace_v5(
  uuid,
  text,
  bigint,
  text,
  jsonb,
  jsonb,
  jsonb,
  jsonb,
  jsonb,
  jsonb
)
from authenticated;

grant execute
on function
public.apply_matchday_editorial_profile_workspace_v5(
  uuid,
  text,
  bigint,
  text,
  jsonb,
  jsonb,
  jsonb,
  jsonb,
  jsonb,
  jsonb
)
to service_role;