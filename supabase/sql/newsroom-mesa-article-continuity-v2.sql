-- Article-centric receipt memory. Theme remains optional organization metadata.
-- Candidate SQL: tested in disposable PostgreSQL before any production migration.
begin;

do $preflight$
begin
  if to_regclass('public.newsroom_mesa_intent_article_receipts') is null
    or to_regprocedure('public.newsroom_finalize_mesa_intents_v1(uuid,uuid,uuid[])') is null
  then raise exception 'mesa-article-continuity-v2-preflight-missing'; end if;
end;
$preflight$;

alter table public.newsroom_mesa_intent_article_receipts
  alter column theme_id drop not null,
  add column context_key text;

update public.newsroom_mesa_intent_article_receipts
set context_key='theme:'||theme_id::text
where context_key is null and theme_id is not null;

alter table public.newsroom_mesa_intent_article_receipts
  alter column context_key set not null,
  add constraint newsroom_mesa_intent_receipt_context_key_v2 check (
    context_key ~ '^(theme|source|selection):[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    and (theme_id is null or context_key='theme:'||theme_id::text)
  );

create index newsroom_mesa_intent_receipt_article_global_v2
  on public.newsroom_mesa_intent_article_receipts(editorial_article_id,captured_at desc,dossier_id);

create or replace function public.newsroom_finalize_mesa_intents_v1(
  p_dossier_id uuid,p_package_id uuid,p_no_change_output_ids uuid[]
)
returns table(result jsonb) language plpgsql volatile security definer set search_path='' as $function$
declare
  v_plan jsonb; v_output jsonb; v_context jsonb; v_article jsonb; v_article_id uuid;
  v_written public.newsroom_mesa_output_publications%rowtype;
  v_final public.newsroom_mesa_intent_finalizations%rowtype;
  v_no_change uuid[]; v_receipts jsonb:='[]'; v_decisions jsonb:='[]';
  v_decision text; v_fingerprint text; v_event uuid; v_payload jsonb;
  v_updated integer:=0; v_new integer:=0; v_unchanged integer:=0;
  v_group record; v_version uuid; v_key text; v_completed timestamptz;
begin
  if p_dossier_id is null or p_package_id is null or p_no_change_output_ids is null
    or cardinality(p_no_change_output_ids)>30 or array_position(p_no_change_output_ids,null) is not null
    or (select count(distinct x) from unnest(p_no_change_output_ids) x)<>cardinality(p_no_change_output_ids) then
    raise exception 'mesa-intent-finalization-input-invalid';
  end if;
  select coalesce(array_agg(x order by x),'{}'::uuid[]) into v_no_change from unnest(p_no_change_output_ids) x;
  -- Completed replay is a historical fact, not a request to overwrite a later
  -- edit. Lock the same workspace as the writer before checking it.
  perform 1 from public.newsroom_mesa_production_contexts w where w.dossier_id=p_dossier_id for update;
  select * into v_final from public.newsroom_mesa_intent_finalizations f where f.dossier_id=p_dossier_id;
  if found then
    if v_final.package_id<>p_package_id or v_final.no_change_output_ids is distinct from v_no_change then
      raise exception 'mesa-intent-finalization-conflict';
    end if;
    return query select jsonb_build_object('action','reused','publicationEventId',v_final.publication_event_id,
      'updatedCount',v_final.updated_count,'newCount',v_final.new_count,'noChangeCount',v_final.no_change_count);
    return;
  end if;
  v_plan:=public.newsroom_mesa_lock_intent_publication_v1(p_dossier_id,p_package_id);
  if exists (select 1 from public.newsroom_mesa_production_contexts w
    where w.dossier_id=p_dossier_id and w.workspace_state<>'active') then
    raise exception 'mesa-intent-finalization-state-invalid';
  end if;
  if exists (select 1 from unnest(v_no_change) id where not exists (
      select 1 from jsonb_array_elements(v_plan -> 'outputs') o where o ->> 'outputId'=id::text and o ->> 'kind'='existing'))
    or exists (select 1 from public.newsroom_mesa_output_publications p where p.dossier_id=p_dossier_id and not exists (
      select 1 from jsonb_array_elements(v_plan -> 'outputs') o where o ->> 'outputId'=p.article_plan_id::text)) then
    raise exception 'mesa-intent-finalization-decision-invalid';
  end if;
  perform 1 from public.editorial_articles a where a.id in (
    select (o -> 'target' ->> 'editorialArticleId')::uuid from jsonb_array_elements(v_plan -> 'outputs') o where o ->> 'kind'='existing'
    union select p.editorial_article_id from public.newsroom_mesa_output_publications p where p.dossier_id=p_dossier_id
  ) order by a.id for update;
  for v_output in select value from jsonb_array_elements(v_plan -> 'outputs') loop
    select c into strict v_context from jsonb_array_elements(v_plan -> 'contexts') c where c ->> 'key'=v_output ->> 'contextKey';
    if (v_output ->> 'outputId')::uuid=any(v_no_change) then
      if exists (select 1 from public.newsroom_mesa_output_publications p where p.dossier_id=p_dossier_id and p.article_plan_id=(v_output ->> 'outputId')::uuid) then
        raise exception 'mesa-intent-no-change-already-published';
      end if;
      v_article_id:=(v_output -> 'target' ->> 'editorialArticleId')::uuid;
      select to_jsonb(a) into v_article from public.editorial_articles a where a.id=v_article_id and a.status='published';
      if not found or encode(sha256(convert_to(v_article::text,'UTF8')),'hex')
          is distinct from v_output -> 'target' ->> 'contentFingerprint' then
        raise exception 'mesa-intent-no-change-target-stale';
      end if;
      v_decision:='SEM_ALTERAÇÃO'; v_unchanged:=v_unchanged+1;
    else
      select * into v_written from public.newsroom_mesa_output_publications p
        where p.dossier_id=p_dossier_id and p.article_plan_id=(v_output ->> 'outputId')::uuid;
      if not found then raise exception 'mesa-intent-publication-incomplete'; end if;
      if v_written.package_id<>p_package_id or v_written.source_scope is distinct from 'context'
        or v_written.production_context_id is distinct from (v_context ->> 'productionContextId')::uuid
        or (v_output ->> 'kind'='existing' and v_written.editorial_article_id is distinct from (v_output -> 'target' ->> 'editorialArticleId')::uuid) then
        raise exception 'mesa-intent-publication-output-invalid';
      end if;
      v_article_id:=v_written.editorial_article_id;
      select to_jsonb(a) into v_article from public.editorial_articles a where a.id=v_article_id and a.status='published';
      if not found or encode(sha256(convert_to(v_article::text,'UTF8')),'hex') is distinct from v_written.payload ->> 'intentResultFingerprint' then
        raise exception 'mesa-intent-published-result-stale';
      end if;
      if not exists (
        select 1
        from public.newsroom_editorial_dossier_article_plans p
        where p.id=v_written.article_plan_id
          and p.dossier_id=p_dossier_id
          and (
            (
              v_output ->> 'kind'='existing'
              and p.destination='update'
              and p.update_target_editorial_article_id=v_article_id
              and (p.editorial_article_id is null or p.editorial_article_id=v_article_id)
            )
            or (
              v_output ->> 'kind'='new'
              and p.destination='new'
              and p.update_target_editorial_article_id is null
              and p.editorial_article_id=v_article_id
            )
          )
      ) then
        raise exception 'mesa-intent-publication-output-invalid';
      end if;
      v_decision:=case when v_output ->> 'kind'='existing' then 'UPDATE' else 'NEW' end;
      if v_decision='UPDATE' then v_updated:=v_updated+1; else v_new:=v_new+1; end if;
    end if;
    v_fingerprint:=encode(sha256(convert_to(v_article::text,'UTF8')),'hex');
    v_decisions:=v_decisions||jsonb_build_array(jsonb_build_object('slot',v_output -> 'slot',
      'outputId',v_output -> 'outputId','contextKey',v_output -> 'contextKey',
      'decision',v_decision,'articleId',v_article_id,'resultFingerprint',v_fingerprint));
    v_receipts:=v_receipts||jsonb_build_array(jsonb_build_object(
      'contextKey',v_context -> 'key','themeId',v_context -> 'themeId',
      'articleId',v_article_id,'outputId',v_output -> 'outputId','slot',v_output -> 'slot',
      'decision',v_decision,'sources',v_context -> 'sources','resultFingerprint',v_fingerprint));
  end loop;
  v_payload:=jsonb_build_object('contractVersion',1,'kind','mesa_production_intents',
    'packageId',p_package_id,'authorityFingerprint',v_plan -> 'authorityFingerprint',
    'capturedAt',v_plan -> 'capturedAt','decisions',v_decisions);
  insert into public.newsroom_mesa_publication_events(dossier_id,fingerprint,payload)
    values(p_dossier_id,md5(v_payload::text),v_payload) returning id into v_event;
  v_completed:=clock_timestamp();
  insert into public.newsroom_mesa_intent_finalizations(dossier_id,package_id,publication_event_id,
    no_change_output_ids,updated_count,new_count,no_change_count,completed_at)
    values(p_dossier_id,p_package_id,v_event,v_no_change,v_updated,v_new,v_unchanged,v_completed);
  insert into public.newsroom_mesa_intent_article_receipts(
    dossier_id,output_id,context_key,theme_id,editorial_article_id,
    slot,decision,captured_at,completed_at,sources,result_fingerprint
  )
    select p_dossier_id,(r ->> 'outputId')::uuid,r ->> 'contextKey',(r ->> 'themeId')::uuid,(r ->> 'articleId')::uuid,
      r ->> 'slot',r ->> 'decision',(v_plan ->> 'capturedAt')::timestamptz,v_completed,r -> 'sources',r ->> 'resultFingerprint'
    from jsonb_array_elements(v_receipts) r;
  -- Preserve technical material projection, but group by context as well as
  -- sources. Equal source sets in different Themes must never merge their work.
  for v_group in
    select x.production_context_id,x.source_refs,array_agg(x.article_id order by x.article_id) article_ids,
      min(x.article_plan_id::text)::uuid key_plan_id
    from (
      select p.production_context_id,u.article_plan_id,min(u.editorial_article_id::text)::uuid article_id,
        public.newsroom_mesa_normalize_refs_v2(jsonb_agg(jsonb_build_object(
          'newsroomArticleId',u.newsroom_article_id,'newsroomSnapshotId',u.newsroom_snapshot_id)
          order by u.newsroom_article_id,u.newsroom_snapshot_id)) source_refs
      from public.newsroom_mesa_output_source_usage u
      join public.newsroom_mesa_output_publications p on p.dossier_id=u.dossier_id and p.article_plan_id=u.article_plan_id
      where u.dossier_id=p_dossier_id group by p.production_context_id,u.article_plan_id having count(*)>=2
    ) x group by x.production_context_id,x.source_refs
  loop
    select c into strict v_context from jsonb_array_elements(v_plan -> 'contexts') c
      where c ->> 'productionContextId'=v_group.production_context_id::text;
    v_key:='output:'||v_group.key_plan_id::text;
    insert into public.newsroom_mesa_material_versions(material_key,title,source_refs,article_ids,production_dossier_id,publication_event_id)
      values(v_key,v_context ->> 'title',v_group.source_refs,v_group.article_ids,p_dossier_id,v_event) returning id into v_version;
    if v_context ->> 'themeId' is not null then
      insert into public.newsroom_mesa_theme_materials(theme_id,material_key,version_id)
        values((v_context ->> 'themeId')::uuid,v_key,v_version) on conflict do nothing;
    end if;
  end loop;
  insert into public.newsroom_editorial_theme_articles(theme_id,editorial_article_id)
    select (r ->> 'themeId')::uuid,(r ->> 'articleId')::uuid
    from jsonb_array_elements(v_receipts) r
    where r ->> 'themeId' is not null
    on conflict(theme_id,editorial_article_id) do nothing;
  update public.newsroom_mesa_production_contexts set workspace_state='consolidated',consolidated_at=v_completed where dossier_id=p_dossier_id;
  return query select jsonb_build_object('action','consolidated','publicationEventId',v_event,
    'updatedCount',v_updated,'newCount',v_new,'noChangeCount',v_unchanged);
end;
$function$;

create function public.newsroom_mesa_intent_latest_article_receipts_v2(p_article_ids uuid[])
returns table(receipts jsonb)
language plpgsql stable security definer set search_path='' as $function$
declare
  v_ids uuid[];
begin
  if p_article_ids is null or cardinality(p_article_ids) not between 1 and 30
    or array_position(p_article_ids,null) is not null
  then raise exception 'mesa-intent-article-receipts-input-invalid'; end if;
  select array_agg(distinct id order by id) into v_ids from unnest(p_article_ids) requested(id);
  if cardinality(v_ids)<>cardinality(p_article_ids) then
    raise exception 'mesa-intent-article-receipts-input-invalid';
  end if;

  return query
  select coalesce(jsonb_agg(jsonb_build_object(
    'contextKey',r.context_key,'themeId',r.theme_id,'articleId',r.editorial_article_id,
    'slot',r.slot,'decision',r.decision,
    'capturedAt',to_char(r.captured_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'sources',r.sources
  ) order by r.editorial_article_id,r.dossier_id,r.output_id),'[]'::jsonb)
  from (
    select x.*,rank() over(partition by x.editorial_article_id order by x.captured_at desc) capture_rank
    from public.newsroom_mesa_intent_article_receipts x
    where x.editorial_article_id=any(v_ids)
  ) r
  where r.capture_rank=1;
end;
$function$;
revoke all on function public.newsroom_mesa_intent_latest_article_receipts_v2(uuid[])
  from public,anon,authenticated,service_role;
grant execute on function public.newsroom_mesa_intent_latest_article_receipts_v2(uuid[])
  to service_role;

commit;
