begin;

-- A publicação histórica materializa a continuidade física para a jornada
-- seguinte e pode legitimamente ultrapassar o limite REST normal de 8 s.
-- A exceção fica confinada à RPC administrativa de publicação; não altera
-- timeouts de roles, da base de dados ou das restantes chamadas PostgREST.
alter function public.publish_matchday_reference_composition(uuid, uuid)
  set statement_timeout = '30s';

commit;
