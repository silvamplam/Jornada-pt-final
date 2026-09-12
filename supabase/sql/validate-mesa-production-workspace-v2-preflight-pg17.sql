\set ON_ERROR_STOP on

-- Run only on a disposable PostgreSQL 17 database after migrations through
-- 20260912004733_jornada_dossie_producao_sem_limite.sql. This intentionally
-- seeds pre-migration state for the paired postflight script.

create schema validation;
create table validation.ids(key text primary key, value uuid not null);

do $preflight$
begin
  if to_regclass('public.newsroom_mesa_output_origins') is not null
    or to_regclass('public.newsroom_mesa_output_publications') is not null
    or to_regclass('public.newsroom_mesa_output_source_usage') is not null then
    raise exception 'preflight-new-tables-unexpected';
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='newsroom_mesa_production_contexts'
      and column_name in ('workspace_role','workspace_contract_version','workspace_state','abandoned_at','consolidated_at','abandonment_snapshot')
  ) then raise exception 'preflight-new-columns-unexpected'; end if;
  if to_regprocedure('public.newsroom_prepare_mesa_materials_v2(uuid,uuid,text,jsonb,jsonb)') is null then
    raise exception 'preflight-old-prepare-missing';
  end if;
end;
$preflight$;

insert into public.newsroom_articles(
  id,source_code,original_url,normalized_url,title,processing_status,
  detected_at,first_detected_at,last_detected_at
) values
  ('10000000-0000-4000-8000-000000000001','fixture','https://example.test/source-1','https://example.test/source-1','Fonte histórica preparada','ready_for_review',now(),now(),now()),
  ('10000000-0000-4000-8000-000000000002','fixture','https://example.test/source-2','https://example.test/source-2','Fonte v2 A','ready_for_review',now(),now(),now()),
  ('10000000-0000-4000-8000-000000000003','fixture','https://example.test/source-3','https://example.test/source-3','Fonte v2 B','ready_for_review',now(),now(),now()),
  ('10000000-0000-4000-8000-000000000004','fixture','https://example.test/source-4','https://example.test/source-4','Fonte externa','ready_for_review',now(),now(),now());

insert into public.newsroom_article_snapshots(
  id,article_id,content_hash,body,source_metadata,extracted_at
) values
  ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','hash-1','[{"text":"Corpo histÃ³rico"}]','{}',now()),
  ('20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002','hash-2','[{"text":"Corpo A"}]','{}',now()),
  ('20000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000003','hash-3','[{"text":"Corpo B"}]','{}',now()),
  ('20000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000004','hash-4','[{"text":"Corpo externo"}]','{}',now());

insert into public.newsroom_editorial_article_classifications(
  newsroom_article_id,classification_key,classification_source
) select id,'sporting','manual' from public.newsroom_articles;

insert into public.newsroom_editorial_themes(id,title,classification_key,status)
values ('30000000-0000-4000-8000-000000000001','Tema histÃ³rico','sporting','open');

with prepared as (
  select dossier_id
  from public.newsroom_prepare_mesa_materials_v2(
    '40000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000001',
    'ProduÃ§Ã£o histÃ³rica sem publicaÃ§Ã£o',
    jsonb_build_array(jsonb_build_object(
      'newsroomArticleId','10000000-0000-4000-8000-000000000001',
      'newsroomSnapshotId','20000000-0000-4000-8000-000000000001'
    )),
    '[]'::jsonb
  )
)
insert into validation.ids(key,value)
select 'historical_workspace',dossier_id from prepared;

insert into public.newsroom_editorial_dossiers(
  id,title,status,editorial_instructions,context_instructions,output_mode,output_count,
  length_mode,article_kind,output_language,preparation_key
) values (
  '50000000-0000-4000-8000-000000000001','DossiÃª editorial legÃ­timo','completed','','',
  'single',1,'standard','news','pt-PT','60000000-0000-4000-8000-000000000001'
);
insert into public.newsroom_editorial_theme_dossiers(dossier_id,theme_id)
values ('50000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001');

do $assert$
declare v_historical uuid;
begin
  select value into strict v_historical from validation.ids where key='historical_workspace';
  if not exists (
    select 1 from public.newsroom_mesa_production_contexts c
    where c.dossier_id=v_historical and c.preparation_key='40000000-0000-4000-8000-000000000001'
  ) then raise exception 'preflight-historical-context-missing'; end if;
  if not exists (
    select 1 from public.newsroom_editorial_theme_sources s
    where s.theme_id='30000000-0000-4000-8000-000000000001'
      and s.newsroom_article_id='10000000-0000-4000-8000-000000000001'
  ) then raise exception 'preflight-old-theme-side-effect-missing'; end if;
  if not exists (
    select 1 from public.newsroom_editorial_theme_dossiers d
    where d.dossier_id='50000000-0000-4000-8000-000000000001'
  ) then raise exception 'preflight-legitimate-dossier-missing'; end if;
end;
$assert$;

select 'preflight-ok' as result;
