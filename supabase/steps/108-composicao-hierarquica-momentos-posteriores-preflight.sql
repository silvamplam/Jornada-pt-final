do $$
declare
  v_beyond_index_definition text;
begin
  if to_regclass('public.matchday_reference_compositions') is null then
    raise exception 'Preflight 108 falhou: tabela public.matchday_reference_compositions ausente';
  end if;

  if to_regclass('public.matchday_reference_composition_items') is null then
    raise exception 'Preflight 108 falhou: tabela public.matchday_reference_composition_items ausente';
  end if;

  if to_regclass('public.matchday_hierarchical_composition_slots') is null then
    raise exception 'Preflight 108 falhou: fundação dos 15 slots hierárquicos ausente';
  end if;

  if to_regclass('public.matchday_editorial_bank_items') is null
     or to_regclass('public.matchday_roundup_items') is null
     or to_regclass('public.editorial_articles') is null then
    raise exception 'Preflight 108 falhou: origens editoriais dos momentos posteriores ausentes';
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'matchday_reference_compositions'
      and column_name = 'presentation_mode'
      and data_type = 'text'
      and is_nullable = 'NO'
  ) then
    raise exception 'Preflight 108 falhou: fundação de presentation_mode ausente ou incompatível';
  end if;

  if exists (
    select 1
    from public.matchday_reference_compositions
    where presentation_mode not in ('standard', 'hierarchical')
  ) then
    raise exception 'Preflight 108 falhou: presentation_mode contém valores incompatíveis';
  end if;

  if to_regprocedure('public.activate_matchday_reference_composition(uuid,uuid,boolean)') is null then
    raise exception 'Preflight 108 falhou: RPC de ativação da fundação ausente';
  end if;

  if exists (
    select 1
    from public.matchday_reference_composition_items
    where slot_type = 'beyond_matchday'
      and sort_order not between 1 and 5
  ) then
    raise exception 'Preflight 108 falhou: existem posições de Para Lá da Jornada fora de 1..5';
  end if;

  if exists (
    select composition_id, sort_order
    from public.matchday_reference_composition_items
    where slot_type = 'beyond_matchday'
    group by composition_id, sort_order
    having count(*) > 1
  ) then
    raise exception 'Preflight 108 falhou: existem posições duplicadas em Para Lá da Jornada';
  end if;

  select indexdef
  into v_beyond_index_definition
  from pg_indexes
  where schemaname = 'public'
    and indexname = 'matchday_reference_composition_beyond_position_unique_idx';

  if v_beyond_index_definition is not null
     and (
       v_beyond_index_definition not ilike '%unique index%'
       or v_beyond_index_definition not ilike '%(composition_id, sort_order)%'
       or v_beyond_index_definition not ilike '%slot_type = ''beyond_matchday''%'
     ) then
    raise exception 'Preflight 108 falhou: índice de posições posteriores existe com definição incompatível';
  end if;

  if exists (
    select 1
    from public.matchday_reference_compositions composition
    where composition.presentation_mode = 'hierarchical'
      and composition.status = 'published'
      and composition.is_current = true
      and (
        (
          select count(*)
          from public.matchday_hierarchical_composition_slots slot
          where slot.composition_id = composition.id
        ) <> 15
        or (
          select count(*)
          from public.matchday_hierarchical_composition_slots slot
          where slot.composition_id = composition.id
            and nullif(btrim(slot.label_snapshot), '') is not null
            and nullif(btrim(slot.title_snapshot), '') is not null
            and nullif(btrim(slot.subtitle_snapshot), '') is not null
            and nullif(btrim(slot.image_url_snapshot), '') is not null
        ) <> 15
        or (
          select count(*)
          from public.matchday_reference_composition_items item
          where item.composition_id = composition.id
            and item.slot_type = 'beyond_matchday'
        ) <> 5
        or (
          select count(*)
          from public.matchday_reference_composition_items item
          where item.composition_id = composition.id
            and item.slot_type = 'beyond_matchday'
            and item.sort_order between 1 and 5
            and nullif(btrim(item.label_snapshot), '') is not null
            and nullif(btrim(item.title_snapshot), '') is not null
            and nullif(btrim(item.subtitle_snapshot), '') is not null
            and nullif(btrim(item.image_url_snapshot), '') is not null
            and nullif(btrim(item.link_url_snapshot), '') is not null
        ) <> 5
      )
  ) then
    raise exception 'Preflight 108 falhou: existe uma composição hierarchical current incompatível com o novo contrato';
  end if;
end
$$;
