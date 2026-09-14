\set ON_ERROR_STOP on

-- Run only on the same disposable PostgreSQL 17.11 database immediately after
-- 20260914114311_newsroom_mesa_theme_continuity_v1.sql.

begin;

do $catalog_assert$
declare
  target regprocedure;
  definition text;
begin
  if current_setting('server_version_num')::integer / 100 <> 1700
    or current_setting('server_version_num')::integer % 100 <> 11
  then
    raise exception 'theme-continuity-postflight-requires-postgresql-17.11:%',
      current_setting('server_version');
  end if;

  foreach target in array array[
    'public.newsroom_mesa_theme_continuity_v1(uuid)'::regprocedure,
    'public.newsroom_prepare_theme_continuity_v1(uuid,uuid,integer,text)'::regprocedure,
    'public.newsroom_finalize_theme_continuity_v1(uuid,uuid,uuid[])'::regprocedure
  ] loop
    if not (select p.prosecdef from pg_catalog.pg_proc p where p.oid = target)
      or not exists (
        select 1
        from pg_catalog.pg_proc p,
          unnest(coalesce(p.proconfig, '{}'::text[])) setting
        where p.oid = target and setting = 'search_path=""'
      )
      or not has_function_privilege('service_role', target, 'EXECUTE')
      or exists (
        select 1
        from pg_catalog.pg_proc proc
        cross join lateral pg_catalog.aclexplode(
          coalesce(proc.proacl, pg_catalog.acldefault('f', proc.proowner))
        ) privilege
        where proc.oid = target
          and privilege.grantee = 0
          and privilege.privilege_type = 'EXECUTE'
      )
      or has_function_privilege('anon', target, 'EXECUTE')
      or has_function_privilege('authenticated', target, 'EXECUTE')
    then
      raise exception 'theme-continuity-function-contract-invalid:%', target;
    end if;
  end loop;

  if (select p.provolatile from pg_catalog.pg_proc p
      where p.oid = 'public.newsroom_mesa_theme_continuity_v1(uuid)'::regprocedure) <> 's'
    or (select p.provolatile from pg_catalog.pg_proc p
      where p.oid = 'public.newsroom_prepare_theme_continuity_v1(uuid,uuid,integer,text)'::regprocedure) <> 'v'
    or (select p.provolatile from pg_catalog.pg_proc p
      where p.oid = 'public.newsroom_finalize_theme_continuity_v1(uuid,uuid,uuid[])'::regprocedure) <> 'v'
  then
    raise exception 'theme-continuity-function-volatility-invalid';
  end if;

  select pg_get_functiondef(
    'public.newsroom_mesa_theme_continuity_v1(uuid)'::regprocedure
  ) into definition;
  if definition not ilike '%workspace.workspace_state = ''consolidated''%'
    or definition ilike '%reference_snapshot_id%'
    or definition not ilike '%membership.theme_id = p_theme_id%'
    or definition not ilike '%article.status = ''published''%'
  then
    raise exception 'theme-continuity-reader-scope-invalid';
  end if;

  select pg_get_functiondef(
    'public.newsroom_prepare_theme_continuity_v1(uuid,uuid,integer,text)'::regprocedure
  ) into definition;
  if definition not ilike '%pg_advisory_xact_lock%'
    or definition not ilike '%theme-continuity-source-limit%'
    or definition not ilike '%theme-continuity-output-limit%'
    or definition not ilike '%theme-continuity-source-snapshot-unusable%'
    or definition not ilike '%block.value ->> ''type'' in (''paragraph'', ''heading'')%'
    or definition not ilike '%theme-continuity-published-target-unavailable%'
    or definition not ilike '%newsroom_prepare_mesa_contexts_v3%'
  then
    raise exception 'theme-continuity-preparation-authority-invalid';
  end if;

  select pg_get_functiondef(
    'public.newsroom_finalize_theme_continuity_v1(uuid,uuid,uuid[])'::regprocedure
  ) into definition;
  if definition not ilike '%pg_advisory_xact_lock%'
    or definition not ilike '%theme-continuity-finalization-no-change-invalid%'
    or definition not ilike '%workspace_state = ''consolidated''%'
    or definition not ilike '%newsroom_mesa_output_publications%'
  then
    raise exception 'theme-continuity-finalizer-authority-invalid';
  end if;
end;
$catalog_assert$;

do $reader_behaviour$
declare
  v_theme constant uuid := '9c000000-0000-4000-8000-000000000001';
  v_first_theme constant uuid := '9c000000-0000-4000-8000-000000000002';
  v_baseline uuid;
  v_active uuid;
  v_abandoned uuid;
  v_read record;
  v_refs jsonb;
  v_index integer;
  v_article uuid;
  v_snapshot uuid;
begin
  insert into public.competitions(id) values ('9c000000-0000-4000-8000-000000000010');
  insert into public.seasons(id, competition_id) values (
    '9c000000-0000-4000-8000-000000000011',
    '9c000000-0000-4000-8000-000000000010'
  );
  insert into public.matchdays(id, season_id) values (
    '9c000000-0000-4000-8000-000000000012',
    '9c000000-0000-4000-8000-000000000011'
  );

  for v_index in 1..4 loop
    v_article := ('9c000000-0000-4000-8000-' || lpad((100 + v_index)::text, 12, '0'))::uuid;
    v_snapshot := ('9c000000-0000-4000-8000-' || lpad((200 + v_index)::text, 12, '0'))::uuid;
    insert into public.newsroom_articles(
      id, source_code, original_url, normalized_url, title, detected_at,
      first_detected_at, last_detected_at, processing_status
    ) values (
      v_article, '__theme_continuity_pg17__',
      'https://example.invalid/theme-continuity/' || v_index,
      'https://example.invalid/theme-continuity/' || v_index,
      'Fonte continuidade ' || v_index,
      '2026-09-14 10:00:00+00', '2026-09-14 10:00:00+00',
      '2026-09-14 10:00:00+00', 'ready_for_review'
    );
    insert into public.newsroom_editorial_article_classifications(
      newsroom_article_id, classification_key, classification_source
    ) values (
      v_article, 'sporting', 'automatic'
    );
    insert into public.newsroom_article_snapshots(
      id, article_id, content_hash, body, source_metadata, extracted_at
    ) values (
      v_snapshot, v_article, 'continuity-' || v_index,
      jsonb_build_array(jsonb_build_object('type', 'paragraph', 'text', 'Fonte ' || v_index)),
      '{}'::jsonb, '2026-09-14 10:00:00+00'
    );
  end loop;

  insert into public.newsroom_editorial_themes(id, title, classification_key)
  values
    (v_theme, 'Tema continuidade PG17', 'sporting'),
    (v_first_theme, 'Tema primeira produção PG17', 'sporting');
  insert into public.newsroom_editorial_theme_sources(theme_id, newsroom_article_id)
  values
    (v_theme, '9c000000-0000-4000-8000-000000000101'),
    (v_theme, '9c000000-0000-4000-8000-000000000103'),
    (v_theme, '9c000000-0000-4000-8000-000000000104'),
    (v_first_theme, '9c000000-0000-4000-8000-000000000102');

  v_refs := jsonb_build_array(
    jsonb_build_object('newsroomArticleId', '9c000000-0000-4000-8000-000000000101', 'newsroomSnapshotId', '9c000000-0000-4000-8000-000000000201'),
    jsonb_build_object('newsroomArticleId', '9c000000-0000-4000-8000-000000000103', 'newsroomSnapshotId', '9c000000-0000-4000-8000-000000000203'),
    jsonb_build_object('newsroomArticleId', '9c000000-0000-4000-8000-000000000104', 'newsroomSnapshotId', '9c000000-0000-4000-8000-000000000204')
  );
  select prepared.dossier_id into strict v_baseline
  from public.newsroom_prepare_mesa_contexts_v3(
    '9c000000-0000-4000-8000-000000000301',
    'Baseline consolidada PG17',
    jsonb_build_array(jsonb_build_object('kind', 'theme', 'themeId', v_theme, 'sources', v_refs)),
    null, '{}'::uuid[]
  ) prepared;
  update public.newsroom_mesa_production_contexts
    set workspace_state = 'consolidated', consolidated_at = '2026-09-14 11:00:00+00'
    where dossier_id = v_baseline;

  select prepared.dossier_id into strict v_active
  from public.newsroom_prepare_mesa_contexts_v3(
    '9c000000-0000-4000-8000-000000000302',
    'Workspace ativo ignorado PG17',
    jsonb_build_array(jsonb_build_object('kind', 'theme', 'themeId', v_theme, 'sources', v_refs)),
    null, '{}'::uuid[]
  ) prepared;
  select prepared.dossier_id into strict v_abandoned
  from public.newsroom_prepare_mesa_contexts_v3(
    '9c000000-0000-4000-8000-000000000303',
    'Workspace abandonado ignorado PG17',
    jsonb_build_array(jsonb_build_object('kind', 'theme', 'themeId', v_theme, 'sources', v_refs)),
    null, '{}'::uuid[]
  ) prepared;
  update public.newsroom_mesa_production_contexts
    set workspace_state = 'abandoned',
      abandoned_at = statement_timestamp(),
      consolidated_at = null
    where dossier_id = v_abandoned;

  insert into public.newsroom_article_snapshots(
    id, article_id, content_hash, body, source_metadata, extracted_at
  ) values (
    '9c000000-0000-4000-8000-000000000211',
    '9c000000-0000-4000-8000-000000000101',
    'continuity-updated-1',
    '[{"type":"paragraph","text":"Fonte 1 atualizada"}]'::jsonb,
    '{}'::jsonb, '2026-09-14 12:00:00+00'
  );
  delete from public.newsroom_editorial_theme_sources
    where theme_id = v_theme
      and newsroom_article_id = '9c000000-0000-4000-8000-000000000103';
  insert into public.newsroom_editorial_theme_sources(theme_id, newsroom_article_id)
    values(v_theme, '9c000000-0000-4000-8000-000000000102');

  insert into public.editorial_articles(
    id, status, scope, author, label, title, subtitle, body, slug,
    published_at, competition_id, season_id, matchday_id
  ) values
    ('9c000000-0000-4000-8000-000000000401', 'published', 'matchday', 'Jornada',
      'Notícia', 'Artigo publicado', 'Subtítulo', 'Corpo', 'tema-continuity-published',
      '2026-09-14 09:00:00+00', '9c000000-0000-4000-8000-000000000010',
      '9c000000-0000-4000-8000-000000000011', '9c000000-0000-4000-8000-000000000012'),
    ('9c000000-0000-4000-8000-000000000402', 'draft', 'matchday', 'Jornada',
      'Notícia', 'Artigo draft', 'Subtítulo', 'Corpo', 'tema-continuity-draft',
      null, '9c000000-0000-4000-8000-000000000010',
      '9c000000-0000-4000-8000-000000000011', '9c000000-0000-4000-8000-000000000012');
  insert into public.newsroom_editorial_theme_articles(theme_id, editorial_article_id)
  values
    (v_theme, '9c000000-0000-4000-8000-000000000401'),
    (v_theme, '9c000000-0000-4000-8000-000000000402');

  select * into strict v_read
  from public.newsroom_mesa_theme_continuity_v1(v_theme);
  if v_read.baseline ->> 'dossierId' <> v_baseline::text
    or v_read.source_count <> 3
    or v_read.published_article_count <> 1
    or not exists (
      select 1 from jsonb_array_elements(v_read.sources) source(value)
      where source.value ->> 'newsroomArticleId' = '9c000000-0000-4000-8000-000000000101'
        and source.value ->> 'change' = 'UPDATED_SOURCE'
    )
    or not exists (
      select 1 from jsonb_array_elements(v_read.sources) source(value)
      where source.value ->> 'newsroomArticleId' = '9c000000-0000-4000-8000-000000000102'
        and source.value ->> 'change' = 'NEW_SOURCE'
    )
    or not exists (
      select 1 from jsonb_array_elements(v_read.sources) source(value)
      where source.value ->> 'newsroomArticleId' = '9c000000-0000-4000-8000-000000000104'
        and source.value ->> 'change' = 'UNCHANGED_SOURCE'
    )
    or exists (
      select 1 from jsonb_array_elements(v_read.sources) source(value)
      where source.value ->> 'newsroomArticleId' = '9c000000-0000-4000-8000-000000000103'
    )
  then
    raise exception 'theme-continuity-reader-diff-invalid:%', to_jsonb(v_read);
  end if;

  select * into strict v_read
  from public.newsroom_mesa_theme_continuity_v1(v_first_theme);
  if v_read.baseline <> 'null'::jsonb
    or v_read.source_count <> 1
    or v_read.sources -> 0 ->> 'change' <> 'NEW_SOURCE'
  then
    raise exception 'theme-continuity-first-production-invalid:%', to_jsonb(v_read);
  end if;
end;
$reader_behaviour$;

do $unusable_snapshot_behaviour$
declare
  v_theme constant uuid := '9c000000-0000-4000-8000-000000000002';
  v_fingerprint text;
begin
  insert into public.newsroom_article_snapshots(
    id, article_id, content_hash, body, source_metadata, extracted_at
  ) values (
    '9c000000-0000-4000-8000-000000000212',
    '9c000000-0000-4000-8000-000000000102',
    'continuity-unusable-2',
    '[{"type":"paragraph","text":"   "},{"type":"image","text":"Legenda"}]'::jsonb,
    '{}'::jsonb, '2026-09-14 13:00:00+00'
  );

  select authority_fingerprint into strict v_fingerprint
  from public.newsroom_mesa_theme_continuity_v1(v_theme);

  begin
    perform 1
    from public.newsroom_prepare_theme_continuity_v1(
      '9c000000-0000-4000-8000-000000000304',
      v_theme,
      1,
      v_fingerprint
    );
    raise exception 'theme-continuity-unusable-snapshot-was-accepted';
  exception
    when others then
      if sqlerrm not like '%theme-continuity-source-snapshot-unusable%' then
        raise;
      end if;
  end;
end;
$unusable_snapshot_behaviour$;

select 'theme-continuity-postflight-pg17.11-ok' as result;
rollback;
