\set ON_ERROR_STOP on

-- Run on the disposable PostgreSQL 17 copy after
-- 20260912152810_mesa_production_workspace_v2_provenance.sql and before the
-- shared-output-scope migration. Seeds one historical exclusive-origin row so
-- the paired postflight can prove that the forward migration performs no
-- historical backfill or reinterpretation.

create schema if not exists validation;
create table if not exists validation.ids(key text primary key, value uuid not null);

insert into public.newsroom_articles(
  id,source_code,original_url,normalized_url,title,processing_status,
  detected_at,first_detected_at,last_detected_at
) values
  ('10000000-0000-4000-8000-000000000001','fixture','https://example.test/source-1','https://example.test/source-1','Fonte histórica preparada','ready_for_review',now(),now(),now()),
  ('10000000-0000-4000-8000-000000000002','fixture','https://example.test/source-2','https://example.test/source-2','Fonte v2 A','ready_for_review',now(),now(),now()),
  ('10000000-0000-4000-8000-000000000003','fixture','https://example.test/source-3','https://example.test/source-3','Fonte v2 B','ready_for_review',now(),now(),now()),
  ('10000000-0000-4000-8000-000000000004','fixture','https://example.test/source-4','https://example.test/source-4','Fonte externa','ready_for_review',now(),now(),now())
on conflict (id) do nothing;

insert into public.newsroom_article_snapshots(
  id,article_id,content_hash,body,source_metadata,extracted_at
) values
  ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','shared-hash-1','[{"text":"Corpo histórico"}]','{}',now()),
  ('20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002','shared-hash-2','[{"text":"Corpo A"}]','{}',now()),
  ('20000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000003','shared-hash-3','[{"text":"Corpo B"}]','{}',now()),
  ('20000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000004','shared-hash-4','[{"text":"Corpo externo"}]','{}',now())
on conflict (id) do nothing;

insert into public.newsroom_editorial_article_classifications(
  newsroom_article_id,classification_key,classification_source
)
select id,'sporting','manual' from public.newsroom_articles
where id in (
  '10000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000002',
  '10000000-0000-4000-8000-000000000003',
  '10000000-0000-4000-8000-000000000004'
)
on conflict (newsroom_article_id) do nothing;

with prepared as (
  select dossier_id
  from public.newsroom_prepare_mesa_materials_v2(
    '70000000-0000-4000-8000-000000000001',null,
    'Workspace histórico de origem exclusiva',
    jsonb_build_array(jsonb_build_object(
      'newsroomArticleId','10000000-0000-4000-8000-000000000001',
      'newsroomSnapshotId','20000000-0000-4000-8000-000000000001'
    )),'[]'::jsonb
  )
)
insert into validation.ids(key,value)
select 'historical_workspace',dossier_id from prepared
where not exists(select 1 from validation.ids where key='historical_workspace');

do $preflight$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema='public'
      and table_name='newsroom_mesa_output_publications'
      and column_name='source_scope'
  ) then
    raise exception 'shared-output-scope-preflight-column-unexpected';
  end if;
end;
$preflight$;

insert into public.newsroom_editorial_dossier_article_plans(
  id,dossier_id,working_title,status,sort_order,article_kind,length_mode,
  editorial_instructions,destination,image_choice
) values (
  '71000000-0000-4000-8000-000000000001',
  (select value from validation.ids where key='historical_workspace'),
  'Output histórico exclusivo','ready',1,'news','standard','',
  'new','unselected'
);

insert into public.newsroom_mesa_output_origins(
  dossier_id,article_plan_id,origin_kind,origin_dossier_source_id
)
select
  s.dossier_id,'71000000-0000-4000-8000-000000000001','source',s.id
from public.newsroom_editorial_dossier_sources s
where s.dossier_id=(select value from validation.ids where key='historical_workspace');

insert into public.newsroom_editorial_source_packages(
  id,package_year,package_month,manifest,markdown
) values (
  '72000000-0000-4000-8000-000000000001','2026','09',
  jsonb_build_object(
    'version','2',
    'packageId','72000000-0000-4000-8000-000000000001',
    'year','2026',
    'month','09',
    'entries','[]'::jsonb
  ),
  '# Pacote histórico exclusivo'
);

insert into public.editorial_articles(
  id,status,scope,author,label,title,subtitle,body,slug,image_url,published_at
) values (
  '73000000-0000-4000-8000-000000000001','published','matchday','Jornada',
  'Notícia','Artigo histórico','Subtítulo histórico','Corpo histórico',
  'artigo-historico-exclusivo','https://example.test/historical.jpg',now()
);

insert into public.newsroom_mesa_output_publications(
  dossier_id,article_plan_id,package_id,editorial_article_id,origin_kind,
  origin_dossier_source_id,material_key,material_version_id,fingerprint,payload
)
select
  s.dossier_id,
  '71000000-0000-4000-8000-000000000001',
  '72000000-0000-4000-8000-000000000001',
  '73000000-0000-4000-8000-000000000001',
  'source',s.id,null,null,'historical-exclusive-fingerprint',
  jsonb_build_object('contractVersion',1,'originKind','source')
from public.newsroom_editorial_dossier_sources s
where s.dossier_id=(select value from validation.ids where key='historical_workspace');

insert into validation.ids(key,value)
select 'historical_output_source',s.id
from public.newsroom_editorial_dossier_sources s
where s.dossier_id=(select value from validation.ids where key='historical_workspace');

do $assert$
begin
  if not exists (
    select 1
    from public.newsroom_mesa_output_publications p
    where p.article_plan_id='71000000-0000-4000-8000-000000000001'
      and p.origin_kind='source'
      and p.origin_dossier_source_id=(
        select value from validation.ids where key='historical_output_source'
      )
      and p.material_key is null
      and p.material_version_id is null
  ) then
    raise exception 'shared-output-scope-historical-fixture-invalid';
  end if;
end;
$assert$;

select 'mesa-shared-output-scope-v2-preflight-ok' as result;
