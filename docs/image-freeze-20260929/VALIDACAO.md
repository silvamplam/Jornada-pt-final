# Validação

## Resultados

| Bateria | Resultado | Classificação |
|---|---|---|
| Focada: serviço canónico, freeze, previews A2, slugs, pacote/importação, lote e workspace | 175 testes: **174 passam, 0 falham, 1 skip** | Skip: auditoria histórica opcional de âmbito A2, dependente de variável de ambiente |
| Alargada, sem A3: 76 ficheiros | 1028 testes: **1022 passam, 5 falham, 1 skip** | Cinco contratos estruturais pré-existentes, reproduzidos na main isolada |
| A3, mantida separada | 21 testes: **13 passam, 7 falham, 1 skip** | [Análise individual](A3.md); mesmos resultados na main; baseline inalterado |
| Typecheck focado, incluindo dependências transitivas dos ficheiros alterados | **Passa** | `tsc --noEmit --project out/image-freeze/tsconfig.json` |
| `git diff --check` | **Passa** | Sem erros de whitespace |
| PostgreSQL 17 local, duas migrations reais e três fases A/B/C | **Passa** | FOUNDATION compatível com main antiga; aplicação nova completa antes da ACTIVATION; guarda transversal depois da ACTIVATION |
| Navegador, componente de confirmação real | **Passa** | A → alteração da origem → retry A → nova ação B; sem erros de consola |
| Navegador, importador direto real | **Passa** | Campo vazio antes da confirmação; retry A; nova candidata B não substitui o campo até confirmação |
| Snapshot histórico repetido | **Passa** | Mesmo manifest/hash; zero novas descargas e zero mutações remotas |

As baterias focadas foram repetidas após as últimas alterações do importador. A bateria alargada foi usada para encontrar contratos antigos e regressões; as asserções alteradas por esta implementação foram corrigidas para o novo comportamento e repetidas na bateria focada. Não foi alterado nenhum dos cinco testes pré-existentes abaixo nem o baseline A3.

## Revalidação da correção de rollout

Ordem testada: **FOUNDATION → deploy da aplicação compatível → ACTIVATION**. A migration existente `20260929084410_editorial_image_authority.sql` passa a ser apenas FOUNDATION. A nova `20260929101014_editorial_image_authority_activation.sql` contém exclusivamente a função de guarda, os privilégios dessa função e o trigger, dentro de uma transação. Não se alterou runtime, preserve ou regra final.

`scripts/verify-editorial-image-authority.cjs` executa as fases separadamente numa base PostgreSQL **17.11**, local e descartável, chamada `image_freeze_test`:

| Fase | Prova executada | Resultado |
|---|---|---|
| A — main antiga + FOUNDATION | Ausência da função/trigger de guarda; NEW externa, NEW de upload local sem recibo, UPDATE e draft → published não exigem o registo novo | **Passa** |
| B — aplicação nova + FOUNDATION | `verify-editorial-image-foundation.ts` executa freezer real, quatro previews, retry A após origem B, nova decisão B, decisões/recibos e RPC de confirmação no PostgreSQL sob `service_role`; serviço canónico real cria/atualiza local, rejeita NEW externo e nova substituição externa, permite preserve exato; promoção image-only funciona sem efeitos laterais e é idempotente | **Passa**, trigger ainda ausente antes e depois |
| C — aplicação nova + FOUNDATION + ACTIVATION | Trigger ativo; SQL direto recusa NEW externa, local sem recibo, draft externo e substituição legacy por outra externa; aceita NEW local registada e preserve exato; promoção mantém os outros campos e não executa efeitos laterais; rollback multi-row, imutabilidade e privilégios continuam válidos | **Passa** |

A fase A representa as operações SQL da aplicação antiga; não é um E2E da interface antiga. A fase B utiliza os módulos reais da aplicação com transportes PostgreSQL; os bytes e derivados são sintéticos e os objetos de Storage ficam exclusivamente em memória. A/B/C usam funções laterais com efeitos observáveis para provar que image-only não os executa.

Adicionalmente, o teste compila **as três definições remotas reais e a função de classificação**, aplica localmente o mesmo patch da FOUNDATION e executa um UPDATE exclusivamente de imagem. Prova que owner/ACL/security-definer/search-path das três funções são preservados, os triggers diferidos não provocam efeitos e a classificação não recebe IDs alterados. Essa transação local termina em rollback; dependências downstream são fixtures. As definições, novamente lidas sem escrita remota, estão em [rollout-remote-functions.json](rollout-remote-functions.json). A função `jornada_private.refresh_automatic_classifications_from_articles_update` filtra identidade/label/title/subtitle/body/status, sem `image_url`.

Nesta correção foram novamente executados: **175 testes focados (174 passam, zero falhas, um skip opcional A2)**; **typecheck focado**, incluindo o novo teste TypeScript e dependências transitivas; **git diff --check**. Todos passam. Os resultados A3 permanecem separados e inalterados; não foi trocado o baseline nem repetida a bateria pública, pois nenhum renderer/runtime mudou nesta correção. Resultados resumidos: [rollout-validation.json](rollout-validation.json); logs locais em `out/image-freeze/rollout-*.txt`.

O runbook no RELATORIO exige um artefacto de migrations FOUNDATION que exclua ACTIVATION, confirmação da aplicação em produção e só depois o artefacto ACTIVATION. Um `db push` indiscriminado com ambos os ficheiros pendentes não respeita esta ordem. Nenhuma migration remota, staging, upload ou promoção foi executada.

## Falhas pré-existentes fora de A3

| Teste | Expectativa antiga | Prova na main |
|---|---|---|
| `editorial-matchday-profile-manual-overrides.test.ts`: API temática | `validateMatchdayEditorialProfileManualOverrides` na rota atual | 8 passam / 1 falha numa extração da main |
| `editorial-matchday-profile-workspace-migration.test.ts`: paginação Faixa | `trackingVisibleCounts` no componente atual | Mesma falha na main |
| `editorial-thematic-workspace-apply-token-cache.test.ts`: rota v11 | RPC `...v11` no contrato atual | Mesma falha na main |
| `editorial-thematic-workspace-continuity-apply.test.ts`: Apply | RPC antiga no contrato atual | Mesma falha na main |
| `newsroom-mesa-scoped-egress.test.ts`: hidratação | `identityWindow.slice(0, input.pagination.limit)` | Mesma falha na main |

Os últimos quatro ficheiros, executados juntos na main, têm 28 testes: 24 passam e 4 falham. A cópia foi obtida por `git archive origin/main` em `out/image-freeze/main-audit`; não se abriu outra branch nem se alterou a main. Logs: `main-preexisting-tests.txt` e `main-manual-overrides-tests.txt`, no mesmo diretório de evidências locais.

## Cobertura dos requisitos

| Requisito | Evidência |
|---|---|
| NEW externo bloqueado; local aceite | Serviço canónico, `editorial-image-freeze.test.ts`, trigger SQL real |
| A congelado; origem muda B; retry conserva A/hash/path | Teste dedicado e duas verificações no navegador |
| Nova obtenção explícita cria B/hash/path diferente | Teste dedicado; UI de congelamento e importador direto |
| Proveniência original preservada | Decisões por origem, confirmação do Dossiê e auditoria SQL de promoção |
| UPDATE escolhe nova imagem | Autoridade rejeita referência externa diferente; freezer produz local; SQL aceita local registada |
| UPDATE legacy preserve | Serviço e SQL aceitam apenas a referência exata do mesmo artigo já publicado |
| Retry não duplica objetos | Cinco objetos por hash; decisão persistida antes da rede; teste A/B e deduplicação |
| Upload realizado, persistência falha | Retry usa candidata persistida, sem voltar à origem; teste de recuperação |
| Upload histórico falha após bind | Recuperação só de cache local com SHA validado; B é recusado |
| Preview falha | Original A intacto; retry gera apenas os derivados em falta |
| 320/640/960/1280 e renderer | Dimensões WebP reais, naming, `publicEditorialImageSources`, regressões A2/A3 funcionais |
| Cache e imutabilidade | POST, `x-upsert:false`, `max-age=31536000`, conflito reutilizado sem overwrite |
| SSRF e redirects | DNS privado recusado, endereço validado fixado na ligação, redirects revalidados e limitados |
| Não-imagem, MIME, limites | Decode Sharp real, MIME incompatível, 404, stream acima de 8 MiB, URLs proibidas |
| Atomicidade editorial | SQL multi-row faz rollback; preflight de todas as imagens antes do lote de continuidade; cada RPC mantém transação própria |
| Dry-run sem alteração editorial | Execução remota só de leitura; métricas e manifest repetido; nenhum RPC de promoção chamado |
| Promoção altera exclusivamente imagem | Comparação SQL de toda a linha menos `image_url`; `updated_at` incluído na comparação; auditoria separada |
| Composição, fontes e contexto intactos | Teste das três funções trigger com efeitos laterais; image-only faz early return; statement trigger existente já filtra campos editoriais |
| Contaminada/duvidosa | Plano rejeita `rejected`, `uncertain`, hash divergente, aprovações duplicadas ou revisor vazio |
| Mesa/intents/continuidade/manual/Article Plans | Bateria alargada e guards nos serviços/writers; todos sujeitos ao trigger final |

## Limites da validação

Não houve deploy, migration em produção, upload histórico, publicação de um artigo real nem promoção histórica. A base SQL de teste é mínima e isolada: verifica a migration e os contratos relevantes, não substitui um ensaio integral de todas as migrations numa staging Supabase. O navegador usou componentes reais e gerador real com DB/Storage em memória; não se afirma um E2E autenticado em produção.

Capturas locais: `out/image-freeze/confirm-A.png`, `confirm-B.png`, `import-confirm-B.png`, `iol-review.png`. A imagem A sintética tem SHA `dd9f39821f67bc44606d8940a285509b1f48e37e019992f02a3ed28eb040a8c5`; B tem SHA `62f82cc720b3da656fc9712792ad2011c5254e8b6ecc89ed0f51dd25d5c9d321`.
