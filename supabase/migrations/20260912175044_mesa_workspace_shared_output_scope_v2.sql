-- Mesa v2 shared source scope.
-- Forward-only: existing exclusive output origins remain untouched and keep
-- source_scope NULL. New Mesa v2 outputs use the frozen workspace as the
-- availability scope; only final AI-validated usage drives consolidation.
begin;

do $preflight$
begin
  if to_regclass('public.newsroom_mesa_production_contexts') is null
    or to_regclass('public.newsroom_mesa_output_origins') is null
    or to_regclass('public.newsroom_mesa_output_publications') is null
    or to_regclass('public.newsroom_mesa_output_source_usage') is null
    or to_regprocedure('public.newsroom_publish_mesa_output_v2(uuid,uuid,uuid,uuid[],jsonb)') is null
    or to_regprocedure('public.newsroom_mesa_consolidate_publication_v3(uuid)') is null then
    raise exception 'mesa-shared-output-scope-preflight-missing';
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='newsroom_mesa_output_publications'
      and column_name='source_scope'
  ) then
    raise exception 'mesa-shared-output-scope-already-present';
  end if;
end;
$preflight$;

alter table public.newsroom_mesa_output_publications
  add column source_scope text;

alter table public.newsroom_mesa_output_publications
  alter column origin_kind drop not null;

do $drop_old_origin_check$
declare
  v_constraint_name text;
begin
  select c.conname into v_constraint_name
  from pg_constraint c
  where c.conrelid='public.newsroom_mesa_output_publications'::regclass
    and c.contype='c'
    and pg_get_constraintdef(c.oid) like '%origin_kind%'
    and pg_get_constraintdef(c.oid) like '%material_version_id%';
  if v_constraint_name is null then
    raise exception 'mesa-shared-output-origin-check-missing';
  end if;
  execute format(
    'alter table public.newsroom_mesa_output_publications drop constraint %I',
    v_constraint_name
  );
end;
$drop_old_origin_check$;

alter table public.newsroom_mesa_output_publications
  add constraint newsroom_mesa_output_publications_source_scope_check check (
    (
      source_scope is null
      and origin_kind is not null
      and (
        (origin_kind='source' and origin_dossier_source_id is not null
          and material_key is null and material_version_id is null)
        or
        (origin_kind='material' and origin_dossier_source_id is null
          and material_key is not null and material_version_id is not null)
      )
    )
    or
    (
      source_scope is not null
      and source_scope='workspace'
      and origin_kind is null
      and origin_dossier_source_id is null
      and material_key is null
      and material_version_id is null
    )
  );

comment on column public.newsroom_mesa_output_publications.source_scope is
  'NULL preserves the historical exclusive-origin contract. workspace means all frozen dossier sources were available; usage is only newsroom_mesa_output_source_usage.';

create function public.newsroom_set_mesa_shared_outputs_v2(
  p_dossier_id uuid,
  p_article_plan_ids uuid[]
)
returns table(output_count integer,cancelled_count integer)
language plpgsql security definer set search_path='' as $function$
declare
  v_context public.newsroom_mesa_production_contexts%rowtype;
  v_cancelled integer:=0;
begin
  if p_dossier_id is null or p_article_plan_ids is null
    or cardinality(p_article_plan_ids) not between 1 and 30
    or array_position(p_article_plan_ids,null) is not null
    or (select count(distinct id) from unnest(p_article_plan_ids) id)<>cardinality(p_article_plan_ids) then
    raise exception 'mesa-shared-outputs-input-invalid';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('newsroom-mesa-shared-outputs:'||p_dossier_id::text,0));
  select * into v_context from public.newsroom_mesa_production_contexts c
    where c.dossier_id=p_dossier_id for update;
  if not found or v_context.workspace_role<>'technical'
    or v_context.workspace_contract_version<>2 or v_context.workspace_state<>'active'
    or exists(select 1 from public.newsroom_mesa_output_publications op where op.dossier_id=p_dossier_id) then
    raise exception 'mesa-shared-outputs-workspace-invalid';
  end if;
  if exists(
    select 1 from unnest(p_article_plan_ids) requested(id)
    left join public.newsroom_editorial_dossier_article_plans p
      on p.dossier_id=p_dossier_id and p.id=requested.id
        and p.status<>'cancelled' and p.editorial_article_id is null
    where p.id is null
  ) then
    raise exception 'mesa-shared-outputs-plan-invalid';
  end if;

  update public.newsroom_editorial_dossier_article_plans p set
    status='cancelled',updated_at=now()
    where p.dossier_id=p_dossier_id and p.status<>'cancelled'
      and p.editorial_article_id is null and not (p.id=any(p_article_plan_ids));
  get diagnostics v_cancelled=row_count;

  update public.newsroom_editorial_dossiers d set
    output_mode=case when cardinality(p_article_plan_ids)=1 then 'single' else 'multiple' end,
    output_count=cardinality(p_article_plan_ids),updated_at=now()
    where d.id=p_dossier_id;
  if not found then raise exception 'mesa-shared-outputs-workspace-invalid'; end if;

  return query select cardinality(p_article_plan_ids),v_cancelled;
end;
$function$;
revoke all on function public.newsroom_set_mesa_shared_outputs_v2(uuid,uuid[])
  from public,anon,authenticated,service_role;
grant execute on function public.newsroom_set_mesa_shared_outputs_v2(uuid,uuid[])
  to service_role;

create function public.newsroom_mesa_consolidate_publication_v4(p_dossier_id uuid)
returns boolean language plpgsql security definer set search_path='' as $function$
declare
  v_context public.newsroom_mesa_production_contexts%rowtype;
  v_payload jsonb; v_fingerprint text; v_event uuid; v_title text;
  v_material jsonb; v_origin public.newsroom_mesa_material_versions%rowtype;
  v_group record; v_articles uuid[]; v_version uuid; v_key text;
begin
  select * into v_context from public.newsroom_mesa_production_contexts c
    where c.dossier_id=p_dossier_id for update;
  if not found or v_context.workspace_contract_version<>2 or v_context.workspace_role<>'technical'
    or v_context.workspace_state<>'active' then return false; end if;
  if not exists(select 1 from public.newsroom_editorial_dossier_article_plans p
      where p.dossier_id=p_dossier_id and p.status<>'cancelled') then return false; end if;
  if exists(select 1 from public.newsroom_editorial_dossier_article_plans p
      left join public.newsroom_mesa_output_publications op
        on op.dossier_id=p.dossier_id and op.article_plan_id=p.id
      left join public.editorial_articles a on a.id=op.editorial_article_id
      where p.dossier_id=p_dossier_id and p.status<>'cancelled'
        and (op.article_plan_id is null or a.status<>'published')) then return false; end if;

  -- Historical exclusive-origin rows keep their original consolidator.
  if exists(select 1 from public.newsroom_mesa_output_publications op
      where op.dossier_id=p_dossier_id and op.source_scope is null) then
    return public.newsroom_mesa_consolidate_publication_v3(p_dossier_id);
  end if;
  if exists(select 1 from public.newsroom_mesa_output_publications op
      where op.dossier_id=p_dossier_id and op.source_scope<>'workspace') then
    return false;
  end if;

  select jsonb_build_object(
    'contractVersion',2,'sourceScope','workspace',
    'outputs',coalesce(jsonb_agg(output_row.payload order by output_row.article_plan_id),'[]'::jsonb)
  ) into v_payload
  from (
    select op.article_plan_id,jsonb_build_object(
      'outputId',op.article_plan_id,'articleId',op.editorial_article_id,
      'sources',coalesce((select jsonb_agg(jsonb_build_object(
        'dossierSourceId',u.dossier_source_id,
        'newsroomArticleId',u.newsroom_article_id,
        'newsroomSnapshotId',u.newsroom_snapshot_id
      ) order by u.dossier_source_id)
        from public.newsroom_mesa_output_source_usage u
        where u.dossier_id=op.dossier_id and u.article_plan_id=op.article_plan_id),'[]'::jsonb)
    ) payload
    from public.newsroom_mesa_output_publications op
    where op.dossier_id=p_dossier_id
  ) output_row;
  v_fingerprint:=md5(v_payload::text);
  select e.id into v_event from public.newsroom_mesa_publication_events e
    where e.dossier_id=p_dossier_id and e.fingerprint=v_fingerprint;
  if found then return false; end if;
  insert into public.newsroom_mesa_publication_events(dossier_id,fingerprint,payload)
    values(p_dossier_id,v_fingerprint,v_payload) returning id into v_event;
  select d.title into v_title from public.newsroom_editorial_dossiers d where d.id=p_dossier_id;

  -- Existing selected Dossiers retain their own frozen source set. A used source
  -- may participate in more than one selected material without merging them.
  for v_material in
    select value from jsonb_array_elements(coalesce(v_context.material_refs,'[]'::jsonb))
  loop
    if jsonb_typeof(v_material->'sources')<>'array'
      or nullif(v_material->>'key','') is null or nullif(v_material->>'versionId','') is null then
      raise exception 'mesa-publication-workspace-invalid';
    end if;
    select array_agg(distinct u.editorial_article_id order by u.editorial_article_id)
      into v_articles
      from public.newsroom_mesa_output_source_usage u
      where u.dossier_id=p_dossier_id and exists(
        select 1 from jsonb_array_elements(v_material->'sources') r
        where lower(r->>'newsroomArticleId')=u.newsroom_article_id::text
          and lower(r->>'newsroomSnapshotId')=u.newsroom_snapshot_id::text
      );
    if coalesce(cardinality(v_articles),0)=0 then continue; end if;
    select * into strict v_origin from public.newsroom_mesa_material_versions mv
      where mv.material_key=lower(v_material->>'key')
        and mv.id=(v_material->>'versionId')::uuid;
    v_articles:=array(select distinct article_id
      from unnest(v_origin.article_ids||v_articles) article_id order by article_id);
    if v_articles=v_origin.article_ids then continue; end if;
    insert into public.newsroom_mesa_material_versions(
      material_key,title,source_refs,article_ids,parent_version_id,production_dossier_id,publication_event_id
    ) values (
      v_origin.material_key,v_origin.title,v_origin.source_refs,v_articles,
      v_origin.id,p_dossier_id,v_event
    ) returning id into v_version;
    if v_context.theme_id is not null then
      update public.newsroom_mesa_theme_materials tm set version_id=v_version
        where tm.theme_id=v_context.theme_id and tm.material_key=v_origin.material_key
          and tm.version_id=v_origin.id;
      if not found then
        insert into public.newsroom_mesa_theme_materials(theme_id,material_key,version_id)
          values(v_context.theme_id,v_origin.material_key,v_version) on conflict do nothing;
      end if;
    end if;
  end loop;

  -- Only jointly used standalone sources can create a new Dossier. Exact equal
  -- source sets share one Dossier; package grouping and unused sources are ignored.
  for v_group in
    select standalone.source_ids,standalone.source_refs,
      array_agg(distinct standalone.article_id order by standalone.article_id) article_ids,
      min(standalone.article_plan_id::text)::uuid key_plan_id
    from (
      select u.article_plan_id,min(u.editorial_article_id::text)::uuid article_id,
        array_agg(u.dossier_source_id order by u.dossier_source_id) source_ids,
        public.newsroom_mesa_normalize_refs_v2(jsonb_agg(jsonb_build_object(
          'newsroomArticleId',u.newsroom_article_id,
          'newsroomSnapshotId',u.newsroom_snapshot_id
        ) order by u.newsroom_article_id,u.newsroom_snapshot_id)) source_refs
      from public.newsroom_mesa_output_source_usage u
      where u.dossier_id=p_dossier_id and not exists(
        select 1
        from jsonb_array_elements(coalesce(v_context.material_refs,'[]'::jsonb)) material,
          jsonb_array_elements(coalesce(material->'sources','[]'::jsonb)) ref
        where lower(ref->>'newsroomArticleId')=u.newsroom_article_id::text
          and lower(ref->>'newsroomSnapshotId')=u.newsroom_snapshot_id::text
      )
      group by u.article_plan_id
      having count(*)>=2
    ) standalone
    group by standalone.source_ids,standalone.source_refs
  loop
    v_key:='output:'||v_group.key_plan_id::text;
    insert into public.newsroom_mesa_material_versions(
      material_key,title,source_refs,article_ids,production_dossier_id,publication_event_id
    ) values (v_key,v_title,v_group.source_refs,v_group.article_ids,p_dossier_id,v_event)
    returning id into v_version;
    if v_context.theme_id is not null then
      insert into public.newsroom_mesa_theme_materials(theme_id,material_key,version_id)
        values(v_context.theme_id,v_key,v_version) on conflict do nothing;
    end if;
  end loop;

  if v_context.theme_id is not null then
    insert into public.newsroom_editorial_theme_articles(theme_id,editorial_article_id)
      select v_context.theme_id,op.editorial_article_id
      from public.newsroom_mesa_output_publications op where op.dossier_id=p_dossier_id
      on conflict(theme_id,editorial_article_id) do nothing;
  end if;
  update public.newsroom_mesa_production_contexts set
    workspace_state='consolidated',consolidated_at=now()
    where dossier_id=p_dossier_id;
  return true;
end;
$function$;
revoke all on function public.newsroom_mesa_consolidate_publication_v4(uuid)
  from public,anon,authenticated,service_role;

create or replace function public.newsroom_mesa_consolidate_publication_v2(p_dossier_id uuid)
returns boolean language sql security definer set search_path='' as $function$
  select public.newsroom_mesa_consolidate_publication_v4(p_dossier_id);
$function$;

create or replace function public.newsroom_publish_mesa_output_v2(
  p_dossier_id uuid,p_output_id uuid,p_package_id uuid,
  p_dossier_source_ids uuid[],p_article jsonb
)
returns table(editorial_article_id uuid,article_slug text,publication_action text,consolidated boolean)
language plpgsql security definer set search_path='' as $function$
declare
  v_context public.newsroom_mesa_production_contexts%rowtype;
  v_plan public.newsroom_editorial_dossier_article_plans%rowtype;
  v_manifest jsonb; v_existing public.newsroom_mesa_output_publications%rowtype;
  v_article_id uuid; v_slug text; v_label text; v_title text; v_subtitle text; v_body text;
  v_image text; v_author text; v_published_at timestamptz; v_matchday uuid; v_mode text;
  v_previous_slug text;
  v_payload jsonb; v_fingerprint text; v_consolidated boolean; v_now timestamptz:=now();
begin
  if p_dossier_id is null or p_output_id is null or p_package_id is null
    or p_dossier_source_ids is null or cardinality(p_dossier_source_ids)<1
    or cardinality(p_dossier_source_ids)>20 or array_position(p_dossier_source_ids,null) is not null
    or (select count(distinct x) from unnest(p_dossier_source_ids) x)<>cardinality(p_dossier_source_ids)
    or p_article is null or jsonb_typeof(p_article)<>'object' then
    raise exception 'mesa-publication-input-invalid'; end if;
  perform pg_advisory_xact_lock(hashtextextended('newsroom-mesa-output:'||p_output_id::text,0));
  select * into v_context from public.newsroom_mesa_production_contexts c
    where c.dossier_id=p_dossier_id for update;
  if not found or v_context.workspace_role<>'technical' or v_context.workspace_contract_version<>2
    or v_context.workspace_state not in ('active','consolidated') then
    raise exception 'mesa-publication-workspace-invalid'; end if;
  select * into v_plan from public.newsroom_editorial_dossier_article_plans p
    where p.dossier_id=p_dossier_id and p.id=p_output_id and p.status<>'cancelled' for update;
  if not found then raise exception 'mesa-publication-output-invalid'; end if;
  select p.manifest into v_manifest from public.newsroom_editorial_source_packages p
    where p.id=p_package_id for update;
  if not found or (v_manifest->>'version')::integer<>5
    or v_manifest->>'provenanceContract'<>'mesa-v2'
    or not exists(select 1 from jsonb_array_elements(v_manifest->'outputs') o
      where lower(o->>'outputId')=p_output_id::text
        and lower(o->'articlePlan'->>'articlePlanId')=p_output_id::text
        and lower(o->'articlePlan'->>'dossierId')=p_dossier_id::text
        and o->'articlePlan'->>'sourceScope'='workspace'
        and not (o->'articlePlan' ? 'origin')) then
    raise exception 'mesa-publication-package-invalid'; end if;
  if exists(select 1 from unnest(p_dossier_source_ids) requested(id)
    left join public.newsroom_editorial_dossier_sources s
      on s.id=requested.id and s.dossier_id=p_dossier_id and s.included
    where s.id is null
      or not exists(select 1 from jsonb_array_elements(v_context.source_refs) r
        where lower(r->>'newsroomArticleId')=s.newsroom_article_id::text
          and lower(r->>'newsroomSnapshotId')=s.newsroom_snapshot_id::text)
      or not exists(select 1 from jsonb_array_elements(v_manifest->'entries') e
        where e->>'status'='prepared' and lower(e->>'provenanceSourceId')=requested.id::text
          and lower(e->>'newsroomArticleId')=s.newsroom_article_id::text
          and lower(e->>'newsroomSnapshotId')=s.newsroom_snapshot_id::text)
  ) then raise exception 'mesa-publication-source-invalid'; end if;

  begin v_article_id:=(p_article->>'id')::uuid;
    exception when others then raise exception 'mesa-publication-article-invalid'; end;
  v_slug:=btrim(coalesce(p_article->>'slug','')); v_label:=btrim(coalesce(p_article->>'label',''));
  v_title:=btrim(coalesce(p_article->>'title','')); v_subtitle:=btrim(coalesce(p_article->>'subtitle',''));
  v_body:=btrim(coalesce(p_article->>'body','')); v_image:=nullif(btrim(coalesce(p_article->>'imageUrl','')),'');
  v_author:=btrim(coalesce(p_article->>'author','')); v_mode:=lower(btrim(coalesce(p_article->>'mode','')));
  begin v_published_at:=(p_article->>'publishedAt')::timestamptz; v_matchday:=(p_article->>'matchdayId')::uuid;
    exception when others then raise exception 'mesa-publication-article-invalid'; end;
  if v_slug='' or v_label='' or v_title='' or v_subtitle='' or v_body='' or v_author=''
    or v_mode not in ('create','update') then raise exception 'mesa-publication-article-invalid'; end if;
  v_payload:=jsonb_build_object(
    'article',jsonb_build_object('id',v_article_id,'slug',v_slug,'label',v_label,'title',v_title,
      'subtitle',v_subtitle,'body',v_body,'imageUrl',v_image,'author',v_author,
      'publishedAt',v_published_at,'matchdayId',v_matchday,'mode',v_mode),
    'sources',(select to_jsonb(array_agg(x order by x)) from unnest(p_dossier_source_ids) x),
    'packageId',p_package_id,'outputId',p_output_id,'sourceScope','workspace'
  );
  v_fingerprint:=md5(v_payload::text);
  select * into v_existing from public.newsroom_mesa_output_publications op
    where op.dossier_id=p_dossier_id and op.article_plan_id=p_output_id;
  if found then
    if v_existing.fingerprint<>v_fingerprint or v_existing.editorial_article_id<>v_article_id
      or v_existing.source_scope is distinct from 'workspace'
      or not exists(select 1 from public.editorial_articles a where a.id=v_article_id and a.status='published') then
      raise exception 'mesa-publication-provenance-conflict'; end if;
    return query select v_article_id,v_slug,'reused'::text,
      v_context.workspace_state='consolidated'; return;
  end if;
  if v_context.workspace_state='consolidated' then raise exception 'mesa-publication-provenance-conflict'; end if;

  if v_mode='create' then
    if v_plan.destination<>'new' or v_plan.update_target_editorial_article_id is not null or v_image is null
      or exists(select 1 from public.editorial_articles a where a.id=v_article_id or a.slug=v_slug) then
      raise exception 'mesa-publication-article-conflict'; end if;
    insert into public.editorial_articles(
      id,status,scope,author,label,title,subtitle,body,slug,image_url,image_caption,published_at,
      competition_id,season_id,matchday_id,created_at,updated_at
    ) values (
      v_article_id,'published','matchday',v_author,v_label,v_title,v_subtitle,v_body,v_slug,v_image,null,v_published_at,
      null,null,v_matchday,v_now,v_now
    );
  else
    if v_plan.destination<>'update' or v_plan.update_target_editorial_article_id<>v_article_id then
      raise exception 'mesa-publication-update-target-invalid'; end if;
    select a.slug into v_previous_slug from public.editorial_articles a
      where a.id=v_article_id and a.status='published' and a.matchday_id=v_matchday for update;
    if not found or v_previous_slug<>v_slug then raise exception 'mesa-publication-update-target-invalid'; end if;
    update public.editorial_articles a set label=v_label,title=v_title,subtitle=v_subtitle,body=v_body,
      author=v_author,image_url=coalesce(v_image,a.image_url),status='published',scope='matchday',
      competition_id=null,season_id=null,updated_at=v_now
      where a.id=v_article_id and a.status='published' and a.matchday_id=v_matchday and a.slug=v_slug;
    if not found then raise exception 'mesa-publication-update-target-invalid'; end if;
  end if;

  insert into public.newsroom_mesa_output_publications(
    dossier_id,article_plan_id,package_id,editorial_article_id,source_scope,
    origin_kind,origin_dossier_source_id,material_key,material_version_id,fingerprint,payload
  ) values (
    p_dossier_id,p_output_id,p_package_id,v_article_id,'workspace',
    null,null,null,null,v_fingerprint,v_payload
  );
  insert into public.newsroom_mesa_output_source_usage(
    dossier_id,article_plan_id,dossier_source_id,newsroom_article_id,newsroom_snapshot_id,
    editorial_article_id,package_id
  ) select p_dossier_id,p_output_id,s.id,s.newsroom_article_id,s.newsroom_snapshot_id,v_article_id,p_package_id
    from public.newsroom_editorial_dossier_sources s
    where s.dossier_id=p_dossier_id and s.id=any(p_dossier_source_ids);
  update public.newsroom_editorial_dossier_article_plans p set
    editorial_article_id=v_article_id,updated_at=v_now
    where p.dossier_id=p_dossier_id and p.id=p_output_id and p.editorial_article_id is null;
  if not found then raise exception 'mesa-publication-output-conflict'; end if;
  v_consolidated:=public.newsroom_mesa_consolidate_publication_v4(p_dossier_id);
  if v_mode='update' then
    perform * from public.sync_editorial_article_live_snapshots_v15(v_article_id,v_previous_slug);
  end if;
  return query select v_article_id,v_slug,
    case when v_mode='update' then 'updated' else 'created' end,v_consolidated;
end;
$function$;
revoke all on function public.newsroom_publish_mesa_output_v2(uuid,uuid,uuid,uuid[],jsonb)
  from public,anon,authenticated,service_role;
grant execute on function public.newsroom_publish_mesa_output_v2(uuid,uuid,uuid,uuid[],jsonb)
  to service_role;

notify pgrst,'reload schema';
commit;
