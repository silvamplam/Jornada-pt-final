import assert from "node:assert/strict";
import test from "node:test";

import type { EditorialProfileZoneKey } from "@/lib/editorial-profiles";
import type { MatchdayEditorialProfileDeskAutomaticItem } from "@/lib/editorial-matchday-profile-desk";
import {
  buildMatchdayEditorialProfileEffectiveDistribution,
  fixMatchdayEditorialItemsAtPosition,
  fixMatchdayEditorialItemsInZone,
  moveMatchdayEditorialItemsToBank,
  moveMatchdayEditorialItemsToFaixa,
  reconcileMatchdayEditorialProfileDeskSnapshot,
  releaseMatchdayEditorialFixedPositions,
  returnMatchdayEditorialItemsToAutomatic,
  thematicEditorialIdentity,
  validateMatchdayEditorialProfileManualOverrides,
  type MatchdayEditorialProfileManualOverride,
} from "@/lib/editorial-matchday-profile-desk-operations";
import { EDITORIAL_PROFILES } from "@/lib/editorial-profiles";

const profile = EDITORIAL_PROFILES.liga_portugal_v1;

function automaticItem(
  sourceId: string,
  automaticZoneKey: EditorialProfileZoneKey | null,
  automaticSortOrder: number | null,
  actuality: number,
): MatchdayEditorialProfileDeskAutomaticItem {
  const hour = String(actuality).padStart(2, "0");
  return {
    sourceType: "editorial_article",
    sourceId,
    sortOrder: automaticSortOrder,
    classifiedZoneKey: automaticZoneKey,
    actualityOrder: automaticSortOrder,
    label: `Label ${sourceId}`,
    title: `Título ${sourceId}`,
    subtitle: null,
    imageUrl: null,
    publishedAt: `2026-08-22T${hour}:00:00.000Z`,
    updatedAt: `2026-08-22T${hour}:00:00.000Z`,
  };
}

function identity(sourceId: string): string {
  return thematicEditorialIdentity("editorial_article", sourceId);
}

function override(
  sourceId: string,
  zoneKey: EditorialProfileZoneKey | null,
  sortOrder: number | null,
): MatchdayEditorialProfileManualOverride {
  return {
    sourceType: "editorial_article",
    sourceId,
    placementTarget: zoneKey === null ? "bank" : "zone",
    zoneKey,
    sortOrder,
  };
}

function zoneIds(
  activeItems: readonly MatchdayEditorialProfileDeskAutomaticItem[],
  overrides: readonly MatchdayEditorialProfileManualOverride[],
  zoneKey: EditorialProfileZoneKey,
): string[] {
  const distribution = buildMatchdayEditorialProfileEffectiveDistribution(profile, activeItems, overrides);
  return distribution.zones.find((zone) => zone.key === zoneKey)?.items.map((item) => item.sourceId) ?? [];
}

test("sem overrides, a distribuição efetiva reproduz a baseline automática", () => {
  const activeItems = [
    automaticItem("a", "benfica", 1, 12),
    automaticItem("b", "benfica", 2, 11),
    automaticItem("overflow", null, null, 10),
  ];
  const result = buildMatchdayEditorialProfileEffectiveDistribution(profile, activeItems, []);

  assert.deepEqual(result.zones[0].items.map((item) => item.sourceId), ["a", "b"]);
  assert.deepEqual(result.bank.map((item) => item.sourceId), ["overflow"]);
  assert.equal(result.zones.flatMap((zone) => zone.items).every((item) => item.manualOverride === null), true);
});

test("um override move para outra zona sem duplicar e um override NULL/NULL move para o banco", () => {
  const activeItems = [
    automaticItem("moved", "benfica", 1, 12),
    automaticItem("removed", "benfica", 2, 11),
  ];
  const overrides = [override("moved", "sporting", null), override("removed", null, null)];
  const result = buildMatchdayEditorialProfileEffectiveDistribution(profile, activeItems, overrides);
  const allVisible = [
    ...result.zones.flatMap((zone) => zone.items.map((item) => item.sourceId)),
    ...result.bank.map((item) => item.sourceId),
  ];

  assert.deepEqual(result.zones[0].items, []);
  assert.deepEqual(result.zones[1].items.map((item) => item.sourceId), ["moved"]);
  assert.deepEqual(result.bank.map((item) => item.sourceId), ["removed"]);
  assert.equal(new Set(allVisible).size, allVisible.length);
});

test("fixação na zona vence atualidade, mas a posição livre continua ordenada por atualidade", () => {
  const baseline = [
    automaticItem("h", "sporting", 1, 20),
    automaticItem("g", "sporting", 2, 19),
    automaticItem("f", "sporting", 3, 18),
    automaticItem("a", "sporting", 4, 17),
    automaticItem("b", "sporting", 5, 16),
    automaticItem("c", null, null, 10),
  ];
  const protectedInZone = [override("c", "sporting", null)];

  assert.deepEqual(zoneIds(baseline, protectedInZone, "sporting"), ["h", "g", "f", "a", "c"]);
  assert.deepEqual(
    buildMatchdayEditorialProfileEffectiveDistribution(profile, baseline, protectedInZone).bank.map((item) => item.sourceId),
    ["b"],
  );

  const newerProtected = baseline.map((item) => item.sourceId === "c"
    ? automaticItem("c", null, null, 21)
    : item);
  assert.deepEqual(zoneIds(newerProtected, protectedInZone, "sporting"), ["c", "h", "g", "f", "a"]);
});

test("posição fixa reserva exatamente o slot e libertá-la mantém proteção na zona", () => {
  const activeItems = [
    automaticItem("h", "sporting", 1, 20),
    automaticItem("g", "sporting", 2, 19),
    automaticItem("f", "sporting", 3, 18),
    automaticItem("a", "sporting", 4, 17),
    automaticItem("c", null, null, 10),
  ];
  const fixed = [override("c", "sporting", 3)];
  assert.deepEqual(zoneIds(activeItems, fixed, "sporting"), ["h", "g", "c", "f", "a"]);

  const released = releaseMatchdayEditorialFixedPositions(profile, fixed, [identity("c")]);
  assert.deepEqual(released, [override("c", "sporting", null)]);
  assert.deepEqual(zoneIds(activeItems, released, "sporting"), ["h", "g", "f", "a", "c"]);
});

test("remover completamente o override devolve a notícia à zona automática", () => {
  const activeItems = [automaticItem("article", "benfica", 1, 12)];
  const moved = [override("article", "sporting", null)];
  const automatic = returnMatchdayEditorialItemsToAutomatic(profile, moved, [identity("article")]);

  assert.deepEqual(automatic, []);
  assert.deepEqual(zoneIds(activeItems, automatic, "benfica"), ["article"]);
  assert.deepEqual(zoneIds(activeItems, automatic, "sporting"), []);
});

test("todos os lugares protegidos impedem entrada automática e várias fixações livres coexistem", () => {
  const pinned = [1, 2, 3, 4, 5].map((number) => automaticItem(`p${number}`, null, null, number));
  const automatic = automaticItem("new", "sporting", 1, 23);
  const overrides = pinned.map((item) => override(item.sourceId, "sporting", null));
  const result = buildMatchdayEditorialProfileEffectiveDistribution(profile, [...pinned, automatic], overrides);

  assert.equal(result.zones[1].items.length, 5);
  assert.equal(result.zones[1].items.some((item) => item.sourceId === "new"), false);
  assert.equal(result.bank.some((item) => item.sourceId === "new"), true);
  assert.equal(overrides.every((item) => item.sortOrder === null), true);
});

test("a validação rejeita excesso protegido, identidade repetida, slot repetido e slot acima da capacidade", () => {
  const tooMany = [1, 2, 3, 4, 5, 6].map((number) => override(`p${number}`, "sporting", null));
  assert.throws(
    () => validateMatchdayEditorialProfileManualOverrides(profile, tooMany),
    /zone-capacity-exceeded/,
  );
  assert.throws(
    () => validateMatchdayEditorialProfileManualOverrides(profile, [override("a", "sporting", null), override("a", null, null)]),
    /duplicate-source/,
  );
  assert.throws(
    () => validateMatchdayEditorialProfileManualOverrides(profile, [override("a", "sporting", 1), override("b", "sporting", 1)]),
    /duplicate-slot/,
  );
  assert.throws(
    () => validateMatchdayEditorialProfileManualOverrides(profile, [override("a", "sporting", 6)]),
    /invalid-sort-order/,
  );
});

test("uma zona vazia respeita a posição absoluta escolhida", () => {
  const activeItems = [automaticItem("x", null, null, 12)];
  const next = fixMatchdayEditorialItemsAtPosition(
    profile,
    activeItems,
    [],
    [identity("x")],
    "sporting",
    5,
  );
  const result = buildMatchdayEditorialProfileEffectiveDistribution(profile, activeItems, next);

  assert.deepEqual(result.zones[1].items.map((item) => [item.sourceId, item.sortOrder]), [["x", 5]]);
  assert.deepEqual(next, [override("x", "sporting", 5)]);
});

test("uma inserção posterior a lacunas conserva slots absolutos", () => {
  const activeItems = [
    automaticItem("a", "sporting", 1, 12),
    automaticItem("b", null, null, 11),
    automaticItem("x", null, null, 10),
  ];
  const current = [override("b", "sporting", 4)];
  const next = fixMatchdayEditorialItemsAtPosition(
    profile,
    activeItems,
    current,
    [identity("x")],
    "sporting",
    3,
  );
  const result = buildMatchdayEditorialProfileEffectiveDistribution(profile, activeItems, next);

  assert.deepEqual(
    result.zones[1].items.map((item) => [item.sourceId, item.sortOrder]),
    [["a", 1], ["x", 3], ["b", 5]],
  );
});

test("slot fixo anterior fica intacto e slots fixos posteriores deslocam-se", () => {
  const activeItems = [
    automaticItem("before", null, null, 12),
    automaticItem("after", null, null, 11),
    automaticItem("x", null, null, 10),
  ];
  const current = [
    override("before", "sporting", 1),
    override("after", "sporting", 3),
  ];
  const next = fixMatchdayEditorialItemsAtPosition(
    profile,
    activeItems,
    current,
    [identity("x")],
    "sporting",
    3,
  );

  assert.deepEqual(next, [
    override("after", "sporting", 4),
    override("before", "sporting", 1),
    override("x", "sporting", 3),
  ]);
});

test("deslocamento para além da capacidade liberta a decisão manual e nunca cria Banco implícito", () => {
  const activeItems = [
    automaticItem("last", null, null, 11),
    automaticItem("x", null, null, 10),
  ];
  const current = [override("last", "sporting", 5)];
  const next = fixMatchdayEditorialItemsAtPosition(
    profile,
    activeItems,
    current,
    [identity("x")],
    "sporting",
    5,
  );
  const result = buildMatchdayEditorialProfileEffectiveDistribution(profile, activeItems, next);

  assert.deepEqual(result.zones[1].items.map((item) => [item.sourceId, item.sortOrder]), [["x", 5]]);
  assert.deepEqual(result.bank.map((item) => [item.sourceId, item.manualOverride]), [["last", null]]);
  assert.deepEqual(next, [override("x", "sporting", 5)]);
  assert.equal(next.some((item) => item.placementTarget === "bank"), false);
});

test("automático desalojado fica no banco efetivo sem ganhar exclusão manual", () => {
  const baseline = [1, 2, 3, 4, 5].map((number) => (
    automaticItem(String.fromCharCode(96 + number), "sporting", number, 20 - number)
  ));
  const x = automaticItem("x", null, null, 20);
  const activeItems = [...baseline, x];
  const placed = fixMatchdayEditorialItemsAtPosition(
    profile,
    activeItems,
    [],
    [identity("x")],
    "sporting",
    2,
  );
  const effective = buildMatchdayEditorialProfileEffectiveDistribution(profile, activeItems, placed);

  assert.deepEqual(effective.zones[1].items.map((item) => item.sourceId), ["a", "x", "b", "c", "d"]);
  assert.equal(effective.bank.some((item) => item.sourceId === "e"), true);
  assert.equal(placed.some((item) => item.sourceId === "e"), false);

  const returned = returnMatchdayEditorialItemsToAutomatic(profile, placed, [identity("x")]);
  assert.deepEqual(zoneIds(activeItems, returned, "sporting"), ["a", "b", "c", "d", "e"]);
});

test("movimentos em bloco de 1, 2, 3, 4 e 5 notícias preservam a ordem e deslocam o conteúdo", () => {
  for (const count of [1, 2, 3, 4, 5]) {
    const baseline = [1, 2, 3, 4, 5].map((number) => automaticItem(`a${number}`, "sporting", number, 20 - number));
    const selectedItems = Array.from({ length: count }, (_, index) => automaticItem(`x${index + 1}`, null, null, 10 - index));
    const activeItems = [...baseline, ...selectedItems];
    const startPosition = count === 5 ? 1 : 2;
    const next = fixMatchdayEditorialItemsAtPosition(
      profile,
      activeItems,
      [],
      selectedItems.map((item) => identity(item.sourceId)),
      "sporting",
      startPosition,
    );
    const expected = baseline.map((item) => item.sourceId);
    expected.splice(startPosition - 1, 0, ...selectedItems.map((item) => item.sourceId));
    assert.deepEqual(zoneIds(activeItems, next, "sporting"), expected.slice(0, 5), `bloco de ${count}`);
  }
});

test("um bloco que não cabe na zona é recusado integralmente sem criar Banco implícito", () => {
  const baseline = [1, 2, 3, 4, 5].map((number) => automaticItem(`a${number}`, "sporting", number, 20 - number));
  const selectedItems = [1, 2, 3, 4, 5, 6].map((number) => automaticItem(`x${number}`, null, null, 10 - number));

  assert.throws(
    () => fixMatchdayEditorialItemsAtPosition(
      profile,
      [...baseline, ...selectedItems],
      [],
      selectedItems.map((item) => identity(item.sourceId)),
      "sporting",
      1,
    ),
    /selection-exceeds-capacity/,
  );
});

test("retirar conteúdo compacta a zona e cria banco explícito", () => {
  const activeItems = [
    automaticItem("a", "benfica", 1, 12),
    automaticItem("b", "benfica", 2, 11),
    automaticItem("c", "benfica", 3, 10),
  ];
  const next = moveMatchdayEditorialItemsToBank(profile, activeItems, [], [identity("b")]);
  const result = buildMatchdayEditorialProfileEffectiveDistribution(profile, activeItems, next);

  assert.deepEqual(result.zones[0].items.map((item) => [item.sourceId, item.sortOrder]), [["a", 1], ["c", 2]]);
  assert.deepEqual(result.bank.map((item) => item.sourceId), ["b"]);
  assert.equal(result.bank[0].manualOverride, "bank");
});

test("mover um bloco para a Faixa preserva a ordem da seleção e desloca posições manuais posteriores", () => {
  const activeItems = [
    automaticItem("x", "benfica", 1, 20),
    automaticItem("y", "sporting", 1, 19),
    automaticItem("existing", null, null, 18),
  ];
  const existingFaixa: MatchdayEditorialProfileManualOverride = {
    sourceType: "editorial_article",
    sourceId: "existing",
    placementTarget: "faixa",
    zoneKey: null,
    sortOrder: 2,
  };
  const next = moveMatchdayEditorialItemsToFaixa(
    profile,
    activeItems,
    [existingFaixa],
    [identity("y"), identity("x")],
    2,
  );

  assert.deepEqual(next, [
    { ...existingFaixa, sortOrder: 4 },
    { sourceType: "editorial_article", sourceId: "x", placementTarget: "faixa", zoneKey: null, sortOrder: 3 },
    { sourceType: "editorial_article", sourceId: "y", placementTarget: "faixa", zoneKey: null, sortOrder: 2 },
  ]);
});

test("reset restaura a baseline e uma baseline nova não destrói fixação nem movimento manual", () => {
  const firstBaseline = [
    automaticItem("protected", "benfica", 1, 10),
    automaticItem("new", "sporting", 1, 20),
  ];
  const overrides = fixMatchdayEditorialItemsInZone(
    profile,
    firstBaseline,
    [],
    [identity("protected")],
    "sporting",
  );
  const refreshedBaseline = [
    automaticItem("newest", "sporting", 1, 23),
    automaticItem("new", "sporting", 2, 20),
    automaticItem("protected", "benfica", 1, 10),
  ];

  assert.equal(zoneIds(refreshedBaseline, overrides, "sporting").includes("protected"), true);
  assert.equal(zoneIds(refreshedBaseline, overrides, "benfica").includes("protected"), false);
  assert.deepEqual(zoneIds(refreshedBaseline, [], "benfica"), ["protected"]);
});

test("snapshot novo sem pendentes atualiza persistido e draft", () => {
  const activeItems = [
    automaticItem("a", "benfica", 1, 12),
    automaticItem("b", "sporting", 1, 11),
  ];
  const previous = {
    persistedOverrides: [override("a", "benfica", null)],
    draftOverrides: [override("a", "benfica", null)],
    selectedIdentities: [] as readonly string[],
  };
  const nextServer = [override("b", "sporting", 2)];
  const reconciled = reconcileMatchdayEditorialProfileDeskSnapshot(
    profile,
    previous,
    nextServer,
    activeItems,
  );

  assert.deepEqual(reconciled.persistedOverrides, nextServer);
  assert.deepEqual(reconciled.draftOverrides, nextServer);
});

test("snapshot novo preserva alteração local de A e incorpora alteração persistida de B", () => {
  const activeItems = [
    automaticItem("a", "benfica", 1, 12),
    automaticItem("b", "sporting", 1, 11),
  ];
  const previous = {
    persistedOverrides: [override("a", "benfica", null), override("b", "sporting", null)],
    draftOverrides: [override("a", "fc_porto", null), override("b", "sporting", null)],
    selectedIdentities: [] as readonly string[],
  };
  const nextServer = [override("a", "benfica", null), override("b", "other_liga_clubs", 2)];
  const reconciled = reconcileMatchdayEditorialProfileDeskSnapshot(
    profile,
    previous,
    nextServer,
    activeItems,
  );

  assert.deepEqual(reconciled.persistedOverrides, nextServer);
  assert.deepEqual(reconciled.draftOverrides, [
    override("a", "fc_porto", null),
    override("b", "other_liga_clubs", 2),
  ]);
});

test("reconciliação elimina overrides e seleções de publicações que deixaram de estar ativas", () => {
  const activeItems = [automaticItem("active", "benfica", 1, 12)];
  const reconciled = reconcileMatchdayEditorialProfileDeskSnapshot(
    profile,
    {
      persistedOverrides: [override("inactive", "sporting", null)],
      draftOverrides: [override("inactive", "sporting", 2)],
      selectedIdentities: [identity("inactive"), identity("active")],
    },
    [override("inactive", "sporting", null)],
    activeItems,
  );

  assert.deepEqual(reconciled.persistedOverrides, []);
  assert.deepEqual(reconciled.draftOverrides, []);
  assert.deepEqual(reconciled.selectedIdentities, [identity("active")]);
});

test("snapshot confirmado após Apply torna-se baseline persistida sem recriar dirty state", () => {
  const activeItems = [automaticItem("applied", "benfica", 1, 12)];
  const applied = [override("applied", "fc_porto", null)];
  const reconciled = reconcileMatchdayEditorialProfileDeskSnapshot(
    profile,
    {
      persistedOverrides: applied,
      draftOverrides: applied,
      selectedIdentities: [],
    },
    applied,
    activeItems,
  );

  assert.deepEqual(reconciled.persistedOverrides, applied);
  assert.deepEqual(reconciled.draftOverrides, applied);
  assert.deepEqual(reconciled.persistedOverrides, reconciled.draftOverrides);
});
