**JORNADA.PT — Cached Egress / imagens do backoffice — Lote A1 — 2026-09-25**

Implementação limitada a sete elementos `<img>`: acrescentar `loading="lazy"` e `decoding="async"`. Sem mudanças de CSS, dimensões, grelhas, fontes, crop, seleção, drag/drop ou lógica editorial.

**Branch e base**

- Branch: `jornada-egress-imagens-backoffice-a1-20260925`.
- Base efetiva após `git fetch origin --prune`: `52676cb214fa338d1d23310c7f22bc8114897fdd`, igual à base esperada.
- Criada diretamente de `origin/main` numa worktree separada: `C:/Users/silva/Documents/Codex/jornada-egress-imagens-backoffice-a1-20260925-wt`.
- O diretório original tinha três alterações tracked prévias (`page.tsx`, `editorial-hierarchical-composition.test.ts`, `editorial-historical-faixa-public-title.test.ts`). Foram preservadas.
- Os quatro untracked históricos foram preservados: `0001-feat-add-newsroom-theme-continuity-workflow.patch`, `_continuity_handoff/`, `supabase/.temp/`, `tema-continuity-handoff.zip`.
- O SHA final é o commit desta entrega (consultável com `git rev-parse HEAD` na branch); não é embutido no próprio commit. Sem merge.

**Ficheiros da entrega**

| Ficheiro | Alteração |
|---|---|
| `app/admin/editorial/composicao/[matchdayId]/HierarchicalCompositionDeskClient.tsx` | 3 imagens |
| `app/admin/editorial/composicao/[matchdayId]/page.tsx` | 3 imagens |
| `app/admin/editorial/redacao-automatica/publicacao-lote/_batchPreflightClient.tsx` | 1 imagem |
| `lib/backoffice-image-egress-a1.test.ts` | 12 testes focados, incluindo 2 verificações opcionais do diff A1 |
| `docs/egress-imagens-backoffice-a1-20260925.md` | Este relatório e proposta A2 |

**Inventário completo dos sete elementos alterados**

As linhas referem-se à versão A1.

| Elemento | Linha | Motivo / reserva de espaço existente |
|---|---:|---|
| `HierarchicalCompositionDeskClient.tsx`: `renderCard`, `article.imageUrl` | 3550 | Cartões de montagem repetidos; contentor `.hc-desk-card-media` com largura 100% e proporção 16:9. |
| Mesmo ficheiro: lista/banco, `article.imageUrl` | 3991 | Banco com muitos candidatos e scroll; `.hc-desk-row-image` reserva 16:9, imagem preenche o contentor. |
| Mesmo ficheiro: Herdadas, `article.imageUrl` | 4077 | Lista potencialmente longa dentro de `details` inicialmente fechado; CSS de 56×42 px. |
| `page.tsx`: `ImagePreview`, `imageUrl` | 2025 | Usado pelos cartões administrativos `ItemCard` e `BankNewsListItem`, sem preview interativo central. Espaço de 72×72 px nos cartões e cerca de 88×66 px no banco, conforme CSS. Inclui o pequeno cartão administrativo “Destaque da Jornada”, não a imagem principal do renderer público. |
| Mesmo ficheiro: banco de artigos, `thumbnail` | 2803 | Lista de notícias selecionáveis; CSS de 56×42 px. |
| Mesmo ficheiro: banco de vídeos, `thumbnail` | 2892 | Lista de vídeos, sem alterar player ou imagem principal; CSS de 56×42 px. |
| `_batchPreflightClient.tsx`: `productionImage.imageUrl` | 770 | Preview remoto secundário repetido por artigo no pré-flight; CSS de 76×56 px. |

Os URLs e todos os restantes atributos mantêm-se. Os contentores já reservavam espaço: não foi necessária correção CSS.

**Elementos deliberadamente preservados**

- `_batchPreflightClient.tsx:792`, `src={previewUrl}`: caminho misto que usa Blob/local quando há ficheiro e URL remota como alternativa. Preservado por também dar feedback imediato sobre a imagem escolhida. Não foi introduzida lógica condicional adicional.
- `_mesa-source-item.tsx:70` e `_mesa-archive-source-item.tsx:64`: ambos já têm lazy.
- Produção, `_workspace-client.tsx:385` (`image.frozenUrl`) e `:434` (`imageUrl`): ambos já têm lazy.
- `_dossierImageBank.tsx:184`: já tem lazy.
- `_dossierImageChoiceGrid.tsx:67` e `:86`: imagem publicada preservada e opções do banco já têm lazy.
- Mesa Viva Temática, `MatchdayEditorialThematicDeskClient.tsx:502`: `next/image` com lazy, `unoptimized` e loader que conserva o original; pipeline fora do A1.
- Mesmo ficheiro, `:1572`: preview central da imagem destacada, igualmente fora do A1; preservado também por ser feedback de seleção.
- Renderers/previews públicos, imagens principais, logos, Mesa Viva física e restantes imagens do projeto: fora do âmbito. Não foi repetida uma auditoria geral.

**Garantias do diff**

- Zero SQL e zero migrations novos ou alterados.
- Zero alterações de URLs editoriais persistidas, snapshots ou persistência de imagens.
- Zero chamadas novas de Storage, transformações externas, compressão ou reprocessamento.
- Zero alterações editoriais: Article Plans, classificação, Produção, continuidade, temas, decisões Histórica/Bank/Sem decisão, Apply, zonas, publicação, imagens escolhidas e ordem dos cartões.
- Cache/read model público, PostgREST público, `force-dynamic` e helpers Supabase globais intactos.
- A verificação do patch compara os três ficheiros de aplicação com a base: removendo apenas os dois atributos acrescentados, o conteúdo é idêntico, incluindo CSS, handlers e `bankItemIds`.
- A revisão React confirmou que não foram alterados hooks, estado, props, chaves ou acessibilidade.

**Testes e validação**

| Verificação | Resultado |
|---|---|
| Novos testes A1 com guardas do diff ativadas | 12/12 passaram, 0 ignorados |
| Suite focada, 22 ficheiros, incluindo os testes A1 | 215 testes: 213 passaram, 2 falhas preexistentes |
| Reprodução dos dois ficheiros com falhas na base limpa | 32 testes: 30 passaram, as mesmas 2 falhas |
| `npx tsc --noEmit` | Passou |
| `npm run build` | Passou; Next.js 15.5.22; 66 páginas estáticas geradas |
| `git diff --check` | Passou |
| `next-env.d.ts` | Não sofreu alteração; não incluído no commit |

As duas falhas preexistentes, reproduzidas na worktree detached da base exata:

1. `lib/editorial-hierarchical-composition.test.ts`: “arquivar e reativar uma notícia livre repõe 15 lugares e momentos posteriores” procura uma expressão regular que exige condições na mesma linha; o código da base já as distribui por várias linhas.
2. `lib/editorial-historical-inherited-news-integration.test.ts`: falha ao carregar a migration ausente `20260917084500_matchday_historical_inherited_revalidation.sql`.

Não foram corrigidas nem executada uma auditoria da suite global. O build emitiu avisos de Autoprefixer relativos a `end` e avisos de serialização desses warnings pelo webpack, em CSS intacto.

Reprodução dos testes A1 em PowerShell:

```powershell
$env:JORNADA_EGRESS_A1_BASE = '52676cb214fa338d1d23310c7f22bc8114897fdd'
npx tsx --test lib/backoffice-image-egress-a1.test.ts
```

A variável ativa apenas os dois testes de fronteira do lote; sem ela, os 10 testes permanentes continuam a correr e os dois testes de patch são explicitamente ignorados, para não congelar trabalho editorial futuro à base A1.

Seleção da suite focada:

```powershell
$taskTests = @(rg --files lib | Where-Object {
  $_ -match '(backoffice-image-egress-a1|editorial-hierarchical[^\\/]*|editorial-historical-inherited[^\\/]*|editorial-historical-composition-(ui-modernization|flexible-desk|classification-badges)|editorial-batch-(preflight-ui|image-preflight|image-selection)|editorial-mesa-workspace-images)\.test\.(ts|tsx)$'
})
npx tsx --test $taskTests
```

**Validação visual local e limites**

Foi iniciado o build local com `next start -H 127.0.0.1 -p 3101`, sem copiar as credenciais do diretório original. As rotas de Composição (ID fictício apenas para atravessar o middleware) e Publicação em lote redirecionaram para `/admin/login?next=...`. O login mostra falta de `ADMIN_PASSWORD`, com entrada desativada. Não houve contorno de autenticação, criação de sessão artificial ou criação/edição de dados.

O login renderizou corretamente e o comando de erros do browser não reportou erros. Isso não valida as Mesas: dimensões reais, drag/drop, scroll, aparecimento das imagens ao aproximarem-se do viewport, pedidos de Herdadas fechadas e previews do lote não puderam ser observados na aplicação autenticada. Ficam cobertos estruturalmente pelo diff e pelos testes existentes/novos. Browser e servidor local foram encerrados.

Capturas locais: `C:/Users/silva/Documents/Codex/jornada-egress-a1-validation-artifacts-20260925/`. Logs ignorados na worktree: `a1-focused-tests.log`, `a1-focused-files.log`, `a1-tsc.log`, `a1-build.log`. Reprodução na base: `C:/Users/silva/Documents/Codex/jornada-egress-a1-base-validation-20260925/a1-base-regressions.log`.

O lazy nativo permite ao browser antecipar imagens próximas do viewport; não garante zero pedidos fora da área visível e depende do suporte/configuração do browser. `decoding="async"` é uma indicação de descodificação, não uma redução do tamanho do ficheiro. [Referência MDN](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/img#loading).

Os originais continuam a ser transferidos quando necessários. Não foi medida uma redução de bytes em produção; o ganho depende da quantidade de imagens não visitadas, scroll e cache. Um original já pedido por outro elemento visível não deixa de ser transferido por existir também numa lista lazy.

**Proposta A2 — apenas desenho, sem implementação**

As dimensões seguintes vêm do CSS/props atuais; valores fluidos devem ser medidos em sessões autenticadas nos breakpoints usados antes de fixar variantes. Os tamanhos recomendados são envelopes de apresentação a cerca de 2×; o derivado deve preservar a proporção original, sem crop, e ter resolução suficiente para cobrir ambas as dimensões com o `object-fit` atual.

| Componente candidato | Dimensão visual aproximada | Derivado recomendado |
|---|---|---|
| Composição: cartões de montagem e candidatos | Fluido 16:9; ordem de 160–320 px de largura, varia com grelha/foco/viewport | Variantes 320 e 640 px de largura; escolher conforme a caixa renderizada e proporção da origem |
| Composição: Herdadas e bancos de artigos/vídeos | 56×42 px | Pelo menos 112×84 px úteis; variante de 160 px de largura, maior para origens com proporção extrema |
| Composição: `ImagePreview` | 72×72 ou cerca de 88×66 px | Variante de 160/320 px, conforme proporção e crop CSS |
| Publicação em lote: preview remoto secundário | 76×56 px | Pelo menos 152×112 px úteis; variante de 160/320 px |
| Redação e arquivo | 84×108 px; 74×94 px em viewport menor | Pelo menos 168×216 px úteis; variante de 320 px ou maior conforme a proporção |
| Produção: identidade do output | 52×45 px | Pelo menos 104×90 px úteis; variante de 160/320 px |
| Banco partilhado de Dossiê / seletor | Banco ≥110 px de largura ×74 px; opções 108×88 ou 76×66 px | Variantes 320 px; 640 px apenas se o espaço fluido o justificar |
| Banco de Produção interno | Cerca de 145–160×94 px no painel de 820 px | Variante 320 px, ajustada ao original |
| Mesa Viva Temática: cartões | Proporção 16:9 fluida; props atuais 320×180 | Variantes 320/640 px, sem alterar geometria ou seleção |
| Mesa Viva Temática: preview central destacado | Props atuais 420×220 | Manter imediato; original ou derivado de aproximadamente 840 px, apenas após validação de qualidade |

Contrato proposto para A2:

- Manter o ficheiro original canónico e o `imageUrl` editorial exatamente como estão. Derivados são recursos adicionais usados apenas na apresentação.
- Resolver um `previewUrl` separado em memória a partir de uma referência ao original; nunca escrever o derivado nos campos editoriais, snapshots, Article Plans ou pedidos de publicação.
- Preferir derivados pré-gerados com chave versionada, por exemplo `previews/v1/<source-content-hash>/w320.webp`, incluindo versão da receita/formato e identidade do original. A2 deverá escolher o mecanismo e armazenamento do índice separado; nada disso foi criado no A1.
- Uma nova imagem original ou receita produz nova chave. Não sobrescrever originais nem reutilizar silenciosamente a chave de um derivado anterior.
- Redimensionar sem cortar, preservar a proporção e o enquadramento; continuar a aplicar o crop/`object-position` atual no CSS. Para proporções extremas escolher uma variante maior. Não ampliar originais menores.
- Fallback para o original quando não existe derivado, sem bloquear seleção, publicação ou drag/drop. Evitar geração sob demanda ao percorrer listas.
- Começar pelos sete pontos A1 e seletores partilhados, depois Mesa Viva Temática. Medir bytes/pedidos por sessão longa com cache frio/quente e comparar qualidade, layout e crop antes de alargar.

Logos que justificam avaliação separada no A2:

- Clubes em `TeamBadge`/`PublicTeamBadge`: caixas públicas de 50×28 e 60×33 px, imagem até 50×25/60×30 px. Derivados raster transparentes de cerca de 120 px de largura (ou 180 px para 3×), mantendo proporção e transparência. A classificação por `naturalWidth/naturalHeight`, escala ótica e filtros deve continuar equivalente.
- Canais TV em `BroadcastChannelLogo`: 58×14, 92×20 e cerca de 54–62×18 px. Avaliar variantes até 184×40 px úteis (ou 276×60 a 3×). Preservar alpha, proporção e geometria SVG usada por alguns logos; não recortar margens sem rever essa geometria.
- Logo Jornada/header: avaliar só se o ficheiro usado exceder materialmente a resolução renderizada e o peso justificar. Ficheiros locais não representam necessariamente Cached Egress do Storage.
- SVG já adequado não precisa de derivado raster. Nenhum logo público foi alterado neste lote.
