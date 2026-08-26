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

test("a Mesa não usa colocações da página viva como estado da composição", () => {
  assert.doesNotMatch(client, /liveStatus\(/);
  assert.doesNotMatch(client, /article\.inLatest/);
  assert.doesNotMatch(client, /article\.placementKey/);
  assert.doesNotMatch(client, /placementGroupForKey/);
  assert.doesNotMatch(client, /placementLabelForKey/);
});

test("o estado da peça é exclusivamente o plano local da Composição", () => {
  assert.match(client, /placementByBankItem/);
  assert.match(client, /placedBankItemIds/);
  assert.match(client, /filterHistoricalCompositionReservoir/);
  assert.match(client, /DISPONÍVEL/);
  assert.match(client, /Retirada planeada/);
});

test("os filtros são grupos naturais e não placements da Mesa viva", () => {
  assert.match(
    client,
    /HISTORICAL_DYNAMIC_ZONE_LAYOUTS/,
  );

  assert.match(
    client,
    /value="six_news"/,
  );

  assert.match(
    client,
    /value="five_news_balanced"/,
  );

  assert.match(
    client,
    /value="five_news_secondary"/,
  );

  assert.match(
    client,
    /activeWorkspaceKey === `dynamic:\$\{zone\.clientId\}`/,
  );

  assert.doesNotMatch(
    client,
    /"latest_without_zone"/,
  );
});

test("o servidor envia classificação natural, não placement atual, para a Mesa histórica", () => {
  const start = page.indexOf("  const hierarchicalDeskArticles =");
  const end = page.indexOf("  const hierarchicalDeskSlots =", start);
  assert.ok(start >= 0 && end > start);
  const block = page.slice(start, end);

  assert.match(block, /naturalGroupKey/);
  assert.doesNotMatch(block, /inLatest:\s*article\.inLatest/);
  assert.doesNotMatch(block, /placementKey:\s*article\.placementKey/);
});
