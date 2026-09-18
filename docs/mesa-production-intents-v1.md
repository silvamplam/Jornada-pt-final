# Mesa: decisões de produção por contexto

Estado: fundação, preparação e publicação SQL implementadas e testadas; ainda não ligadas à aplicação.
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
UPDATE e SEM ALTERAÇÃO registam a captura revista; NEW só estabelecece a captura
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

## Implementado: publicação e finalização SQL

Migração candidata, ainda NÃO aplicada na Supabase:
`supabase/migrations/20260917213000_newsroom_mesa_intent_publication_v1.sql`.
O conteúdo foi recuperado do blob `51423a4ce7301f1f10d69da80670b229efaedd81`
e ensaiado sem alterações, em PostgreSQL 17.6 descartável.

- Acrescenta finalizações e recibos por Tema/artigo, com RLS e acesso de escrita
  exclusivamente através dos RPCs de servidor.
- `newsroom_publish_mesa_intent_output_v1` verifica o plano congelado, pacote,
  contexto, fontes e conteúdo do alvo antes de escrever. UPDATE preserva ID,
  slug, scope, competição, época, jornada nula ou preenchida, data de publicação,
  legenda e imagem anterior quando não for pedida substituição.
- `newsroom_finalize_mesa_intents_v1` só conclui o conjunto exato de resultados.
  SEM ALTERAÇÃO não reescreve artigos. Publicação parcial não cria recibos de
  conclusão nem marca os restantes artigos como revistos.
- Repetições não duplicam artigos ou eventos. Conteúdo divergente e edição
  manual entretanto são conflitos. Os writers e o finalizador bloqueiam o
  mesmo workspace; a finalização espera por uma publicação em curso.
- NEW gera recibo apenas para o artigo novo associado ao próprio Tema. Fonte
  independente continua independente; não recebe uma associação implícita.
- `newsroom_mesa_intent_latest_receipts_v1` ordena pela captura, não pela ordem
  de conclusão. Terminar um trabalho antigo depois não faz recuar o histórico.

A migração altera exatamente duas funções existentes: o helper privado de
captura passa a incluir snapshotFingerprint; o dispatcher
`newsroom_mesa_consolidate_publication_v2` não fecha genericamente preparações
com productionIntents. O consolidator V4 e o publisher legado ficam intactos.
Um novo trigger impede que esse publisher legado escreva nos novos planos sem
as verificações e o registo de integridade próprios dos intents.

O preflight recusa ausência das autoridades e uma definição inesperada do
dispatcher. Não há limpeza nem backfill de produções ou pacotes anteriores.
As chaves externas das tabelas novas preservam os registos referenciados com
ON DELETE RESTRICT. A migração final exige autorização antes de produção.

## Validação reproduzível desta etapa SQL

`.ci/mesa-intents-sql/publication.py` executa primeiro a suite de preparação,
carrega o SQL de publicação e depois ensaia os writers e finalizadores reais.
Não aceita URL nem credenciais. O ensaio local usa somente socket Unix, sem
listeners TCP, com criação de sockets IPv4/IPv6 bloqueada também nos testes Node.
O CI mantém PostgreSQL com `--network none` e Node num namespace sem rede.

Resultado da execução completa numa base inicialmente vazia:

- 38 grupos SQL: 20 de preparação e 18 de publicação/finalização, zero falhas.
- 48 planos de leitura reais comparados com o planeador TypeScript.
- 160 testes Node, verificação TypeScript e build de produção aprovados.
- A suite SQL 2C anterior volta a passar depois da migração.
- Comparação de todas as definições/ACL/configurações das funções existentes:
  só mudam as duas funções declaradas acima.
- Teste comportamental do publisher legado: continua a publicar e consolidar
  produções 2C antigas; é bloqueado apenas nas preparações novas com intents.

A suite cobre UPDATE com jornada nula, NEW, SEM ALTERAÇÃO, ciclo apenas sem
alterações, edição manual antes/depois da escrita parcial, fontes/pacotes
adulterados, retry, concorrência, falha tardia no recibo, falha no sync, captura
antiga concluída mais tarde e a sequência NEW sem revisão → revisão posterior.
O caso misto verifica também que o novo artigo independente fica fora do Tema.

O sync V15 de artigos e dois helpers são carregados literalmente do repositório,
contra tabelas auxiliares sintéticas. São verificadas atualizações em destaque,
banco editorial e snapshot de continuidade. A projeção completa de posições
físicas/perfis NÃO é coberta por este ensaio: funções sentinela falham se esse
percurso for alcançado, em vez de o simularem como sucesso.

Estes resultados são ensaios SQL e de compatibilidade, NÃO testes da futura
interface nem do pacote/retorno integrado. O relatório guarda hashes SHA-256
do SQL e dos runners; o workflow guarda o commit ensaiado e os logs.
O workflow temporário de transferência de ferramentas foi retirado; mantém-se
`mesa-production-intents-sql.yml` como validação reproduzível.

## Ainda não implementado — não ativar o novo fluxo

1. Contrato productionIntents nos adaptadores, API, workspace, pacote editorial,
   retorno do texto e publicação da aplicação. Não reutilizar themeContinuity
   como se tivesse a mesma semântica de vários contextos e revisão opcional.
2. Escolhas na faixa de seleção e na página do Tema, com erros contextualizados
   e seleção preservada. Manter os cartões, cores e dimensões aprovados.
3. Testes integrados de navegador dos modos, adiamento, incorporação parcial,
   associação sem produzir, Tema sozinho e NEW seguido de revisão posterior.
4. Autorizar a migração final só depois da integração completa e testada;
   aplicar ao projeto correto, integrar o PR e confirmar o commit no deployment.

As rotas públicas/admin e a publicação em lote não foram alteradas nesta etapa.
O problema operacional no site ainda não fica corrigido com esta entrega SQL.
Não houve consulta nem alteração da Supabase de produção.
