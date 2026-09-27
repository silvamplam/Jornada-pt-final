select cron.schedule(
  'jornada-sync-final-results-daily',
  '55 23 * * *',
  $cron$
    select net.http_post(
      url := 'https://mztkeurmeadwbgebmuvv.supabase.co/functions/v1/sync-final-results',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-sync-secret', (
          select decrypted_secret
          from vault.decrypted_secrets
          where name = 'jornada_sync_final_results_secret'
        )
      ),
      body := '{"mode":"fast"}'::jsonb,
      timeout_milliseconds := 15000
    ) as request_id;
  $cron$
);
