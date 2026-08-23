begin;

alter table public.matchday_editorial_profile_manual_overrides
  add column placement_target text;

update public.matchday_editorial_profile_manual_overrides
set placement_target = case
  when zone_key is null then 'bank'
  else 'zone'
end;

alter table public.matchday_editorial_profile_manual_overrides
  alter column placement_target set not null;

alter table public.matchday_editorial_profile_manual_overrides
  drop constraint matchday_editorial_profile_manual_overrides_placement_check;

alter table public.matchday_editorial_profile_manual_overrides
  add constraint matchday_editorial_profile_manual_overrides_placement_target_check
    check (placement_target in ('bank', 'zone', 'faixa')),
  add constraint matchday_editorial_profile_manual_overrides_placement_check
    check (
      (placement_target = 'bank' and zone_key is null and sort_order is null)
      or (
        placement_target = 'zone'
        and zone_key is not null
        and (sort_order is null or sort_order > 0)
      )
      or (
        placement_target = 'faixa'
        and zone_key is null
        and sort_order is not null
        and sort_order > 0
      )
    ),
  add constraint matchday_editorial_profile_manual_overrides_zone_capacity_check
    check (
      placement_target <> 'zone'
      or sort_order is null
      or sort_order <= case zone_key
        when 'benfica' then 6
        when 'sporting' then 5
        when 'fc_porto' then 5
        when 'other_liga_clubs' then 6
        when 'outside_liga_other' then 5
      end
    );

create unique index matchday_editorial_profile_manual_overrides_faixa_slot_key
  on public.matchday_editorial_profile_manual_overrides (
    matchday_id,
    profile_key,
    sort_order
  )
  where placement_target = 'faixa';

comment on column public.matchday_editorial_profile_manual_overrides.placement_target is
  'Explicit manual destination: bank, one of the five thematic zones, or the shared ordered Faixa.';

revoke execute on function public.apply_matchday_editorial_profile_manual_overrides(uuid, text, jsonb)
  from service_role;

comment on function public.apply_matchday_editorial_profile_manual_overrides(uuid, text, jsonb) is
  'Retired by the atomic thematic reconcile. It remains for migration history but is no longer executable by application roles.';

create table public.matchday_editorial_profile_zone_items (
  id uuid primary key default gen_random_uuid(),
  matchday_id uuid not null references public.matchdays(id) on delete cascade,
  profile_key text not null,
  source_type text not null,
  source_id text not null,
  zone_key text not null,
  sort_order integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint matchday_editorial_profile_zone_items_profile_key_check
    check (profile_key = 'liga_portugal_v1'),
  constraint matchday_editorial_profile_zone_items_source_type_check
    check (source_type = 'editorial_article'),
  constraint matchday_editorial_profile_zone_items_source_id_check
    check (btrim(source_id) <> ''),
  constraint matchday_editorial_profile_zone_items_zone_key_check
    check (
      zone_key in (
        'benfica',
        'sporting',
        'fc_porto',
        'other_liga_clubs',
        'outside_liga_other'
      )
    ),
  constraint matchday_editorial_profile_zone_items_sort_order_check
    check (
      sort_order > 0
      and sort_order <= case zone_key
        when 'benfica' then 6
        when 'sporting' then 5
        when 'fc_porto' then 5
        when 'other_liga_clubs' then 6
        when 'outside_liga_other' then 5
      end
    ),
  constraint matchday_editorial_profile_zone_items_identity_key
    unique (matchday_id, profile_key, source_type, source_id),
  constraint matchday_editorial_profile_zone_items_slot_key
    unique (matchday_id, profile_key, zone_key, sort_order)
);

create index matchday_editorial_profile_zone_items_matchday_idx
  on public.matchday_editorial_profile_zone_items (matchday_id, profile_key);

alter table public.matchday_editorial_profile_zone_items enable row level security;

revoke all on table public.matchday_editorial_profile_zone_items
  from public, anon, authenticated, service_role;
grant select on table public.matchday_editorial_profile_zone_items
  to service_role;

comment on table public.matchday_editorial_profile_zone_items is
  'Last atomically applied composition of the five thematic zones. It is neither classification nor the shared Faixa.';

create table public.matchday_editorial_profile_reconcile_control (
  matchday_id uuid not null references public.matchdays(id) on delete cascade,
  profile_key text not null,
  revision bigint not null default 0,
  last_applied_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint matchday_editorial_profile_reconcile_control_pkey
    primary key (matchday_id, profile_key),
  constraint matchday_editorial_profile_reconcile_control_profile_key_check
    check (profile_key = 'liga_portugal_v1'),
  constraint matchday_editorial_profile_reconcile_control_revision_check
    check (revision >= 0)
);

alter table public.matchday_editorial_profile_reconcile_control enable row level security;

revoke all on table public.matchday_editorial_profile_reconcile_control
  from public, anon, authenticated, service_role;
grant select on table public.matchday_editorial_profile_reconcile_control
  to service_role;

comment on table public.matchday_editorial_profile_reconcile_control is
  'Optimistic revision and materialization marker for the applied thematic zone snapshot and shared Faixa reconcile.';

create function public.matchday_editorial_profile_classification_plan(
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

revoke all on function public.matchday_editorial_profile_classification_plan(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.matchday_editorial_profile_classification_plan(uuid)
  to service_role;

comment on function public.matchday_editorial_profile_classification_plan(uuid) is
  'Returns natural thematic classification and deterministic actuality order for every active canonical candidate, without applying zone capacity.';

create or replace function public.matchday_editorial_profile_distribution_plan(
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
  select
    classified.source_type,
    classified.source_id,
    case
      when classified.actuality_order <= case classified.classified_zone_key
        when 'benfica' then 6
        when 'sporting' then 5
        when 'fc_porto' then 5
        when 'other_liga_clubs' then 6
        when 'outside_liga_other' then 5
      end then classified.classified_zone_key
      else null
    end as zone_key,
    case
      when classified.actuality_order <= case classified.classified_zone_key
        when 'benfica' then 6
        when 'sporting' then 5
        when 'fc_porto' then 5
        when 'other_liga_clubs' then 6
        when 'outside_liga_other' then 5
      end then classified.actuality_order
      else null
    end as sort_order
  from public.matchday_editorial_profile_classification_plan(p_matchday_id) as classified;
$$;

create function public.matchday_editorial_profile_reconcile_token(
  p_matchday_id uuid,
  p_profile_key text
)
returns table (state_token text)
language sql
stable
security definer
set search_path = ''
as $$
  select pg_catalog.md5(
    pg_catalog.jsonb_build_object(
      'assignment', coalesce(
        (
          select pg_catalog.to_jsonb(assignment_row)
          from public.matchday_editorial_profile_assignments as assignment_row
          where assignment_row.matchday_id = p_matchday_id
        ),
        'null'::jsonb
      ),
      'classification', coalesce(
        (
          select pg_catalog.jsonb_agg(
            pg_catalog.to_jsonb(classified_row)
            order by classified_row.source_type, classified_row.source_id
          )
          from public.matchday_editorial_profile_classification_plan(p_matchday_id) as classified_row
        ),
        '[]'::jsonb
      ),
      'automatic_state', coalesce(
        (
          select pg_catalog.jsonb_agg(
            pg_catalog.to_jsonb(state_row)
            order by state_row.source_type, state_row.source_id
          )
          from public.matchday_editorial_profile_state_items as state_row
          where state_row.matchday_id = p_matchday_id
            and state_row.profile_key = p_profile_key
        ),
        '[]'::jsonb
      ),
      'articles', coalesce(
        (
          select pg_catalog.jsonb_agg(
            pg_catalog.to_jsonb(article_row)
            order by article_row.id
          )
          from public.editorial_articles as article_row
          where article_row.id::text in (
            select classified_row.source_id
            from public.matchday_editorial_profile_classification_plan(p_matchday_id) as classified_row
          )
        ),
        '[]'::jsonb
      ),
      'overrides', coalesce(
        (
          select pg_catalog.jsonb_agg(
            pg_catalog.to_jsonb(override_row)
            order by override_row.source_type, override_row.source_id
          )
          from public.matchday_editorial_profile_manual_overrides as override_row
          where override_row.matchday_id = p_matchday_id
            and override_row.profile_key = p_profile_key
        ),
        '[]'::jsonb
      ),
      'zone_items', coalesce(
        (
          select pg_catalog.jsonb_agg(
            pg_catalog.to_jsonb(zone_row)
            order by zone_row.zone_key, zone_row.sort_order, zone_row.source_id
          )
          from public.matchday_editorial_profile_zone_items as zone_row
          where zone_row.matchday_id = p_matchday_id
            and zone_row.profile_key = p_profile_key
        ),
        '[]'::jsonb
      ),
      'control', coalesce(
        (
          select pg_catalog.to_jsonb(control_row)
          from public.matchday_editorial_profile_reconcile_control as control_row
          where control_row.matchday_id = p_matchday_id
            and control_row.profile_key = p_profile_key
        ),
        'null'::jsonb
      ),
      'faixa', coalesce(
        (
          select pg_catalog.jsonb_agg(
            pg_catalog.to_jsonb(faixa_row)
            order by faixa_row.sort_order, faixa_row.id
          )
          from public.matchday_horizontal_news as faixa_row
          where faixa_row.matchday_id = p_matchday_id
        ),
        '[]'::jsonb
      )
    )::text
  ) as state_token;
$$;

revoke all on function public.matchday_editorial_profile_reconcile_token(uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.matchday_editorial_profile_reconcile_token(uuid, text)
  to service_role;

create function public.apply_matchday_editorial_profile_reconcile(
  p_matchday_id uuid,
  p_profile_key text,
  p_expected_revision bigint,
  p_expected_state_token text,
  p_overrides jsonb,
  p_zone_items jsonb,
  p_faixa_source_ids jsonb
)
returns table (
  revision bigint,
  state_token text,
  applied_override_count integer,
  applied_zone_item_count integer,
  applied_faixa_count integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_assignment_profile_key text;
  v_competition_slug text;
  v_current_revision bigint := 0;
  v_current_token text;
  v_next_revision bigint;
  v_now timestamptz := pg_catalog.now();
  v_offset integer;
begin
  if p_matchday_id is null
    or p_profile_key is null
    or pg_catalog.btrim(p_profile_key) = ''
    or p_expected_revision is null
    or p_expected_revision < 0
    or nullif(pg_catalog.btrim(p_expected_state_token), '') is null
    or p_overrides is null
    or pg_catalog.jsonb_typeof(p_overrides) <> 'array'
    or p_zone_items is null
    or pg_catalog.jsonb_typeof(p_zone_items) <> 'array'
    or p_faixa_source_ids is null
    or pg_catalog.jsonb_typeof(p_faixa_source_ids) <> 'array'
  then
    raise exception 'matchday-editorial-profile-reconcile-invalid-input';
  end if;

  if p_profile_key <> 'liga_portugal_v1' then
    raise exception 'matchday-editorial-profile-reconcile-invalid-profile';
  end if;

  select competition_row.slug
  into v_competition_slug
  from public.matchdays as matchday_row
  join public.seasons as season_row
    on season_row.id = matchday_row.season_id
  join public.competitions as competition_row
    on competition_row.id = season_row.competition_id
  where matchday_row.id = p_matchday_id
  for update of matchday_row;

  if not found then
    raise exception 'matchday-editorial-profile-reconcile-matchday-not-found';
  end if;

  -- Shared writers already serialize Faixa rewrites with this table lock.
  -- It is acquired before article and bank locks, matching the protected core
  -- path and avoiding an assignment -> bank inversion with automatic refresh.
  lock table public.matchday_horizontal_news in share row exclusive mode;
  lock table public.editorial_articles in share mode;

  perform 1
  from public.matchday_editorial_bank_items as bank_row
  where bank_row.matchday_id = p_matchday_id
    and pg_catalog.lower(pg_catalog.btrim(bank_row.status)) = 'active'
    and pg_catalog.lower(pg_catalog.btrim(bank_row.source_type)) = 'editorial_article'
  order by pg_catalog.lower(pg_catalog.btrim(bank_row.source_type)),
           pg_catalog.lower(pg_catalog.btrim(bank_row.source_id))
  for share;

  -- Automatic bank writers hold a bank row before the refresh locks the
  -- assignment. Taking these locks in the same bank -> assignment order avoids
  -- the inverse assignment -> bank cycle while keeping assignment/state stable.
  select assignment_row.profile_key
  into v_assignment_profile_key
  from public.matchday_editorial_profile_assignments as assignment_row
  where assignment_row.matchday_id = p_matchday_id
  for share;

  if not found then
    raise exception 'matchday-editorial-profile-reconcile-assignment-not-found';
  end if;
  if v_assignment_profile_key <> p_profile_key then
    raise exception 'matchday-editorial-profile-reconcile-assignment-mismatch';
  end if;
  if v_competition_slug <> 'liga-portugal' then
    raise exception 'matchday-editorial-profile-reconcile-incompatible-competition';
  end if;

  select control_row.revision
  into v_current_revision
  from public.matchday_editorial_profile_reconcile_control as control_row
  where control_row.matchday_id = p_matchday_id
    and control_row.profile_key = p_profile_key
  for update;
  v_current_revision := coalesce(v_current_revision, 0);

  if v_current_revision <> p_expected_revision then
    raise exception 'matchday-editorial-profile-reconcile-revision-conflict';
  end if;

  select token_row.state_token
  into v_current_token
  from public.matchday_editorial_profile_reconcile_token(
    p_matchday_id,
    p_profile_key
  ) as token_row;
  if v_current_token is distinct from p_expected_state_token then
    raise exception 'matchday-editorial-profile-reconcile-state-token-conflict';
  end if;

  if exists (
    select 1
    from public.matchday_horizontal_news as faixa_row
    where faixa_row.matchday_id = p_matchday_id
      and 1 <> (
        select pg_catalog.count(*)
        from public.editorial_articles as article_row
        where article_row.status = 'published'
          and nullif(pg_catalog.btrim(article_row.slug), '') is not null
          and '/noticias/' || pg_catalog.btrim(article_row.slug)
            = pg_catalog.btrim(faixa_row.link_url)
      )
  ) then
    raise exception 'matchday-editorial-profile-reconcile-unresolved-faixa';
  end if;

  if exists (
    select 1
    from public.matchday_horizontal_news as faixa_row
    join public.editorial_articles as article_row
      on article_row.status = 'published'
     and '/noticias/' || pg_catalog.btrim(article_row.slug)
       = pg_catalog.btrim(faixa_row.link_url)
    where faixa_row.matchday_id = p_matchday_id
    group by article_row.id
    having pg_catalog.count(*) > 1
  ) then
    raise exception 'matchday-editorial-profile-reconcile-duplicate-faixa-identity';
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(p_overrides) as payload(value)
    where pg_catalog.jsonb_typeof(payload.value) <> 'object'
      or not (payload.value ?& array[
        'source_type', 'source_id', 'placement_target', 'zone_key', 'sort_order'
      ])
      or (payload.value - array[
        'source_type', 'source_id', 'placement_target', 'zone_key', 'sort_order'
      ]) <> '{}'::jsonb
      or pg_catalog.jsonb_typeof(payload.value -> 'source_type') <> 'string'
      or payload.value ->> 'source_type' <> 'editorial_article'
      or pg_catalog.jsonb_typeof(payload.value -> 'source_id') <> 'string'
      or nullif(pg_catalog.btrim(payload.value ->> 'source_id'), '') is null
      or pg_catalog.jsonb_typeof(payload.value -> 'placement_target') <> 'string'
      or payload.value ->> 'placement_target' not in ('bank', 'zone', 'faixa')
      or (
        payload.value ->> 'placement_target' = 'bank'
        and not (
          pg_catalog.jsonb_typeof(payload.value -> 'zone_key') = 'null'
          and pg_catalog.jsonb_typeof(payload.value -> 'sort_order') = 'null'
        )
      )
      or (
        payload.value ->> 'placement_target' = 'zone'
        and not (
          pg_catalog.jsonb_typeof(payload.value -> 'zone_key') = 'string'
          and payload.value ->> 'zone_key' in (
            'benfica', 'sporting', 'fc_porto',
            'other_liga_clubs', 'outside_liga_other'
          )
          and (
            pg_catalog.jsonb_typeof(payload.value -> 'sort_order') = 'null'
            or (
              pg_catalog.jsonb_typeof(payload.value -> 'sort_order') = 'number'
              and (payload.value ->> 'sort_order') ~ '^[1-9][0-9]*$'
              and (payload.value ->> 'sort_order')::integer <= case payload.value ->> 'zone_key'
                when 'benfica' then 6
                when 'sporting' then 5
                when 'fc_porto' then 5
                when 'other_liga_clubs' then 6
                when 'outside_liga_other' then 5
              end
            )
          )
        )
      )
      or (
        payload.value ->> 'placement_target' = 'faixa'
        and not (
          pg_catalog.jsonb_typeof(payload.value -> 'zone_key') = 'null'
          and pg_catalog.jsonb_typeof(payload.value -> 'sort_order') = 'number'
          and (payload.value ->> 'sort_order') ~ '^[1-9][0-9]*$'
        )
      )
  ) then
    raise exception 'matchday-editorial-profile-reconcile-invalid-overrides';
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(p_overrides) as payload(value)
    group by pg_catalog.lower(pg_catalog.btrim(payload.value ->> 'source_id'))
    having pg_catalog.count(*) > 1
  ) then
    raise exception 'matchday-editorial-profile-reconcile-duplicate-override';
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(p_overrides) as payload(value)
    where payload.value ->> 'placement_target' = 'zone'
      and pg_catalog.jsonb_typeof(payload.value -> 'sort_order') = 'number'
    group by payload.value ->> 'zone_key', (payload.value ->> 'sort_order')::integer
    having pg_catalog.count(*) > 1
  ) or exists (
    select 1
    from pg_catalog.jsonb_array_elements(p_overrides) as payload(value)
    where payload.value ->> 'placement_target' = 'faixa'
    group by (payload.value ->> 'sort_order')::integer
    having pg_catalog.count(*) > 1
  ) then
    raise exception 'matchday-editorial-profile-reconcile-duplicate-manual-slot';
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(p_overrides) as payload(value)
    where payload.value ->> 'placement_target' = 'zone'
    group by payload.value ->> 'zone_key'
    having pg_catalog.count(*) > case payload.value ->> 'zone_key'
      when 'benfica' then 6
      when 'sporting' then 5
      when 'fc_porto' then 5
      when 'other_liga_clubs' then 6
      when 'outside_liga_other' then 5
    end
  ) then
    raise exception 'matchday-editorial-profile-reconcile-zone-capacity-exceeded';
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(p_overrides) as payload(value)
    where not exists (
      select 1
      from public.matchday_editorial_profile_classification_plan(p_matchday_id) as classified
      where classified.source_type = 'editorial_article'
        and classified.source_id = pg_catalog.lower(pg_catalog.btrim(payload.value ->> 'source_id'))
    )
  ) then
    raise exception 'matchday-editorial-profile-reconcile-source-not-active';
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(p_zone_items) as payload(value)
    where pg_catalog.jsonb_typeof(payload.value) <> 'object'
      or not (payload.value ?& array['source_type', 'source_id', 'zone_key', 'sort_order'])
      or (payload.value - array['source_type', 'source_id', 'zone_key', 'sort_order']) <> '{}'::jsonb
      or payload.value ->> 'source_type' <> 'editorial_article'
      or pg_catalog.jsonb_typeof(payload.value -> 'source_id') <> 'string'
      or nullif(pg_catalog.btrim(payload.value ->> 'source_id'), '') is null
      or pg_catalog.jsonb_typeof(payload.value -> 'zone_key') <> 'string'
      or payload.value ->> 'zone_key' not in (
        'benfica', 'sporting', 'fc_porto',
        'other_liga_clubs', 'outside_liga_other'
      )
      or pg_catalog.jsonb_typeof(payload.value -> 'sort_order') <> 'number'
      or (payload.value ->> 'sort_order') !~ '^[1-9][0-9]*$'
      or (payload.value ->> 'sort_order')::integer > case payload.value ->> 'zone_key'
        when 'benfica' then 6
        when 'sporting' then 5
        when 'fc_porto' then 5
        when 'other_liga_clubs' then 6
        when 'outside_liga_other' then 5
      end
  ) then
    raise exception 'matchday-editorial-profile-reconcile-invalid-zone-items';
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(p_zone_items) as payload(value)
    group by pg_catalog.lower(pg_catalog.btrim(payload.value ->> 'source_id'))
    having pg_catalog.count(*) > 1
  ) or exists (
    select 1
    from pg_catalog.jsonb_array_elements(p_zone_items) as payload(value)
    group by payload.value ->> 'zone_key', (payload.value ->> 'sort_order')::integer
    having pg_catalog.count(*) > 1
  ) then
    raise exception 'matchday-editorial-profile-reconcile-duplicate-zone-item';
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(p_zone_items) as payload(value)
    where not exists (
      select 1
      from public.matchday_editorial_profile_classification_plan(p_matchday_id) as classified
      where classified.source_type = 'editorial_article'
        and classified.source_id = pg_catalog.lower(pg_catalog.btrim(payload.value ->> 'source_id'))
    )
  ) then
    raise exception 'matchday-editorial-profile-reconcile-zone-source-not-active';
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(p_overrides) as override_payload(value)
    where override_payload.value ->> 'placement_target' = 'zone'
      and not exists (
        select 1
        from pg_catalog.jsonb_array_elements(p_zone_items) as zone_payload(value)
        where pg_catalog.lower(pg_catalog.btrim(zone_payload.value ->> 'source_id'))
            = pg_catalog.lower(pg_catalog.btrim(override_payload.value ->> 'source_id'))
          and zone_payload.value ->> 'zone_key' = override_payload.value ->> 'zone_key'
          and (
            pg_catalog.jsonb_typeof(override_payload.value -> 'sort_order') = 'null'
            or (zone_payload.value ->> 'sort_order')::integer
              = (override_payload.value ->> 'sort_order')::integer
          )
      )
  ) then
    raise exception 'matchday-editorial-profile-reconcile-manual-zone-mismatch';
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(p_faixa_source_ids) with ordinality as desired(value, sort_order)
    where pg_catalog.jsonb_typeof(desired.value) <> 'string'
      or nullif(pg_catalog.btrim(desired.value #>> '{}'), '') is null
  ) then
    raise exception 'matchday-editorial-profile-reconcile-invalid-faixa';
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(p_faixa_source_ids) as desired(value)
    group by pg_catalog.lower(pg_catalog.btrim(desired.value #>> '{}'))
    having pg_catalog.count(*) > 1
  ) then
    raise exception 'matchday-editorial-profile-reconcile-duplicate-faixa-item';
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(p_faixa_source_ids) as desired(value)
    where not exists (
      select 1
      from public.matchday_editorial_profile_classification_plan(p_matchday_id) as classified
      where classified.source_id = pg_catalog.lower(pg_catalog.btrim(desired.value #>> '{}'))
    )
  ) then
    raise exception 'matchday-editorial-profile-reconcile-faixa-source-not-active';
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(p_faixa_source_ids) as desired(value)
    join pg_catalog.jsonb_array_elements(p_zone_items) as zone_payload(value)
      on pg_catalog.lower(pg_catalog.btrim(zone_payload.value ->> 'source_id'))
       = pg_catalog.lower(pg_catalog.btrim(desired.value #>> '{}'))
  ) then
    raise exception 'matchday-editorial-profile-reconcile-zone-faixa-duplicate';
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(p_overrides) as override_payload(value)
    where override_payload.value ->> 'placement_target' = 'bank'
      and (
        exists (
          select 1
          from pg_catalog.jsonb_array_elements(p_zone_items) as zone_payload(value)
          where pg_catalog.lower(pg_catalog.btrim(zone_payload.value ->> 'source_id'))
            = pg_catalog.lower(pg_catalog.btrim(override_payload.value ->> 'source_id'))
        )
        or exists (
          select 1
          from pg_catalog.jsonb_array_elements(p_faixa_source_ids) as faixa_payload(value)
          where pg_catalog.lower(pg_catalog.btrim(faixa_payload.value #>> '{}'))
            = pg_catalog.lower(pg_catalog.btrim(override_payload.value ->> 'source_id'))
        )
      )
  ) then
    raise exception 'matchday-editorial-profile-reconcile-explicit-bank-conflict';
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(p_overrides) as override_payload(value)
    where override_payload.value ->> 'placement_target' = 'faixa'
      and not exists (
        select 1
        from pg_catalog.jsonb_array_elements(p_faixa_source_ids) as faixa_payload(value)
        where pg_catalog.lower(pg_catalog.btrim(faixa_payload.value #>> '{}'))
            = pg_catalog.lower(pg_catalog.btrim(override_payload.value ->> 'source_id'))
      )
  ) then
    raise exception 'matchday-editorial-profile-reconcile-manual-faixa-mismatch';
  end if;

  -- An identical full-set Apply is a successful no-op. This comparison happens
  -- after every payload/canonicality check and before the first write, so it
  -- neither changes timestamps nor advances the optimistic revision.
  if exists (
    select 1
    from public.matchday_editorial_profile_reconcile_control as control_row
    where control_row.matchday_id = p_matchday_id
      and control_row.profile_key = p_profile_key
  )
  and not exists (
    select 1
    from public.matchday_editorial_profile_manual_overrides as current_row
    where current_row.matchday_id = p_matchday_id
      and current_row.profile_key = p_profile_key
      and not exists (
        select 1
        from pg_catalog.jsonb_array_elements(p_overrides) as desired(value)
        where pg_catalog.lower(pg_catalog.btrim(desired.value ->> 'source_id')) = current_row.source_id
          and desired.value ->> 'source_type' = current_row.source_type
          and desired.value ->> 'placement_target' = current_row.placement_target
          and case when pg_catalog.jsonb_typeof(desired.value -> 'zone_key') = 'null'
            then null else desired.value ->> 'zone_key' end is not distinct from current_row.zone_key
          and case when pg_catalog.jsonb_typeof(desired.value -> 'sort_order') = 'null'
            then null else (desired.value ->> 'sort_order')::integer end is not distinct from current_row.sort_order
      )
  )
  and not exists (
    select 1
    from pg_catalog.jsonb_array_elements(p_overrides) as desired(value)
    where not exists (
      select 1
      from public.matchday_editorial_profile_manual_overrides as current_row
      where current_row.matchday_id = p_matchday_id
        and current_row.profile_key = p_profile_key
        and current_row.source_id = pg_catalog.lower(pg_catalog.btrim(desired.value ->> 'source_id'))
        and current_row.source_type = desired.value ->> 'source_type'
        and current_row.placement_target = desired.value ->> 'placement_target'
        and current_row.zone_key is not distinct from case
          when pg_catalog.jsonb_typeof(desired.value -> 'zone_key') = 'null' then null
          else desired.value ->> 'zone_key'
        end
        and current_row.sort_order is not distinct from case
          when pg_catalog.jsonb_typeof(desired.value -> 'sort_order') = 'null' then null
          else (desired.value ->> 'sort_order')::integer
        end
    )
  )
  and not exists (
    select 1
    from public.matchday_editorial_profile_zone_items as current_row
    where current_row.matchday_id = p_matchday_id
      and current_row.profile_key = p_profile_key
      and not exists (
        select 1
        from pg_catalog.jsonb_array_elements(p_zone_items) as desired(value)
        where pg_catalog.lower(pg_catalog.btrim(desired.value ->> 'source_id')) = current_row.source_id
          and desired.value ->> 'source_type' = current_row.source_type
          and desired.value ->> 'zone_key' = current_row.zone_key
          and (desired.value ->> 'sort_order')::integer = current_row.sort_order
      )
  )
  and not exists (
    select 1
    from pg_catalog.jsonb_array_elements(p_zone_items) as desired(value)
    where not exists (
      select 1
      from public.matchday_editorial_profile_zone_items as current_row
      where current_row.matchday_id = p_matchday_id
        and current_row.profile_key = p_profile_key
        and current_row.source_id = pg_catalog.lower(pg_catalog.btrim(desired.value ->> 'source_id'))
        and current_row.source_type = desired.value ->> 'source_type'
        and current_row.zone_key = desired.value ->> 'zone_key'
        and current_row.sort_order = (desired.value ->> 'sort_order')::integer
    )
  )
  and not exists (
    select 1
    from (
      select
        faixa_row.sort_order,
        pg_catalog.row_number() over (order by faixa_row.sort_order, faixa_row.id) as expected_sort_order
      from public.matchday_horizontal_news as faixa_row
      where faixa_row.matchday_id = p_matchday_id
    ) as ordered_faixa
    where ordered_faixa.sort_order <> ordered_faixa.expected_sort_order
  )
  and array(
    select article_row.id::text
    from public.matchday_horizontal_news as faixa_row
    join public.editorial_articles as article_row
      on article_row.status = 'published'
     and '/noticias/' || pg_catalog.btrim(article_row.slug) = pg_catalog.btrim(faixa_row.link_url)
    where faixa_row.matchday_id = p_matchday_id
    order by faixa_row.sort_order, faixa_row.id
  ) = array(
    select pg_catalog.lower(pg_catalog.btrim(desired.value #>> '{}'))
    from pg_catalog.jsonb_array_elements(p_faixa_source_ids) with ordinality as desired(value, sort_order)
    order by desired.sort_order
  )
  then
    return query
    select
      v_current_revision,
      v_current_token,
      pg_catalog.jsonb_array_length(p_overrides),
      pg_catalog.jsonb_array_length(p_zone_items),
      pg_catalog.jsonb_array_length(p_faixa_source_ids);
    return;
  end if;

  delete from public.matchday_editorial_profile_manual_overrides
  where matchday_id = p_matchday_id
    and profile_key = p_profile_key;

  insert into public.matchday_editorial_profile_manual_overrides (
    matchday_id,
    profile_key,
    source_type,
    source_id,
    placement_target,
    zone_key,
    sort_order
  )
  select
    p_matchday_id,
    p_profile_key,
    'editorial_article',
    pg_catalog.lower(pg_catalog.btrim(payload.value ->> 'source_id')),
    payload.value ->> 'placement_target',
    case
      when pg_catalog.jsonb_typeof(payload.value -> 'zone_key') = 'null' then null
      else payload.value ->> 'zone_key'
    end,
    case
      when pg_catalog.jsonb_typeof(payload.value -> 'sort_order') = 'null' then null
      when payload.value ->> 'placement_target' = 'faixa' then (
        select faixa_payload.sort_order::integer
        from pg_catalog.jsonb_array_elements(p_faixa_source_ids)
          with ordinality as faixa_payload(value, sort_order)
        where pg_catalog.lower(pg_catalog.btrim(faixa_payload.value #>> '{}'))
          = pg_catalog.lower(pg_catalog.btrim(payload.value ->> 'source_id'))
      )
      else (payload.value ->> 'sort_order')::integer
    end
  from pg_catalog.jsonb_array_elements(p_overrides) as payload(value);

  delete from public.matchday_editorial_profile_zone_items
  where matchday_id = p_matchday_id
    and profile_key = p_profile_key;

  insert into public.matchday_editorial_profile_zone_items (
    matchday_id,
    profile_key,
    source_type,
    source_id,
    zone_key,
    sort_order
  )
  select
    p_matchday_id,
    p_profile_key,
    'editorial_article',
    pg_catalog.lower(pg_catalog.btrim(payload.value ->> 'source_id')),
    payload.value ->> 'zone_key',
    (payload.value ->> 'sort_order')::integer
  from pg_catalog.jsonb_array_elements(p_zone_items) as payload(value);

  select coalesce(pg_catalog.max(faixa_row.sort_order), 0)
    + pg_catalog.jsonb_array_length(p_faixa_source_ids)
    + 1024
  into v_offset
  from public.matchday_horizontal_news as faixa_row
  where faixa_row.matchday_id = p_matchday_id;

  update public.matchday_horizontal_news
  set sort_order = sort_order + v_offset
  where matchday_id = p_matchday_id;

  delete from public.matchday_horizontal_news as faixa_row
  where faixa_row.matchday_id = p_matchday_id
    and not exists (
      select 1
      from pg_catalog.jsonb_array_elements(p_faixa_source_ids) as desired(value)
      join public.editorial_articles as article_row
        on article_row.id::text = pg_catalog.lower(pg_catalog.btrim(desired.value #>> '{}'))
       and article_row.status = 'published'
       and '/noticias/' || pg_catalog.btrim(article_row.slug)
         = pg_catalog.btrim(faixa_row.link_url)
    );

  with desired as (
    select
      pg_catalog.lower(pg_catalog.btrim(payload.value #>> '{}')) as source_id,
      payload.sort_order::integer as sort_order
    from pg_catalog.jsonb_array_elements(p_faixa_source_ids) with ordinality as payload(value, sort_order)
  )
  update public.matchday_horizontal_news as faixa_row
  set sort_order = desired.sort_order,
      updated_at = v_now
  from desired
  join public.editorial_articles as article_row
    on article_row.id::text = desired.source_id
   and article_row.status = 'published'
  where faixa_row.matchday_id = p_matchday_id
    and '/noticias/' || pg_catalog.btrim(article_row.slug)
      = pg_catalog.btrim(faixa_row.link_url);

  with desired as (
    select
      pg_catalog.lower(pg_catalog.btrim(payload.value #>> '{}')) as source_id,
      payload.sort_order::integer as sort_order
    from pg_catalog.jsonb_array_elements(p_faixa_source_ids) with ordinality as payload(value, sort_order)
  )
  insert into public.matchday_horizontal_news (
    matchday_id,
    label,
    label_color,
    title,
    subtitle,
    image_url,
    link_url,
    sort_order,
    status,
    created_at,
    updated_at
  )
  select
    p_matchday_id,
    nullif(pg_catalog.btrim(article_row.label), ''),
    null,
    nullif(pg_catalog.btrim(article_row.title), ''),
    nullif(pg_catalog.btrim(article_row.subtitle), ''),
    nullif(pg_catalog.btrim(article_row.image_url), ''),
    '/noticias/' || pg_catalog.btrim(article_row.slug),
    desired.sort_order,
    'published',
    v_now,
    v_now
  from desired
  join public.editorial_articles as article_row
    on article_row.id::text = desired.source_id
   and article_row.status = 'published'
  where not exists (
    select 1
    from public.matchday_horizontal_news as faixa_row
    where faixa_row.matchday_id = p_matchday_id
      and pg_catalog.btrim(faixa_row.link_url)
        = '/noticias/' || pg_catalog.btrim(article_row.slug)
  )
  order by desired.sort_order;

  v_next_revision := v_current_revision + 1;
  insert into public.matchday_editorial_profile_reconcile_control (
    matchday_id,
    profile_key,
    revision,
    last_applied_at,
    updated_at
  ) values (
    p_matchday_id,
    p_profile_key,
    v_next_revision,
    v_now,
    v_now
  )
  on conflict (matchday_id, profile_key) do update set
    revision = excluded.revision,
    last_applied_at = excluded.last_applied_at,
    updated_at = excluded.updated_at;

  return query
  select
    v_next_revision,
    token_row.state_token,
    pg_catalog.jsonb_array_length(p_overrides),
    pg_catalog.jsonb_array_length(p_zone_items),
    pg_catalog.jsonb_array_length(p_faixa_source_ids)
  from public.matchday_editorial_profile_reconcile_token(
    p_matchday_id,
    p_profile_key
  ) as token_row;
end;
$$;

revoke all on function public.apply_matchday_editorial_profile_reconcile(
  uuid, text, bigint, text, jsonb, jsonb, jsonb
) from public, anon, authenticated, service_role;
grant execute on function public.apply_matchday_editorial_profile_reconcile(
  uuid, text, bigint, text, jsonb, jsonb, jsonb
) to service_role;

comment on function public.apply_matchday_editorial_profile_reconcile(
  uuid, text, bigint, text, jsonb, jsonb, jsonb
) is
  'Atomically applies thematic overrides, the five-zone snapshot and the complete shared Faixa after optimistic validation. It never calls the legacy Apply or writes automatic profile state.';

notify pgrst, 'reload schema';

commit;
