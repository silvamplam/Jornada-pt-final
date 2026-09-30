begin;

-- Preparation remains in editorial_image_decisions. Only this receipt records
-- the editor's final, atomic save (including an explicit 'Sem imagem').
create table public.newsroom_production_save_receipts (
  request_id uuid primary key,
  dossier_id uuid not null references public.newsroom_editorial_dossiers(id),
  expected_state text not null,
  outputs jsonb not null,
  result jsonb not null,
  created_at timestamptz not null default now()
);
create index newsroom_production_save_receipts_dossier_idx
  on public.newsroom_production_save_receipts(dossier_id);
alter table public.newsroom_production_save_receipts enable row level security;
revoke all on public.newsroom_production_save_receipts from public, anon, authenticated;
grant select, insert on public.newsroom_production_save_receipts to service_role;

create function public.newsroom_production_save_state_v1(p_dossier_id uuid)
returns table(state_token text, confirmed_image_plan_ids uuid[])
language plpgsql stable security invoker set search_path = '' set timezone = 'UTC' as $$
declare snapshot jsonb; rows jsonb; relation_name text;
begin
  -- An upload can extend the bank without changing the open editorial form.
  -- Selected images are included below; new selections are validated by the
  -- image authority inside the transaction, under row locks.
  select to_jsonb(d) - 'updated_at' into snapshot
    from public.newsroom_editorial_dossiers d where d.id=p_dossier_id;
  if snapshot is null then raise exception 'editorial_dossier_not_found'; end if;
  foreach relation_name in array array[
    'newsroom_editorial_dossier_sources',
    'newsroom_editorial_dossier_article_plans',
    'newsroom_editorial_dossier_article_plan_sources',
    'newsroom_editorial_dossier_published_contexts',
    'newsroom_editorial_dossier_article_plan_published_contexts',
    'newsroom_mesa_production_contexts',
    'newsroom_mesa_production_context_items',
    'newsroom_mesa_production_context_sources',
    'newsroom_mesa_article_plan_contexts',
    'newsroom_mesa_output_publications'
  ] loop
    execute format('select coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),''[]''::jsonb) from public.%I r where dossier_id=$1',relation_name)
      into rows using p_dossier_id;
    snapshot := snapshot || jsonb_build_object(relation_name,rows);
  end loop;
  snapshot := snapshot || jsonb_build_object('selectedImages',(
    select coalesce(jsonb_agg(to_jsonb(i) order by i.id),'[]'::jsonb)
    from public.newsroom_editorial_dossier_images i
    where i.dossier_id=p_dossier_id and exists (
      select 1 from public.newsroom_editorial_dossier_article_plans p
      where p.dossier_id=p_dossier_id and p.dossier_image_id=i.id
    )
  ),'targets',(
    select coalesce(jsonb_agg(to_jsonb(a) order by a.id),'[]'::jsonb)
    from public.editorial_articles a where exists (
      select 1 from public.newsroom_editorial_dossier_published_contexts c
      where c.dossier_id=p_dossier_id and c.editorial_article_id=a.id
    )
  ));
  return query select encode(sha256(convert_to(snapshot::text,'UTF8')),'hex'),
    coalesce((select array_agg(distinct (o->>'articlePlanId')::uuid)
      from public.newsroom_production_save_receipts r,
        lateral jsonb_array_elements(r.result->'outputs') o
      where r.dossier_id=p_dossier_id),'{}'::uuid[]);
end $$;
revoke all on function public.newsroom_production_save_state_v1(uuid) from public,anon,authenticated;
grant execute on function public.newsroom_production_save_state_v1(uuid) to service_role;

create function public.newsroom_save_production_batch_v1(
  p_dossier_id uuid, p_expected_state text, p_request_id uuid, p_outputs jsonb
)
returns table(result jsonb)
language plpgsql volatile security definer set search_path = '' as $$
declare
  receipt public.newsroom_production_save_receipts;
  current_state record;
  item jsonb; idx integer := 0; plan_id uuid; image_id uuid;
  source_ids uuid[]; context_ids uuid[]; plan_ids uuid[] := '{}';
  saved jsonb := '[]'::jsonb; response jsonb; relation_name text;
  image_row public.newsroom_editorial_dossier_images;
  old_plan public.newsroom_editorial_dossier_article_plans;
  confirmed_ids uuid[]; v_decision_key text; selected_mode text;
  automatic boolean; candidate_url text; asset public.editorial_image_assets;
begin
  if p_dossier_id is null or p_request_id is null or p_expected_state is null
    or p_expected_state !~ '^[a-f0-9]{64}$'
    or jsonb_typeof(p_outputs) is distinct from 'array'
    or jsonb_array_length(p_outputs) not between 1 and 30 then
    raise exception 'production-batch-input-invalid';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('production-save-request:'||p_request_id::text,0));
  select * into receipt from public.newsroom_production_save_receipts where request_id=p_request_id;
  if found then
    if receipt.dossier_id is distinct from p_dossier_id or receipt.outputs is distinct from p_outputs
      or receipt.expected_state is distinct from p_expected_state then
      raise exception 'production-batch-request-conflict';
    end if;
    return query select receipt.result;
    return;
  end if;
  -- Share the existing output-count lock, and lock the rows used by legacy
  -- writers too. No transaction control or exception swallowing: any error
  -- rolls back confirmations, plans, selections, output count AND receipt.
  perform pg_advisory_xact_lock(hashtextextended('newsroom-mesa-shared-outputs:'||p_dossier_id::text,0));
  perform 1 from public.newsroom_mesa_production_contexts where dossier_id=p_dossier_id for update;
  perform 1 from public.newsroom_editorial_dossiers where id=p_dossier_id for update;
  if not found then raise exception 'editorial_dossier_not_found'; end if;
  foreach relation_name in array array[
    'newsroom_editorial_dossier_sources',
    'newsroom_editorial_dossier_article_plans',
    'newsroom_editorial_dossier_article_plan_sources',
    'newsroom_editorial_dossier_published_contexts',
    'newsroom_editorial_dossier_article_plan_published_contexts',
    'newsroom_mesa_production_context_items',
    'newsroom_mesa_production_context_sources',
    'newsroom_mesa_article_plan_contexts',
    'newsroom_mesa_output_publications',
    'newsroom_editorial_dossier_images'
  ] loop
    execute format('select 1 from public.%I where dossier_id=$1 for update',relation_name) using p_dossier_id;
  end loop;
  perform 1 from public.editorial_articles a where exists (
    select 1 from public.newsroom_editorial_dossier_published_contexts c
    where c.dossier_id=p_dossier_id and c.editorial_article_id=a.id
  ) for share;
  select * into strict current_state from public.newsroom_production_save_state_v1(p_dossier_id);
  if current_state.state_token is distinct from p_expected_state then
    raise exception 'production-batch-stale-state';
  end if;
  confirmed_ids := current_state.confirmed_image_plan_ids;
  if (select count(distinct o->>'clientKey') from jsonb_array_elements(p_outputs) o) <> jsonb_array_length(p_outputs)
    or (select count(o->>'articlePlanId') <> count(distinct o->>'articlePlanId') from jsonb_array_elements(p_outputs) o) then
    raise exception 'production-batch-input-invalid';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_outputs) o
    where o->'imageChoice'->>'mode'='dossier_image'
    group by o->'imageChoice'->>'dossierImageId'
    having count(distinct coalesce(o->>'preparedImageDecisionKey','<current>'))>1
  ) then raise exception 'production-batch-image-revision-conflict'; end if;
  for item in select value from jsonb_array_elements(p_outputs) loop
    idx := idx+1;
    if jsonb_typeof(item) is distinct from 'object'
      or coalesce(length(item->>'clientKey'),0) not between 1 and 200
      or (item->>'priority')::integer is distinct from idx
      or coalesce(length(item->>'workingTitle'),0) not between 1 and 180
      or coalesce(length(item->>'editorialInstructions'),0)>12000
      or jsonb_typeof(item->'sourceIds') is distinct from 'array'
      or jsonb_array_length(item->'sourceIds') not between 1 and 20
      or jsonb_typeof(item->'publishedContextIds') is distinct from 'array' then
      raise exception 'production-batch-output-invalid';
    end if;
    plan_id := (item->>'articlePlanId')::uuid;
    image_id := (item->'imageChoice'->>'dossierImageId')::uuid;
    selected_mode := item->'imageChoice'->>'mode';
    v_decision_key := item->>'preparedImageDecisionKey';
    automatic := coalesce((item->>'automaticImage')::boolean,false);
    select array_agg(value::uuid) into source_ids from jsonb_array_elements_text(item->'sourceIds');
    select coalesce(array_agg(value::uuid),'{}') into context_ids from jsonb_array_elements_text(item->'publishedContextIds');
    select * into old_plan from public.newsroom_editorial_dossier_article_plans
      where id=plan_id and dossier_id=p_dossier_id;
    if automatic and ((item->>'destination')='update'
      or (old_plan.id is not null and (old_plan.image_choice<>'unselected' or old_plan.id=any(confirmed_ids))
        and (old_plan.image_choice is distinct from selected_mode or old_plan.dossier_image_id is distinct from image_id))) then
      raise exception 'production-batch-human-image-choice-preserved';
    end if;
    if selected_mode='dossier_image' then
      select * into image_row from public.newsroom_editorial_dossier_images
        where id=image_id and dossier_id=p_dossier_id;
      if not found then raise exception 'production_workspace_image_not_in_dossier'; end if;
      if automatic and old_plan.dossier_image_id=image_id and v_decision_key is not null
        and exists (select 1 from public.editorial_image_decisions d where d.decision_key=v_decision_key
          and d.image->>'publicUrl' is distinct from image_row.frozen_url) then
        raise exception 'production-batch-human-image-choice-preserved';
      end if;
      if automatic and not exists (
        select 1 from public.newsroom_editorial_dossier_sources s
        where s.dossier_id=p_dossier_id and s.id=any(source_ids)
          and s.newsroom_article_id=image_row.newsroom_article_id
          and (item->'imageSourceIds') ? s.newsroom_article_id::text
      ) then raise exception 'production-batch-image-output-mismatch'; end if;
      if v_decision_key is not null then
        perform public.editorial_confirm_dossier_image_v1(image_id,v_decision_key);
      end if;
      select frozen_url into candidate_url from public.newsroom_editorial_dossier_images where id=image_id;
      select * into asset from public.editorial_image_assets where public_url=candidate_url;
      if not found or not exists (
        select 1 from storage.objects where bucket_id='editorial-images' and name=asset.storage_path
      ) then raise exception 'image-materialization-required'; end if;
    elsif v_decision_key is not null then
      raise exception 'production-batch-unused-image-decision';
    end if;
    if item->>'productionContextId' is null then
      select article_plan_id into strict plan_id from public.newsroom_save_editorial_dossier_article_plan(
        p_dossier_id,plan_id,item->>'workingTitle','planned',idx*10,
        item->>'articleKind',item->>'lengthMode',item->>'editorialInstructions',source_ids);
    else
      select article_plan_id into strict plan_id from public.newsroom_save_mesa_context_article_plan_v1(
        p_dossier_id,plan_id,item->>'workingTitle','planned',idx*10,
        item->>'articleKind',item->>'lengthMode',item->>'editorialInstructions',source_ids,
        (item->>'productionContextId')::uuid);
    end if;
    perform public.newsroom_save_dossier_article_plan_state_v3(
      p_dossier_id,plan_id,item->>'destination',(item->>'updateTargetEditorialArticleId')::uuid,
      context_ids,selected_mode,image_id,item->>'classificationKey',item->>'classificationMode');
    plan_ids := array_append(plan_ids,plan_id);
    saved := saved || jsonb_build_array(jsonb_build_object('clientKey',item->>'clientKey',
      'priority',idx,'articlePlanId',plan_id,'created',item->>'articlePlanId' is null,'materialized',false));
  end loop;
  perform public.newsroom_set_mesa_shared_outputs_v2(p_dossier_id,plan_ids);
  select * into strict current_state from public.newsroom_production_save_state_v1(p_dossier_id);
  response := jsonb_build_object('dossierId',p_dossier_id,'outputCount',idx,'outputs',saved,'stateToken',current_state.state_token);
  insert into public.newsroom_production_save_receipts(request_id,dossier_id,expected_state,outputs,result)
    values(p_request_id,p_dossier_id,p_expected_state,p_outputs,response);
  return query select response;
end $$;
revoke all on function public.newsroom_save_production_batch_v1(uuid,text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.newsroom_save_production_batch_v1(uuid,text,uuid,jsonb) to service_role;

commit;
