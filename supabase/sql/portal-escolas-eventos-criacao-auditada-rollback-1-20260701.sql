-- PORTAL-ESCOLAS-EVENTOS-CRIACAO-AUDITADA-1
-- ROLLBACK GUARDADO — NÃO EXECUTAR SEM ORDEM EXPRESSA
--
-- Objetivo:
-- Remover a RPC criada nesta fase.
--
-- Atenção:
-- Este rollback remove apenas a função:
-- public.portal_create_competition_event(uuid,text,uuid,text,integer,timestamp with time zone,text,text,uuid[],text)
--
-- Não remove eventos.
-- Não remove participantes de evento.
-- Não remove participantes da competição.
-- Não remove auditorias.
-- Não remove resultados.
-- Não remove rankings.

begin;

drop function if exists public.portal_create_competition_event(
  uuid,
  text,
  uuid,
  text,
  integer,
  timestamptz,
  text,
  text,
  uuid[],
  text
);

commit;
