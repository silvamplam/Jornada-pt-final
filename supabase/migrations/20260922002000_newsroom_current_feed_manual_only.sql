begin;

-- A Mesa mantém Record e A Bola disponíveis para atualização manual,
-- mas deixa de executar a recolha automática de 15 em 15 minutos.
do $manual_only$
begin
  if exists (
    select 1
    from cron.job
    where jobname = 'jornada-newsroom-current-feed-quarter-hour'
  ) then
    perform cron.unschedule('jornada-newsroom-current-feed-quarter-hour');
  end if;
end;
$manual_only$;

commit;
