begin;

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
  select
    pg_catalog.lower(pg_catalog.btrim(bank_row.source_type)) as source_type,
    pg_catalog.lower(pg_catalog.btrim(bank_row.source_id)) as source_id,
    bank_row.automatic_eligible,
    bank_row.continuity_source_matchday_id,
    bank_row.continuity_source_composition_id,
    exists (
      select 1
      from public.matchday_editorial_continuity_transitions as transition_row
      where transition_row.target_matchday_id = p_matchday_id
        and transition_row.source_matchday_id =
          bank_row.continuity_source_matchday_id
        and transition_row.source_composition_id =
          bank_row.continuity_source_composition_id
    ) as is_continuity
  from public.matchday_editorial_bank_items as bank_row
  join public.editorial_articles as article_row
    on article_row.id::text =
      pg_catalog.lower(pg_catalog.btrim(bank_row.source_id))
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
          from public.matchday_editorial_profile_classification_plan(
            p_matchday_id
          ) as classified_row
          where classified_row.source_type = 'editorial_article'
            and classified_row.source_id =
              pg_catalog.lower(pg_catalog.btrim(bank_row.source_id))
        )
      )
      or exists (
        select 1
        from public.matchday_editorial_continuity_transitions
          as transition_row
        where transition_row.target_matchday_id = p_matchday_id
          and transition_row.source_matchday_id =
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
  public.matchday_editorial_profile_workspace_sources(uuid)
from public, anon, authenticated;

grant execute on function
  public.matchday_editorial_profile_workspace_sources(uuid)
to service_role;

do $do$
declare
  v_def text;
  v_old constant text :=
    'public.matchday_editorial_profile_classification_plan(p_matchday_id) as classified';
  v_new constant text :=
    'public.matchday_editorial_profile_workspace_sources(p_matchday_id) as classified';
  v_count integer;
begin
  v_def := pg_catalog.pg_get_functiondef(
    'public.apply_matchday_editorial_profile_reconcile(uuid,text,bigint,text,jsonb,jsonb,jsonb)'::pg_catalog.regprocedure
  );

  v_count :=
    (
      pg_catalog.length(v_def)
      - pg_catalog.length(pg_catalog.replace(v_def, v_old, ''))
    ) / pg_catalog.length(v_old);

  if v_count <> 3 then
    raise exception
      'thematic-workspace-continuity-unexpected-reconcile-source-checks';
  end if;

  v_def := pg_catalog.replace(v_def, v_old, v_new);
  execute v_def;
end
$do$;

do $do$
declare
  v_def text;
  v_old_source constant text :=
    'public.matchday_editorial_profile_classification_plan(p_matchday_id) as classified_row';
  v_new_source constant text :=
    'public.matchday_editorial_profile_workspace_sources(p_matchday_id) as classified_row';
  v_old_exact constant text := $old$    ) <> 1
  ) then
    raise exception 'matchday-editorial-profile-workspace-exclusive-placement-incomplete';$old$;
  v_new_exact constant text := $new$    ) > 1
  ) then
    raise exception 'matchday-editorial-profile-workspace-exclusive-placement-incomplete';$new$;
  v_source_count integer;
  v_exact_count integer;
begin
  v_def := pg_catalog.pg_get_functiondef(
    'public.apply_matchday_editorial_profile_workspace(uuid,text,bigint,text,jsonb,jsonb,jsonb,jsonb,jsonb)'::pg_catalog.regprocedure
  );

  v_source_count :=
    (
      pg_catalog.length(v_def)
      - pg_catalog.length(pg_catalog.replace(v_def, v_old_source, ''))
    ) / pg_catalog.length(v_old_source);

  if v_source_count <> 2 then
    raise exception
      'thematic-workspace-continuity-unexpected-workspace-source-checks';
  end if;

  v_exact_count :=
    (
      pg_catalog.length(v_def)
      - pg_catalog.length(pg_catalog.replace(v_def, v_old_exact, ''))
    ) / pg_catalog.length(v_old_exact);

  if v_exact_count <> 1 then
    raise exception
      'thematic-workspace-continuity-unexpected-exclusive-check';
  end if;

  v_def := pg_catalog.replace(v_def, v_old_source, v_new_source);
  v_def := pg_catalog.replace(v_def, v_old_exact, v_new_exact);
  execute v_def;
end
$do$;

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
          from public.matchday_editorial_profile_workspace_sources(
            p_matchday_id
          ) as source_row
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
          where article_row.id::text in (
            select source_row.source_id
            from public.matchday_editorial_profile_workspace_sources(
              p_matchday_id
            ) as source_row
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

create or replace function public.apply_matchday_editorial_profile_workspace_v7(
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
  p_video_module jsonb
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
begin
  if p_matchday_id is null
    or p_overrides is null
    or pg_catalog.jsonb_typeof(p_overrides) <> 'array'
    or p_zone_items is null
    or pg_catalog.jsonb_typeof(p_zone_items) <> 'array'
    or p_faixa_source_ids is null
    or pg_catalog.jsonb_typeof(p_faixa_source_ids) <> 'array'
    or p_opening is null
    or pg_catalog.jsonb_typeof(p_opening) <> 'object'
  then
    raise exception
      'matchday-editorial-profile-workspace-v7-invalid-input';
  end if;

  if exists (
    select 1
    from public.matchday_editorial_profile_workspace_sources(
      p_matchday_id
    ) as source_row
    where source_row.is_continuity
      and (
        (
          select pg_catalog.count(*)
          from pg_catalog.jsonb_each(p_opening)
            as opening_row(slot_key, value)
          where pg_catalog.jsonb_typeof(opening_row.value) = 'string'
            and pg_catalog.lower(
              pg_catalog.btrim(opening_row.value #>> '{}')
            ) = source_row.source_id
        )
        + (
          select pg_catalog.count(*)
          from pg_catalog.jsonb_array_elements(p_zone_items)
            as zone_row(value)
          where pg_catalog.lower(
            pg_catalog.btrim(zone_row.value ->> 'source_id')
          ) = source_row.source_id
        )
        + (
          select pg_catalog.count(*)
          from pg_catalog.jsonb_array_elements(p_faixa_source_ids)
            as faixa_row(value)
          where pg_catalog.lower(
            pg_catalog.btrim(faixa_row.value #>> '{}')
          ) = source_row.source_id
        )
        + (
          select pg_catalog.count(*)
          from pg_catalog.jsonb_array_elements(p_overrides)
            as override_row(value)
          where override_row.value ->> 'placement_target' = 'bank'
            and pg_catalog.lower(
              pg_catalog.btrim(override_row.value ->> 'source_id')
            ) = source_row.source_id
        )
      ) <> 1
  ) then
    raise exception
      'matchday-editorial-profile-workspace-v7-continuity-placement-incomplete';
  end if;

  select *
  into v_apply
  from public.apply_matchday_editorial_profile_workspace_v6(
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
  public.apply_matchday_editorial_profile_workspace_v7(
    uuid,
    text,
    bigint,
    text,
    jsonb,
    jsonb,
    jsonb,
    jsonb,
    jsonb,
    jsonb,
    jsonb
  )
from public, anon, authenticated;

grant execute on function
  public.apply_matchday_editorial_profile_workspace_v7(
    uuid,
    text,
    bigint,
    text,
    jsonb,
    jsonb,
    jsonb,
    jsonb,
    jsonb,
    jsonb,
    jsonb
  )
to service_role;

commit;