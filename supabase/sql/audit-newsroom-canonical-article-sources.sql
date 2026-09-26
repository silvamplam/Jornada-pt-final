-- Read-only production preflight. No writes; same scoped evidence as the migration.
with evidence as (
  select article.id as editorial_article_id, article.newsroom_article_id, coalesce(article.published_at,article.created_at) as linked_at,
    'legacy_origin'::text as evidence_kind
  from public.editorial_articles article
  join public.newsroom_articles source on source.id=article.newsroom_article_id
  where article.status='published'
  union all
  select usage.editorial_article_id, usage.newsroom_article_id,usage.created_at,'factual_usage'
  from public.newsroom_mesa_output_source_usage usage
  join public.editorial_articles article on article.id=usage.editorial_article_id and article.status='published'
  union all
  select receipt.editorial_article_id, source.newsroom_article_id,receipt.completed_at,'receipt_'||receipt.decision
  from public.newsroom_mesa_intent_article_receipts receipt
  join public.editorial_articles article on article.id=receipt.editorial_article_id and article.status='published'
  cross join lateral (
    select distinct source.id as newsroom_article_id
    from public.newsroom_mesa_intent_preparations preparation
    join public.newsroom_mesa_intent_finalizations finalization on finalization.dossier_id=preparation.dossier_id
    cross join lateral jsonb_array_elements(preparation.frozen_plan->'outputs') output
    cross join lateral jsonb_array_elements(preparation.frozen_plan->'contexts') context
    cross join lateral jsonb_array_elements(receipt.sources) receipt_source
    join public.newsroom_articles source on source.id::text=receipt_source->>'newsroomArticleId'
    join public.newsroom_article_snapshots snapshot on snapshot.article_id=source.id
      and snapshot.id::text=receipt_source->>'newsroomSnapshotId'
    where preparation.dossier_id=receipt.dossier_id and output->>'outputId'=receipt.output_id::text
      and context->>'key'=output->>'contextKey'
      and exists (select 1 from jsonb_array_elements(context->'sources') frozen
        where frozen->>'newsroomArticleId'=source.id::text and frozen->>'newsroomSnapshotId'=snapshot.id::text)
      -- Old NEW receipts can describe a shared pool, not an article-specific group.
    -- With several outputs and no frozen focus, only exact factual provenance is demonstrable.
    and (output->>'kind'='existing' or output ? 'focusSourceIds'
      or (select count(*) from jsonb_array_elements(preparation.frozen_plan->'outputs') sibling
        where sibling->>'contextKey'=output->>'contextKey')=1
      or exists (select 1 from public.newsroom_mesa_output_source_usage usage
        where usage.dossier_id=receipt.dossier_id and usage.article_plan_id=receipt.output_id
          and usage.newsroom_article_id=source.id))
      and (not (output ? 'focusSourceIds') or exists (
        select 1 from jsonb_array_elements_text(output->'focusSourceIds') focus(id) where focus.id=source.id::text))
  ) source
)
, pairs as (select distinct editorial_article_id,newsroom_article_id from evidence),
ambiguous as (select newsroom_article_id,count(*) as article_count,array_agg(editorial_article_id order by editorial_article_id) as article_ids
  from pairs group by newsroom_article_id having count(*)>1)
select jsonb_build_object(
  'by_evidence',(select jsonb_agg(to_jsonb(counts) order by evidence_kind) from (
    select evidence_kind,count(*) as evidence_rows,count(distinct (editorial_article_id,newsroom_article_id)) as distinct_pairs,
      count(distinct (editorial_article_id,newsroom_article_id)) filter(where not exists (
        select 1 from evidence other where other.editorial_article_id=evidence.editorial_article_id
          and other.newsroom_article_id=evidence.newsroom_article_id and other.evidence_kind<>evidence.evidence_kind)) as exclusive_pairs
    from evidence group by evidence_kind) counts),
  'total_pairs',(select count(*) from pairs),
  'total_articles',(select count(distinct editorial_article_id) from pairs),
  'total_sources',(select count(distinct newsroom_article_id) from pairs),
  'ambiguous_sources',(select count(*) from ambiguous),
  'ambiguous_examples',(select jsonb_agg(to_jsonb(a)) from (select * from ambiguous order by article_count desc,newsroom_article_id limit 3) a),
  'aursnes_sources',(select jsonb_agg(newsroom_article_id order by newsroom_article_id) from pairs
    where editorial_article_id='6d891b9d-e6df-4d67-b78a-7e50b506c2f1')) as backfill;
