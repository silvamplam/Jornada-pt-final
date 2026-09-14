\set ON_ERROR_STOP on

-- Run on a disposable PostgreSQL 17 database immediately after
-- 20260914074012_newsroom_mesa_scoped_read_model_v1.sql.

begin;

do $schema_assert$
declare
  target regprocedure;
begin
  foreach target in array array[
    'public.newsroom_mesa_source_candidates_v1(timestamptz,text)'::regprocedure,
    'public.newsroom_mesa_source_counts_v1(timestamptz,text)'::regprocedure,
    'public.newsroom_mesa_page_identities_v1(timestamptz,text,text,text,integer,integer)'::regprocedure,
    'public.newsroom_mesa_theme_summaries_v1(uuid[])'::regprocedure
  ] loop
    if (select p.prosecdef or p.provolatile <> 's'
        from pg_catalog.pg_proc p where p.oid = target) then
      raise exception 'mesa-scoped-read-function-contract-invalid:%', target;
    end if;
    if not has_function_privilege('service_role', target, 'EXECUTE')
      or has_function_privilege('anon', target, 'EXECUTE')
      or has_function_privilege('authenticated', target, 'EXECUTE')
    then
      raise exception 'mesa-scoped-read-function-privilege-invalid:%', target;
    end if;
  end loop;
  if to_regclass('public.newsroom_articles_cycle_page_v1') is null
    or to_regclass('public.newsroom_articles_source_cycle_page_v1') is null
    or to_regclass('public.newsroom_editorial_source_packages_manifest_gin_v1') is null
    or to_regclass('public.newsroom_mesa_production_contexts_source_refs_gin_v1') is null
  then
    raise exception 'mesa-scoped-read-index-missing';
  end if;
end;
$schema_assert$;

do $page_assert$
declare
  row_count integer;
  duplicate_count integer;
  out_of_order_count integer;
begin
  with page as materialized (
    select *, row_number() over () as position
    from public.newsroom_mesa_page_identities_v1('1970-01-01', 'new', 'all', null, 24, 0)
  )
  select count(*), count(*) - count(distinct newsroom_article_id)
    into row_count, duplicate_count from page;
  if row_count > 25 or duplicate_count <> 0 then
    raise exception 'mesa-scoped-read-page-bound-invalid:%:%', row_count, duplicate_count;
  end if;
  with page as materialized (
    select *, row_number() over () as position
    from public.newsroom_mesa_page_identities_v1('1970-01-01', 'new', 'all', null, 24, 0)
  )
  select count(*) into out_of_order_count
  from page current_row
  join page previous_row on previous_row.position = current_row.position - 1
  where previous_row.last_detected_at < current_row.last_detected_at
     or (previous_row.last_detected_at = current_row.last_detected_at
       and previous_row.newsroom_article_id < current_row.newsroom_article_id);
  if out_of_order_count <> 0 then
    raise exception 'mesa-scoped-read-page-order-invalid:%', out_of_order_count;
  end if;
end;
$page_assert$;

do $counts_assert$
declare counts record;
begin
  select * into strict counts
  from public.newsroom_mesa_source_counts_v1('1970-01-01', null);
  if counts.novas_total <> counts.novas_benfica + counts.novas_sporting
      + counts.novas_fc_porto + counts.novas_other_liga_clubs
      + counts.novas_outside_liga_other + counts.novas_unclassified
    or counts.publicadas_total <> counts.publicadas_benfica + counts.publicadas_sporting
      + counts.publicadas_fc_porto + counts.publicadas_other_liga_clubs
      + counts.publicadas_outside_liga_other + counts.publicadas_unclassified
  then
    raise exception 'mesa-scoped-read-count-contract-invalid';
  end if;
  begin
    perform * from public.newsroom_mesa_page_identities_v1(
      '1970-01-01', 'new', 'all', null, 201, 0
    );
    raise exception 'mesa-scoped-read-limit-guard-missing';
  exception when sqlstate '22023' then null;
  end;
end;
$counts_assert$;

select 'postflight-ok' as result;
rollback;
