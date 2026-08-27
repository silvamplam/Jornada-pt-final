create or replace function public.newsroom_editorial_review_projection(
  p_article_ids uuid[],
  p_current_used_article_ids uuid[],
  p_selected_view text default null
)
returns table (
  working_count integer,
  archive_count integer,
  states jsonb
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  with current_used as (
    select distinct value as article_id
    from unnest(
      coalesce(p_current_used_article_ids, '{}'::uuid[])
    ) as ids(value)
  ),
  counts as (
    select
      count(*) filter (
        where state.decision = 'working'
          and not exists (
            select 1
            from current_used used
            where used.article_id = state.newsroom_article_id
          )
      )::integer as working_count,
      count(*) filter (
        where state.decision <> 'working'
          and not exists (
            select 1
            from current_used used
            where used.article_id = state.newsroom_article_id
          )
      )::integer as archive_count
    from public.newsroom_editorial_review_states state
  ),
  requested as (
    select
      state.newsroom_article_id,
      state.decision,
      state.reviewed_snapshot_id,
      state.reviewed_at,
      false as selected_for_view
    from public.newsroom_editorial_review_states state
    where state.newsroom_article_id = any(
      coalesce(p_article_ids, '{}'::uuid[])
    )
  ),
  selected_working as (
    select
      state.newsroom_article_id,
      state.decision,
      state.reviewed_snapshot_id,
      state.reviewed_at,
      true as selected_for_view
    from public.newsroom_editorial_review_states state
    where p_selected_view = 'working'
      and state.decision = 'working'
      and not exists (
        select 1
        from current_used used
        where used.article_id = state.newsroom_article_id
      )
  ),
  selected_archive as (
    select
      selected.newsroom_article_id,
      selected.decision,
      selected.reviewed_snapshot_id,
      selected.reviewed_at,
      true as selected_for_view
    from (
      select state.*
      from public.newsroom_editorial_review_states state
      where p_selected_view = 'archive'
        and state.decision <> 'working'
        and not exists (
          select 1
          from current_used used
          where used.article_id = state.newsroom_article_id
        )
      order by
        state.reviewed_at desc,
        state.newsroom_article_id asc
      limit 100
    ) selected
  ),
  combined as (
    select
      candidate.newsroom_article_id,
      candidate.decision,
      candidate.reviewed_snapshot_id,
      candidate.reviewed_at,
      bool_or(candidate.selected_for_view) as selected_for_view
    from (
      select * from requested
      union all
      select * from selected_working
      union all
      select * from selected_archive
    ) candidate
    group by
      candidate.newsroom_article_id,
      candidate.decision,
      candidate.reviewed_snapshot_id,
      candidate.reviewed_at
  ),
  payload as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'newsroom_article_id',
          combined.newsroom_article_id,
          'decision',
          combined.decision,
          'reviewed_snapshot_id',
          combined.reviewed_snapshot_id,
          'reviewed_at',
          combined.reviewed_at,
          'selected_for_view',
          combined.selected_for_view
        )
        order by
          combined.reviewed_at desc,
          combined.newsroom_article_id asc
      ),
      '[]'::jsonb
    ) as states
    from combined
  )
  select
    counts.working_count,
    counts.archive_count,
    payload.states
  from counts
  cross join payload;
$$;

revoke all
on function public.newsroom_editorial_review_projection(
  uuid[],
  uuid[],
  text
)
from public;

revoke all
on function public.newsroom_editorial_review_projection(
  uuid[],
  uuid[],
  text
)
from anon;

revoke all
on function public.newsroom_editorial_review_projection(
  uuid[],
  uuid[],
  text
)
from authenticated;

grant execute
on function public.newsroom_editorial_review_projection(
  uuid[],
  uuid[],
  text
)
to service_role;

comment on function public.newsroom_editorial_review_projection(
  uuid[],
  uuid[],
  text
) is
  'Returns exact inbox review counts plus only review-state rows needed for the requested current articles and selected working/archive view.';

notify pgrst, 'reload schema';