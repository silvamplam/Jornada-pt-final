# Família editorial de seis notícias: 1 + 2 + 3

Branch: `codex/six-news-1-2-3`.
Base: `505aa872f25310f8d09c70a4bcc925bcaaa737db`, após atualizar `main` com `origin/main`.

## Diagnóstico read-only

- `lib/editorial-visual-families.ts` é o registo reutilizável de famílias, posições, capacidade e renderer.
- A Viva lista esse registo em `MatchdayEditorialThematicDeskClient.tsx`. Os parsers físicos também derivam dele. A normalização temática anterior tem uma lista restrita em `editorial-matchday-profile-workspace.ts`.
- A Histórica tem o registo `HISTORICAL_DYNAMIC_ZONE_LAYOUTS`, mas também tipos, seletor e mapas de capacidade explícitos no cliente, página e API de composição.
- `PublicFlexibleZoneRenderers.tsx` faz o dispatch público. A preview histórica já usa `PublicFlexibleZoneLayout`, pelo que pode reutilizar o novo renderer.
- A base de dados tem constraints e RPC com listas fechadas de famílias. Só acrescentar uma opção no frontend não permitiria gravar/publicar o novo layout.
- Os testes existentes cobrem famílias, Apply físico, snapshots públicos, composição hierárquica, preview e publicação histórica, enquadramento de imagens e títulos.

## Implementação

Nova opção **6 notícias — 1 + 2 + 3**, identificador `six_news_1_2_3`, capacidade 6 e renderer `six_news_tiered`.

O topo é horizontal (imagem + texto); seguem-se duas notícias e depois três. Cada posição mostra a imagem editorial, com fallback Jornada para imagem ausente ou que falhe. Títulos completos, subtítulos proporcionais ao nível, imagens com proporções estáveis, alturas iguais por linha e adaptação a ecrãs estreitos. As vagas mantêm as posições editoriais; linhas totalmente vazias não aparecem.

O renderer e as definições de `six_news` mantêm-se intactos. As restantes famílias, os defaults e a lista legacy original também se mantêm.

Seletor público: `[data-public-visual-family="six_news_1_2_3"]`.
Linhas: `[data-editorial-tier="lead"]`, `middle`, `final`.

A migração `20260927110935_editorial_six_news_1_2_3.sql` é necessária antes de disponibilizar a funcionalidade num ambiente. Foi testada localmente; não foi aplicada em produção. Acrescenta a família às capacidades e validações existentes, preservando as restantes regras, permissões e corpos das RPC.

## Validação inicial

**19 ficheiros / 185 testes: 182 passaram e 3 falharam.** Antes da implementação, a mesma bateria sem os casos novos teve 177 testes / 174 aprovados e as mesmas 3 falhas.

Ficheiros inteiramente aprovados (todos em `lib/`):

- `editorial-visual-families.test.ts`
- `editorial-historical-composition-dynamic-zones.test.ts`
- `editorial-historical-composition-dynamic-workspace-rpc.test.ts`
- `editorial-historical-composition-dynamic-publication-activation.test.ts`
- `editorial-historical-composition-admin-dynamic-preview.test.ts`
- `editorial-historical-composition-public-dynamic.test.ts`
- `editorial-matchday-profile-flexible-layouts.test.ts`
- `editorial-matchday-live-layout-physical.test.ts`
- `editorial-matchday-live-layout-physical-apply.test.ts`
- `public-matchday-physical.test.ts`
- `public-matchday-thematic.test.ts`
- `public-matchday-thematic-renderer.test.ts`
- `editorial-hierarchical-visual-grammar.test.tsx`
- `public-editorial-titles-integrity.test.ts`
- `public-editorial-image-framing.test.ts`
- `public-six-news-tiered.test.tsx`

Falhas preexistentes, separadas da alteração:

| Ficheiro | Teste que falha |
| --- | --- |
| `editorial-hierarchical-composition.test.ts` | arquivar e reativar uma notícia livre repõe 15 lugares e momentos posteriores |
| `public-live-hierarchical-layouts.test.ts` | os layouts públicos são flexíveis, a zona 4+Últimas é condicional e a Faixa fica no fim |
| `public-matchday-editorial-section-frame.test.ts` | o histórico dinâmico entrega apenas a fronteira exterior do vídeo ao frame |

São três asserções sobre o código-fonte já incompatíveis com a base. Os restantes testes desses ficheiros passaram. Não foram alteradas para esconder a falha.

Outras verificações aprovadas:

- TypeScript: 905 ficheiros versionados/novos, zero diagnósticos. Ficheiros pessoais não versionados em `_continuity_handoff` excluídos desta verificação.
- PostgreSQL 17 isolado: aplicação da migração; capacidades de todas as famílias; constraints; preservação dos corpos das RPC exceto as adições da família; ownership, grants, modo de segurança e search path preservados.
- RPC históricas reais com tabelas históricas originais e identidades sintéticas: gravação, seis snapshots com imagem e ativação/publicação, para `six_news` e `six_news_1_2_3`. Sétima posição e publicação incompleta rejeitadas. Não é um teste integral de todos os serviços da aplicação.
- Preview do renderer público partilhado: 1440, 1024 e 390 px; seis imagens carregadas; linhas 1/2/3 em desktop; alturas iguais dentro de cada linha; sem overflow horizontal; nenhum erro JavaScript. Imagem ausente e URL inválido resolvidos pelo fallback.
- `git diff --check`: aprovado.

Para repetir o preview: `npx tsx scripts/serve-six-news-tiered-preview.tsx`, abrir `http://127.0.0.1:3104`. O parâmetro `?fallback` exercita imagem ausente e imagem inválida.

Para repetir os testes TypeScript: `npx tsx --test --test-reporter=tap` seguido dos 19 ficheiros acima.

Para repetir a validação SQL, criar uma base PostgreSQL 17 local vazia com nome `six_news_test`, disponibilizar `psql` no PATH (ou `PSQL_BIN`) e executar:

```sh
node scripts/verify-six-news-tiered-sql.cjs postgresql://postgres@127.0.0.1:55438/six_news_test
```

## Ficheiros alterados

- `app/admin/editorial/composicao/[matchdayId]/HierarchicalCompositionDeskClient.tsx`
- `app/admin/editorial/composicao/[matchdayId]/page.tsx`
- `app/api/admin/editorial/composicao/route.ts`
- `app/competicoes/[competitionSlug]/[seasonLabel]/jornadas/[matchdayNumber]/page.tsx`
- `components/public/PublicFlexibleZoneRenderers.tsx`
- `components/public/PublicSixNewsTiered.tsx`
- `lib/editorial-historical-composition-dynamic-zones.test.ts`
- `lib/editorial-historical-composition-workspace.ts`
- `lib/editorial-matchday-live-layout-physical-apply.test.ts`
- `lib/editorial-matchday-profile-workspace.ts`
- `lib/editorial-visual-families.test.ts`
- `lib/editorial-visual-families.ts`
- `lib/public-matchday-physical.test.ts`
- `lib/public-six-news-tiered.test.tsx`
- `scripts/serve-six-news-tiered-preview.tsx`
- `scripts/verify-six-news-tiered-sql.cjs`
- `supabase/migrations/20260927110935_editorial_six_news_1_2_3.sql`
- `supabase/sql/test-editorial-six-news-1-2-3.sql`
- `docs/editorial-six-news-1-2-3.md`

## Compactação visual na mesma branch

Comparação read-only feita sobre `a158582958b21ec3183a975147c32dad4fccdc49`, antes de alterar o renderer. Conteúdo, imagens, ordem, título público e largura do contentor iguais para todas as famílias; as famílias de quatro/cinco usam os primeiros quatro/cinco artigos. Medição DOM da zona, incluindo o seu título e excluindo a fronteira exterior partilhada.

| Viewport | Nova família antes | Nova família depois | Redução | `six_news` | `five_news_secondary` | `four_news` |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 1440 px | 1199,5 px | 547,4 px | 54,4% | 474,2 px | 661,1 px | 819,2 px |
| 1024 px | 1106,3 px | 532,3 px | 51,9% | 443,8 px | 611,6 px | 777,8 px |
| 390 px | 1176,5 px | 1009,0 px | 14,2% | 1880,4 px | 900,6 px | 1256,8 px |

As três famílias de referência conservaram exatamente as mesmas alturas e geometria das imagens antes/depois. Em desktop, a nova família ficou 73,2 px / 88,5 px acima da `six_news` (15,4% / 19,9%), em vez de mais do dobro.

Decomposição da altura da nova família em 1440 px:

| Contribuição vertical | Antes | Depois |
| --- | ---: | ---: |
| Imagens: dominante + uma imagem por cada linha seguinte | 831,3 px | 325,6 px |
| Títulos das linhas intermédia/final | 108,0 px | 68,4 px |
| Subtítulos dessas linhas | 37,8 px | 35,0 px |
| Etiquetas dessas linhas | 26,4 px | 26,4 px |
| Gaps internos de texto dessas linhas | 28 px | 16 px |
| Padding entre imagem e texto dessas linhas | 20 px | 12 px |
| Margens entre os três níveis | 56 px | 16 px |
| Padding entre os três níveis | 56 px | 16 px |
| Dois separadores | 2 px | 2 px |
| Título da zona + margem | 34 px | 30 px |

O texto do destaque horizontal partilha a altura da sua imagem; não se soma novamente. Considera-se o cartão mais alto em cada linha. As proporções das imagens eram a principal causa da altura excessiva, seguidas pelos espaços entre níveis.

Alteração limitada à apresentação: imagens panorâmicas em desktop (3,5:1 / 5:1 / 4,5:1), texto mais largo no destaque, gaps de 18 px, fronteiras discretas de 8 + 8 px e tipografia 28 / 20 / 17 px. Títulos completos, sem truncagem; subtítulos compactos. No móvel, imagem dominante 2:1, miniaturas 4:3 e separação de 10 + 10 px. O enquadramento `standard` existente é aplicado apenas às imagens deste renderer.

Validação desta correção:

- **47/47 testes aprovados**, sem alterações aos testes: `public-six-news-tiered.test.tsx`, `editorial-visual-families.test.ts`, `editorial-hierarchical-visual-grammar.test.tsx`, `public-editorial-titles-integrity.test.ts` e `public-editorial-image-framing.test.ts`.
- 12 comparações de família/viewport: 1+2+3 preservado, seis imagens carregadas no novo renderer, nenhum overflow e alturas iguais dos cartões dentro de cada linha desktop.
- Comparação lado a lado com `six_news` nos três viewports, ambos à mesma escala e com largura interna idêntica. Nenhum erro JavaScript no preview.
- Migração, identidade, registo, contratos, dados e restantes renderers sem alterações.

Para repetir: executar a fixture e abrir `/compare?width=1440`, `/compare?width=1024` ou `/compare?width=390`. A rota normal aceita `?family=six_news`, `?family=five_news_secondary` e `?family=four_news`. A variável opcional `SIX_NEWS_PREVIEW_PORT` permite comparar dois servidores locais sem interferência.

Ficheiros desta correção: `components/public/PublicSixNewsTiered.tsx`, `scripts/serve-six-news-tiered-preview.tsx` e este relatório.

## Reequilíbrio das imagens após a compactação

Branch: `codex/six-news-1-2-3-image-balance`, criada a partir de `main` atualizado em `2caea0782c68d68b4f82b8de000e1a8012b4dfc9`.

### Diagnóstico read-only

O renderer partilhado `PublicSixNewsTiered` envolve cada imagem num link `.public-six-news-tiered-media`, com `overflow: hidden`; a imagem ocupa o wrapper com `object-fit: cover` e enquadramento `standard` (`center 40%`). Não havia distorção geométrica: a sensação de imagem comprimida vinha do recorte excessivo imposto pelos ratios desktop 3,5:1 / 5:1 / 4,5:1. A 1440 px, as imagens intermédias tinham 567 × 113,4 px e as finais 372 × 82,7 px.

A comparação com `six_news` e `five_news_secondary` usou os mesmos artigos sintéticos, imagens locais, ordem, título público e viewport. O primeiro preserva o seu renderer hierárquico; o segundo usa imagens 16:9, incluindo a grelha lateral. Ambos apresentavam recortes menos rasos. No móvel, o destaque 2:1 e as miniaturas 4:3 já eram adequados.

Os espaços entre níveis já eram pequenos (8 px de margem + 8 px de padding + separador de 1 px). Reduzi-los, por si só, não compensaria imagens de largura total 16:9 nas duas linhas inferiores. A solução mantém os três níveis e coloca imagem e texto lado a lado dentro dos dois cartões intermédios.

### Alteração limitada à apresentação

- Destaque horizontal com imagem 2:1; imagens intermédias e finais 16:9 em desktop, sempre com `object-fit: cover`.
- As duas peças intermédias continuam na mesma linha; cada cartão usa 45% / 55% para imagem / texto, descontando o gap de 14 px. Altura mínima de imagem de 112 px protege as larguras desktop mais estreitas.
- Separação entre níveis reduzida para 6 + 6 px; padding acima do texto intermédio removido.
- Resumo do destaque limitado a duas linhas, intermédios a uma em desktop; as três finais não apresentam resumo. Todos os títulos continuam completos, com a tipografia 28 / 20 / 17 px existente.
- Abaixo de 680 px preservam-se o destaque 2:1, miniaturas 4:3 e organização móvel por níveis; a altura mínima desktop deixa de se aplicar.
- O fallback Jornada mantém `contain`, para mostrar o logótipo completo.

Identidade, capacidade, registos Viva/Histórica, migrations, dados e restantes famílias sem alterações. O seletor corrigido continua a ser `[data-public-visual-family="six_news_1_2_3"]`.

### Comparação antes/depois

Altura DOM da zona, incluindo título público e excluindo a fronteira exterior partilhada:

| Viewport | Antes compactado | Depois | `six_news`, inalterado | `five_news_secondary`, inalterado |
| --- | ---: | ---: | ---: | ---: |
| 1440 px | 547,4 px | 675,6 px | 474,2 px | 661,1 px |
| 1024 px | 532,3 px | 605,5 px | 443,8 px | 611,6 px |
| 390 px | 1009,0 px | 1009,0 px | 1880,4 px | 900,6 px |

Altura útil das imagens: destaque / intermédia / final:

| Viewport | Antes | Depois |
| --- | --- | --- |
| 1440 px | 129,6 / 113,4 / 82,7 px | 226,8 / 140,0 / 209,3 px |
| 1024 px | 109,5 / 95,8 / 69,6 px | 191,6 / 117,7 / 176,2 px |
| 390 px | 179,0 / 102,0 / 102,0 px | 179,0 / 102,0 / 102,0 px |

A zona cresce 128,2 px / 73,2 px nos dois viewports desktop, ficando próxima da família de cinco notícias. Continua abaixo dos 1199,5 / 1106,3 px da primeira versão. O móvel mantém a altura; retirar os resumos finais não reduz os cartões abaixo da altura das miniaturas.

### Validação

- Baseline e resultado: **66/66 testes aprovados**, zero falhas, nos oito ficheiros abaixo (todos em `lib/`). Só foi atualizada a asserção de resumos nas posições finais do teste existente.
  - `public-six-news-tiered.test.tsx`
  - `editorial-visual-families.test.ts`
  - `editorial-hierarchical-visual-grammar.test.tsx`
  - `public-editorial-titles-integrity.test.ts`
  - `public-editorial-image-framing.test.ts`
  - `editorial-historical-composition-public-dynamic.test.ts`
  - `editorial-historical-composition-admin-dynamic-preview.test.ts`
  - `public-matchday-thematic-renderer.test.ts`
- TypeScript: **912 ficheiros versionados, zero diagnósticos**; os ficheiros pessoais não versionados foram excluídos.
- Browser: 18 medições antes/depois (três famílias × três viewports × duas versões). Seis imagens carregadas, `cover`, três níveis 1/2/3, cartões com alturas iguais por linha desktop, sem overflow horizontal e sem erros JavaScript.
- As medidas completas das duas famílias de referência são idênticas antes/depois.
- Fallback de imagem vazia e de URL inválido confirmado a 1440 e 390 px: seis imagens carregadas, dois fallbacks, sem overflow.
- Comparações visuais lado a lado guardadas para 1440, 1024 e 390 px. Preview local com conteúdo sintético, sem ligação à base de dados.
- `git diff --check`: aprovado.

Para repetir a comparação, iniciar a fixture existente antes da alteração com `SIX_NEWS_PREVIEW_PORT=3114` e depois da alteração com `SIX_NEWS_PREVIEW_PORT=3115`; o bundle é criado ao arrancar cada processo. Abrir `/?family=six_news_1_2_3`, `/?family=six_news` e `/?family=five_news_secondary` em cada porta, nos mesmos viewports. Para os testes: `node --import tsx --test` seguido dos oito ficheiros indicados.

Ficheiros desta correção: `components/public/PublicSixNewsTiered.tsx`, `lib/public-six-news-tiered.test.tsx` e este relatório.

## Recuperação dos resumos nas três peças finais

Branch: `codex/six-news-final-summaries`, criada a partir de `main` atualizado em `2caea0782c68d68b4f82b8de000e1a8012b4dfc9`. Nesse momento, a correção anterior `76ddbe84` ainda não estava integrada em `origin/main`; foi reaplicada nesta branch como `c6db5851`, preservando o desenho corrigido antes desta afinação. Não houve merge.

### Diagnóstico e solução

O diagnóstico read-only confirmou que a versão corrigida excluía explicitamente os resumos do nível `final`. O estilo base já limitava os resumos a uma linha em desktop, mas a regra móvel genérica permitia duas. A imagem dominante tinha ratio 2:1 nos três viewports.

A afinação repõe o resumo quando existe nas seis posições e limita explicitamente os três finais a uma linha também no móvel. A imagem dominante passa para 2,2:1, reduzindo a altura cerca de 9%; a regra móvel redundante foi removida para herdar o mesmo ratio. O recorte continua com `object-fit: cover` e enquadramento `standard`.

As duas peças intermédias, as imagens finais, os gaps, a tipografia, a hierarquia 1+2+3 e a disponibilidade na Viva/Histórica mantêm-se. Nenhum outro renderer, contrato ou migration foi alterado.

### Comparação com a versão corrigida

Mesma fixture local, conteúdo sintético, imagens, ordem e viewport. Altura da zona incluindo título público, sem a fronteira exterior partilhada:

| Viewport | Corrigida sem resumos finais | Proposta com uma linha | Diferença |
| --- | ---: | ---: | ---: |
| 1440 px | 675,6 px | 675,8 px | +0,2 px |
| 1024 px | 605,5 px | 608,9 px | +3,4 px |
| 390 px | 1009,0 px | 992,7 px | −16,3 px |

| Viewport | Imagem dominante antes | Depois |
| --- | ---: | ---: |
| 1440 px | 226,8 px | 206,2 px |
| 1024 px | 191,6 px | 174,2 px |
| 390 px | 179,0 px | 162,7 px |

A linha de resumo acrescenta 20,8 px à última linha desktop, quase totalmente compensados pela imagem dominante. No móvel, os resumos cabem na altura que as miniaturas já reservavam. A altura da linha intermédia e as dimensões das cinco imagens seguintes são idênticas às da versão corrigida.

### Validação desta afinação

- Preview antes/depois em 1440, 1024 e 390 px, com capturas individuais e comparação lado a lado.
- Seis imagens carregadas com `cover`; recortes normais; níveis com 1/2/3 artigos; três resumos finais com clamp de uma linha e altura efetiva de uma linha em todos os viewports.
- Sem overflow horizontal, sem erros JavaScript, títulos completos e alturas iguais dos cartões de cada linha desktop.
- **66/66 testes focados aprovados**, nos mesmos oito ficheiros enumerados na secção anterior. O teste do renderer volta a exigir o conteúdo do resumo em todas as seis posições.
- **TypeScript: 912 ficheiros versionados, zero diagnósticos.**
- **`git diff --check`: aprovado.**

Ficheiros desta afinação: `components/public/PublicSixNewsTiered.tsx`, `lib/public-six-news-tiered.test.tsx` e este relatório.
