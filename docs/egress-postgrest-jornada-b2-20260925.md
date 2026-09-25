# Jornada.pt — B2: estrutura da Jornada pública

- Branch: `jornada-egress-postgrest-jornada-b2-20260925`.
- Base confirmada após fetch: `5be22501f79eb2d2e8f3bb84c290182b31d5a350` (a esperada).
- Revisão de entrega: o commit desta branch que contém este relatório; obter o SHA com `git rev-parse origin/jornada-egress-postgrest-jornada-b2-20260925`. O SHA literal é também comunicado na entrega.
- Trabalho num worktree separado: `C:/Users/silva/Documents/Codex/jornada-egress-postgrest-jornada-b2-20260925-wt`. As alterações e os quatro artefactos não rastreados do diretório original foram preservados.
- Node efetivo: 24.19.0; Next efetivo: 15.5.22. Nenhuma dependência adicionada ou atualizada.

## Arquitetura

Antes, `getPublicMatchdayDiagnostic()` fazia todas as leituras por visita, incluindo estrutura, jogos e editorial. O menu voltava a ler competições e épocas.

Agora, só a página `/competicoes/[competitionSlug]/[seasonLabel]/jornadas/[matchdayNumber]` cria `createPublicMatchdayStructuralReaders()`. Passa os seus readers opcionais ao diagnóstico e ao menu. Os consumidores que não fornecem esses readers mantêm exatamente o percurso fresco anterior, incluindo B1, Home, páginas de jogos e editorial.

O novo módulo `lib/public-matchday-structural-context.ts` usa o Data Cache server-side do Next, através de `unstable_cache`. Não é apenas memoização React por request. A página mantém `dynamic = "force-dynamic"`; o build continua a identificá-la como dinâmica (`ƒ`). A API foi confirmada na [documentação Next 15](https://nextjs.org/docs/15/app/api-reference/functions/unstable_cache) e na implementação instalada.

### Fronteira de cache e TTL

| Leitura | Cache persistente | TTL / razão |
| --- | --- | --- |
| Competições ativas e todos os seus metadados | Não | `is_active` tem efeito imediato. A promessa do catálogo é partilhada só dentro da instância criada pela página. |
| Épocas da competição | Sim | 300 s. Identificação, rótulo, datas e indicação de época corrente; não contém jogos nem resultados. |
| Épocas para o menu de competições | Sim, entrada separada | 300 s. A escolha de época em função da data continua a ser calculada por request. |
| Jornadas da época, incluindo status/context_summary | Não | Alterações de número/época afetam o conjunto de jogos considerado na classificação; evita também cachear status/contexto. |
| Participantes (`season_teams`) | Não | Status, associação e autoridade manual podem alterar navegação e participantes da classificação. |
| Metadados das equipas referenciadas | Sim | 600 s. Nome público/nome/nome curto/código/slug/país/logo/cor; sem resultado nem estado competitivo. |
| Metadados dos canais referenciados | Sim | 600 s. Nome/plataforma/país/logo; a associação canal↔jogo continua fresca. |
| Matches atuais e acumulados da época | Não | Scores, status, minute, kickoff e relógio continuam no-store por request. |
| Editorial, publicação, composição, continuidade, zonas históricas e publicidade | Não | Nenhum atraso novo de publicação/Apply. |

Writers inspecionados, sem alterações: `app/api/admin/competitions/[id]/route.ts`, `seasons/[id]/route.ts`, `matchdays/[id]/route.ts`, `season-teams/[id]/route.ts`, `teams/[id]/route.ts`, `teams/[id]/public-name/route.ts`, `broadcast-channels/[id]/route.ts` e as operações correspondentes em `app/api/admin/gestor/route.ts`. Os 300/600 s são tolerâncias de apresentação para metadados, não tolerâncias para publicação, ativação ou classificação. A fronteira conservadora foi confirmada pelo utilizador durante o trabalho.

O Next usa stale-while-revalidate: a primeira visita depois do TTL pode receber o último valor válido e iniciar a atualização; uma visita após essa revalidação recebe o novo valor. TTL não é um limite absoluto de staleness em caso de indisponibilidade. Isso aplica-se exclusivamente às quatro entradas de metadados acima.

### Chaves, âmbito e leituras redundantes

- Chaves com namespace `public-jornada-structure-v1`, finalidade e URL do projeto; nunca incluem a service role.
- Épocas: chave por competição. Menu: catálogo próprio, com o limite existente de 500 linhas.
- Equipas/canais: IDs filtrados, deduplicados e ordenados **antes** da chamada cacheada; a query contém apenas esses IDs. Conjuntos vazios não fazem query. Não há leituras globais de equipas/canais nem uma chave por ordem dos IDs.
- O conjunto de equipas reúne participantes manuais e equipas dos jogos atuais; normalmente é reutilizável entre jornadas da mesma época. Mudanças reais no conjunto criam uma entrada distinta. O mesmo princípio aplica-se aos canais.
- O catálogo fresco de competições ativas usa a projeção necessária ao contexto e ao menu; a competição selecionada é retirada desse resultado. Elimina uma leitura no percurso normal.
- Competição inativa, inexistente, fora da janela de 100 competições do menu ou falha do catálogo: mantém a consulta scoped anterior por slug. A desativação não espera qualquer TTL.
- Mantêm-se duas consultas de épocas em cold: uma scoped por competição (limite 100), outra global para o menu (limite 500). A lista global truncada não permite provar que contém todas as épocas da competição. Evitou-se alterar essa semântica para poupar mais uma query.
- Nenhuma memoização request-local foi apresentada como cache persistente. O catálogo fresco e as quatro entradas persistentes têm responsabilidades distintas.

### Falhas e ausências

500, timeout, JSON inválido e linhas malformadas propagam erro para fora das funções cacheadas. Não são convertidos em `[]`/`null` dentro delas. Só são gravadas respostas válidas.

Listas vazias e conjuntos incompletos de equipas/canais lançam um erro interno de resposta incompleta; fora do cache recuperam-se as linhas válidas existentes. Assim, uma associação ausente continua degradável para `null`, sem fossilizar a ausência. A próxima visita pode recuperar imediatamente.

Uma época pedida que não consta de uma lista quente não vazia desencadeia uma leitura scoped fresca. Evita que a criação de uma época fique bloqueada por um `not found` derivado do cache. Essa leitura de recuperação não grava um resultado negativo.

Se uma revalidação falhar, o Next conserva o último valor **válido** e volta a tentar quando a entrada expirada for usada. O erro não substitui a entrada por um estado vazio. Este comportamento está testado e é um risco residual de frescura dos metadados durante indisponibilidade.

## Medição controlada

Transport HTTP interceptado, apenas fixtures sintéticas num host `.invalid`; qualquer acesso remoto não previsto falha. O helper real continua a enviar `cache: "no-store"`. A implementação real de `unstable_cache` é executada com stores de requests distintos (`forceDynamic: true`), um backend de Data Cache de teste partilhado e relógio controlado. Não se substituiu `unstable_cache` por uma função que simula hits.

| Cenário | Antes | B2 cold | B2 warm | Redução cold | Redução warm |
| --- | ---: | ---: | ---: | ---: | ---: |
| Diagnóstico simples + menu | 19 | 18 | 14 | 5,26% | 26,32% |
| Diagnóstico com composição/media + menu | 24 | 23 | 19 | 4,17% | 20,83% |
| Função da página real, composição de referência + leitura de autoridade editorial | 26 | 25 | 21 | 3,85% | 19,23% |
| Função da página real, incluindo zonas históricas dinâmicas | 28 | 27 | 23 | 3,57% | 17,86% |

São chamadas PostgREST dos percursos indicados, não uma previsão de bytes ou de Egress total do site. A execução da função da página inclui as suas leituras próprias, o diagnóstico, o menu, a RPC de autoridade editorial **já existente** e o fallback de perfil. A comparação da árvore React não executa as leituras de publicidade de componentes filhos; estas permanecem iguais e fora da otimização. Também não simula navegação/prefetch do browser.

Separação exata do cenário com zonas históricas:

| Categoria | Antes | Cold | Warm |
| --- | ---: | ---: | ---: |
| Estrutura | 8 | 7 | 3 |
| Live/classificação (`matches`) | 2 | 2 | 2 |
| Editorial/autoridade/composição/continuidade/zonas | 18 | 18 | 18 |
| Total | 28 | 27 | 23 |

As leituras estruturais diminuem 62,5% em warm (8 → 3). Permanecem frescas `competitions`, `matchdays` e `season_teams`. Desaparecem em warm as duas consultas `seasons`, a de `teams`, a de `broadcast_channels` e a repetição de `competitions` já eliminada em cold. Os números variam com entidades ausentes, fallback, associações vazias e composição; não são apresentados como contagem universal.

Nenhuma tabela editorial entra no cache: `matchday_editorials`, `matchday_highlights`, `matchday_roundup_items`, `matchday_latest_news`, `matchday_horizontal_news`, `matchday_live_layout_items`, `matchday_editorial_desk_control`, `matchday_reference_compositions`, `matchday_reference_composition_items`, `matchday_hierarchical_composition_slots`, `matchday_editorial_continuity_transitions`, `editorial_contents`, `matchday_historical_composition_zones`, `matchday_historical_composition_zone_items`, nem os readers de autoridade/perfil/artigos associados.

## Equivalência e frescura

Os testes compilam em memória a página e os readers do SHA base e da branch, sem reescrever a lógica, e comparam as árvores de apresentação cold e warm. Cobrem competição/época/Jornada, navegação, classificação, jogos, equipas/logos/TV, editorial, composição, continuidade e zonas históricas completas. CSS é inerte nessa comparação; um teste adicional prova que o ficheiro da página difere da base **apenas** na ligação dos readers. Nenhum markup, CSS ou componente visual foi alterado. Não foi feita validação visual num browser com dados reais.

Entre duas leituras warm, a fixture muda resultado, minuto, status, relógio, editorial e snapshots de composição. A segunda leitura devolve todos os novos valores e uma classificação atualizada, igual à leitura fresca. As zonas históricas também refletem uma alteração imediatamente. Participantes, status da Jornada e `is_active` são alterados em testes sem invalidar cache e aparecem na leitura seguinte.

Os testes de comparação Git exigem o SHA base disponível no histórico local; em checkout superficial que não o contenha são explicitamente skipped. Na validação desta entrega todos os testes B2, incluindo esses, foram executados.

## Validação

- B2: `npx tsx --test lib/public-matchday-structural-context.test.ts` — **29/29 passaram**, zero skips.
- Suite pública: 41 ficheiros; **344 testes: 339 passaram, 4 falharam, 1 skip preexistente**. O skip é o audit opcional de release B1, sem `JORNADA_EGRESS_B1_BASE`.
- As quatro falhas foram reproduzidas no worktree limpo da base: 45 testes nos três ficheiros afetados, **41 passaram / as mesmas 4 falharam**. Nenhuma foi corrigida por estar fora do B2.
- `npx tsc --noEmit` — passou.
- `npm run build` — passou; rota permanece dinâmica. Avisos de Autoprefixer (`start`/`end`) e serialização de warnings do webpack em CSS admin não alterado; sem erro de build.
- `next-env.d.ts` não foi alterado pelo build; não integra o commit.
- `git diff --check` — passou.
- Build sem configuração/credenciais Supabase; nenhum Supabase remoto consultado ou modificado.

Falhas anteriores:

1. `lib/public-broadcast-channel-logo.test.ts`: expectativa antiga sobre resolução do logo/layout da Jornada.
2. `lib/public-header-mascot.test.ts`: expectativa de `<strong>Data:</strong>`.
3. `lib/public-home-editorial-responsive-layout.test.ts`: expectativa de abertura em três colunas.
4. Mesmo ficheiro: expectativa de cor da barra/cartões.

Comando da suite pública (PowerShell):

```powershell
$testsB2 = @(rg --files lib -g 'public-*.test.ts' -g 'postgrest-egress-contracts.test.ts' -g 'editorial-historical-composition-public-dynamic.test.ts' -g 'editorial-historical-faixa-public-title.test.ts' -g 'matchday-public-reader-json-null.test.ts')
npx tsx --test @testsB2
```

## Ficheiros e âmbito

- `lib/public-matchday-structural-context.ts`: readers, fronteira de cache, validação e reutilização do catálogo fresco.
- `lib/public-matchday.ts`: readers estruturais opcionais; o percurso default, matches e editorial mantêm-se frescos.
- `lib/public-competition-menu.ts`: readers opcionais; seleção/ordem do menu inalteradas.
- `app/competicoes/[competitionSlug]/[seasonLabel]/jornadas/[matchdayNumber]/page.tsx`: ligação aos readers B2; nenhuma alteração visual.
- `lib/public-matchday-structural-context.test.ts`: contratos, transporte, equivalência, TTL e frescura.
- `lib/__fixtures__/public-matchday-structure/next-cache.ts`: Data Cache controlado com implementação Next real.
- `lib/__fixtures__/public-matchday-structure/page.ts`: fixtures e execução da página da base/branch.
- Este relatório.

Zero SQL/migrations/RPC nova. Zero alteração do helper Supabase global, admin, publicação, regras editoriais, A1/A2, Storage/imagens, B1, Home, logos ou outros renderers públicos. Nenhuma fila, cron ou infraestrutura nova. Nenhum merge. O único cache novo é usado explicitamente pela página alvo.

## Riscos residuais e B3

- Rótulos/datas de épocas e nomes/logos/canais podem apresentar o último valor válido durante TTL/SWR; falhas prolongadas de revalidação podem prolongar essa apresentação. Resultados, ativação e publicação não dependem destes TTLs.
- Conjuntos diferentes de IDs geram entradas diferentes; ordenar/deduplicar elimina permutações, mas mudanças reais de participantes/jogos/canais podem reduzir a taxa de hit. Ausências reais são consultadas de novo, deliberadamente.
- Sem invalidação explícita neste lote. O cache é da plataforma Next e depende do seu backend de Data Cache; não foi medida taxa de hit em produção ou numa instância Vercel.
- Cold poupa apenas a leitura redundante de competição. O ganho principal depende de visitas com estrutura quente.
- O volume editorial continua predominante e fresco: candidato B3 é reduzir as suas leituras redundantes e definir uma invalidação explícita, cobrindo publicação/Apply/continuidade, antes de considerar cache editorial. Publicidade, B1 e outros hotspots permanecem separados.
- As quatro falhas estáticas anteriores da suite pública continuam pendentes fora deste lote.
