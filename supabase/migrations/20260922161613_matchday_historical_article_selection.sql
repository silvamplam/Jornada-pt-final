begin;

create table jornada_private.matchday_historical_article_selections (
  matchday_id uuid not null
    references public.matchdays(id)
    on delete cascade,
  article_id uuid not null
    references public.editorial_articles(id)
    on delete cascade,
  selected_at timestamptz not null default statement_timestamp(),
  primary key (matchday_id, article_id)
);

create index matchday_historical_article_selections_article_idx
  on jornada_private.matchday_historical_article_selections (article_id);

comment on table jornada_private.matchday_historical_article_selections is
  'Explicit editorial decision that a canonical article belongs to the priority set for one historical matchday composition. Row presence means selected.';

comment on column jornada_private.matchday_historical_article_selections.article_id is
  'Canonical public.editorial_articles identity. No title, classification, Bank state, placement or visual snapshot is duplicated here.';

alter table jornada_private.matchday_historical_article_selections
  enable row level security;

revoke all on table jornada_private.matchday_historical_article_selections
  from public, anon, authenticated, service_role;

create or replace function public.read_matchday_historical_article_selections_v1(
  p_matchday_id uuid
)
returns table (
  article_id uuid,
  selected_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $function$
  select
    selection.article_id,
    selection.selected_at
  from jornada_private.matchday_historical_article_selections as selection
  where selection.matchday_id = p_matchday_id
  order by selection.article_id;
$function$;

create or replace function public.set_matchday_historical_article_selection_v1(
  p_matchday_id uuid,
  p_article_ids uuid[],
  p_selected boolean
)
returns table (
  selected_count bigint
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
  v_existing_selection_count integer;
begin
  if p_matchday_id is null
     or p_article_ids is null
     or coalesce(cardinality(p_article_ids), 0) = 0
     or p_selected is null then
    raise exception 'matchday-historical-article-selection-v1-invalid-input';
  end if;

  if exists (
    select 1
    from unnest(p_article_ids) as requested(article_id)
    where requested.article_id is null
  ) then
    raise exception 'matchday-historical-article-selection-v1-invalid-article';
  end if;

  select
    count(*)::integer,
    count(distinct requested.article_id)::integer
  into v_requested_count, v_distinct_count
  from unnest(p_article_ids) as requested(article_id);

  if v_requested_count <> v_distinct_count then
    raise exception 'matchday-historical-article-selection-v1-duplicate-article';
  end if;

  perform 1
  from public.matchdays as matchday
  where matchday.id = p_matchday_id
  for update;

  if not found then
    raise exception 'matchday-historical-article-selection-v1-matchday-not-found';
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
    raise exception 'matchday-historical-article-selection-v1-article-not-found';
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
    raise exception 'matchday-historical-article-selection-v1-article-not-eligible';
  end if;

  select count(*)::integer
  into v_existing_selection_count
  from jornada_private.matchday_historical_article_selections as selection
  where selection.matchday_id = p_matchday_id
    and selection.article_id = any(p_article_ids);

  if p_selected and v_existing_selection_count <> 0 then
    raise exception 'matchday-historical-article-selection-v1-already-selected';
  end if;

  if not p_selected and v_existing_selection_count <> v_requested_count then
    raise exception 'matchday-historical-article-selection-v1-not-selected';
  end if;

  if p_selected then
    insert into jornada_private.matchday_historical_article_selections (
      matchday_id,
      article_id
    )
    select
      p_matchday_id,
      requested.article_id
    from unnest(p_article_ids) as requested(article_id)
    on conflict (matchday_id, article_id) do nothing;
  else
    delete from jornada_private.matchday_historical_article_selections as selection
    where selection.matchday_id = p_matchday_id
      and selection.article_id = any(p_article_ids);
  end if;

  return query
  select count(*)::bigint
  from jornada_private.matchday_historical_article_selections as selection
  where selection.matchday_id = p_matchday_id;
end;
$function$;

revoke all on function
  public.read_matchday_historical_article_selections_v1(uuid)
  from public, anon, authenticated;

grant execute on function
  public.read_matchday_historical_article_selections_v1(uuid)
  to service_role;

revoke all on function
  public.set_matchday_historical_article_selection_v1(uuid, uuid[], boolean)
  from public, anon, authenticated;

grant execute on function
  public.set_matchday_historical_article_selection_v1(uuid, uuid[], boolean)
  to service_role;

commit;
