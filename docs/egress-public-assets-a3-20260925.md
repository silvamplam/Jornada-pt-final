# A3 — derivados editoriais públicos

Branch: `jornada-egress-public-assets-a3-20260925`.
Base efetiva: `2d6628f432d659fa7c4c0314730cd5ed0f183348`, diretamente de `origin/main` após fetch.
O SHA final é o commit que contém este relatório: `git rev-parse HEAD` na branch entregue; é também comunicado na entrega. Sem merge.

Trabalho isolado em `C:/Users/silva/Documents/Codex/jornada-egress-public-assets-a3-20260925-wt`. O diretório principal e os seus artefactos preexistentes foram preservados. Nenhum ficheiro ou experiência B3 foi transportado. B3 permanece PARKED.

## Resultado e limite de âmbito

Imagens editoriais públicas elegíveis passam a usar companions estáticos A2, agora também em w960/w1280. O original continua canónico. Não há transformação no GET/render, proxy, Next/Image novo, Supabase Image Transformations ou serviço externo.

**Logos de equipas e canais não foram implementados**, aplicando a exceção da secção 11 do pedido. O código aceita URLs arbitrárias, mas não contém um contrato verificável de paths próprios/versionados de `team-logos` nem um upload desses bytes. Não se inventou uma identidade nem se consultou produção para a descobrir. A parte editorial está validada; a redução dos ~108 MB de HIT de team logos identificados no diagnóstico anterior continua pendente de um lote com essa identidade confirmada.

Zero dependências novas. Reutiliza sharp 0.34.5, Node 24 e Next 15.5.22. `package.json` e lockfile intactos.

## Inventário focado

Dimensões são aproximadas e variam com viewport, colunas presentes e slots. A posição relativamente à dobra depende do conteúdo. Em todos os casos editoriais, apenas URLs elegíveis próprias mudam; externas e paths antigos não comprovadamente imutáveis permanecem intactos.

| Componente / superfície | Imagem e largura visual típica | Dobra | Perfil / candidatos máximos |
|---|---|---|---|
| `PublicEditorialLayout` — Headline | Manchete, ~390–780 px conforme colunas; mobile fluido | Principal, imediata | `headline`: 320/640/960/1280 |
| Mesmo — SideBlock | Contexto ~185–330 px, pode empilhar | Geralmente abertura | `card`: 320/640/960 |
| Mesmo — Highlight | Destaques ~230–388 px; cresce em seleção reduzida/mobile | Abertura / secundária | `card`: 320/640/960 |
| Mesmo — Complementary | Complemento fluido; pode ocupar toda a coluna | Secundária | `half`: 320/640/960/1280 |
| `PublicHierarchicalComposition` — InterpretiveMedia | Dominante ~380–650 px; restantes ~128–388 px; empilham em mobile | Dominante imediata, outros variáveis | `headline` para dominante; `card` para restantes |
| `PublicFourNewsGrid` | 2 colunas, até ~591 px cada; slots esparsos podem ocupar linha | Secundária | `half`, com `auto` no lazy existente |
| `PublicBeyondMatchdayNews` | Faixa: principal ~580 px, secundárias ~112–300 px | Normalmente abaixo | `half`, com `auto` no lazy existente |
| `PublicHorizontalNewsStrip` | 1–5 colunas, normalmente ~230–388 px; mobile fluido | Secundária | `card` (ambos os ramos, com/sem link) |
| `PublicLatestNewsBlock` | Últimas ~215–320 px; empilhamento pode aproximar-se de 800 px | Variável | `latest`, 320/640/960/1280; desktop escolhe normalmente 320/640 |
| `/noticias/[slug]` | Principal, coluna até ~780 px | Principal, imediata | `article`, 320/640/960/1280 |
| Mesma — relacionados | Miniaturas 86 px | Sidebar / secundária | `thumbnail`, apenas 320 |
| `/conteudos/[slug]` | Imagem principal até ~920 px | Principal, imediata | `content`, 320/640/960/1280 |
| Jornada `/jogos` — notícias laterais | Miniaturas 72 px | Sidebar / secundária | `thumbnail`, apenas 320 |
| Home efetiva | Reutiliza EditorialLayout/Horizontal e respetivos componentes | Mista | Benefício pelos mesmos renderers; `app/page.tsx` intacto |
| FlexibleZone/FourNews layouts; physical/thematic/legacy/reference/historical | Delegam nos renderers acima | Mista | Sem modificar leitores, autoridade ou seleção |
| `PublicTeamBadge` / MatchStrip / páginas de jogos | Compacto: caixa 50×28, logo até 50×25; default 60×33, até 60×30 | Faixa / classificação | **Original preservado**, próprio ou externo |
| `BroadcastChannelLogo` | Geometria específica, sourceViewport e opticalScale | Faixa / jogos | **Original preservado**; SVG externo/canonical mappings intactos |
| Logos de competição, publicidade, players e posters | Fora do lote | Mista | Intactos |

São 14 pontos de emissão de imagem migrados em nove ficheiros de renderização. `PublicFlexibleZoneRenderers`, layouts de quatro notícias, página principal da Jornada e Home não precisaram de alterações próprias. Notícias, conteúdos e jogos só mudaram o elemento de imagem e respetivo import.

## Receita, identidade e responsividade

Mantém `editorial-images/previews/v1/<object-path-original-completo>/w<largura>.webp`.

Path original elegível: o formato imutável emitido pelos uploads/importações A2, `editorial/YYYY/MM/<timestamp de 13 dígitos>-<UUID v4>-<nome>.jpg|jpeg|png|webp|avif`. Título isolado ou path legado/mutável não é identidade suficiente. Mesma origem exata de `NEXT_PUBLIC_SUPABASE_URL`, endpoint público Storage e bucket autorizado. Sem query/hash, credenciais, traversal, percent encoding ambíguo ou outro projeto/bucket. SVG e URLs externas permanecem como estavam.

Receita **inalterada**: WebP quality 84, alphaQuality 100, effort 4, orientação EXIF aplicada, sem crop, `withoutEnlargement: true`. Mesmos limites A2: 8 MiB, 40 milhões de pixels, dimensão máxima 12.000, imagem raster não animada. Não se amplia nem recodifica o original. A2 w320/w640 mantém paths, defaults e receita; a versão v1 continua correta porque apenas foram acrescentadas larguras da mesma receita.

w960 cobre cartões maiores, viewport intermédio e leitura a ~780 px em DPR1. w1280 cobre manchetes/colunas grandes, conteúdos até 920 px e DPR superior, sem criar 1920/2560. Não promete 2x integral em todas as superfícies de 920 px; evita multiplicar variantes neste lote.

`src` é o maior candidato do perfil, com `srcSet` de todas as larguras permitidas até esse limite. O browser com suporte responsivo escolhe pelo `sizes` e DPR. Os valores CSS existentes continuam a controlar geometria; `sizes` é uma estimativa conservadora quando o número de colunas é variável.

| Perfil | `sizes` (antes de eventual prefixo `auto, `) |
|---|---|
| thumbnail | `86px` (também cobre a miniatura de 72 px; só existe candidato 320) |
| latest | `(max-width: 840px) calc(100vw - 32px), (max-width: 1180px) 320px, 235px` |
| card | `(max-width: 720px) calc(100vw - 32px), (max-width: 1232px) 32vw, 388px` |
| half | `(max-width: 680px) calc(100vw - 32px), (max-width: 1232px) 48vw, 591px` |
| headline | `(max-width: 980px) calc(100vw - 32px), (max-width: 1232px) 50vw, 600px` |
| article | `(max-width: 900px) calc(100vw - 60px), (max-width: 1212px) calc(100vw - 394px), 780px` |
| content | `(max-width: 720px) calc(100vw - 28px), (max-width: 952px) calc(100vw - 32px), 920px` |

Só imagens **já lazy** recebem `auto, `, para o browser usar a dimensão efetiva quando suporta auto-sizes; seguem-se os fallbacks da tabela. É o mecanismo definido no [HTML Standard](https://html.spec.whatwg.org/multipage/images.html). Nenhum `loading`, `decoding` ou `fetchPriority` existente foi alterado. Manchetes/imagens principais continuam imediatas. Os sete pontos lazy/async A1 permanecem intactos.

`PublicEditorialImage` recebe sempre o original e emite um único `<img>`, sem wrappers. Preserva classes, alt, dimensões, links/overlays externos e todos os props de `editorialImageFramingProps`/`hierarchicalEditorialImageFramingProps`. Se o candidato falha, remove `srcSet` e `sizes` e tenta o original uma vez. Um `ref` também deteta erro ocorrido **antes da hidratação**; este caso foi reproduzido e corrigido. Se o original falha, mantém a callback/comportamento anterior. Não há geração, chamadas de API ou resize no fallback. URLs inelegíveis nem sequer recebem srcSet/sizes.

## Uploads e backfill

Os sete clientes A2 não mudaram: artigo, conteúdo, DossierImageBank, SourcePackageOutputPlanner, entrada manual, Publicação em lote e workspace da Produção. Continuam `void completeEditorialImagePreviews(...)`, payload pequeno, `keepalive: true`, timeout 45 s; o original fica disponível sem esperar pelos previews. Autenticação, verificação de origem, ticket assinado/expiração/path e endpoint exclusivamente POST intactos.

O endpoint central passa a pedir 320/640/960/1280. O import-source-image mantém geração server-side best-effort, reaproveitando os bytes já descarregados. A falha não altera a resposta canónica. Mantiveram-se limites/timeouts; não se adicionou fila, cron ou infraestrutura. Cada largura é gravada depois de gerada, preservando os companions pequenos se uma largura posterior falhar. HEAD/idempotência e upload sem upsert impedem overwrite. Cache dos derivados: `max-age=31536000`; metadata dos originais intacta.

`scripts/backfill-editorial-image-previews.ts` ganhou `--widths`. Sem esse argumento conserva o default A2 320/640. Para A3: `--widths 320,640,960,1280`. O planeamento identifica apenas larguras ausentes, incluindo históricos que já tenham os companions A2. Continua dry-run, paginação/offset, 20 objetos por defeito, máximo 100, relatório de encontrados/existentes/criados/ignorados/falhados/bytes, zero DELETE e zero overwrite.

**Não foi executado qualquer backfill remoto, nem sequer dry-run/listagem de produção.** Os testes de execução usam apenas Storage em memória.

Passos futuros, apenas após autorização separada:

1. Disponibilizar numa máquina controlada um ficheiro local ignorado pelo Git, `.env.backfill.local`, com origem e service-role corretas. Confirmar manualmente o hostname. Nunca colocar a chave no cliente/relatório.
2. Rever dry-run pequeno, por mês:

   ```powershell
   node --env-file=.env.backfill.local --import tsx scripts/backfill-editorial-image-previews.ts --prefix editorial/2026/09 --widths 320,640,960,1280 --limit 5 --offset 0
   ```

3. Só após rever o plano, configurar a segunda guarda com o hostname literal verificado e executar o mesmo lote:

   ```powershell
   $env:JORNADA_PREVIEW_BACKFILL_WRITE = "allow:<hostname-confirmado>"
   node --env-file=.env.backfill.local --import tsx scripts/backfill-editorial-image-previews.ts --prefix editorial/2026/09 --widths 320,640,960,1280 --limit 5 --offset 0 --execute
   Remove-Item Env:\JORNADA_PREVIEW_BACKFILL_WRITE
   ```

4. Inspecionar visualmente o lote e Network. Repetir dry-run para comprovar existentes; continuar com `nextOffset` reportado, sem saltar falhas. Trabalhar por mês/páginas pequenas; pausar perante erros. A listagem por offset pressupõe evitar alterações concorrentes significativas nesse prefixo.
5. Medir Cached Egress real depois de cobertura suficiente. Paths não elegíveis exigem revisão separada, sem persistir derivados como canónicos.

## Logos: evidência e bloqueio

O writer `app/api/admin/teams/[id]/route.ts` recebe `logo_url` textual; `app/api/admin/teams/route.ts` também aceita URLs HTTP(S) no banco/importação de assets. O Gestor guarda URLs. A pesquisa focada não encontrou um produtor de objetos `team-logos`, exemplos próprios versionados ou uma política que impeça sobrescrever a mesma key. O bucket observado no diagnóstico não prova sozinho a imutabilidade de cada path.

Preservam-se integralmente fallback, slug, balanced/tall/wide, opticalScale, contrastMode, alt/title e CSS de `PublicTeamBadge`. Para um futuro lote: a caixa default chega a 60 px e opticalScale a 1,10; 2x pode requerer até ~132 px, pelo que 128 não deve ser escolhido cegamente. Confirmar os paths e writers primeiro; depois comparar lossless/quality alta numa fixture com alpha, sem DB adicional. Nenhuma receita de logo foi introduzida agora.

Canais TV ficaram igualmente fora: além da identidade por confirmar, canonical SVG/Wikimedia, Canal 11, sourceViewport e geometria própria tornam inadequada uma alteração genérica. Logos de competição, anúncios, posters e players também não mudam.

## Medição local

Fixture editorial determinística 2400×1600 JPEG, sem imagens reais. `npx tsx scripts/benchmark-public-editorial-previews.ts`:

| Asset | Dimensões | Bytes | Redução face ao original |
|---|---:|---:|---:|
| Original | 2400×1600 | 1 844 619 | — |
| w320 | 320×213 | 2 750 | 99,85% |
| w640 | 640×427 | 14 406 | 99,22% |
| w960 | 960×640 | 61 598 | 96,66% |
| w1280 | 1280×853 | 174 328 | 90,55% |

| Página sintética, assets distintos | Antes | Depois | Redução |
|---|---:|---:|---:|
| Jornada: 1×1280 + 8×640 + 4×320 | 23 980 047 B | 300 576 B | 98,75% |
| Notícia: 1×1280 + 4×320 | 9 223 095 B | 185 328 B | 97,99% |
| Faixa com 10 logos PNG sintéticos, 512×512/6 533 B cada, **inalterados** | 65 330 B | 65 330 B | 0% |

Estes números demonstram encoding/seleção de assets e uma soma teórica, **não estimam a redução de produção**. Não incorporam distribuição real de tamanhos, cache do browser, repetição de URLs, DPR, formatos ou cobertura dos históricos. O logo sintético não foi transformado; não se reivindica poupança em logos.

### Browser / rede / equivalência

Servidor isolado: `npx tsx scripts/serve-public-editorial-preview-fixture.tsx`, ligado apenas a `127.0.0.1:3103`. URL externa simulada em `localhost:3103`, host diferente da origem própria configurada. Nenhuma credencial ou chamada a produção.

`/?delay=1` atrasa deliberadamente a hidratação 1,5 s. Verificação com Chromium via agent-browser, viewport 1262 px, DPR1 e DPR2:

| Caso | DPR1 | DPR2 | Pedidos ao original |
|---|---|---|---:|
| Miniatura 86 px | 1×w320 / 2 750 B | 1×w320 / 2 750 B | 0 |
| Cartão lazy 300 px | 1×w320 / 2 750 B | 1×w640 / 14 406 B | 0 |
| Principal 780 px | 1×w960 / 61 598 B | 1×w1280 / 174 328 B | 0 |
| Derivado ausente | 1×404 candidato + 1×original | Igual | 1 |
| Derivado e original ausentes | 1×404 candidato + 1×404 original | Igual | 1; callback uma vez |
| Host externo local | Só original externo | Só original externo | 1; zero previews |

8 pedidos de imagem por cenário completo; repetir render não aumenta o total. Zero erros de React/hidratação. O caso de fallback funciona também quando a falha precede a hidratação. Os scripts `scripts/fixtures/check-public-editorial-images.browser.js` e `check-public-editorial-layouts.browser.js` contêm as asserções reproduzíveis (pipe para `agent-browser eval --stdin`). Usar sessão limpa para não misturar requests pendentes de outra página.

`/layouts?base=1` usa `<img>` canónico; `/layouts` usa o componente novo nos renderers reais. Comparação desktop 1262 px e mobile 390 px: **158 elementos / 38 imagens, zero diferenças** em geometria, texto, classes, object-fit, object-position e framing. Todas as imagens carregam. Inclui abertura, destaques, Últimas, grelha, horizontal, Faixa e hierárquica. Testes AST contra a base confirmam ainda que markup/CSS/lógica/canónicos/posters dos nove ficheiros são idênticos, descontando apenas o novo elemento/import/perfil. Notícia e conteúdo têm equivalência estrutural e componente principal testado em SSR/rede; não se usaram artigos/dados reais. MatchStrip e badges são literalmente iguais à base.

## Validação

- A1/A2/A3 focados e auditoria de âmbito: **55 testes, 52 aprovados, zero falhas, 3 skips opcionais**. A3: 21 testes aprovados, incluindo auditoria da branch; A1/A2: 31 aprovados e 3 skips.
- Suite pública relevante, incluindo B1/B2, autoridade/snapshots, histórico, enquadramento, logos e faixa: **352 testes, 347 aprovados, 4 falhas preexistentes, 1 skip**. Esta suite inclui também os 21 testes A3, portanto os totais não devem ser somados como testes únicos.
- Quatro falhas preexistentes reproduzidas na **base exata** em worktree separado: uma em `public-broadcast-channel-logo.test.ts`, uma em `public-header-mascot.test.ts`, duas em `public-home-editorial-responsive-layout.test.ts`. Reprodução: 45 testes, 41 aprovados, mesmas quatro falhas. Nenhuma correção fora de âmbito.
- A auditoria antiga B2 que proíbe alterações noutras superfícies da branch foi excluída por nome; não é uma regressão funcional. As regressões funcionais B2 foram executadas. Os testes A1/A2 de release opcionais mantêm os respetivos skips; A3 tem a própria auditoria de âmbito.
- `npx tsc --noEmit`: aprovado.
- `npm run build`: aprovado; avisos CSS de autoprefixer em ficheiros preexistentes. `next-env.d.ts` não foi alterado.
- `git diff --check`: aprovado antes do commit.

Comando de auditoria A3: definir `JORNADA_EGRESS_A3_BASE=2d6628f432d659fa7c4c0314730cd5ed0f183348` e executar `npx tsx --test lib/public-editorial-image-a3.test.ts`.

## Ficheiros e garantias

Produção: os nove renderers da tabela, novo `components/public/PublicEditorialImage.tsx`, novo `lib/public-editorial-image.ts`, extensão dos cinco módulos A2 de paths/generator/generation/storage/backfill, dois entrypoints server-side A2 e CLI de backfill.

Validação/documentação: `lib/public-editorial-image-a3.test.ts`, ajuste de duas expectativas A2 para as quatro larguras do endpoint, benchmark, servidor/fixtures/scripts de browser e este relatório. Nenhum CSS foi alterado.

27 ficheiros na entrega. Working tree A3 sem alterações extra à entrega; evidência de browser/benchmark/logs guardada fora da worktree em `C:/Users/silva/Documents/Codex/jornada-a3-local-evidence-20260925`. O diff binário e status do diretório principal foram comparados com o registo inicial e são idênticos.

```text
app/api/admin/editorial/artigos/import-source-image/route.ts
app/api/admin/editorial/image-previews/complete/route.ts
app/competicoes/[competitionSlug]/[seasonLabel]/jornadas/[matchdayNumber]/jogos/page.tsx
app/conteudos/[slug]/page.tsx
app/noticias/[slug]/page.tsx
components/public/PublicBeyondMatchdayNews.tsx
components/public/PublicEditorialImage.tsx
components/public/PublicEditorialLayout.tsx
components/public/PublicFourNewsGrid.tsx
components/public/PublicHierarchicalComposition.tsx
components/public/PublicHorizontalNewsStrip.tsx
components/public/PublicLatestNewsBlock.tsx
docs/egress-public-assets-a3-20260925.md
lib/editorial-image-preview-a2.test.ts
lib/editorial-image-preview-backfill.server.ts
lib/editorial-image-preview-generation.server.ts
lib/editorial-image-preview-generator.server.ts
lib/editorial-image-preview-storage.server.ts
lib/editorial-image-preview.ts
lib/public-editorial-image-a3.test.ts
lib/public-editorial-image.ts
scripts/backfill-editorial-image-previews.ts
scripts/benchmark-public-editorial-previews.ts
scripts/fixtures/check-public-editorial-images.browser.js
scripts/fixtures/check-public-editorial-layouts.browser.js
scripts/fixtures/public-editorial-layouts.tsx
scripts/serve-public-editorial-preview-fixture.tsx
```

Zero SQL/migrations/RPC novo. Zero Supabase remoto, listagem, backfill, writes ou alterações de buckets/metadata. Zero alterações a URLs canónicas persistidas, Article Plans, snapshots, escolha de imagem, crop, conteúdo, continuidade, classificação ou publicação semântica. B1/B2 e force-dynamic intactos; nenhum cache B3. Sem changes ao backoffice A1/A2 para além da geração central dos companions públicos.

## Riscos residuais / próximo passo

- O ganho real depende de derivados existentes. Antes do backfill autorizado, históricos elegíveis sem a variante pedida fazem um 404 seguido do original; não há procura sucessiva de variantes nem geração no render.
- Nomes históricos não versionados, formatos não suportados, externos e logos continuam originais. Logo optimization exige confirmar identidade/imutabilidade e writer próprio separadamente.
- Fallback requer JavaScript/hidratação, incluindo correção de erro pré-hidratação. Sem JavaScript, um derivado ausente não consegue acionar esse fallback.
- Os hints de `sizes` são conservadores em layouts com número variável de colunas; o browser pode escolher uma variante maior que a estritamente mínima. Nos lazy, `auto` permite usar a caixa efetiva onde suportado. DPR muito alto continua limitado a 1280.
- Geração é best-effort; navegação/limites de execução/formatos problemáticos podem deixar companions incompletos. `keepalive` ajuda, não é uma fila durável. O importador preserva a geração server-side síncrona existente, agora com quatro larguras, reutilizando os bytes.
- Não há medição nem deployment visual de produção neste lote. A redução qualitativa esperada vem sobretudo de cartões editoriais repetidos e relacionados; o hotspot de team logos permanece pendente.
