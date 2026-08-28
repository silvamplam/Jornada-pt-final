begin;

alter table public.matchday_editorial_bank_items
  add column editorially_worked_at timestamptz;

update public.matchday_editorial_bank_items
set editorially_worked_at = statement_timestamp();

comment on column public.matchday_editorial_bank_items.editorially_worked_at is
  'Momento da primeira decisão editorial explícita sobre esta fonte nesta jornada. NULL identifica uma fonte Nova; nunca regressa a NULL.';

create function public.preserve_matchday_editorial_worked_state()
returns trigger
language plpgsql
security invoker
set search_path to ''
as $function$
begin
  if tg_op = 'UPDATE'
    and old.editorially_worked_at is not null
  then
    new.editorially_worked_at := old.editorially_worked_at;
  elsif new.editorially_worked_at is null
    and new.continuity_source_matchday_id is not null
    and new.continuity_source_composition_id is not null
  then
    new.editorially_worked_at := statement_timestamp();
  end if;

  return new;
end;
$function$;

revoke all on function public.preserve_matchday_editorial_worked_state()
from public, anon, authenticated, service_role;

create trigger preserve_matchday_editorial_worked_state
before insert or update of
  editorially_worked_at,
  continuity_source_matchday_id,
  continuity_source_composition_id
on public.matchday_editorial_bank_items
for each row
execute function public.preserve_matchday_editorial_worked_state();

alter function public.matchday_editorial_profile_classification_plan(uuid)
rename to matchday_editorial_profile_classification_plan_body_text_v1;

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
set search_path to ''
as $function$
  with matchday_context as (
    select matchday_row.season_id
    from public.matchdays as matchday_row
    where matchday_row.id = p_matchday_id
  ),
  previous_plan as (
    select previous_row.*
    from public.matchday_editorial_profile_classification_plan_body_text_v1(
      p_matchday_id
    ) as previous_row
  ),
  candidates as (
    select
      previous_row.source_type,
      previous_row.source_id,
      previous_row.classified_zone_key,
      article_row.label,
      article_row.title,
      article_row.subtitle,
      article_row.published_at,
      article_row.updated_at,
      public.normalize_matchday_editorial_profile_evidence(
        coalesce(article_row.label, '')
      ) as normalized_label,
      public.normalize_matchday_editorial_profile_evidence(
        pg_catalog.concat_ws(
          ' ',
          article_row.title,
          article_row.subtitle
        )
      ) as normalized_headline
    from previous_plan as previous_row
    join public.editorial_articles as article_row
      on article_row.id::text = previous_row.source_id
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
    from candidates as candidate_row
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
      select candidate_row.label_prefix
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
  big_three_teams as (
    select
      team_row.id as team_id,
      case team_row.slug
        when 'benfica' then 'benfica'
        when 'sporting' then 'sporting'
        when 'fc-porto' then 'fc_porto'
      end as zone_key,
      team_row.slug,
      team_row.name,
      team_row.short_name,
      team_row.public_name
    from matchday_context as context_row
    join public.season_teams as season_team_row
      on season_team_row.season_id = context_row.season_id
     and season_team_row.status = 'active'
    join public.teams as team_row
      on team_row.id = season_team_row.team_id
    where team_row.slug in ('benfica', 'sporting', 'fc-porto')
  ),
  big_three_alias_values as (
    select team_row.team_id, team_row.zone_key, team_row.name as alias_value
    from big_three_teams as team_row
    union all
    select team_row.team_id, team_row.zone_key, team_row.short_name
    from big_three_teams as team_row
    union all
    select team_row.team_id, team_row.zone_key, team_row.public_name
    from big_three_teams as team_row
    union all
    select
      team_row.team_id,
      team_row.zone_key,
      pg_catalog.replace(team_row.slug, '-', ' ')
    from big_three_teams as team_row
    union all
    select team_row.team_id, team_row.zone_key, alias_row.alias
    from big_three_teams as team_row
    join public.team_aliases as alias_row
      on alias_row.team_id = team_row.team_id
     and alias_row.status = 'active'
    union all
    select
      team_row.team_id,
      team_row.zone_key,
      pg_catalog.replace(alias_row.normalized_alias, '-', ' ')
    from big_three_teams as team_row
    join public.team_aliases as alias_row
      on alias_row.team_id = team_row.team_id
     and alias_row.status = 'active'
  ),
  big_three_aliases as (
    select distinct
      alias_row.zone_key,
      public.normalize_matchday_editorial_profile_evidence(
        alias_row.alias_value
      ) as normalized_alias
    from big_three_alias_values as alias_row
    where nullif(pg_catalog.btrim(alias_row.alias_value), '') is not null
  ),
  structural_matches as (
    select
      subject_row.source_type,
      subject_row.source_id,
      pg_catalog.min(alias_row.zone_key) as zone_key
    from label_subjects as subject_row
    join big_three_aliases as alias_row
      on alias_row.normalized_alias = subject_row.evidence
    group by subject_row.source_type, subject_row.source_id
  ),
  headline_mentions as (
    select
      candidate_row.*,
      structural_row.zone_key as structural_zone_key,
      candidate_row.normalized_headline ~
        '(^|[^[:alnum:]_])(sl[[:space:]]+)?benfica([^[:alnum:]_]|$)'
        as mentions_benfica,
      candidate_row.normalized_headline ~
        '(^|[^[:alnum:]_])sporting([[:space:]]+(cp|clube de portugal))?([^[:alnum:]_]|$)'
        as mentions_sporting,
      candidate_row.normalized_headline ~
        '(^|[^[:alnum:]_])(fc[[:space:]]+porto|futebol[[:space:]]+clube[[:space:]]+do[[:space:]]+porto)([^[:alnum:]_]|$)'
        as mentions_fc_porto
    from structural_labels as candidate_row
    left join structural_matches as structural_row
      on structural_row.source_type = candidate_row.source_type
     and structural_row.source_id = candidate_row.source_id
  ),
  corrected as (
    select
      candidate_row.*,
      case
        when candidate_row.classified_zone_key not in (
          'benfica', 'sporting', 'fc_porto'
        ) then candidate_row.classified_zone_key
        when candidate_row.structural_zone_key =
          candidate_row.classified_zone_key
          then candidate_row.classified_zone_key
        when (
          candidate_row.mentions_benfica::integer
          + candidate_row.mentions_sporting::integer
          + candidate_row.mentions_fc_porto::integer
        ) = 1
        and (
          (candidate_row.mentions_benfica
            and candidate_row.classified_zone_key = 'benfica')
          or (candidate_row.mentions_sporting
            and candidate_row.classified_zone_key = 'sporting')
          or (candidate_row.mentions_fc_porto
            and candidate_row.classified_zone_key = 'fc_porto')
        ) then candidate_row.classified_zone_key
        else 'outside_liga_other'
      end as corrected_zone_key
    from headline_mentions as candidate_row
  )
  select
    candidate_row.source_type,
    candidate_row.source_id,
    candidate_row.corrected_zone_key as classified_zone_key,
    pg_catalog.row_number() over (
      partition by candidate_row.corrected_zone_key
      order by
        candidate_row.published_at desc nulls last,
        candidate_row.updated_at desc nulls last,
        candidate_row.source_type asc,
        candidate_row.source_id asc
    )::integer as actuality_order
  from corrected as candidate_row
  order by
    candidate_row.corrected_zone_key,
    actuality_order,
    candidate_row.source_type,
    candidate_row.source_id;
$function$;

comment on function public.matchday_editorial_profile_classification_plan(uuid) is
  'Classifica por evidência estrutural ou de título/subtítulo. Menções existentes apenas no corpo nunca promovem Benfica, Sporting ou FC Porto a assunto principal.';

revoke all on function
  public.matchday_editorial_profile_classification_plan(uuid)
from public, anon, authenticated;

grant execute on function
  public.matchday_editorial_profile_classification_plan(uuid)
to service_role;

create function public.apply_matchday_editorial_profile_workspace_v8(
  p_matchday_id uuid,
  p_profile_key text,
  p_expected_revision bigint,
  p_expected_state_token text,
  p_overrides jsonb,
  p_zone_items jsonb,
  p_faixa_source_ids jsonb,
  p_opening jsonb,
  p_page_controls jsonb,
  p_selection_bank_item_ids jsonb,
  p_video_module jsonb,
  p_worked_source_ids jsonb
)
returns table(
  revision bigint,
  state_token text,
  applied_override_count integer,
  applied_zone_item_count integer,
  applied_faixa_count integer,
  applied_opening_count integer,
  applied_selection_count integer
)
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_apply record;
begin
  if p_worked_source_ids is null
    or pg_catalog.jsonb_typeof(p_worked_source_ids) <> 'array'
    or exists (
      select 1
      from pg_catalog.jsonb_array_elements(p_worked_source_ids)
        as worked_row(value)
      where pg_catalog.jsonb_typeof(worked_row.value) <> 'string'
        or nullif(pg_catalog.btrim(worked_row.value #>> '{}'), '') is null
    )
    or (
      select pg_catalog.count(*)
      from pg_catalog.jsonb_array_elements(p_worked_source_ids)
    ) <> (
      select pg_catalog.count(distinct pg_catalog.lower(
        pg_catalog.btrim(worked_row.value #>> '{}')
      ))
      from pg_catalog.jsonb_array_elements(p_worked_source_ids)
        as worked_row(value)
    )
  then
    raise exception
      'matchday-editorial-profile-workspace-v8-invalid-worked-sources';
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(p_worked_source_ids)
      as worked_row(value)
    where not exists (
      select 1
      from public.matchday_editorial_profile_workspace_sources(
        p_matchday_id
      ) as source_row
      where source_row.source_type = 'editorial_article'
        and source_row.source_id = pg_catalog.lower(
          pg_catalog.btrim(worked_row.value #>> '{}')
        )
    )
  ) then
    raise exception
      'matchday-editorial-profile-workspace-v8-worked-source-not-active';
  end if;

  if exists (
    with selected_sources as (
      select
        pg_catalog.lower(pg_catalog.btrim(bank_row.source_type))
          as source_type,
        pg_catalog.lower(pg_catalog.btrim(bank_row.source_id))
          as source_id
      from pg_catalog.jsonb_array_elements(p_selection_bank_item_ids)
        as selection_row(value)
      join public.matchday_editorial_bank_items as bank_row
        on bank_row.id::text = pg_catalog.btrim(
          selection_row.value #>> '{}'
        )
       and bank_row.matchday_id = p_matchday_id
      where pg_catalog.jsonb_typeof(selection_row.value) = 'string'
    )
    select 1
    from selected_sources as selected_row
    where selected_row.source_type = 'editorial_article'
      and (
        exists (
          select 1
          from pg_catalog.jsonb_each(p_opening) as opening_row(slot_key, value)
          where pg_catalog.jsonb_typeof(opening_row.value) = 'string'
            and pg_catalog.lower(pg_catalog.btrim(opening_row.value #>> '{}'))
              = selected_row.source_id
        )
        or exists (
          select 1
          from pg_catalog.jsonb_array_elements(p_zone_items) as zone_row(value)
          where pg_catalog.lower(pg_catalog.btrim(zone_row.value ->> 'source_type'))
              = selected_row.source_type
            and pg_catalog.lower(pg_catalog.btrim(zone_row.value ->> 'source_id'))
              = selected_row.source_id
        )
        or exists (
          select 1
          from pg_catalog.jsonb_array_elements(p_faixa_source_ids) as faixa_row(value)
          where pg_catalog.lower(pg_catalog.btrim(faixa_row.value #>> '{}'))
              = selected_row.source_id
        )
      )
  ) then
    raise exception
      'matchday-editorial-profile-workspace-v8-duplicate-public-placement';
  end if;

  select *
  into v_apply
  from public.apply_matchday_editorial_profile_workspace_v7(
    p_matchday_id,
    p_profile_key,
    p_expected_revision,
    p_expected_state_token,
    p_overrides,
    p_zone_items,
    p_faixa_source_ids,
    p_opening,
    p_page_controls,
    p_selection_bank_item_ids,
    p_video_module
  );

  update public.matchday_editorial_bank_items as bank_row
  set editorially_worked_at = pg_catalog.coalesce(
    bank_row.editorially_worked_at,
    pg_catalog.statement_timestamp()
  )
  where bank_row.matchday_id = p_matchday_id
    and pg_catalog.lower(pg_catalog.btrim(bank_row.status)) = 'active'
    and pg_catalog.lower(pg_catalog.btrim(bank_row.source_type))
      = 'editorial_article'
    and bank_row.editorially_worked_at is null
    and (
      pg_catalog.lower(pg_catalog.btrim(bank_row.source_id)) in (
        select pg_catalog.lower(pg_catalog.btrim(worked_row.value #>> '{}'))
        from pg_catalog.jsonb_array_elements(p_worked_source_ids)
          as worked_row(value)
      )
      or bank_row.id::text in (
        select pg_catalog.btrim(selection_row.value #>> '{}')
        from pg_catalog.jsonb_array_elements(p_selection_bank_item_ids)
          as selection_row(value)
        where pg_catalog.jsonb_typeof(selection_row.value) = 'string'
      )
    );

  return query
  select
    v_apply.revision,
    v_apply.state_token,
    v_apply.applied_override_count,
    v_apply.applied_zone_item_count,
    v_apply.applied_faixa_count,
    v_apply.applied_opening_count,
    v_apply.applied_selection_count;
end;
$function$;

comment on function public.apply_matchday_editorial_profile_workspace_v8(
  uuid, text, bigint, text, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb,
  jsonb, jsonb
) is
  'Aplica atomicamente a Mesa, garante exclusividade pública da Seleção e fecha de forma monotónica o estado Nova das fontes explicitamente trabalhadas.';

revoke all on function public.apply_matchday_editorial_profile_workspace_v8(
  uuid, text, bigint, text, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb,
  jsonb, jsonb
)
from public, anon, authenticated;

grant execute on function public.apply_matchday_editorial_profile_workspace_v8(
  uuid, text, bigint, text, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb,
  jsonb, jsonb
)
to service_role;

commit;
