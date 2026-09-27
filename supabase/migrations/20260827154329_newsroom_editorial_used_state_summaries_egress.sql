create or replace function public.newsroom_editorial_used_state_summaries()
returns table (
  newsroom_article_id uuid,
  newsroom_snapshot_id uuid,
  used_at text,
  is_current_snapshot boolean
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select
    lower(entry.value ->> 'newsroomArticleId')::uuid as newsroom_article_id,
    lower(entry.value ->> 'newsroomSnapshotId')::uuid as newsroom_snapshot_id,
    btrim(entry.value ->> 'usedAt') as used_at,
    coalesce(
      latest_snapshot.id = lower(entry.value ->> 'newsroomSnapshotId')::uuid,
      false
    ) as is_current_snapshot
  from public.newsroom_editorial_source_packages package
  cross join lateral jsonb_array_elements(
    case
      when jsonb_typeof(package.manifest -> 'entries') = 'array'
        then package.manifest -> 'entries'
      else '[]'::jsonb
    end
  ) with ordinality as entry(value, ordinality)
  join public.newsroom_articles article
    on article.id = lower(entry.value ->> 'newsroomArticleId')::uuid
  left join lateral (
    select snapshot.id
    from public.newsroom_article_snapshots snapshot
    where snapshot.article_id = article.id
    order by snapshot.extracted_at desc, snapshot.created_at desc, snapshot.id desc
    limit 1
  ) as latest_snapshot on true
  where lower(coalesce(entry.value ->> 'newsroomArticleId', ''))
      ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    and lower(coalesce(entry.value ->> 'newsroomSnapshotId', ''))
      ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    and nullif(btrim(entry.value ->> 'usedAt'), '') is not null
  order by package.updated_at desc, package.id desc, entry.ordinality asc;
$$;

revoke all on function public.newsroom_editorial_used_state_summaries() from public;
revoke all on function public.newsroom_editorial_used_state_summaries() from anon;
revoke all on function public.newsroom_editorial_used_state_summaries() from authenticated;
grant execute on function public.newsroom_editorial_used_state_summaries() to service_role;

comment on function public.newsroom_editorial_used_state_summaries() is
  'Projects only the historical newsroom source usage fields needed by non-used inbox views, including whether the used snapshot is still current.';

notify pgrst, 'reload schema';
