-- CORREÇÃO ADITIVA V2. NÃO reexecutar 20260911100419 / organização v1.
-- Aplicação separada, apenas após autorização. Este ficheiro não altera o histórico de migrations.
-- Identidades editoriais e revisões por referência; o motor de preparação v1 é reutilizado.
begin;

-- Preconditions: existing authorities only. No backfill, no replay and no history edits.
do $preflight$
begin
  if to_regclass('public.newsroom_mesa_containment_guard') is null
    or to_regclass('public.newsroom_editorial_theme_dossiers') is null
    or to_regprocedure('public.newsroom_prepare_editorial_dossier_workspace_v1(uuid,text,uuid[],uuid[],uuid[])') is null
    or to_regprocedure('public.newsroom_create_editorial_theme_v1(text,text,text,uuid,uuid,uuid,uuid)') is null
    or to_regprocedure('public.newsroom_set_editorial_theme_source_membership_v1(uuid,uuid,boolean)') is null then
    raise exception 'mesa-v2-preflight-existing-authority-missing'; end if;
  if to_regclass('public.newsroom_mesa_material_versions') is not null then
    raise exception 'mesa-v2-already-installed-do-not-replay'; end if;
end;
$preflight$;

create table public.newsroom_mesa_publication_events (
  id uuid primary key default gen_random_uuid(),
  dossier_id uuid not null references public.newsroom_editorial_dossiers(id) on delete restrict,
  fingerprint text not null,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  unique(dossier_id, fingerprint)
);
create table public.newsroom_mesa_material_versions (
  id uuid primary key default gen_random_uuid(),
  revision bigint generated always as identity unique,
  material_key text not null,
  title text not null,
  source_refs jsonb not null check (jsonb_typeof(source_refs) = 'array'),
  article_ids uuid[] not null,
  parent_version_id uuid references public.newsroom_mesa_material_versions(id) on delete restrict,
  production_dossier_id uuid references public.newsroom_editorial_dossiers(id) on delete restrict,
  publication_event_id uuid references public.newsroom_mesa_publication_events(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique(material_key, id),
  unique(material_key, publication_event_id)
);
create index newsroom_mesa_material_latest_v2 on public.newsroom_mesa_material_versions(material_key, revision desc);
-- Restrict deletion of referenced material even when its original package used only JSON.
create table public.newsroom_mesa_version_source_refs (
  version_id uuid not null references public.newsroom_mesa_material_versions(id) on delete restrict,
  newsroom_article_id uuid not null references public.newsroom_articles(id) on delete restrict,
  newsroom_snapshot_id uuid not null references public.newsroom_article_snapshots(id) on delete restrict,
  primary key(version_id, newsroom_article_id)
);
create table public.newsroom_mesa_version_article_refs (
  version_id uuid not null references public.newsroom_mesa_material_versions(id) on delete restrict,
  editorial_article_id uuid not null references public.editorial_articles(id) on delete restrict,
  primary key(version_id, editorial_article_id)
);
create table public.newsroom_mesa_theme_materials (
  theme_id uuid not null references public.newsroom_editorial_themes(id) on delete restrict,
  material_key text not null,
  version_id uuid not null,
  added_at timestamptz not null default now(),
  primary key(theme_id, material_key),
  foreign key(material_key, version_id) references public.newsroom_mesa_material_versions(material_key, id) on delete restrict
);
create table public.newsroom_mesa_production_contexts (
  dossier_id uuid primary key references public.newsroom_editorial_dossiers(id) on delete restrict,
  theme_id uuid references public.newsroom_editorial_themes(id) on delete restrict,
  preparation_key uuid not null unique,
  selection_payload jsonb not null,
  source_refs jsonb not null,
  material_refs jsonb not null,
  created_at timestamptz not null default now()
);

-- Only server-side service-role RPCs can write. No browser key can read these tables.
do $security$
declare t text;
begin
  foreach t in array array['newsroom_mesa_publication_events','newsroom_mesa_material_versions',
    'newsroom_mesa_version_source_refs','newsroom_mesa_version_article_refs',
    'newsroom_mesa_theme_materials','newsroom_mesa_production_contexts'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('alter table public.%I force row level security',t);
    execute format('revoke all on public.%I from public,anon,authenticated,service_role',t);
    execute format('grant select on public.%I to service_role',t);
  end loop;
end;
$security$;

create function public.newsroom_mesa_normalize_refs_v2(p_refs jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $function$
declare v_result jsonb;
begin
  if p_refs is null or jsonb_typeof(p_refs) <> 'array' or jsonb_array_length(p_refs) > 10000 then
    raise exception 'mesa-material-source-invalid';
  end if;
  if exists(select 1 from jsonb_array_elements(p_refs) r
    where jsonb_typeof(r) <> 'object' or coalesce(r->>'newsroomArticleId','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      or coalesce(r->>'newsroomSnapshotId','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$') then
    raise exception 'mesa-material-source-invalid';
  end if;
  if exists(select 1 from jsonb_array_elements(p_refs) r group by (r->>'newsroomArticleId')::uuid
    having count(distinct (r->>'newsroomSnapshotId')::uuid) > 1) then
    raise exception 'mesa-material-version-conflict';
  end if;
  if exists(select 1 from jsonb_array_elements(p_refs) r where not exists(
    select 1 from public.newsroom_article_snapshots s where s.id=(r->>'newsroomSnapshotId')::uuid
      and s.article_id=(r->>'newsroomArticleId')::uuid)) then raise exception 'mesa-material-snapshot-mismatch'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('newsroomArticleId',a,'newsroomSnapshotId',s) order by a),'[]'::jsonb)
  into v_result from (select distinct (r->>'newsroomArticleId')::uuid a,(r->>'newsroomSnapshotId')::uuid s
    from jsonb_array_elements(p_refs) r) refs;
  return v_result;
end;
$function$;
revoke all on function public.newsroom_mesa_normalize_refs_v2(jsonb) from public,anon,authenticated,service_role;

create function public.newsroom_mesa_version_refs_v2()
returns trigger language plpgsql security definer set search_path = '' as $function$
begin
  if public.newsroom_mesa_normalize_refs_v2(new.source_refs) is distinct from new.source_refs then
    raise exception 'mesa-material-source-invalid'; end if;
  insert into public.newsroom_mesa_version_source_refs(version_id,newsroom_article_id,newsroom_snapshot_id)
    select new.id,(r->>'newsroomArticleId')::uuid,(r->>'newsroomSnapshotId')::uuid from jsonb_array_elements(new.source_refs) r;
  insert into public.newsroom_mesa_version_article_refs(version_id,editorial_article_id)
    select new.id,a from unnest(new.article_ids) a;
  return new;
end;
$function$;
revoke all on function public.newsroom_mesa_version_refs_v2() from public,anon,authenticated,service_role;
create trigger newsroom_mesa_version_refs_v2 after insert on public.newsroom_mesa_material_versions
  for each row execute function public.newsroom_mesa_version_refs_v2();

-- Base read: preserves explicit entry.articlePosition and output.sourceArticlePosition.
create function public.newsroom_mesa_base_material_v2(p_key text)
returns table(title text,source_refs jsonb,article_ids uuid[])
language plpgsql security definer set search_path = '' as $function$
declare v_id uuid; v_manifest jsonb; v_group integer; v_refs jsonb; v_articles uuid[]; v_title text; v_ambiguous integer;
begin
  if p_key ~* '^dossier:[0-9a-f-]{36}$' then
    v_id := split_part(p_key,':',2)::uuid;
    select d.title into v_title from public.newsroom_editorial_dossiers d where d.id=v_id;
    if not found then raise exception 'mesa-material-not-found'; end if;
    select coalesce(jsonb_agg(jsonb_build_object('newsroomArticleId',s.newsroom_article_id,'newsroomSnapshotId',s.newsroom_snapshot_id)),'[]'::jsonb)
      into v_refs from public.newsroom_editorial_dossier_sources s where s.dossier_id=v_id and s.included;
    select coalesce(array_agg(distinct a.id order by a.id),'{}'::uuid[]) into v_articles
      from public.newsroom_editorial_dossier_article_plans p join public.editorial_articles a on a.id=p.editorial_article_id
      where p.dossier_id=v_id and a.status='published';
    if cardinality(v_articles)=0 or exists(select 1 from public.newsroom_mesa_production_contexts c where c.dossier_id=v_id) then
      raise exception 'mesa-material-not-published'; end if;
  elsif p_key ~* '^package:[0-9a-f-]{36}:([1-9]|[12][0-9]|30)$' then
    v_id:=split_part(p_key,':',2)::uuid; v_group:=split_part(p_key,':',3)::integer;
    select p.manifest into v_manifest from public.newsroom_editorial_source_packages p where p.id=v_id;
    if not found then raise exception 'mesa-material-not-found'; end if;
    with entries as (
      select e, ord::integer entry_order,
        case when coalesce(e->>'position','') ~ '^[1-9][0-9]{0,5}$' then (e->>'position')::integer else ord::integer end source_position
      from jsonb_array_elements(v_manifest->'entries') with ordinality as item(e,ord)
      where e->>'articlePosition'=v_group::text and e->>'status'='prepared'
        and coalesce(e->>'newsroomArticleId','') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        and coalesce(e->>'newsroomSnapshotId','') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    ), usage as (
      select e,source_position,entry_order,a.id article_id from entries cross join lateral (
        select o->>'publishedArticleId' id from jsonb_array_elements(case when jsonb_typeof(v_manifest->'outputs')='array' then v_manifest->'outputs' else '[]'::jsonb end) o
          where o->>'sourceArticlePosition'=v_group::text and nullif(o->>'usedAt','') is not null
        union select e->>'publishedArticleId' where nullif(e->>'usedAt','') is not null
      ) proof join public.editorial_articles a on a.id::text=lower(proof.id) and a.status='published'
    ), ambiguous as (
      select lower(e->>'newsroomArticleId') article_id,source_position
      from usage group by lower(e->>'newsroomArticleId'),source_position
      having count(distinct lower(e->>'newsroomSnapshotId'))>1
    ), ranked as (
      select e,source_position,entry_order,
        row_number() over(partition by lower(e->>'newsroomArticleId') order by source_position desc,entry_order desc) source_rank
      from usage
    ) select (select u.e->>'title' from usage u order by u.entry_order limit 1),
      coalesce((select jsonb_agg(jsonb_build_object('newsroomArticleId',r.e->>'newsroomArticleId','newsroomSnapshotId',r.e->>'newsroomSnapshotId')
        order by lower(r.e->>'newsroomArticleId')) from ranked r where r.source_rank=1),'[]'::jsonb),
      coalesce((select array_agg(distinct u.article_id order by u.article_id) from usage u),'{}'::uuid[]),
      (select count(*)::integer from ambiguous)
      into v_title,v_refs,v_articles,v_ambiguous;
    if v_ambiguous>0 then raise exception 'mesa-material-version-conflict'; end if;
  else raise exception 'mesa-material-key-invalid'; end if;
  v_refs:=public.newsroom_mesa_normalize_refs_v2(v_refs);
  if jsonb_array_length(v_refs)<2 then raise exception 'mesa-material-not-a-dossier'; end if;
  return query select coalesce(v_title,'Grupo editorial'),v_refs,v_articles;
end;
$function$;
revoke all on function public.newsroom_mesa_base_material_v2(text) from public,anon,authenticated,service_role;

-- Capturing an existing group is not consolidation. Existing publications/snapshots are only referenced.
create function public.newsroom_mesa_capture_material_v2(p_ref jsonb)
returns public.newsroom_mesa_material_versions language plpgsql security definer set search_path = '' as $function$
declare v_row public.newsroom_mesa_material_versions%rowtype; v_base record; v_expected jsonb; v_key text;
begin
  v_key:=lower(p_ref->>'key');
  v_expected:=public.newsroom_mesa_normalize_refs_v2(p_ref->'sources');
  if jsonb_array_length(v_expected)<2 then raise exception 'mesa-material-not-a-dossier'; end if;
  if nullif(p_ref->>'versionId','') is not null then
    select * into v_row from public.newsroom_mesa_material_versions v where v.id=(p_ref->>'versionId')::uuid and v.material_key=v_key;
    if not found or v_row.source_refs is distinct from v_expected then raise exception 'mesa-material-stale'; end if;
    return v_row;
  end if;
  select * into v_base from public.newsroom_mesa_base_material_v2(v_key);
  if v_base.source_refs is distinct from v_expected then raise exception 'mesa-material-stale'; end if;
  select * into v_row from public.newsroom_mesa_material_versions v where v.material_key=v_key
    and v.source_refs=v_base.source_refs and v.article_ids=v_base.article_ids and v.publication_event_id is null order by v.revision desc limit 1;
  if found then return v_row; end if;
  insert into public.newsroom_mesa_material_versions(material_key,title,source_refs,article_ids)
    values(v_key,v_base.title,v_base.source_refs,v_base.article_ids) returning * into v_row;
  return v_row;
end;
$function$;
revoke all on function public.newsroom_mesa_capture_material_v2(jsonb) from public,anon,authenticated,service_role;

create function public.newsroom_organize_theme_materials_v2(p_request_id uuid,p_theme_id uuid,p_title text,
  p_classification_key text,p_source_ids uuid[],p_material_refs jsonb)
returns table(theme_id uuid,added_count integer,reused boolean)
language plpgsql security definer set search_path = '' as $function$
declare v_payload jsonb; v_previous public.newsroom_mesa_organization_requests%rowtype;
  v_theme uuid; v_ref jsonb; v_version public.newsroom_mesa_material_versions%rowtype;
  v_ids uuid[]; v_id uuid; v_added integer:=0; v_existing uuid;
begin
  if p_request_id is null or p_source_ids is null or cardinality(p_source_ids)>200 or array_position(p_source_ids,null) is not null
    or p_material_refs is null or jsonb_typeof(p_material_refs)<>'array' or jsonb_array_length(p_material_refs)>50
    or cardinality(p_source_ids)+jsonb_array_length(p_material_refs)=0 then raise exception 'mesa-organization-invalid-input'; end if;
  if exists(select 1 from jsonb_array_elements(p_material_refs) r group by lower(r->>'key') having count(*)>1) then
    raise exception 'mesa-material-selection-invalid'; end if;
  -- Same lock as v1; update the existing guard before reading under stricter isolation levels.
  perform pg_advisory_xact_lock(hashtextextended('newsroom-mesa-organization-v1',0));
  update public.newsroom_mesa_containment_guard set revision=not revision where singleton;
  if not found then raise exception 'mesa-organization-containment-guard-missing'; end if;
  v_payload:=jsonb_build_object('v',2,'theme',p_theme_id,'title',case when p_theme_id is null then btrim(p_title) end,
    'classification',case when p_theme_id is null then p_classification_key end,'sources',p_source_ids,'materials',p_material_refs);
  select * into v_previous from public.newsroom_mesa_organization_requests r where r.request_id=p_request_id;
  if found then
    if v_previous.payload is distinct from v_payload then raise exception 'mesa-organization-request-conflict'; end if;
    return query select v_previous.theme_id,v_previous.added_count,true; return;
  end if;
  if p_theme_id is null then
    select t.id into v_theme from public.newsroom_create_editorial_theme_v1(btrim(p_title),p_classification_key) t;
  else
    select t.id into v_theme from public.newsroom_editorial_themes t where t.id=p_theme_id and t.status='open' for update;
    if not found then raise exception 'mesa-organization-theme-unavailable'; end if;
  end if;
  v_ids:=p_source_ids;
  for v_ref in select r from jsonb_array_elements(p_material_refs) r loop
    v_version:=public.newsroom_mesa_capture_material_v2(v_ref);
    select m.version_id into v_existing from public.newsroom_mesa_theme_materials m where m.theme_id=v_theme and m.material_key=v_version.material_key;
    if found and v_existing<>v_version.id then raise exception 'mesa-material-already-linked'; end if;
    insert into public.newsroom_mesa_theme_materials(theme_id,material_key,version_id)
      values(v_theme,v_version.material_key,v_version.id) on conflict do nothing;
    v_ids:=v_ids || array(select (r->>'newsroomArticleId')::uuid from jsonb_array_elements(v_version.source_refs) r);
  end loop;
  v_ids:=array(select distinct x from unnest(v_ids) x order by x);
  if cardinality(v_ids)>200 then raise exception 'mesa-organization-invalid-input'; end if;
  foreach v_id in array v_ids loop
    if not exists(select 1 from public.newsroom_editorial_theme_sources m where m.theme_id=v_theme and m.newsroom_article_id=v_id) then v_added:=v_added+1; end if;
    perform public.newsroom_set_editorial_theme_source_membership_v1(v_theme,v_id,true);
  end loop;
  insert into public.newsroom_mesa_organization_requests(request_id,payload,theme_id,added_count) values(p_request_id,v_payload,v_theme,v_added);
  return query select v_theme,v_added,false;
end;
$function$;
revoke all on function public.newsroom_organize_theme_materials_v2(uuid,uuid,text,text,uuid[],jsonb) from public,anon,authenticated,service_role;
grant execute on function public.newsroom_organize_theme_materials_v2(uuid,uuid,text,text,uuid[],jsonb) to service_role;

-- A whole-Dossier association protects its members without copying other Themes.
create function public.newsroom_mesa_protect_material_source_v2()
returns trigger language plpgsql security definer set search_path = '' as $function$
begin
  if exists(select 1 from public.newsroom_mesa_theme_materials m join public.newsroom_mesa_version_source_refs s on s.version_id=m.version_id
    where m.theme_id=old.theme_id and s.newsroom_article_id=old.newsroom_article_id) then raise exception 'mesa-organization-source-in-dossier'; end if;
  return old;
end;
$function$;
revoke all on function public.newsroom_mesa_protect_material_source_v2() from public,anon,authenticated,service_role;
create trigger newsroom_mesa_protect_material_source_v2 before delete on public.newsroom_editorial_theme_sources
  for each row execute function public.newsroom_mesa_protect_material_source_v2();

-- The exact frozen selection goes to the EXISTING preparation engine. No plans are manufactured here.
create function public.newsroom_prepare_mesa_materials_v2(p_preparation_key uuid,p_theme_id uuid,p_title text,
  p_source_refs jsonb,p_material_refs jsonb)
returns table(dossier_id uuid,preparation_action text,source_count integer,published_context_count integer,image_count integer)
language plpgsql security definer set search_path = '' as $function$
declare v_payload jsonb; v_existing public.newsroom_mesa_production_contexts%rowtype; v_result record;
  v_ref jsonb; v_version public.newsroom_mesa_material_versions%rowtype; v_refs jsonb; v_materials jsonb:='[]'::jsonb; v_id uuid; v_context_ids uuid[]:='{}'::uuid[];
begin
  if p_preparation_key is null or nullif(btrim(p_title),'') is null or length(btrim(p_title))>180
    or p_material_refs is null or jsonb_typeof(p_material_refs)<>'array' or jsonb_array_length(p_material_refs)>50 then
    raise exception 'mesa-material-selection-invalid'; end if;
  if exists(select 1 from jsonb_array_elements(p_material_refs) r group by lower(r->>'key') having count(*)>1) then
    raise exception 'mesa-material-selection-invalid'; end if;
  perform pg_advisory_xact_lock(hashtextextended('newsroom-mesa-organization-v1',0));
  update public.newsroom_mesa_containment_guard set revision=not revision where singleton;
  if not found then raise exception 'mesa-organization-containment-guard-missing'; end if;
  v_payload:=jsonb_build_object('theme',p_theme_id,'title',btrim(p_title),'sources',p_source_refs,'materials',p_material_refs);
  select * into v_existing from public.newsroom_mesa_production_contexts c where c.preparation_key=p_preparation_key;
  if found then
    if v_existing.selection_payload is distinct from v_payload then raise exception 'mesa-material-preparation-conflict'; end if;
    -- No new sources, origin links or Theme memberships on retry.
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
    v_materials:=v_materials || jsonb_build_array(jsonb_build_object('key',v_version.material_key,'versionId',v_version.id,'sources',v_version.source_refs));
  end loop;
  v_refs:=public.newsroom_mesa_normalize_refs_v2(v_refs);
  v_context_ids:=array(select distinct a from unnest(v_context_ids) a order by a);
  if cardinality(v_context_ids)>20 then raise exception 'mesa-material-context-limit'; end if;
  if exists(select 1 from unnest(v_context_ids) requested(id) where not exists(
      select 1 from public.editorial_articles a where a.id=requested.id and a.status='published')) then
    raise exception 'mesa-material-context-unavailable'; end if;
  if jsonb_array_length(v_refs)<1 or jsonb_array_length(v_refs)>20 then raise exception 'mesa-material-selection-invalid'; end if;
  if exists(select 1 from jsonb_array_elements(v_refs) r where not exists(
    select 1 from public.newsroom_editorial_article_classifications c where c.newsroom_article_id=(r->>'newsroomArticleId')::uuid)) then
    raise exception 'mesa-material-classification-required'; end if;
  select * into v_result from public.newsroom_prepare_editorial_dossier_workspace_v1(p_preparation_key,btrim(p_title),
    array(select (r->>'newsroomArticleId')::uuid from jsonb_array_elements(v_refs) r),
    array(select (r->>'newsroomSnapshotId')::uuid from jsonb_array_elements(v_refs) r),v_context_ids);
  insert into public.newsroom_mesa_production_contexts(dossier_id,theme_id,preparation_key,selection_payload,source_refs,material_refs)
    values(v_result.dossier_id,p_theme_id,p_preparation_key,v_payload,v_refs,v_materials);
  if p_theme_id is not null then
    for v_id in select (r->>'newsroomArticleId')::uuid from jsonb_array_elements(v_refs) r loop
      perform public.newsroom_set_editorial_theme_source_membership_v1(p_theme_id,v_id,true);
    end loop;
  end if;
  return query select v_result.dossier_id,v_result.preparation_action,v_result.source_count,v_result.published_context_count,v_result.image_count;
end;
$function$;
revoke all on function public.newsroom_prepare_mesa_materials_v2(uuid,uuid,text,jsonb,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.newsroom_prepare_mesa_materials_v2(uuid,uuid,text,jsonb,jsonb) to service_role;

-- Publication is authoritative only after every active output has a canonical published article.
-- Runs in the publishing transaction, deferred until all statements have succeeded.
-- No context row means a pre-v2 production: it is never reinterpreted or consolidated here.
create function public.newsroom_mesa_consolidate_publication_v2(p_dossier_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $function$
declare v_context public.newsroom_mesa_production_contexts%rowtype;
  v_refs jsonb; v_articles uuid[]; v_payload jsonb; v_fingerprint text; v_event uuid;
  v_ref jsonb; v_origin public.newsroom_mesa_material_versions%rowtype;
  v_version uuid; v_own_version uuid; v_title text; v_history_articles uuid[];
begin
  if not exists(select 1 from public.newsroom_mesa_production_contexts c where c.dossier_id=p_dossier_id) then return false; end if;
  perform pg_advisory_xact_lock(hashtextextended('newsroom-mesa-organization-v1',0));
  update public.newsroom_mesa_containment_guard set revision=not revision where singleton;
  if not found then raise exception 'mesa-organization-containment-guard-missing'; end if;
  select * into v_context from public.newsroom_mesa_production_contexts c where c.dossier_id=p_dossier_id;
  if not exists(select 1 from public.newsroom_editorial_dossier_article_plans p
      where p.dossier_id=p_dossier_id and p.status<>'cancelled') then return false; end if;
  if exists(select 1 from public.newsroom_editorial_dossier_article_plans p
      left join public.editorial_articles a on a.id=p.editorial_article_id
      where p.dossier_id=p_dossier_id and p.status<>'cancelled' and (a.id is null or a.status<>'published')) then return false; end if;
  -- Existing plan assignments prove usage. No new/manual assignment workflow is introduced.
  select public.newsroom_mesa_normalize_refs_v2(coalesce(jsonb_agg(jsonb_build_object(
    'newsroomArticleId',s.newsroom_article_id,'newsroomSnapshotId',s.newsroom_snapshot_id)),'[]'::jsonb))
    into v_refs
    from public.newsroom_editorial_dossier_article_plans p
    join public.newsroom_editorial_dossier_article_plan_sources x on x.article_plan_id=p.id and x.dossier_id=p.dossier_id
    join public.newsroom_editorial_dossier_sources s on s.id=x.dossier_source_id and s.dossier_id=x.dossier_id
    where p.dossier_id=p_dossier_id and p.status<>'cancelled' and s.included;
  -- Partial usage, or an explicitly edited production, must not claim the original whole selection.
  if v_refs is distinct from v_context.source_refs then return false; end if;
  select array_agg(distinct p.editorial_article_id order by p.editorial_article_id) into v_articles
    from public.newsroom_editorial_dossier_article_plans p where p.dossier_id=p_dossier_id and p.status<>'cancelled';
  v_payload:=jsonb_build_object('sources',v_refs,'articles',to_jsonb(v_articles),'materials',v_context.material_refs);
  v_fingerprint:=md5(v_payload::text);
  select e.id into v_event from public.newsroom_mesa_publication_events e
    where e.dossier_id=p_dossier_id and e.fingerprint=v_fingerprint;
  if found then
    if (select e.payload from public.newsroom_mesa_publication_events e where e.id=v_event) is distinct from v_payload then
      raise exception 'mesa-material-publication-fingerprint-conflict'; end if;
    return false;
  end if;
  insert into public.newsroom_mesa_publication_events(dossier_id,fingerprint,payload)
    values(p_dossier_id,v_fingerprint,v_payload) returning id into v_event;
  select d.title into v_title from public.newsroom_editorial_dossiers d where d.id=p_dossier_id;
  -- Keep original native sources, plans, snapshots, articles, images and package manifests byte-for-byte.
  -- Editorial consolidation is an immutable reference revision, not an overwrite of a prepared production.
  if jsonb_array_length(v_refs)>=2 then
    select array(select distinct a from (
      select unnest(v_articles) a
      union all
      select unnest(v.article_ids) from jsonb_array_elements(v_context.material_refs) r
        join public.newsroom_mesa_material_versions v on v.id=(r->>'versionId')::uuid and v.material_key=r->>'key'
    ) history order by a) into v_history_articles;
    insert into public.newsroom_mesa_material_versions(material_key,title,source_refs,article_ids,production_dossier_id,publication_event_id)
      values('dossier:'||p_dossier_id::text,v_title,v_refs,v_history_articles,p_dossier_id,v_event) returning id into v_own_version;
    for v_ref in select r from jsonb_array_elements(v_context.material_refs) r loop
      select * into strict v_origin from public.newsroom_mesa_material_versions v
        where v.id=(v_ref->>'versionId')::uuid and v.material_key=v_ref->>'key';
      if v_origin.material_key='dossier:'||p_dossier_id::text then raise exception 'mesa-material-recursive-origin'; end if;
      -- Parent is the explicitly captured version, never the latest revision from another Theme.
      insert into public.newsroom_mesa_material_versions(material_key,title,source_refs,article_ids,parent_version_id,
          production_dossier_id,publication_event_id)
        values(v_origin.material_key,v_origin.title,v_refs,v_history_articles,v_origin.id,p_dossier_id,v_event)
        returning id into v_version;
      -- Only the publishing Theme can advance. Compare-and-set preserves intervening explicit selections.
      update public.newsroom_mesa_theme_materials m set version_id=v_version
        where m.theme_id=v_context.theme_id and m.material_key=v_origin.material_key and m.version_id=v_origin.id;
    end loop;
    if v_context.theme_id is not null then
      insert into public.newsroom_mesa_theme_materials(theme_id,material_key,version_id)
        values(v_context.theme_id,'dossier:'||p_dossier_id::text,v_own_version)
        on conflict on constraint newsroom_mesa_theme_materials_pkey do nothing;
    end if;
  end if;
  if v_context.theme_id is not null then
    -- No membership lookup through a shared Dossier or through another Theme.
    insert into public.newsroom_editorial_theme_articles(theme_id,editorial_article_id)
      select v_context.theme_id,a from unnest(v_articles) a on conflict(theme_id,editorial_article_id) do nothing;
  end if;
  return true;
end;
$function$;
revoke all on function public.newsroom_mesa_consolidate_publication_v2(uuid) from public,anon,authenticated,service_role;

create function public.newsroom_mesa_after_article_publication_v2()
returns trigger language plpgsql security definer set search_path = '' as $function$
declare v_dossier uuid;
begin
  -- Read canonical final state, not a stale NEW.status from an earlier statement in the transaction.
  if not exists(select 1 from public.editorial_articles a where a.id=new.id and a.status='published') then return null; end if;
  for v_dossier in select distinct p.dossier_id from public.newsroom_editorial_dossier_article_plans p
    join public.newsroom_mesa_production_contexts c on c.dossier_id=p.dossier_id where p.editorial_article_id=new.id loop
    perform public.newsroom_mesa_consolidate_publication_v2(v_dossier);
  end loop;
  return null;
end;
$function$;
revoke all on function public.newsroom_mesa_after_article_publication_v2() from public,anon,authenticated,service_role;
create constraint trigger newsroom_mesa_after_article_publication_v2 after insert or update on public.editorial_articles
  deferrable initially deferred for each row execute function public.newsroom_mesa_after_article_publication_v2();

-- Also handles linking a canonically published output, cancelling a pending plan or changing assignments.
create function public.newsroom_mesa_after_plan_publication_v2()
returns trigger language plpgsql security definer set search_path = '' as $function$
begin
  if tg_op<>'DELETE' then perform public.newsroom_mesa_consolidate_publication_v2(new.dossier_id); end if;
  if tg_op='DELETE' or (tg_op='UPDATE' and old.dossier_id is distinct from new.dossier_id) then
    perform public.newsroom_mesa_consolidate_publication_v2(old.dossier_id); end if;
  return null;
end;
$function$;
revoke all on function public.newsroom_mesa_after_plan_publication_v2() from public,anon,authenticated,service_role;
create constraint trigger newsroom_mesa_after_plan_publication_v2 after insert or update or delete
  on public.newsroom_editorial_dossier_article_plans deferrable initially deferred
  for each row execute function public.newsroom_mesa_after_plan_publication_v2();
create constraint trigger newsroom_mesa_after_assignment_publication_v2 after insert or update or delete
  on public.newsroom_editorial_dossier_article_plan_sources deferrable initially deferred
  for each row execute function public.newsroom_mesa_after_plan_publication_v2();

comment on table public.newsroom_mesa_material_versions is
  'Immutable editorial source-group revisions. Prepared productions and original material remain unchanged.';
comment on table public.newsroom_mesa_theme_materials is
  'Many-to-many Theme/material links, pinned independently to an exact immutable version.';
comment on table public.newsroom_mesa_production_contexts is
  'Explicit v2 preparation selection; only these productions participate in post-publication consolidation.';
notify pgrst, 'reload schema';
commit;
