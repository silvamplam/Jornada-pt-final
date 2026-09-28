-- Runs after the five-column fixture in an isolated PostgreSQL 17 transaction.
delete from public.matchday_live_layout_latest_companion where matchday_id='a0000000-0000-4000-8000-000000000001';
create function pg_temp.group_apply(groups jsonb, placements jsonb default null, token text default null) returns text language plpgsql as $$
declare result text;
begin
  select state_token into result from public.apply_matchday_live_layout_physical_v31(
    'a0000000-0000-4000-8000-000000000001','liga_portugal_v1',coalesce(token,jornada_private.matchday_live_layout_workspace_token_v22('a0000000-0000-4000-8000-000000000001','liga_portugal_v1')),
    null,pg_temp.zones_payload(),pg_temp.blocks_payload(),coalesce(placements,pg_temp.placements_payload()),0,'[]','[]',
    (select jsonb_agg(bank_item_id) from physical_v20_items),'[]','[]',
    jsonb_build_object('headline_title_color',null,'latest_zone_placement','top','latest_zone_title','Últimas','video_module_active',false,
      'faixa_public_title','','roundup_video_heading','Vídeo','video_highlight_section_title','Destaque'),groups);
  return result;
end $$;
create temp table group_result(composition_id uuid,group_id uuid);
do $$
declare gid uuid:=gen_random_uuid(); groups jsonb; enabled jsonb; token text; before_hash text; p jsonb; composition uuid; reloaded record;
begin
  groups:=jsonb_build_array(jsonb_build_object('id',gid,'publicTitle','Mercado internacional','enabled',false,
    'zoneIds',(select jsonb_agg(id order by n) from column_ids)));
  token:=pg_temp.group_apply(groups);
  assert (select count(*)=5 from public.matchday_live_layout_column_group_members where group_id=gid);
  select * into reloaded from public.read_matchday_live_layout_workspace_v22('a0000000-0000-4000-8000-000000000001','liga_portugal_v1');
  assert reloaded.workspace_settings->'column_groups'=groups;
  assert reloaded.state_token=token;
  assert pg_temp.group_apply(groups)=token;
  before_hash:=pg_temp.physical_hash(); enabled:=jsonb_set(groups,'{0,enabled}','true');
  begin perform pg_temp.group_apply(enabled); raise exception 'accepted incomplete';
  exception when raise_exception then if sqlerrm<>'editorial-column-group-incomplete' then raise; end if; end;
  assert before_hash=pg_temp.physical_hash() and jornada_private.live_column_groups_json('a0000000-0000-4000-8000-000000000001')=groups;
  begin perform pg_temp.group_apply(jsonb_set(groups,'{0,zoneIds}',(groups->0->'zoneIds')-4)); raise exception 'accepted four members';
  exception when raise_exception then if sqlerrm<>'editorial-column-group-shape-invalid' then raise; end if; end;
  -- Five stories concentrated in only two columns remain invalid.
  p:=pg_temp.placements_payload()||jsonb_build_array(pg_temp.placement(pg_temp.bank_id('atomic_05'),'zone',(select id from column_ids where n=2),5));
  begin perform pg_temp.group_apply(enabled,p); raise exception 'accepted concentrated stories';
  exception when raise_exception then if sqlerrm<>'editorial-column-group-incomplete' then raise; end if; end;
  select jsonb_agg(pg_temp.placement(pg_temp.bank_id('atomic_'||to_char(n,'FM00')),'zone',id,case when n=1 then 3 else 1 end) order by n) into p from column_ids;
  perform pg_temp.group_apply(enabled,p);
  assert (select slot_position=3 from public.matchday_live_layout_placements where zone_id=(select id from column_ids where n=1));
  begin perform pg_temp.group_apply(enabled,p,token); raise exception 'accepted stale OCC';
  exception when raise_exception then if sqlerrm<>'matchday-live-layout-latest-companion-v22-concurrent-write' then raise; end if; end;
  token:=jornada_private.matchday_live_layout_workspace_token_v22('a0000000-0000-4000-8000-000000000001','liga_portugal_v1');
  enabled:=jsonb_set(enabled,'{0,publicTitle}','"Clubes e mercado"');
  assert pg_temp.group_apply(enabled)<>token;
  assert (select public_title_color='#008A44' from public.matchday_live_layout_zones where id=(select id from column_ids where n=2));
  perform pg_temp.group_apply('[]');
  assert (select count(*)=5 from public.matchday_live_layout_placements where zone_id in(select id from column_ids));
  assert (select count(*)=5 from public.matchday_live_layout_zones where id in(select id from column_ids));
  perform pg_temp.group_apply(enabled);
  raise notice 'PASS: explicit grouping, five members, title/state/order, Apply/reload/retry, sparse slots, colours, min-one-each, OCC and lossless ungroup';
  -- Deferred integrity also protects older RPCs/direct DML.
  begin
    delete from public.matchday_live_layout_column_group_members where group_id=gid and member_position=5;
    set constraints all immediate;
    raise exception 'accepted orphan group';
  exception when raise_exception then if sqlerrm<>'editorial-column-group-members-or-order-invalid' then raise; end if; end;
  set constraints all deferred;
  composition:=gen_random_uuid();
  insert into public.matchday_reference_compositions(id,matchday_id,status,presentation_mode,internal_name,hierarchical_video_position,
    hierarchical_editorial_title,hierarchical_editorial_excerpt,hierarchical_editorial_text,hierarchical_editorial_author)
    values(composition,'a0000000-0000-4000-8000-000000000001','draft','hierarchical','Group fixture',0,'Editorial','Excerto','Texto','Autor');
  assert (select count(*)=1 from public.matchday_historical_column_groups where composition_id=composition and id=gid and public_title='Clubes e mercado');
  assert (select array_agg(zone_id order by member_position)=(select array_agg(id order by n) from column_ids)
    from public.matchday_historical_column_group_members where composition_id=composition);
  insert into public.matchday_hierarchical_composition_slots(composition_id,slot_key,source_identity,label_snapshot,title_snapshot,subtitle_snapshot,image_url_snapshot,link_url_snapshot)
    select composition,k,'fixture:'||k,'JORNADA','Abertura','Resumo','/opening.jpg','/noticias/abertura'
    from unnest(array['dominant_main','other_chronicle_1','other_chronicle_2','other_chronicle_3']) k;
  insert into group_result values(composition,gid);
  raise notice 'PASS: first historical draft snapshots explicit live group, identities, members and sparse stories';
end $$;

do $$
declare composition uuid:=(select composition_id from group_result); gid uuid:=(select group_id from group_result);
  expected jsonb; zones jsonb; changed jsonb; another uuid; imported integer;
begin
  expected:=jornada_private.historical_column_groups_json(composition);
  select jsonb_agg(jsonb_build_object('id',z.id,'publicTitle',z.public_title,'publicTitleColor',z.public_title_color,'visualFamily',z.visual_family,
    'columnGroup',jsonb_build_object('id',g.id,'publicTitle',g.public_title,'enabled',g.is_enabled,'position',m.member_position),
    'items',(select jsonb_agg(jsonb_build_object('position',i.position,'bankItemId',i.bank_item_id) order by i.position)
      from public.matchday_historical_composition_zone_items i where i.zone_id=z.id)) order by z.sort_order)
    into zones from public.matchday_historical_composition_zones z
    join public.matchday_historical_column_group_members m on m.zone_id=z.id and m.composition_id=z.composition_id
    join public.matchday_historical_column_groups g on g.composition_id=m.composition_id and g.id=m.group_id
    where z.composition_id=composition;
  -- Replace/reload retains zone IDs instead of regenerating all five members.
  perform public.apply_historical_composition_workspace_plan_v4('a0000000-0000-4000-8000-000000000001',composition,'[]',null,zones,expected);
  assert expected=jornada_private.historical_column_groups_json(composition);
  assert (select count(*)=5 from public.matchday_historical_composition_zone_items where composition_id=composition);
  begin
    perform public.apply_historical_composition_workspace_plan_v4('a0000000-0000-4000-8000-000000000001',composition,'[]',null,zones,'[]');
    raise exception 'accepted old ungrouped editor';
  exception when raise_exception then if sqlerrm<>'editorial-column-group-concurrent-write' then raise; end if; end;
  begin
    update public.matchday_reference_compositions set hierarchical_video_position=2 where id=composition;
    set constraints all immediate;
    raise exception 'accepted video inside group';
  exception when raise_exception then if sqlerrm<>'editorial-column-group-members-or-order-invalid' then raise; end if; end;
  set constraints all deferred;
  select jsonb_agg(jsonb_set(value,'{columnGroup,publicTitle}','"Histórica editada"')) into changed from jsonb_array_elements(zones);
  perform public.apply_historical_composition_workspace_plan_v4('a0000000-0000-4000-8000-000000000001',composition,'[]',null,changed,expected);
  begin
    perform public.apply_historical_composition_workspace_plan_v4('a0000000-0000-4000-8000-000000000001',composition,'[]',null,zones,expected);
    raise exception 'accepted stale historical title';
  exception when raise_exception then if sqlerrm<>'editorial-column-group-concurrent-write' then raise; end if; end;
  perform public.apply_historical_composition_workspace_plan_v4('a0000000-0000-4000-8000-000000000001',composition,'[]',null,zones,jornada_private.historical_column_groups_json(composition));
  -- Existing drafts require an explicit import, with no replacement of their zones.
  begin
    another:=composition;
    delete from public.matchday_historical_column_groups where composition_id=another;
    delete from public.matchday_historical_composition_zones where composition_id=another;
    assert jornada_private.historical_column_groups_json(another)='[]';
    insert into public.matchday_historical_composition_zones(composition_id,sort_order,public_title,visual_family) values(another,1,'Manter esta zona','six_news');
    -- A snapshot without its old Bank FK still represents the same story.
    insert into public.matchday_historical_composition_zone_items(composition_id,zone_id,position,source_identity,title_snapshot,link_url_snapshot)
      select another,z.id,1,b.source_type||':'||b.source_id,b.title,b.link_url
      from public.matchday_historical_composition_zones z cross join public.matchday_editorial_bank_items b
      where z.composition_id=another and b.id=pg_temp.bank_id('atomic_05');
    begin
      perform public.import_historical_column_groups_v31('a0000000-0000-4000-8000-000000000001',another,'[]');
      raise exception 'accepted duplicate snapshot';
    exception when raise_exception then if sqlerrm<>'editorial-column-group-story-already-used' then raise; end if; end;
    assert (select count(*)=1 from public.matchday_historical_composition_zones where composition_id=another);
    assert jornada_private.historical_column_groups_json(another)='[]';
    delete from public.matchday_historical_composition_zone_items where composition_id=another;
    imported:=public.import_historical_column_groups_v31('a0000000-0000-4000-8000-000000000001',another,'[]');
    assert imported=1;
    assert (select count(*)=6 from public.matchday_historical_composition_zones where composition_id=another);
    assert (select count(*)=1 from public.matchday_historical_composition_zones where composition_id=another and public_title='Manter esta zona');
    assert (select count(*)=5 from public.matchday_historical_composition_zone_items where composition_id=another);
    assert (select public_title='Clubes e mercado' and is_enabled from public.matchday_historical_column_groups where composition_id=another and id=gid);
    assert public.import_historical_column_groups_v31('a0000000-0000-4000-8000-000000000001',another,jornada_private.historical_column_groups_json(another))=0;
    set constraints all immediate;
    raise exception 'rollback successful import fixture';
  exception when raise_exception then if sqlerrm<>'rollback successful import fixture' then raise; end if; end;
  set constraints all deferred;
  raise notice 'PASS: historical atomic replace, stable IDs/HEX/slots, title OCC including no-group race, video barrier and explicit existing-draft import/retry';
end $$;

select public.publish_matchday_reference_composition('a0000000-0000-4000-8000-000000000001',(select composition_id from group_result));
do $$
declare composition uuid:=(select composition_id from group_result); gid uuid:=(select group_id from group_result); draft uuid; target_hash text;
begin
  assert (select count(*)=1 from public.matchday_live_layout_column_groups where matchday_id='a0000000-0000-4000-8000-000000000002' and id=gid and is_enabled and public_title='Clubes e mercado');
  assert exists(select 1 from jornada_private.matchday_historical_physical_archive_certificates_v20 where source_composition_id=composition);
  target_hash:=jornada_private.matchday_live_layout_physical_archive_hash_v19('a0000000-0000-4000-8000-000000000002');
  draft:=public.reopen_matchday_reference_composition('a0000000-0000-4000-8000-000000000001',composition);
  assert draft=public.reopen_matchday_reference_composition('a0000000-0000-4000-8000-000000000001',composition);
  assert (select count(*)=1 from public.matchday_historical_column_groups where composition_id=draft and id=gid and is_enabled and public_title='Clubes e mercado');
  assert (select count(*)=5 from public.matchday_historical_column_group_members where composition_id=draft and group_id=gid);
  assert (select array_agg(public_title_color order by sort_order)=array[null,'#008A44','#1234AB','#654321','#ABCDEF'] from public.matchday_historical_composition_zones where composition_id=draft);
  perform public.publish_matchday_reference_composition('a0000000-0000-4000-8000-000000000001',draft);
  assert target_hash=jornada_private.matchday_live_layout_physical_archive_hash_v19('a0000000-0000-4000-8000-000000000002');
  begin update public.matchday_live_layout_column_groups set public_title='Changed archive' where matchday_id='a0000000-0000-4000-8000-000000000001';
    raise exception 'accepted archived group edit';
  exception when raise_exception then if sqlerrm<>'editorial-column-group-archived-immutable' then raise; end if; end;
  perform jornada_private.assert_matchday_live_layout_historical_physical_archive_v20('a0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000002',composition);
  raise notice 'PASS: real publication, carryover, handoff, certified archive, reopen/retry, republish and target independence';
end $$;
set constraints all immediate;
rollback;
