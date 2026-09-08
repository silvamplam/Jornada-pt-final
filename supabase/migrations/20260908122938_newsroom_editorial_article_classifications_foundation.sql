begin;

-- Mesa da Redacao - autoridade editorial corrente antes da publicacao.
-- A ausencia de linha significa "por classificar"; nao existe uma sexta chave.

do $preflight$
begin
  if pg_catalog.to_regclass('public.newsroom_articles') is null then
    raise exception 'newsroom-article-classification-preflight-newsroom-articles-missing';
  end if;

  if pg_catalog.to_regclass(
    'public.newsroom_editorial_article_classifications'
  ) is not null
  then
    raise exception 'newsroom-article-classification-preflight-target-conflict';
  end if;
end;
$preflight$;

create table public.newsroom_editorial_article_classifications (
  newsroom_article_id uuid primary key,
  classification_key text not null,
  classification_source text not null,
  classified_at timestamptz not null default pg_catalog.statement_timestamp(),
  updated_at timestamptz not null default pg_catalog.statement_timestamp(),
  constraint newsroom_editorial_article_classifications_article_fkey
    foreign key (newsroom_article_id)
    references public.newsroom_articles(id)
    on delete cascade,
  constraint newsroom_editorial_article_classifications_key_check
    check (
      classification_key in (
        'benfica',
        'sporting',
        'fc_porto',
        'other_liga_clubs',
        'outside_liga_other'
      )
    ),
  constraint newsroom_editorial_article_classifications_source_check
    check (classification_source in ('automatic', 'manual'))
);

create index newsroom_editorial_article_classifications_listing_idx
  on public.newsroom_editorial_article_classifications (
    classification_key,
    classified_at desc,
    newsroom_article_id asc
  );

create function public.newsroom_set_article_classification_updated_at_v1()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
begin
  new.updated_at := pg_catalog.statement_timestamp();
  return new;
end;
$function$;

create trigger newsroom_editorial_article_classifications_set_updated_at_v1
before update on public.newsroom_editorial_article_classifications
for each row
execute function public.newsroom_set_article_classification_updated_at_v1();

alter table public.newsroom_editorial_article_classifications
  enable row level security;
alter table public.newsroom_editorial_article_classifications
  force row level security;

revoke all privileges
on table public.newsroom_editorial_article_classifications
from public, anon, authenticated, service_role;

-- Leitura administrativa direta e permitida. Todas as escritas passam pelos
-- RPCs abaixo para que a precedencia manual seja uma invariante da base.
grant select
on table public.newsroom_editorial_article_classifications
to service_role;

create function public.newsroom_read_article_classification_states_v1(
  p_newsroom_article_ids uuid[]
)
returns table (
  newsroom_article_id uuid,
  classification_key text,
  classification_source text,
  classified_at timestamptz,
  updated_at timestamptz,
  classified boolean
)
language plpgsql
stable
security invoker
set search_path = ''
as $function$
begin
  if p_newsroom_article_ids is null
    or pg_catalog.cardinality(p_newsroom_article_ids) < 1
    or pg_catalog.cardinality(p_newsroom_article_ids) > 100
    or pg_catalog.array_position(p_newsroom_article_ids, null) is not null
    or (
      select pg_catalog.count(distinct requested_id)
      from pg_catalog.unnest(p_newsroom_article_ids)
        as requested_row(requested_id)
    ) <> pg_catalog.cardinality(p_newsroom_article_ids)
  then
    raise exception 'newsroom_article_classification_invalid_input'
      using errcode = '22023';
  end if;

  if exists (
    select 1
    from pg_catalog.unnest(p_newsroom_article_ids)
      as requested_row(requested_id)
    left join public.newsroom_articles as article_row
      on article_row.id = requested_row.requested_id
    where article_row.id is null
  )
  then
    raise exception 'newsroom_article_classification_source_not_found'
      using errcode = 'P0002';
  end if;

  return query
  select
    requested_row.requested_id,
    classification_row.classification_key,
    classification_row.classification_source,
    classification_row.classified_at,
    classification_row.updated_at,
    classification_row.newsroom_article_id is not null
  from pg_catalog.unnest(p_newsroom_article_ids) with ordinality
    as requested_row(requested_id, requested_order)
  left join public.newsroom_editorial_article_classifications
    as classification_row
    on classification_row.newsroom_article_id = requested_row.requested_id
  order by requested_row.requested_order;
end;
$function$;

create function public.newsroom_apply_automatic_article_classification_v1(
  p_newsroom_article_id uuid,
  p_classification_key text
)
returns table (
  newsroom_article_id uuid,
  classification_key text,
  classification_source text,
  classified_at timestamptz,
  updated_at timestamptz,
  classified boolean,
  applied boolean,
  changed boolean
)
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_row public.newsroom_editorial_article_classifications%rowtype;
  v_row_count bigint := 0;
begin
  if p_newsroom_article_id is null
    or p_classification_key is null
  then
    raise exception 'newsroom_article_classification_invalid_input'
      using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.newsroom_articles as article_row
    where article_row.id = p_newsroom_article_id
  )
  then
    raise exception 'newsroom_article_classification_source_not_found'
      using errcode = 'P0002';
  end if;

  insert into public.newsroom_editorial_article_classifications (
    newsroom_article_id,
    classification_key,
    classification_source,
    classified_at
  ) values (
    p_newsroom_article_id,
    p_classification_key,
    'automatic',
    pg_catalog.statement_timestamp()
  )
  on conflict on constraint
    newsroom_editorial_article_classifications_pkey
  do update
  set
    classification_key = excluded.classification_key,
    classified_at = excluded.classified_at
  where newsroom_editorial_article_classifications.classification_source =
      'automatic'
    and newsroom_editorial_article_classifications.classification_key
      is distinct from excluded.classification_key
  returning * into v_row;

  get diagnostics v_row_count = row_count;

  if v_row_count = 0 then
    select classification_row.*
    into strict v_row
    from public.newsroom_editorial_article_classifications
      as classification_row
    where classification_row.newsroom_article_id = p_newsroom_article_id;
  end if;

  return query
  select
    v_row.newsroom_article_id,
    v_row.classification_key,
    v_row.classification_source,
    v_row.classified_at,
    v_row.updated_at,
    true,
    v_row.classification_source = 'automatic',
    v_row_count > 0;
end;
$function$;

create function public.newsroom_set_manual_article_classification_v1(
  p_newsroom_article_id uuid,
  p_classification_key text
)
returns table (
  newsroom_article_id uuid,
  classification_key text,
  classification_source text,
  classified_at timestamptz,
  updated_at timestamptz,
  classified boolean,
  applied boolean,
  changed boolean
)
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_row public.newsroom_editorial_article_classifications%rowtype;
  v_row_count bigint := 0;
begin
  if p_newsroom_article_id is null
    or p_classification_key is null
  then
    raise exception 'newsroom_article_classification_invalid_input'
      using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.newsroom_articles as article_row
    where article_row.id = p_newsroom_article_id
  )
  then
    raise exception 'newsroom_article_classification_source_not_found'
      using errcode = 'P0002';
  end if;

  insert into public.newsroom_editorial_article_classifications (
    newsroom_article_id,
    classification_key,
    classification_source,
    classified_at
  ) values (
    p_newsroom_article_id,
    p_classification_key,
    'manual',
    pg_catalog.statement_timestamp()
  )
  on conflict on constraint
    newsroom_editorial_article_classifications_pkey
  do update
  set
    classification_key = excluded.classification_key,
    classification_source = excluded.classification_source,
    classified_at = excluded.classified_at
  where (
    newsroom_editorial_article_classifications.classification_key,
    newsroom_editorial_article_classifications.classification_source
  ) is distinct from (
    excluded.classification_key,
    excluded.classification_source
  )
  returning * into v_row;

  get diagnostics v_row_count = row_count;

  if v_row_count = 0 then
    select classification_row.*
    into strict v_row
    from public.newsroom_editorial_article_classifications
      as classification_row
    where classification_row.newsroom_article_id = p_newsroom_article_id;
  end if;

  return query
  select
    v_row.newsroom_article_id,
    v_row.classification_key,
    v_row.classification_source,
    v_row.classified_at,
    v_row.updated_at,
    true,
    true,
    v_row_count > 0;
end;
$function$;

create function public.newsroom_clear_article_classification_v1(
  p_newsroom_article_id uuid
)
returns table (
  newsroom_article_id uuid,
  classification_key text,
  classification_source text,
  classified_at timestamptz,
  updated_at timestamptz,
  classified boolean,
  applied boolean,
  changed boolean
)
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_row_count bigint := 0;
begin
  if p_newsroom_article_id is null then
    raise exception 'newsroom_article_classification_invalid_input'
      using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.newsroom_articles as article_row
    where article_row.id = p_newsroom_article_id
  )
  then
    raise exception 'newsroom_article_classification_source_not_found'
      using errcode = 'P0002';
  end if;

  delete from public.newsroom_editorial_article_classifications
    as classification_row
  where classification_row.newsroom_article_id = p_newsroom_article_id;

  get diagnostics v_row_count = row_count;

  return query
  select
    p_newsroom_article_id,
    null::text,
    null::text,
    null::timestamptz,
    null::timestamptz,
    false,
    true,
    v_row_count > 0;
end;
$function$;

revoke all
on function public.newsroom_set_article_classification_updated_at_v1()
from public, anon, authenticated, service_role;

revoke all
on function public.newsroom_read_article_classification_states_v1(uuid[])
from public, anon, authenticated, service_role;

revoke all
on function public.newsroom_apply_automatic_article_classification_v1(
  uuid,
  text
)
from public, anon, authenticated, service_role;

revoke all
on function public.newsroom_set_manual_article_classification_v1(
  uuid,
  text
)
from public, anon, authenticated, service_role;

revoke all
on function public.newsroom_clear_article_classification_v1(uuid)
from public, anon, authenticated, service_role;

grant execute
on function public.newsroom_read_article_classification_states_v1(uuid[])
to service_role;

grant execute
on function public.newsroom_apply_automatic_article_classification_v1(
  uuid,
  text
)
to service_role;

grant execute
on function public.newsroom_set_manual_article_classification_v1(
  uuid,
  text
)
to service_role;

grant execute
on function public.newsroom_clear_article_classification_v1(uuid)
to service_role;

comment on table public.newsroom_editorial_article_classifications is
  'Current optional pre-publication editorial classification of newsroom source identities. Absence of a row means unclassified.';

comment on column
  public.newsroom_editorial_article_classifications.classification_key is
  'One of the same five canonical editorial classification keys; unclassified is represented by no row.';

comment on column
  public.newsroom_editorial_article_classifications.classification_source is
  'Authority of the current value: automatic or manual. Manual values cannot be replaced by the automatic RPC.';

comment on constraint
  newsroom_editorial_article_classifications_article_fkey
  on public.newsroom_editorial_article_classifications is
  'Cascade preserves the existing canonical newsroom source deletion flow; the classification is not independent history.';

notify pgrst, 'reload schema';

commit;
