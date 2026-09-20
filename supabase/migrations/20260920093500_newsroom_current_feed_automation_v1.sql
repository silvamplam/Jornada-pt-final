begin;

create table if not exists jornada_private.newsroom_automatic_feed_tokens (
  token_hash text primary key,
  expires_at timestamptz not null,
  created_at timestamptz not null default pg_catalog.statement_timestamp()
);

revoke all
on table jornada_private.newsroom_automatic_feed_tokens
from public, anon, authenticated, service_role;

create or replace function public.newsroom_consume_automatic_feed_token_v1(
  p_token text
)
returns table (
  authorized boolean
)
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

  delete from jornada_private.newsroom_automatic_feed_tokens as token_row
  where token_row.token_hash = v_hash
    and token_row.expires_at >= pg_catalog.statement_timestamp();

  get diagnostics v_deleted = row_count;

  delete from jornada_private.newsroom_automatic_feed_tokens as token_row
  where token_row.expires_at < pg_catalog.statement_timestamp();

  return query select v_deleted = 1;
end;
$function$;

revoke all
on function public.newsroom_consume_automatic_feed_token_v1(text)
from public, anon, authenticated, service_role;

grant execute
on function public.newsroom_consume_automatic_feed_token_v1(text)
to service_role;

comment on function public.newsroom_consume_automatic_feed_token_v1(text)
is
  'Consome atomicamente um token efémero de uma só utilização para autorizar a recolha automática da Mesa.';

do $cron$
begin
  if exists (
    select 1
    from cron.job
    where jobname = 'jornada-newsroom-current-feed-quarter-hour'
  ) then
    perform cron.unschedule('jornada-newsroom-current-feed-quarter-hour');
  end if;

  perform cron.schedule(
    'jornada-newsroom-current-feed-quarter-hour',
    '*/15 * * * *',
    $job$
      with generated as (
        select pg_catalog.encode(extensions.gen_random_bytes(32), 'hex') as token
      ),
      stored as (
        insert into jornada_private.newsroom_automatic_feed_tokens (
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
        url := 'https://jornada.pt/api/cron/redacao-automatica/current-feed',
        headers := pg_catalog.jsonb_build_object(
          'Content-Type', 'application/json'
        ),
        body := pg_catalog.jsonb_build_object(
          'token',
          generated.token
        ),
        timeout_milliseconds := 240000
      ) as request_id
      from generated
      cross join stored;
    $job$
  );
end;
$cron$;

commit;
