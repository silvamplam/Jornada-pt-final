-- Deployed to Supabase as migration 20260829190443 thematic_workspace_read_dedup.
-- Read-only helper optimization: deduplicate repeated classification/workspace source reads.
-- No Apply logic, classifier logic, data, grants, or timeout settings are changed.

create or replace function public.matchday_editorial_profile_workspace_sources(
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
set search_path to ''
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

create or replace function public.matchday_editorial_profile_reconcile_token(
  p_matchday_id uuid,
  p_profile_key text
)
returns table(state_token text)
language sql
stable
security definer
set search_path to ''
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
          from public.matchday_editorial_profile_reconcile_token(
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
