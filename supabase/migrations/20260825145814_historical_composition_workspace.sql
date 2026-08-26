begin;

alter table public.matchday_reference_compositions
  add column if not exists hierarchical_headline_title_color text,
  add column if not exists hierarchical_zone_1_title text,
  add column if not exists hierarchical_zone_2_title text,
  add column if not exists hierarchical_block_order jsonb,
  add column if not exists hierarchical_editorial_source_type text,
  add column if not exists hierarchical_editorial_source_id uuid;

alter table public.matchday_reference_compositions
  drop constraint if exists matchday_reference_compositions_hierarchical_headline_title_color_check,
  drop constraint if exists matchday_reference_compositions_hierarchical_zone_1_title_check,
  drop constraint if exists matchday_reference_compositions_hierarchical_zone_2_title_check,
  drop constraint if exists matchday_reference_compositions_hierarchical_block_order_check,
  drop constraint if exists matchday_reference_compositions_hierarchical_editorial_source_check;

alter table public.matchday_reference_compositions
  add constraint matchday_reference_compositions_hierarchical_headline_title_color_check
    check (
      hierarchical_headline_title_color is null
      or hierarchical_headline_title_color ~ '^#[0-9A-Fa-f]{6}$'
    ),
  add constraint matchday_reference_compositions_hierarchical_zone_1_title_check
    check (
      hierarchical_zone_1_title is null
      or (
        nullif(pg_catalog.btrim(hierarchical_zone_1_title), '') is not null
        and pg_catalog.char_length(hierarchical_zone_1_title) <= 120
      )
    ),
  add constraint matchday_reference_compositions_hierarchical_zone_2_title_check
    check (
      hierarchical_zone_2_title is null
      or (
        nullif(pg_catalog.btrim(hierarchical_zone_2_title), '') is not null
        and pg_catalog.char_length(hierarchical_zone_2_title) <= 120
      )
    ),
  add constraint matchday_reference_compositions_hierarchical_block_order_check
    check (
      hierarchical_block_order is null
      or (
        pg_catalog.jsonb_typeof(hierarchical_block_order) = 'array'
        and pg_catalog.jsonb_array_length(hierarchical_block_order) = 5
        and hierarchical_block_order @> '["opening", "zone_1", "zone_2", "video", "beyond"]'::jsonb
      )
    ),
  add constraint matchday_reference_compositions_hierarchical_editorial_source_check
    check (
      (hierarchical_editorial_source_type is null and hierarchical_editorial_source_id is null)
      or (
        hierarchical_editorial_source_type = 'editorial_article'
        and hierarchical_editorial_source_id is not null
      )
    );

create or replace function public.apply_historical_composition_workspace_plan(
  p_matchday_id uuid,
  p_composition_id uuid,
  p_operations jsonb,
  p_settings jsonb
)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_composition public.matchday_reference_compositions%rowtype;
  v_bank public.matchday_editorial_bank_items%rowtype;
  v_article public.editorial_articles%rowtype;
  v_operation jsonb;
  v_kind text;
  v_target text;
  v_slot_key text;
  v_slot_id uuid;
  v_item_id uuid;
  v_bank_id uuid;
  v_article_id uuid;
  v_slot_type text;
  v_sort_order integer;
  v_source_identity text;
  v_rows integer;
  v_remove_editorial boolean := false;
  v_assign_editorial boolean := false;
  v_editorial_title text;
  v_editorial_excerpt text;
  v_editorial_text text;
  v_editorial_author text;
  v_editorial_source_id uuid;
begin
  if p_matchday_id is null or p_composition_id is null then
    raise exception 'historical_composition_workspace_invalid';
  end if;

  if p_operations is null
     or pg_catalog.jsonb_typeof(p_operations) <> 'array'
     or pg_catalog.jsonb_array_length(p_operations) > 80 then
    raise exception 'historical_composition_workspace_operations_invalid';
  end if;

  if p_settings is not null and (
    pg_catalog.jsonb_typeof(p_settings) <> 'object'
    or coalesce(p_settings ->> 'headlineTitleColor', '') !~ '^#[0-9A-Fa-f]{6}$'
    or nullif(pg_catalog.btrim(p_settings ->> 'zone1Title'), '') is null
    or pg_catalog.char_length(p_settings ->> 'zone1Title') > 120
    or nullif(pg_catalog.btrim(p_settings ->> 'zone2Title'), '') is null
    or pg_catalog.char_length(p_settings ->> 'zone2Title') > 120
    or pg_catalog.jsonb_typeof(p_settings -> 'blockOrder') <> 'array'
    or pg_catalog.jsonb_array_length(p_settings -> 'blockOrder') <> 5
    or not (p_settings -> 'blockOrder' @> '["opening", "zone_1", "zone_2", "video", "beyond"]'::jsonb)
  ) then
    raise exception 'historical_composition_workspace_settings_invalid';
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
    raise exception 'historical_composition_workspace_not_editable';
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(p_operations) as operation(value)
    where pg_catalog.jsonb_typeof(operation.value) <> 'object'
       or not (
         coalesce(operation.value ->> 'kind', '') = any(array[
           'unassign_slot',
           'remove_auxiliary',
           'assign_slot',
           'assign_auxiliary',
           'remove_editorial',
           'assign_editorial'
         ])
       )
  ) then
    raise exception 'historical_composition_workspace_operation_invalid';
  end if;

  if (
    select pg_catalog.count(*)
    from pg_catalog.jsonb_array_elements(p_operations) as operation(value)
    where operation.value ->> 'kind' = 'assign_editorial'
  ) > 1 then
    raise exception 'historical_composition_workspace_editorial_target_repeated';
  end if;

  select exists (
    select 1
    from pg_catalog.jsonb_array_elements(p_operations) as operation(value)
    where operation.value ->> 'kind' = 'remove_editorial'
  ) into v_remove_editorial;

  -- Apply composition metadata before the placement mutations. This remains
  -- inside the same function transaction, so a later placement error also
  -- restores Editorial and settings to their exact previous values.
  if v_remove_editorial or p_settings is not null then
    update public.matchday_reference_compositions as composition
    set hierarchical_editorial_title = case
          when v_remove_editorial then null
          else composition.hierarchical_editorial_title
        end,
        hierarchical_editorial_excerpt = case
          when v_remove_editorial then null
          else composition.hierarchical_editorial_excerpt
        end,
        hierarchical_editorial_text = case
          when v_remove_editorial then null
          else composition.hierarchical_editorial_text
        end,
        hierarchical_editorial_author = case
          when v_remove_editorial then null
          else composition.hierarchical_editorial_author
        end,
        hierarchical_editorial_source_type = case
          when v_remove_editorial then null
          else composition.hierarchical_editorial_source_type
        end,
        hierarchical_editorial_source_id = case
          when v_remove_editorial then null
          else composition.hierarchical_editorial_source_id
        end,
        hierarchical_headline_title_color = case
          when p_settings is not null then pg_catalog.upper(pg_catalog.btrim(p_settings ->> 'headlineTitleColor'))
          else composition.hierarchical_headline_title_color
        end,
        hierarchical_zone_1_title = case
          when p_settings is not null then pg_catalog.btrim(p_settings ->> 'zone1Title')
          else composition.hierarchical_zone_1_title
        end,
        hierarchical_zone_2_title = case
          when p_settings is not null then pg_catalog.btrim(p_settings ->> 'zone2Title')
          else composition.hierarchical_zone_2_title
        end,
        hierarchical_block_order = case
          when p_settings is not null then p_settings -> 'blockOrder'
          else composition.hierarchical_block_order
        end
    where composition.id = p_composition_id
      and composition.matchday_id = p_matchday_id
      and composition.status = 'draft'
      and composition.presentation_mode = 'hierarchical';
    get diagnostics v_rows = row_count;
    if v_rows <> 1 then
      raise exception 'historical_composition_workspace_changed';
    end if;
  end if;

  -- Removals happen first, but any later exception rolls them back together
  -- with every insert and composition update in this function invocation.
  for v_operation in
    select operation.value
    from pg_catalog.jsonb_array_elements(p_operations) as operation(value)
  loop
    v_kind := v_operation ->> 'kind';

    if v_kind = 'unassign_slot' then
      v_slot_id := nullif(pg_catalog.btrim(v_operation ->> 'slotId'), '')::uuid;
      delete from public.matchday_hierarchical_composition_slots as slot
      where slot.id = v_slot_id
        and slot.composition_id = p_composition_id;
      get diagnostics v_rows = row_count;
      if v_rows <> 1 then
        raise exception 'historical_composition_workspace_changed';
      end if;
    elsif v_kind = 'remove_auxiliary' then
      v_item_id := nullif(pg_catalog.btrim(v_operation ->> 'itemId'), '')::uuid;
      delete from public.matchday_reference_composition_items as item
      where item.id = v_item_id
        and item.composition_id = p_composition_id
        and item.slot_type in ('complement', 'beyond_matchday', 'important_item');
      get diagnostics v_rows = row_count;
      if v_rows <> 1 then
        raise exception 'historical_composition_workspace_changed';
      end if;
    end if;
  end loop;

  for v_operation in
    select operation.value
    from pg_catalog.jsonb_array_elements(p_operations) as operation(value)
    where operation.value ->> 'kind' in ('assign_slot', 'assign_auxiliary')
  loop
    v_kind := v_operation ->> 'kind';
    v_bank_id := nullif(pg_catalog.btrim(v_operation ->> 'bankItemId'), '')::uuid;

    select bank.*
    into v_bank
    from public.matchday_editorial_bank_items as bank
    where bank.id = v_bank_id
      and bank.matchday_id = p_matchday_id
      and bank.status = 'active'
    for share;

    if not found
       or pg_catalog.lower(pg_catalog.btrim(coalesce(v_bank.source_type, ''))) <> 'editorial_article'
       or nullif(pg_catalog.btrim(v_bank.source_id), '') is null then
      raise exception 'historical_composition_workspace_bank_item_invalid';
    end if;

    v_article_id := pg_catalog.btrim(v_bank.source_id)::uuid;
    v_source_identity := 'editorial_article:' || pg_catalog.lower(v_article_id::text);

    if exists (
      select 1
      from public.matchday_hierarchical_composition_slots as slot
      where slot.composition_id = p_composition_id
        and (
          slot.bank_item_id = v_bank_id
          or pg_catalog.lower(pg_catalog.btrim(slot.source_identity)) = v_source_identity
        )
    ) or exists (
      select 1
      from public.matchday_reference_composition_items as item
      where item.composition_id = p_composition_id
        and item.slot_type in ('complement', 'beyond_matchday', 'important_item')
        and (
          (
            pg_catalog.lower(pg_catalog.btrim(item.source_type)) = 'matchday_editorial_bank_item'
            and item.source_id = v_bank_id
          )
          or (
            pg_catalog.lower(pg_catalog.btrim(item.source_type)) = 'editorial_article'
            and item.source_id = v_article_id
          )
        )
    ) or (
      not v_remove_editorial
      and v_composition.hierarchical_editorial_source_type = 'editorial_article'
      and v_composition.hierarchical_editorial_source_id = v_article_id
    ) then
      raise exception 'historical_composition_workspace_source_repeated';
    end if;

    if v_kind = 'assign_slot' then
      v_slot_key := pg_catalog.btrim(v_operation ->> 'slotKey');
      if v_slot_key is null or v_slot_key not in (
        'dominant_main',
        'dominant_side_top',
        'dominant_side_bottom',
        'other_chronicle_1',
        'other_chronicle_2',
        'other_chronicle_3',
        'secondary_strong_1',
        'secondary_strong_2',
        'secondary_1',
        'secondary_2',
        'secondary_3',
        'secondary_4',
        'closing_1',
        'closing_2',
        'closing_3'
      ) then
        raise exception 'historical_composition_workspace_slot_invalid';
      end if;

      if exists (
        select 1
        from public.matchday_hierarchical_composition_slots as slot
        where slot.composition_id = p_composition_id
          and slot.slot_key = v_slot_key
      ) then
        raise exception 'historical_composition_workspace_target_occupied';
      end if;

      insert into public.matchday_hierarchical_composition_slots (
        composition_id,
        slot_key,
        bank_item_id,
        source_identity,
        label_snapshot,
        title_snapshot,
        subtitle_snapshot,
        image_url_snapshot,
        link_url_snapshot,
        media_kind_snapshot,
        media_embed_url_snapshot,
        media_video_url_snapshot
      ) values (
        p_composition_id,
        v_slot_key,
        v_bank.id,
        v_source_identity,
        v_bank.label,
        v_bank.title,
        v_bank.subtitle,
        v_bank.image_url,
        v_bank.link_url,
        null,
        null,
        null
      );
    else
      v_target := pg_catalog.btrim(v_operation ->> 'target');
      if v_target = 'video_highlight' then
        v_slot_type := 'complement';
        v_sort_order := 1;
      elsif v_target ~ '^beyond_matchday_[1-5]$' then
        v_slot_type := 'beyond_matchday';
        v_sort_order := pg_catalog.substring(v_target, '([0-9]+)$')::integer;
      elsif v_target ~ '^faixa_([1-9]|10)$' then
        v_slot_type := 'important_item';
        v_sort_order := pg_catalog.substring(v_target, '([0-9]+)$')::integer;
      else
        raise exception 'historical_composition_workspace_auxiliary_target_invalid';
      end if;

      if exists (
        select 1
        from public.matchday_reference_composition_items as item
        where item.composition_id = p_composition_id
          and item.slot_type = v_slot_type
          and item.sort_order = v_sort_order
      ) then
        raise exception 'historical_composition_workspace_target_occupied';
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
         or nullif(pg_catalog.btrim(v_article.body), '') is null
         or nullif(pg_catalog.btrim(v_article.image_url), '') is null
         or nullif(pg_catalog.btrim(v_article.author), '') is null
         or v_article.published_at is null then
        raise exception 'historical_composition_workspace_article_invalid';
      end if;

      insert into public.matchday_reference_composition_items (
        composition_id,
        slot_type,
        source_type,
        source_id,
        article_id,
        sort_order,
        title_snapshot,
        subtitle_snapshot,
        image_url_snapshot,
        link_url_snapshot,
        label_snapshot,
        label_color_snapshot,
        media_kind_snapshot,
        media_embed_url_snapshot,
        media_video_url_snapshot,
        status
      ) values (
        p_composition_id,
        v_slot_type,
        'matchday_editorial_bank_item',
        v_bank.id,
        null,
        v_sort_order,
        pg_catalog.btrim(v_article.title),
        pg_catalog.btrim(v_article.subtitle),
        pg_catalog.btrim(v_article.image_url),
        '/noticias/' || pg_catalog.btrim(v_article.slug),
        pg_catalog.btrim(v_article.label),
        null,
        null,
        null,
        null,
        'draft'
      );
    end if;
  end loop;

  select nullif(pg_catalog.btrim(operation.value ->> 'bankItemId'), '')::uuid
  into v_bank_id
  from pg_catalog.jsonb_array_elements(p_operations) as operation(value)
  where operation.value ->> 'kind' = 'assign_editorial'
  limit 1;

  if v_bank_id is not null then
    select bank.*
    into v_bank
    from public.matchday_editorial_bank_items as bank
    where bank.id = v_bank_id
      and bank.matchday_id = p_matchday_id
      and bank.status = 'active'
      and pg_catalog.lower(pg_catalog.btrim(coalesce(bank.source_type, ''))) = 'editorial_article'
      and nullif(pg_catalog.btrim(bank.source_id), '') is not null
    for share;

    if not found then
      raise exception 'historical_composition_workspace_editorial_bank_invalid';
    end if;

    v_article_id := pg_catalog.btrim(v_bank.source_id)::uuid;
    if (
      v_composition.hierarchical_editorial_source_id is not null
      and not v_remove_editorial
    ) or exists (
      select 1
      from public.matchday_hierarchical_composition_slots as slot
      where slot.composition_id = p_composition_id
        and (
          slot.bank_item_id = v_bank_id
          or pg_catalog.lower(pg_catalog.btrim(slot.source_identity)) = 'editorial_article:' || pg_catalog.lower(v_article_id::text)
        )
    ) or exists (
      select 1
      from public.matchday_reference_composition_items as item
      where item.composition_id = p_composition_id
        and item.slot_type in ('complement', 'beyond_matchday', 'important_item')
        and (
          (
            pg_catalog.lower(pg_catalog.btrim(item.source_type)) = 'matchday_editorial_bank_item'
            and item.source_id = v_bank_id
          )
          or (
            pg_catalog.lower(pg_catalog.btrim(item.source_type)) = 'editorial_article'
            and item.source_id = v_article_id
          )
        )
    ) then
      raise exception 'historical_composition_workspace_source_repeated';
    end if;

    select article.*
    into v_article
    from public.editorial_articles as article
    where article.id = v_article_id
      and article.status = 'published'
    for share;

    if not found
       or nullif(pg_catalog.btrim(v_article.label), '') is null
       or nullif(pg_catalog.btrim(v_article.title), '') is null
       or nullif(pg_catalog.btrim(v_article.subtitle), '') is null
       or nullif(pg_catalog.btrim(v_article.body), '') is null
       or nullif(pg_catalog.btrim(v_article.image_url), '') is null
       or nullif(pg_catalog.btrim(v_article.author), '') is null
       or v_article.published_at is null then
      raise exception 'historical_composition_workspace_editorial_article_invalid';
    end if;

    v_assign_editorial := true;
    v_editorial_title := v_article.title;
    v_editorial_excerpt := v_article.subtitle;
    v_editorial_text := v_article.body;
    v_editorial_author := v_article.author;
    v_editorial_source_id := v_article.id;
  end if;

  if v_assign_editorial then
    update public.matchday_reference_compositions as composition
    set hierarchical_editorial_title = v_editorial_title,
        hierarchical_editorial_excerpt = v_editorial_excerpt,
        hierarchical_editorial_text = v_editorial_text,
        hierarchical_editorial_author = v_editorial_author,
        hierarchical_editorial_source_type = 'editorial_article',
        hierarchical_editorial_source_id = v_editorial_source_id
    where composition.id = p_composition_id
      and composition.matchday_id = p_matchday_id
      and composition.status = 'draft'
      and composition.presentation_mode = 'hierarchical';
    get diagnostics v_rows = row_count;
    if v_rows <> 1 then
      raise exception 'historical_composition_workspace_changed';
    end if;
  end if;

  return pg_catalog.jsonb_array_length(p_operations)
    + case when p_settings is null then 0 else 1 end;
end
$$;

revoke all on function public.apply_historical_composition_workspace_plan(uuid, uuid, jsonb, jsonb)
from public, anon, authenticated;
grant execute on function public.apply_historical_composition_workspace_plan(uuid, uuid, jsonb, jsonb)
to service_role;

comment on column public.matchday_reference_compositions.hierarchical_headline_title_color is
  'Cor do título da Manchete configurada exclusivamente para esta composição histórica.';
comment on column public.matchday_reference_compositions.hierarchical_zone_1_title is
  'Título público flexível da zona histórica de seis notícias; null preserva o fallback legacy.';
comment on column public.matchday_reference_compositions.hierarchical_zone_2_title is
  'Título público flexível da zona histórica de cinco notícias; null preserva o fallback legacy.';
comment on column public.matchday_reference_compositions.hierarchical_block_order is
  'Ordem vertical própria dos blocos estruturalmente compatíveis da composição histórica; null preserva a ordem legacy.';
comment on column public.matchday_reference_compositions.hierarchical_editorial_source_type is
  'Tipo canónico do artigo usado como Editorial da Jornada; snapshots legacy continuam nas colunas hierarchical_editorial_*.';
comment on column public.matchday_reference_compositions.hierarchical_editorial_source_id is
  'Identificador canónico do artigo usado como Editorial da Jornada, sem dependência do estado futuro da Mesa viva.';

comment on function public.apply_historical_composition_workspace_plan(uuid, uuid, jsonb, jsonb) is
  'Aplica remoções, atribuições, Editorial canónico e settings da Mesa histórica numa única transação: qualquer erro reverte integralmente a montagem.';

notify pgrst, 'reload schema';

commit;
