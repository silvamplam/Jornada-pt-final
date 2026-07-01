-- PORTAL-ESCOLAS-PARTICIPANTES-CRIACAO-AUDITADA-1
-- ROLLBACK GUARDADO — NÃO EXECUTAR SEM ORDEM EXPRESSA
--
-- Objetivo:
-- Remover a RPC criada nesta fase.
--
-- Atenção:
-- Este rollback remove apenas a função:
-- public.portal_create_competition_participant(uuid,text,text,text,integer,text,text,text,text)
--
-- Não remove participantes.
-- Não remove inscrições.
-- Não remove auditorias.
-- Não remove eventos.
-- Não remove resultados.
-- Não remove rankings.

begin;

drop function if exists public.portal_create_competition_participant(
  uuid,
  text,
  text,
  text,
  integer,
  text,
  text,
  text,
  text
);

commit;
