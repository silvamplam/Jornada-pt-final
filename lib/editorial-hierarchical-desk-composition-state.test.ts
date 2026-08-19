import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const client = readFileSync(
  "app/admin/editorial/composicao/[matchdayId]/HierarchicalCompositionDeskClient.tsx",
  "utf8",
);

const page = readFileSync(
  "app/admin/editorial/composicao/[matchdayId]/page.tsx",
  "utf8",
);

test("a Mesa não usa estado da página viva", () => {
  assert.doesNotMatch(
    client,
    /liveStatus\(/,
  );

  assert.doesNotMatch(
    client,
    /article\.inLatest/,
  );

  assert.doesNotMatch(
    client,
    /article\.placementKey/,
  );

  assert.doesNotMatch(
    client,
    /placementGroupForKey/,
  );

  assert.doesNotMatch(
    client,
    /placementLabelForKey/,
  );
});

test("o estado da notícia é exclusivamente o plano da Composição", () => {
  assert.match(
    client,
    /COMPOSIÇÃO · SEM COLOCAÇÃO/,
  );

  assert.match(
    client,
    /placementByBankItem\.get\([\s\S]*?article\.bankItemId/,
  );

  assert.match(
    client,
    /COMPOSIÇÃO · \$\{compositionPlacement\.toUpperCase\(\)\}/,
  );
});

test("os filtros representam apenas a Composição", () => {
  assert.match(
    client,
    /\["placed", "Na composição"\]/,
  );

  assert.match(
    client,
    /\["unplaced", "Sem colocação"\]/,
  );

  assert.match(
    client,
    /\["highlight", "Destaque da Jornada"\]/,
  );

  assert.match(
    client,
    /\["beyond", "Para Lá da Jornada"\]/,
  );

  assert.match(
    client,
    /\["faixa", "Faixa"\]/,
  );

  assert.match(
    client,
    /core:\$\{section\.key\}/,
  );

  assert.doesNotMatch(
    client,
    /"latest_without_zone"/,
  );

  assert.doesNotMatch(
    client,
    /"four_news"/,
  );

  assert.doesNotMatch(
    client,
    /"six_news"/,
  );

  assert.doesNotMatch(
    client,
    /"five_news_balanced"/,
  );

  assert.doesNotMatch(
    client,
    /"five_news_secondary"/,
  );
});

test("o servidor não envia inLatest nem placementKey para a Mesa hierárquica", () => {
  const start = page.indexOf(
    "  const hierarchicalDeskArticles =",
  );

  const end = page.indexOf(
    "  const hierarchicalDeskVideos =",
    start,
  );

  assert.ok(start >= 0 && end > start);

  const block = page.slice(start, end);

  assert.doesNotMatch(
    block,
    /inLatest:\s*article\.inLatest/,
  );

  assert.doesNotMatch(
    block,
    /placementKey:\s*article\.placementKey/,
  );
});
