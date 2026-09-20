begin;

create or replace function public.newsroom_verify_automatic_feed_secret_v1(
  p_secret text
)
returns table (
  authorized boolean
)
language sql
stable
security definer
set search_path = ''
as $function$
  select
    p_secret is not null
    and pg_catalog.length(p_secret) >= 32
    and exists (
      select 1
      from vault.decrypted_secrets as secret_row
      where secret_row.name = 'jornada_sync_final_results_secret'
        and secret_row.decrypted_secret = p_secret
    );
$function$;

revoke all
on function public.newsroom_verify_automatic_feed_secret_v1(text)
from public, anon, authenticated, service_role;

grant execute
on function public.newsroom_verify_automatic_feed_secret_v1(text)
to service_role;

comment on function public.newsroom_verify_automatic_feed_secret_v1(text)
is
  'Valida, sem expor o Vault, o segredo apresentado pelo endpoint técnico da recolha automática da Mesa.';

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
      select net.http_post(
        url := 'https://jornada.pt/api/cron/redacao-automatica/current-feed',
        headers := pg_catalog.jsonb_build_object(
          'Content-Type', 'application/json',
          'x-sync-secret', (
            select decrypted_secret
            from vault.decrypted_secrets
            where name = 'jornada_sync_final_results_secret'
            limit 1
          )
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 240000
      ) as request_id;
    $job$
  );
end;
$cron$;

commit;
