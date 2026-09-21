begin;

-- The automatic video-summary discovery is intentionally disabled.
-- Editors can still refresh a matchday explicitly from the admin UI.
do $manual_only$
begin
  if exists (
    select 1
    from cron.job
    where jobname = 'jornada-video-summaries-quarter-hour'
  ) then
    perform cron.unschedule('jornada-video-summaries-quarter-hour');
  end if;
end;
$manual_only$;

commit;
