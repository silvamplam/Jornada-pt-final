begin;

create table jornada_private.matchday_historical_article_decisions (
  matchday_id uuid not null
    references public.matchdays(id)
    on delete cascade,
  article_id uuid not null
    references public.editorial_articles(id)
    on delete cascade,
  decision text not null,
  updated_at timestamptz not null default statement_timestamp(),
  primary key (matchday_id, article_id),
  constraint matchday_historical_article_decisions_decision_check
    check (decision in ('selected', 'bank', 'undecided'))
);

create index matchday_historical_article_decisions_article_idx
  on jornada_private.matchday_historical_article_decisions (article_id);

comment on table jornada_private.matchday_historical_article_decisions is
  'Explicit historical-composition decision for one canonical article in one matchday. Row absence means no historical decision yet; undecided is an explicit persisted override.';

comment on column jornada_private.matchday_historical_article_decisions.article_id is
  'Canonical public.editorial_articles identity. No title, classification, live Bank state, placement or visual snapshot is duplicated here.';

comment on column jornada_private.matchday_historical_article_decisions.decision is
  'Single mutually exclusive historical editorial state: selected, bank or explicitly undecided.';

alter table jornada_private.matchday_historical_article_decisions
  enable row level security;

revoke all on table jornada_private.matchday_historical_article_decisions
  from public, anon, authenticated, service_role;

create or replace function public.read_matchday_historical_article_decisions_v1(
  p_matchday_id uuid
)
returns table (
  article_id uuid,
  decision text,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $function$
  select
    historical_decision.article_id,
    historical_decision.decision,
    historical_decision.updated_at
  from jornada_private.matchday_historical_article_decisions as historical_decision
  where historical_decision.matchday_id = p_matchday_id
  order by historical_decision.article_id;
$function$;

create or replace function public.set_matchday_historical_article_decision_v1(
  p_matchday_id uuid,
  p_article_ids uuid[],
  p_decision text
)
returns table (
  updated_count bigint
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_requested_count integer;
  v_distinct_count integer;
  v_existing_article_count integer;
  v_eligible_article_count integer;
begin
  if p_matchday_id is null
     or p_article_ids is null
     or coalesce(cardinality(p_article_ids), 0) = 0
     or p_decision is null
     or p_decision not in ('selected', 'bank', 'undecided') then
    raise exception 'matchday-historical-article-decision-v1-invalid-input';
  end if;

  if exists (
    select 1
    from unnest(p_article_ids) as requested(article_id)
    where requested.article_id is null
  ) then
    raise exception 'matchday-historical-article-decision-v1-invalid-article';
  end if;

  select
    count(*)::integer,
    count(distinct requested.article_id)::integer
  into v_requested_count, v_distinct_count
  from unnest(p_article_ids) as requested(article_id);

  if v_requested_count <> v_distinct_count then
    raise exception 'matchday-historical-article-decision-v1-duplicate-article';
  end if;

  perform 1
  from public.matchdays as matchday
  where matchday.id = p_matchday_id
  for update;

  if not found then
    raise exception 'matchday-historical-article-decision-v1-matchday-not-found';
  end if;

  perform 1
  from public.editorial_articles as article
  where article.id = any(p_article_ids)
  for key share;

  select count(*)::integer
  into v_existing_article_count
  from public.editorial_articles as article
  where article.id = any(p_article_ids);

  if v_existing_article_count <> v_requested_count then
    raise exception 'matchday-historical-article-decision-v1-article-not-found';
  end if;

  perform 1
  from public.matchday_editorial_bank_items as bank_item
  where bank_item.matchday_id = p_matchday_id
    and bank_item.status = 'active'
    and lower(btrim(coalesce(bank_item.source_type, ''))) = 'editorial_article'
    and exists (
      select 1
      from unnest(p_article_ids) as requested(article_id)
      where lower(btrim(bank_item.source_id)) = lower(requested.article_id::text)
    )
  for share;

  select count(distinct requested.article_id)::integer
  into v_eligible_article_count
  from unnest(p_article_ids) as requested(article_id)
  where exists (
    select 1
    from public.editorial_articles as article
    join public.matchday_editorial_bank_items as bank_item
      on lower(btrim(bank_item.source_id)) = lower(article.id::text)
     and bank_item.matchday_id = p_matchday_id
     and bank_item.status = 'active'
     and lower(btrim(coalesce(bank_item.source_type, ''))) = 'editorial_article'
    where article.id = requested.article_id
      and (
        article.matchday_id is null
        or article.matchday_id = p_matchday_id
        or (
          bank_item.continuity_source_matchday_id is not null
          and bank_item.continuity_revalidated_at is not null
        )
      )
  );

  if v_eligible_article_count <> v_requested_count then
    raise exception 'matchday-historical-article-decision-v1-article-not-eligible';
  end if;

  insert into jornada_private.matchday_historical_article_decisions (
    matchday_id,
    article_id,
    decision,
    updated_at
  )
  select
    p_matchday_id,
    requested.article_id,
    p_decision,
    statement_timestamp()
  from unnest(p_article_ids) as requested(article_id)
  on conflict (matchday_id, article_id) do update
  set
    decision = excluded.decision,
    updated_at = excluded.updated_at;

  return query select v_requested_count::bigint;
end;
$function$;

revoke all on function
  public.read_matchday_historical_article_decisions_v1(uuid)
  from public, anon, authenticated;

grant execute on function
  public.read_matchday_historical_article_decisions_v1(uuid)
  to service_role;

revoke all on function
  public.set_matchday_historical_article_decision_v1(uuid, uuid[], text)
  from public, anon, authenticated;

grant execute on function
  public.set_matchday_historical_article_decision_v1(uuid, uuid[], text)
  to service_role;

commit;
