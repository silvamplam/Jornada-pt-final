\set ON_ERROR_STOP on

-- Run on the same disposable database immediately after applying
-- 20260912173257_allow_mesa_v2_source_package_manifest_v5.sql.
do $schema_assert$
begin
  if to_regprocedure(
    'public.newsroom_editorial_source_package_manifest_v5_valid(uuid,text,text,jsonb)'
  ) is null then
    raise exception 'source-package-manifest-v5-validator-missing';
  end if;
  if (select count(*) from public.newsroom_editorial_source_packages
      where manifest->>'version'='2') <> 1
    or (select count(*) from public.newsroom_editorial_source_packages
      where manifest->>'version'='4') <> 1
  then
    raise exception 'source-package-manifest-v5-history-not-preserved';
  end if;
end;
$schema_assert$;

-- This is the complete manifest shape emitted by createEditorialSourcePackage
-- for “Guardar artigos e imagens” in a Mesa workspaceContractVersion=2.
insert into public.newsroom_editorial_source_packages(
  id,created_at,updated_at,package_year,package_month,manifest,markdown
) values (
  'a1000000-0000-4000-8000-000000000005',
  '2026-09-12T16:00:00Z','2026-09-12T16:00:00Z','2026','09',
  jsonb_build_object(
    'version',5,
    'provenanceContract','mesa-v2',
    'packageId','a1000000-0000-4000-8000-000000000005',
    'createdAt','2026-09-12T16:00:00.000Z',
    'year','2026',
    'month','09',
    'markdownFileName','fontes-producao-mesa.md',
    'genre','news',
    'genreLabel','Notícia',
    'suggestedTitle','Produção Mesa',
    'additionalInstructions','Respeitar o foco editorial.',
    'selectedCount',1,
    'articleCount',1,
    'preparedCount',1,
    'failedCount',0,
    'imageCount',0,
    'localDirectory',null,
    'outputs',jsonb_build_array(jsonb_build_object(
      'position',1,
      'outputId','a2000000-0000-4000-8000-000000000001',
      'sourceArticlePosition',1,
      'focus','Foco editorial',
      'imageNewsroomArticleId',null,
      'articlePlan',jsonb_build_object(
        'dossierId','a3000000-0000-4000-8000-000000000001',
        'articlePlanId','a2000000-0000-4000-8000-000000000001',
        'workingTitle','Output técnico 1',
        'articleKind','news',
        'articleKindLabel','Notícia',
        'lengthMode','standard',
        'lengthModeLabel','Normal',
        'editorialInstructions','',
        'destination','new',
        'workspaceContractVersion',2,
        'sourceScope','workspace'
      )
    )),
    'entries',jsonb_build_array(jsonb_build_object(
      'position',1,
      'articlePosition',1,
      'newsroomArticleId','a5000000-0000-4000-8000-000000000001',
      'newsroomSnapshotId','a6000000-0000-4000-8000-000000000001',
      'provenanceSourceId','a4000000-0000-4000-8000-000000000001',
      'status','prepared',
      'sourceCode','record',
      'sourceName','Record',
      'title','Fonte preparada',
      'errorCode',null,
      'imageUrl',null,
      'publishedAt',null,
      'publishedAtPrecision',null
    ))
  ),
  '# Pacote Mesa v2'
);

do $negative_cases$
declare
  v_valid jsonb;
  v_candidate jsonb;
begin
  select manifest into strict v_valid
  from public.newsroom_editorial_source_packages
  where id='a1000000-0000-4000-8000-000000000005';

  v_candidate := v_valid - 'provenanceContract';
  begin
    insert into public.newsroom_editorial_source_packages(id,package_year,package_month,manifest,markdown)
    values (
      'a1000000-0000-4000-8000-000000000006','2026','09',
      jsonb_set(v_candidate,'{packageId}','"a1000000-0000-4000-8000-000000000006"'),
      'missing provenance contract'
    );
    raise exception 'v5-without-provenance-contract-accepted';
  exception when check_violation then null;
  end;

  v_candidate := jsonb_set(
    v_valid,
    '{outputs,0,articlePlan,articlePlanId}',
    '"a2000000-0000-4000-8000-000000000099"'
  );
  begin
    insert into public.newsroom_editorial_source_packages(id,package_year,package_month,manifest,markdown)
    values (
      'a1000000-0000-4000-8000-000000000007','2026','09',
      jsonb_set(v_candidate,'{packageId}','"a1000000-0000-4000-8000-000000000007"'),
      'malformed output identity'
    );
    raise exception 'malformed-v5-accepted';
  exception when check_violation then null;
  end;

  v_candidate := jsonb_set(v_valid,'{provenanceContract}','"outro"');
  begin
    insert into public.newsroom_editorial_source_packages(id,package_year,package_month,manifest,markdown)
    values (
      'a1000000-0000-4000-8000-000000000010','2026','09',
      jsonb_set(v_candidate,'{packageId}','"a1000000-0000-4000-8000-000000000010"'),
      'wrong provenance contract'
    );
    raise exception 'v5-with-wrong-provenance-contract-accepted';
  exception when check_violation then null;
  end;

  v_candidate := v_valid - 'outputs';
  begin
    insert into public.newsroom_editorial_source_packages(id,package_year,package_month,manifest,markdown)
    values (
      'a1000000-0000-4000-8000-000000000011','2026','09',
      jsonb_set(v_candidate,'{packageId}','"a1000000-0000-4000-8000-000000000011"'),
      'missing outputs'
    );
    raise exception 'v5-without-outputs-accepted';
  exception when check_violation then null;
  end;

  v_candidate := v_valid;
  begin
    insert into public.newsroom_editorial_source_packages(id,package_year,package_month,manifest,markdown)
    values (
      'a1000000-0000-4000-8000-000000000012','2026','09',
      v_candidate,
      'wrong package identity'
    );
    raise exception 'v5-with-wrong-package-id-accepted';
  exception when check_violation then null;
  end;

  v_candidate := jsonb_set(
    jsonb_set(v_valid,'{packageId}','"a1000000-0000-4000-8000-000000000013"'),
    '{year}','"2025"'
  );
  begin
    insert into public.newsroom_editorial_source_packages(id,package_year,package_month,manifest,markdown)
    values ('a1000000-0000-4000-8000-000000000013','2026','09',v_candidate,'wrong year');
    raise exception 'v5-with-wrong-year-accepted';
  exception when check_violation then null;
  end;

  v_candidate := jsonb_set(
    jsonb_set(v_valid,'{packageId}','"a1000000-0000-4000-8000-000000000014"'),
    '{month}','"08"'
  );
  begin
    insert into public.newsroom_editorial_source_packages(id,package_year,package_month,manifest,markdown)
    values ('a1000000-0000-4000-8000-000000000014','2026','09',v_candidate,'wrong month');
    raise exception 'v5-with-wrong-month-accepted';
  exception when check_violation then null;
  end;

  v_candidate := jsonb_set(
    v_valid,
    '{outputs,0,articlePlan,sourceScope}',
    '"source"'
  );
  begin
    insert into public.newsroom_editorial_source_packages(id,package_year,package_month,manifest,markdown)
    values (
      'a1000000-0000-4000-8000-000000000015','2026','09',
      jsonb_set(v_candidate,'{packageId}','"a1000000-0000-4000-8000-000000000015"'),
      'malformed output scope'
    );
    raise exception 'v5-with-wrong-output-scope-accepted';
  exception when check_violation then null;
  end;

  v_candidate := jsonb_set(v_valid,'{version}','6'::jsonb);
  begin
    insert into public.newsroom_editorial_source_packages(id,package_year,package_month,manifest,markdown)
    values (
      'a1000000-0000-4000-8000-000000000008','2026','09',
      jsonb_set(v_candidate,'{packageId}','"a1000000-0000-4000-8000-000000000008"'),
      'unknown version'
    );
    raise exception 'unknown-version-accepted';
  exception when check_violation then null;
  end;

  v_candidate := jsonb_set(v_valid,'{entries}','{}'::jsonb);
  begin
    insert into public.newsroom_editorial_source_packages(id,package_year,package_month,manifest,markdown)
    values (
      'a1000000-0000-4000-8000-000000000009','2026','09',
      jsonb_set(v_candidate,'{packageId}','"a1000000-0000-4000-8000-000000000009"'),
      'malformed entries'
    );
    raise exception 'malformed-v5-entries-accepted';
  exception when check_violation then null;
  end;
end;
$negative_cases$;

do $final_assert$
begin
  if (select count(*) from public.newsroom_editorial_source_packages) <> 3
    or not exists (
      select 1
      from public.newsroom_editorial_source_packages
      where id='a1000000-0000-4000-8000-000000000005'
        and manifest->>'version'='5'
        and manifest->>'provenanceContract'='mesa-v2'
    )
  then
    raise exception 'source-package-manifest-v5-postflight-invalid';
  end if;
end;
$final_assert$;

select 'source-package-manifest-v5-postflight-ok' as result;
