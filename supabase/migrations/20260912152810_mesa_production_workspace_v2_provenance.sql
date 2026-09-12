-- Mesa/Produção v2: separa o workspace técnico da organização editorial e
-- torna a proveniência devolvida pela IA parte da publicação transacional.
-- Migration aditiva: não reinterpreta nem reescreve produções históricas.
begin;

do $preflight$
begin
  if to_regclass('public.newsroom_mesa_production_contexts') is null
    or to_regclass('public.newsroom_mesa_material_versions') is null
    or to_regclass('public.newsroom_editorial_dossier_sources') is null
    or to_regclass('public.newsroom_editorial_dossier_article_plans') is null
    or to_regclass('public.newsroom_editorial_source_packages') is null
    or to_regprocedure('public.newsroom_prepare_mesa_materials_v2(uuid,uuid,text,jsonb,jsonb)') is null then
    raise exception 'mesa-production-v2-preflight-authority-missing';
  end if;
end;
$preflight$;

alter table public.newsroom_mesa_production_contexts
  add column workspace_role text,
  add column workspace_contract_version smallint,
  add column workspace_state text,
  add column abandoned_at timestamptz,
  add column consolidated_at timestamptz,
  add column abandonment_snapshot jsonb,
  add constraint newsroom_mesa_context_workspace_role_v2
    check (workspace_role is null or workspace_role = 'technical'),
  add constraint newsroom_mesa_context_contract_v2
    check (workspace_contract_version is null or workspace_contract_version = 2),
  add constraint newsroom_mesa_context_state_v2
    check (workspace_state is null or workspace_state in ('active','abandoned','consolidated')),
  add constraint newsroom_mesa_context_state_dates_v2 check (
    (workspace_state is null and abandoned_at is null and consolidated_at is null)
    or (workspace_state = 'active' and abandoned_at is null and consolidated_at is null)
    or (workspace_state = 'abandoned' and abandoned_at is not null and consolidated_at is null)
    or (workspace_state = 'consolidated' and abandoned_at is null and consolidated_at is not null)
  );

comment on column public.newsroom_mesa_production_contexts.workspace_role is
  'Explicit technical role. preparation_key is never an editorial authority.';
comment on column public.newsroom_mesa_production_contexts.workspace_contract_version is
  'Null means historical/unchanged. Value 2 requires OUTPUT_ID and FONTES_UTILIZADAS.';

create table public.newsroom_mesa_output_origins (
  dossier_id uuid not null,
  article_plan_id uuid not null,
  origin_kind text not null,
  origin_dossier_source_id uuid,
  material_key text,
  material_version_id uuid,
  created_at timestamptz not null default now(),
  primary key (dossier_id, article_plan_id),
  foreign key (dossier_id, article_plan_id)
    references public.newsroom_editorial_dossier_article_plans(dossier_id, id)
    on delete restrict,
  foreign key (dossier_id, origin_dossier_source_id)
    references public.newsroom_editorial_dossier_sources(dossier_id, id)
    on delete restrict,
  foreign key (material_key, material_version_id)
    references public.newsroom_mesa_material_versions(material_key, id)
    on delete restrict,
  check (
    (origin_kind = 'source' and origin_dossier_source_id is not null
      and material_key is null and material_version_id is null)
    or
    (origin_kind = 'material' and origin_dossier_source_id is null
      and material_key is not null and material_version_id is not null)
  )
);

create table public.newsroom_mesa_output_publications (
  dossier_id uuid not null,
  article_plan_id uuid not null,
  package_id uuid not null references public.newsroom_editorial_source_packages(id) on delete restrict,
  editorial_article_id uuid not null references public.editorial_articles(id) on delete restrict,
  origin_kind text not null,
  origin_dossier_source_id uuid,
  material_key text,
  material_version_id uuid,
  fingerprint text not null,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  primary key (dossier_id, article_plan_id),
  foreign key (dossier_id, article_plan_id)
    references public.newsroom_editorial_dossier_article_plans(dossier_id, id)
    on delete restrict,
  foreign key (dossier_id, origin_dossier_source_id)
    references public.newsroom_editorial_dossier_sources(dossier_id, id)
    on delete restrict,
  foreign key (material_key, material_version_id)
    references public.newsroom_mesa_material_versions(material_key, id)
    on delete restrict,
  unique (article_plan_id, fingerprint),
  check (
    (origin_kind = 'source' and origin_dossier_source_id is not null
      and material_key is null and material_version_id is null)
    or
    (origin_kind = 'material' and origin_dossier_source_id is null
      and material_key is not null and material_version_id is not null)
  )
);

create table public.newsroom_mesa_output_source_usage (
  dossier_id uuid not null,
  article_plan_id uuid not null,
  dossier_source_id uuid not null,
  newsroom_article_id uuid not null,
  newsroom_snapshot_id uuid not null,
  editorial_article_id uuid not null,
  package_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (dossier_id, article_plan_id, dossier_source_id),
  foreign key (dossier_id, article_plan_id)
    references public.newsroom_mesa_output_publications(dossier_id, article_plan_id)
    on delete restrict,
  foreign key (dossier_id, dossier_source_id)
    references public.newsroom_editorial_dossier_sources(dossier_id, id)
    on delete restrict,
  foreign key (newsroom_article_id)
    references public.newsroom_articles(id) on delete restrict,
  foreign key (newsroom_snapshot_id)
    references public.newsroom_article_snapshots(id) on delete restrict,
  foreign key (editorial_article_id)
    references public.editorial_articles(id)
    on delete restrict,
  foreign key (package_id)
    references public.newsroom_editorial_source_packages(id)
    on delete restrict
);

create index newsroom_mesa_output_usage_source_v2
  on public.newsroom_mesa_output_source_usage(dossier_source_id, editorial_article_id);
create index newsroom_mesa_output_usage_newsroom_v2
  on public.newsroom_mesa_output_source_usage(newsroom_article_id, newsroom_snapshot_id);

do $security$
declare v_table text;
begin
  foreach v_table in array array[
    'newsroom_mesa_output_origins',
    'newsroom_mesa_output_publications',
    'newsroom_mesa_output_source_usage'
  ] loop
    execute format('alter table public.%I enable row level security', v_table);
    execute format('alter table public.%I force row level security', v_table);
    execute format('revoke all on public.%I from public,anon,authenticated,service_role', v_table);
    execute format('grant select on public.%I to service_role', v_table);
  end loop;
end;
$security$;

create function public.newsroom_set_mesa_output_origin_v2(
  p_dossier_id uuid,
  p_article_plan_id uuid,
  p_origin_kind text,
  p_origin_dossier_source_id uuid,
  p_material_key text,
  p_material_version_id uuid
)
returns table(origin_action text)
language plpgsql security definer set search_path = '' as $function$
declare
  v_context public.newsroom_mesa_production_contexts%rowtype;
  v_existing public.newsroom_mesa_output_origins%rowtype;
  v_source public.newsroom_editorial_dossier_sources%rowtype;
begin
  select * into v_context from public.newsroom_mesa_production_contexts c
    where c.dossier_id = p_dossier_id for update;
  if not found or v_context.workspace_role <> 'technical'
    or v_context.workspace_contract_version <> 2
    or v_context.workspace_state <> 'active' then
    raise exception 'mesa-output-origin-invalid';
  end if;
  perform 1 from public.newsroom_editorial_dossier_article_plans p
    where p.dossier_id=p_dossier_id and p.id=p_article_plan_id
      and p.editorial_article_id is null and p.status<>'cancelled' for update;
  if not found then raise exception 'mesa-output-origin-invalid'; end if;

  if p_origin_kind='source' then
    if p_material_key is not null or p_material_version_id is not null
      or p_origin_dossier_source_id is null then raise exception 'mesa-output-origin-invalid'; end if;
    select * into v_source from public.newsroom_editorial_dossier_sources s
      where s.dossier_id=p_dossier_id and s.id=p_origin_dossier_source_id and s.included;
    if not found or not exists (
      select 1 from jsonb_array_elements(coalesce(v_context.selection_payload->'sources','[]'::jsonb)) r
      where lower(r->>'newsroomArticleId')=v_source.newsroom_article_id::text
        and lower(r->>'newsroomSnapshotId')=v_source.newsroom_snapshot_id::text
    ) then raise exception 'mesa-output-origin-invalid'; end if;
  elsif p_origin_kind='material' then
    if p_origin_dossier_source_id is not null or p_material_key is null or p_material_version_id is null
      or not exists (
        select 1 from jsonb_array_elements(v_context.material_refs) r
        where lower(r->>'key')=lower(p_material_key)
          and lower(r->>'versionId')=p_material_version_id::text
      ) then raise exception 'mesa-output-origin-invalid'; end if;
  else raise exception 'mesa-output-origin-invalid'; end if;

  select * into v_existing from public.newsroom_mesa_output_origins o
    where o.dossier_id=p_dossier_id and o.article_plan_id=p_article_plan_id;
  if found then
    if v_existing.origin_kind is distinct from p_origin_kind
      or v_existing.origin_dossier_source_id is distinct from p_origin_dossier_source_id
      or v_existing.material_key is distinct from lower(p_material_key)
      or v_existing.material_version_id is distinct from p_material_version_id then
      raise exception 'mesa-output-origin-conflict';
    end if;
    return query select 'reused'::text; return;
  end if;
  insert into public.newsroom_mesa_output_origins(
    dossier_id,article_plan_id,origin_kind,origin_dossier_source_id,material_key,material_version_id
  ) values (
    p_dossier_id,p_article_plan_id,p_origin_kind,p_origin_dossier_source_id,lower(p_material_key),p_material_version_id
  );
  return query select 'created'::text;
end;
$function$;
revoke all on function public.newsroom_set_mesa_output_origin_v2(uuid,uuid,text,uuid,text,uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.newsroom_set_mesa_output_origin_v2(uuid,uuid,text,uuid,text,uuid)
  to service_role;

-- Override only future calls. Existing context rows, snapshots and relations are untouched.
create or replace function public.newsroom_prepare_mesa_materials_v2(
  p_preparation_key uuid,p_theme_id uuid,p_title text,p_source_refs jsonb,p_material_refs jsonb
)
returns table(dossier_id uuid,preparation_action text,source_count integer,published_context_count integer,image_count integer)
language plpgsql security definer set search_path = '' as $function$
declare
  v_payload jsonb; v_existing public.newsroom_mesa_production_contexts%rowtype; v_result record;
  v_ref jsonb; v_version public.newsroom_mesa_material_versions%rowtype;
  v_refs jsonb; v_materials jsonb:='[]'::jsonb; v_context_ids uuid[]:='{}'::uuid[];
begin
  if p_preparation_key is null or nullif(btrim(p_title),'') is null or length(btrim(p_title))>180
    or p_material_refs is null or jsonb_typeof(p_material_refs)<>'array' or jsonb_array_length(p_material_refs)>50 then
    raise exception 'mesa-material-selection-invalid'; end if;
  if exists(select 1 from jsonb_array_elements(p_material_refs) r group by lower(r->>'key') having count(*)>1) then
    raise exception 'mesa-material-selection-invalid'; end if;
  perform pg_advisory_xact_lock(hashtextextended('newsroom-mesa-organization-v1',0));
  update public.newsroom_mesa_containment_guard set revision=not revision where singleton;
  if not found then raise exception 'mesa-organization-containment-guard-missing'; end if;
  v_payload:=jsonb_build_object('contractVersion',2,'theme',p_theme_id,'title',btrim(p_title),
    'sources',p_source_refs,'materials',p_material_refs);
  select * into v_existing from public.newsroom_mesa_production_contexts c
    where c.preparation_key=p_preparation_key;
  if found then
    if v_existing.selection_payload is distinct from v_payload
      or v_existing.workspace_contract_version is distinct from 2::smallint
      or v_existing.workspace_state is distinct from 'active' then
      raise exception 'mesa-material-preparation-conflict'; end if;
    return query select v_existing.dossier_id,'reused'::text,jsonb_array_length(v_existing.source_refs),
      (select count(*)::integer from public.newsroom_editorial_dossier_published_contexts pc where pc.dossier_id=v_existing.dossier_id),
      (select count(*)::integer from public.newsroom_editorial_dossier_images i where i.dossier_id=v_existing.dossier_id);
    return;
  end if;
  if exists(select 1 from public.newsroom_editorial_dossiers d where d.preparation_key=p_preparation_key) then
    raise exception 'mesa-material-prepared-before-v2'; end if;
  if p_theme_id is not null then
    perform 1 from public.newsroom_editorial_themes t where t.id=p_theme_id and t.status='open' for update;
    if not found then raise exception 'mesa-organization-theme-unavailable'; end if;
  end if;
  v_refs:=public.newsroom_mesa_normalize_refs_v2(p_source_refs);
  for v_ref in select r from jsonb_array_elements(p_material_refs) r loop
    v_version:=public.newsroom_mesa_capture_material_v2(v_ref);
    v_refs:=v_refs || v_version.source_refs;
    v_context_ids:=v_context_ids || v_version.article_ids;
    v_materials:=v_materials || jsonb_build_array(jsonb_build_object(
      'key',v_version.material_key,'versionId',v_version.id,'sources',v_version.source_refs));
  end loop;
  v_refs:=public.newsroom_mesa_normalize_refs_v2(v_refs);
  v_context_ids:=array(select distinct a from unnest(v_context_ids) a order by a);
  if cardinality(v_context_ids)>20 then raise exception 'mesa-material-context-limit'; end if;
  if exists(select 1 from unnest(v_context_ids) requested(id) where not exists(
    select 1 from public.editorial_articles a where a.id=requested.id and a.status='published')) then
    raise exception 'mesa-material-context-unavailable'; end if;
  if jsonb_array_length(v_refs)<1 or jsonb_array_length(v_refs)>20 then raise exception 'mesa-material-selection-invalid'; end if;
  if exists(select 1 from jsonb_array_elements(v_refs) r where not exists(
    select 1 from public.newsroom_editorial_article_classifications c
      where c.newsroom_article_id=(r->>'newsroomArticleId')::uuid)) then
    raise exception 'mesa-material-classification-required'; end if;
  select * into v_result from public.newsroom_prepare_editorial_dossier_workspace_v1(
    p_preparation_key,btrim(p_title),
    array(select (r->>'newsroomArticleId')::uuid from jsonb_array_elements(v_refs) r),
    array(select (r->>'newsroomSnapshotId')::uuid from jsonb_array_elements(v_refs) r),v_context_ids);
  insert into public.newsroom_mesa_production_contexts(
    dossier_id,theme_id,preparation_key,selection_payload,source_refs,material_refs,
    workspace_role,workspace_contract_version,workspace_state
  ) values (
    v_result.dossier_id,p_theme_id,p_preparation_key,v_payload,v_refs,v_materials,
    'technical',2,'active'
  );
  -- Intentionally no Theme membership write: PREPARAR never organizes editorially.
  return query select v_result.dossier_id,v_result.preparation_action,v_result.source_count,
    v_result.published_context_count,v_result.image_count;
end;
$function$;

create function public.newsroom_preview_abandon_mesa_production_v2(p_dossier_id uuid)
returns table(
  dossier_id uuid,
  workspace_state text,
  publication_count integer,
  source_count integer,
  removable_theme_memberships jsonb
)
language sql stable security definer set search_path = '' as $function$
  select c.dossier_id,
    coalesce(c.workspace_state,'active'),
    (
      (select count(*) from public.newsroom_mesa_output_publications p where p.dossier_id=c.dossier_id)
      + (select count(*) from public.newsroom_mesa_publication_events e where e.dossier_id=c.dossier_id)
      + (select count(*) from public.newsroom_editorial_dossier_article_plans p
          join public.editorial_articles a on a.id=p.editorial_article_id and a.status='published'
          where p.dossier_id=c.dossier_id)
    )::integer,
    jsonb_array_length(c.source_refs),
    coalesce((select jsonb_agg(jsonb_build_object(
      'themeId',m.theme_id,'newsroomArticleId',m.newsroom_article_id,'addedAt',m.added_at
    ) order by m.theme_id,m.newsroom_article_id)
    from public.newsroom_editorial_theme_sources m
    where m.theme_id=c.theme_id and m.added_at=c.created_at
      and exists(select 1 from jsonb_array_elements(c.source_refs) r
        where lower(r->>'newsroomArticleId')=m.newsroom_article_id::text)
      and not exists(select 1 from public.newsroom_mesa_theme_materials tm
        join public.newsroom_mesa_version_source_refs vs on vs.version_id=tm.version_id
        where tm.theme_id=m.theme_id and vs.newsroom_article_id=m.newsroom_article_id)
    ),'[]'::jsonb)
  from public.newsroom_mesa_production_contexts c
  where c.dossier_id=p_dossier_id;
$function$;
revoke all on function public.newsroom_preview_abandon_mesa_production_v2(uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.newsroom_preview_abandon_mesa_production_v2(uuid) to service_role;

create function public.newsroom_abandon_mesa_production_v2(p_dossier_id uuid)
returns table(abandonment_action text,restored_theme_membership_count integer)
language plpgsql security definer set search_path = '' as $function$
declare
  v_context public.newsroom_mesa_production_contexts%rowtype;
  v_publications integer; v_removed integer:=0; v_snapshot jsonb;
begin
  perform pg_advisory_xact_lock(hashtextextended('newsroom-mesa-abandon:'||p_dossier_id::text,0));
  select * into v_context from public.newsroom_mesa_production_contexts c
    where c.dossier_id=p_dossier_id for update;
  if not found then raise exception 'mesa-production-not-found'; end if;
  if v_context.workspace_state='consolidated' then raise exception 'mesa-production-already-published'; end if;
  if v_context.workspace_state='abandoned' then return query select 'reused'::text,0; return; end if;
  select publication_count into v_publications
    from public.newsroom_preview_abandon_mesa_production_v2(p_dossier_id);
  if v_publications>0 then raise exception 'mesa-production-already-published'; end if;
  select jsonb_build_object(
    'context',to_jsonb(v_context),
    'themeMemberships',removable_theme_memberships,
    'capturedAt',now()
  ) into v_snapshot from public.newsroom_preview_abandon_mesa_production_v2(p_dossier_id);
  delete from public.newsroom_editorial_theme_sources m
    where m.theme_id=v_context.theme_id and m.added_at=v_context.created_at
      and exists(select 1 from jsonb_array_elements(v_context.source_refs) r
        where lower(r->>'newsroomArticleId')=m.newsroom_article_id::text)
      and not exists(select 1 from public.newsroom_mesa_theme_materials tm
        join public.newsroom_mesa_version_source_refs vs on vs.version_id=tm.version_id
        where tm.theme_id=m.theme_id and vs.newsroom_article_id=m.newsroom_article_id);
  get diagnostics v_removed=row_count;
  update public.newsroom_mesa_production_contexts set
    workspace_role='technical',workspace_state='abandoned',abandoned_at=now(),
    consolidated_at=null,abandonment_snapshot=v_snapshot
    where dossier_id=p_dossier_id;
  return query select 'abandoned'::text,v_removed;
end;
$function$;
revoke all on function public.newsroom_abandon_mesa_production_v2(uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.newsroom_abandon_mesa_production_v2(uuid) to service_role;

create function public.newsroom_mesa_consolidate_publication_v3(p_dossier_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $function$
declare
  v_context public.newsroom_mesa_production_contexts%rowtype;
  v_payload jsonb; v_fingerprint text; v_event uuid; v_title text;
  v_group record; v_origin public.newsroom_mesa_material_versions%rowtype;
  v_refs jsonb; v_articles uuid[]; v_version uuid; v_key text;
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
  select jsonb_build_object(
    'contractVersion',2,
    'outputs',coalesce(jsonb_agg(output_row.payload order by output_row.article_plan_id),'[]'::jsonb)
  ) into v_payload
  from (
    select op.article_plan_id,jsonb_build_object(
      'outputId',op.article_plan_id,'articleId',op.editorial_article_id,
      'sources',coalesce((select jsonb_agg(u.dossier_source_id order by u.dossier_source_id)
        from public.newsroom_mesa_output_source_usage u
        where u.dossier_id=op.dossier_id and u.article_plan_id=op.article_plan_id),'[]'::jsonb),
      'origin',jsonb_build_object('kind',op.origin_kind,'sourceId',op.origin_dossier_source_id,
        'materialKey',op.material_key,'versionId',op.material_version_id)
    ) as payload
    from public.newsroom_mesa_output_publications op
    where op.dossier_id=p_dossier_id
  ) as output_row;
  v_fingerprint:=md5(v_payload::text);
  select e.id into v_event from public.newsroom_mesa_publication_events e
    where e.dossier_id=p_dossier_id and e.fingerprint=v_fingerprint;
  if found then return false; end if;
  insert into public.newsroom_mesa_publication_events(dossier_id,fingerprint,payload)
    values(p_dossier_id,v_fingerprint,v_payload) returning id into v_event;
  select d.title into v_title from public.newsroom_editorial_dossiers d where d.id=p_dossier_id;

  for v_group in
    select op.origin_kind,op.origin_dossier_source_id,op.material_key,op.material_version_id,
      array_agg(distinct op.article_plan_id order by op.article_plan_id) plan_ids
    from public.newsroom_mesa_output_publications op where op.dossier_id=p_dossier_id
    group by op.origin_kind,op.origin_dossier_source_id,op.material_key,op.material_version_id,
      case when op.origin_kind='source' then op.article_plan_id else null end
  loop
    select public.newsroom_mesa_normalize_refs_v2(coalesce(jsonb_agg(jsonb_build_object(
      'newsroomArticleId',u.newsroom_article_id,'newsroomSnapshotId',u.newsroom_snapshot_id)
      order by u.newsroom_article_id),'[]'::jsonb)),
      array_agg(distinct u.editorial_article_id order by u.editorial_article_id)
      into v_refs,v_articles
      from public.newsroom_mesa_output_source_usage u
      where u.dossier_id=p_dossier_id and u.article_plan_id=any(v_group.plan_ids);
    if v_group.origin_kind='material' then
      select * into strict v_origin from public.newsroom_mesa_material_versions v
        where v.material_key=v_group.material_key and v.id=v_group.material_version_id;
      v_refs:=public.newsroom_mesa_normalize_refs_v2(v_origin.source_refs || v_refs);
      v_articles:=array(select distinct a from unnest(v_origin.article_ids || v_articles) a order by a);
      insert into public.newsroom_mesa_material_versions(
        material_key,title,source_refs,article_ids,parent_version_id,production_dossier_id,publication_event_id
      ) values (
        v_origin.material_key,v_origin.title,v_refs,v_articles,v_origin.id,p_dossier_id,v_event
      ) returning id into v_version;
      if v_context.theme_id is not null then
        update public.newsroom_mesa_theme_materials set version_id=v_version
          where theme_id=v_context.theme_id and material_key=v_origin.material_key
            and version_id=v_origin.id;
        if not found then
          insert into public.newsroom_mesa_theme_materials(theme_id,material_key,version_id)
            values(v_context.theme_id,v_origin.material_key,v_version) on conflict do nothing;
        end if;
      end if;
    elsif jsonb_array_length(v_refs)>=2 then
      v_key:='output:'||(v_group.plan_ids)[1]::text;
      insert into public.newsroom_mesa_material_versions(
        material_key,title,source_refs,article_ids,production_dossier_id,publication_event_id
      ) values (v_key,v_title,v_refs,v_articles,p_dossier_id,v_event)
      returning id into v_version;
      if v_context.theme_id is not null then
        insert into public.newsroom_mesa_theme_materials(theme_id,material_key,version_id)
          values(v_context.theme_id,v_key,v_version) on conflict do nothing;
      end if;
    end if;
  end loop;
  if v_context.theme_id is not null then
    insert into public.newsroom_editorial_theme_articles(theme_id,editorial_article_id)
      select v_context.theme_id,op.editorial_article_id
      from public.newsroom_mesa_output_publications op where op.dossier_id=p_dossier_id
      on conflict(theme_id,editorial_article_id) do nothing;
  end if;
  update public.newsroom_mesa_production_contexts set workspace_state='consolidated',consolidated_at=now()
    where dossier_id=p_dossier_id;
  return true;
end;
$function$;
revoke all on function public.newsroom_mesa_consolidate_publication_v3(uuid)
  from public,anon,authenticated,service_role;

-- Existing deferred triggers now consult final AI provenance, never assignments.
create or replace function public.newsroom_mesa_consolidate_publication_v2(p_dossier_id uuid)
returns boolean language sql security definer set search_path = '' as $function$
  select public.newsroom_mesa_consolidate_publication_v3(p_dossier_id);
$function$;

create function public.newsroom_publish_mesa_output_v2(
  p_dossier_id uuid,
  p_output_id uuid,
  p_package_id uuid,
  p_dossier_source_ids uuid[],
  p_article jsonb
)
returns table(editorial_article_id uuid,article_slug text,publication_action text,consolidated boolean)
language plpgsql security definer set search_path = '' as $function$
declare
  v_context public.newsroom_mesa_production_contexts%rowtype;
  v_plan public.newsroom_editorial_dossier_article_plans%rowtype;
  v_origin public.newsroom_mesa_output_origins%rowtype;
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
    or p_article is null or jsonb_typeof(p_article)<>'object' then raise exception 'mesa-publication-input-invalid'; end if;
  perform pg_advisory_xact_lock(hashtextextended('newsroom-mesa-output:'||p_output_id::text,0));
  select * into v_context from public.newsroom_mesa_production_contexts c
    where c.dossier_id=p_dossier_id for update;
  if not found or v_context.workspace_role<>'technical' or v_context.workspace_contract_version<>2
    or v_context.workspace_state not in ('active','consolidated') then
    raise exception 'mesa-publication-workspace-invalid'; end if;
  select * into v_plan from public.newsroom_editorial_dossier_article_plans p
    where p.dossier_id=p_dossier_id and p.id=p_output_id and p.status<>'cancelled' for update;
  if not found then raise exception 'mesa-publication-output-invalid'; end if;
  select * into strict v_origin from public.newsroom_mesa_output_origins o
    where o.dossier_id=p_dossier_id and o.article_plan_id=p_output_id;
  select p.manifest into v_manifest from public.newsroom_editorial_source_packages p
    where p.id=p_package_id for update;
  if not found or (v_manifest->>'version')::integer<>5 or v_manifest->>'provenanceContract'<>'mesa-v2'
    or not exists(select 1 from jsonb_array_elements(v_manifest->'outputs') o
      where lower(o->>'outputId')=p_output_id::text
        and lower(o->'articlePlan'->>'articlePlanId')=p_output_id::text
        and lower(o->'articlePlan'->>'dossierId')=p_dossier_id::text) then
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

  begin v_article_id:=(p_article->>'id')::uuid; exception when others then raise exception 'mesa-publication-article-invalid'; end;
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
    'packageId',p_package_id,'outputId',p_output_id
  );
  v_fingerprint:=md5(v_payload::text);
  select * into v_existing from public.newsroom_mesa_output_publications op
    where op.dossier_id=p_dossier_id and op.article_plan_id=p_output_id;
  if found then
    if v_existing.fingerprint<>v_fingerprint or v_existing.editorial_article_id<>v_article_id
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
    dossier_id,article_plan_id,package_id,editorial_article_id,origin_kind,
    origin_dossier_source_id,material_key,material_version_id,fingerprint,payload
  ) values (
    p_dossier_id,p_output_id,p_package_id,v_article_id,v_origin.origin_kind,
    v_origin.origin_dossier_source_id,v_origin.material_key,v_origin.material_version_id,v_fingerprint,v_payload
  );
  insert into public.newsroom_mesa_output_source_usage(
    dossier_id,article_plan_id,dossier_source_id,newsroom_article_id,newsroom_snapshot_id,
    editorial_article_id,package_id
  ) select p_dossier_id,p_output_id,s.id,s.newsroom_article_id,s.newsroom_snapshot_id,v_article_id,p_package_id
    from public.newsroom_editorial_dossier_sources s
    where s.dossier_id=p_dossier_id and s.id=any(p_dossier_source_ids);
  update public.newsroom_editorial_dossier_article_plans as plan_row
    set editorial_article_id=v_article_id,updated_at=v_now
    where plan_row.dossier_id=p_dossier_id and plan_row.id=p_output_id
      and plan_row.editorial_article_id is null;
  if not found then raise exception 'mesa-publication-output-conflict'; end if;
  v_consolidated:=public.newsroom_mesa_consolidate_publication_v3(p_dossier_id);
  if v_mode='update' then
    perform * from public.sync_editorial_article_live_snapshots_v15(v_article_id,v_previous_slug);
  end if;
  return query select v_article_id,v_slug,case when v_mode='update' then 'updated' else 'created' end,v_consolidated;
end;
$function$;
revoke all on function public.newsroom_publish_mesa_output_v2(uuid,uuid,uuid,uuid[],jsonb)
  from public,anon,authenticated,service_role;
grant execute on function public.newsroom_publish_mesa_output_v2(uuid,uuid,uuid,uuid[],jsonb)
  to service_role;

comment on table public.newsroom_mesa_output_source_usage is
  'Final AI-validated output provenance. Technical Article Plan assignments are not publication proof.';

notify pgrst, 'reload schema';
commit;
