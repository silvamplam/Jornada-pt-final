begin;

alter table public.matchday_historical_composition_zones
  drop constraint if exists matchday_historical_composition_zones_public_title_check;

alter table public.matchday_historical_composition_zones
  add constraint matchday_historical_composition_zones_public_title_check
  check (
    pg_catalog.char_length(public_title) <= 120
  );

create or replace function public.replace_historical_composition_dynamic_zones(
  p_matchday_id uuid,
  p_composition_id uuid,
  p_dynamic_zones jsonb
)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_composition public.matchday_reference_compositions%rowtype;
  v_zone jsonb;
  v_item jsonb;
  v_zone_id uuid;
  v_bank public.matchday_editorial_bank_items%rowtype;
  v_article public.editorial_articles%rowtype;
  v_bank_id uuid;
  v_article_id uuid;
  v_source_identity text;
  v_family text;
  v_title text;
  v_capacity integer;
  v_position integer;
  v_zone_count integer := 0;
  v_item_count integer := 0;
begin
  if p_dynamic_zones is null then
    return 0;
  end if;

  if pg_catalog.jsonb_typeof(p_dynamic_zones) <> 'array'
     or pg_catalog.jsonb_array_length(p_dynamic_zones) > 24 then
    raise exception 'historical_dynamic_zones_invalid';
  end if;

  select composition.*
  into v_composition
  from public.matchday_reference_compositions as composition
  where composition.id = p_composition_id
    and composition.matchday_id = p_matchday_id
  for update;

  if v_composition.id is null
     or v_composition.status <> 'draft'
     or v_composition.presentation_mode <> 'hierarchical' then
    raise exception 'historical_dynamic_zones_not_editable';
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(p_dynamic_zones) as zone(value)
    where pg_catalog.jsonb_typeof(zone.value) <> 'object'
       or coalesce(
         pg_catalog.jsonb_typeof(zone.value -> 'publicTitle'),
         ''
       ) <> 'string'
       or pg_catalog.char_length(zone.value ->> 'publicTitle') > 120
       or coalesce(zone.value ->> 'visualFamily', '') not in (
         'six_news',
         'five_news_balanced',
         'five_news_secondary'
       )
       or pg_catalog.jsonb_typeof(zone.value -> 'items') <> 'array'
  ) then
    raise exception 'historical_dynamic_zone_invalid';
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(p_dynamic_zones) as zone(value)
    cross join lateral
      pg_catalog.jsonb_array_elements(zone.value -> 'items') as item(value)
    where pg_catalog.jsonb_typeof(item.value) <> 'object'
       or pg_catalog.jsonb_typeof(item.value -> 'position') <> 'number'
       or (item.value ->> 'position') !~ '^[1-6]$'
       or pg_catalog.jsonb_typeof(item.value -> 'bankItemId') <> 'string'
       or (item.value ->> 'bankItemId') !~*
          '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
       or (item.value ->> 'position')::integer >
          case zone.value ->> 'visualFamily'
            when 'six_news' then 6
            else 5
          end
  ) then
    raise exception 'historical_dynamic_zone_item_invalid';
  end if;

  if exists (
    select 1
    from (
      select
        zone.ordinality as zone_number,
        (item.value ->> 'position')::integer as position
      from pg_catalog.jsonb_array_elements(p_dynamic_zones)
        with ordinality as zone(value, ordinality)
      cross join lateral
        pg_catalog.jsonb_array_elements(zone.value -> 'items') as item(value)
      group by zone.ordinality, (item.value ->> 'position')::integer
      having pg_catalog.count(*) > 1
    ) duplicated_positions
  ) then
    raise exception 'historical_dynamic_zone_position_repeated';
  end if;

  if exists (
    select 1
    from (
      select
        pg_catalog.lower(item.value ->> 'bankItemId') as bank_item_id
      from pg_catalog.jsonb_array_elements(p_dynamic_zones) as zone(value)
      cross join lateral
        pg_catalog.jsonb_array_elements(zone.value -> 'items') as item(value)
      group by pg_catalog.lower(item.value ->> 'bankItemId')
      having pg_catalog.count(*) > 1
    ) duplicated_articles
  ) then
    raise exception 'historical_dynamic_zone_source_repeated';
  end if;

  delete from public.matchday_historical_composition_zones
  where composition_id = p_composition_id;

  for v_zone in
    select zone.value
    from pg_catalog.jsonb_array_elements(p_dynamic_zones)
      with ordinality as zone(value, ordinality)
    order by zone.ordinality
  loop
    v_title := pg_catalog.btrim(v_zone ->> 'publicTitle');
    v_family := v_zone ->> 'visualFamily';

    v_capacity :=
      case v_family
        when 'six_news' then 6
        else 5
      end;

    v_zone_count := v_zone_count + 1;

    insert into public.matchday_historical_composition_zones (
      composition_id,
      sort_order,
      public_title,
      visual_family
    )
    values (
      p_composition_id,
      v_zone_count,
      v_title,
      v_family
    )
    returning id into v_zone_id;

    for v_item in
      select item.value
      from pg_catalog.jsonb_array_elements(v_zone -> 'items') as item(value)
      order by (item.value ->> 'position')::integer
    loop
      v_position := (v_item ->> 'position')::integer;

      if v_position < 1 or v_position > v_capacity then
        raise exception 'historical_dynamic_zone_position_invalid';
      end if;

      v_bank_id := (v_item ->> 'bankItemId')::uuid;

      select bank.*
      into v_bank
      from public.matchday_editorial_bank_items as bank
      where bank.id = v_bank_id
        and bank.matchday_id = p_matchday_id
        and bank.status = 'active'
        and pg_catalog.lower(
          pg_catalog.btrim(coalesce(bank.source_type, ''))
        ) = 'editorial_article'
        and nullif(pg_catalog.btrim(bank.source_id), '') is not null
      for share;

      if not found then
        raise exception 'historical_dynamic_zone_bank_item_invalid';
      end if;

      v_article_id :=
        pg_catalog.btrim(v_bank.source_id)::uuid;

      v_source_identity :=
        'editorial_article:' ||
        pg_catalog.lower(v_article_id::text);

      if exists (
        select 1
        from public.matchday_hierarchical_composition_slots as slot
        where slot.composition_id = p_composition_id
          and (
            slot.bank_item_id = v_bank_id
            or pg_catalog.lower(
              pg_catalog.btrim(slot.source_identity)
            ) = v_source_identity
          )
      ) or exists (
        select 1
        from public.matchday_reference_composition_items as item
        where item.composition_id = p_composition_id
          and item.slot_type in (
            'complement',
            'beyond_matchday',
            'important_item'
          )
          and (
            (
              pg_catalog.lower(
                pg_catalog.btrim(item.source_type)
              ) = 'matchday_editorial_bank_item'
              and item.source_id = v_bank_id
            )
            or (
              pg_catalog.lower(
                pg_catalog.btrim(item.source_type)
              ) = 'editorial_article'
              and item.source_id = v_article_id
            )
          )
      ) or (
        v_composition.hierarchical_editorial_source_type =
          'editorial_article'
        and v_composition.hierarchical_editorial_source_id =
          v_article_id
      ) then
        raise exception 'historical_dynamic_zone_source_in_fixed_block';
      end if;

      select article.*
      into v_article
      from public.editorial_articles as article
      where article.id = v_article_id
        and article.status = 'published'
      for share;

      if not found
         or nullif(pg_catalog.btrim(v_article.slug), '') is null
         or nullif(pg_catalog.btrim(v_article.label), '') is null
         or nullif(pg_catalog.btrim(v_article.title), '') is null
         or nullif(pg_catalog.btrim(v_article.subtitle), '') is null
         or nullif(pg_catalog.btrim(v_article.image_url), '') is null
         or v_article.published_at is null then
        raise exception 'historical_dynamic_zone_article_invalid';
      end if;

      insert into public.matchday_historical_composition_zone_items (
        composition_id,
        zone_id,
        position,
        bank_item_id,
        source_identity,
        label_snapshot,
        title_snapshot,
        subtitle_snapshot,
        image_url_snapshot,
        link_url_snapshot
      )
      values (
        p_composition_id,
        v_zone_id,
        v_position,
        v_bank_id,
        v_source_identity,
        pg_catalog.btrim(v_article.label),
        pg_catalog.btrim(v_article.title),
        pg_catalog.btrim(v_article.subtitle),
        pg_catalog.btrim(v_article.image_url),
        '/noticias/' || pg_catalog.btrim(v_article.slug)
      );

      v_item_count := v_item_count + 1;
    end loop;
  end loop;

  return v_zone_count + v_item_count;
end
$$;

revoke all
on function public.replace_historical_composition_dynamic_zones(
  uuid,
  uuid,
  jsonb
)
from public, anon, authenticated;

grant execute
on function public.replace_historical_composition_dynamic_zones(
  uuid,
  uuid,
  jsonb
)
to service_role;

comment on column public.matchday_historical_composition_zones.public_title is
  'Título público opcional da zona histórica. String vazia significa que o renderer público não apresenta cabeçalho.';

notify pgrst, 'reload schema';

commit;
