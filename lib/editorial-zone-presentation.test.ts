import assert from "node:assert/strict";
import test from "node:test";

import {
  EDITORIAL_NEWS_FLOW_SLOT_TYPES,
  EDITORIAL_ZONE_PRESENTATION_PROFILES,
  buildLatestNewsAntetitle,
  isEditorialNewsFlowSlotType,
  projectEditorialArticleToZone,
  requireEditorialArticleZoneProjectionTitle
} from "./editorial-zone-presentation";

const article = {
  id: "article-1",
  slug: "noticia-teste",
  label: "LIGA PORTUGAL",
  title: "Título completo",
  subtitle: "Pós-título completo",
  image_url: "https://example.com/image.jpg",
  author: "Autor",
  published_at: "2026-08-08T14:32:00.000Z"
};

test("fecha os sete perfis editoriais com os limites definidos", () => {
  assert.deepEqual(
    Object.fromEntries(
      Object.entries(EDITORIAL_ZONE_PRESENTATION_PROFILES).map(([slot, profile]) => [
        slot,
        [profile.antetitleLines, profile.titleLines, profile.subtitleLines, profile.bodyLines, profile.showImage]
      ])
    ),
    {
      headline: [0, 5, 6, 0, true],
      editorial_line_item: [1, 4, 0, 0, false],
      side_block: [2, 6, 0, 15, true],
      highlight: [0, 3, 3, 0, true],
      roundup: [1, 1, 1, 0, true],
      complement: [1, 1, 1, 0, true],
      important_item: [1, 3, 3, 0, true]
    }
  );
});

test("o circuito noticioso exclui Contexto e Vídeo", () => {
  assert.deepEqual(EDITORIAL_NEWS_FLOW_SLOT_TYPES, [
    "headline",
    "editorial_line_item",
    "highlight",
    "complement",
    "important_item"
  ]);
  assert.equal(isEditorialNewsFlowSlotType("side_block"), false);
  assert.equal(isEditorialNewsFlowSlotType("roundup"), false);
});

test("Últimas usa hora automática, não leva imagem e oculta o pós-título por defeito", () => {
  const projection = projectEditorialArticleToZone(article, "editorial_line_item");
  assert.equal(projection.title, article.title);
  assert.equal(projection.subtitle, null);
  assert.equal(projection.imageUrl, null);
  assert.match(projection.label ?? "", /^15:32 · LIGA PORTUGAL$/);
});

test("transferir de Últimas para Manchete restaura os campos do artigo-fonte", () => {
  const latest = projectEditorialArticleToZone(article, "editorial_line_item");
  assert.equal(latest.imageUrl, null);
  assert.equal(latest.subtitle, null);

  const headline = projectEditorialArticleToZone(article, "headline");
  assert.equal(headline.imageUrl, article.image_url);
  assert.equal(headline.subtitle, article.subtitle);
  assert.equal(headline.label, null);
});

test("a hora automática pode coexistir com o texto do antetítulo", () => {
  assert.equal(buildLatestNewsAntetitle(article), "15:32 · LIGA PORTUGAL");
});

test("um fluxo que exige título normaliza-o na fronteira sem cast", () => {
  const projection = requireEditorialArticleZoneProjectionTitle(
    projectEditorialArticleToZone({ ...article, title: "  Título normalizado  " }, "complement"),
  );

  assert.equal(projection.title, "Título normalizado");
  assert.throws(
    () => requireEditorialArticleZoneProjectionTitle({ ...projection, title: null }),
    /editorial-article-projection-title-missing/,
  );
});
