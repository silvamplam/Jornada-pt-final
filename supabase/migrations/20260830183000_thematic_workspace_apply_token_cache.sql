begin;

-- A v9 continua a ser a implementação autoritativa do Apply.
-- Esta migration elimina apenas recomputações redundantes dos tokens
-- durante uma chamada v10. Fora da v10, os helpers mantêm o
-- comportamento anterior.

create or replace function
public.matchday_editorial_profile_reconcile_token_uncached(
  p_matchday_id uuid,
  p_profile_key text
)
returns table(state_token text)
language sql
stable
security definer
set search_path = ''
as $function$
  with classification as materialized (
    select classified_row.*
    from public.matchday_editorial_profile_classification_plan(
      p_matchday_id
    ) as classified_row
  )
  select pg_catalog.md5(
    pg_catalog.jsonb_build_object(
      'assignment', coalesce(
        (
          select pg_catalog.to_jsonb(assignment_row)
          from public.matchday_editorial_profile_assignments as assignment_row
          where assignment_row.matchday_id = p_matchday_id
        ),
        'null'::jsonb
      ),
      'classification', coalesce(
        (
          select pg_catalog.jsonb_agg(
            pg_catalog.to_jsonb(classified_row)
            order by classified_row.source_type, classified_row.source_id
          )
          from classification as classified_row
        ),
        '[]'::jsonb
      ),
      'automatic_state', coalesce(
        (
          select pg_catalog.jsonb_agg(
            pg_catalog.to_jsonb(state_row)
            order by state_row.source_type, state_row.source_id
          )
          from public.matchday_editorial_profile_state_items as state_row
          where state_row.matchday_id = p_matchday_id
            and state_row.profile_key = p_profile_key
        ),
        '[]'::jsonb
      ),
      'articles', coalesce(
        (
          select pg_catalog.jsonb_agg(
            pg_catalog.to_jsonb(article_row)
            order by article_row.id
          )
          from public.editorial_articles as article_row
          where article_row.id = any(
            array(
              select case
                when classified_row.source_id ~*
                  '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
                then classified_row.source_id::uuid
                else null
              end
              from classification as classified_row
            )
          )
        ),
        '[]'::jsonb
      ),
      'overrides', coalesce(
        (
          select pg_catalog.jsonb_agg(
            pg_catalog.to_jsonb(override_row)
            order by override_row.source_type, override_row.source_id
          )
          from public.matchday_editorial_profile_manual_overrides as override_row
          where override_row.matchday_id = p_matchday_id
            and override_row.profile_key = p_profile_key
        ),
        '[]'::jsonb
      ),
      'zone_items', coalesce(
        (
          select pg_catalog.jsonb_agg(
            pg_catalog.to_jsonb(zone_row)
            order by zone_row.zone_key, zone_row.sort_order, zone_row.source_id
          )
          from public.matchday_editorial_profile_zone_items as zone_row
          where zone_row.matchday_id = p_matchday_id
            and zone_row.profile_key = p_profile_key
        ),
        '[]'::jsonb
      ),
      'control', coalesce(
        (
          select pg_catalog.to_jsonb(control_row)
          from public.matchday_editorial_profile_reconcile_control as control_row
          where control_row.matchday_id = p_matchday_id
            and control_row.profile_key = p_profile_key
        ),
        'null'::jsonb
      ),
      'faixa', coalesce(
        (
          select pg_catalog.jsonb_agg(
            pg_catalog.to_jsonb(faixa_row)
            order by faixa_row.sort_order, faixa_row.id
          )
          from public.matchday_horizontal_news as faixa_row
          where faixa_row.matchday_id = p_matchday_id
        ),
        '[]'::jsonb
      )
    )::text
  ) as state_token;
$function$;


create or replace function
public.matchday_editorial_profile_workspace_token_uncached(
  p_matchday_id uuid,
  p_profile_key text
)
returns table(state_token text)
language sql
stable
security definer
set search_path = ''
as $function$
  with workspace_sources as materialized (
    select source_row.*
    from public.matchday_editorial_profile_workspace_sources(
      p_matchday_id
    ) as source_row
  )
  select pg_catalog.md5(
    pg_catalog.jsonb_build_object(
      'thematic_reconcile', coalesce(
        (
          select token_row.state_token
          from public.matchday_editorial_profile_reconcile_token_uncached(
            p_matchday_id,
            p_profile_key
          ) as token_row
        ),
        ''
      ),
      'workspace_sources', coalesce(
        (
          select pg_catalog.jsonb_agg(
            pg_catalog.to_jsonb(source_row)
            order by source_row.source_type, source_row.source_id
          )
          from workspace_sources as source_row
        ),
        '[]'::jsonb
      ),
      'workspace_articles', coalesce(
        (
          select pg_catalog.jsonb_agg(
            pg_catalog.to_jsonb(article_row)
            order by article_row.id
          )
          from public.editorial_articles as article_row
          where article_row.id = any(
            array(
              select case
                when source_row.source_id ~*
                  '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
                then source_row.source_id::uuid
                else null
              end
              from workspace_sources as source_row
            )
          )
        ),
        '[]'::jsonb
      ),
      'opening_editorial', coalesce(
        (
          select pg_catalog.to_jsonb(editorial_row)
          from public.matchday_editorials as editorial_row
          where editorial_row.matchday_id = p_matchday_id
        ),
        'null'::jsonb
      ),
      'opening_highlights', coalesce(
        (
          select pg_catalog.jsonb_agg(
            pg_catalog.to_jsonb(highlight_row)
            order by highlight_row.sort_order, highlight_row.id
          )
          from public.matchday_highlights as highlight_row
          where highlight_row.matchday_id = p_matchday_id
        ),
        '[]'::jsonb
      ),
      'editorial_selection', coalesce(
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

revoke all on function
  public.matchday_editorial_profile_reconcile_token_uncached(uuid,text)
from public, anon, authenticated, service_role;

revoke all on function
  public.matchday_editorial_profile_workspace_token_uncached(uuid,text)
from public, anon, authenticated, service_role;


create or replace function
public.matchday_editorial_profile_reconcile_token(
  p_matchday_id uuid,
  p_profile_key text
)
returns table(state_token text)
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
  v_token text;
begin
  if v_cache_enabled then
    v_token := nullif(
      pg_catalog.current_setting(
        'jornada.thematic_reconcile_token_cache',
        true
      ),
      ''
    );

    if v_token is not null then
      return query select v_token;
      return;
    end if;
  end if;

  select token_row.state_token
  into v_token
  from public.matchday_editorial_profile_reconcile_token_uncached(
    p_matchday_id,
    p_profile_key
  ) as token_row;

  if v_cache_enabled then
    perform pg_catalog.set_config(
      'jornada.thematic_reconcile_token_cache',
      v_token,
      true
    );
  end if;

  return query select v_token;
end;
$function$;


create or replace function
public.matchday_editorial_profile_workspace_token(
  p_matchday_id uuid,
  p_profile_key text
)
returns table(state_token text)
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
  v_token text;
begin
  if v_cache_enabled then
    v_token := nullif(
      pg_catalog.current_setting(
        'jornada.thematic_workspace_token_cache',
        true
      ),
      ''
    );

    if v_token is not null then
      return query select v_token;
      return;
    end if;
  end if;

  select token_row.state_token
  into v_token
  from public.matchday_editorial_profile_workspace_token_uncached(
    p_matchday_id,
    p_profile_key
  ) as token_row;

  if v_cache_enabled then
    perform pg_catalog.set_config(
      'jornada.thematic_workspace_token_cache',
      v_token,
      true
    );
  end if;

  return query select v_token;
end;
$function$;


revoke all on function
  public.matchday_editorial_profile_reconcile_token(uuid,text)
from public, anon, authenticated, service_role;

grant execute on function
  public.matchday_editorial_profile_reconcile_token(uuid,text)
to service_role;

revoke all on function
  public.matchday_editorial_profile_workspace_token(uuid,text)
from public, anon, authenticated, service_role;

grant execute on function
  public.matchday_editorial_profile_workspace_token(uuid,text)
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

  -- A partir daqui os tokens intermédios deixam de ser reutilizáveis.
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

  -- Único recálculo autoritativo após todas as mutações.
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

comment on function
  public.apply_matchday_editorial_profile_workspace_v10(
    uuid,text,bigint,text,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb
  )
is
  'Delegates all thematic workspace semantics to v9 while transaction-locally caching intermediate optimistic tokens; the final workspace token is recomputed uncached after all writes.';

commit;
