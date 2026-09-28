# Inversão de imagem e texto na zona 1+2+3

Branch: `codex/viva-tiered-image-text-order`.
Base: `29966131`, após atualizar `main` por fast-forward com `origin/main`.

## Âmbito confirmado

O diagnóstico distinguiu a abertura propriamente dita da zona 1+2+3 “Benfica agora”. A abertura já tinha texto à esquerda e imagem à direita, autor na manchete e três inferiores apenas com imagem e título. A zona 1+2+3 tinha a composição indicada para inversão, mas campos diferentes.

O utilizador confirmou: inverter apenas a principal e as duas intermédias da zona 1+2+3, preservar os campos atuais e deixar a abertura intacta. Não foram introduzidos autores nem removidos resumos nesta zona.

## Diagnóstico read-only

O componente `components/public/PublicSixNewsTiered.tsx` controla a grelha, através do renderer da família `six_news_1_2_3`. A página real ensaiada foi `/competicoes/liga-portugal/2026-27/jornadas/8`, com a família ativa em “Benfica agora”.

- Principal: imagem seguida de texto; colunas `.8fr / 1.2fr`; gap de 28 px.
- Intermédias: duas peças na linha, cada uma com colunas `1.1fr / .9fr` e áreas `"copy media"`; gap interno de 22 px.
- Terceira linha: três peças com os campos atuais, sem necessidade de alterações.
- Mobile: regras próprias até 680 px; principal empilhada e intermédias com texto à esquerda e imagem à direita.

As medições e capturas iniciais foram recolhidas antes da edição. A inversão era possível exclusivamente por CSS, sem alterar JSX, ordem dos artigos, dados ou contratos.

## Implementação

Acrescentado um único bloco `@media (min-width: 681px)`, com 17 linhas, no CSS do renderer:

- Principal: colunas `1.2fr / .8fr` e áreas `"copy media"`; atribuição explícita das áreas aos dois elementos.
- Intermédias: colunas `.9fr / 1.1fr` e áreas `"media copy"`.

As proporções acompanham cada elemento na inversão, conservando as larguras anteriores do texto e da imagem. Não há mudanças nos gaps, tipografia, enquadramento, alturas declaradas, terceira linha ou regras mobile. As imagens continuam com `object-fit: cover`.

## Validação antes/depois

Chromium, DPR 1, mesmos artigos, imagens e ligações, com fontes e imagens carregadas.

| Viewport | Largura antes → depois | Altura antes → depois | Diferença |
|---|---:|---:|---:|
| 1440 | 1200 → 1200 | 815,46875 → 815,484375 | +0,015625 px |
| 1024 | 976 → 976 | 747,0625 → 747,078125 | +0,015625 px |
| 390 | 358 → 358 | 1305,34375 → 1305,34375 | 0 px |

Confirmado no browser:

- Principal com texto à esquerda; duas intermédias com imagem à esquerda, nos dois viewports acima do breakpoint mobile.
- Mesmas dimensões de texto e imagem, com tolerância de 0,1 px para arredondamento subpíxel; mesmos gaps e fontes.
- Mesmos seis artigos, campos, links, imagens e distribuição 1+2+3.
- Terceira linha com geometria e conteúdo preservados.
- Mobile com métricas idênticas e screenshot da zona idêntico píxel a píxel.
- Sem overflow horizontal, deformação de imagens, falhas de carregamento ou erros JavaScript.
- Dez controlos por viewport sem mudanças de geometria ou tipografia: abertura, cabeçalho, publicidade horizontal, três zonas `six_news`, `four_news`, `five_news_balanced`, `five_news_secondary` e classificação.
- A abertura conserva exatamente as suas dimensões: 1200 × 672,375; 976 × 736,984375; 358 × 2508,515625 px.

**75/75 testes focados passaram**, incluindo família 1+2+3, lugares vagos, fallback de imagens, campos editoriais, renderer anterior, composições históricas, abertura Viva e mobile. `git diff --check` aprovado.

```powershell
node --import tsx --test lib/public-six-news-tiered.test.tsx lib/editorial-visual-families.test.ts lib/editorial-hierarchical-visual-grammar.test.tsx lib/public-editorial-titles-integrity.test.ts lib/public-editorial-image-framing.test.ts lib/editorial-historical-composition-public-dynamic.test.ts lib/editorial-historical-composition-admin-dynamic-preview.test.ts lib/public-matchday-thematic-renderer.test.ts lib/public-live-opening.test.tsx lib/public-mobile-layout.test.ts
```

## Evidência e ficheiros

Pasta local: `C:/Users/silva/.codex/visualizations/2026/09/28/01a0e72b-ae56-7842-a5c5-88f59de44ed4/viva-order`.

- `comparison-1440.png`, `comparison-1024.png`, `comparison-390.png`: antes/depois à mesma escala.
- `before-*.json`, `after-*.json`: medidas de cada peça e dos controlos.
- `verification.json`: resultados das comparações automáticas.
- `tests.log`: execução dos testes focados.

Ficheiros alterados: `components/public/PublicSixNewsTiered.tsx` e este relatório. Os ficheiros pessoais não versionados existentes foram preservados. Entrega por commit e push na nova branch, sem merge.
