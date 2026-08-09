import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

function source(relativePath: string) {
  return readFileSync(fileURLToPath(new URL(`../${relativePath}`, import.meta.url)), "utf8");
}

const layout = source("components/public/PublicEditorialLayout.tsx");
const horizontal = source("components/public/PublicHorizontalNewsStrip.tsx");
const roundup = source("components/public/RoundupVideoSwitcher.tsx");
const matchdayPage = source("app/competicoes/[competitionSlug]/[seasonLabel]/jornadas/[matchdayNumber]/page.tsx");
const compositionPage = source("app/admin/editorial/composicao/[matchdayId]/page.tsx");
const compositionRoute = source("app/api/admin/editorial/composicao/route.ts");

test("a Jornada aplica os limites visuais definidos sem alterar a Home", () => {
  assert.match(layout, /data-editorial-scope=\{scope\}/);
  assert.match(matchdayPage, /<PublicEditorialLayout[\s\S]*?scope="matchday"/);
  assert.match(layout, /data-editorial-scope="matchday"[\s\S]*?public-matchday-editorial h1[\s\S]*?-webkit-line-clamp:\s*5/);
  assert.match(layout, /public-below-headline-highlights[\s\S]*?-webkit-line-clamp:\s*3/);
  assert.match(layout, /public-news-title[\s\S]*?-webkit-line-clamp:\s*4/);
  assert.match(layout, /public-side-editorial-label[\s\S]*?-webkit-line-clamp:\s*2/);
  assert.match(layout, /public-side-editorial-copy strong[\s\S]*?-webkit-line-clamp:\s*6/);
  assert.match(layout, /public-side-editorial-copy p[\s\S]*?-webkit-line-clamp:\s*15/);
  assert.match(layout, /public-matchday-depth-row[\s\S]*?public-complement-body strong[\s\S]*?-webkit-line-clamp:\s*1/);
});

test("Últimas não apresenta imagem e a Faixa usa 1/3/3 linhas na Jornada", () => {
  assert.match(layout, /data-editorial-scope="matchday"[\s\S]*?public-matchday-news \.public-news-thumb \{\s*display:\s*none/);
  assert.match(matchdayPage, /<PublicHorizontalNewsStrip[^>]*scope="matchday"/);
  assert.match(horizontal, /data-editorial-scope="matchday"[\s\S]*?public-horizontal-news-label[\s\S]*?-webkit-line-clamp:\s*1/);
  assert.match(horizontal, /public-horizontal-news-title[\s\S]*?public-horizontal-news-card p[\s\S]*?-webkit-line-clamp:\s*3/);
});

test("o Vídeo usa uma linha e a Jornada alinha estruturalmente sem mexer no alinhamento validado das outras páginas", () => {
  assert.match(roundup, /public-roundup-active-body strong,[\s\S]*?public-roundup-active-body p[\s\S]*?-webkit-line-clamp:\s*1/);
  assert.match(layout, /reserveHeadingSpace=\{scope === "matchday" && hasRoundupSummary && hasComplementary\}/);
  assert.match(layout, /public-depth-zone-heading-placeholder/);
  assert.match(layout, /margin-top:\s*-6px/);
  assert.match(layout, /data-editorial-scope="matchday"[\s\S]*?margin-top:\s*0/);
});

test("o fluxo de artigo completo publica e transfere apenas pelas cinco zonas noticiosas", () => {
  assert.match(compositionPage, /Publicar nesta zona/);
  assert.match(compositionPage, /Transferir para outra zona/);
  assert.match(compositionPage, /editorialArticleFlowSlotOptions/);
  assert.match(compositionRoute, /projectEditorialArticleToZone/);
  assert.match(compositionRoute, /resolveEditorialArticleIdForCompositionItem/);
  assert.match(compositionRoute, /article_id:\s*null/);
  assert.match(compositionRoute, /Os artigos noticiosos não podem ser transferidos para Contexto ou Vídeo/);
  assert.match(compositionPage, /update_article_zone_presentation/);
  assert.match(compositionPage, /Antetítulo \/ hora/);
  assert.match(compositionPage, /Pós-título manual, opcional/);
  assert.match(compositionRoute, /actionType === "update_article_zone_presentation"/);
});

test("uma transferência não elimina silenciosamente o conteúdo que já ocupa uma zona limitada", () => {
  assert.match(compositionRoute, /assertCompositionSlotCapacity/);
  assert.match(compositionRoute, /Transfere ou retira primeiro um item dessa zona/);
  assert.doesNotMatch(compositionRoute, /slot_type=eq\.\$\{encodeURIComponent\(targetSlotType\)\}&id=neq/);
});
