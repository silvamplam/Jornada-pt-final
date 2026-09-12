\set ON_ERROR_STOP on

-- Run only on the same disposable PostgreSQL 17 database used by the paired
-- preflight script, immediately after applying
-- 20260912152810_mesa_production_workspace_v2_provenance.sql.

do $schema_assert$
declare v_missing text[];
begin
  select array_agg(required.name order by required.name) into v_missing
  from (values
    ('workspace_role'),('workspace_contract_version'),('workspace_state'),
    ('abandoned_at'),('consolidated_at'),('abandonment_snapshot')
  ) required(name)
  where not exists (
    select 1 from information_schema.columns c
    where c.table_schema='public' and c.table_name='newsroom_mesa_production_contexts'
      and c.column_name=required.name
  );
  if v_missing is not null then raise exception 'postflight-columns-missing:%',v_missing; end if;
  if to_regclass('public.newsroom_mesa_output_origins') is null
    or to_regclass('public.newsroom_mesa_output_publications') is null
    or to_regclass('public.newsroom_mesa_output_source_usage') is null
    or to_regprocedure('public.newsroom_publish_mesa_output_v2(uuid,uuid,uuid,uuid[],jsonb)') is null
    or to_regprocedure('public.newsroom_abandon_mesa_production_v2(uuid)') is null then
    raise exception 'postflight-objects-missing';
  end if;
  if exists (
    select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public'
      and c.relname in ('newsroom_mesa_output_origins','newsroom_mesa_output_publications','newsroom_mesa_output_source_usage')
      and (not c.relrowsecurity or not c.relforcerowsecurity)
  ) then raise exception 'postflight-rls-not-forced'; end if;
  if not has_function_privilege('service_role','public.newsroom_publish_mesa_output_v2(uuid,uuid,uuid,uuid[],jsonb)','EXECUTE')
    or has_function_privilege('anon','public.newsroom_publish_mesa_output_v2(uuid,uuid,uuid,uuid[],jsonb)','EXECUTE')
    or has_function_privilege('authenticated','public.newsroom_publish_mesa_output_v2(uuid,uuid,uuid,uuid[],jsonb)','EXECUTE') then
    raise exception 'postflight-publication-privileges-invalid';
  end if;
end;
$schema_assert$;

do $history_assert$
declare v_historical uuid;
begin
  select value into strict v_historical from validation.ids where key='historical_workspace';
  if not exists (
    select 1 from public.newsroom_mesa_production_contexts c
    where c.dossier_id=v_historical and c.workspace_role is null
      and c.workspace_contract_version is null and c.workspace_state is null
      and c.abandoned_at is null and c.consolidated_at is null and c.abandonment_snapshot is null
  ) then raise exception 'postflight-history-reinterpreted'; end if;
  if not exists (
    select 1 from public.newsroom_editorial_theme_dossiers td
    join public.newsroom_editorial_dossiers d on d.id=td.dossier_id
    where d.id='50000000-0000-4000-8000-000000000001'
      and d.preparation_key='60000000-0000-4000-8000-000000000001'
      and d.status='completed'
  ) then raise exception 'postflight-preparation-key-reinterpreted'; end if;
end;
$history_assert$;

insert into public.newsroom_editorial_themes(id,title,classification_key,status)
values
  ('30000000-0000-4000-8000-000000000002','Tema independente','sporting','open'),
  ('30000000-0000-4000-8000-000000000003','Tema de publicaÃ§Ã£o v2','sporting','open'),
  ('30000000-0000-4000-8000-000000000004','Tema material A','sporting','open'),
  ('30000000-0000-4000-8000-000000000005','Tema material B','sporting','open');

select public.newsroom_set_editorial_theme_source_membership_v1(
  '30000000-0000-4000-8000-000000000002',
  '10000000-0000-4000-8000-000000000001',
  true
);

do $abandon_preview$
declare v_historical uuid; v_preview record;
begin
  select value into strict v_historical from validation.ids where key='historical_workspace';
  select * into strict v_preview from public.newsroom_preview_abandon_mesa_production_v2(v_historical);
  if v_preview.publication_count<>0 or v_preview.source_count<>1
    or jsonb_array_length(v_preview.removable_theme_memberships)<>1 then
    raise exception 'postflight-abandon-preview-invalid:%',to_jsonb(v_preview);
  end if;
end;
$abandon_preview$;

do $abandon$
declare v_historical uuid; v_result record;
begin
  select value into strict v_historical from validation.ids where key='historical_workspace';
  select * into strict v_result from public.newsroom_abandon_mesa_production_v2(v_historical);
  if v_result.abandonment_action<>'abandoned' or v_result.restored_theme_membership_count<>1 then
    raise exception 'postflight-abandon-result-invalid'; end if;
  if not exists (
    select 1 from public.newsroom_mesa_production_contexts c
    where c.dossier_id=v_historical and c.workspace_role='technical'
      and c.workspace_contract_version is null and c.workspace_state='abandoned'
      and c.abandoned_at is not null and c.abandonment_snapshot is not null
  ) then raise exception 'postflight-abandon-state-invalid'; end if;
  if exists (
    select 1 from public.newsroom_editorial_theme_sources s
    where s.theme_id='30000000-0000-4000-8000-000000000001'
      and s.newsroom_article_id='10000000-0000-4000-8000-000000000001'
  ) then raise exception 'postflight-old-side-effect-not-restored'; end if;
  if not exists (
    select 1 from public.newsroom_editorial_theme_sources s
    where s.theme_id='30000000-0000-4000-8000-000000000002'
      and s.newsroom_article_id='10000000-0000-4000-8000-000000000001'
  ) then raise exception 'postflight-independent-theme-lost'; end if;
  if not exists (select 1 from public.newsroom_editorial_dossiers d where d.id=v_historical)
    or not exists (select 1 from public.newsroom_editorial_dossier_sources s where s.dossier_id=v_historical) then
    raise exception 'postflight-abandon-history-deleted'; end if;
  select * into strict v_result from public.newsroom_abandon_mesa_production_v2(v_historical);
  if v_result.abandonment_action<>'reused' or v_result.restored_theme_membership_count<>0 then
    raise exception 'postflight-abandon-not-idempotent'; end if;
end;
$abandon$;

insert into public.competitions(id,name,slug,status)
values ('a1000000-0000-4000-8000-000000000001','Liga','liga','active');
insert into public.seasons(id,competition_id,label,status)
values ('a2000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001','2026/27','active');
insert into public.matchdays(id,season_id,number,label,status)
values ('a3000000-0000-4000-8000-000000000001','a2000000-0000-4000-8000-000000000001',1,'Jornada 1','scheduled');

with prepared as (
  select dossier_id
  from public.newsroom_prepare_mesa_materials_v2(
    '41000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000003',
    'ProduÃ§Ã£o v2 fonte isolada',
    jsonb_build_array(
      jsonb_build_object('newsroomArticleId','10000000-0000-4000-8000-000000000002','newsroomSnapshotId','20000000-0000-4000-8000-000000000002'),
      jsonb_build_object('newsroomArticleId','10000000-0000-4000-8000-000000000003','newsroomSnapshotId','20000000-0000-4000-8000-000000000003')
    ),
    '[]'::jsonb
  )
)
insert into validation.ids(key,value)
select 'single_workspace',dossier_id from prepared;

insert into validation.ids(key,value)
select case s.newsroom_article_id
  when '10000000-0000-4000-8000-000000000002' then 'single_source_a'
  else 'single_source_b' end,
  s.id
from public.newsroom_editorial_dossier_sources s
where s.dossier_id=(select value from validation.ids where key='single_workspace');

do $prepare_assert$
declare v_workspace uuid;
begin
  select value into strict v_workspace from validation.ids where key='single_workspace';
  if not exists (
    select 1 from public.newsroom_mesa_production_contexts c
    where c.dossier_id=v_workspace and c.workspace_role='technical'
      and c.workspace_contract_version=2 and c.workspace_state='active'
      and c.selection_payload->>'contractVersion'='2'
  ) then raise exception 'postflight-v2-workspace-marker-invalid'; end if;
  if exists (
    select 1 from public.newsroom_editorial_theme_sources s
    where s.theme_id='30000000-0000-4000-8000-000000000003'
      and s.newsroom_article_id in (
        '10000000-0000-4000-8000-000000000002',
        '10000000-0000-4000-8000-000000000003'
      )
  ) then raise exception 'postflight-prepare-expanded-theme'; end if;
end;
$prepare_assert$;

insert into public.newsroom_editorial_dossier_article_plans(
  id,dossier_id,working_title,status,sort_order,article_kind,length_mode,editorial_instructions,
  destination,image_choice
) values (
  '81000000-0000-4000-8000-000000000001',
  (select value from validation.ids where key='single_workspace'),
  'Output tÃ©cnico 1','planned',1,'news','standard','','new','unselected'
);

-- The automatic assignment deliberately points to B; final AI provenance will use A.
insert into public.newsroom_editorial_dossier_article_plan_sources(
  dossier_id,article_plan_id,dossier_source_id,sort_order
) values (
  (select value from validation.ids where key='single_workspace'),
  '81000000-0000-4000-8000-000000000001',
  (select value from validation.ids where key='single_source_b'),1
);

select * from public.newsroom_set_mesa_output_origin_v2(
  (select value from validation.ids where key='single_workspace'),
  '81000000-0000-4000-8000-000000000001','source',
  (select value from validation.ids where key='single_source_a'),null,null
);

insert into public.newsroom_editorial_source_packages(
  id,package_year,package_month,manifest,markdown
) values (
  '71000000-0000-4000-8000-000000000001','2026','09',
  jsonb_build_object(
    'version',5,'provenanceContract','mesa-v2',
    'entries',jsonb_build_array(
      jsonb_build_object('status','prepared','provenanceSourceId',(select value from validation.ids where key='single_source_a'),'newsroomArticleId','10000000-0000-4000-8000-000000000002','newsroomSnapshotId','20000000-0000-4000-8000-000000000002'),
      jsonb_build_object('status','prepared','provenanceSourceId',(select value from validation.ids where key='single_source_b'),'newsroomArticleId','10000000-0000-4000-8000-000000000003','newsroomSnapshotId','20000000-0000-4000-8000-000000000003')
    ),
    'outputs',jsonb_build_array(jsonb_build_object(
      'outputId','81000000-0000-4000-8000-000000000001',
      'articlePlan',jsonb_build_object(
        'articlePlanId','81000000-0000-4000-8000-000000000001',
        'dossierId',(select value from validation.ids where key='single_workspace')
      )
    ))
  ),
  'fixture'
);

create function validation.fail_usage_insert()
returns trigger language plpgsql as $function$
begin raise exception 'validation-forced-usage-failure'; end;
$function$;
create trigger validation_fail_usage_insert
before insert on public.newsroom_mesa_output_source_usage
for each row execute function validation.fail_usage_insert();

do $forced_rollback$
declare v_workspace uuid; v_source uuid;
begin
  select value into strict v_workspace from validation.ids where key='single_workspace';
  select value into strict v_source from validation.ids where key='single_source_a';
  begin
    perform * from public.newsroom_publish_mesa_output_v2(
      v_workspace,'81000000-0000-4000-8000-000000000001','71000000-0000-4000-8000-000000000001',array[v_source],
      jsonb_build_object(
        'id','91000000-0000-4000-8000-000000000001','slug','artigo-v2-isolado','label','NotÃ­cia',
        'title','Artigo v2 isolado','subtitle','SubtÃ­tulo','body','Corpo publicado','imageUrl','https://example.test/image.jpg',
        'author','Jornada','publishedAt','2026-09-12T10:00:00+00:00','matchdayId','a3000000-0000-4000-8000-000000000001','mode','create'
      )
    );
    raise exception 'forced-rollback-did-not-fail';
  exception when others then
    if sqlerrm not like '%validation-forced-usage-failure%' then raise; end if;
  end;
  if exists(select 1 from public.editorial_articles where id='91000000-0000-4000-8000-000000000001')
    or exists(select 1 from public.newsroom_mesa_output_publications where article_plan_id='81000000-0000-4000-8000-000000000001')
    or exists(select 1 from public.newsroom_mesa_output_source_usage where article_plan_id='81000000-0000-4000-8000-000000000001')
    or exists(select 1 from public.newsroom_editorial_dossier_article_plans where id='81000000-0000-4000-8000-000000000001' and editorial_article_id is not null) then
    raise exception 'postflight-atomic-rollback-failed';
  end if;
end;
$forced_rollback$;

drop trigger validation_fail_usage_insert on public.newsroom_mesa_output_source_usage;
drop function validation.fail_usage_insert();

do $publish_create$
declare v_workspace uuid; v_source uuid; v_result record;
begin
  select value into strict v_workspace from validation.ids where key='single_workspace';
  select value into strict v_source from validation.ids where key='single_source_a';
  select * into strict v_result from public.newsroom_publish_mesa_output_v2(
    v_workspace,'81000000-0000-4000-8000-000000000001','71000000-0000-4000-8000-000000000001',array[v_source],
    jsonb_build_object(
      'id','91000000-0000-4000-8000-000000000001','slug','artigo-v2-isolado','label','NotÃ­cia',
      'title','Artigo v2 isolado','subtitle','SubtÃ­tulo','body','Corpo publicado','imageUrl','https://example.test/image.jpg',
      'author','Jornada','publishedAt','2026-09-12T10:00:00+00:00','matchdayId','a3000000-0000-4000-8000-000000000001','mode','create'
    )
  );
  if v_result.publication_action<>'created' or not v_result.consolidated then
    raise exception 'postflight-create-result-invalid:%',to_jsonb(v_result); end if;
  if not exists (
    select 1 from public.newsroom_mesa_output_source_usage u
    where u.article_plan_id='81000000-0000-4000-8000-000000000001'
      and u.dossier_source_id=v_source
      and u.newsroom_article_id='10000000-0000-4000-8000-000000000002'
      and u.newsroom_snapshot_id='20000000-0000-4000-8000-000000000002'
      and u.editorial_article_id='91000000-0000-4000-8000-000000000001'
  ) then raise exception 'postflight-final-provenance-resolution-invalid'; end if;
  if exists (
    select 1 from public.newsroom_mesa_output_source_usage u
    where u.article_plan_id='81000000-0000-4000-8000-000000000001'
      and u.dossier_source_id=(select value from validation.ids where key='single_source_b')
  ) then raise exception 'postflight-technical-assignment-used-as-proof'; end if;
  if exists (
    select 1 from public.newsroom_mesa_material_versions v
    where v.material_key='output:81000000-0000-4000-8000-000000000001'
  ) then raise exception 'postflight-single-source-became-dossier'; end if;
  if not exists (
    select 1 from public.newsroom_editorial_theme_articles a
    where a.theme_id='30000000-0000-4000-8000-000000000003'
      and a.editorial_article_id='91000000-0000-4000-8000-000000000001'
  ) then raise exception 'postflight-published-theme-article-missing'; end if;
end;
$publish_create$;

do $idempotency$
declare v_workspace uuid; v_source_a uuid; v_source_b uuid; v_result record;
begin
  select value into strict v_workspace from validation.ids where key='single_workspace';
  select value into strict v_source_a from validation.ids where key='single_source_a';
  select value into strict v_source_b from validation.ids where key='single_source_b';
  select * into strict v_result from public.newsroom_publish_mesa_output_v2(
    v_workspace,'81000000-0000-4000-8000-000000000001','71000000-0000-4000-8000-000000000001',array[v_source_a],
    jsonb_build_object(
      'id','91000000-0000-4000-8000-000000000001','slug','artigo-v2-isolado','label','NotÃ­cia',
      'title','Artigo v2 isolado','subtitle','SubtÃ­tulo','body','Corpo publicado','imageUrl','https://example.test/image.jpg',
      'author','Jornada','publishedAt','2026-09-12T10:00:00+00:00','matchdayId','a3000000-0000-4000-8000-000000000001','mode','create'
    )
  );
  if v_result.publication_action<>'reused' or not v_result.consolidated then
    raise exception 'postflight-exact-retry-not-idempotent'; end if;
  begin
    perform * from public.newsroom_publish_mesa_output_v2(
      v_workspace,'81000000-0000-4000-8000-000000000001','71000000-0000-4000-8000-000000000001',array[v_source_b],
      jsonb_build_object(
        'id','91000000-0000-4000-8000-000000000001','slug','artigo-v2-isolado','label','NotÃ­cia',
        'title','Artigo v2 isolado','subtitle','SubtÃ­tulo','body','Corpo publicado','imageUrl','https://example.test/image.jpg',
        'author','Jornada','publishedAt','2026-09-12T10:00:00+00:00','matchdayId','a3000000-0000-4000-8000-000000000001','mode','create'
      )
    );
    raise exception 'changed-provenance-not-blocked';
  exception when others then
    if sqlerrm not like '%mesa-publication-provenance-conflict%' then raise; end if;
  end;
end;
$idempotency$;

select 'postflight-core-ok' as result;

\set ON_ERROR_STOP on

-- Negative provenance validation: empty, duplicate, unknown and cross-workspace IDs.
with prepared as (
  select dossier_id
  from public.newsroom_prepare_mesa_materials_v2(
    '42000000-0000-4000-8000-000000000001',null,'Workspace externo',
    jsonb_build_array(jsonb_build_object(
      'newsroomArticleId','10000000-0000-4000-8000-000000000004',
      'newsroomSnapshotId','20000000-0000-4000-8000-000000000004'
    )),'[]'::jsonb
  )
)
insert into validation.ids(key,value)
select 'external_workspace',dossier_id from prepared;

insert into validation.ids(key,value)
select 'external_source',s.id
from public.newsroom_editorial_dossier_sources s
where s.dossier_id=(select value from validation.ids where key='external_workspace');

do $closed_validation$
declare
  v_workspace uuid;
  v_source_a uuid;
  v_external uuid;
  v_article jsonb:=jsonb_build_object(
    'id','91000000-0000-4000-8000-000000000001','slug','artigo-v2-isolado','label','Noticia',
    'title','Artigo v2 isolado','subtitle','Subtitulo','body','Corpo publicado',
    'imageUrl','https://example.test/image.jpg','author','Jornada',
    'publishedAt','2026-09-12T10:00:00+00:00',
    'matchdayId','a3000000-0000-4000-8000-000000000001','mode','create'
  );
begin
  select value into strict v_workspace from validation.ids where key='single_workspace';
  select value into strict v_source_a from validation.ids where key='single_source_a';
  select value into strict v_external from validation.ids where key='external_source';

  begin
    perform * from public.newsroom_publish_mesa_output_v2(
      v_workspace,'81000000-0000-4000-8000-000000000001',
      '71000000-0000-4000-8000-000000000001','{}'::uuid[],v_article);
    raise exception 'empty-provenance-not-blocked';
  exception when others then
    if sqlerrm not like '%mesa-publication-input-invalid%' then raise; end if;
  end;

  begin
    perform * from public.newsroom_publish_mesa_output_v2(
      v_workspace,'81000000-0000-4000-8000-000000000001',
      '71000000-0000-4000-8000-000000000001',array[v_source_a,v_source_a],v_article);
    raise exception 'duplicate-provenance-not-blocked';
  exception when others then
    if sqlerrm not like '%mesa-publication-input-invalid%' then raise; end if;
  end;

  begin
    perform * from public.newsroom_publish_mesa_output_v2(
      v_workspace,'81000000-0000-4000-8000-000000000001',
      '71000000-0000-4000-8000-000000000001',
      array['ffffffff-ffff-4fff-8fff-ffffffffffff'::uuid],v_article);
    raise exception 'unknown-provenance-not-blocked';
  exception when others then
    if sqlerrm not like '%mesa-publication-source-invalid%' then raise; end if;
  end;

  begin
    perform * from public.newsroom_publish_mesa_output_v2(
      v_workspace,'81000000-0000-4000-8000-000000000001',
      '71000000-0000-4000-8000-000000000001',array[v_external],v_article);
    raise exception 'cross-workspace-provenance-not-blocked';
  exception when others then
    if sqlerrm not like '%mesa-publication-source-invalid%' then raise; end if;
  end;
end;
$closed_validation$;

-- Two outputs from unrelated source nuclei share a workspace but never a Dossier.
with prepared as (
  select dossier_id
  from public.newsroom_prepare_mesa_materials_v2(
    '43000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000004','Workspace multiassunto',
    jsonb_build_array(
      jsonb_build_object('newsroomArticleId','10000000-0000-4000-8000-000000000002','newsroomSnapshotId','20000000-0000-4000-8000-000000000002'),
      jsonb_build_object('newsroomArticleId','10000000-0000-4000-8000-000000000003','newsroomSnapshotId','20000000-0000-4000-8000-000000000003')
    ),'[]'::jsonb
  )
)
insert into validation.ids(key,value)
select 'multi_workspace',dossier_id from prepared;

insert into validation.ids(key,value)
select case s.newsroom_article_id
  when '10000000-0000-4000-8000-000000000002' then 'multi_source_a'
  else 'multi_source_b' end,s.id
from public.newsroom_editorial_dossier_sources s
where s.dossier_id=(select value from validation.ids where key='multi_workspace');

insert into public.newsroom_editorial_dossier_article_plans(
  id,dossier_id,working_title,status,sort_order,article_kind,length_mode,
  editorial_instructions,destination,image_choice
) values
  ('82000000-0000-4000-8000-000000000001',(select value from validation.ids where key='multi_workspace'),'Nucleo A','planned',1,'news','standard','','new','unselected'),
  ('82000000-0000-4000-8000-000000000002',(select value from validation.ids where key='multi_workspace'),'Nucleo B','planned',2,'news','standard','','new','unselected');

select * from public.newsroom_set_mesa_output_origin_v2(
  (select value from validation.ids where key='multi_workspace'),
  '82000000-0000-4000-8000-000000000001','source',
  (select value from validation.ids where key='multi_source_a'),null,null
);
select * from public.newsroom_set_mesa_output_origin_v2(
  (select value from validation.ids where key='multi_workspace'),
  '82000000-0000-4000-8000-000000000002','source',
  (select value from validation.ids where key='multi_source_b'),null,null
);

insert into public.newsroom_editorial_source_packages(id,package_year,package_month,manifest,markdown)
values (
  '72000000-0000-4000-8000-000000000001','2026','09',
  jsonb_build_object(
    'version',5,'provenanceContract','mesa-v2',
    'entries',jsonb_build_array(
      jsonb_build_object('status','prepared','provenanceSourceId',(select value from validation.ids where key='multi_source_a'),'newsroomArticleId','10000000-0000-4000-8000-000000000002','newsroomSnapshotId','20000000-0000-4000-8000-000000000002'),
      jsonb_build_object('status','prepared','provenanceSourceId',(select value from validation.ids where key='multi_source_b'),'newsroomArticleId','10000000-0000-4000-8000-000000000003','newsroomSnapshotId','20000000-0000-4000-8000-000000000003')
    ),
    'outputs',jsonb_build_array(
      jsonb_build_object('outputId','82000000-0000-4000-8000-000000000001','articlePlan',jsonb_build_object('articlePlanId','82000000-0000-4000-8000-000000000001','dossierId',(select value from validation.ids where key='multi_workspace'))),
      jsonb_build_object('outputId','82000000-0000-4000-8000-000000000002','articlePlan',jsonb_build_object('articlePlanId','82000000-0000-4000-8000-000000000002','dossierId',(select value from validation.ids where key='multi_workspace')))
    )
  ),'fixture multiassunto'
);

do $multi_output$
declare v_workspace uuid; v_a uuid; v_b uuid; v_result record;
begin
  select value into strict v_workspace from validation.ids where key='multi_workspace';
  select value into strict v_a from validation.ids where key='multi_source_a';
  select value into strict v_b from validation.ids where key='multi_source_b';
  select * into strict v_result from public.newsroom_publish_mesa_output_v2(
    v_workspace,'82000000-0000-4000-8000-000000000001','72000000-0000-4000-8000-000000000001',array[v_a],
    jsonb_build_object('id','92000000-0000-4000-8000-000000000001','slug','nucleo-a','label','Noticia','title','Nucleo A','subtitle','Subtitulo A','body','Corpo A','imageUrl','https://example.test/a.jpg','author','Jornada','publishedAt','2026-09-12T11:00:00+00:00','matchdayId','a3000000-0000-4000-8000-000000000001','mode','create'));
  if v_result.consolidated then raise exception 'multi-output-consolidated-too-early'; end if;
  select * into strict v_result from public.newsroom_publish_mesa_output_v2(
    v_workspace,'82000000-0000-4000-8000-000000000002','72000000-0000-4000-8000-000000000001',array[v_b],
    jsonb_build_object('id','92000000-0000-4000-8000-000000000002','slug','nucleo-b','label','Noticia','title','Nucleo B','subtitle','Subtitulo B','body','Corpo B','imageUrl','https://example.test/b.jpg','author','Jornada','publishedAt','2026-09-12T11:01:00+00:00','matchdayId','a3000000-0000-4000-8000-000000000001','mode','create'));
  if not v_result.consolidated then raise exception 'multi-output-not-consolidated-at-end'; end if;
  if exists(select 1 from public.newsroom_mesa_material_versions v where v.production_dossier_id=v_workspace) then
    raise exception 'unrelated-outputs-formed-dossier'; end if;
  if (select count(*) from public.newsroom_mesa_output_source_usage u where u.dossier_id=v_workspace)<>2 then
    raise exception 'multi-output-usage-count-invalid'; end if;
end;
$multi_output$;

-- Two actually-used sources in one output consolidate only after publication.
with prepared as (
  select dossier_id
  from public.newsroom_prepare_mesa_materials_v2(
    '44000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000005','Workspace mesmo assunto',
    jsonb_build_array(
      jsonb_build_object('newsroomArticleId','10000000-0000-4000-8000-000000000002','newsroomSnapshotId','20000000-0000-4000-8000-000000000002'),
      jsonb_build_object('newsroomArticleId','10000000-0000-4000-8000-000000000003','newsroomSnapshotId','20000000-0000-4000-8000-000000000003')
    ),'[]'::jsonb
  )
)
insert into validation.ids(key,value)
select 'same_workspace',dossier_id from prepared;

insert into validation.ids(key,value)
select case s.newsroom_article_id
  when '10000000-0000-4000-8000-000000000002' then 'same_source_a'
  else 'same_source_b' end,s.id
from public.newsroom_editorial_dossier_sources s
where s.dossier_id=(select value from validation.ids where key='same_workspace');

insert into public.newsroom_editorial_dossier_article_plans(
  id,dossier_id,working_title,status,sort_order,article_kind,length_mode,
  editorial_instructions,destination,image_choice
) values (
  '83000000-0000-4000-8000-000000000001',(select value from validation.ids where key='same_workspace'),
  'Mesmo assunto','planned',1,'news','standard','','new','unselected'
);
select * from public.newsroom_set_mesa_output_origin_v2(
  (select value from validation.ids where key='same_workspace'),
  '83000000-0000-4000-8000-000000000001','source',
  (select value from validation.ids where key='same_source_a'),null,null
);
insert into public.newsroom_editorial_source_packages(id,package_year,package_month,manifest,markdown)
values (
  '73000000-0000-4000-8000-000000000001','2026','09',
  jsonb_build_object(
    'version',5,'provenanceContract','mesa-v2',
    'entries',jsonb_build_array(
      jsonb_build_object('status','prepared','provenanceSourceId',(select value from validation.ids where key='same_source_a'),'newsroomArticleId','10000000-0000-4000-8000-000000000002','newsroomSnapshotId','20000000-0000-4000-8000-000000000002'),
      jsonb_build_object('status','prepared','provenanceSourceId',(select value from validation.ids where key='same_source_b'),'newsroomArticleId','10000000-0000-4000-8000-000000000003','newsroomSnapshotId','20000000-0000-4000-8000-000000000003')
    ),
    'outputs',jsonb_build_array(jsonb_build_object('outputId','83000000-0000-4000-8000-000000000001','articlePlan',jsonb_build_object('articlePlanId','83000000-0000-4000-8000-000000000001','dossierId',(select value from validation.ids where key='same_workspace'))))
  ),'fixture mesmo assunto'
);

do $same_subject$
declare v_workspace uuid; v_a uuid; v_b uuid; v_result record;
begin
  select value into strict v_workspace from validation.ids where key='same_workspace';
  select value into strict v_a from validation.ids where key='same_source_a';
  select value into strict v_b from validation.ids where key='same_source_b';
  if exists(select 1 from public.newsroom_mesa_material_versions v where v.production_dossier_id=v_workspace) then
    raise exception 'prepare-created-dossier'; end if;
  select * into strict v_result from public.newsroom_publish_mesa_output_v2(
    v_workspace,'83000000-0000-4000-8000-000000000001','73000000-0000-4000-8000-000000000001',array[v_a,v_b],
    jsonb_build_object('id','93000000-0000-4000-8000-000000000001','slug','mesmo-assunto','label','Noticia','title','Mesmo assunto','subtitle','Subtitulo','body','Corpo conjunto','imageUrl','https://example.test/joint.jpg','author','Jornada','publishedAt','2026-09-12T12:00:00+00:00','matchdayId','a3000000-0000-4000-8000-000000000001','mode','create'));
  if not v_result.consolidated then raise exception 'same-subject-not-consolidated'; end if;
  if not exists(
    select 1 from public.newsroom_mesa_material_versions v
    where v.material_key='output:83000000-0000-4000-8000-000000000001'
      and v.production_dossier_id=v_workspace and jsonb_array_length(v.source_refs)=2
  ) then raise exception 'same-subject-dossier-missing'; end if;
end;
$same_subject$;

-- Existing Dossier in Theme A and B: only the production Theme advances its version.
insert into public.newsroom_mesa_material_versions(
  id,material_key,title,source_refs,article_ids
) values (
  '61000000-0000-4000-8000-000000000001','material:shared','Dossie partilhado',
  jsonb_build_array(
    jsonb_build_object('newsroomArticleId','10000000-0000-4000-8000-000000000002','newsroomSnapshotId','20000000-0000-4000-8000-000000000002'),
    jsonb_build_object('newsroomArticleId','10000000-0000-4000-8000-000000000003','newsroomSnapshotId','20000000-0000-4000-8000-000000000003')
  ),array['93000000-0000-4000-8000-000000000001'::uuid]
);
insert into public.newsroom_mesa_theme_materials(theme_id,material_key,version_id) values
  ('30000000-0000-4000-8000-000000000004','material:shared','61000000-0000-4000-8000-000000000001'),
  ('30000000-0000-4000-8000-000000000005','material:shared','61000000-0000-4000-8000-000000000001');

with prepared as (
  select dossier_id
  from public.newsroom_prepare_mesa_materials_v2(
    '45000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000004','Workspace material existente','[]'::jsonb,
    jsonb_build_array(jsonb_build_object(
      'key','material:shared','versionId','61000000-0000-4000-8000-000000000001',
      'sources',jsonb_build_array(
        jsonb_build_object('newsroomArticleId','10000000-0000-4000-8000-000000000002','newsroomSnapshotId','20000000-0000-4000-8000-000000000002'),
        jsonb_build_object('newsroomArticleId','10000000-0000-4000-8000-000000000003','newsroomSnapshotId','20000000-0000-4000-8000-000000000003')
      )
    ))
  )
)
insert into validation.ids(key,value)
select 'material_workspace',dossier_id from prepared;

insert into validation.ids(key,value)
select case s.newsroom_article_id
  when '10000000-0000-4000-8000-000000000002' then 'material_source_a'
  else 'material_source_b' end,s.id
from public.newsroom_editorial_dossier_sources s
where s.dossier_id=(select value from validation.ids where key='material_workspace');

insert into public.newsroom_editorial_dossier_article_plans(
  id,dossier_id,working_title,status,sort_order,article_kind,length_mode,
  editorial_instructions,destination,image_choice
) values
  ('84000000-0000-4000-8000-000000000001',(select value from validation.ids where key='material_workspace'),'Material output 1','planned',1,'news','standard','','new','unselected'),
  ('84000000-0000-4000-8000-000000000002',(select value from validation.ids where key='material_workspace'),'Material output 2','planned',2,'news','standard','','new','unselected');
select * from public.newsroom_set_mesa_output_origin_v2((select value from validation.ids where key='material_workspace'),'84000000-0000-4000-8000-000000000001','material',null,'material:shared','61000000-0000-4000-8000-000000000001');
select * from public.newsroom_set_mesa_output_origin_v2((select value from validation.ids where key='material_workspace'),'84000000-0000-4000-8000-000000000002','material',null,'material:shared','61000000-0000-4000-8000-000000000001');

insert into public.newsroom_editorial_source_packages(id,package_year,package_month,manifest,markdown)
values (
  '74000000-0000-4000-8000-000000000001','2026','09',
  jsonb_build_object(
    'version',5,'provenanceContract','mesa-v2',
    'entries',jsonb_build_array(
      jsonb_build_object('status','prepared','provenanceSourceId',(select value from validation.ids where key='material_source_a'),'newsroomArticleId','10000000-0000-4000-8000-000000000002','newsroomSnapshotId','20000000-0000-4000-8000-000000000002'),
      jsonb_build_object('status','prepared','provenanceSourceId',(select value from validation.ids where key='material_source_b'),'newsroomArticleId','10000000-0000-4000-8000-000000000003','newsroomSnapshotId','20000000-0000-4000-8000-000000000003')
    ),
    'outputs',jsonb_build_array(
      jsonb_build_object('outputId','84000000-0000-4000-8000-000000000001','articlePlan',jsonb_build_object('articlePlanId','84000000-0000-4000-8000-000000000001','dossierId',(select value from validation.ids where key='material_workspace'))),
      jsonb_build_object('outputId','84000000-0000-4000-8000-000000000002','articlePlan',jsonb_build_object('articlePlanId','84000000-0000-4000-8000-000000000002','dossierId',(select value from validation.ids where key='material_workspace')))
    )
  ),'fixture material'
);

do $material_multi_theme$
declare v_workspace uuid; v_a uuid; v_b uuid; v_result record; v_new_version uuid;
begin
  select value into strict v_workspace from validation.ids where key='material_workspace';
  select value into strict v_a from validation.ids where key='material_source_a';
  select value into strict v_b from validation.ids where key='material_source_b';
  select * into strict v_result from public.newsroom_publish_mesa_output_v2(
    v_workspace,'84000000-0000-4000-8000-000000000001','74000000-0000-4000-8000-000000000001',array[v_a],
    jsonb_build_object('id','94000000-0000-4000-8000-000000000001','slug','material-output-1','label','Noticia','title','Material output 1','subtitle','Subtitulo','body','Corpo 1','imageUrl','https://example.test/m1.jpg','author','Jornada','publishedAt','2026-09-12T13:00:00+00:00','matchdayId','a3000000-0000-4000-8000-000000000001','mode','create'));
  if v_result.consolidated then raise exception 'material-consolidated-too-early'; end if;
  select * into strict v_result from public.newsroom_publish_mesa_output_v2(
    v_workspace,'84000000-0000-4000-8000-000000000002','74000000-0000-4000-8000-000000000001',array[v_b],
    jsonb_build_object('id','94000000-0000-4000-8000-000000000002','slug','material-output-2','label','Noticia','title','Material output 2','subtitle','Subtitulo','body','Corpo 2','imageUrl','https://example.test/m2.jpg','author','Jornada','publishedAt','2026-09-12T13:01:00+00:00','matchdayId','a3000000-0000-4000-8000-000000000001','mode','create'));
  if not v_result.consolidated then raise exception 'material-not-consolidated-at-end'; end if;
  select v.id into strict v_new_version from public.newsroom_mesa_material_versions v
    where v.material_key='material:shared' and v.parent_version_id='61000000-0000-4000-8000-000000000001'
      and v.production_dossier_id=v_workspace;
  if (select version_id from public.newsroom_mesa_theme_materials where theme_id='30000000-0000-4000-8000-000000000004' and material_key='material:shared')<>v_new_version then
    raise exception 'active-theme-not-advanced'; end if;
  if (select version_id from public.newsroom_mesa_theme_materials where theme_id='30000000-0000-4000-8000-000000000005' and material_key='material:shared')<>'61000000-0000-4000-8000-000000000001'::uuid then
    raise exception 'independent-theme-was-mutated'; end if;
  if not exists(select 1 from public.newsroom_mesa_material_versions v where v.id=v_new_version
    and v.article_ids @> array['94000000-0000-4000-8000-000000000001'::uuid,'94000000-0000-4000-8000-000000000002'::uuid]
    and jsonb_array_length(v.source_refs)=2) then
    raise exception 'material-structural-provenance-invalid'; end if;
end;
$material_multi_theme$;

-- UPDATE remains explicit and runs through the same atomic publication RPC.
insert into public.editorial_articles(
  id,status,scope,author,label,title,subtitle,body,slug,image_url,published_at,matchday_id
) values (
  '95000000-0000-4000-8000-000000000001','published','matchday','Jornada','Noticia',
  'Antes','Antes','Antes','artigo-update','https://example.test/old.jpg',
  '2026-09-12T09:00:00+00:00','a3000000-0000-4000-8000-000000000001'
);
with prepared as (
  select dossier_id
  from public.newsroom_prepare_mesa_materials_v2(
    '46000000-0000-4000-8000-000000000001',null,'Workspace update',
    jsonb_build_array(jsonb_build_object('newsroomArticleId','10000000-0000-4000-8000-000000000002','newsroomSnapshotId','20000000-0000-4000-8000-000000000002')),
    '[]'::jsonb
  )
)
insert into validation.ids(key,value)
select 'update_workspace',dossier_id from prepared;
insert into validation.ids(key,value)
select 'update_source',s.id from public.newsroom_editorial_dossier_sources s
where s.dossier_id=(select value from validation.ids where key='update_workspace');
insert into public.newsroom_editorial_dossier_article_plans(
  id,dossier_id,working_title,status,sort_order,article_kind,length_mode,
  editorial_instructions,destination,update_target_editorial_article_id,image_choice
) values (
  '85000000-0000-4000-8000-000000000001',(select value from validation.ids where key='update_workspace'),
  'Update explicito','planned',1,'news','standard','','update',
  '95000000-0000-4000-8000-000000000001','preserve_published'
);
select * from public.newsroom_set_mesa_output_origin_v2(
  (select value from validation.ids where key='update_workspace'),
  '85000000-0000-4000-8000-000000000001','source',
  (select value from validation.ids where key='update_source'),null,null
);
insert into public.newsroom_editorial_source_packages(id,package_year,package_month,manifest,markdown)
values (
  '75000000-0000-4000-8000-000000000001','2026','09',
  jsonb_build_object(
    'version',5,'provenanceContract','mesa-v2',
    'entries',jsonb_build_array(jsonb_build_object('status','prepared','provenanceSourceId',(select value from validation.ids where key='update_source'),'newsroomArticleId','10000000-0000-4000-8000-000000000002','newsroomSnapshotId','20000000-0000-4000-8000-000000000002')),
    'outputs',jsonb_build_array(jsonb_build_object('outputId','85000000-0000-4000-8000-000000000001','articlePlan',jsonb_build_object('articlePlanId','85000000-0000-4000-8000-000000000001','dossierId',(select value from validation.ids where key='update_workspace'))))
  ),'fixture update'
);

do $explicit_update$
declare v_workspace uuid; v_source uuid; v_result record;
begin
  select value into strict v_workspace from validation.ids where key='update_workspace';
  select value into strict v_source from validation.ids where key='update_source';
  select * into strict v_result from public.newsroom_publish_mesa_output_v2(
    v_workspace,'85000000-0000-4000-8000-000000000001','75000000-0000-4000-8000-000000000001',array[v_source],
    jsonb_build_object('id','95000000-0000-4000-8000-000000000001','slug','artigo-update','label','Noticia','title','Depois','subtitle','Depois','body','Depois','author','Jornada','publishedAt','2026-09-12T14:00:00+00:00','matchdayId','a3000000-0000-4000-8000-000000000001','mode','update'));
  if v_result.publication_action<>'updated' or not v_result.consolidated then
    raise exception 'explicit-update-result-invalid'; end if;
  if not exists(select 1 from public.editorial_articles a where a.id='95000000-0000-4000-8000-000000000001'
    and a.title='Depois' and a.image_url='https://example.test/old.jpg' and a.status='published') then
    raise exception 'explicit-update-write-invalid'; end if;
end;
$explicit_update$;

-- Abandon a v2 workspace: additive history, no editorial residue.
do $abandon_v2$
declare v_workspace uuid; v_result record;
begin
  select value into strict v_workspace from validation.ids where key='external_workspace';
  select * into strict v_result from public.newsroom_abandon_mesa_production_v2(v_workspace);
  if v_result.abandonment_action<>'abandoned' or v_result.restored_theme_membership_count<>0 then
    raise exception 'v2-abandon-result-invalid'; end if;
  if not exists(select 1 from public.newsroom_mesa_production_contexts c
    where c.dossier_id=v_workspace and c.workspace_role='technical'
      and c.workspace_contract_version=2 and c.workspace_state='abandoned'
      and c.abandoned_at is not null and c.abandonment_snapshot is not null) then
    raise exception 'v2-abandon-history-invalid'; end if;
  if exists(select 1 from public.newsroom_mesa_material_versions v where v.production_dossier_id=v_workspace)
    or exists(select 1 from public.newsroom_mesa_output_publications p where p.dossier_id=v_workspace)
    or exists(select 1 from public.newsroom_mesa_output_source_usage u where u.dossier_id=v_workspace) then
    raise exception 'v2-abandon-editorial-residue'; end if;
end;
$abandon_v2$;

select 'postflight-extended-ok' as result;
