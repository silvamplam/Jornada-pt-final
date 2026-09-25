# Jornada.pt — B1: contexto mínimo da notícia

Branch: `jornada-egress-postgrest-noticia-b1-20260925`.
Base confirmada após fetch: `d4baf251bff8cef4cf84716a6113997cf5e671d3` (A1/A2 integrados).
O SHA final é indicado na entrega da conversa e consultável em `git rev-parse HEAD`.

Worktree isolada: `C:/Users/silva/Documents/Codex/jornada-egress-postgrest-noticia-b1-20260925-wt`.
As três alterações tracked e os quatro artefactos untracked do diretório original foram preservados. Sem reset, sem transporte de alterações de outra feature e sem merge.

## Alteração

`/noticias/[slug]` passa a chamar `readPublicArticleMatchdayContext()` de `lib/public-article-matchday-context.ts`. A página deixa de importar/chamar `getPublicMatchdayDiagnostic()` e remove o reader local antigo. Conserva `seasonLabelToUrlSegment()` como função de formatação existente.

O novo tipo `PublicArticleMatchdayContext` é próprio e mínimo; não simula um `PublicMatchdayContext` completo. O helper global `fetchSupabaseAdminTable`, a Jornada pública e os modelos editoriais não foram alterados.

Shape final:

| Campo | Conteúdo |
|---|---|
| `competition` | id, name, slug, logo_url, is_active |
| `season` | id, competition_id, label |
| `seasons` | id, label, ordenadas por label descendente |
| `matchday` | id, season_id, number, label, starts_on, ends_on |
| `matchdays` | id, number, ordenadas por number ascendente |
| `activeParticipantCount` | Número de linhas com `status !== "inactive"` |
| `matchesForMatchday` | id, IDs de equipas/canal, scheduled_date, kickoff_at, status, minute, live_started_at, live_base_minute, is_clock_running, home_score, away_score; matchday com id/number; homeTeam/awayTeam/broadcastChannel |
| Equipas associadas | id, name, public_name, short_name, code, slug, logo_url |
| Canal associado | id, name, logo_url |

`is_active` é necessário para manter o contexto null de uma competição inativa. Não se acrescentaram campos de competição para cores: a notícia mantém a função de cor por slug que já usava.

Os participantes transferem só a coluna `status`, não objetos completos nem equipas para classificação. A contagem mantém a semântica JavaScript atual, incluindo null/outros estados como ativos. Conservam-se ordenação por display_order e limite 1000 do reader antigo; não foi introduzido HEAD/count que exigisse alterar o contrato do helper global. As projeções explícitas reduzem campos transferidos, conforme o [contrato select do PostgREST](https://docs.postgrest.org/en/stable/references/api/tables_views.html#vertical-filtering).

## Leituras que permanecem

Num contexto completo e sem erros/retries são **9 pedidos PostgREST**:

1. `matchdays`, por `article.matchday_id`, limite 1.
2. `seasons`, por `matchday.season_id ?? article.season_id`, limite 1.
3. `competitions`, por `season.competition_id ?? article.competition_id`, limite 1.
4. `seasons` da competição, só id/label, limite 100.
5. `matchdays` da época, só id/number, limite 100.
6. `season_teams` da época, só status, limite 1000.
7. `matches` da época **e Jornada atual**, limite 1000.
8. `teams` apenas para os IDs distintos presentes nesses jogos, limite 1000.
9. `broadcast_channels` apenas para os IDs distintos presentes nesses jogos, limite 500.

As leituras 4–7 são paralelas; 8–9 também. Sem IDs de equipas/canais, a respetiva query é omitida. Zero jogos dá **7 pedidos** e mantém header/nav. Sem um dos grupos de IDs dá **8 pedidos**. Artigo sem Jornada dá **0**. Entidades em falta terminam cedo. Falha numa leitura necessária devolve null, mantendo a notícia disponível.

A ordem dos jogos permanece `scheduled_date.asc.nullslast,kickoff_at.asc.nullslast,id.asc`. Equipas/canais ausentes ficam null, sem falhar o contexto.

## Leituras eliminadas

Deixam de ocorrer a segunda resolução da competição por slug, a reconstrução da época/Jornada por label/número, a query de jogos anteriores para classificação e o carregamento de equipas de participantes que não estejam nos jogos atuais.

O reader novo nunca consulta:

- `matchday_editorials`
- `matchday_highlights`
- `matchday_roundup_items` (incluindo a segunda consulta de referências)
- `matchday_latest_news`
- `matchday_horizontal_news`
- `matchday_live_layout_items`
- `matchday_editorial_desk_control` (incluindo fallback legado)
- `matchday_reference_compositions`
- `matchday_reference_composition_items`
- `matchday_hierarchical_composition_slots`
- `matchday_editorial_continuity_transitions`
- `editorial_contents` para headline/complement media

## Medição controlada

O teste executa o reader antigo congelado da base, incluindo o diagnóstico real existente, e o reader novo com o mesmo fetch simulado. Não é apenas uma contagem por regex. O transporte aplica filtros, projeções, ordenação e limites; só aceita o host sintético e não chama a rede.

| Cenário sintético | Iniciais antigas | Diagnóstico amplo | Contexto antigo total | Novo | Redução de pedidos do contexto |
|---|---:|---:|---:|---:|---:|
| Sem composição publicada/media | 3 | 17 | 20 | 9 | 55% |
| Com composição, referência de roundup e links de media | 3 | 22 | 25 | 9 | 64% |

A contagem antiga varia com composição/media e fallbacks de compatibilidade; não se apresenta um valor universal. Os retries transitórios de autenticação já existentes no helper também podem acrescentar tentativas HTTP; não foram alterados.

As contagens excluem o artigo, relacionados, menu de competições e publicidade. Não representam percentagem de redução de bytes nem redução garantida do Egress total do site. A transferência de campos também diminui, mas não foi estimada com dados reais.

## Autoridade e casos inconsistentes

- O matchday é resolvido pelo ID do artigo.
- O season_id do matchday prevalece sobre o do artigo; competition_id da season prevalece sobre o do artigo.
- Os IDs do artigo servem apenas de fallback quando o vínculo pai está null/ausente; strings vazias mantêm o comportamento falsy anterior.
- O reader verifica que a época/Jornada pertencem às listas scoped. Se um vínculo estiver realmente ausente, o fallback não inventa pertença: devolve null.
- Uma competição inativa, número de Jornada inválido ou entidade inexistente continua a produzir null.
- A antiga passagem por URL tinha uma ambiguidade: com labels de época ou números de Jornada duplicados, podia selecionar outro registo. B1 mantém o ID inicialmente resolvido, sem trocar silenciosamente de imagem/contexto editorial. O caso de número duplicado é demonstrado no teste: o antigo seleciona o primeiro número; o novo mantém o ID do artigo. Esta diferença restringe-se a dados inconsistentes; não houve reparação de dados.
- Mantêm-se os limites existentes de 100 épocas/jornadas e 1000 participantes/jogos. Um registo fora das listas limitadas não passa a gerar navegação incompleta silenciosamente.

## UI, frescura e âmbito

O teste de diff compara a página com a base e confirma igualdade do markup/CSS, helpers de datas, artigo, relacionados, publicidade e construção de todos os links. As únicas diferenças aí são imports/tipos, remoção do reader antigo e a chamada ao novo.

Os testes de equivalência comparam competition, season/seasons, matchday/matchdays, contagem ativa, todos os campos de jogos usados pelo strip, nomes públicos/logos, canais e resultado da navegação de voltas.

`force-dynamic` permanece igual. Todas as leituras usam o helper no-store existente; duas chamadas consecutivas nos testes fazem 18 pedidos e a segunda vê novo minuto/resultado. Nenhum cache persistente, `unstable_cache`, tag ou revalidate foi introduzido.

`PublicMatchStrip` não foi alterado. O código atual mantém relógio/estado local e tem o polling de resultados desativado; B1 não inventa nem reativa polling. Preserva os dados frescos de cada render da notícia e todos os campos live entregues ao strip.

Zero SQL/migrations/RPC/schema. Zero acesso ao Supabase remoto ou dados reais. Zero alterações à Home, Jornada pública, Mesa Viva, Composição, Article Plans, continuidade, classificação, publicação, publicidade, relacionados, menu de competições, Storage, logos ou pipeline A1/A2.

## Validação

- Testes B1: **22/22 passaram**, incluindo contagem real do transporte, projeções equivalentes, casos nulos, IDs, erros, paralelização e ausência de cache.
- Suite focada: **141 testes: 139 passaram, 2 falhas preexistentes, 0 ignorados**.
- Reproduzidas na base exata, executando apenas os dois ficheiros relevantes: **26 testes: 24 passaram, as mesmas 2 falhas**.
- Falha preexistente em `public-broadcast-channel-logo.test.ts`: “layout aprovado não depende de query parameter e a notícia sem jornada não recebe barra”, expectativa sobre `resolvePublicCompetitionLogoPresentation` na Jornada pública.
- Falha preexistente em `public-header-mascot.test.ts`: “a jornada usa faixa compacta sem boneco e os restantes contextos preservam a navegação partilhada”, expectativa antiga de `<strong>Data:</strong>`.
- Duas assertions em `public-broadcast-channel-logo.test.ts` foram adaptadas para procurar o guard de artigo sem Jornada no novo módulo; as falhas preexistentes não foram corrigidas.
- `npx tsc --noEmit`: passou.
- `npm run build`: passou, 67 páginas estáticas; avisos CSS/Autoprefixer em ficheiros não alterados.
- `git diff --check`: passou.
- `next-env.d.ts`: sem alterações.

Reprodução dos testes principais:

```powershell
$env:JORNADA_EGRESS_B1_BASE = 'd4baf251bff8cef4cf84716a6113997cf5e671d3'
npx tsx --test lib/public-article-matchday-context.test.ts
npx tsc --noEmit
npm run build
git diff --check
```

A lista da suite focada e logs estão em `b1-focused-files.log`, `b1-reader-tests.log`, `b1-focused-tests.log`, `b1-tsc.log`, `b1-build.log` (ignorados). Reprodução da base: `C:/Users/silva/Documents/Codex/jornada-egress-b1-base-validation-20260925/`.

## Validação visual e limitação

Foi servido um PostgREST sintético em loopback, sem credenciais reais. A notícia da base abriu no browser com header, logo, época, duas voltas, J04/J05/J06, datas, três jogos, resultados/minuto, artigo, cinco relacionados e publicidade. Sem erros JavaScript ou overlay. O servidor de fixtures contou 30 chamadas na página antiga: 25 de contexto mais artigo, relacionados, duas de menu e publicidade.

A revisão automática bloqueou o comando para arrancar o servidor local do build B1, devolvendo apenas “blocked by policy”. Não se contornou o bloqueio. Assim, a comparação visual antes/depois **não foi concluída**; a equivalência B1 está comprovada pelo transporte e diff estrutural, não por screenshots comparados. Os servidores/browser usados foram encerrados.

Captura e fixture local de validação: `C:/Users/silva/Documents/Codex/jornada-egress-b1-validation-artifacts-20260925/`. Não foram criados dados/sessões remotos nem contornada autenticação.

## Ficheiros da entrega

1. `app/noticias/[slug]/page.tsx` — integração e tipo mínimo.
2. `lib/public-article-matchday-context.ts` — reader dedicado.
3. `lib/public-article-matchday-context.test.ts` — testes de transporte/equivalência/integração/âmbito.
4. `lib/__fixtures__/public-article-matchday-context/legacy-reader.ts` — reader anterior congelado para comparação, só importado por testes.
5. `lib/__fixtures__/public-article-matchday-context/transport.ts` — dados sintéticos e transporte controlado.
6. `lib/public-broadcast-channel-logo.test.ts` — localização atualizada de duas assertions.
7. `docs/egress-postgrest-noticia-b1-20260925.md` — este relatório.

Sem dependências adicionadas ou alterações a package.json/lockfile.

## Riscos residuais e B2

A página continua dinâmica e cada visita faz leituras frescas; menu, relacionados e publicidade continuam com o custo atual. Não há poupança entre visitas por cache. O count continua bounded pela mesma query de participantes. A equivalência visual integrada do build B1 ficou pendente devido ao bloqueio automático descrito acima. A medição de produção não foi realizada.

Candidatos a B2, sem código neste lote: medir separadamente o menu de competições, relacionados/publicidade e repetição entre visitas; avaliar cache específico apenas de metadados estáveis, com contrato explícito de invalidação e separação dos jogos live; avaliar um transporte de count de participantes se a dimensão o justificar. A Jornada pública e o diagnóstico amplo requerem um lote próprio.
