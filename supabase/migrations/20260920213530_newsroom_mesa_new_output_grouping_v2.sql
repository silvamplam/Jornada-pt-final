begin;

do $preflight$
begin
  if to_regclass('public.newsroom_mesa_production_contexts') is null
    or to_regclass('public.newsroom_editorial_dossier_article_plans') is null
    or to_regclass('public.newsroom_editorial_theme_sources') is null
    or to_regprocedure('public.newsroom_mesa_preview_intents_v1(jsonb)') is null
    or to_regprocedure('public.newsroom_prepare_mesa_contexts_v3(uuid,text,jsonb,uuid,uuid[])') is null
    or to_regprocedure('public.newsroom_save_mesa_context_article_plan_v1(uuid,uuid,text,text,integer,text,text,text,uuid[],uuid)') is null
    or to_regprocedure('public.newsroom_save_dossier_article_plan_state_v1(uuid,uuid,text,uuid,uuid[],text,uuid)') is null
    or to_regprocedure('public.newsroom_set_mesa_shared_outputs_v2(uuid,uuid[])') is null
  then
    raise exception 'newsroom-mesa-new-output-grouping-v2-prerequisite-missing';
  end if;
end;
$preflight$;

create table public.newsroom_mesa_new_output_grouping_preparations (
  preparation_key uuid primary key,
  dossier_id uuid not null unique
    references public.newsroom_mesa_production_contexts(dossier_id) on delete restrict,
  request jsonb not null check (jsonb_typeof(request) = 'object' and request ->> 'version' = '2'),
  authority_fingerprint text not null check (authority_fingerprint ~ '^[0-9a-f]{64}$'),
  authority_snapshot jsonb not null check (jsonb_typeof(authority_snapshot) = 'object'),
  base_preview jsonb not null check (jsonb_typeof(base_preview) = 'object' and base_preview ->> 'contractVersion' = '1'),
  created_at timestamptz not null default clock_timestamp()
);

create table public.newsroom_mesa_new_output_groupings (
  dossier_id uuid primary key
    references public.newsroom_mesa_production_contexts(dossier_id) on delete restrict,
  production_context_id uuid not null,
  loose_source_ids uuid[] not null default '{}',
  target_count smallint check (target_count between 0 and 30),
  revision integer not null default 1 check (revision >= 1),
  state text not null default 'planned' check (state in ('planned','materialized')),
  existing_outputs jsonb not null default '[]'::jsonb check (jsonb_typeof(existing_outputs) = 'array'),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  foreign key (dossier_id, production_context_id)
    references public.newsroom_mesa_production_context_items(dossier_id, id) on delete restrict,
  check (array_position(loose_source_ids, null) is null and cardinality(loose_source_ids) <= 20)
);

create table public.newsroom_mesa_new_output_theme_targets (
  dossier_id uuid not null references public.newsroom_mesa_new_output_groupings(dossier_id) on delete restrict,
  theme_id uuid not null references public.newsroom_editorial_themes(id) on delete restrict,
  title_snapshot text not null check (btrim(title_snapshot) <> ''),
  position smallint not null check (position between 1 and 20),
  target_count smallint check (target_count between 0 and 30),
  seed_source_ids uuid[] not null,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  primary key (dossier_id, theme_id),
  unique (dossier_id, position),
  check (
    cardinality(seed_source_ids) between 1 and 20
    and array_position(seed_source_ids, null) is null
  )
);

create table public.newsroom_mesa_new_output_groups (
  id uuid primary key default gen_random_uuid(),
  dossier_id uuid not null references public.newsroom_mesa_new_output_groupings(dossier_id) on delete restrict,
  production_context_id uuid not null,
  seed_kind text not null check (seed_kind in ('theme','selection')),
  seed_theme_id uuid,
  position smallint not null check (position between 1 and 32767),
  article_plan_id uuid,
  state text not null default 'planned' check (state in ('planned','materialized')),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  unique (dossier_id, article_plan_id),
  foreign key (dossier_id, production_context_id)
    references public.newsroom_mesa_production_context_items(dossier_id, id) on delete restrict,
  foreign key (dossier_id, seed_theme_id)
    references public.newsroom_mesa_new_output_theme_targets(dossier_id, theme_id) on delete restrict,
  foreign key (dossier_id, article_plan_id)
    references public.newsroom_editorial_dossier_article_plans(dossier_id, id) on delete restrict,
  check (
    (seed_kind = 'selection' and seed_theme_id is null)
    or (seed_kind = 'theme' and seed_theme_id is not null)
  ),
  check (
    (state = 'planned' and article_plan_id is null)
    or (state = 'materialized' and article_plan_id is not null)
  )
);

create table public.newsroom_mesa_new_output_group_sources (
  dossier_id uuid not null,
  group_id uuid not null references public.newsroom_mesa_new_output_groups(id) on delete cascade,
  dossier_source_id uuid not null,
  sort_order smallint not null check (sort_order between 1 and 20),
  created_at timestamptz not null default clock_timestamp(),
  primary key (group_id, dossier_source_id),
  unique (group_id, sort_order),
  foreign key (dossier_id, dossier_source_id)
    references public.newsroom_editorial_dossier_sources(dossier_id, id) on delete restrict
);

comment on table public.newsroom_mesa_new_output_group_sources is
  'Planning metadata only. seedSourceIds never mean factual usage, never consume a source, and never write newsroom_mesa_output_source_usage or source lifecycle.';
comment on column public.newsroom_mesa_new_output_groups.seed_theme_id is
  'Planning seedThemeId only. It does not create, remove or alter Theme/source membership.';

create table public.newsroom_mesa_new_output_grouping_commands (
  dossier_id uuid not null references public.newsroom_mesa_new_output_groupings(dossier_id) on delete restrict,
  command_id uuid not null,
  payload_fingerprint text not null check (payload_fingerprint ~ '^[0-9a-f]{64}$'),
  result_revision integer not null check (result_revision >= 1),
  created_at timestamptz not null default clock_timestamp(),
  primary key (dossier_id, command_id)
);

create index newsroom_mesa_new_output_groups_dossier_idx
  on public.newsroom_mesa_new_output_groups(dossier_id, seed_kind, position);
create index newsroom_mesa_new_output_group_sources_dossier_idx
  on public.newsroom_mesa_new_output_group_sources(dossier_id, group_id, sort_order);

alter table public.newsroom_mesa_new_output_grouping_preparations enable row level security;
alter table public.newsroom_mesa_new_output_grouping_preparations force row level security;
alter table public.newsroom_mesa_new_output_groupings enable row level security;
alter table public.newsroom_mesa_new_output_groupings force row level security;
alter table public.newsroom_mesa_new_output_theme_targets enable row level security;
alter table public.newsroom_mesa_new_output_theme_targets force row level security;
alter table public.newsroom_mesa_new_output_groups enable row level security;
alter table public.newsroom_mesa_new_output_groups force row level security;
alter table public.newsroom_mesa_new_output_group_sources enable row level security;
alter table public.newsroom_mesa_new_output_group_sources force row level security;
alter table public.newsroom_mesa_new_output_grouping_commands enable row level security;
alter table public.newsroom_mesa_new_output_grouping_commands force row level security;

revoke all on public.newsroom_mesa_new_output_grouping_preparations from public, anon, authenticated, service_role;
revoke all on public.newsroom_mesa_new_output_groupings from public, anon, authenticated, service_role;
revoke all on public.newsroom_mesa_new_output_theme_targets from public, anon, authenticated, service_role;
revoke all on public.newsroom_mesa_new_output_groups from public, anon, authenticated, service_role;
revoke all on public.newsroom_mesa_new_output_group_sources from public, anon, authenticated, service_role;
revoke all on public.newsroom_mesa_new_output_grouping_commands from public, anon, authenticated, service_role;
grant select on public.newsroom_mesa_new_output_grouping_preparations to service_role;
grant select on public.newsroom_mesa_new_output_groupings to service_role;
grant select on public.newsroom_mesa_new_output_theme_targets to service_role;
grant select on public.newsroom_mesa_new_output_groups to service_role;
grant select on public.newsroom_mesa_new_output_group_sources to service_role;

create function public.newsroom_mesa_grouping_request_v1(p_request jsonb)
returns jsonb language plpgsql stable security definer set search_path = '' as $function$
declare
  v_selection jsonb;
  v_normalized_selection jsonb;
  v_uuid constant text := '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';
begin
  if jsonb_typeof(p_request) is distinct from 'object'
    or not (p_request ?& array['version','preparationKey','title','selection'])
    or p_request - array['version','preparationKey','title','selection'] <> '{}'
    or p_request -> 'version' is distinct from '2'::jsonb
    or lower(coalesce(p_request ->> 'preparationKey','')) !~ v_uuid
    or length(btrim(coalesce(p_request ->> 'title',''))) not between 1 and 180
    or jsonb_typeof(p_request -> 'selection') is distinct from 'object'
  then raise exception 'mesa-grouping-input-invalid'; end if;
  v_selection := p_request -> 'selection';
  if not (v_selection ?& array['sourceIds','themeIds','candidateArticleIds','reviewArticleIds'])
    or v_selection - array['sourceIds','themeIds','candidateArticleIds','reviewArticleIds'] <> '{}'
    or jsonb_typeof(v_selection -> 'sourceIds') is distinct from 'array'
    or jsonb_typeof(v_selection -> 'themeIds') is distinct from 'array'
    or jsonb_typeof(v_selection -> 'candidateArticleIds') is distinct from 'array'
    or jsonb_typeof(v_selection -> 'reviewArticleIds') is distinct from 'array'
    or jsonb_array_length(v_selection -> 'sourceIds') + jsonb_array_length(v_selection -> 'themeIds') < 1
    or jsonb_array_length(v_selection -> 'sourceIds') > 20
    or jsonb_array_length(v_selection -> 'themeIds') > 20
    or jsonb_array_length(v_selection -> 'candidateArticleIds') > 200
    or jsonb_array_length(v_selection -> 'reviewArticleIds') > 30
  then raise exception 'mesa-grouping-input-invalid'; end if;
  if exists (
    select 1 from jsonb_array_elements(v_selection -> 'sourceIds') value
    where jsonb_typeof(value) <> 'string' or lower(value #>> '{}') !~ v_uuid
  ) or exists (
    select 1 from jsonb_array_elements(v_selection -> 'themeIds') value
    where jsonb_typeof(value) <> 'string' or lower(value #>> '{}') !~ v_uuid
  ) or exists (
    select 1 from jsonb_array_elements(v_selection -> 'candidateArticleIds') value
    where jsonb_typeof(value) <> 'string' or lower(value #>> '{}') !~ v_uuid
  ) or exists (
    select 1 from jsonb_array_elements(v_selection -> 'reviewArticleIds') value
    where jsonb_typeof(value) <> 'string' or lower(value #>> '{}') !~ v_uuid
  ) then raise exception 'mesa-grouping-input-invalid'; end if;
  v_normalized_selection := jsonb_build_object(
    'sourceIds',(select coalesce(jsonb_agg(to_jsonb(lower(value #>> '{}')) order by lower(value #>> '{}')),'[]') from jsonb_array_elements(v_selection -> 'sourceIds') value),
    'themeIds',(select coalesce(jsonb_agg(to_jsonb(lower(value #>> '{}')) order by lower(value #>> '{}')),'[]') from jsonb_array_elements(v_selection -> 'themeIds') value),
    'candidateArticleIds',(select coalesce(jsonb_agg(to_jsonb(lower(value #>> '{}')) order by lower(value #>> '{}')),'[]') from jsonb_array_elements(v_selection -> 'candidateArticleIds') value),
    'reviewArticleIds',(select coalesce(jsonb_agg(to_jsonb(lower(value #>> '{}')) order by lower(value #>> '{}')),'[]') from jsonb_array_elements(v_selection -> 'reviewArticleIds') value),
    'newArticleCount',1
  );
  if exists (
    select value #>> '{}' from jsonb_array_elements(v_normalized_selection -> 'reviewArticleIds') value
    except select value #>> '{}' from jsonb_array_elements(v_normalized_selection -> 'candidateArticleIds') value
  ) or exists (
    select value #>> '{}' from jsonb_array_elements(v_normalized_selection -> 'sourceIds') value group by value #>> '{}' having count(*) > 1
  ) or exists (
    select value #>> '{}' from jsonb_array_elements(v_normalized_selection -> 'themeIds') value group by value #>> '{}' having count(*) > 1
  ) then raise exception 'mesa-grouping-input-invalid'; end if;
  return public.newsroom_mesa_normalize_intent_v1(jsonb_build_object(
    'version',1,'preparationKey',lower(p_request ->> 'preparationKey'),'title',btrim(p_request ->> 'title'),
    'themes','[]'::jsonb,'sources','[]'::jsonb,'selection',v_normalized_selection
  ));
end;
$function$;
revoke all on function public.newsroom_mesa_grouping_request_v1(jsonb) from public, anon, authenticated, service_role;

create function public.newsroom_mesa_grouping_authority_v2(p_request jsonb)
returns jsonb language plpgsql stable security definer set search_path = '' as $function$
declare
  v_v1_request jsonb := public.newsroom_mesa_grouping_request_v1(p_request);
  v_preview jsonb;
  v_context jsonb;
  v_themes jsonb := '[]';
  v_loose_sources jsonb := '[]';
  v_theme_id uuid;
  v_theme_title text;
  v_theme_source_ids uuid[];
  v_position bigint;
  v_material jsonb;
begin
  select value.plan into strict v_preview
  from public.newsroom_mesa_preview_intents_v1(v_v1_request) value;
  select value into strict v_context
  from jsonb_array_elements(v_preview -> 'contexts') value
  where value ->> 'kind' = 'selection';

  for v_theme_id, v_position in
    select (value #>> '{}')::uuid, ordinality
    from jsonb_array_elements(v_v1_request -> 'selection' -> 'themeIds') with ordinality selected(value, ordinality)
  loop
    select theme.title into v_theme_title
    from public.newsroom_editorial_themes theme
    where theme.id = v_theme_id and theme.status = 'open';
    if not found then raise exception 'mesa-grouping-theme-unavailable'; end if;

    select array_agg(membership.newsroom_article_id order by membership.newsroom_article_id)
    into v_theme_source_ids
    from public.newsroom_editorial_theme_sources membership
    where membership.theme_id = v_theme_id;
    if cardinality(coalesce(v_theme_source_ids, '{}'::uuid[])) not between 1 and 20
      or exists (
        select 1 from unnest(v_theme_source_ids) source_id
        where not exists (
          select 1 from jsonb_array_elements(v_context -> 'sources') source
          where source ->> 'newsroomArticleId' = source_id::text
        )
      )
    then raise exception 'mesa-grouping-theme-sources-invalid'; end if;
    v_themes := v_themes || jsonb_build_array(jsonb_build_object(
      'themeId',v_theme_id,'title',v_theme_title,'position',v_position,'seedSourceIds',to_jsonb(v_theme_source_ids)
    ));
  end loop;

  select coalesce(jsonb_agg(explicit.value order by explicit.value #>> '{}'),'[]'::jsonb)
  into v_loose_sources
  from jsonb_array_elements(v_v1_request -> 'selection' -> 'sourceIds') explicit(value)
  where not exists (
    select 1
    from public.newsroom_editorial_theme_sources membership
    where membership.newsroom_article_id=(explicit.value #>> '{}')::uuid
      and membership.theme_id in (
        select (selected.value #>> '{}')::uuid
        from jsonb_array_elements(v_v1_request -> 'selection' -> 'themeIds') selected(value)
      )
  );

  v_material := jsonb_build_object(
    'request',v_v1_request,
    'baseAuthorityFingerprint',v_preview -> 'authorityFingerprint',
    'themes',v_themes,
    'looseSourceIds',v_loose_sources
  );
  return jsonb_build_object(
    'version',2,
    'authorityFingerprint',encode(sha256(convert_to(v_material::text,'UTF8')),'hex'),
    'material',v_material,
    'basePreview',v_preview,
    'themes',v_themes,
    'looseSourceIds',v_loose_sources
  );
end;
$function$;
revoke all on function public.newsroom_mesa_grouping_authority_v2(jsonb) from public, anon, authenticated, service_role;

create function public.newsroom_preview_mesa_grouping_v2(p_request jsonb)
returns table(plan jsonb) language sql stable security definer set search_path = '' as $function$
  select jsonb_build_object(
    'version',2,
    'authorityFingerprint',authority -> 'authorityFingerprint',
    'sourceCount',authority -> 'basePreview' -> 'totals' -> 'sources',
    'reviewCount',authority -> 'basePreview' -> 'totals' -> 'reviews',
    'themeCount',jsonb_array_length(authority -> 'themes'),
    'looseSourceCount',jsonb_array_length(authority -> 'looseSourceIds')
  )
  from (select public.newsroom_mesa_grouping_authority_v2(p_request) authority) resolved;
$function$;
revoke all on function public.newsroom_preview_mesa_grouping_v2(jsonb) from public, anon, authenticated, service_role;
grant execute on function public.newsroom_preview_mesa_grouping_v2(jsonb) to service_role;

create function public.newsroom_prepare_mesa_grouping_v2(p_request jsonb,p_expected_authority_fingerprint text)
returns table(result jsonb) language plpgsql volatile security definer set search_path = '' as $function$
declare
  v_v1_request jsonb := public.newsroom_mesa_grouping_request_v1(p_request);
  v_key uuid := (v_v1_request ->> 'preparationKey')::uuid;
  v_existing public.newsroom_mesa_new_output_grouping_preparations%rowtype;
  v_authority jsonb;
  v_preview jsonb;
  v_context jsonb;
  v_contexts jsonb;
  v_source jsonb;
  v_sources jsonb;
  v_snapshot_fingerprint text;
  v_result record;
  v_context_id uuid;
  v_plan_id uuid;
  v_plan_ids uuid[] := '{}';
  v_all_source_ids uuid[];
  v_existing_outputs jsonb := '[]';
  v_item jsonb;
  v_theme jsonb;
  v_i integer := 0;
  v_source_id uuid;
  v_dossier_source_id uuid;
  v_group_id uuid;
  v_loose_ids uuid[];
begin
  if p_expected_authority_fingerprint is null or p_expected_authority_fingerprint !~ '^[0-9a-f]{64}$' then
    raise exception 'mesa-grouping-fingerprint-invalid';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('newsroom-mesa-organization-v1',0));
  select * into v_existing
  from public.newsroom_mesa_new_output_grouping_preparations
  where preparation_key = v_key;
  if found then
    if v_existing.request is distinct from p_request
      or v_existing.authority_fingerprint is distinct from p_expected_authority_fingerprint
    then raise exception 'mesa-grouping-preparation-conflict'; end if;
    return query select jsonb_build_object('dossierId',v_existing.dossier_id,'preparationAction','reused');
    return;
  end if;
  if exists(select 1 from public.newsroom_mesa_intent_preparations where preparation_key=v_key)
    or exists(select 1 from public.newsroom_mesa_production_contexts where preparation_key=v_key)
    or exists(select 1 from public.newsroom_editorial_dossiers where preparation_key=v_key)
  then raise exception 'mesa-grouping-preparation-key-used'; end if;

  perform 1 from public.newsroom_editorial_themes theme
  where theme.id in (
    select (value #>> '{}')::uuid from jsonb_array_elements(v_v1_request -> 'selection' -> 'themeIds') value
  ) order by theme.id for update;
  perform 1 from public.newsroom_articles article
  where article.id in (
    select (value #>> '{}')::uuid from jsonb_array_elements(v_v1_request -> 'selection' -> 'sourceIds') value
    union
    select membership.newsroom_article_id from public.newsroom_editorial_theme_sources membership
    where membership.theme_id in (
      select (value #>> '{}')::uuid from jsonb_array_elements(v_v1_request -> 'selection' -> 'themeIds') value
    )
  ) order by article.id for update;
  perform 1 from public.newsroom_article_snapshots snapshot
  where snapshot.article_id in (
    select article.id from public.newsroom_articles article
    where article.id in (
      select (value #>> '{}')::uuid from jsonb_array_elements(v_v1_request -> 'selection' -> 'sourceIds') value
      union
      select membership.newsroom_article_id from public.newsroom_editorial_theme_sources membership
      where membership.theme_id in (
        select (value #>> '{}')::uuid from jsonb_array_elements(v_v1_request -> 'selection' -> 'themeIds') value
      )
    )
  ) order by snapshot.id for share;

  v_authority := public.newsroom_mesa_grouping_authority_v2(p_request);
  if v_authority ->> 'authorityFingerprint' is distinct from p_expected_authority_fingerprint then
    raise exception 'mesa-grouping-authority-stale';
  end if;
  v_preview := v_authority -> 'basePreview';
  select value into strict v_context from jsonb_array_elements(v_preview -> 'contexts') value
  where value ->> 'kind'='selection';
  v_contexts := jsonb_build_array(jsonb_build_object(
    'kind','selection','themeId',null,'sourceId',null,
    'sources',(select jsonb_agg(jsonb_build_object(
      'newsroomArticleId',source -> 'newsroomArticleId','newsroomSnapshotId',source -> 'newsroomSnapshotId'
    ) order by source ->> 'newsroomArticleId') from jsonb_array_elements(v_context -> 'sources') source)
  ));

  -- This call freezes dossier sources, snapshots and images only. Both optional
  -- incorporation inputs are deliberately empty, so no Theme membership changes.
  select * into strict v_result
  from public.newsroom_prepare_mesa_contexts_v3(v_key,v_v1_request ->> 'title',v_contexts,null,'{}');
  select id into strict v_context_id
  from public.newsroom_mesa_production_context_items
  where dossier_id=v_result.dossier_id and context_kind='selection';

  -- Complete the v1 capture from the exact snapshot identity frozen in the
  -- dossier. Do not consult the live article or choose a newer snapshot here:
  -- this fingerprint becomes part of the persisted v2 preparation and is
  -- reused unchanged by materialization retries.
  v_contexts := '[]'::jsonb;
  for v_context in select value from jsonb_array_elements(v_preview -> 'contexts') value loop
    v_sources := '[]'::jsonb;
    for v_source in select value from jsonb_array_elements(v_context -> 'sources') value loop
      select encode(sha256(convert_to(to_jsonb(snapshot)::text,'UTF8')),'hex')
      into strict v_snapshot_fingerprint
      from public.newsroom_editorial_dossier_sources dossier_source
      join public.newsroom_article_snapshots snapshot
        on snapshot.article_id=dossier_source.newsroom_article_id
        and snapshot.id=dossier_source.newsroom_snapshot_id
      where dossier_source.dossier_id=v_result.dossier_id
        and dossier_source.newsroom_article_id=(v_source ->> 'newsroomArticleId')::uuid
        and dossier_source.newsroom_snapshot_id=(v_source ->> 'newsroomSnapshotId')::uuid
        and dossier_source.included;
      v_sources:=v_sources||jsonb_build_array(
        v_source||jsonb_build_object('snapshotFingerprint',v_snapshot_fingerprint)
      );
    end loop;
    v_contexts:=v_contexts||jsonb_build_array(
      v_context||jsonb_build_object('sources',v_sources)
    );
  end loop;
  v_preview:=jsonb_set(v_preview,'{contexts}',v_contexts);

  select array_agg(dossier_source_id order by sort_order) into v_all_source_ids
  from public.newsroom_mesa_production_context_sources
  where dossier_id=v_result.dossier_id and production_context_id=v_context_id;

  for v_item in select value from jsonb_array_elements(v_preview -> 'outputs') value where value ->> 'kind'='existing' loop
    v_i := v_i + 1;
    select saved.article_plan_id into strict v_plan_id
    from public.newsroom_save_mesa_context_article_plan_v1(
      v_result.dossier_id,null,left((v_item ->> 'slot') || ' — ' || (v_item -> 'target' ->> 'title'),180),
      'planned',v_i*10,'news','standard','Rever o artigo: UPDATE ou SEM ALTERAÇÃO.',v_all_source_ids,v_context_id
    ) saved;
    perform public.newsroom_save_dossier_article_plan_state_v1(
      v_result.dossier_id,v_plan_id,'update',(v_item -> 'target' ->> 'editorialArticleId')::uuid,
      '{}','preserve_published',null
    );
    v_plan_ids := v_plan_ids || v_plan_id;
    v_existing_outputs := v_existing_outputs || jsonb_build_array(jsonb_build_object(
      'slot',v_item -> 'slot','kind','existing','outputId',v_plan_id,'productionContextId',v_context_id,
      'targetEditorialArticleId',v_item -> 'target' -> 'editorialArticleId','targetSlug',v_item -> 'target' -> 'slug',
      'targetTitle',v_item -> 'target' -> 'title','targetMatchdayId',v_item -> 'target' -> 'matchdayId'
    ));
  end loop;

  select coalesce(array_agg((value #>> '{}')::uuid order by value #>> '{}'),'{}'::uuid[]) into v_loose_ids
  from jsonb_array_elements(v_authority -> 'looseSourceIds') value;
  insert into public.newsroom_mesa_new_output_groupings(
    dossier_id,production_context_id,loose_source_ids,target_count,existing_outputs
  ) values (
    v_result.dossier_id,v_context_id,v_loose_ids,
    case when cardinality(v_loose_ids)=0 then 0 else null end,
    v_existing_outputs
  );

  for v_theme in select value from jsonb_array_elements(v_authority -> 'themes') value order by (value ->> 'position')::integer loop
    insert into public.newsroom_mesa_new_output_theme_targets(
      dossier_id,theme_id,title_snapshot,position,target_count,seed_source_ids
    ) values (
      v_result.dossier_id,(v_theme ->> 'themeId')::uuid,v_theme ->> 'title',(v_theme ->> 'position')::smallint,
      null,array(select (value #>> '{}')::uuid from jsonb_array_elements(v_theme -> 'seedSourceIds') value)
    );
  end loop;

  v_i := 0;
  foreach v_source_id in array v_loose_ids loop
    v_i := v_i + 1;
    select id into strict v_dossier_source_id
    from public.newsroom_editorial_dossier_sources
    where dossier_id=v_result.dossier_id and newsroom_article_id=v_source_id and included;
    v_group_id := gen_random_uuid();
    insert into public.newsroom_mesa_new_output_groups(
      id,dossier_id,production_context_id,seed_kind,seed_theme_id,position
    ) values (v_group_id,v_result.dossier_id,v_context_id,'selection',null,v_i);
    insert into public.newsroom_mesa_new_output_group_sources(dossier_id,group_id,dossier_source_id,sort_order)
    values(v_result.dossier_id,v_group_id,v_dossier_source_id,1);
  end loop;

  if cardinality(v_plan_ids)>0 then
    perform public.newsroom_set_mesa_shared_outputs_v2(v_result.dossier_id,v_plan_ids);
  end if;
  insert into public.newsroom_mesa_new_output_grouping_preparations(
    preparation_key,dossier_id,request,authority_fingerprint,authority_snapshot,base_preview
  ) values (
    v_key,v_result.dossier_id,p_request,p_expected_authority_fingerprint,v_authority -> 'material',v_preview
  );
  update public.newsroom_mesa_production_contexts
  set selection_payload=selection_payload || jsonb_build_object(
    'productionGroupingV2',jsonb_build_object(
      'version',2,'state','planned','preparationKey',v_key,'authorityFingerprint',p_expected_authority_fingerprint
    )
  ) where dossier_id=v_result.dossier_id;
  return query select jsonb_build_object('dossierId',v_result.dossier_id,'preparationAction','created');
end;
$function$;
revoke all on function public.newsroom_prepare_mesa_grouping_v2(jsonb,text) from public, anon, authenticated, service_role;
grant execute on function public.newsroom_prepare_mesa_grouping_v2(jsonb,text) to service_role;

create function public.newsroom_change_mesa_new_output_groups_v2(
  p_dossier_id uuid,
  p_action text,
  p_group_ids uuid[],
  p_target_count integer,
  p_theme_id uuid,
  p_expected_revision integer,
  p_command_id uuid
)
returns table(revision integer) language plpgsql volatile security definer set search_path = '' as $function$
declare
  v_header public.newsroom_mesa_new_output_groupings%rowtype;
  v_command public.newsroom_mesa_new_output_grouping_commands%rowtype;
  v_fingerprint text;
  v_keep uuid;
  v_source record;
  v_position integer;
  v_new_group uuid;
  v_current_count integer;
  v_add_index integer;
  v_theme public.newsroom_mesa_new_output_theme_targets%rowtype;
  v_total_after integer;
begin
  if p_dossier_id is null or p_command_id is null
    or p_action not in ('target','theme_target','merge','split')
    or p_expected_revision is null or p_expected_revision < 1
    or p_group_ids is null or array_position(p_group_ids,null) is not null
    or (select count(distinct id) from unnest(p_group_ids) id)<>cardinality(p_group_ids)
  then raise exception 'mesa-grouping-change-input-invalid'; end if;
  v_fingerprint := encode(sha256(convert_to(jsonb_build_object(
    'action',p_action,'groupIds',p_group_ids,'targetCount',p_target_count,
    'themeId',p_theme_id,'expectedRevision',p_expected_revision
  )::text,'UTF8')),'hex');
  perform pg_advisory_xact_lock(hashtextextended('newsroom-mesa-new-output-groups:'||p_dossier_id::text,0));
  select * into v_command from public.newsroom_mesa_new_output_grouping_commands
  where dossier_id=p_dossier_id and command_id=p_command_id;
  if found then
    if v_command.payload_fingerprint is distinct from v_fingerprint then
      raise exception 'mesa-grouping-command-conflict';
    end if;
    return query select v_command.result_revision;
    return;
  end if;
  select * into v_header from public.newsroom_mesa_new_output_groupings
  where dossier_id=p_dossier_id for update;
  if not found or v_header.state<>'planned' then raise exception 'mesa-grouping-structure-locked'; end if;
  if v_header.revision<>p_expected_revision then raise exception 'mesa-grouping-revision-stale'; end if;

  if p_action='target' then
    if p_theme_id is not null or cardinality(p_group_ids)<>0 or p_target_count is null
      or p_target_count not between 0 and least(30,cardinality(v_header.loose_source_ids))
    then raise exception 'mesa-grouping-target-invalid'; end if;
    if p_target_count=0 then
      delete from public.newsroom_mesa_new_output_groups
      where dossier_id=p_dossier_id and seed_kind='selection';
    elsif not exists (
      select 1 from public.newsroom_mesa_new_output_groups
      where dossier_id=p_dossier_id and seed_kind='selection'
    ) then
      v_position := coalesce((select max(position) from public.newsroom_mesa_new_output_groups where dossier_id=p_dossier_id),0);
      for v_source in
        select dossier_source.id as dossier_source_id
        from unnest(v_header.loose_source_ids) with ordinality loose(newsroom_article_id,position)
        join public.newsroom_editorial_dossier_sources dossier_source
          on dossier_source.dossier_id=p_dossier_id
          and dossier_source.newsroom_article_id=loose.newsroom_article_id
          and dossier_source.included
        order by loose.position
      loop
        v_position:=v_position+1;
        v_new_group:=gen_random_uuid();
        insert into public.newsroom_mesa_new_output_groups(
          id,dossier_id,production_context_id,seed_kind,seed_theme_id,position
        ) values(v_new_group,p_dossier_id,v_header.production_context_id,'selection',null,v_position);
        insert into public.newsroom_mesa_new_output_group_sources(dossier_id,group_id,dossier_source_id,sort_order)
        values(p_dossier_id,v_new_group,v_source.dossier_source_id,1);
      end loop;
    end if;
    update public.newsroom_mesa_new_output_groupings as grouping
    set target_count=p_target_count,revision=grouping.revision+1,updated_at=clock_timestamp()
    where grouping.dossier_id=p_dossier_id returning grouping.revision into v_position;
  elsif p_action='theme_target' then
    if p_theme_id is null or cardinality(p_group_ids)<>0 or p_target_count is null
      or p_target_count not between 0 and 30
    then raise exception 'mesa-grouping-theme-target-invalid'; end if;
    select * into v_theme from public.newsroom_mesa_new_output_theme_targets
    where dossier_id=p_dossier_id and theme_id=p_theme_id for update;
    if not found then raise exception 'mesa-grouping-theme-invalid'; end if;
    select count(*)::integer into v_current_count
    from public.newsroom_mesa_new_output_groups
    where dossier_id=p_dossier_id and seed_kind='theme' and seed_theme_id=p_theme_id;
    select count(*)::integer - v_current_count + p_target_count into v_total_after
    from public.newsroom_mesa_new_output_groups where dossier_id=p_dossier_id;
    if v_total_after + jsonb_array_length(v_header.existing_outputs) > 30
    then raise exception 'mesa-grouping-output-limit'; end if;
    if p_target_count < v_current_count then
      delete from public.newsroom_mesa_new_output_groups
      where id in (
        select id from public.newsroom_mesa_new_output_groups
        where dossier_id=p_dossier_id and seed_kind='theme' and seed_theme_id=p_theme_id
        order by position desc,id desc limit (v_current_count-p_target_count)
      );
    elsif p_target_count > v_current_count then
      for v_add_index in (v_current_count+1)..p_target_count loop
        v_position:=coalesce((select max(position) from public.newsroom_mesa_new_output_groups where dossier_id=p_dossier_id),0)+1;
        v_new_group:=gen_random_uuid();
        insert into public.newsroom_mesa_new_output_groups(
          id,dossier_id,production_context_id,seed_kind,seed_theme_id,position
        ) values(v_new_group,p_dossier_id,v_header.production_context_id,'theme',p_theme_id,v_position);
        insert into public.newsroom_mesa_new_output_group_sources(dossier_id,group_id,dossier_source_id,sort_order)
        select p_dossier_id,v_new_group,dossier_source.id,seed.position::smallint
        from unnest(v_theme.seed_source_ids) with ordinality seed(newsroom_article_id,position)
        join public.newsroom_editorial_dossier_sources dossier_source
          on dossier_source.dossier_id=p_dossier_id
          and dossier_source.newsroom_article_id=seed.newsroom_article_id
          and dossier_source.included
        order by seed.position;
        if not found then raise exception 'mesa-grouping-theme-source-missing'; end if;
      end loop;
    end if;
    update public.newsroom_mesa_new_output_theme_targets
    set target_count=p_target_count,updated_at=clock_timestamp()
    where dossier_id=p_dossier_id and theme_id=p_theme_id;
    update public.newsroom_mesa_new_output_groupings as grouping
    set revision=grouping.revision+1,updated_at=clock_timestamp()
    where grouping.dossier_id=p_dossier_id returning grouping.revision into v_position;
  else
    if p_target_count is not null or p_theme_id is not null then raise exception 'mesa-grouping-change-input-invalid'; end if;
    if exists(
      select 1 from unnest(p_group_ids) selected(group_id)
      left join public.newsroom_mesa_new_output_groups grouped
        on grouped.id=selected.group_id and grouped.dossier_id=p_dossier_id
        and grouped.state='planned' and grouped.seed_kind='selection'
      where grouped.id is null
    ) then raise exception 'mesa-grouping-group-invalid'; end if;
    if p_action='merge' then
      if cardinality(p_group_ids)<2 then raise exception 'mesa-grouping-merge-invalid'; end if;
      select id into strict v_keep from public.newsroom_mesa_new_output_groups
      where dossier_id=p_dossier_id and id=any(p_group_ids) order by position,id limit 1;
      v_position:=coalesce((select max(sort_order) from public.newsroom_mesa_new_output_group_sources where group_id=v_keep),0);
      for v_source in
        select * from public.newsroom_mesa_new_output_group_sources
        where dossier_id=p_dossier_id and group_id=any(p_group_ids) and group_id<>v_keep
        order by group_id,sort_order
      loop
        v_position:=v_position+1;
        update public.newsroom_mesa_new_output_group_sources
        set group_id=v_keep,sort_order=v_position
        where group_id=v_source.group_id and dossier_source_id=v_source.dossier_source_id;
      end loop;
      delete from public.newsroom_mesa_new_output_groups
      where dossier_id=p_dossier_id and id=any(p_group_ids) and id<>v_keep;
    else
      if cardinality(p_group_ids)<>1
        or (select count(*) from public.newsroom_mesa_new_output_group_sources where group_id=p_group_ids[1])<2
      then raise exception 'mesa-grouping-split-invalid'; end if;
      if (select count(*) from public.newsroom_mesa_new_output_groups where dossier_id=p_dossier_id)
        +(select count(*)-1 from public.newsroom_mesa_new_output_group_sources where group_id=p_group_ids[1])
        +jsonb_array_length(v_header.existing_outputs)>30
      then raise exception 'mesa-grouping-output-limit'; end if;
      select position into strict v_position from public.newsroom_mesa_new_output_groups
      where id=p_group_ids[1] and dossier_id=p_dossier_id;
      for v_source in
        select * from public.newsroom_mesa_new_output_group_sources
        where group_id=p_group_ids[1] order by sort_order offset 1
      loop
        v_new_group:=gen_random_uuid();
        v_position:=v_position+1;
        update public.newsroom_mesa_new_output_groups set position=position+1
        where dossier_id=p_dossier_id and position>=v_position;
        insert into public.newsroom_mesa_new_output_groups(
          id,dossier_id,production_context_id,seed_kind,seed_theme_id,position
        ) values(v_new_group,p_dossier_id,v_header.production_context_id,'selection',null,v_position);
        update public.newsroom_mesa_new_output_group_sources set group_id=v_new_group,sort_order=1
        where group_id=p_group_ids[1] and dossier_source_id=v_source.dossier_source_id;
      end loop;
    end if;
    update public.newsroom_mesa_new_output_groupings as grouping
    set revision=grouping.revision+1,updated_at=clock_timestamp()
    where grouping.dossier_id=p_dossier_id returning grouping.revision into v_position;
  end if;

  with ordered as (
    select grouped.id,row_number() over(order by
      case when grouped.seed_kind='theme' then 0 else 1 end,
      coalesce(target.position,32767),grouped.position,grouped.id
    ) next_position
    from public.newsroom_mesa_new_output_groups grouped
    left join public.newsroom_mesa_new_output_theme_targets target
      on target.dossier_id=grouped.dossier_id and target.theme_id=grouped.seed_theme_id
    where grouped.dossier_id=p_dossier_id
  )
  update public.newsroom_mesa_new_output_groups grouped
  set position=ordered.next_position,updated_at=clock_timestamp()
  from ordered where grouped.id=ordered.id;

  insert into public.newsroom_mesa_new_output_grouping_commands(
    dossier_id,command_id,payload_fingerprint,result_revision
  ) values(p_dossier_id,p_command_id,v_fingerprint,v_position);
  return query select v_position;
end;
$function$;
revoke all on function public.newsroom_change_mesa_new_output_groups_v2(uuid,text,uuid[],integer,uuid,integer,uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.newsroom_change_mesa_new_output_groups_v2(uuid,text,uuid[],integer,uuid,integer,uuid)
  to service_role;

create function public.newsroom_materialize_mesa_new_output_groups_v2(
  p_dossier_id uuid,p_expected_revision integer,p_command_id uuid
)
returns table(result jsonb) language plpgsql volatile security definer set search_path = '' as $function$
declare
  v_header public.newsroom_mesa_new_output_groupings%rowtype;
  v_preparation public.newsroom_mesa_new_output_grouping_preparations%rowtype;
  v_group record;
  v_item jsonb;
  v_context jsonb;
  v_request jsonb;
  v_authority_outputs jsonb:='[]';
  v_outputs jsonb:='[]';
  v_authority_contexts jsonb:='[]';
  v_contexts jsonb:='[]';
  v_plan_ids uuid[]:='{}';
  v_all_source_ids uuid[];
  v_focus_source_ids uuid[];
  v_existing_focus_source_ids uuid[];
  v_theme_source_ids uuid[];
  v_selected_theme_id uuid;
  v_touches_selected_theme boolean;
  v_plan_id uuid;
  v_image_id uuid;
  v_titles text;
  v_i integer:=0;
  v_existing jsonb;
  v_material jsonb;
  v_frozen jsonb;
  v_authority text;
  v_new_count integer;
  v_next_revision integer;
  v_command_fingerprint text;
begin
  if p_dossier_id is null or p_command_id is null or p_expected_revision is null or p_expected_revision<1
  then raise exception 'mesa-grouping-materialization-input-invalid'; end if;
  v_command_fingerprint:=encode(sha256(convert_to(jsonb_build_object(
    'action','materialize','expectedRevision',p_expected_revision
  )::text,'UTF8')),'hex');
  perform pg_advisory_xact_lock(hashtextextended('newsroom-mesa-new-output-groups:'||p_dossier_id::text,0));
  select * into v_header from public.newsroom_mesa_new_output_groupings
  where dossier_id=p_dossier_id for update;
  if not found then raise exception 'mesa-grouping-not-found'; end if;
  if v_header.state='materialized' then
    return query select jsonb_build_object(
      'dossierId',p_dossier_id,'materializationAction','reused',
      'newArticleCount',(select count(*) from public.newsroom_mesa_new_output_groups where dossier_id=p_dossier_id)
    );
    return;
  end if;
  if v_header.revision<>p_expected_revision then raise exception 'mesa-grouping-revision-stale'; end if;
  if v_header.target_count is null
    or v_header.target_count<>(select count(*) from public.newsroom_mesa_new_output_groups where dossier_id=p_dossier_id and seed_kind='selection')
    or exists (
      select 1 from public.newsroom_mesa_new_output_theme_targets target
      where target.dossier_id=p_dossier_id and (
        target.target_count is null
        or target.target_count<>(select count(*) from public.newsroom_mesa_new_output_groups grouped
          where grouped.dossier_id=p_dossier_id and grouped.seed_kind='theme' and grouped.seed_theme_id=target.theme_id)
      )
    )
  then raise exception 'mesa-grouping-target-unresolved'; end if;
  select count(*)::integer into v_new_count
  from public.newsroom_mesa_new_output_groups where dossier_id=p_dossier_id;
  if v_new_count+jsonb_array_length(v_header.existing_outputs) not between 1 and 30
  then raise exception 'mesa-grouping-output-limit'; end if;
  if exists(select 1 from public.newsroom_mesa_output_publications where dossier_id=p_dossier_id)
  then raise exception 'mesa-grouping-structure-locked'; end if;
  select * into strict v_preparation
  from public.newsroom_mesa_new_output_grouping_preparations where dossier_id=p_dossier_id for update;
  select array_agg(dossier_source_id order by sort_order) into v_all_source_ids
  from public.newsroom_mesa_production_context_sources
  where dossier_id=p_dossier_id and production_context_id=v_header.production_context_id;
  for v_existing in select value from jsonb_array_elements(v_header.existing_outputs) value loop
    v_plan_ids:=v_plan_ids||(v_existing ->> 'outputId')::uuid;
  end loop;

  -- Only Article Plans are created here. No source lifecycle, Theme membership,
  -- classification, snapshot or newsroom_mesa_output_source_usage row is touched.
  for v_group in
    select grouped.*,target.title_snapshot theme_title
    from public.newsroom_mesa_new_output_groups grouped
    left join public.newsroom_mesa_new_output_theme_targets target
      on target.dossier_id=grouped.dossier_id and target.theme_id=grouped.seed_theme_id
    where grouped.dossier_id=p_dossier_id order by grouped.position,grouped.id for update of grouped
  loop
    v_i:=v_i+1;
    select string_agg(coalesce(nullif(btrim(source.title_snapshot),''),'Fonte'), ' + ' order by membership.sort_order)
    into v_titles
    from public.newsroom_mesa_new_output_group_sources membership
    join public.newsroom_editorial_dossier_sources source
      on source.dossier_id=membership.dossier_id and source.id=membership.dossier_source_id
    where membership.group_id=v_group.id;
    select dossier_image.id into v_image_id
    from public.newsroom_mesa_new_output_group_sources membership
    join public.newsroom_editorial_dossier_sources source
      on source.dossier_id=membership.dossier_id and source.id=membership.dossier_source_id
    join public.newsroom_editorial_dossier_images dossier_image
      on dossier_image.dossier_id=source.dossier_id and dossier_image.origin_kind='newsroom'
      and dossier_image.newsroom_article_id=source.newsroom_article_id
    where membership.group_id=v_group.id
    order by membership.sort_order,dossier_image.created_at,dossier_image.id limit 1;
    select array_agg(source.newsroom_article_id order by membership.sort_order)
    into v_focus_source_ids
    from public.newsroom_mesa_new_output_group_sources membership
    join public.newsroom_editorial_dossier_sources source
      on source.dossier_id=membership.dossier_id and source.id=membership.dossier_source_id
    where membership.group_id=v_group.id;
    if cardinality(v_focus_source_ids) not between 1 and 20 then raise exception 'mesa-grouping-seed-invalid'; end if;
    select saved.article_plan_id into strict v_plan_id
    from public.newsroom_save_mesa_context_article_plan_v1(
      p_dossier_id,null,
      left('Artigo '||lpad(v_i::text,2,'0')||' — '||coalesce(v_group.theme_title,v_titles),180),
      'planned',(jsonb_array_length(v_header.existing_outputs)+v_i)*10,'news','standard',
      left(case when v_group.seed_kind='theme'
        then 'Partir do Tema «'||v_group.theme_title||'». Escolher automaticamente o foco mais relevante ainda não coberto, salvo instrução editorial posterior.'
        else 'Sintetizar o assunto comum das fontes agrupadas. Todo o material congelado desta Produção permanece disponível como contexto.' end,12000),
      v_all_source_ids,v_header.production_context_id
    ) saved;
    perform public.newsroom_save_dossier_article_plan_state_v1(
      p_dossier_id,v_plan_id,'new',null,'{}',
      case when v_image_id is null then 'unselected' else 'dossier_image' end,v_image_id
    );
    update public.newsroom_mesa_new_output_groups
    set article_plan_id=v_plan_id,state='materialized',updated_at=clock_timestamp()
    where id=v_group.id;
    v_plan_ids:=v_plan_ids||v_plan_id;
    v_item:=jsonb_build_object(
      'slot','NEW_'||lpad(v_i::text,2,'0'),'contextKey','selection:'||v_preparation.preparation_key,
      'kind','new','target',null,'focusSourceIds',to_jsonb(v_focus_source_ids)
    );
    v_authority_outputs:=v_authority_outputs||jsonb_build_array(v_item);
    v_outputs:=v_outputs||jsonb_build_array(v_item||jsonb_build_object(
      'outputId',v_plan_id,'productionContextId',v_header.production_context_id
    ));
  end loop;

  v_request:=jsonb_set(
    public.newsroom_mesa_grouping_request_v1(v_preparation.request),
    '{selection,newArticleCount}',to_jsonb(v_new_count)
  );
  for v_context in select value from jsonb_array_elements(v_preparation.base_preview -> 'contexts') value loop
    v_authority_contexts:=v_authority_contexts||jsonb_build_array(jsonb_set(v_context,'{newArticleCount}',to_jsonb(v_new_count)));
    v_contexts:=v_contexts||jsonb_build_array(
      jsonb_set(v_context,'{newArticleCount}',to_jsonb(v_new_count))
      ||jsonb_build_object('productionContextId',v_header.production_context_id)
    );
  end loop;
  for v_item in
    select item.value
    from jsonb_array_elements(v_preparation.base_preview -> 'outputs') with ordinality item(value, ordinality)
    where item.value ->> 'kind'='existing'
    order by item.ordinality desc
  loop
    select value into strict v_existing from jsonb_array_elements(v_header.existing_outputs) value
    where value ->> 'slot'=v_item ->> 'slot';
    select coalesce(array_agg((evidence_source.value #>> '{}')::uuid order by evidence_source.value #>> '{}'),'{}'::uuid[])
    into v_existing_focus_source_ids
    from jsonb_array_elements(coalesce(v_item #> '{target,evidence,sourceIds}','[]'::jsonb)) evidence_source(value)
    where exists (
      select 1 from jsonb_array_elements(v_context -> 'sources') captured(value)
      where captured.value ->> 'newsroomArticleId'=evidence_source.value #>> '{}'
    );
    if jsonb_array_length(v_request -> 'selection' -> 'themeIds')=1 then
      v_selected_theme_id:=(v_request -> 'selection' -> 'themeIds' ->> 0)::uuid;
      select coalesce(array_agg((captured.value ->> 'newsroomArticleId')::uuid order by captured.value ->> 'newsroomArticleId'),'{}'::uuid[])
      into v_theme_source_ids
      from jsonb_array_elements(v_context -> 'sources') captured(value)
      where not exists (
        select 1 from jsonb_array_elements(v_request -> 'selection' -> 'sourceIds') explicit(value)
        where explicit.value #>> '{}'=captured.value ->> 'newsroomArticleId'
      );
      v_touches_selected_theme:=exists (
        select 1 from jsonb_array_elements(coalesce(v_item #> '{target,evidence,themeIds}','[]'::jsonb)) evidence_theme(value)
        where evidence_theme.value #>> '{}'=v_selected_theme_id::text
      ) or v_existing_focus_source_ids&&v_theme_source_ids;
      if v_touches_selected_theme and cardinality(v_theme_source_ids)>0 then
        select array_agg(source_id order by source_id) into v_existing_focus_source_ids
        from (select distinct source_id
          from unnest(v_existing_focus_source_ids||v_theme_source_ids) focused_source(source_id)) focused;
      end if;
    end if;
    if cardinality(v_existing_focus_source_ids)>0 then
      v_item:=v_item||jsonb_build_object('focusSourceIds',to_jsonb(v_existing_focus_source_ids));
    end if;
    v_authority_outputs:=jsonb_build_array(v_item)||v_authority_outputs;
    v_outputs:=jsonb_build_array(v_item||jsonb_build_object(
      'outputId',v_existing -> 'outputId','productionContextId',v_header.production_context_id
    ))||v_outputs;
  end loop;
  v_material:=(v_preparation.base_preview-'capturedAt'-'authorityFingerprint'-'request'-'contexts'-'outputs'-'totals')
    ||jsonb_build_object(
      'request',v_request,'contexts',v_authority_contexts,'outputs',v_authority_outputs,
      'totals',jsonb_build_object(
        'contexts',1,
        'sources',jsonb_array_length(v_preparation.base_preview -> 'contexts' -> 0 -> 'sources'),
        'reviews',jsonb_array_length(v_header.existing_outputs),
        'newArticles',v_new_count
      )
    );
  v_authority:=encode(sha256(convert_to(v_material::text,'UTF8')),'hex');
  v_frozen:=v_material||jsonb_build_object(
    'dossierId',p_dossier_id,
    'capturedAt',v_preparation.base_preview -> 'capturedAt',
    'authorityFingerprint',v_authority,
    'contexts',v_contexts,
    'outputs',v_outputs
  );
  insert into public.newsroom_mesa_intent_preparations(
    preparation_key,dossier_id,request,authority_fingerprint,captured_at,frozen_plan
  ) values(
    v_preparation.preparation_key,p_dossier_id,v_request,v_authority,
    (v_frozen ->> 'capturedAt')::timestamptz,v_frozen
  );
  perform public.newsroom_set_mesa_shared_outputs_v2(p_dossier_id,v_plan_ids);
  update public.newsroom_mesa_new_output_groupings
  set state='materialized',revision=revision+1,updated_at=clock_timestamp()
  where dossier_id=p_dossier_id returning revision into v_next_revision;
  update public.newsroom_mesa_production_contexts
  set selection_payload=selection_payload||jsonb_build_object(
    'productionIntents',v_frozen,
    'productionGroupingV2',jsonb_build_object(
      'version',2,'state','materialized','preparationKey',v_preparation.preparation_key,
      'authorityFingerprint',v_authority
    )
  ) where dossier_id=p_dossier_id;
  insert into public.newsroom_mesa_new_output_grouping_commands(
    dossier_id,command_id,payload_fingerprint,result_revision
  ) values(p_dossier_id,p_command_id,v_command_fingerprint,v_next_revision);
  return query select jsonb_build_object(
    'dossierId',p_dossier_id,'materializationAction','created','newArticleCount',v_new_count
  );
end;
$function$;
revoke all on function public.newsroom_materialize_mesa_new_output_groups_v2(uuid,integer,uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.newsroom_materialize_mesa_new_output_groups_v2(uuid,integer,uuid)
  to service_role;

commit;
