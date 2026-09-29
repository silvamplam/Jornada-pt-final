# Validação

## Resultados

| Bateria | Resultado | Classificação |
|---|---|---|
| Focada: serviço canónico, freeze, previews A2, slugs, pacote/importação, lote e workspace | 175 testes: **174 passam, 0 falham, 1 skip** | Skip: auditoria histórica opcional de âmbito A2, dependente de variável de ambiente |
| Alargada, sem A3: 76 ficheiros | 1028 testes: **1022 passam, 5 falham, 1 skip** | Cinco contratos estruturais pré-existentes, reproduzidos na main isolada |
| A3, mantida separada | 21 testes: **13 passam, 7 falham, 1 skip** | [Análise individual](A3.md); mesmos resultados na main; baseline inalterado |
| Typecheck focado, incluindo dependências transitivas dos ficheiros alterados | **Passa** | `tsc --noEmit --project out/image-freeze/tsconfig.json` |
| `git diff --check` | **Passa** | Sem erros de whitespace |
| PostgreSQL 17 local, migration real | **Passa** | Guardas, proveniência, privilégios, promoção estreita, triggers laterais, idempotência, rollback |
| Navegador, componente de confirmação real | **Passa** | A → alteração da origem → retry A → nova ação B; sem erros de consola |
| Navegador, importador direto real | **Passa** | Campo vazio antes da confirmação; retry A; nova candidata B não substitui o campo até confirmação |
| Snapshot histórico repetido | **Passa** | Mesmo manifest/hash; zero novas descargas e zero mutações remotas |

As baterias focadas foram repetidas após as últimas alterações do importador. A bateria alargada foi usada para encontrar contratos antigos e regressões; as asserções alteradas por esta implementação foram corrigidas para o novo comportamento e repetidas na bateria focada. Não foi alterado nenhum dos cinco testes pré-existentes abaixo nem o baseline A3.

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
