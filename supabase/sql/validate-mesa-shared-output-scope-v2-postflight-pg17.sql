\set ON_ERROR_STOP on

-- Run on the same disposable PostgreSQL 17 database used by the paired
-- preflight, after 20260912175044_mesa_workspace_shared_output_scope_v2.sql.
-- All writes below are local fixtures and are intentionally transactional.

do $schema_assert$
declare
  v_historical_source uuid;
begin
  if to_regprocedure('public.newsroom_set_mesa_shared_outputs_v2(uuid,uuid[])') is null
    or to_regprocedure('public.newsroom_mesa_consolidate_publication_v4(uuid)') is null
    or to_regprocedure('public.newsroom_publish_mesa_output_v2(uuid,uuid,uuid,uuid[],jsonb)') is null
  then
    raise exception 'shared-output-scope-functions-missing';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema='public'
      and table_name='newsroom_mesa_output_publications'
      and column_name='source_scope'
      and is_nullable='YES'
  ) then
    raise exception 'shared-output-scope-column-invalid';
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid='public.newsroom_mesa_output_publications'::regclass
      and conname='newsroom_mesa_output_publications_source_scope_check'
      and contype='c'
  ) then
    raise exception 'shared-output-scope-check-missing';
  end if;

  select value into strict v_historical_source
  from validation.ids where key='historical_output_source';
  if not exists (
    select 1 from public.newsroom_mesa_output_publications p
    where p.article_plan_id='71000000-0000-4000-8000-000000000001'
      and p.source_scope is null
      and p.origin_kind='source'
      and p.origin_dossier_source_id=v_historical_source
      and p.material_key is null and p.material_version_id is null
  ) then
    raise exception 'shared-output-scope-historical-row-reinterpreted';
  end if;
  if not exists (
    select 1 from public.newsroom_mesa_output_origins o
    where o.article_plan_id='71000000-0000-4000-8000-000000000001'
      and o.origin_kind='source'
      and o.origin_dossier_source_id=v_historical_source
  ) then
    raise exception 'shared-output-scope-historical-origin-rewritten';
  end if;

  begin
    update public.newsroom_mesa_output_publications
      set source_scope='workspace'
      where article_plan_id='71000000-0000-4000-8000-000000000001';
    raise exception 'shared-output-scope-hybrid-workspace-accepted';
  exception when check_violation then null; end;

  begin
    update public.newsroom_mesa_output_publications
      set origin_kind=null,origin_dossier_source_id=null
      where article_plan_id='71000000-0000-4000-8000-000000000001';
    raise exception 'shared-output-scope-empty-historical-origin-accepted';
  exception when check_violation then null; end;

  begin
    update public.newsroom_mesa_output_publications
      set source_scope='unexpected'
      where article_plan_id='71000000-0000-4000-8000-000000000001';
    raise exception 'shared-output-scope-unknown-value-accepted';
  exception when check_violation then null; end;
end;
$schema_assert$;

with prepared as (
  select dossier_id
  from public.newsroom_prepare_mesa_materials_v2(
    '74000000-0000-4000-8000-000000000010',
    null,
    'Workspace partilhado 4 fontes 3 outputs',
    jsonb_build_array(
      jsonb_build_object('newsroomArticleId','10000000-0000-4000-8000-000000000001','newsroomSnapshotId','20000000-0000-4000-8000-000000000001'),
      jsonb_build_object('newsroomArticleId','10000000-0000-4000-8000-000000000002','newsroomSnapshotId','20000000-0000-4000-8000-000000000002'),
      jsonb_build_object('newsroomArticleId','10000000-0000-4000-8000-000000000003','newsroomSnapshotId','20000000-0000-4000-8000-000000000003'),
      jsonb_build_object('newsroomArticleId','10000000-0000-4000-8000-000000000004','newsroomSnapshotId','20000000-0000-4000-8000-000000000004')
    ),
    '[]'::jsonb
  )
)
insert into validation.ids(key,value)
select 'shared_workspace',dossier_id from prepared;

insert into validation.ids(key,value)
select 'shared_source_' || row_number() over(order by s.sort_order,s.id),s.id
from public.newsroom_editorial_dossier_sources s
where s.dossier_id=(select value from validation.ids where key='shared_workspace');

insert into public.newsroom_editorial_dossier_article_plans(
  id,dossier_id,working_title,status,sort_order,article_kind,length_mode,
  editorial_instructions,destination,image_choice
) values
  ('74000000-0000-4000-8000-000000000001',(select value from validation.ids where key='shared_workspace'),'Output 01','ready',1,'news','standard','','new','unselected'),
  ('74000000-0000-4000-8000-000000000002',(select value from validation.ids where key='shared_workspace'),'Output 02','ready',2,'news','standard','','new','unselected'),
  ('74000000-0000-4000-8000-000000000003',(select value from validation.ids where key='shared_workspace'),'Output 03','ready',3,'news','standard','','new','unselected'),
  ('74000000-0000-4000-8000-000000000004',(select value from validation.ids where key='shared_workspace'),'Output excedente','ready',4,'news','standard','','new','unselected');

-- Assignments are deliberately the full Cartesian availability set. The
-- publication assertions below prove they are not treated as final usage.
insert into public.newsroom_editorial_dossier_article_plan_sources(
  dossier_id,article_plan_id,dossier_source_id,sort_order
)
select
  (select value from validation.ids where key='shared_workspace'),
  plan.id,
  source.id,
  row_number() over(partition by plan.id order by source.sort_order,source.id)::integer
from public.newsroom_editorial_dossier_article_plans plan
cross join public.newsroom_editorial_dossier_sources source
where plan.dossier_id=(select value from validation.ids where key='shared_workspace')
  and source.dossier_id=plan.dossier_id;

do $output_count_assert$
declare
  v_count integer;
  v_cancelled integer;
begin
  select result.output_count,result.cancelled_count
    into strict v_count,v_cancelled
  from public.newsroom_set_mesa_shared_outputs_v2(
    (select value from validation.ids where key='shared_workspace'),
    array[
      '74000000-0000-4000-8000-000000000001'::uuid,
      '74000000-0000-4000-8000-000000000002'::uuid,
      '74000000-0000-4000-8000-000000000003'::uuid
    ]
  ) result;
  if v_count<>3 or v_cancelled<>1 then
    raise exception 'shared-output-count-result-invalid';
  end if;
  if not exists (
    select 1 from public.newsroom_editorial_dossiers d
    where d.id=(select value from validation.ids where key='shared_workspace')
      and d.output_mode='multiple' and d.output_count=3
  ) or not exists (
    select 1 from public.newsroom_editorial_dossier_article_plans p
    where p.id='74000000-0000-4000-8000-000000000004'
      and p.status='cancelled'
  ) then
    raise exception 'shared-output-count-state-invalid';
  end if;
end;
$output_count_assert$;

insert into public.newsroom_editorial_source_packages(
  id,created_at,updated_at,package_year,package_month,manifest,markdown
)
select
  '75000000-0000-4000-8000-000000000001',
  '2026-09-12T18:00:00Z','2026-09-12T18:00:00Z','2026','09',
  jsonb_build_object(
    'version',5,
    'provenanceContract','mesa-v2',
    'packageId','75000000-0000-4000-8000-000000000001',
    'createdAt','2026-09-12T18:00:00.000Z',
    'year','2026',
    'month','09',
    'markdownFileName','workspace-partilhado.md',
    'genre','news',
    'genreLabel','Notícia',
    'suggestedTitle','Produção partilhada',
    'additionalInstructions',null,
    'selectedCount',4,
    'articleCount',3,
    'preparedCount',4,
    'failedCount',0,
    'imageCount',0,
    'localDirectory',null,
    'entries',(
      select jsonb_agg(jsonb_build_object(
        'position',entry.position,
        'articlePosition',1,
        'newsroomArticleId',entry.newsroom_article_id,
        'newsroomSnapshotId',entry.newsroom_snapshot_id,
        'provenanceSourceId',entry.id,
        'status','prepared',
        'sourceCode','fixture',
        'sourceName','Fixture',
        'title',entry.title_snapshot,
        'errorCode',null,
        'imageUrl',null,
        'publishedAt',null,
        'publishedAtPrecision',null
      ) order by entry.position)
      from (
        select s.id,s.newsroom_article_id,s.newsroom_snapshot_id,s.title_snapshot,
          row_number() over(order by s.sort_order,s.id)::integer position
        from public.newsroom_editorial_dossier_sources s
        where s.dossier_id=(select value from validation.ids where key='shared_workspace')
      ) entry
    ),
    'outputs',jsonb_build_array(
      jsonb_build_object(
        'position',1,'outputId','74000000-0000-4000-8000-000000000001',
        'sourceArticlePosition',1,'focus','Output editorial 01',
        'imageNewsroomArticleId',null,
        'articlePlan',jsonb_build_object(
          'dossierId',(select value from validation.ids where key='shared_workspace'),
          'articlePlanId','74000000-0000-4000-8000-000000000001',
          'workingTitle','Output 01','articleKind','news','articleKindLabel','Notícia',
          'lengthMode','standard','lengthModeLabel','Normal',
          'editorialInstructions','','destination','new',
          'workspaceContractVersion',2,'sourceScope','workspace'
        )
      ),
      jsonb_build_object(
        'position',2,'outputId','74000000-0000-4000-8000-000000000002',
        'sourceArticlePosition',1,'focus','Output editorial 02',
        'imageNewsroomArticleId',null,
        'articlePlan',jsonb_build_object(
          'dossierId',(select value from validation.ids where key='shared_workspace'),
          'articlePlanId','74000000-0000-4000-8000-000000000002',
          'workingTitle','Output 02','articleKind','news','articleKindLabel','Notícia',
          'lengthMode','standard','lengthModeLabel','Normal',
          'editorialInstructions','','destination','new',
          'workspaceContractVersion',2,'sourceScope','workspace'
        )
      ),
      jsonb_build_object(
        'position',3,'outputId','74000000-0000-4000-8000-000000000003',
        'sourceArticlePosition',1,'focus','Output editorial 03',
        'imageNewsroomArticleId',null,
        'articlePlan',jsonb_build_object(
          'dossierId',(select value from validation.ids where key='shared_workspace'),
          'articlePlanId','74000000-0000-4000-8000-000000000003',
          'workingTitle','Output 03','articleKind','news','articleKindLabel','Notícia',
          'lengthMode','standard','lengthModeLabel','Normal',
          'editorialInstructions','','destination','new',
          'workspaceContractVersion',2,'sourceScope','workspace'
        )
      )
    )
  ),
  '# Pacote workspace partilhado'
from (values(1)) seed(value);

do $publication_assert$
declare
  v_workspace uuid;
  v_s1 uuid;
  v_s2 uuid;
  v_s3 uuid;
  v_s4 uuid;
  v_consolidated boolean;
  v_action text;
  v_external_workspace uuid;
  v_external_source uuid;
begin
  select value into strict v_workspace from validation.ids where key='shared_workspace';
  select value into strict v_s1 from validation.ids where key='shared_source_1';
  select value into strict v_s2 from validation.ids where key='shared_source_2';
  select value into strict v_s3 from validation.ids where key='shared_source_3';
  select value into strict v_s4 from validation.ids where key='shared_source_4';

  if (select count(*) from public.newsroom_editorial_dossier_article_plan_sources a
      join public.newsroom_editorial_dossier_article_plans p on p.id=a.article_plan_id
      where a.dossier_id=v_workspace and p.status<>'cancelled')<>12 then
    raise exception 'shared-output-full-availability-assignments-missing';
  end if;
  if exists (select 1 from public.newsroom_mesa_output_origins where dossier_id=v_workspace) then
    raise exception 'shared-output-exclusive-origin-created';
  end if;

  select result.consolidated into strict v_consolidated
  from public.newsroom_publish_mesa_output_v2(
    v_workspace,'74000000-0000-4000-8000-000000000001',
    '75000000-0000-4000-8000-000000000001',array[v_s1,v_s3],
    jsonb_build_object(
      'id','76000000-0000-4000-8000-000000000001','slug','workspace-output-01',
      'label','Notícia','title','Workspace output 01','subtitle','Subtítulo 01',
      'body','Corpo 01','imageUrl','https://example.test/image-from-unused-source.jpg',
      'author','Jornada','publishedAt','2026-09-12T18:01:00Z','matchdayId',null,'mode','create'
    )
  ) result;
  if v_consolidated then raise exception 'shared-output-consolidated-too-early-1'; end if;

  select result.consolidated into strict v_consolidated
  from public.newsroom_publish_mesa_output_v2(
    v_workspace,'74000000-0000-4000-8000-000000000002',
    '75000000-0000-4000-8000-000000000001',array[v_s2],
    jsonb_build_object(
      'id','76000000-0000-4000-8000-000000000002','slug','workspace-output-02',
      'label','Notícia','title','Workspace output 02','subtitle','Subtítulo 02',
      'body','Corpo 02','imageUrl','https://example.test/output-02.jpg',
      'author','Jornada','publishedAt','2026-09-12T18:02:00Z','matchdayId',null,'mode','create'
    )
  ) result;
  if v_consolidated then raise exception 'shared-output-consolidated-too-early-2'; end if;

  select result.consolidated into strict v_consolidated
  from public.newsroom_publish_mesa_output_v2(
    v_workspace,'74000000-0000-4000-8000-000000000003',
    '75000000-0000-4000-8000-000000000001',array[v_s1,v_s2],
    jsonb_build_object(
      'id','76000000-0000-4000-8000-000000000003','slug','workspace-output-03',
      'label','Notícia','title','Workspace output 03','subtitle','Subtítulo 03',
      'body','Corpo 03','imageUrl','https://example.test/output-03.jpg',
      'author','Jornada','publishedAt','2026-09-12T18:03:00Z','matchdayId',null,'mode','create'
    )
  ) result;
  if not v_consolidated then raise exception 'shared-output-final-consolidation-missing'; end if;

  if (select count(*) from public.newsroom_mesa_output_publications p
      where p.dossier_id=v_workspace and p.source_scope='workspace'
        and p.origin_kind is null and p.origin_dossier_source_id is null
        and p.material_key is null and p.material_version_id is null)<>3 then
    raise exception 'shared-output-publication-scope-invalid';
  end if;
  if (select count(*) from public.newsroom_mesa_output_source_usage u
      where u.dossier_id=v_workspace)<>5
    or (select count(*) from public.newsroom_mesa_output_source_usage u
      where u.dossier_id=v_workspace and u.dossier_source_id=v_s1)<>2
    or exists(select 1 from public.newsroom_mesa_output_source_usage u
      where u.dossier_id=v_workspace and u.dossier_source_id=v_s4)
  then
    raise exception 'shared-output-final-usage-invalid';
  end if;
  if (select count(*) from public.newsroom_mesa_material_versions mv
      where mv.production_dossier_id=v_workspace)<>2
    or exists (
      select 1 from public.newsroom_mesa_material_versions mv
      where mv.production_dossier_id=v_workspace
        and jsonb_array_length(mv.source_refs)<>2
    )
    or exists (
      select 1 from public.newsroom_mesa_version_source_refs r
      join public.newsroom_mesa_material_versions mv on mv.id=r.version_id
      where mv.production_dossier_id=v_workspace
        and r.newsroom_article_id='10000000-0000-4000-8000-000000000004'
    )
  then
    raise exception 'shared-output-consolidation-used-availability-or-package-group';
  end if;

  select result.publication_action into strict v_action
  from public.newsroom_publish_mesa_output_v2(
    v_workspace,'74000000-0000-4000-8000-000000000003',
    '75000000-0000-4000-8000-000000000001',array[v_s1,v_s2],
    jsonb_build_object(
      'id','76000000-0000-4000-8000-000000000003','slug','workspace-output-03',
      'label','Notícia','title','Workspace output 03','subtitle','Subtítulo 03',
      'body','Corpo 03','imageUrl','https://example.test/output-03.jpg',
      'author','Jornada','publishedAt','2026-09-12T18:03:00Z','matchdayId',null,'mode','create'
    )
  ) result;
  if v_action<>'reused' then raise exception 'shared-output-idempotence-failed'; end if;

  begin
    perform * from public.newsroom_publish_mesa_output_v2(
      v_workspace,'74000000-0000-4000-8000-000000000003',
      '75000000-0000-4000-8000-000000000001',array[v_s2],
      jsonb_build_object(
        'id','76000000-0000-4000-8000-000000000003','slug','workspace-output-03',
        'label','Notícia','title','Workspace output 03','subtitle','Subtítulo 03',
        'body','Corpo 03','imageUrl','https://example.test/output-03.jpg',
        'author','Jornada','publishedAt','2026-09-12T18:03:00Z','matchdayId',null,'mode','create'
      )
    );
    raise exception 'shared-output-provenance-conflict-not-raised';
  exception when others then
    if sqlerrm<>'mesa-publication-provenance-conflict' then raise; end if;
  end;

  select dossier_id into strict v_external_workspace
  from public.newsroom_prepare_mesa_materials_v2(
    '74000000-0000-4000-8000-000000000020',null,'Workspace externo',
    jsonb_build_array(jsonb_build_object(
      'newsroomArticleId','10000000-0000-4000-8000-000000000002',
      'newsroomSnapshotId','20000000-0000-4000-8000-000000000002'
    )),'[]'::jsonb
  );
  select id into strict v_external_source
  from public.newsroom_editorial_dossier_sources
  where dossier_id=v_external_workspace;
  begin
    perform * from public.newsroom_publish_mesa_output_v2(
      v_workspace,'74000000-0000-4000-8000-000000000001',
      '75000000-0000-4000-8000-000000000001',array[v_external_source],
      jsonb_build_object(
        'id','76000000-0000-4000-8000-000000000001','slug','workspace-output-01',
        'label','Notícia','title','Workspace output 01','subtitle','Subtítulo 01',
        'body','Corpo 01','imageUrl','https://example.test/output-01.jpg',
        'author','Jornada','publishedAt','2026-09-12T18:01:00Z','matchdayId',null,'mode','create'
      )
    );
    raise exception 'shared-output-external-source-accepted';
  exception when others then
    if sqlerrm<>'mesa-publication-source-invalid' then raise; end if;
  end;
end;
$publication_assert$;

do $final_history_assert$
begin
  if not exists (
    select 1 from public.newsroom_mesa_output_publications p
    where p.article_plan_id='71000000-0000-4000-8000-000000000001'
      and p.source_scope is null and p.origin_kind='source'
      and p.origin_dossier_source_id=(
        select value from validation.ids where key='historical_output_source'
      )
  ) then
    raise exception 'shared-output-scope-history-changed-after-publication';
  end if;
end;
$final_history_assert$;

select 'mesa-shared-output-scope-v2-postflight-ok' as result;
