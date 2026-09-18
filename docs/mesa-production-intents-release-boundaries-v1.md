# Temas: entrada administrativa e colocação em Últimas

Base remota verificada: `ff132f61278788eb1fe32b20eabdcfd7424c3f3e`.
Branch: `jornada-mesa-producao-intencoes-continuidade-v2-20260917`.
PR: #333, rascunho. Esta entrega é um commit local sobre essa base, ainda sem envio ou CI confirmado.

## Autorização e condição de aplicação

Em 18/09/2026 o utilizador autorizou as migrações **quando estiverem prontas**.
A autorização não elimina a obrigação de guardar o código na branch, validar a
versão final e confirmar o projeto Jornada antes da aplicação. Não houve consulta
ou alteração da Supabase de produção nesta etapa; também não houve merge.

## Erro encontrado e correção

O writer de artigos já evita duplicação do artigo canónico, mas a colocação
subsequente em Últimas fazia leitura e inserção em pedidos diferentes. Dois
pedidos de publicação sobrepostos podiam, portanto, criar duas entradas para o
mesmo artigo. A simulação de colocação da suite anterior não detetava esta falha.

A migração candidata de publicação, ainda nunca aplicada em produção neste
trabalho, acrescenta `newsroom_place_mesa_intent_latest_v1(uuid,uuid,uuid[])`.
O novo circuito chama este RPC em vez do writer legado em vários pedidos.
A função valida o plano/pacote congelados, compara o conjunto de artigos
canónicos e o fingerprint de cada resultado, bloqueia o workspace e as jornadas
em ordem determinada e projeta as entradas numa única transação. Reutiliza os
procedimentos existentes de configuração e ordenação de Últimas e o trigger de
sincronização do banco editorial. Não recebe texto arbitrário do cliente.

Uma falha na segunda inserção reverte também a primeira entrada e o banco.
O artigo canónico previamente publicado continua recuperável e não há recibos
prematuros; a repetição conclui sem o duplicar. Um duplicado já existente dá um
erro explícito: não é apagado nem certificado silenciosamente. Um replay depois
da conclusão não repõe uma entrada entretanto retirada manualmente pelo editor.

O writer de Últimas dos pacotes antigos mantém o seu código. Não foram alterados
Home, páginas públicas, cartões, CSS, dependências, produção antiga ou pacotes.
`next-env.d.ts` não integra o commit. Não há limpeza nem backfill.

## Migrações delimitadas

Aplicar apenas estas duas, nesta ordem, com os hashes SHA-256 da entrega final:

1. `supabase/migrations/20260917210000_newsroom_mesa_intent_preparation_v1.sql`:
   a preparação existente, sem alteração nesta etapa. Tabela de preparações e
   funções de normalização, leitura autoritativa e preparação transacional.
2. `supabase/migrations/20260917213000_newsroom_mesa_intent_publication_v1.sql`:
   tabelas de finalizações/recibos, índices, funções de publicação, colocação em
   Últimas, finalização e leitura de recibos; trigger de proteção. Substitui só
   o helper privado de captura e o dispatcher V2 já delimitados na etapa SQL.
   O preflight confirma as dependências de Últimas e a definição esperada do
   dispatcher, antes de criar objetos. Tudo corre dentro de BEGIN/COMMIT.

Não aplicar automaticamente outras migrações pendentes do repositório. Se o
catálogo do projeto ou o histórico de migrações divergirem, interromper e
identificar a divergência; não contornar as guardas. Conferir depois apenas o
catálogo, os objetos previstos e os privilégios, sem abrir páginas de produção
para testes nem extrair artigos. A confirmação Vercel deve ser feita pelos
metadados do deployment e SHA do commit, não por uma navegação ao site.

## Testes acrescentados e repetidos

- `newsroom-mesa-admin-entry.test.ts`: middleware, matcher e login/logout reais.
  Segredos gerados apenas para o ensaio, fetch proibido. Sem sessão, cookie
  forjado, segredo incorreto, sessão expirada e configuração ausente são
  recusados; sessão válida, cookie protegido e regresso interno são verificados.
- `newsroom-mesa-latest-placement.test.ts`: transporte, limites, identidade,
  jornada nula, payload e resultado do RPC (14 casos).
- `.ci/mesa-intents-sql/latest-boundary.mjs`: 14 cenários da API e SQL reais,
  incluindo Últimas e banco editorial, concorrência, rollback, imagens/títulos,
  timezone, permissões, adulteração, atualização e compatibilidade legado.
  Dois cenários usam processos PostgreSQL separados e verificam em
  `pg_stat_activity` que a segunda transação está efetivamente à espera de um
  lock: mesma Produção e Produções diferentes na mesma jornada.
- `.ci/mesa-intents-sql/latest_bootstrap.py`: tabelas auxiliares sintéticas e
  definições literais das funções existentes de Últimas, banco e downstream.
  Grava os hashes das definições carregadas. Não importa dados de produção.

Numa base local nova e inicialmente vazia: 38 grupos SQL, 14 cenários de Últimas,
10 percursos internos da aplicação e 48 comparações de planos SQL/TypeScript
passaram. O conjunto Node tem 265 testes aprovados; TypeScript e build locais
passaram. Relatórios e hashes são fornecidos com o commit local.

## Limites e bloqueio de publicação

O transporte PostgREST é o adaptador estrito para PostgreSQL descartável; as
funções, os writers e os triggers de Últimas/banco são reais. Não é uma prova de
renderização de toda a Home ou de todos os perfis físicos públicos. O middleware
é executado diretamente com `NextRequest`: não se apresenta como uma sessão
end-to-end num servidor Next hospedado.

Os testes visuais nativos existentes passaram no CI da base `ff132f6`. Ao tentar
repeti-los neste ambiente local, o navegador recusou a navegação com
`ERR_BLOCKED_BY_ADMINISTRATOR`. Isso não é sucesso, nem prova de regressão na
aplicação. O workflow final mantém os testes nativos e rejeita o modo de
diagnóstico com armazenamento/clipboard/navegação simulados. Esses testes têm
de passar no CI sobre a correção final antes de a considerar pronta.

As ações de escrita não estão expostas pelo conector GitHub desta sessão;
leituras e verificação de permissão admin funcionam. A tentativa Git de rede
falhou por resolução do host, antes de qualquer escrita. Por isso este commit
local não equivale a commit/push na branch. O patch e bundle incremental da
entrega preservam a alteração sem refazer ou substituir a história remota.
