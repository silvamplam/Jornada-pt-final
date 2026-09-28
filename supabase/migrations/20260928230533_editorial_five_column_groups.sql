begin;

-- No data backfill: grouping is an explicit editorial Apply operation.
-- Group identity survives handoff/reopen; context is part of its primary key.
create table public.matchday_live_layout_column_groups (
  matchday_id uuid not null references public.matchdays(id) on delete cascade,
  id uuid not null default gen_random_uuid(),
  public_title text not null check (public_title = btrim(public_title) and length(public_title) between 1 and 120),
  is_enabled boolean not null default false,
  anchor_zone_id uuid not null,
  primary key (matchday_id, id),
  unique (matchday_id, anchor_zone_id),
  foreign key (anchor_zone_id, matchday_id) references public.matchday_live_layout_zones(id, matchday_id) deferrable initially deferred
);
create table public.matchday_live_layout_column_group_members (
  matchday_id uuid not null,
  group_id uuid not null,
  zone_id uuid not null,
  member_position integer not null check (member_position between 1 and 5),
  primary key (matchday_id, group_id, member_position),
  unique (matchday_id, zone_id),
  foreign key (matchday_id, group_id) references public.matchday_live_layout_column_groups(matchday_id, id) on delete cascade,
  foreign key (zone_id, matchday_id) references public.matchday_live_layout_zones(id, matchday_id) deferrable initially deferred
);
create table public.matchday_historical_column_groups (
  composition_id uuid not null references public.matchday_reference_compositions(id) on delete cascade,
  id uuid not null default gen_random_uuid(),
  public_title text not null check (public_title = btrim(public_title) and length(public_title) between 1 and 120),
  is_enabled boolean not null default false,
  anchor_zone_id uuid not null,
  primary key (composition_id, id),
  unique (composition_id, anchor_zone_id),
  foreign key (anchor_zone_id, composition_id) references public.matchday_historical_composition_zones(id, composition_id) deferrable initially deferred
);
create table public.matchday_historical_column_group_members (
  composition_id uuid not null,
  group_id uuid not null,
  zone_id uuid not null,
  member_position integer not null check (member_position between 1 and 5),
  primary key (composition_id, group_id, member_position),
  unique (composition_id, zone_id),
  foreign key (composition_id, group_id) references public.matchday_historical_column_groups(composition_id, id) on delete cascade,
  foreign key (zone_id, composition_id) references public.matchday_historical_composition_zones(id, composition_id) deferrable initially deferred
);
create index live_column_group_anchor_idx on public.matchday_live_layout_column_groups(anchor_zone_id, matchday_id);
create index live_column_group_zone_idx on public.matchday_live_layout_column_group_members(zone_id, matchday_id);
create index historical_column_group_anchor_idx on public.matchday_historical_column_groups(anchor_zone_id, composition_id);
create index historical_column_group_zone_idx on public.matchday_historical_column_group_members(zone_id, composition_id);

alter table public.matchday_live_layout_column_groups enable row level security;
alter table public.matchday_live_layout_column_group_members enable row level security;
alter table public.matchday_historical_column_groups enable row level security;
alter table public.matchday_historical_column_group_members enable row level security;
revoke all on public.matchday_live_layout_column_groups, public.matchday_live_layout_column_group_members,
  public.matchday_historical_column_groups, public.matchday_historical_column_group_members from public, anon, authenticated;
grant select, insert, update, delete on public.matchday_live_layout_column_groups, public.matchday_live_layout_column_group_members,
  public.matchday_historical_column_groups, public.matchday_historical_column_group_members to service_role;

create function jornada_private.live_column_groups_json(p_context uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id',g.id,'publicTitle',g.public_title,'enabled',g.is_enabled,
    'zoneIds',(select jsonb_agg(m.zone_id order by m.member_position) from public.matchday_live_layout_column_group_members m
      where m.matchday_id=g.matchday_id and m.group_id=g.id)) order by g.id),'[]'::jsonb)
  from public.matchday_live_layout_column_groups g where g.matchday_id=p_context;
$$;
create function jornada_private.historical_column_groups_json(p_context uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id',g.id,'publicTitle',g.public_title,'enabled',g.is_enabled,
    'zoneIds',(select jsonb_agg(m.zone_id order by m.member_position) from public.matchday_historical_column_group_members m
      where m.composition_id=g.composition_id and m.group_id=g.id)) order by g.id),'[]'::jsonb)
  from public.matchday_historical_column_groups g where g.composition_id=p_context;
$$;
create function jornada_private.live_column_groups_hash_suffix(p_context uuid) returns text
language sql stable security definer set search_path = '' as $$
  select case when value='[]'::jsonb then '' else '|column_groups='||value::text end
  from (select jornada_private.live_column_groups_json(p_context) as value) s;
$$;

-- Check the final transaction, so a reorder cannot temporarily invalidate a group.
create function jornada_private.assert_live_column_groups(p_context uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if exists (
    select 1 from public.matchday_live_layout_column_groups g
    left join public.matchday_live_layout_column_group_members m on m.matchday_id=g.matchday_id and m.group_id=g.id
    left join public.matchday_live_layout_zones z on z.id=m.zone_id and z.matchday_id=m.matchday_id
    left join public.matchday_live_layout_blocks b on b.zone_id=z.id and b.matchday_id=z.matchday_id
    left join public.matchday_live_layout_blocks a on a.zone_id=g.anchor_zone_id and a.matchday_id=g.matchday_id
    where g.matchday_id=p_context group by g.id,g.is_enabled,g.anchor_zone_id
    having count(m.zone_id)<>5 or bool_or(z.visual_family is distinct from 'five_news_column')
      or bool_or(b.sort_order is null or a.sort_order is null or b.sort_order<>a.sort_order+m.member_position-1)
      or bool_or(m.member_position=1 and m.zone_id<>g.anchor_zone_id)
  ) then raise exception 'editorial-column-group-members-or-order-invalid'; end if;
  if exists (select 1 from public.matchday_live_layout_column_groups g
    join public.matchday_live_layout_column_group_members m on m.matchday_id=g.matchday_id and m.group_id=g.id
    where g.matchday_id=p_context and g.is_enabled and not exists (
      select 1 from public.matchday_live_layout_placements p where p.matchday_id=p_context and p.zone_id=m.zone_id and p.placement_type='zone'
    )) then raise exception 'editorial-column-group-incomplete'; end if;
end $$;
create function jornada_private.assert_historical_column_groups(p_context uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if exists (
    select 1 from public.matchday_historical_column_groups g
    left join public.matchday_historical_column_group_members m on m.composition_id=g.composition_id and m.group_id=g.id
    left join public.matchday_historical_composition_zones z on z.id=m.zone_id and z.composition_id=m.composition_id
    left join public.matchday_historical_composition_zones a on a.id=g.anchor_zone_id and a.composition_id=g.composition_id
    join public.matchday_reference_compositions c on c.id=g.composition_id
    where g.composition_id=p_context group by g.id,g.is_enabled,g.anchor_zone_id,c.hierarchical_video_position
    having count(m.zone_id)<>5 or bool_or(z.visual_family is distinct from 'five_news_column')
      or bool_or(z.sort_order is null or z.sort_order<>a.sort_order+m.member_position-1)
      or bool_or(m.member_position=1 and m.zone_id<>g.anchor_zone_id)
      or (c.hierarchical_video_position>=min(z.sort_order) and c.hierarchical_video_position<max(z.sort_order))
  ) then raise exception 'editorial-column-group-members-or-order-invalid'; end if;
  if exists (select 1 from public.matchday_historical_column_groups g
    join public.matchday_historical_column_group_members m on m.composition_id=g.composition_id and m.group_id=g.id
    where g.composition_id=p_context and g.is_enabled and not exists (
      select 1 from public.matchday_historical_composition_zone_items p where p.composition_id=p_context and p.zone_id=m.zone_id
        and nullif(btrim(p.title_snapshot),'') is not null and nullif(btrim(p.link_url_snapshot),'') is not null
    )) then raise exception 'editorial-column-group-incomplete'; end if;
end $$;

create function jornada_private.check_editorial_column_groups() returns trigger
language plpgsql security definer set search_path = '' as $$
declare before_row jsonb := case when tg_op<>'INSERT' then to_jsonb(old) else '{}'::jsonb end;
        after_row jsonb := case when tg_op<>'DELETE' then to_jsonb(new) else '{}'::jsonb end;
        context_id uuid;
begin
  if tg_argv[0]='live' then
    for context_id in select distinct id from (values ((before_row->>'matchday_id')::uuid),((after_row->>'matchday_id')::uuid)) v(id) where id is not null loop
      perform jornada_private.assert_live_column_groups(context_id);
    end loop;
  else
    for context_id in select distinct id from (values ((before_row->>'composition_id')::uuid),((after_row->>'composition_id')::uuid),
      (case when tg_table_name='matchday_reference_compositions' then coalesce(after_row->>'id',before_row->>'id')::uuid end)) v(id) where id is not null loop
      perform jornada_private.assert_historical_column_groups(context_id);
    end loop;
  end if;
  return null;
end $$;

do $$ declare name text; begin
  foreach name in array array['matchday_live_layout_column_groups','matchday_live_layout_column_group_members','matchday_live_layout_zones','matchday_live_layout_blocks','matchday_live_layout_placements'] loop
    execute format('create constraint trigger editorial_column_group_integrity after insert or update or delete on public.%I deferrable initially deferred for each row execute function jornada_private.check_editorial_column_groups(''live'')',name);
  end loop;
  foreach name in array array['matchday_historical_column_groups','matchday_historical_column_group_members','matchday_historical_composition_zones','matchday_historical_composition_zone_items','matchday_reference_compositions'] loop
    execute format('create constraint trigger editorial_column_group_integrity after insert or update or delete on public.%I deferrable initially deferred for each row execute function jornada_private.check_editorial_column_groups(''historical'')',name);
  end loop;
end $$;

create function jornada_private.guard_editorial_column_group_write() returns trigger
language plpgsql security definer set search_path = '' as $$
declare context_id uuid;
begin
  perform jornada_private.acquire_matchday_live_layout_cutover_writer_lock();
  if tg_op='UPDATE' and ((tg_argv[0]='live' and to_jsonb(new)->>'matchday_id' is distinct from to_jsonb(old)->>'matchday_id')
    or (tg_argv[0]='historical' and to_jsonb(new)->>'composition_id' is distinct from to_jsonb(old)->>'composition_id'))
    then raise exception 'editorial-column-group-context-immutable'; end if;
  if tg_argv[0]='live' then
    context_id := coalesce(new.matchday_id,old.matchday_id);
    perform 1 from public.matchdays where id=context_id for update;
    if exists(select 1 from jornada_private.matchday_historical_physical_archive_certificates_v20 where source_matchday_id=context_id)
      then raise exception 'editorial-column-group-archived-immutable'; end if;
  else
    context_id := coalesce(new.composition_id,old.composition_id);
    perform 1 from public.matchday_reference_compositions where id=context_id and status='draft' for update;
    if not found then raise exception 'editorial-column-group-historical-not-editable'; end if;
  end if;
  return case when tg_op='DELETE' then old else new end;
end $$;
create trigger column_group_write_guard before insert or update or delete on public.matchday_live_layout_column_groups for each row execute function jornada_private.guard_editorial_column_group_write('live');
create trigger column_group_write_guard before insert or update or delete on public.matchday_live_layout_column_group_members for each row execute function jornada_private.guard_editorial_column_group_write('live');
create trigger column_group_write_guard before insert or update or delete on public.matchday_historical_column_groups for each row execute function jornada_private.guard_editorial_column_group_write('historical');
create trigger column_group_write_guard before insert or update or delete on public.matchday_historical_column_group_members for each row execute function jornada_private.guard_editorial_column_group_write('historical');

create function jornada_private.replace_live_column_groups(p_context uuid,p_groups jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare g jsonb;
begin
  if jsonb_typeof(p_groups) is distinct from 'array' then raise exception 'editorial-column-group-payload-invalid'; end if;
  -- No silent data loss: group deletion only deletes membership, never zones/items.
  delete from public.matchday_live_layout_column_groups where matchday_id=p_context;
  for g in select value from jsonb_array_elements(p_groups) loop
    if jsonb_typeof(g) is distinct from 'object' or jsonb_typeof(g->'enabled') is distinct from 'boolean'
      or jsonb_typeof(g->'zoneIds') is distinct from 'array' or jsonb_array_length(g->'zoneIds')<>5
      or jsonb_typeof(g->'publicTitle') is distinct from 'string'
      or (select count(*) from jsonb_object_keys(g))<>4 then raise exception 'editorial-column-group-shape-invalid'; end if;
    insert into public.matchday_live_layout_column_groups(matchday_id,id,public_title,is_enabled,anchor_zone_id)
      values(p_context,(g->>'id')::uuid,btrim(g->>'publicTitle'),(g->>'enabled')::boolean,(g->'zoneIds'->>0)::uuid);
    insert into public.matchday_live_layout_column_group_members(matchday_id,group_id,zone_id,member_position)
      select p_context,(g->>'id')::uuid,value::uuid,ordinality::integer from jsonb_array_elements_text(g->'zoneIds') with ordinality;
  end loop;
  perform jornada_private.assert_live_column_groups(p_context);
end $$;

create function public.apply_matchday_live_layout_physical_v31(
  p_matchday_id uuid,p_profile_key text,p_expected_physical_state_token text,p_latest_companion_zone_id uuid,
  p_zones jsonb,p_blocks jsonb,p_placements jsonb,p_faixa_slot_count integer,p_explicit_bank_item_ids jsonb,
  p_displaced_bank_item_ids jsonb,p_worked_bank_item_ids jsonb,p_faixa_arrival_bank_item_ids jsonb,
  p_displaced_arrival_bank_item_ids jsonb,p_presentation jsonb,p_column_groups jsonb
) returns table(state_token text,applied_zone_count integer,applied_block_count integer,applied_placement_count integer,
  explicit_bank_item_count integer,displaced_bank_item_count integer,worked_bank_item_count integer)
language plpgsql security definer set search_path = '' as $$
declare applied record;
begin
  -- v29 acquires the existing writer fence/row lock and validates OCC before writes.
  select * into applied from public.apply_matchday_live_layout_physical_v29(p_matchday_id,p_profile_key,p_expected_physical_state_token,
    p_latest_companion_zone_id,p_zones,p_blocks,p_placements,p_faixa_slot_count,p_explicit_bank_item_ids,
    p_displaced_bank_item_ids,p_worked_bank_item_ids,p_faixa_arrival_bank_item_ids,p_displaced_arrival_bank_item_ids,p_presentation);
  perform jornada_private.replace_live_column_groups(p_matchday_id,p_column_groups);
  return query select jornada_private.matchday_live_layout_workspace_token_v22(p_matchday_id,p_profile_key),
    applied.applied_zone_count,applied.applied_block_count,applied.applied_placement_count,
    applied.explicit_bank_item_count,applied.displaced_bank_item_count,applied.worked_bank_item_count;
end $$;
revoke all on function public.apply_matchday_live_layout_physical_v31(uuid,text,text,uuid,jsonb,jsonb,jsonb,integer,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.apply_matchday_live_layout_physical_v31(uuid,text,text,uuid,jsonb,jsonb,jsonb,integer,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb) to service_role;

create function jornada_private.replace_historical_column_groups(p_context uuid,p_zones jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare z jsonb; g jsonb;
begin
  for z in select value from jsonb_array_elements(p_zones) loop
    g:=z->'columnGroup';
    if g is null or g='null'::jsonb then continue; end if;
    if jsonb_typeof(g) is distinct from 'object' or jsonb_typeof(g->'enabled') is distinct from 'boolean'
      or jsonb_typeof(g->'publicTitle') is distinct from 'string' or jsonb_typeof(g->'position') is distinct from 'number'
      or (g->>'position')!~'^[1-5]$' or (select count(*) from jsonb_object_keys(g))<>4
      or z->>'id' is null then raise exception 'editorial-column-group-shape-invalid'; end if;
    if (g->>'position')::integer=1 then
      insert into public.matchday_historical_column_groups(composition_id,id,public_title,is_enabled,anchor_zone_id)
        values(p_context,(g->>'id')::uuid,btrim(g->>'publicTitle'),(g->>'enabled')::boolean,(z->>'id')::uuid);
    end if;
  end loop;
  for z in select value from jsonb_array_elements(p_zones) loop
    g:=z->'columnGroup';
    if g is null or g='null'::jsonb then continue; end if;
    if not exists(select 1 from public.matchday_historical_column_groups existing where existing.composition_id=p_context
      and existing.id=(g->>'id')::uuid and existing.public_title=btrim(g->>'publicTitle') and existing.is_enabled=(g->>'enabled')::boolean)
      then raise exception 'editorial-column-group-inconsistent'; end if;
    insert into public.matchday_historical_column_group_members(composition_id,group_id,zone_id,member_position)
      values(p_context,(g->>'id')::uuid,(z->>'id')::uuid,(g->>'position')::integer);
  end loop;
  -- The outer workspace RPC may still move the video. Deferred triggers check
  -- final body order; activation and the outer RPC validate before returning.
end $$;

create function jornada_private.copy_live_column_groups(p_source uuid,p_target uuid,p_transition uuid,p_enable boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.matchday_live_layout_column_groups(matchday_id,id,public_title,is_enabled,anchor_zone_id)
    select p_target,g.id,g.public_title,case when p_enable then g.is_enabled else false end,z.target_zone_id
    from public.matchday_live_layout_column_groups g
    join jornada_private.matchday_live_layout_physical_zone_maps z on z.topology_transition_id=p_transition and z.source_zone_id=g.anchor_zone_id
    where g.matchday_id=p_source
    on conflict(matchday_id,id) do update set is_enabled=excluded.is_enabled;
  insert into public.matchday_live_layout_column_group_members(matchday_id,group_id,zone_id,member_position)
    select p_target,m.group_id,z.target_zone_id,m.member_position from public.matchday_live_layout_column_group_members m
    join jornada_private.matchday_live_layout_physical_zone_maps z on z.topology_transition_id=p_transition and z.source_zone_id=m.zone_id
    where m.matchday_id=p_source on conflict do nothing;
end $$;
create function jornada_private.assert_column_group_carryover(p_source uuid,p_target uuid,p_transition uuid) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if exists (
    select g.id,g.public_title,g.is_enabled,m.member_position,z.target_zone_id from public.matchday_live_layout_column_groups g
    join public.matchday_live_layout_column_group_members m on m.matchday_id=g.matchday_id and m.group_id=g.id
    join jornada_private.matchday_live_layout_physical_zone_maps z on z.topology_transition_id=p_transition and z.source_zone_id=m.zone_id
    where g.matchday_id=p_source
    except
    select g.id,g.public_title,g.is_enabled,m.member_position,m.zone_id from public.matchday_live_layout_column_groups g
    join public.matchday_live_layout_column_group_members m on m.matchday_id=g.matchday_id and m.group_id=g.id where g.matchday_id=p_target
  ) or (select count(*) from public.matchday_live_layout_column_groups where matchday_id=p_source)
    <> (select count(*) from public.matchday_live_layout_column_groups where matchday_id=p_target)
  then raise exception 'editorial-column-group-carryover-inconsistent'; end if;
end $$;

create function jornada_private.copy_historical_column_groups(p_source uuid,p_target uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  -- Reopen already copies every zone in the same explicit sort_order. This is
  -- a copy map, not inference that arbitrary adjacent columns form a group.
  insert into public.matchday_historical_column_groups(composition_id,id,public_title,is_enabled,anchor_zone_id)
    select p_target,g.id,g.public_title,g.is_enabled,t.id from public.matchday_historical_column_groups g
    join public.matchday_historical_composition_zones s on s.composition_id=p_source and s.id=g.anchor_zone_id
    join public.matchday_historical_composition_zones t on t.composition_id=p_target and t.sort_order=s.sort_order
    where g.composition_id=p_source;
  insert into public.matchday_historical_column_group_members(composition_id,group_id,zone_id,member_position)
    select p_target,m.group_id,t.id,m.member_position from public.matchday_historical_column_group_members m
    join public.matchday_historical_composition_zones s on s.composition_id=p_source and s.id=m.zone_id
    join public.matchday_historical_composition_zones t on t.composition_id=p_target and t.sort_order=s.sort_order
    where m.composition_id=p_source;
  perform jornada_private.assert_historical_column_groups(p_target);
end $$;

create function jornada_private.seed_historical_column_groups() returns trigger
language plpgsql security definer set search_path = '' as $$
declare payload jsonb;
begin
  if new.presentation_mode<>'hierarchical' or new.status<>'draft'
    or not exists(select 1 from public.matchday_live_layout_column_groups where matchday_id=new.matchday_id)
    or exists(select 1 from public.matchday_reference_compositions where matchday_id=new.matchday_id and id<>new.id and presentation_mode='hierarchical')
    then return new; end if;
  perform jornada_private.acquire_matchday_live_layout_cutover_writer_lock();
  perform 1 from public.matchdays where id=new.matchday_id for update;
  select jsonb_agg(jsonb_build_object('id',z.id,'publicTitle',z.public_title,'publicTitleColor',z.public_title_color,'visualFamily',z.visual_family,
    'columnGroup',jsonb_build_object('id',g.id,'publicTitle',g.public_title,'enabled',g.is_enabled,'position',m.member_position),
    'items',coalesce((select jsonb_agg(jsonb_build_object('position',p.slot_position,'bankItemId',p.bank_item_id) order by p.slot_position)
      from public.matchday_live_layout_placements p where p.matchday_id=new.matchday_id and p.zone_id=z.id and p.placement_type='zone'),'[]'::jsonb)) order by b.sort_order)
    into payload from public.matchday_live_layout_column_groups g
    join public.matchday_live_layout_column_group_members m on m.matchday_id=g.matchday_id and m.group_id=g.id
    join public.matchday_live_layout_zones z on z.id=m.zone_id and z.matchday_id=m.matchday_id
    join public.matchday_live_layout_blocks b on b.zone_id=z.id and b.matchday_id=z.matchday_id
    where g.matchday_id=new.matchday_id;
  perform public.replace_historical_composition_dynamic_zones(new.matchday_id,new.id,payload);
  return new;
end $$;
create trigger seed_explicit_column_groups after insert on public.matchday_reference_compositions
  for each row execute function jornada_private.seed_historical_column_groups();

-- Bounded patches retain function OIDs, grants, search_path and existing contracts.
do $patch$
declare c record; definition text; occurrences integer;
begin
  for c in select * from (values
    ('jornada_private.matchday_live_layout_workspace_token_v22(uuid,text)',$before_0$    || coalesce(editorial_row.video_highlight_section_title, '')$before_0$,$after_0$    || coalesce(editorial_row.video_highlight_section_title, '')
    || jornada_private.live_column_groups_hash_suffix(p_matchday_id)$after_0$),
    ('public.read_matchday_live_layout_workspace_v22(uuid,text)',$before_1$        'faixa_public_title',$before_1$,$after_1$        'column_groups', jornada_private.live_column_groups_json(p_matchday_id),
        'faixa_public_title',$after_1$),
    ('jornada_private.matchday_live_layout_carryover_source_hash_v18(uuid)',$before_2$  )::text);$before_2$,$after_2$  )::text || jornada_private.live_column_groups_hash_suffix(p_matchday_id));$after_2$),
    ('jornada_private.matchday_live_layout_physical_archive_hash_v19(uuid)',$before_3$  )::text);$before_3$,$after_3$  )::text || jornada_private.live_column_groups_hash_suffix(p_matchday_id));$after_3$),
    ('jornada_private.matchday_historical_physical_archive_components_v20(uuid)',$before_4$    ), '[]'::jsonb)::text),
    'blocks'$before_4$,$after_4$    ), '[]'::jsonb)::text || jornada_private.live_column_groups_hash_suffix(p_matchday_id)),
    'blocks'$after_4$),
    ('jornada_private.materialize_matchday_live_layout_physical_topology_v17_impl(uuid,uuid)',$before_5$  insert into public.matchday_live_layout_workspace_settings ($before_5$,$after_5$  perform jornada_private.copy_live_column_groups(p_source_matchday_id,p_target_matchday_id,v_transition_id,false);

  insert into public.matchday_live_layout_workspace_settings ($after_5$),
    ('jornada_private.materialize_matchday_live_layout_physical_carryover_v18(uuid,uuid,uuid,uuid)',$before_6$  select workspace_row.state_token
  into v_state_token_after$before_6$,$after_6$  perform jornada_private.copy_live_column_groups(p_source_matchday_id,p_target_matchday_id,p_topology_transition_id,true);
  perform jornada_private.assert_column_group_carryover(p_source_matchday_id,p_target_matchday_id,p_topology_transition_id);
  perform jornada_private.assert_live_column_groups(p_target_matchday_id);

  select workspace_row.state_token
  into v_state_token_after$after_6$),
    ('jornada_private.assert_matchday_live_layout_physical_handoff_ready_v19(uuid,uuid,uuid,uuid,uuid)',$before_7$
begin
$before_7$,$after_7$
begin
  perform jornada_private.assert_column_group_carryover(p_source_matchday_id,p_target_matchday_id,p_topology_transition_id);
$after_7$),
    ('public.replace_historical_composition_dynamic_zones(uuid,uuid,jsonb)',$before_8$  delete from public.matchday_historical_composition_zones$before_8$,$after_8$  if exists(select 1 from public.matchday_historical_column_groups where composition_id=p_composition_id)
    and exists(select 1 from jsonb_array_elements(p_dynamic_zones) z where not (z ? 'columnGroup'))
    then raise exception 'editorial-column-group-metadata-required'; end if;
  if exists(select 1 from jsonb_array_elements(p_dynamic_zones) z
    join public.matchday_historical_composition_zones existing on existing.id=(z->>'id')::uuid
    where existing.composition_id<>p_composition_id) then raise exception 'editorial-column-group-zone-context-invalid'; end if;
  delete from public.matchday_historical_column_groups where composition_id=p_composition_id;
  delete from public.matchday_historical_composition_zones$after_8$),
    ('public.replace_historical_composition_dynamic_zones(uuid,uuid,jsonb)',$before_9$    insert into public.matchday_historical_composition_zones (
      composition_id,$before_9$,$after_9$    insert into public.matchday_historical_composition_zones (
      id,
      composition_id,$after_9$),
    ('public.replace_historical_composition_dynamic_zones(uuid,uuid,jsonb)',$before_10$    values (
      p_composition_id,$before_10$,$after_10$    values (
      coalesce((v_zone ->> 'id')::uuid,pg_catalog.gen_random_uuid()),
      p_composition_id,$after_10$),
    ('public.replace_historical_composition_dynamic_zones(uuid,uuid,jsonb)',$before_11$  return v_zone_count + v_item_count;$before_11$,$after_11$  perform jornada_private.replace_historical_column_groups(p_composition_id,p_dynamic_zones);
  return v_zone_count + v_item_count;$after_11$),
    ('public.reopen_matchday_reference_composition(uuid,uuid)',$before_12$  return v_draft_id;
end;$before_12$,$after_12$  perform jornada_private.copy_historical_column_groups(p_composition_id,v_draft_id);
  return v_draft_id;
end;$after_12$),
    ('public.activate_matchday_reference_composition(uuid,uuid,boolean)',$before_13$
begin
$before_13$,$after_13$
begin
  perform jornada_private.assert_historical_column_groups(p_composition_id);
$after_13$)
  ) changes(signature,before_text,after_text) loop
    definition:=pg_get_functiondef(c.signature::regprocedure);
    occurrences:=(length(definition)-length(replace(definition,c.before_text,'')))/length(c.before_text);
    if occurrences<>1 then raise exception 'column-groups-migration-source-drift: % (found %)',c.signature,occurrences; end if;
    execute replace(definition,c.before_text,c.after_text);
  end loop;
end $patch$;

create function public.apply_historical_composition_workspace_plan_v4(
  p_matchday_id uuid,p_composition_id uuid,p_operations jsonb,p_settings jsonb,p_dynamic_zones jsonb,p_expected_column_groups jsonb
) returns integer language plpgsql security invoker set search_path = '' as $$
declare result integer; expected jsonb;
begin
  perform 1 from public.matchday_reference_compositions where id=p_composition_id and matchday_id=p_matchday_id and status='draft' for update;
  if not found then raise exception 'editorial-column-group-historical-not-editable'; end if;
  if jsonb_typeof(p_expected_column_groups) is distinct from 'array' then raise exception 'editorial-column-group-payload-invalid'; end if;
  select coalesce(jsonb_agg(value order by value->>'id'),'[]'::jsonb) into expected from jsonb_array_elements(p_expected_column_groups);
  if expected is distinct from jornada_private.historical_column_groups_json(p_composition_id)
    then raise exception 'editorial-column-group-concurrent-write'; end if;
  result:=public.apply_historical_composition_workspace_plan_v3(p_matchday_id,p_composition_id,p_operations,p_settings,p_dynamic_zones);
  perform jornada_private.assert_historical_column_groups(p_composition_id);
  return result;
end $$;
revoke all on function public.apply_historical_composition_workspace_plan_v4(uuid,uuid,jsonb,jsonb,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.apply_historical_composition_workspace_plan_v4(uuid,uuid,jsonb,jsonb,jsonb,jsonb) to service_role;

-- Existing drafts are updated only by this explicit editorial operation.
create function public.import_historical_column_groups_v31(p_matchday_id uuid,p_composition_id uuid,p_expected_column_groups jsonb)
returns integer language plpgsql security definer set search_path = '' as $$
declare g record; z record; target_zone uuid; next_order integer; imported integer:=0; expected jsonb;
begin
  perform jornada_private.acquire_matchday_live_layout_cutover_writer_lock();
  perform 1 from public.matchdays where id=p_matchday_id for update;
  perform 1 from public.matchday_reference_compositions where id=p_composition_id and matchday_id=p_matchday_id and status='draft' and presentation_mode='hierarchical' for update;
  if not found then raise exception 'editorial-column-group-historical-not-editable'; end if;
  if jsonb_typeof(p_expected_column_groups) is distinct from 'array' then raise exception 'editorial-column-group-payload-invalid'; end if;
  select coalesce(jsonb_agg(value order by value->>'id'),'[]'::jsonb) into expected from jsonb_array_elements(p_expected_column_groups);
  if expected is distinct from jornada_private.historical_column_groups_json(p_composition_id)
    then raise exception 'editorial-column-group-concurrent-write'; end if;
  select coalesce(max(sort_order),0) into next_order from public.matchday_historical_composition_zones where composition_id=p_composition_id;
  for g in select source.* from public.matchday_live_layout_column_groups source
    join public.matchday_live_layout_blocks b on b.matchday_id=source.matchday_id and b.zone_id=source.anchor_zone_id
    where source.matchday_id=p_matchday_id and not exists(select 1 from public.matchday_historical_column_groups h where h.composition_id=p_composition_id and h.id=source.id)
    order by b.sort_order loop
    if next_order+5>24 then raise exception 'editorial-column-group-historical-capacity'; end if;
    for z in select zone.*,m.member_position from public.matchday_live_layout_column_group_members m
      join public.matchday_live_layout_zones zone on zone.id=m.zone_id and zone.matchday_id=m.matchday_id
      where m.matchday_id=p_matchday_id and m.group_id=g.id order by m.member_position loop
      if exists(select 1 from public.matchday_live_layout_placements p
        join public.matchday_editorial_bank_items b on b.id=p.bank_item_id
        where p.matchday_id=p_matchday_id and p.zone_id=z.id and (
        exists(select 1 from public.matchday_historical_composition_zone_items i where i.composition_id=p_composition_id
          and (i.bank_item_id=p.bank_item_id or lower(btrim(i.source_identity))=lower(b.source_type||':'||b.source_id)))
        or exists(select 1 from public.matchday_hierarchical_composition_slots s where s.composition_id=p_composition_id
          and (s.bank_item_id=p.bank_item_id or lower(btrim(s.source_identity))=lower(b.source_type||':'||b.source_id)))
        or exists(select 1 from public.matchday_reference_composition_items i where i.composition_id=p_composition_id
          and ((i.source_type='matchday_editorial_bank_item' and i.source_id=p.bank_item_id)
            or (i.source_type=b.source_type and i.source_id::text=b.source_id)))
        or exists(select 1 from public.matchday_reference_compositions c where c.id=p_composition_id
          and c.hierarchical_editorial_source_type=b.source_type and c.hierarchical_editorial_source_id::text=b.source_id)
      )) then raise exception 'editorial-column-group-story-already-used'; end if;
      target_zone:=case when exists(select 1 from public.matchday_historical_composition_zones where id=z.id) then gen_random_uuid() else z.id end;
      next_order:=next_order+1;
      insert into public.matchday_historical_composition_zones(id,composition_id,sort_order,public_title,public_title_color,visual_family)
        values(target_zone,p_composition_id,next_order,z.public_title,z.public_title_color,z.visual_family);
      if z.member_position=1 then insert into public.matchday_historical_column_groups(composition_id,id,public_title,is_enabled,anchor_zone_id)
        values(p_composition_id,g.id,g.public_title,g.is_enabled,target_zone); end if;
      insert into public.matchday_historical_column_group_members(composition_id,group_id,zone_id,member_position)
        values(p_composition_id,g.id,target_zone,z.member_position);
      insert into public.matchday_historical_composition_zone_items(composition_id,zone_id,position,bank_item_id,source_identity,label_snapshot,title_snapshot,subtitle_snapshot,image_url_snapshot,link_url_snapshot)
        select p_composition_id,target_zone,p.slot_position,b.id,b.source_type||':'||b.source_id,b.label,b.title,b.subtitle,b.image_url,b.link_url
        from public.matchday_live_layout_placements p join public.matchday_editorial_bank_items b on b.id=p.bank_item_id
        where p.matchday_id=p_matchday_id and p.zone_id=z.id and p.placement_type='zone';
    end loop;
    imported:=imported+1;
  end loop;
  perform jornada_private.assert_historical_column_groups(p_composition_id);
  return imported;
end $$;
revoke all on function public.import_historical_column_groups_v31(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.import_historical_column_groups_v31(uuid,uuid,jsonb) to service_role;

-- Helpers are private and unavailable to anonymous/authenticated API callers.
do $$ declare f regprocedure; begin
  for f in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='jornada_private' and p.proname in ('live_column_groups_json','historical_column_groups_json',
      'live_column_groups_hash_suffix','assert_live_column_groups','assert_historical_column_groups','check_editorial_column_groups',
      'guard_editorial_column_group_write','replace_live_column_groups','replace_historical_column_groups','copy_live_column_groups',
      'assert_column_group_carryover','copy_historical_column_groups','seed_historical_column_groups') loop
    execute format('revoke all on function %s from public,anon,authenticated',f);
    execute format('grant execute on function %s to service_role',f);
  end loop;
end $$;

comment on table public.matchday_live_layout_column_groups is 'Explicit five-column editorial unit. The first member block is its order anchor. No automatic grouping/backfill.';
comment on table public.matchday_historical_column_groups is 'Historical group state and identity; members retain independent zone snapshots, titles, colours and sparse slots.';
commit;
