-- Only loaded by the guarded local PG17 runner. Real preparation + writers.
create function public.test_production_images_fixture() returns jsonb language plpgsql as $$
declare
  article uuid; snap uuid; dossier uuid; ctx uuid; img uuid; src uuid;
  articles uuid[] := '{}'; contexts jsonb := '[]'; outputs jsonb := '[]';
  digest text; source_url text; path text; url text; decision text; idx integer;
begin
  for idx in 1..3 loop
    article := gen_random_uuid(); snap := gen_random_uuid();
    insert into public.newsroom_articles(id,source_code,original_url,normalized_url,title,
      detected_at,first_detected_at,last_detected_at,processing_status)
    values(article,'__production_image_test__','https://example.invalid/'||article,
      'https://example.invalid/'||article,'Source '||idx,now(),now(),now(),'ready_for_review');
    insert into public.newsroom_article_snapshots(id,article_id,content_hash,body,source_metadata,extracted_at)
    values(snap,article,repeat(idx::text,64),'[{"type":"paragraph","text":"Synthetic source"}]','{}',now());
    insert into public.newsroom_editorial_article_classifications(newsroom_article_id,classification_key,classification_source)
    values(article,'sporting','manual');
    articles := array_append(articles,article);
    contexts := contexts || jsonb_build_array(jsonb_build_object('kind','source','sourceId',article,
      'sources',jsonb_build_array(jsonb_build_object('newsroomArticleId',article,'newsroomSnapshotId',snap))));
  end loop;
  select dossier_id into strict dossier from public.newsroom_prepare_mesa_contexts_v3(gen_random_uuid(),'Production image test',contexts,null,'{}');
  for idx in 1..3 loop
    article := articles[idx];
    select s.id into strict src from public.newsroom_editorial_dossier_sources s
      where s.dossier_id=dossier and s.newsroom_article_id=article;
    select c.production_context_id into strict ctx from public.newsroom_mesa_production_context_sources c
      where c.dossier_id=dossier and c.dossier_source_id=src;
    source_url := 'https://source.example/'||article||'.jpg';
    insert into public.newsroom_editorial_dossier_images(dossier_id,origin_kind,frozen_url,newsroom_article_id)
      values(dossier,'newsroom',source_url,article) returning id into img;
    digest := encode(sha256(convert_to(img::text,'UTF8')),'hex');
    path := 'editorial/sha256/'||digest||'.jpg';
    url := 'https://local.example/storage/v1/object/public/editorial-images/'||path;
    decision := 'test-prepared:'||img;
    insert into public.editorial_image_assets(public_url,storage_path,sha256,byte_size,content_type)
      values(url,path,digest,100,'image/jpeg');
    insert into storage.objects(bucket_id,name) values('editorial-images',path);
    insert into public.editorial_image_decisions(decision_key,source_url,state,image)
      values(decision,source_url,'ready',jsonb_build_object('publicUrl',url,'path',path,'sha256',digest,'byteSize',100,'contentType','image/jpeg'));
    outputs := outputs || jsonb_build_array(jsonb_build_object('clientKey','output-'||idx,'articlePlanId',null,
      'priority',idx,'workingTitle','Article '||idx,'articleKind','news','lengthMode','standard',
      'editorialInstructions','','destination','new','updateTargetEditorialArticleId',null,
      'productionContextId',ctx,'sourceIds',jsonb_build_array(src),'imageSourceIds',jsonb_build_array(article),
      'publishedContextIds','[]'::jsonb,'imageChoice',jsonb_build_object('mode','dossier_image','dossierImageId',img),
      'preparedImageDecisionKey',decision,'automaticImage',true,'classificationKey',null,'classificationMode',null));
  end loop;
  return jsonb_build_object('dossierId',dossier,'outputs',outputs);
end $$;

create function public.test_production_images_snapshot(dossier uuid) returns jsonb language plpgsql as $$
declare snapshot jsonb; rows jsonb; relation_name text;
begin
  select to_jsonb(d) into snapshot from public.newsroom_editorial_dossiers d where id=dossier;
  foreach relation_name in array array['newsroom_editorial_dossier_article_plans',
    'newsroom_editorial_dossier_article_plan_sources','newsroom_editorial_dossier_article_plan_published_contexts',
    'newsroom_mesa_article_plan_contexts','newsroom_editorial_dossier_images','newsroom_production_save_receipts'] loop
    execute format('select coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),''[]'') from public.%I r where dossier_id=$1',relation_name) into rows using dossier;
    snapshot := snapshot || jsonb_build_object(relation_name,rows);
  end loop;
  return snapshot;
end $$;
