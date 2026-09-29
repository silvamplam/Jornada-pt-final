import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  findJornadaStructuralMarker,
  findJornadaStructuralMarkerInArticle,
  findJornadaStructuralMarkerInPublicationBatch,
} from "./editorial-structural-markers";

test("deteta apenas marcadores estruturais Jornada versionados, inclusive variantes de whitespace", () => {
  for (const marker of [
    "[JORNADA_CONTINUIDADE_V1]",
    "[/JORNADA_CONTINUIDADE_V1]",
    "[JORNADA_ARTIGO_V1]",
    "[/JORNADA_ARTIGO_V1]",
    "\u00a0[/JORNADA_CONTINUIDADE_V1]\u200b",
    "[/JORNADA_\u200bCONTINUIDADE_V1]",
    "[/JORNADA_OUTRO_CONTRATO_V2]",
  ]) {
    assert.ok(findJornadaStructuralMarker(`Texto antes ${marker} texto depois`), marker);
  }
  for (const text of [
    "A Jornada continua na versão 1.",
    "O artigo cita [JORNADA_CONTINUIDADE] como expressão histórica.",
    "[OUTRO_CONTRATO_V1]",
    "[JORNADA_CONTINUIDADE_VX]",
    "JORNADA_CONTINUIDADE_V1",
    "[JORNADA_CONTINUIDADE_V1 sem fecho",
  ]) {
    assert.equal(findJornadaStructuralMarker(text), null, text);
  }
});

test("procura somente nos campos publicáveis do artigo", () => {
  assert.deepEqual(findJornadaStructuralMarkerInArticle({
    outputId: "[JORNADA_ARTIGO_V1]",
    body: "Texto. [/JORNADA_CONTINUIDADE_V1]",
  }), { field: "body", marker: "[/JORNADA_CONTINUIDADE_V1]" });
  assert.equal(findJornadaStructuralMarkerInArticle({
    outputId: "[JORNADA_ARTIGO_V1]",
    body: "Texto jornalístico normal.",
  }), null);
  assert.deepEqual(findJornadaStructuralMarkerInArticle({
    body: "Texto normal.",
    image_caption: "Legenda [/JORNADA_ARTIGO_V1]",
  }), { field: "image_caption", marker: "[/JORNADA_ARTIGO_V1]" });
});

test("o servidor inspeciona todo o payload antes de entrar nos handlers de publicação", () => {
  assert.deepEqual(findJornadaStructuralMarkerInPublicationBatch("Editor", [
    { body: "Artigo válido." },
    { body: "Corpo integral. [/JORNADA_CONTINUIDADE_V1]" },
  ]), {
    articleIndex: 2,
    field: "body",
    marker: "[/JORNADA_CONTINUIDADE_V1]",
  });
  assert.deepEqual(findJornadaStructuralMarkerInPublicationBatch("Editor [JORNADA_ARTIGO_V1]", []), {
    articleIndex: null,
    field: "author",
    marker: "[JORNADA_ARTIGO_V1]",
  });
  assert.equal(findJornadaStructuralMarkerInPublicationBatch("Editor", []), null);
  const route = readFileSync("app/api/admin/editorial/redacao-automatica/publicacao-lote/route.ts", "utf8");
  const validation = route.indexOf("const technicalMarker = findJornadaStructuralMarkerInPublicationBatch(");
  assert.ok(validation > 0);
  assert.ok(validation < route.indexOf('if (action === "publish_item")'));
  assert.ok(validation < route.indexOf('if (action === "publish_theme_continuity")'));
});
