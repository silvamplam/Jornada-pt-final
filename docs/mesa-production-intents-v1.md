# Mesa: decisões de produção por contexto

Estado: fundação e preparação SQL implementadas; ainda não ligadas à aplicação.
Base: `6367ed98d6062dfaf5516904e214a4b6acbd03be`.
Branch: `jornada-mesa-producao-intencoes-continuidade-v2-20260917`.
PR #333 permanece em rascunho. Não integrar antes do circuito completo.

## Regra editorial aprovada

- Só um Tema com artigos Jornada efetivamente publicados permite escolher:
  revisão sem novos; revisão com novos; ou apenas novos sem revisão.
- Um Tema sem publicados segue o percurso de artigos novos. A futura interface
  não apresenta uma escolha de revisão sem alvos publicados.
- Fontes selecionadas têm destino explícito: incorporar num Tema, produzir
  independentemente ou deixar para depois. Selecionar não associa material.
- Um Tema pode ser deixado para depois sem bloquear uma fonte independente.
- Fontes novas não criam implicitamente um artigo novo por fonte.
- Todos os publicados permanecem como referência no seu próprio contexto.
  Apenas a revisão pedida cria trabalhos `EXISTING_*`.
- UPDATE mantém identidade, endereço e contexto do artigo, incluindo jornada
  nula. NEW não substitui os artigos anteriores.
- Não revisto nunca equivale a SEM ALTERAÇÃO.

## Implementado: fundação pura

`lib/redacao-automatica/newsroom-mesa-production-intents.ts` resolve pedidos
editoriais a partir de autoridades fornecidas pelo servidor. Não realiza I/O.
Tem 57 testes de comportamento, incluindo matriz de 72 combinações.

A projeção de recibos por `(Tema, artigo)` está testada EM MEMÓRIA:
UPDATE e SEM ALTERAÇÃO registam a captura revista; NEW só estabelece a captura
inicial do novo artigo. Uma produção antiga concluída mais tarde não faz recuar
a referência. Histórico ausente ou ambíguo dá UNKNOWN, não UNCHANGED_SOURCE.

## Implementado: preparação transacional PostgreSQL

Migração candidata, ainda não aplicada na Supabase:
`supabase/migrations/20260917210000_newsroom_mesa_intent_preparation_v1.sql`.

Acrescenta uma tabela e quatro funções, sem alterar funções existentes:

- `newsroom_mesa_intent_preparations`: pedido normalizado, captura, fingerprint
  e plano congelado com IDs reais. RLS e FORCE RLS; acesso direto apenas de
  leitura por service_role. Escritas são realizadas pela função de preparação.
- `newsroom_mesa_normalize_intent_v1(jsonb)`: função privada de validação estrita,
  normalização dos IDs e ordenação determinística da seleção.
- `newsroom_mesa_intent_source_v1(uuid)`: função privada de captura da fonte.
- `newsroom_mesa_preview_intents_v1(jsonb)`: leitura autoritativa sem escritas;
  devolve uma linha `{plan}` e identifica fontes, histórico e trabalho pedido.
- `newsroom_prepare_mesa_intents_v1(jsonb,text)`: relê e valida a autoridade,
  associa apenas o material escolhido e cria contextos e Article Plans numa
  única transação. Devolve uma linha `{result}` com dossierId e plano persistido.

O writer reutiliza os RPCs reais de preparação 2C e os writers de Article Plans.
Os slots recebem outputId e productionContextId reais. A fotografia original
completa dos artigos fica no contexto, mesmo em produções de novos sem revisão.
A ligação ao workspace é guardada em `selection_payload.productionIntents`.

A comparação inclui IDs exatos dos snapshots, conteúdo e metadados das fontes,
classificações, associação ao Tema e conteúdo completo dos publicados. A simples
passagem do tempo entre duas leituras não muda o fingerprint. O fingerprint SQL
é autoritativo; o adaptador não deve recalculá-lo com JSON.stringify, cujo formato
não é o formato canónico de jsonb usado pelo PostgreSQL.

A preparação bloqueia as autoridades relevantes e usa o lock de organização
já existente. A chave repetida com o mesmo pedido e fingerprint recupera o plano
persistido; uma escolha diferente com a mesma chave é rejeitada. A associação
criada pela primeira tentativa não invalida o seu próprio replay.

Os limites continuam em 20 contextos, 20 fontes distintas e 30 resultados por
Produção; nenhum material ou histórico é truncado para caber nesses limites.
As classificações requeridas pelo writer existente continuam a ser verificadas.

A preparação utiliza o snapshot mais recente JÁ GUARDADO. Não realiza nova
recolha da página de origem. Um snapshot recente sem conteúdo utilizável é
assinalado, não substituído silenciosamente por outro antigo.

## Testes da preparação

`.ci/mesa-intents-sql/run.py` carrega as fundações e migrações reais num PostgreSQL
17.6 descartável, com dados sintéticos e sem rede. Recusa URL, hostname de rede,
credenciais ou um projeto Supabase. Exige a base vazia mesa_organization_test.

Os 20 grupos de testes incluem os três modos, Tema sem publicados, rascunho,
Tema + fonte independente, incorporações parciais, dois pedidos concorrentes,
falha injetada depois da associação e criação de planos, alterações de snapshot
e corpo antes da escrita, contexto nulo, limites, permissões e compatibilidade.
As definições e permissões dos RPCs antigos são comparadas antes/depois.
A suite SQL 2C existente também é executada sem alterar os seus contratos.

`.ci/mesa-intents-sql/compare.ts` compara os 22 planos de leitura reais exportados
pelo ensaio com o planeador TypeScript, para detetar divergências de semântica.
Não valida apenas padrões de texto no ficheiro SQL.

O workflow `mesa-production-intents-sql.yml` executa estes ensaios, os 160 testes
Node focados, TypeScript e build. O PostgreSQL corre com `--network none` e os
testes/build Node num namespace sem rede externa, sem credenciais Supabase.
O artefacto mesa-intents-preparation-evidence guarda os resultados do commit.

## Ainda não implementado — não ativar o novo fluxo

1. Finalização transacional e persistência dos recibos por Tema/artigo. A nova
   preparação NÃO escreve recibos de revisão nem eventos de publicação.
2. Contrato persistido validado nos adaptadores, API, pacote editorial e retorno
   do texto. Referências e fontes não podem atravessar os contextos.
3. Escrita de UPDATE com nova verificação da fotografia do artigo antes de o
   alterar; publicação parcial, retry e SEM ALTERAÇÃO sem reescrita.
4. Ligação das escolhas à faixa de seleção e à Produção. Manter os cartões,
   cores, tipografia e dimensões já aprovados. Mostrar erros contextualizados.
5. Testes integrados e de navegador do percurso Mesa → Produção → pacote →
   retorno → publicação, incluindo NEW hoje e revisão dos antigos depois.
6. Delimitar e autorizar a migração final antes da aplicação, integração do PR
   e confirmação do deployment. Preservar pacotes e produções V1 existentes.

As rotas públicas/admin e a publicação em lote não foram alteradas nesta etapa.
A falha que o utilizador encontra no site NÃO está corrigida só com este módulo
SQL. Os testes de preparação não são testes de publicação nem de interface.
