# Abertura Viva e respiração da zona de seis artigos

Branch: `codex/abertura-viva-respirada`.

Base: `273e393d`, após `git fetch origin`, atualização de `main` por fast-forward e criação da branch. O diagnóstico de cada zona e as respetivas capturas foram feitos antes de alterar o seu código. Os ficheiros pessoais não versionados existentes foram preservados.

O pedido adicional da zona de seis artigos foi integrado nesta mesma branch. A abertura mantém a área total; só a zona `six_news_1_2_3` pode ganhar altura. Sem alterações à base de dados, seleção de artigos, alimentação das zonas, publicação, escolha Viva/Histórica ou outras famílias.

## Diagnóstico da abertura

Página real ensaiada: `/competicoes/liga-portugal/2026-27/jornadas/8`. Servidor local ligado a `127.0.0.1:3100`; apenas navegação e leitura, sem operações editoriais de escrita.

O renderer é `components/public/PublicEditorialLayout.tsx`: `PublicHeadlineBlock`, `PublicSideBlock`, `PublicHighlightsSection` e `PublicHighlightCard`. Os estilos de base estão em `components/public/publicEditorialStyles.ts` e na página da jornada; o CSS final de composição está em `publicEditorialLayoutPolishStyles`, dentro do renderer.

A 1440 px, o contentor mede 1200 px e a grelha superior é `850 + 20 + 330`. A lateral tem mais 20 px de recuo interno, logo a largura útil é 310 px. Dentro da manchete, o texto ocupa 316,2 px, seguido de um intervalo de 18 px e de uma imagem de 515,8 px. Os três inferiores têm 274 px cada, separados por 14 px.

A 1024 px, o contentor mede 976 px e a grelha é `696 + 20 + 260`; a lateral dispõe de 240 px úteis. A 390 px, há uma coluna de 358 px, com a ordem existente: manchete, imagem, três inferiores e lateral.

Os antetítulos dos inferiores já estavam escondidos no desktop, mas permaneciam no DOM e reapareciam no mobile por uma regra existente. Os pós-títulos também eram renderizados. A nova apresentação omite ambos no JSX apenas para a abertura com `scope="matchday"`. Os consumidores partilhados mantêm o comportamento anterior por defeito.

## Solução visual

A referência orientou a organização: texto à esquerda, imagem dominante ao centro, lateral autónoma e uma linha de três peças simples. Mantêm-se tipografia, cores, artigos, ligações e identidade Jornada.

Em desktop, a grelha passa a `842 + 48 + 310`. Retirou-se o recuo interno da lateral: a sua largura útil continua a ser 310 px. O espaço real entre a manchete e a lateral passa de 40 para 48 px. Entre texto e imagem principal, o intervalo passa de 18 para 32 px; entre inferiores, de 14 para 28 px. A imagem principal fica ligeiramente mais estreita e mais alta, com `object-fit: cover`. As imagens inferiores ficam ligeiramente menores e os respetivos títulos ganham espaço e entrelinha.

O texto da manchete tem intervalos de 14 px e entrelinha de 22,5 px no pós-título. O título e o autor mantêm-se. Na composição de duas colunas, o pós-título deixa de ser cortado a seis linhas em desktop/tablet. A lateral conserva imagem, antetítulo, título, autor e pós-título.

No mobile mantêm-se a ordem e as imagens inferiores em 16:9. O espaço libertado pelos textos removidos é distribuído pela manchete, intervalos e imagem lateral em retrato. A altura global mantém-se. Não foi imposta uma altura fixa ao contentor: as alturas mínimas do topo preservam o equilíbrio da abertura atual e continuam a permitir títulos mais longos sem os cortar.

O afastamento da geometria exata da referência serve para caber nos 1200 px existentes e no conteúdo real da Jornada. Não se copiam o estilo externo, os recortes de títulos ou as dimensões absolutas da imagem de referência.

## Dimensões antes/depois

Valores em píxeis CSS, Chromium, DPR 1, fontes e imagens carregadas. Altura total inclui o padding da abertura.

| Viewport | Largura antes → depois | Altura antes → depois | Variação de altura |
|---|---:|---:|---:|
| 1440 | 1200 → 1200 | 671,67 → 672,38 | +0,70 (+0,10%) |
| 1024 | 976 → 976 | 737,44 → 736,98 | −0,45 (−0,06%) |
| 390 | 358 → 358 | 2509,52 → 2508,52 | −1,00 (−0,04%) |

Dimensões dos blocos, largura × altura:

| Bloco | 1440: antes → depois | 1024: antes → depois | 390: antes → depois |
|---|---|---|---|
| Manchete, incluindo imagem | 850 × 301,3 → 842 × 348 | 696 × 379,6 → 684 × 415 | 358 × 628,6 → 358 × 686,6 |
| Texto da manchete | 316,2 × 290,3 → 307,8 × 329,8 | 258 × 368,6 → 301,8 × 339,1 | 358 × 299,6 → 358 × 329,6 |
| Imagem principal | 515,8 × 285 → 502,2 × 312 | 420 × 300 → 354,3 × 312 | 358 × 300 → 358 × 300 |
| Lateral, incluindo recuos | 330 × 631,7 → 310 × 632,4 | 260 × 697,4 → 260 × 697 | 358 × 482,3 → 358 × 665,3 |
| Imagem lateral | 310 × 419,6 → 310 × 416,3 | 240 × 180 → 260 × 461,7 | 358 × 268,5 → 358 × 447,5 |
| Conjunto dos três inferiores | 850 × 294,3 → 842 × 244,4 | 696 × 283,8 → 684 × 236 | 358 × 1300,6 → 358 × 1038,6 |
| Imagem de cada inferior | 274 × 154,1 → 262 × 147,4 | 222,7 × 125,2 → 209,3 × 117,7 | 358 × 201,4 → 358 × 201,4 |

Cada cartão inferior mede 274 × 294,3 antes e 262 × 244,4 depois em 1440; 222,7 × 283,8 antes e 209,3 × 236 depois em 1024. Em 390, as alturas dos cartões são 410,1 / 410,1 / 432,4 antes e 327,1 / 327,1 / 320,4 depois, sempre com 358 px de largura.

## Zona de seis artigos — 1 + 2 + 3

Renderer: `components/public/PublicSixNewsTiered.tsx`, família `six_news_1_2_3`, ativa em “Benfica agora” na mesma página real. A família antiga `six_news` não foi alterada.

O diagnóstico confirmou 18 px entre colunas em desktop e apenas `6 + 1 + 6 = 13 px` entre o conteúdo de linhas consecutivas. No mobile, havia 14 px entre peças da mesma linha editorial e 21 px entre níveis. A mudança só ajusta o CSS deste renderer: os seis artigos, os resumos, a ordem 1+2+3 e o texto à esquerda/imagem à direita da segunda linha permanecem.

| Viewport | Largura antes → depois | Altura antes → depois | Aumento |
|---|---:|---:|---:|
| 1440 | 1200 → 1200 | 740,36 → 815,47 | +75,11 (+10,1%) |
| 1024 | 976 → 976 | 660,14 → 747,06 | +86,92 (+13,2%) |
| 390 | 358 → 358 | 1152,81 → 1305,34 | +152,53 (+13,2%) |

| Intervalo | Desktop/tablet antes → depois | Mobile antes → depois |
|---|---:|---:|
| Entre artigos da mesma linha editorial | 18 → 32, horizontal | 14 → 28, vertical |
| Entre 1.ª e 2.ª linhas | 13 → 49 | 21 → 49 |
| Entre 2.ª e 3.ª linhas | 13 → 49 | 21 → 49 |
| Imagem/texto da peça principal | 18 → 28 | 10 → 18 |
| Texto/imagem da segunda linha | 14 → 22 | 14 → 14 |
| Intervalos entre campos de texto | 4 → 8 | 4 → 8 |
| Imagem/texto da última linha | 6 → 12 | 14 → 14, horizontal |

Os 49 px entre níveis correspondem a 24 px antes do traço, 1 px de traço e 24 px depois. No mobile os cartões já estão empilhados; a distância horizontal interna mantém-se para preservar a largura de leitura. A altura adicional resulta dos espaços e da composição natural, sem comprimir imagens ou cortar títulos para a compensar.

## Evidência visual

Capturas antes/depois com o mesmo conteúdo real e os mesmos viewports. As imagens completas foram recortadas pelas coordenadas medidas; os comparativos apresentam ambos os estados à mesma escala. Os indicadores de desenvolvimento eventualmente visíveis pertencem ao servidor local.

Pasta local de evidência: `C:/Users/silva/.codex/visualizations/2026/09/28/01a0e72b-ae56-7842-a5c5-88f59de44ed4`.

| Viewport | Abertura | Seis artigos |
|---|---|---|
| 1440 | `opening-comparison-1440.png` | `six-comparison-1440.png` |
| 1024 | `opening-comparison-1024.png` | `six-comparison-1024.png` |
| 390 | `opening-comparison-390.png` | `six-comparison-390.png` |

As medições detalhadas estão em `before-*.json`, `after-*.json`, `six-before-*.json` e `six-after-*.json`. Os controlos estão em `browser-checks-*.json` e `controls-*.json`.

## Validação

- Browser nas três larguras: nenhum overflow horizontal; títulos completos; cinco imagens da abertura e seis da zona 1+2+3 carregadas e com `cover`; nenhum erro JavaScript nem overlay de erro.
- Mesmos artigos, imagens, links, autor e texto da manchete/lateral, comparados com a baseline. Os três inferiores têm apenas os nós de imagem e título. Os seis artigos conservam textos e ligações, bem como a ordem e o sentido texto/imagem da segunda linha.
- Nove controlos por viewport com geometria relativa e tipografia iguais ao repor temporariamente os estilos originais no browser: cabeçalho, publicidade horizontal, três zonas `six_news`, `four_news`, `five_news_balanced`, `five_news_secondary` e classificação. As deslocações verticais das zonas seguintes decorrem do crescimento autorizado da zona 1+2+3.
- Testes de renderização adicionais verificam a omissão real dos campos, a preservação dos campos da manchete/lateral, a ocupação de 0/1/2/3 inferiores e o comportamento inalterado da Home e dos consumidores partilhados.
- TypeScript: 914 ficheiros do projeto, zero diagnósticos; excluído apenas o handoff pessoal não versionado que já existia.
- `git diff --check`: aprovado.

Bateria focada: **118 de 122 testes passaram**. As quatro falhas foram reproduzidas com o conteúdo original de `273e393d`, através de um preload de leitura, sem mudar os ficheiros da branch. São expectativas textuais anteriores: fallback do título complementar e cor da barra em `public-home-editorial-responsive-layout.test.ts`; expectativa do renderer 4+Últimas em `public-live-hierarchical-layouts.test.ts`; seletor antigo de dois destaques em `public-matchday-opening-adaptive-layout.test.ts`. Não houve falhas novas. Os outros 87 testes, incluindo todos os novos e os da zona 1+2+3, passaram integralmente.

```powershell
node --import tsx --test lib/public-live-opening.test.tsx lib/public-matchday-opening-adaptive-layout.test.ts lib/public-matchday-conditional-layout.test.ts lib/public-home-editorial-responsive-layout.test.ts lib/public-mobile-layout.test.ts lib/public-six-news-tiered.test.tsx lib/editorial-visual-families.test.ts lib/editorial-hierarchical-visual-grammar.test.tsx lib/public-editorial-titles-integrity.test.ts lib/public-editorial-image-framing.test.ts lib/editorial-historical-composition-public-dynamic.test.ts lib/editorial-historical-composition-admin-dynamic-preview.test.ts lib/public-matchday-thematic-renderer.test.ts lib/public-live-hierarchical-layouts.test.ts
```

## Ficheiros alterados

- `components/public/PublicEditorialLayout.tsx`: opção de apresentação imagem/título, propagada apenas para a abertura Viva; ativação dos estilos específicos.
- `components/public/publicLiveOpeningStyles.ts`: composição e espaçamento isolados da abertura.
- `components/public/PublicSixNewsTiered.tsx`: mais espaço entre peças, linhas e campos, exclusivamente na família 1+2+3.
- `lib/public-live-opening.test.tsx`: testes de renderização e de isolamento editorial.
- `docs/abertura-viva-espacamento-20260928.md`: diagnóstico, medições e validação.

Entrega em branch própria, com commit e push, sem merge.
