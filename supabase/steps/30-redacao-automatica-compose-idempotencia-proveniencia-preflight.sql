-- Step 30 — read-only preflight for persistent compose idempotency and frozen provenance.
-- This script performs no writes.

with required_relations(name, relation) as (
  values
    ('newsroom_articles', to_regclass('public.newsroom_articles')),
    ('newsroom_article_snapshots', to_regclass('public.newsroom_article_snapshots')),
    ('newsroom_editorial_dossiers', to_regclass('public.newsroom_editorial_dossiers')),
    ('newsroom_editorial_dossier_sources', to_regclass('public.newsroom_editorial_dossier_sources')),
    ('newsroom_editorial_dossier_article_plans', to_regclass('public.newsroom_editorial_dossier_article_plans')),
    ('newsroom_editorial_dossier_article_plan_sources', to_regclass('public.newsroom_editorial_dossier_article_plan_sources')),
    ('newsroom_editorial_dossier_article_plan_generations', to_regclass('public.newsroom_editorial_dossier_article_plan_generations')),
    ('editorial_articles', to_regclass('public.editorial_articles'))
),
required_functions(name, identity_arguments, present) as (
  values
    (
      'newsroom_create_editorial_dossier_article_plan_draft',
      'uuid, uuid',
      to_regprocedure('public.newsroom_create_editorial_dossier_article_plan_draft(uuid,uuid)') is not null
    ),
    (
      'newsroom_apply_editorial_dossier_article_plan_generation',
      'uuid, uuid, uuid, timestamp with time zone, text, text, text, text, text, text, jsonb, integer, integer, integer',
      to_regprocedure(
        'public.newsroom_apply_editorial_dossier_article_plan_generation(uuid,uuid,uuid,timestamp with time zone,text,text,text,text,text,text,jsonb,integer,integer,integer)'
      ) is not null
    )
),
target_state as (
  select
    to_regclass('public.newsroom_editorial_compose_requests') is null as request_table_absent,
    not exists (
      select 1
      from pg_attribute
      where attrelid = to_regclass('public.newsroom_editorial_dossier_sources')
        and attname in ('title_snapshot', 'published_at_snapshot')
        and not attisdropped
    ) as frozen_columns_absent,
    to_regprocedure(
      'public.newsroom_prepare_editorial_compose(uuid,text,text,text,text,text,text,text,uuid[],uuid[],text[],integer[],text[])'
    ) is null as prepare_rpc_absent,
    to_regprocedure(
      'public.newsroom_claim_editorial_compose_generation(uuid,text,uuid)'
    ) is null as claim_rpc_absent
),
base_grants_state as (
  select
    has_table_privilege(
      'service_role',
      'public.newsroom_editorial_dossiers',
      'SELECT,INSERT,UPDATE,DELETE'
    ) as dossier_grants_present,
    has_table_privilege(
      'service_role',
      'public.newsroom_editorial_dossier_sources',
      'SELECT,INSERT,UPDATE,DELETE'
    ) as source_grants_present,
    has_table_privilege(
      'service_role',
      'public.newsroom_editorial_dossier_article_plans',
      'SELECT,INSERT,UPDATE,DELETE'
    ) as plan_grants_present,
    has_table_privilege(
      'service_role',
      'public.editorial_articles',
      'SELECT,INSERT,UPDATE'
    ) as article_grants_present,
    has_function_privilege(
      'service_role',
      'public.newsroom_create_editorial_dossier_article_plan_draft(uuid,uuid)',
      'EXECUTE'
    ) as draft_rpc_execute_present,
    has_function_privilege(
      'service_role',
      'public.newsroom_apply_editorial_dossier_article_plan_generation(uuid,uuid,uuid,timestamp with time zone,text,text,text,text,text,text,jsonb,integer,integer,integer)',
      'EXECUTE'
    ) as generation_rpc_execute_present
),
legacy_state as (
  select
    count(*) as dossier_source_count,
    count(*) filter (
      where snapshot.article_id is distinct from source_row.newsroom_article_id
    ) as incompatible_snapshot_identity_count,
    count(*) filter (
      where snapshot.source_metadata ? 'originalUrl'
        and snapshot.source_metadata ? 'normalizedUrl'
        and snapshot.source_metadata ? 'sourceCode'
    ) as immutable_operational_metadata_count,
    count(*) filter (
      where not (
        snapshot.source_metadata ? 'originalUrl'
        and snapshot.source_metadata ? 'normalizedUrl'
        and snapshot.source_metadata ? 'sourceCode'
      )
    ) as legacy_metadata_fallback_count
  from public.newsroom_editorial_dossier_sources source_row
  join public.newsroom_article_snapshots snapshot
    on snapshot.id = source_row.newsroom_snapshot_id
)
select jsonb_build_object(
  'step', 30,
  'required_relations',
    (select jsonb_object_agg(name, relation is not null) from required_relations),
  'required_functions',
    (select jsonb_object_agg(name, present) from required_functions),
  'request_table_absent', target_state.request_table_absent,
  'frozen_columns_absent', target_state.frozen_columns_absent,
  'prepare_rpc_absent', target_state.prepare_rpc_absent,
  'claim_rpc_absent', target_state.claim_rpc_absent,
  'base_grants', to_jsonb(base_grants_state),
  'dossier_source_count', legacy_state.dossier_source_count,
  'incompatible_snapshot_identity_count', legacy_state.incompatible_snapshot_identity_count,
  'immutable_operational_metadata_count', legacy_state.immutable_operational_metadata_count,
  'legacy_metadata_fallback_count', legacy_state.legacy_metadata_fallback_count,
  'ready_to_apply',
    not exists (select 1 from required_relations where relation is null)
    and not exists (select 1 from required_functions where not present)
    and target_state.request_table_absent
    and target_state.frozen_columns_absent
    and target_state.prepare_rpc_absent
    and target_state.claim_rpc_absent
    and base_grants_state.dossier_grants_present
    and base_grants_state.source_grants_present
    and base_grants_state.plan_grants_present
    and base_grants_state.article_grants_present
    and base_grants_state.draft_rpc_execute_present
    and base_grants_state.generation_rpc_execute_present
    and legacy_state.incompatible_snapshot_identity_count = 0,
  'writes_performed', false,
  'next_step', 'run 31-redacao-automatica-compose-idempotencia-proveniencia-apply.sql manually'
) as preflight_summary
from target_state
cross join base_grants_state
cross join legacy_state;
