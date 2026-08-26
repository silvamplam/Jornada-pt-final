begin;

alter table public.matchday_editorial_bank_items
  add column automatic_eligible boolean not null default true,
  add column continuity_source_matchday_id uuid,
  add column continuity_source_composition_id uuid,
  add constraint matchday_editorial_bank_items_continuity_source_matchday_fkey
    foreign key (continuity_source_matchday_id)
    references public.matchdays(id)
    on delete restrict,
  add constraint matchday_editorial_bank_items_continuity_composition_fkey
    foreign key (continuity_source_composition_id)
    references public.matchday_reference_compositions(id)
    on delete restrict,
  add constraint matchday_editorial_bank_items_continuity_provenance_check
    check (
      (
        continuity_source_matchday_id is null
        and continuity_source_composition_id is null
      )
      or (
        continuity_source_matchday_id is not null
        and continuity_source_composition_id is not null
      )
    );

comment on column public.matchday_editorial_bank_items.automatic_eligible is
  'Indica se a fonte ativa pode entrar na classificação temática automática da própria jornada.';

comment on column public.matchday_editorial_bank_items.continuity_source_matchday_id is
  'Jornada histórica de onde a fonte foi herdada; a proveniência é preservada mesmo se a fonte se tornar elegível automaticamente.';

comment on column public.matchday_editorial_bank_items.continuity_source_composition_id is
  'Composição histórica publicada de onde a fonte foi herdada; deve ser preenchida em conjunto com a jornada de origem.';

create or replace function public.matchday_editorial_profile_classification_plan(
  p_matchday_id uuid
)
returns table (
  source_type text,
  source_id text,
  classified_zone_key text,
  actuality_order integer
)
language sql
stable
security definer
set search_path = ''
as $$
  with matchday_context as (
    select
      matchday_row.season_id,
      competition_row.name as competition_name,
      competition_row.slug as competition_slug
    from public.matchdays as matchday_row
    join public.seasons as season_row
      on season_row.id = matchday_row.season_id
    join public.competitions as competition_row
      on competition_row.id = season_row.competition_id
    where matchday_row.id = p_matchday_id
  ),
  participant_teams as (
    select
      team_row.id as team_id,
      team_row.slug,
      team_row.name,
      team_row.short_name,
      team_row.public_name,
      case team_row.slug
        when 'benfica' then 'benfica'
        when 'sporting' then 'sporting'
        when 'fc-porto' then 'fc_porto'
        else 'other_liga_clubs'
      end as zone_key,
      case team_row.slug
        when 'benfica' then 1
        when 'sporting' then 2
        when 'fc-porto' then 3
        else 4
      end as profile_priority
    from matchday_context as context_row
    join public.season_teams as season_team_row
      on season_team_row.season_id = context_row.season_id
     and season_team_row.status = 'active'
    join public.teams as team_row
      on team_row.id = season_team_row.team_id
  ),
  participant_alias_values as (
    select participant_row.*, participant_row.name as alias_value
    from participant_teams as participant_row
    union all
    select participant_row.*, participant_row.short_name
    from participant_teams as participant_row
    union all
    select participant_row.*, participant_row.public_name
    from participant_teams as participant_row
    union all
    select participant_row.*, pg_catalog.replace(participant_row.slug, '-', ' ')
    from participant_teams as participant_row
    union all
    select participant_row.*, team_alias_row.alias
    from participant_teams as participant_row
    join public.team_aliases as team_alias_row
      on team_alias_row.team_id = participant_row.team_id
     and team_alias_row.status = 'active'
    union all
    select participant_row.*, pg_catalog.replace(team_alias_row.normalized_alias, '-', ' ')
    from participant_teams as participant_row
    join public.team_aliases as team_alias_row
      on team_alias_row.team_id = participant_row.team_id
     and team_alias_row.status = 'active'
  ),
  participant_aliases as (
    select distinct
      alias_row.zone_key,
      alias_row.profile_priority,
      public.normalize_matchday_editorial_profile_evidence(alias_row.alias_value) as normalized_alias
    from participant_alias_values as alias_row
    where nullif(pg_catalog.btrim(alias_row.alias_value), '') is not null
  ),
  known_team_alias_values as (
    select team_row.id as team_id, team_row.name as alias_value
    from public.teams as team_row
    union all
    select team_row.id, team_row.short_name
    from public.teams as team_row
    union all
    select team_row.id, team_row.public_name
    from public.teams as team_row
    union all
    select team_row.id, pg_catalog.replace(team_row.slug, '-', ' ')
    from public.teams as team_row
    union all
    select team_row.id, team_alias_row.alias
    from public.teams as team_row
    join public.team_aliases as team_alias_row
      on team_alias_row.team_id = team_row.id
     and team_alias_row.status = 'active'
    union all
    select team_row.id, pg_catalog.replace(team_alias_row.normalized_alias, '-', ' ')
    from public.teams as team_row
    join public.team_aliases as team_alias_row
      on team_alias_row.team_id = team_row.id
     and team_alias_row.status = 'active'
  ),
  known_team_aliases as (
    select distinct
      alias_row.team_id,
      public.normalize_matchday_editorial_profile_evidence(alias_row.alias_value) as normalized_alias
    from known_team_alias_values as alias_row
    where nullif(pg_catalog.btrim(alias_row.alias_value), '') is not null
  ),
  outside_team_aliases as (
    select alias_row.team_id, alias_row.normalized_alias
    from known_team_aliases as alias_row
    left join participant_teams as participant_row
      on participant_row.team_id = alias_row.team_id
    where participant_row.team_id is null
  ),
  competition_alias_values as (
    select context_row.competition_name as alias_value
    from matchday_context as context_row
    union
    select pg_catalog.replace(context_row.competition_slug, '-', ' ')
    from matchday_context as context_row
  ),
  competition_aliases as (
    select distinct
      public.normalize_matchday_editorial_profile_evidence(alias_row.alias_value) as normalized_alias
    from competition_alias_values as alias_row
    where nullif(pg_catalog.btrim(alias_row.alias_value), '') is not null
  ),
  canonical_candidates as (
    select
      pg_catalog.lower(pg_catalog.btrim(bank_row.source_type)) as source_type,
      pg_catalog.btrim(bank_row.source_id) as source_id,
      article_row.label,
      article_row.title,
      article_row.subtitle,
      article_row.body,
      article_row.published_at,
      article_row.updated_at
    from public.matchday_editorial_bank_items as bank_row
    join public.editorial_articles as article_row
      on article_row.id::text = pg_catalog.btrim(bank_row.source_id)
    where bank_row.matchday_id = p_matchday_id
      and pg_catalog.lower(pg_catalog.btrim(bank_row.status)) = 'active'
      and pg_catalog.lower(pg_catalog.btrim(bank_row.source_type)) = 'editorial_article'
      and bank_row.automatic_eligible = true
  ),
  normalized_candidates as (
    select
      candidate_row.*,
      public.normalize_matchday_editorial_profile_evidence(
        coalesce(candidate_row.label, '')
      ) as normalized_label,
      public.normalize_matchday_editorial_profile_evidence(
        pg_catalog.concat_ws(
          ' ',
          candidate_row.title,
          candidate_row.subtitle,
          candidate_row.body
        )
      ) as normalized_content
    from canonical_candidates as candidate_row
  ),
  structural_labels as (
    select
      candidate_row.*,
      case
        when pg_catalog.strpos(candidate_row.normalized_label, '|') > 0 then
          pg_catalog.btrim(
            pg_catalog.substr(
              candidate_row.normalized_label,
              1,
              pg_catalog.strpos(candidate_row.normalized_label, '|') - 1
            )
          )
        else null
      end as label_prefix,
      case
        when pg_catalog.strpos(candidate_row.normalized_label, '|') > 0 then
          pg_catalog.btrim(
            pg_catalog.substr(
              candidate_row.normalized_label,
              pg_catalog.strpos(candidate_row.normalized_label, '|') + 1
            )
          )
        else candidate_row.normalized_label
      end as structural_label
    from normalized_candidates as candidate_row
  ),
  label_subjects as (
    select
      candidate_row.source_type,
      candidate_row.source_id,
      evidence_row.evidence
    from structural_labels as candidate_row
    cross join lateral (
      select candidate_row.normalized_label as evidence
      union
      select candidate_row.structural_label
      union
      select pg_catalog.regexp_replace(
        candidate_row.structural_label,
        '^reacoes ao[[:space:]]+',
        ''
      )
      union
      select pg_catalog.btrim(label_part.value)
      from pg_catalog.unnest(
        pg_catalog.string_to_array(
          pg_catalog.regexp_replace(
            candidate_row.structural_label,
            '^reacoes ao[[:space:]]+',
            ''
          ),
          '-'
        )
      ) as label_part(value)
    ) as evidence_row
    where nullif(pg_catalog.btrim(evidence_row.evidence), '') is not null
  ),
  label_matches as (
    select
      subject_row.source_type,
      subject_row.source_id,
      pg_catalog.min(alias_row.profile_priority) as profile_priority
    from label_subjects as subject_row
    join participant_aliases as alias_row
      on alias_row.normalized_alias = subject_row.evidence
    group by subject_row.source_type, subject_row.source_id
  ),
  outside_team_label_matches as (
    select
      subject_row.source_type,
      subject_row.source_id,
      pg_catalog.count(distinct alias_row.team_id)::integer as matching_team_count
    from label_subjects as subject_row
    join outside_team_aliases as alias_row
      on alias_row.normalized_alias = subject_row.evidence
    group by subject_row.source_type, subject_row.source_id
  ),
  competition_label_matches as (
    select
      subject_row.source_type,
      subject_row.source_id
    from label_subjects as subject_row
    join competition_aliases as alias_row
      on alias_row.normalized_alias = subject_row.evidence
    union
    select
      candidate_row.source_type,
      candidate_row.source_id
    from structural_labels as candidate_row
    join competition_aliases as alias_row
      on alias_row.normalized_alias = candidate_row.label_prefix
  ),
  textual_mentions as (
    select
      candidate_row.*,
      label_row.profile_priority,
      coalesce(outside_row.matching_team_count, 0) as outside_team_match_count,
      competition_row.source_id is not null as matches_competition_label,
      candidate_row.normalized_content ~
        '(^|[^[:alnum:]_])(sl[[:space:]]+)?benfica([^[:alnum:]_]|$)'
        as mentions_benfica,
      candidate_row.normalized_content ~
        '(^|[^[:alnum:]_])sporting([[:space:]]+(cp|clube de portugal))?([^[:alnum:]_]|$)'
        as mentions_sporting,
      candidate_row.normalized_content ~
        '(^|[^[:alnum:]_])(fc[[:space:]]+porto|futebol[[:space:]]+clube[[:space:]]+do[[:space:]]+porto)([^[:alnum:]_]|$)'
        as mentions_fc_porto
    from structural_labels as candidate_row
    left join label_matches as label_row
      on label_row.source_type = candidate_row.source_type
     and label_row.source_id = candidate_row.source_id
    left join outside_team_label_matches as outside_row
      on outside_row.source_type = candidate_row.source_type
     and outside_row.source_id = candidate_row.source_id
    left join competition_label_matches as competition_row
      on competition_row.source_type = candidate_row.source_type
     and competition_row.source_id = candidate_row.source_id
  ),
  classified_candidates as (
    select
      candidate_row.*,
      case
        when candidate_row.profile_priority = 1 then 'benfica'
        when candidate_row.profile_priority = 2 then 'sporting'
        when candidate_row.profile_priority = 3 then 'fc_porto'
        when candidate_row.profile_priority = 4 then 'other_liga_clubs'
        when candidate_row.outside_team_match_count > 0 then 'outside_liga_other'
        when candidate_row.matches_competition_label then 'outside_liga_other'
        when candidate_row.normalized_label in ('selecao nacional', 'futebol internacional')
          or candidate_row.structural_label in ('selecao nacional', 'futebol internacional')
          or candidate_row.label_prefix in ('selecao nacional', 'futebol internacional')
          then 'outside_liga_other'
        when (
          candidate_row.mentions_benfica::integer
          + candidate_row.mentions_sporting::integer
          + candidate_row.mentions_fc_porto::integer
        ) = 1 then
          case
            when candidate_row.mentions_benfica then 'benfica'
            when candidate_row.mentions_sporting then 'sporting'
            when candidate_row.mentions_fc_porto then 'fc_porto'
          end
        else 'outside_liga_other'
      end as classified_zone_key
    from textual_mentions as candidate_row
  )
  select
    candidate_row.source_type,
    candidate_row.source_id,
    candidate_row.classified_zone_key,
    pg_catalog.row_number() over (
      partition by candidate_row.classified_zone_key
      order by
        candidate_row.published_at desc nulls last,
        candidate_row.updated_at desc nulls last,
        candidate_row.source_type asc,
        candidate_row.source_id asc
    )::integer as actuality_order
  from classified_candidates as candidate_row;
$$;

create or replace function public.upsert_matchday_editorial_bank_publication(
  p_matchday_id uuid,
  p_source_type text,
  p_source_id text,
  p_source_slug text,
  p_label text,
  p_title text,
  p_subtitle text,
  p_image_url text,
  p_link_url text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_source_type text := lower(btrim(coalesce(p_source_type, '')));
  v_source_id text := nullif(btrim(p_source_id), '');
  v_source_slug text := nullif(btrim(p_source_slug), '');
  v_title text := nullif(btrim(p_title), '');
  v_link_url text := nullif(btrim(p_link_url), '');
  v_normalized_link text := lower(regexp_replace(split_part(split_part(coalesce(v_link_url, ''), '?', 1), '#', 1), '/$', ''));
  v_keep_id uuid;
  v_drop_id uuid;
  v_preserve_archived boolean := false;
begin
  if p_matchday_id is null or not exists (
    select 1 from public.matchdays where id = p_matchday_id
  ) then
    raise exception 'invalid_matchday';
  end if;

  if v_source_type not in ('editorial_article', 'editorial_content') then
    raise exception 'invalid_source_type';
  end if;

  if v_source_id is null then
    raise exception 'missing_source_id';
  end if;

  if v_title is null then
    raise exception 'missing_title';
  end if;

  select bank.id
    into v_keep_id
  from public.matchday_editorial_bank_items bank
  where bank.matchday_id = p_matchday_id
    and lower(btrim(coalesce(bank.source_type, ''))) = v_source_type
    and lower(btrim(coalesce(bank.source_id, ''))) = lower(v_source_id)
  order by bank.created_at asc, bank.id asc
  limit 1;

  if v_keep_id is null and v_normalized_link <> '' then
    select bank.id
      into v_keep_id
    from public.matchday_editorial_bank_items bank
    where bank.matchday_id = p_matchday_id
      and lower(regexp_replace(split_part(split_part(coalesce(bank.link_url, ''), '?', 1), '#', 1), '/$', '')) = v_normalized_link
    order by bank.created_at asc, bank.id asc
    limit 1;
  end if;

  if v_keep_id is not null then
    select coalesce(bool_or(bank.status = 'archived'), false)
      into v_preserve_archived
    from public.matchday_editorial_bank_items bank
    where bank.matchday_id = p_matchday_id
      and (
        (
          lower(btrim(coalesce(bank.source_type, ''))) = v_source_type
          and lower(btrim(coalesce(bank.source_id, ''))) = lower(v_source_id)
        )
        or (
          v_normalized_link <> ''
          and lower(regexp_replace(split_part(split_part(coalesce(bank.link_url, ''), '?', 1), '#', 1), '/$', '')) = v_normalized_link
        )
      );

    for v_drop_id in
      select bank.id
      from public.matchday_editorial_bank_items bank
      where bank.id <> v_keep_id
        and bank.matchday_id = p_matchday_id
        and (
          (
            lower(btrim(coalesce(bank.source_type, ''))) = v_source_type
            and lower(btrim(coalesce(bank.source_id, ''))) = lower(v_source_id)
          )
          or (
            v_normalized_link <> ''
            and lower(regexp_replace(split_part(split_part(coalesce(bank.link_url, ''), '?', 1), '#', 1), '/$', '')) = v_normalized_link
          )
        )
      order by bank.created_at asc, bank.id asc
    loop
      delete from public.matchday_reference_composition_items dropped_item
      where dropped_item.source_id = v_drop_id
        and lower(btrim(coalesce(dropped_item.source_type, ''))) in ('manual_link', 'matchday_editorial_bank_item')
        and exists (
          select 1
          from public.matchday_reference_composition_items kept_item
          where kept_item.composition_id = dropped_item.composition_id
            and kept_item.source_id = v_keep_id
            and lower(btrim(coalesce(kept_item.source_type, ''))) in ('manual_link', 'matchday_editorial_bank_item')
        );

      update public.matchday_reference_composition_items
      set source_id = v_keep_id,
          source_type = 'matchday_editorial_bank_item',
          updated_at = now()
      where source_id = v_drop_id
        and lower(btrim(coalesce(source_type, ''))) in ('manual_link', 'matchday_editorial_bank_item');

      delete from public.matchday_hierarchical_composition_slots dropped_slot
      where dropped_slot.bank_item_id = v_drop_id
        and exists (
          select 1
          from public.matchday_hierarchical_composition_slots kept_slot
          where kept_slot.composition_id = dropped_slot.composition_id
            and kept_slot.bank_item_id = v_keep_id
        );

      update public.matchday_hierarchical_composition_slots
      set bank_item_id = v_keep_id,
          updated_at = now()
      where bank_item_id = v_drop_id;

      delete from public.matchday_editorial_bank_items
      where id = v_drop_id;
    end loop;

    update public.matchday_editorial_bank_items
    set matchday_id = p_matchday_id,
        label = nullif(btrim(p_label), ''),
        title = v_title,
        subtitle = nullif(btrim(p_subtitle), ''),
        image_url = nullif(btrim(p_image_url), ''),
        link_url = v_link_url,
        source_type = v_source_type,
        source_id = v_source_id,
        source_slug = v_source_slug,
        origin_slot_type = null,
        sort_order = null,
        status = case when v_preserve_archived then 'archived' else status end,
        automatic_eligible = true,
        updated_at = now()
    where id = v_keep_id;
  else
    insert into public.matchday_editorial_bank_items (
      matchday_id,
      label,
      title,
      subtitle,
      image_url,
      link_url,
      source_type,
      source_id,
      source_slug,
      origin_slot_type,
      sort_order,
      status,
      automatic_eligible,
      continuity_source_matchday_id,
      continuity_source_composition_id
    ) values (
      p_matchday_id,
      nullif(btrim(p_label), ''),
      v_title,
      nullif(btrim(p_subtitle), ''),
      nullif(btrim(p_image_url), ''),
      v_link_url,
      v_source_type,
      v_source_id,
      v_source_slug,
      null,
      null,
      'active',
      true,
      null,
      null
    )
    returning id into v_keep_id;
  end if;

  return v_keep_id;
end
$$;

create or replace function public.refresh_matchday_editorial_profile_distribution_from_bank()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_first_matchday_id uuid;
  v_second_matchday_id uuid;
begin
  if tg_op = 'DELETE' then
    if not old.automatic_eligible then
      return null;
    end if;

    v_first_matchday_id := old.matchday_id;
  elsif tg_op = 'INSERT' then
    if not new.automatic_eligible then
      return null;
    end if;

    v_first_matchday_id := new.matchday_id;
  elsif not old.automatic_eligible and not new.automatic_eligible then
    return null;
  elsif old.automatic_eligible and not new.automatic_eligible then
    v_first_matchday_id := old.matchday_id;
  elsif not old.automatic_eligible and new.automatic_eligible then
    v_first_matchday_id := new.matchday_id;
  elsif old.matchday_id = new.matchday_id then
    v_first_matchday_id := new.matchday_id;
  elsif old.matchday_id < new.matchday_id then
    v_first_matchday_id := old.matchday_id;
    v_second_matchday_id := new.matchday_id;
  else
    v_first_matchday_id := new.matchday_id;
    v_second_matchday_id := old.matchday_id;
  end if;

  if exists (
    select 1
    from public.matchday_editorial_profile_assignments as assignment_row
    where assignment_row.matchday_id = v_first_matchday_id
  ) then
    perform public.refresh_matchday_editorial_profile_distribution(v_first_matchday_id);
  end if;

  if v_second_matchday_id is not null and exists (
    select 1
    from public.matchday_editorial_profile_assignments as assignment_row
    where assignment_row.matchday_id = v_second_matchday_id
  ) then
    perform public.refresh_matchday_editorial_profile_distribution(v_second_matchday_id);
  end if;

  return null;
end;
$$;

comment on function public.matchday_editorial_profile_classification_plan(uuid) is
  'Returns natural thematic classification and deterministic actuality order for every active, automatically eligible canonical candidate, without applying zone capacity.';

comment on function public.upsert_matchday_editorial_bank_publication(uuid, text, text, text, text, text, text, text, text) is
  'Reconcilia uma publicação canónica dentro do banco de uma jornada, promove-a a elegível para classificação automática e preserva eventual proveniência de continuidade.';

comment on function public.refresh_matchday_editorial_profile_distribution_from_bank() is
  'Refresca apenas as jornadas afetadas por linhas do Banco elegíveis para classificação automática.';

notify pgrst, 'reload schema';

commit;
