begin;

create table public.matchday_editorial_profile_state_items (
  id uuid primary key default gen_random_uuid(),
  matchday_id uuid not null references public.matchdays(id) on delete cascade,
  profile_key text not null,
  source_type text not null,
  source_id text not null,
  zone_key text,
  sort_order integer,
  placement_mode text not null default 'automatic_actuality',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint matchday_editorial_profile_state_items_profile_key_check
    check (profile_key = 'liga_portugal_v1'),
  constraint matchday_editorial_profile_state_items_source_type_check
    check (source_type = 'editorial_article'),
  constraint matchday_editorial_profile_state_items_source_id_not_blank_check
    check (btrim(source_id) <> ''),
  constraint matchday_editorial_profile_state_items_zone_key_check
    check (
      zone_key is null
      or zone_key in (
        'benfica',
        'sporting',
        'fc_porto',
        'other_liga_clubs',
        'outside_liga_other'
      )
    ),
  constraint matchday_editorial_profile_state_items_placement_mode_check
    check (placement_mode = 'automatic_actuality'),
  constraint matchday_editorial_profile_state_items_placement_check
    check (
      (zone_key is null and sort_order is null)
      or (zone_key is not null and sort_order > 0)
    ),
  constraint matchday_editorial_profile_state_items_source_identity_key
    unique (matchday_id, profile_key, source_type, source_id)
);

create unique index matchday_editorial_profile_state_items_placement_key
  on public.matchday_editorial_profile_state_items (
    matchday_id,
    profile_key,
    zone_key,
    sort_order
  )
  where zone_key is not null;

alter table public.matchday_editorial_profile_state_items enable row level security;

revoke all on table public.matchday_editorial_profile_state_items
  from public, anon, authenticated, service_role;
grant select on table public.matchday_editorial_profile_state_items
  to service_role;

comment on table public.matchday_editorial_profile_state_items is
  'Estado temático interno e independente da assignment. Preserva a identidade canónica source_type + source_id e a colocação automática; remover a assignment não apaga este estado.';
comment on column public.matchday_editorial_profile_state_items.zone_key is
  'Zona temática atual; NULL mantém a publicação conhecida sem ocupar capacidade visual.';
comment on column public.matchday_editorial_profile_state_items.sort_order is
  'Posição por atualidade dentro da zona; NULL quando a publicação está fora da capacidade.';

create function public.normalize_matchday_editorial_profile_evidence(
  p_value text
)
returns text
language sql
immutable
strict
security invoker
set search_path = ''
as $$
  select pg_catalog.btrim(
    pg_catalog.regexp_replace(
      pg_catalog.translate(
        pg_catalog.lower(p_value),
        'áàâãäéèêëíìîïóòôõöúùûüç–—',
        'aaaaaeeeeiiiiooooouuuuc--'
      ),
      '[[:space:]]+',
      ' ',
      'g'
    )
  );
$$;

revoke all on function public.normalize_matchday_editorial_profile_evidence(text)
  from public, anon, authenticated, service_role;

create function public.matchday_editorial_profile_distribution_plan(
  p_matchday_id uuid
)
returns table (
  source_type text,
  source_id text,
  zone_key text,
  sort_order integer
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
        when candidate_row.outside_team_match_count > 0
          then 'outside_liga_other'
        when candidate_row.matches_competition_label
          then 'outside_liga_other'
        when candidate_row.normalized_label in (
          'selecao nacional',
          'futebol internacional'
        )
          or candidate_row.structural_label in (
            'selecao nacional',
            'futebol internacional'
          )
          or candidate_row.label_prefix in (
            'selecao nacional',
            'futebol internacional'
          )
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
  ),
  ranked_candidates as (
    select
      candidate_row.*,
      pg_catalog.row_number() over (
        partition by candidate_row.classified_zone_key
        order by
          candidate_row.published_at desc nulls last,
          candidate_row.updated_at desc nulls last,
          candidate_row.source_type asc,
          candidate_row.source_id asc
      ) as actuality_order,
      case candidate_row.classified_zone_key
        when 'benfica' then 6
        when 'sporting' then 5
        when 'fc_porto' then 5
        when 'other_liga_clubs' then 6
        when 'outside_liga_other' then 5
      end as zone_capacity
    from classified_candidates as candidate_row
  )
  select
    candidate_row.source_type,
    candidate_row.source_id,
    case
      when candidate_row.actuality_order <= candidate_row.zone_capacity
        then candidate_row.classified_zone_key
      else null
    end as zone_key,
    case
      when candidate_row.actuality_order <= candidate_row.zone_capacity
        then candidate_row.actuality_order::integer
      else null
    end as sort_order
  from ranked_candidates as candidate_row;
$$;

revoke all on function public.matchday_editorial_profile_distribution_plan(uuid)
  from public, anon, authenticated, service_role;

create function public.refresh_matchday_editorial_profile_distribution(
  p_matchday_id uuid
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile_key text;
  v_competition_slug text;
  v_now timestamptz := pg_catalog.now();
  v_placed_count integer;
begin
  if p_matchday_id is null then
    raise exception 'matchday-editorial-profile-distribution-invalid-input';
  end if;

  if not exists (
    select 1
    from public.matchdays as matchday_row
    where matchday_row.id = p_matchday_id
  ) then
    raise exception 'matchday-editorial-profile-distribution-matchday-not-found';
  end if;

  select assignment_row.profile_key, competition_row.slug
  into v_profile_key, v_competition_slug
  from public.matchday_editorial_profile_assignments as assignment_row
  join public.matchdays as matchday_row
    on matchday_row.id = assignment_row.matchday_id
  join public.seasons as season_row
    on season_row.id = matchday_row.season_id
  join public.competitions as competition_row
    on competition_row.id = season_row.competition_id
  where assignment_row.matchday_id = p_matchday_id
  for update of assignment_row;

  if not found then
    return 0;
  end if;

  if v_profile_key is distinct from 'liga_portugal_v1' then
    raise exception 'matchday-editorial-profile-distribution-invalid-profile';
  end if;

  if v_competition_slug is distinct from 'liga-portugal' then
    raise exception 'matchday-editorial-profile-distribution-incompatible-competition';
  end if;

  insert into public.matchday_editorial_profile_state_items (
    matchday_id,
    profile_key,
    source_type,
    source_id
  )
  select
    p_matchday_id,
    v_profile_key,
    plan_row.source_type,
    plan_row.source_id
  from public.matchday_editorial_profile_distribution_plan(p_matchday_id) as plan_row
  on conflict (matchday_id, profile_key, source_type, source_id) do nothing;

  update public.matchday_editorial_profile_state_items as state_row
  set zone_key = null,
      sort_order = null,
      updated_at = v_now
  where state_row.matchday_id = p_matchday_id
    and state_row.profile_key = v_profile_key
    and (state_row.zone_key is not null or state_row.sort_order is not null)
    and not exists (
      select 1
      from public.matchday_editorial_profile_distribution_plan(p_matchday_id) as plan_row
      where plan_row.source_type = state_row.source_type
        and plan_row.source_id = state_row.source_id
    );

  with desired_state as (
    select *
    from public.matchday_editorial_profile_distribution_plan(p_matchday_id)
  )
  update public.matchday_editorial_profile_state_items as state_row
  set zone_key = null,
      sort_order = null,
      updated_at = v_now
  from desired_state as desired_row
  where state_row.matchday_id = p_matchday_id
    and state_row.profile_key = v_profile_key
    and state_row.source_type = desired_row.source_type
    and state_row.source_id = desired_row.source_id
    and state_row.zone_key is not null
    and (state_row.zone_key, state_row.sort_order)
      is distinct from (desired_row.zone_key, desired_row.sort_order);

  with desired_state as (
    select *
    from public.matchday_editorial_profile_distribution_plan(p_matchday_id)
  )
  update public.matchday_editorial_profile_state_items as state_row
  set zone_key = desired_row.zone_key,
      sort_order = desired_row.sort_order,
      updated_at = v_now
  from desired_state as desired_row
  where state_row.matchday_id = p_matchday_id
    and state_row.profile_key = v_profile_key
    and state_row.source_type = desired_row.source_type
    and state_row.source_id = desired_row.source_id
    and (state_row.zone_key, state_row.sort_order)
      is distinct from (desired_row.zone_key, desired_row.sort_order);

  select pg_catalog.count(*)::integer
  into v_placed_count
  from public.matchday_editorial_profile_state_items as state_row
  where state_row.matchday_id = p_matchday_id
    and state_row.profile_key = v_profile_key
    and state_row.zone_key is not null;

  return v_placed_count;
end;
$$;

revoke all on function public.refresh_matchday_editorial_profile_distribution(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.refresh_matchday_editorial_profile_distribution(uuid)
  to service_role;

comment on function public.refresh_matchday_editorial_profile_distribution(uuid) is
  'Reconcilia e distribui por atualidade publicações canónicas ativas apenas quando a Jornada tem assignment temática explícita; sem assignment devolve 0 e não altera estado.';

create function public.refresh_matchday_editorial_profile_distribution_from_bank()
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
    v_first_matchday_id := old.matchday_id;
  elsif tg_op = 'INSERT' then
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

revoke all on function public.refresh_matchday_editorial_profile_distribution_from_bank()
  from public, anon, authenticated, service_role;

create trigger refresh_matchday_editorial_profile_distribution_from_bank
after insert or update or delete on public.matchday_editorial_bank_items
for each row
execute function public.refresh_matchday_editorial_profile_distribution_from_bank();

create function public.refresh_matchday_editorial_profile_distribution_from_assignment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.refresh_matchday_editorial_profile_distribution(new.matchday_id);
  return new;
end;
$$;

revoke all on function public.refresh_matchday_editorial_profile_distribution_from_assignment()
  from public, anon, authenticated, service_role;

create trigger refresh_matchday_editorial_profile_distribution_from_assignment
after insert or update on public.matchday_editorial_profile_assignments
for each row
execute function public.refresh_matchday_editorial_profile_distribution_from_assignment();

commit;
