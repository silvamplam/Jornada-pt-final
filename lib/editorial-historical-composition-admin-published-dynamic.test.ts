import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  "app/admin/editorial/composicao/[matchdayId]/page.tsx",
  "utf8",
);

test("published dynamic composition uses dynamic renderer and keeps legacy fallback", () => {
  const card = source.indexOf(
    '<Card title={presentationMode === "hierarchical" ?',
  );
  assert.ok(card >= 0);

  const dynamicDecision = source.indexOf(
    "hasHistoricalDynamicZones ? (",
    card,
  );
  assert.ok(dynamicDecision > card);

  const dynamicZones = source.indexOf(
    "historicalDynamicPreviewZones.map((zone) => (",
    dynamicDecision,
  );
  assert.ok(dynamicZones > dynamicDecision);

  const flexibleRenderer = source.indexOf(
    "<PublicFlexibleZoneLayout",
    dynamicZones,
  );
  assert.ok(flexibleRenderer > dynamicZones);

  const legacyFallback = source.indexOf(
    "<HierarchicalCompositionEditor",
    flexibleRenderer,
  );
  assert.ok(legacyFallback > flexibleRenderer);
});