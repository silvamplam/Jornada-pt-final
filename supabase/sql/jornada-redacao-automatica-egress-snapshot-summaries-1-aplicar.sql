create or replace function public.newsroom_latest_snapshot_summaries(
  p_article_ids uuid[]
)
returns table (
  id uuid,
  article_id uuid,
  published_at_precision text,
  is_manual_origin boolean,
  has_usable_snapshot boolean
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select
    snapshot.id,
    snapshot.article_id,
    case
      when snapshot.source_metadata ->> 'publishedAtPrecision' in ('date', 'instant')
        then snapshot.source_metadata ->> 'publishedAtPrecision'
      else null
    end as published_at_precision,
    coalesce(
      snapshot.source_metadata ->> 'origin' = 'manual',
      false
    ) as is_manual_origin,
    exists (
      select 1
      from jsonb_array_elements(
        case
          when jsonb_typeof(snapshot.body) = 'array'
            then snapshot.body
          else '[]'::jsonb
        end
      ) as block(value)
      where block.value ->> 'type' in ('paragraph', 'heading')
        and jsonb_typeof(block.value -> 'text') = 'string'
        and btrim(block.value ->> 'text') <> ''
    ) as has_usable_snapshot
  from unnest(
    coalesce(p_article_ids, '{}'::uuid[])
  ) as requested(article_id)
  join lateral (
    select source_snapshot.*
    from public.newsroom_article_snapshots source_snapshot
    where source_snapshot.article_id = requested.article_id
    order by
      source_snapshot.extracted_at desc,
      source_snapshot.created_at desc,
      source_snapshot.id desc
    limit 1
  ) as snapshot on true;
$$;

revoke all
on function public.newsroom_latest_snapshot_summaries(uuid[])
from public;

revoke all
on function public.newsroom_latest_snapshot_summaries(uuid[])
from anon;

revoke all
on function public.newsroom_latest_snapshot_summaries(uuid[])
from authenticated;

grant execute
on function public.newsroom_latest_snapshot_summaries(uuid[])
to service_role;

comment on function public.newsroom_latest_snapshot_summaries(uuid[]) is
  'Returns only the latest snapshot summary fields needed by newsroom list views, avoiding body and source_metadata egress.';

notify pgrst, 'reload schema';