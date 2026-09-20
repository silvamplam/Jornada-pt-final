begin;

alter table public.match_video_summary_candidates
  add column if not exists summary_kind text not null default 'full',
  add column if not exists source_url text,
  add column if not exists playable_media_url text;

alter table public.match_video_summary_candidates
  drop constraint if exists match_video_summary_candidates_provider_check;

alter table public.match_video_summary_candidates
  add constraint match_video_summary_candidates_provider_check
  check (provider in ('youtube', 'vsports'));

do $constraints$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'match_video_summary_candidates_summary_kind_check'
      and conrelid = 'public.match_video_summary_candidates'::regclass
  ) then
    alter table public.match_video_summary_candidates
      add constraint match_video_summary_candidates_summary_kind_check
      check (summary_kind in ('full', 'flash'));
  end if;
end;
$constraints$;

create table if not exists public.match_video_summary_discoveries (
  id uuid primary key default extensions.gen_random_uuid(),
  matchday_id uuid not null references public.matchdays(id) on delete cascade,
  match_id uuid references public.matches(id) on delete set null,
  source_provider text not null,
  source_item_id text not null,
  source_url text,
  playable_media_url text,
  title text not null,
  summary_kind text not null,
  diagnostic_reason text not null,
  match_confidence integer,
  discovered_at timestamptz not null default pg_catalog.statement_timestamp(),
  last_synced_at timestamptz not null default pg_catalog.statement_timestamp(),
  constraint match_video_summary_discoveries_source_provider_check
    check (source_provider in ('vsports', 'youtube')),
  constraint match_video_summary_discoveries_source_item_id_check
    check (pg_catalog.btrim(source_item_id) <> ''),
  constraint match_video_summary_discoveries_summary_kind_check
    check (summary_kind in ('full', 'flash', 'not-summary')),
  constraint match_video_summary_discoveries_reason_check
    check (diagnostic_reason in (
      'full',
      'flash',
      'not-summary',
      'outside-window',
      'teams-not-recognized',
      'score-mismatch',
      'ambiguous-match',
      'already-associated',
      'no-playable-media',
      'not-found',
      'source-unavailable'
    )),
  constraint match_video_summary_discoveries_confidence_check
    check (match_confidence is null or match_confidence between 0 and 100),
  constraint match_video_summary_discoveries_identity_key
    unique (matchday_id, source_provider, source_item_id)
);

create index if not exists match_video_summary_discoveries_matchday_match_idx
  on public.match_video_summary_discoveries (matchday_id, match_id, last_synced_at desc);

alter table public.match_video_summary_discoveries enable row level security;
revoke all on table public.match_video_summary_discoveries from public, anon, authenticated;
grant select, insert, update, delete on table public.match_video_summary_discoveries to service_role;

comment on table public.match_video_summary_discoveries is
  'Auditoria idempotente do discovery de resumos, incluindo fontes sem media reproduzivel.';

create table if not exists jornada_private.match_video_summary_automation_tokens (
  token_hash text primary key,
  expires_at timestamptz not null,
  created_at timestamptz not null default pg_catalog.statement_timestamp()
);

revoke all
on table jornada_private.match_video_summary_automation_tokens
from public, anon, authenticated, service_role;

create or replace function public.match_video_summary_consume_automation_token_v1(
  p_token text
)
returns table (authorized boolean)
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_hash text;
  v_deleted bigint := 0;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then
    return query select false;
    return;
  end if;

  v_hash := pg_catalog.encode(
    extensions.digest(pg_catalog.convert_to(p_token, 'UTF8'), 'sha256'),
    'hex'
  );

  delete from jornada_private.match_video_summary_automation_tokens as token_row
  where token_row.token_hash = v_hash
    and token_row.expires_at >= pg_catalog.statement_timestamp();
  get diagnostics v_deleted = row_count;

  delete from jornada_private.match_video_summary_automation_tokens as token_row
  where token_row.expires_at < pg_catalog.statement_timestamp();

  return query select v_deleted = 1;
end;
$function$;

revoke all
on function public.match_video_summary_consume_automation_token_v1(text)
from public, anon, authenticated, service_role;

grant execute
on function public.match_video_summary_consume_automation_token_v1(text)
to service_role;

do $cron$
begin
  if exists (
    select 1 from cron.job
    where jobname = 'jornada-video-summaries-quarter-hour'
  ) then
    perform cron.unschedule('jornada-video-summaries-quarter-hour');
  end if;

  perform cron.schedule(
    'jornada-video-summaries-quarter-hour',
    '*/15 * * * *',
    $job$
      with generated as (
        select pg_catalog.encode(extensions.gen_random_bytes(32), 'hex') as token
      ),
      stored as (
        insert into jornada_private.match_video_summary_automation_tokens (
          token_hash,
          expires_at
        )
        select
          pg_catalog.encode(
            extensions.digest(pg_catalog.convert_to(generated.token, 'UTF8'), 'sha256'),
            'hex'
          ),
          pg_catalog.statement_timestamp() + interval '5 minutes'
        from generated
        returning token_hash
      )
      select net.http_post(
        url := 'https://jornada.pt/api/cron/jornada/video-summaries',
        headers := pg_catalog.jsonb_build_object('Content-Type', 'application/json'),
        body := pg_catalog.jsonb_build_object('token', generated.token),
        timeout_milliseconds := 240000
      ) as request_id
      from generated
      cross join stored;
    $job$
  );
end;
$cron$;

commit;
