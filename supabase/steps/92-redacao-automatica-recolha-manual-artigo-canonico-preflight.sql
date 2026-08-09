-- Step 92 - preflight read-only da entrada manual canónica completa.
-- Não executa DDL, DML ou funções de escrita.

with state as (
  select
    to_regclass('public.newsroom_articles') is not null as articles_present,
    to_regclass('public.newsroom_article_snapshots') is not null as snapshots_present,
    to_regclass('public.newsroom_manual_entry_requests') is not null as requests_present,
    to_regprocedure('public.newsroom_create_manual_entry(uuid,text,text,jsonb,text,text,text)') is not null as legacy_rpc_present,
    to_regprocedure('public.newsroom_create_complete_manual_entry(uuid,text,text,text,text,text,jsonb,text,text,text,text)') is not null as complete_rpc_present
)
select jsonb_build_object(
  'step', 92,
  'articles_present', articles_present,
  'snapshots_present', snapshots_present,
  'requests_present', requests_present,
  'legacy_rpc_present', legacy_rpc_present,
  'complete_rpc_present', complete_rpc_present,
  'ready_to_apply', articles_present and snapshots_present and requests_present and legacy_rpc_present and not complete_rpc_present,
  'writes_performed', false
) as preflight_summary
from state;
