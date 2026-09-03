import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { EDITORIAL_PROFILES } from "@/lib/editorial-profiles";
import type {
  MatchdayEditorialProfileDeskAutomaticItem,
} from "@/lib/editorial-matchday-profile-desk";
import {
  placeMatchdayEditorialItemAtFaixaTop,
  replaceMatchdayEditorialItemInFaixa,
  swapMatchdayEditorialItemsInFaixa,
  swapMatchdayEditorialItemsInZone,
  thematicEditorialIdentity,
} from "@/lib/editorial-matchday-profile-desk-operations";
import {
  applyMatchdayEditorialMovementPreview,
} from "@/lib/editorial-matchday-movement-preview";
import {
  reconcileMatchdayEditorialProfileDistribution,
} from "@/lib/editorial-matchday-profile-reconcile";
import {
  swapMatchdayEditorialProfileOpeningItems,
} from "@/lib/editorial-matchday-profile-workspace";

const profile = EDITORIAL_PROFILES.liga_portugal_v1;

function identity(sourceId: string) {
  return thematicEditorialIdentity(
    "editorial_article",
    sourceId,
  );
}

function item(
  sourceId: string,
  order: number,
): MatchdayEditorialProfileDeskAutomaticItem {
  return {
    sourceType: "editorial_article",
    sourceId,
    sortOrder: order,
    label: "Benfica",
    title: sourceId,
    subtitle: null,
    imageUrl: null,
    publishedAt: "2026-09-03T12:00:00.000Z",
    updatedAt: "2026-09-03T12:00:00.000Z",
    classifiedZoneKey: "benfica",
    circuitOrder: order,
    isNew: false,
  };
}

function faixaItem(sourceId: string, order: number) {
  return {
    ...item(sourceId, order),
    sortOrder: order,
    manualOverride: null,
  } as const;
}

function faixaOrder(
  overrides: ReturnType<typeof placeMatchdayEditorialItemAtFaixaTop>,
) {
  return [...overrides]
    .filter((override) => override.placementTarget === "faixa")
    .sort((left, right) => (
      (left.sortOrder ?? 0) - (right.sortOrder ?? 0)
    ))
    .map((override) => override.sourceId);
}

test("Desalojadas preserva ordem de chegada com a última no topo", () => {
  const result = applyMatchdayEditorialMovementPreview(
    {
      displacedIdentities: [identity("old")],
      vacantZoneSlots: [],
      vacantFaixaSlots: [],
    },
    [
      {
        incomingIdentity: identity("x"),
        source: { kind: "tracking" },
        target: { kind: "displaced" },
        displacedIdentity: null,
      },
      {
        incomingIdentity: identity("y"),
        source: { kind: "tracking" },
        target: { kind: "displaced" },
        displacedIdentity: null,
      },
    ],
  );

  assert.deepEqual(result.displacedIdentities, [
    identity("y"),
    identity("x"),
    identity("old"),
  ]);
});

test("duas notícias da mesma Zona fazem swap puro", () => {
  const active = [item("x", 1), item("y", 2)];
  const current = [
    { ...active[0], sortOrder: 1, manualOverride: null },
    { ...active[1], sortOrder: 2, manualOverride: null },
  ];

  const overrides = swapMatchdayEditorialItemsInZone(
    profile,
    active,
    [],
    identity("x"),
    identity("y"),
    "benfica",
    current,
  );

  const bySource = new Map(
    overrides.map((override) => [override.sourceId, override]),
  );

  assert.equal(bySource.get("x")?.sortOrder, 2);
  assert.equal(bySource.get("y")?.sortOrder, 1);
});

test("duas notícias da Abertura fazem swap puro", () => {
  const opening = swapMatchdayEditorialProfileOpeningItems(
    {
      headline: "x",
      highlight_1: "y",
      highlight_2: null,
      highlight_3: null,
      context: null,
    },
    "x",
    "highlight_1",
  );

  assert.equal(opening.headline, "y");
  assert.equal(opening.highlight_1, "x");
});

test("alvo de entrada da Faixa insere no topo e mantém sequência contínua", () => {
  const active = [item("x", 1), item("y", 2), item("z", 3)];
  const current = [
    faixaItem("x", 1),
    faixaItem("y", 2),
  ];

  const overrides = placeMatchdayEditorialItemAtFaixaTop(
    profile,
    active,
    [],
    identity("z"),
    current,
  );

  assert.deepEqual(faixaOrder(overrides), ["z", "x", "y"]);
});

test("duas notícias já na Faixa trocam de posição", () => {
  const active = [item("x", 1), item("y", 2), item("z", 3)];
  const current = [
    faixaItem("x", 1),
    faixaItem("y", 2),
    faixaItem("z", 3),
  ];

  const overrides = swapMatchdayEditorialItemsInFaixa(
    profile,
    active,
    [],
    identity("x"),
    identity("z"),
    current,
  );

  assert.deepEqual(faixaOrder(overrides), ["z", "y", "x"]);
});

test("entrada externa sobre card da Faixa substitui só esse card", () => {
  const active = [
    item("x", 1),
    item("y", 2),
    item("z", 3),
    item("incoming", 4),
  ];
  const current = [
    faixaItem("x", 1),
    faixaItem("y", 2),
    faixaItem("z", 3),
  ];

  const overrides = replaceMatchdayEditorialItemInFaixa(
    profile,
    active,
    [],
    identity("incoming"),
    identity("y"),
    current,
  );

  assert.deepEqual(
    faixaOrder(overrides),
    ["x", "incoming", "z"],
  );
});

test("preview autoritativo pode deixar vaga sem autofill nem promoção à Faixa", () => {
  const active = [
    item("a", 1),
    item("b", 2),
    item("c", 3),
    item("d", 4),
    item("candidate", 5),
  ];
  const applied = active.slice(0, 4).map((entry, index) => ({
    sourceType: entry.sourceType,
    sourceId: entry.sourceId,
    zoneKey: "benfica" as const,
    sortOrder: index + 1,
  }));

  const result = reconcileMatchdayEditorialProfileDistribution(
    profile,
    active,
    [],
    applied,
    true,
    [],
    {
      vacantZoneSlots: [
        { zoneKey: "benfica", slotPosition: 5 },
      ],
      allowAutomaticPlacement: false,
    },
  );

  const benfica = result.zonesAfter.find(
    (zone) => zone.key === "benfica",
  );

  assert.equal(benfica?.items.length, 4);
  assert.equal(
    result.faixaAfter.some(
      (entry) => entry.sourceId === "candidate",
    ),
    false,
  );
});

test("cliente expõe destinos explícitos e mantém Novas sem drop", () => {
  const client = readFileSync(
    "app/admin/editorial/jornada/[matchdayId]/organizar/MatchdayEditorialThematicDeskClient.tsx",
    "utf8",
  );

  assert.match(client, /function placeInDisplaced/u);
  assert.match(client, /function placeAtFaixaTop/u);
  assert.match(client, /swapMatchdayEditorialItemsInZone/u);
  assert.match(client, /swapMatchdayEditorialItemsInFaixa/u);
  assert.match(client, /swapMatchdayEditorialProfileOpeningItems/u);
  assert.match(
    client,
    /Largar aqui · entra no topo da Faixa/u,
  );
  assert.match(
    client,
    /Largar aqui · passa para Desalojadas/u,
  );
  assert.equal(
    client.includes('onDragOver={state === "NOVA" ? undefined : allowDrop}'),
    true,
  );
  assert.match(client, /allowAutomaticPlacement: false/u);
  assert.equal(
    client.includes('if (state === "FAIXA") {'),
    true,
  );
  assert.equal(
    client.includes('(left.item.sortOrder ?? Number.MAX_SAFE_INTEGER)'),
    true,
  );
});

test("rota usa v12 e transporta relógios editoriais de chegada", () => {
  const route = readFileSync(
    "app/api/admin/editorial/jornada/[matchdayId]/organizar/tematico/route.ts",
    "utf8",
  );

  assert.match(
    route,
    /rpc\/apply_matchday_editorial_profile_workspace_v12/u,
  );
  assert.match(route, /p_faixa_arrival_bank_item_ids/u);
  assert.match(route, /p_displaced_arrival_bank_item_ids/u);
  assert.match(route, /allowAutomaticPlacement: false/u);
});

test("v12 serializa antes da leitura e preserva relógios de Faixa", () => {
  const migration = readFileSync(
    "supabase/migrations/20260903204800_matchday_editorial_movement_contract_v12.sql",
    "utf8",
  );

  const lock = migration.indexOf(
    "acquire_matchday_live_layout_cutover_writer_lock",
  );
  const snapshot = migration.indexOf(
    "into v_faixa_before",
  );
  const delegate = migration.indexOf(
    "apply_matchday_editorial_profile_workspace_v11_pre_handoff",
  );

  assert.ok(lock >= 0);
  assert.ok(snapshot > lock);
  assert.ok(delegate > snapshot);
  assert.match(
    migration,
    /set created_at = previous\.created_at/u,
  );
  assert.match(
    migration,
    /p_faixa_arrival_bank_item_ids/u,
  );
  assert.match(
    migration,
    /p_displaced_arrival_bank_item_ids/u,
  );
  assert.match(
    migration,
    /faixa-not-contiguous/u,
  );
});
