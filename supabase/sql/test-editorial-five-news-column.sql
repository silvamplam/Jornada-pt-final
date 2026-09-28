-- Appended to the existing physical CRUD fixture, inside its transaction.
-- Uses the real v29 -> v22 -> v20 Apply and publication/continuity functions.
create or replace function pg_temp.zones_payload() returns jsonb language sql stable as $$
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'public_title',public_title,
    'public_title_color',public_title_color,'visual_family',visual_family) order by id),'[]'::jsonb)
  from public.matchday_live_layout_zones where matchday_id='a0000000-0000-4000-8000-000000000001';
$$;
create function pg_temp.column_apply(p_zones jsonb, p_blocks jsonb, p_placements jsonb,
  p_host uuid default null, p_token text default null) returns text language plpgsql as $$
declare result text;
begin
  select state_token into strict result from public.apply_matchday_live_layout_physical_v29(
    'a0000000-0000-4000-8000-000000000001','liga_portugal_v1',
    coalesce(p_token,jornada_private.matchday_live_layout_workspace_token_v22('a0000000-0000-4000-8000-000000000001','liga_portugal_v1')),
    p_host,p_zones,p_blocks,p_placements,0,'[]','[]',
    (select jsonb_agg(bank_item_id) from physical_v20_items),'[]','[]',
    jsonb_build_object('headline_title_color',null,'latest_zone_placement',case when p_host is null then 'top' else 'four_news' end,
      'latest_zone_title','Últimas','video_module_active',false,'faixa_public_title','',
      'roundup_video_heading','Vídeo','video_highlight_section_title','Destaque'));
  return result;
end $$;

create temp table column_ids as select n,gen_random_uuid() as id,gen_random_uuid() as block_id
  from generate_series(1,5) n;

do $test$
declare z jsonb; b jsonb; p jsonb; row_value record; color text; before_hash text;
  old_token text; new_token text; host uuid; next_host uuid; result record; family text;
begin
  assert jornada_private.matchday_live_layout_layout_capacity_v20('five_news_column')=5;
  assert not jornada_private.matchday_live_layout_can_host_latest('five_news_column');
  foreach family in array array['six_news','six_news_1_2_3','five_news_balanced','five_news_secondary','four_news'] loop
    assert jornada_private.matchday_live_layout_can_host_latest(family);
  end loop;
  z:=pg_temp.zones_payload(); b:=pg_temp.blocks_payload();
  for row_value in select * from column_ids order by n loop
    z:=z||jsonb_build_array(jsonb_build_object('id',row_value.id,'public_title','Coluna '||row_value.n,
      'public_title_color',null,'visual_family','five_news_column'));
    b:=b||jsonb_build_array(jsonb_build_object('id',row_value.block_id,'block_type','zone','zone_id',row_value.id,'sort_order',10+row_value.n));
  end loop;
  perform pg_temp.column_apply(z,b,'[]');
  assert (select count(*)=5 from public.matchday_live_layout_zones where visual_family='five_news_column' and public_title_color is null);
  z:=pg_temp.zones_payload();
  for row_value in select * from column_ids order by n loop
    color:=(array['#d71920','#008a44','#1234ab','#654321','#abcdef'])[row_value.n];
    select jsonb_agg(case when value->>'id'=row_value.id::text then value||jsonb_build_object('public_title_color',color) else value end)
      into z from jsonb_array_elements(z);
  end loop;
  p:=jsonb_build_array(
    pg_temp.placement(pg_temp.bank_id('atomic_01'),'zone',(select id from column_ids where n=1),1),
    pg_temp.placement(pg_temp.bank_id('atomic_02'),'zone',(select id from column_ids where n=1),3),
    pg_temp.placement(pg_temp.bank_id('atomic_03'),'zone',(select id from column_ids where n=1),5),
    pg_temp.placement(pg_temp.bank_id('atomic_04'),'zone',(select id from column_ids where n=2),2));
  new_token:=pg_temp.column_apply(z,b,p);
  assert (select array_agg(public_title_color order by n)=array['#D71920','#008A44','#1234AB','#654321','#ABCDEF']
    from column_ids join public.matchday_live_layout_zones using(id));
  select * into result from public.read_matchday_live_layout_workspace_v22('a0000000-0000-4000-8000-000000000001','liga_portugal_v1');
  assert (select count(*)=5 from jsonb_array_elements(result.zones) v where v->>'visual_family'='five_news_column' and v->>'public_title_color' is not null);
  assert (select array_agg(slot_position order by slot_position)=array[1,3,5] from public.matchday_live_layout_placements where zone_id=(select id from column_ids where n=1));
  assert pg_temp.column_apply(pg_temp.zones_payload(),b,p)=new_token, 'identical retry must be idempotent';
  before_hash:=pg_temp.physical_hash();
  begin
    perform pg_temp.column_apply(pg_temp.zones_payload(),b,jsonb_set(p,'{0,slot_position}','6'));
    raise exception 'sixth position accepted';
  exception when raise_exception then
    if sqlerrm<>'matchday-live-layout-physical-v20-zone-capacity-invalid' then raise; end if;
  end;
  assert before_hash=pg_temp.physical_hash();
  raise notice 'PASS: five independent zones, colours, sparse placements, Apply/reload and retry';

  old_token:=new_token;
  select jsonb_agg(case when value->>'id'=(select id::text from column_ids where n=1) then value||'{"public_title_color":"#010203"}'::jsonb else value end)
    into z from jsonb_array_elements(pg_temp.zones_payload());
  new_token:=pg_temp.column_apply(z,b,p);
  assert new_token<>old_token, 'colour is OCC state';
  before_hash:=pg_temp.physical_hash();
  begin
    perform pg_temp.column_apply(z,b,p,null,old_token);
    raise exception 'stale colour token accepted';
  exception when raise_exception then
    if sqlerrm<>'matchday-live-layout-latest-companion-v22-concurrent-write' then raise; end if;
  end;
  assert before_hash=pg_temp.physical_hash();
  select jsonb_agg(case when value->>'id'=(select id::text from column_ids where n=1) then value||'{"public_title_color":"#xyzxyz"}'::jsonb else value end)
    into z from jsonb_array_elements(pg_temp.zones_payload());
  begin
    perform pg_temp.column_apply(z,b,p);
    raise exception 'invalid colour accepted';
  exception when raise_exception then
    if sqlerrm<>'editorial-zone-title-color-invalid' then raise; end if;
  end;
  assert before_hash=pg_temp.physical_hash();
  select jsonb_agg(case when value->>'id'=(select id::text from column_ids where n=1) then value||'{"public_title_color":null}'::jsonb else value end)
    into z from jsonb_array_elements(pg_temp.zones_payload());
  perform pg_temp.column_apply(z,b,p);
  assert (select public_title_color is null from public.matchday_live_layout_zones where id=(select id from column_ids where n=1));
  raise notice 'PASS: edit/reset colour, invalid hex and concurrent colour write rejected atomically';

  before_hash:=pg_temp.physical_hash();
  begin
    perform pg_temp.column_apply(pg_temp.zones_payload(),b,p,(select id from column_ids where n=1));
    raise exception 'column host accepted';
  exception when raise_exception then
    if sqlerrm<>'matchday-live-layout-latest-companion-v22-host-ineligible' then raise; end if;
  end;
  assert before_hash=pg_temp.physical_hash();
  select id into host from public.matchday_live_layout_zones where visual_family<>'five_news_column' order by id limit 1;
  select id into next_host from public.matchday_live_layout_zones where visual_family<>'five_news_column' and id<>host order by id limit 1;
  foreach family in array array['six_news','six_news_1_2_3','five_news_balanced','five_news_secondary','four_news'] loop
    select jsonb_agg(case when value->>'id'=host::text then value||jsonb_build_object('visual_family',family) else value end)
      into z from jsonb_array_elements(pg_temp.zones_payload());
    perform pg_temp.column_apply(z,b,p,host);
  end loop;
  select jsonb_agg(case when value->>'id'=host::text then value||'{"visual_family":"five_news_column"}'::jsonb else value end)
    into z from jsonb_array_elements(pg_temp.zones_payload());
  before_hash:=pg_temp.physical_hash();
  begin
    perform pg_temp.column_apply(z,b,p,host);
    raise exception 'ineligible converted host accepted';
  exception when raise_exception then
    if sqlerrm<>'matchday-live-layout-latest-companion-v22-host-ineligible' then raise; end if;
  end;
  assert before_hash=pg_temp.physical_hash();
  perform pg_temp.column_apply(z,b,p,next_host);
  assert exists(select 1 from public.matchday_live_layout_latest_companion where zone_id=next_host);
  perform pg_temp.column_apply(pg_temp.zones_payload(),b,p,null);
  -- Simulate an impossible pre-existing association using direct fixture DML.
  -- The reader/publication must preserve and diagnose it; Apply still rejects it.
  insert into public.matchday_live_layout_latest_companion(matchday_id,zone_id)
    values('a0000000-0000-4000-8000-000000000001',(select id from column_ids where n=2));
  update public.matchday_live_layout_workspace_settings set latest_zone_placement='four_news'
    where matchday_id='a0000000-0000-4000-8000-000000000001';
  select * into result from public.read_matchday_live_layout_workspace_v22('a0000000-0000-4000-8000-000000000001','liga_portugal_v1');
  assert result.latest_companion->>'zone_id'=(select id::text from column_ids where n=2);
  raise notice 'PASS: RPC host exclusion, all five existing hosts, final-state relocation and zero partial effects';
end;
$test$;

create temp table column_historical_result(composition_id uuid);
do $test$
declare composition uuid; zone_payload jsonb; item_payload jsonb; positions integer[];
  case_number integer; family text; old_color text;
begin
  for case_number in 0..7 loop
    positions:=case case_number when 0 then array[]::integer[] when 6 then array[1,3,5]
      when 7 then array[2,5] else array(select n from generate_series(1,case_number) n) end;
    composition:=gen_random_uuid();
    insert into public.matchday_reference_compositions(id,matchday_id,status,presentation_mode,internal_name,
      hierarchical_video_position,hierarchical_editorial_title,hierarchical_editorial_excerpt,hierarchical_editorial_text,hierarchical_editorial_author)
      values(composition,'a0000000-0000-4000-8000-000000000001','draft','hierarchical','Column fixture',0,'Editorial','Excerto','Texto','Autor');
    insert into public.matchday_hierarchical_composition_slots(composition_id,slot_key,source_identity,label_snapshot,title_snapshot,subtitle_snapshot,image_url_snapshot,link_url_snapshot)
      select composition,k,'fixture:'||k,'JORNADA','Abertura','Resumo','/opening.jpg','/noticias/abertura'
      from unnest(array['dominant_main','other_chronicle_1','other_chronicle_2','other_chronicle_3']) k;
    select coalesce(jsonb_agg(jsonb_build_object('position',n,'bankItemId',pg_temp.bank_id('atomic_'||to_char(n,'FM00')))),'[]')
      into item_payload from unnest(positions) n;
    zone_payload:=jsonb_build_array(jsonb_build_object('publicTitle','Cor editorial','publicTitleColor','#d71920',
      'visualFamily','five_news_column','items',item_payload));
    perform public.replace_historical_composition_dynamic_zones('a0000000-0000-4000-8000-000000000001',composition,zone_payload);
    assert (select public_title_color='#D71920' from public.matchday_historical_composition_zones where composition_id=composition);
    assert (select coalesce(array_agg(position order by position),array[]::integer[])=positions from public.matchday_historical_composition_zone_items where composition_id=composition);
    assert not exists(select 1 from public.matchday_historical_composition_zone_items where composition_id=composition
      and (title_snapshot is null or subtitle_snapshot is null or image_url_snapshot is null or link_url_snapshot is null));
    perform public.replace_historical_composition_dynamic_zones('a0000000-0000-4000-8000-000000000001',composition,
      jsonb_set(zone_payload,'{0,publicTitleColor}','"#008a44"'));
    assert (select public_title_color='#008A44' from public.matchday_historical_composition_zones where composition_id=composition);
    perform public.replace_historical_composition_dynamic_zones('a0000000-0000-4000-8000-000000000001',composition,
      jsonb_set(zone_payload,'{0,publicTitleColor}','null'));
    assert (select public_title_color is null from public.matchday_historical_composition_zones where composition_id=composition);
    perform public.replace_historical_composition_dynamic_zones('a0000000-0000-4000-8000-000000000001',composition,zone_payload);
    begin
      perform public.replace_historical_composition_dynamic_zones('a0000000-0000-4000-8000-000000000001',composition,
        jsonb_set(zone_payload,'{0,publicTitleColor}','"red"'));
      raise exception 'historical invalid colour accepted';
    exception when raise_exception then
      if sqlerrm<>'historical_dynamic_zone_invalid' then raise; end if;
    end;
    perform public.activate_matchday_reference_composition('a0000000-0000-4000-8000-000000000001',composition,true);
    assert exists(select 1 from public.matchday_reference_compositions where id=composition and status='published' and is_current);
  end loop;
  insert into column_historical_result values(composition);
  raise notice 'PASS: historical replace/snapshots/activate, 0..5 items, sparse 1/3/5 and empty lead 2/5, colour validation';
  foreach family in array array['six_news','six_news_1_2_3','five_news_balanced','five_news_secondary'] loop
    -- Reuse a draft of the fixture to prove old families remain all-or-nothing.
    update public.matchday_reference_compositions set status='draft' where id=composition;
    perform public.replace_historical_composition_dynamic_zones('a0000000-0000-4000-8000-000000000001',composition,
      jsonb_set(zone_payload,'{0,visualFamily}',to_jsonb(family)));
    begin
      perform public.activate_matchday_reference_composition('a0000000-0000-4000-8000-000000000001',composition,true);
      raise exception 'old partial family accepted';
    exception when raise_exception then
      if sqlerrm<>'historical_dynamic_zones_incomplete' then raise; end if;
    end;
  end loop;
  perform public.replace_historical_composition_dynamic_zones('a0000000-0000-4000-8000-000000000001',composition,zone_payload);
  raise notice 'PASS: old historical families still require full capacity';
end;
$test$;

-- Real publication performs topology, carryover, handoff and physical archive.
select public.publish_matchday_reference_composition(
  'a0000000-0000-4000-8000-000000000001',(select composition_id from column_historical_result));

do $test$
declare composition uuid := (select composition_id from column_historical_result); draft uuid; target_hash text;
begin
  assert not exists(select 1 from jornada_private.matchday_live_layout_physical_zone_maps m
    join public.matchday_live_layout_zones source on source.id=m.source_zone_id
    join public.matchday_live_layout_zones target on target.id=m.target_zone_id
    where m.source_matchday_id='a0000000-0000-4000-8000-000000000001'
      and (source.public_title_color is distinct from target.public_title_color or source.visual_family<>target.visual_family));
  assert (select count(*)=4 from public.matchday_live_layout_placements where matchday_id='a0000000-0000-4000-8000-000000000002');
  assert exists(select 1 from jornada_private.matchday_live_layout_physical_handoffs where source_composition_id=composition and completed_at is not null);
  assert exists(select 1 from public.matchday_live_layout_latest_companion c join public.matchday_live_layout_zones z on z.id=c.zone_id
    where c.matchday_id='a0000000-0000-4000-8000-000000000001' and z.visual_family='five_news_column');
  target_hash:=jornada_private.matchday_live_layout_physical_archive_hash_v19('a0000000-0000-4000-8000-000000000002');
  draft:=public.reopen_matchday_reference_composition('a0000000-0000-4000-8000-000000000001',composition);
  assert draft=public.reopen_matchday_reference_composition('a0000000-0000-4000-8000-000000000001',composition);
  assert (select public_title_color='#D71920' from public.matchday_historical_composition_zones where composition_id=draft);
  assert (select array_agg(position order by position)=array[2,5] from public.matchday_historical_composition_zone_items where composition_id=draft);
  perform public.publish_matchday_reference_composition('a0000000-0000-4000-8000-000000000001',draft);
  assert (select public_title_color='#D71920' from public.matchday_historical_composition_zones where composition_id=draft);
  assert target_hash=jornada_private.matchday_live_layout_physical_archive_hash_v19('a0000000-0000-4000-8000-000000000002');
  begin
    update public.matchday_live_layout_zones set public_title_color='#000001' where id=(select id from column_ids where n=2);
    perform jornada_private.assert_matchday_live_layout_historical_physical_archive_v20(
      'a0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000002',composition);
    raise exception 'archived colour mutation undetected';
  exception when raise_exception then
    if sqlerrm<>'matchday-live-layout-historical-v20-zones-changed' then raise; end if;
  end;
  raise notice 'PASS: real Viva -> historical publish, colours in carryover/handoff/archive, reopen retry and independent republish';
end;
$test$;

set constraints all immediate;
rollback;
