begin;

create or replace function
public.matchday_editorial_profile_workspace_sources_uncached(
  p_matchday_id uuid
)
returns table(
  source_type text,
  source_id text,
  automatic_eligible boolean,
  continuity_source_matchday_id uuid,
  continuity_source_composition_id uuid,
  is_continuity boolean
)
language sql
stable
security definer
set search_path = ''
as $function$
  with classification as materialized (
    select classified_row.source_type, classified_row.source_id
    from public.matchday_editorial_profile_classification_plan(
      p_matchday_id
    ) as classified_row
  ),
  continuity as materialized (
    select
      transition_row.source_matchday_id,
      transition_row.source_composition_id
    from public.matchday_editorial_continuity_transitions as transition_row
    where transition_row.target_matchday_id = p_matchday_id
  )
  select
    pg_catalog.lower(pg_catalog.btrim(bank_row.source_type)) as source_type,
    pg_catalog.lower(pg_catalog.btrim(bank_row.source_id)) as source_id,
    bank_row.automatic_eligible,
    bank_row.continuity_source_matchday_id,
    bank_row.continuity_source_composition_id,
    exists (
      select 1
      from continuity as transition_row
      where transition_row.source_matchday_id =
        bank_row.continuity_source_matchday_id
        and transition_row.source_composition_id =
          bank_row.continuity_source_composition_id
    ) as is_continuity
  from public.matchday_editorial_bank_items as bank_row
  join public.editorial_articles as article_row
    on article_row.id = case
      when pg_catalog.lower(pg_catalog.btrim(bank_row.source_id)) ~*
        '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      then pg_catalog.lower(pg_catalog.btrim(bank_row.source_id))::uuid
      else null
    end
   and article_row.status = 'published'
  where bank_row.matchday_id = p_matchday_id
    and pg_catalog.lower(pg_catalog.btrim(bank_row.status)) = 'active'
    and pg_catalog.lower(pg_catalog.btrim(bank_row.source_type)) =
      'editorial_article'
    and nullif(pg_catalog.btrim(bank_row.source_id), '') is not null
    and (
      (
        bank_row.automatic_eligible
        and exists (
          select 1
          from classification as classified_row
          where classified_row.source_type = 'editorial_article'
            and classified_row.source_id =
              pg_catalog.lower(pg_catalog.btrim(bank_row.source_id))
        )
      )
      or exists (
        select 1
        from continuity as transition_row
        where transition_row.source_matchday_id =
          bank_row.continuity_source_matchday_id
          and transition_row.source_composition_id =
            bank_row.continuity_source_composition_id
      )
    )
  order by
    pg_catalog.lower(pg_catalog.btrim(bank_row.source_type)),
    pg_catalog.lower(pg_catalog.btrim(bank_row.source_id));
$function$;

revoke all on function
  public.matchday_editorial_profile_workspace_sources_uncached(uuid)
from public, anon, authenticated, service_role;


create or replace function
public.matchday_editorial_profile_workspace_sources(
  p_matchday_id uuid
)
returns table(
  source_type text,
  source_id text,
  automatic_eligible boolean,
  continuity_source_matchday_id uuid,
  continuity_source_composition_id uuid,
  is_continuity boolean
)
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_cache_enabled boolean :=
    pg_catalog.current_setting(
      'jornada.thematic_apply_token_cache_mode',
      true
    ) = 'v10';

  v_cached_matchday_id text;
  v_cached_sources text;
begin
  if v_cache_enabled then
    v_cached_matchday_id := nullif(
      pg_catalog.current_setting(
        'jornada.thematic_workspace_sources_cache_matchday',
        true
      ),
      ''
    );

    v_cached_sources := nullif(
      pg_catalog.current_setting(
        'jornada.thematic_workspace_sources_cache',
        true
      ),
      ''
    );

    if v_cached_matchday_id = p_matchday_id::text
      and v_cached_sources is not null
    then
      return query
      select
        cached_row.source_type,
        cached_row.source_id,
        cached_row.automatic_eligible,
        cached_row.continuity_source_matchday_id,
        cached_row.continuity_source_composition_id,
        cached_row.is_continuity
      from pg_catalog.jsonb_to_recordset(
        v_cached_sources::jsonb
      ) as cached_row(
        source_type text,
        source_id text,
        automatic_eligible boolean,
        continuity_source_matchday_id uuid,
        continuity_source_composition_id uuid,
        is_continuity boolean
      )
      order by cached_row.source_type, cached_row.source_id;

      return;
    end if;
  end if;

  if v_cache_enabled then
    select coalesce(
      pg_catalog.jsonb_agg(
        pg_catalog.to_jsonb(source_row)
        order by source_row.source_type, source_row.source_id
      ),
      '[]'::jsonb
    )::text
    into v_cached_sources
    from public.matchday_editorial_profile_workspace_sources_uncached(
      p_matchday_id
    ) as source_row;

    perform pg_catalog.set_config(
      'jornada.thematic_workspace_sources_cache_matchday',
      p_matchday_id::text,
      true
    );

    perform pg_catalog.set_config(
      'jornada.thematic_workspace_sources_cache',
      v_cached_sources,
      true
    );

    return query
    select
      cached_row.source_type,
      cached_row.source_id,
      cached_row.automatic_eligible,
      cached_row.continuity_source_matchday_id,
      cached_row.continuity_source_composition_id,
      cached_row.is_continuity
    from pg_catalog.jsonb_to_recordset(
      v_cached_sources::jsonb
    ) as cached_row(
      source_type text,
      source_id text,
      automatic_eligible boolean,
      continuity_source_matchday_id uuid,
      continuity_source_composition_id uuid,
      is_continuity boolean
    )
    order by cached_row.source_type, cached_row.source_id;

    return;
  end if;

  return query
  select *
  from public.matchday_editorial_profile_workspace_sources_uncached(
    p_matchday_id
  );
end;
$function$;

revoke all on function
  public.matchday_editorial_profile_workspace_sources(uuid)
from public, anon, authenticated, service_role;

grant execute on function
  public.matchday_editorial_profile_workspace_sources(uuid)
to service_role;


create or replace function
public.apply_matchday_editorial_profile_workspace_v10(
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
  v_final_state_token text;
begin
  perform pg_catalog.set_config(
    'jornada.thematic_workspace_token_cache',
    '',
    true
  );

  perform pg_catalog.set_config(
    'jornada.thematic_reconcile_token_cache',
    '',
    true
  );

  perform pg_catalog.set_config(
    'jornada.thematic_workspace_sources_cache',
    '',
    true
  );

  perform pg_catalog.set_config(
    'jornada.thematic_workspace_sources_cache_matchday',
    '',
    true
  );

  perform pg_catalog.set_config(
    'jornada.thematic_apply_token_cache_mode',
    'v10',
    true
  );

  select *
  into v_apply
  from public.apply_matchday_editorial_profile_workspace_v9(
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

  perform pg_catalog.set_config(
    'jornada.thematic_apply_token_cache_mode',
    'off',
    true
  );

  perform pg_catalog.set_config(
    'jornada.thematic_workspace_token_cache',
    '',
    true
  );

  perform pg_catalog.set_config(
    'jornada.thematic_reconcile_token_cache',
    '',
    true
  );

  perform pg_catalog.set_config(
    'jornada.thematic_workspace_sources_cache',
    '',
    true
  );

  perform pg_catalog.set_config(
    'jornada.thematic_workspace_sources_cache_matchday',
    '',
    true
  );

  select token_row.state_token
  into v_final_state_token
  from public.matchday_editorial_profile_workspace_token(
    p_matchday_id,
    p_profile_key
  ) as token_row;

  return query
  select
    v_apply.revision,
    v_final_state_token,
    v_apply.applied_override_count,
    v_apply.applied_zone_item_count,
    v_apply.applied_faixa_count,
    v_apply.applied_opening_count,
    v_apply.applied_selection_count;
end;
$function$;

revoke all on function
  public.apply_matchday_editorial_profile_workspace_v10(
    uuid,text,bigint,text,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb
  )
from public, anon, authenticated, service_role;

grant execute on function
  public.apply_matchday_editorial_profile_workspace_v10(
    uuid,text,bigint,text,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb
  )
to service_role;

commit;
