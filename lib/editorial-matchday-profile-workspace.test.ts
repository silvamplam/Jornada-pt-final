import assert from "node:assert/strict";
import test from "node:test";

import { EDITORIAL_PROFILES, type EditorialProfileZoneKey } from "@/lib/editorial-profiles";
import type { MatchdayEditorialProfileDeskAutomaticItem } from "@/lib/editorial-matchday-profile-desk";
import {
  fixMatchdayEditorialItemsAtPosition,
  fixMatchdayEditorialItemsInZone,
  moveMatchdayEditorialItemsToFaixa,
  returnMatchdayEditorialItemsToAutomatic,
  thematicEditorialIdentity,
  type MatchdayEditorialProfileManualOverride,
} from "@/lib/editorial-matchday-profile-desk-operations";
import {
  emptyMatchdayEditorialProfileOpening,
  moveMatchdayEditorialProfileItemToOpening,
  moveMatchdayEditorialProfileThematicZone,
  reconcileMatchdayEditorialProfileWorkspace,
  validateMatchdayEditorialProfileOpening,
  validateMatchdayEditorialProfilePageControls,
  withoutMatchdayEditorialProfileOpeningOverrides,
  type MatchdayEditorialProfileOpening,
} from "@/lib/editorial-matchday-profile-workspace";

const profile = EDITORIAL_PROFILES.liga_portugal_v1;

function item(
  sourceId: string,
  classifiedZoneKey: EditorialProfileZoneKey,
  actualityOrder: number,
): MatchdayEditorialProfileDeskAutomaticItem {
  const hour = String(Math.max(0, 23 - actualityOrder)).padStart(2, "0");
  return {
    sourceType: "editorial_article",
    sourceId,
    sortOrder: actualityOrder,
    classifiedZoneKey,
    actualityOrder,
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

function reconcile(
  activeItems: readonly MatchdayEditorialProfileDeskAutomaticItem[],
  overrides: readonly MatchdayEditorialProfileManualOverride[],
  opening: MatchdayEditorialProfileOpening,
) {
  return reconcileMatchdayEditorialProfileWorkspace(
    profile,
    activeItems,
    overrides,
    opening,
    [],
    false,
    [],
  );
}

function zoneIds(
  result: ReturnType<typeof reconcile>,
  zoneKey: EditorialProfileZoneKey,
): string[] {
  return result.zonesAfter.find((zone) => zone.key === zoneKey)?.items.map((entry) => entry.sourceId) ?? [];
}

function placedIds(result: ReturnType<typeof reconcile>, opening: MatchdayEditorialProfileOpening): string[] {
  return [
    ...Object.values(opening).filter((sourceId): sourceId is string => sourceId !== null),
    ...result.zonesAfter.flatMap((zone) => zone.items.map((entry) => entry.sourceId)),
    ...result.faixaAfter.map((entry) => entry.sourceId),
    ...result.bankAfter.map((entry) => entry.sourceId),
  ];
}

test("drag dentro da zona move #5 para #2, desloca os restantes e não duplica", () => {
  const active = ["a", "b", "c", "d", "e", "f"].map((sourceId, index) => item(sourceId, "benfica", index + 1));
  const overrides = fixMatchdayEditorialItemsAtPosition(
    profile,
    active,
    [],
    [identity("e")],
    "benfica",
    2,
  );
  const result = reconcile(active, overrides, emptyMatchdayEditorialProfileOpening());

  assert.deepEqual(zoneIds(result, "benfica"), ["a", "e", "b", "c", "d", "f"]);
  assert.equal(new Set(zoneIds(result, "benfica")).size, 6);
});

test("Benfica para Manchete liberta a zona e promove apenas a próxima automática elegível", () => {
  const active = Array.from({ length: 7 }, (_, index) => item(`a${index + 1}`, "benfica", index + 1));
  const opening = moveMatchdayEditorialProfileItemToOpening(
    emptyMatchdayEditorialProfileOpening(),
    "a1",
    "headline",
  ).opening;
  const result = reconcile(active, [], opening);

  assert.equal(opening.headline, "a1");
  assert.deepEqual(zoneIds(result, "benfica"), ["a2", "a3", "a4", "a5", "a6", "a7"]);
  assert.equal(result.faixaAfter.length, 0);
});

test("opening-replacement-displaced-returns-to-natural-zone-position-1", () => {
  const active = Array.from({ length: 7 }, (_, index) =>
    item(`a${index + 1}`, "benfica", index + 1),
  );

  const first = moveMatchdayEditorialProfileItemToOpening(
    emptyMatchdayEditorialProfileOpening(),
    "a1",
    "headline",
  ).opening;

  const movement = moveMatchdayEditorialProfileItemToOpening(
    first,
    "a2",
    "headline",
  );

  const candidates = active.filter(
    (candidate) => candidate.sourceId !== "a2",
  );

  const overrides = fixMatchdayEditorialItemsAtPosition(
    profile,
    candidates,
    [],
    [identity("a1")],
    "benfica",
    1,
  );

  const result = reconcile(
    active,
    overrides,
    movement.opening,
  );

  assert.equal(movement.displacedSourceId, "a1");
  assert.equal(movement.opening.headline, "a2");
  assert.deepEqual(
    zoneIds(result, "benfica"),
    ["a1", "a3", "a4", "a5", "a6", "a7"],
  );
  assert.deepEqual(
    result.faixaAfter.map((entry) => entry.sourceId),
    [],
  );
});

test("opening-item-moved-to-occupied-slot-displaced-returns-to-natural-zone-position-1", () => {
  const active = Array.from({ length: 7 }, (_, index) =>
    item(`a${index + 1}`, "benfica", index + 1),
  );

  const opening = validateMatchdayEditorialProfileOpening({
    headline: "a1",
    highlight_1: null,
    highlight_2: "a2",
    highlight_3: null,
    context: null,
  });

  const movement = moveMatchdayEditorialProfileItemToOpening(
    opening,
    "a1",
    "highlight_2",
  );

  const candidates = active.filter(
    (candidate) => candidate.sourceId !== "a1",
  );

  const overrides = fixMatchdayEditorialItemsAtPosition(
    profile,
    candidates,
    [],
    [identity("a2")],
    "benfica",
    1,
  );

  const result = reconcile(
    active,
    overrides,
    movement.opening,
  );

  assert.equal(movement.opening.headline, null);
  assert.equal(movement.opening.highlight_2, "a1");
  assert.equal(movement.displacedSourceId, "a2");
  assert.deepEqual(
    zoneIds(result, "benfica"),
    ["a2", "a3", "a4", "a5", "a6", "a7"],
  );
});

test("opening-displaced-enters-full-natural-zone-at-1-and-automatic-overflow-goes-to-faixa", () => {
  const active = [
    ...Array.from({ length: 7 }, (_, index) =>
      item(`a${index + 1}`, "benfica", index + 1),
    ),
    item("x", "sporting", 1),
  ];

  const opening = validateMatchdayEditorialProfileOpening({
    headline: "a7",
    highlight_1: null,
    highlight_2: null,
    highlight_3: null,
    context: null,
  });

  const movement = moveMatchdayEditorialProfileItemToOpening(
    opening,
    "x",
    "headline",
  );

  const candidates = active.filter(
    (candidate) => candidate.sourceId !== "x",
  );

  const overrides = fixMatchdayEditorialItemsAtPosition(
    profile,
    candidates,
    [],
    [identity("a7")],
    "benfica",
    1,
  );

  const result = reconcile(
    active,
    overrides,
    movement.opening,
  );

  assert.equal(movement.displacedSourceId, "a7");
  assert.deepEqual(
    zoneIds(result, "benfica"),
    ["a7", "a1", "a2", "a3", "a4", "a5"],
  );
  assert.deepEqual(
    result.faixaAfter.map((entry) => entry.sourceId),
    ["a6"],
  );
  assert.equal(
    overrides.some(
      (entry) => entry.sourceId === "a6",
    ),
    false,
  );
});

test("desalojada na Faixa pode ser protegida na zona e empurra a automática menos prioritária", () => {
  const active = [
    ...Array.from({ length: 7 }, (_, index) => item(`a${index + 1}`, "benfica", index + 1)),
    item("x", "sporting", 1),
  ];
  const opening = validateMatchdayEditorialProfileOpening({
    headline: "x",
    highlight_1: null,
    highlight_2: null,
    highlight_3: null,
    context: null,
  });
  const overrides = fixMatchdayEditorialItemsInZone(
    profile,
    active.filter((candidate) => candidate.sourceId !== "x"),
    [],
    [identity("a7")],
    "benfica",
  );
  const result = reconcile(active, overrides, opening);

  assert.equal(zoneIds(result, "benfica").includes("a7"), true);
  assert.equal(result.faixaAfter.some((entry) => entry.sourceId === "a6"), true);
});

test("Faixa manual protege top-N e devolver ao automático repõe classificação", () => {
  const active = Array.from({ length: 7 }, (_, index) => item(`a${index + 1}`, "benfica", index + 1));
  const manualFaixa = moveMatchdayEditorialItemsToFaixa(profile, active, [], [identity("a1")], 1);
  const manual = reconcile(active, manualFaixa, emptyMatchdayEditorialProfileOpening());
  const automaticOverrides = returnMatchdayEditorialItemsToAutomatic(profile, manualFaixa, [identity("a1")]);
  const automatic = reconcile(active, automaticOverrides, emptyMatchdayEditorialProfileOpening());

  assert.deepEqual(manual.faixaAfter.map((entry) => [entry.sourceId, entry.manualOverride]), [["a1", "faixa"]]);
  assert.deepEqual(zoneIds(automatic, "benfica"), ["a1", "a2", "a3", "a4", "a5", "a6"]);
  assert.deepEqual(automatic.faixaAfter.map((entry) => entry.sourceId), ["a7"]);
});

test("Abertura, zonas, Faixa e Banco formam uma partição exclusiva", () => {
  const active = [
    ...Array.from({ length: 8 }, (_, index) => item(`a${index + 1}`, "benfica", index + 1)),
    item("s1", "sporting", 1),
  ];
  const opening = validateMatchdayEditorialProfileOpening({
    headline: "a1",
    highlight_1: "s1",
    highlight_2: null,
    highlight_3: null,
    context: null,
  });
  const overrides: MatchdayEditorialProfileManualOverride[] = [{
    sourceType: "editorial_article",
    sourceId: "a8",
    placementTarget: "bank",
    zoneKey: null,
    sortOrder: null,
  }];
  const result = reconcile(active, withoutMatchdayEditorialProfileOpeningOverrides(profile, overrides, opening), opening);
  const ids = placedIds(result, opening);

  assert.equal(ids.length, active.length);
  assert.equal(new Set(ids).size, active.length);
  assert.equal(result.zonesAfter.flatMap((zone) => zone.items).some((entry) => entry.sourceId === "a1"), false);
  assert.equal(result.faixaAfter.some((entry) => entry.sourceId === "a1"), false);
});


test("controlos temáticos validam uma ordem exclusiva das cinco zonas", () => {
  const controls = validateMatchdayEditorialProfilePageControls({
    headlineTitleColor: "#00aa44",
    latestZonePlacement: "top",
    thematicZoneOrder: [
      "sporting",
      "benfica",
      "fc_porto",
      "other_liga_clubs",
      "outside_liga_other",
    ],
  });

  assert.equal(controls.headlineTitleColor, "#00AA44");
  assert.deepEqual(controls.thematicZoneOrder, [
    "sporting",
    "benfica",
    "fc_porto",
    "other_liga_clubs",
    "outside_liga_other",
  ]);
  assert.throws(() => validateMatchdayEditorialProfilePageControls({
    headlineTitleColor: null,
    latestZonePlacement: "top",
    thematicZoneOrder: [
      "benfica",
      "benfica",
      "fc_porto",
      "other_liga_clubs",
      "outside_liga_other",
    ],
  }), /invalid-zone-order/);
});

test("ordem temática move equipas sem colapsar zonas que partilham layout", () => {
  const moved = moveMatchdayEditorialProfileThematicZone([
    "benfica",
    "sporting",
    "fc_porto",
    "other_liga_clubs",
    "outside_liga_other",
  ], "fc_porto", "up");

  assert.deepEqual(moved, [
    "benfica",
    "fc_porto",
    "sporting",
    "other_liga_clubs",
    "outside_liga_other",
  ]);
});


for (const slot of Object.keys(emptyMatchdayEditorialProfileOpening()) as (keyof MatchdayEditorialProfileOpening)[]) {
  test(`opening-faixa-exclusive-${slot}`, () => {
    const moving = item("moving-from-faixa", "sporting", 1);

    const opening = validateMatchdayEditorialProfileOpening({
      ...emptyMatchdayEditorialProfileOpening(),
      [slot]: moving.sourceId,
    });

    const currentFaixa = [{
      sourceType: moving.sourceType,
      sourceId: moving.sourceId,
      sortOrder: 1,
      label: moving.label,
      title: moving.title,
      subtitle: moving.subtitle,
      imageUrl: moving.imageUrl,
      publishedAt: moving.publishedAt,
      updatedAt: moving.updatedAt,
      manualOverride: null,
    }];

    const result = reconcileMatchdayEditorialProfileWorkspace(
      profile,
      [moving],
      [],
      opening,
      [],
      true,
      currentFaixa,
    );

    assert.equal(
      result.faixaAfter.some((entry) => entry.sourceId === moving.sourceId),
      false,
    );
  });
}


for (const slot of Object.keys(emptyMatchdayEditorialProfileOpening()) as (keyof MatchdayEditorialProfileOpening)[]) {
  test(`opening-bank-exclusive-${slot}`, () => {
    const moving = item("moving-from-bank", "benfica", 1);

    const opening = validateMatchdayEditorialProfileOpening({
      ...emptyMatchdayEditorialProfileOpening(),
      [slot]: moving.sourceId,
    });

    const bankOverride: MatchdayEditorialProfileManualOverride[] = [{
      sourceType: "editorial_article",
      sourceId: moving.sourceId,
      placementTarget: "bank",
      zoneKey: null,
      sortOrder: null,
    }];

    const result = reconcileMatchdayEditorialProfileWorkspace(
      profile,
      [moving],
      bankOverride,
      opening,
      [],
      false,
      [],
    );

    assert.equal(opening[slot], moving.sourceId);
    assert.equal(
      result.zonesAfter.flatMap((zone) => zone.items).some(
        (entry) => entry.sourceId === moving.sourceId,
      ),
      false,
    );
    assert.equal(
      result.faixaAfter.some((entry) => entry.sourceId === moving.sourceId),
      false,
    );
    assert.equal(
      result.bankAfter.some((entry) => entry.sourceId === moving.sourceId),
      false,
    );
  });

  test(`opening-manual-zone-exclusive-${slot}`, () => {
    const moving = item("moving-from-manual-zone", "benfica", 1);

    const opening = validateMatchdayEditorialProfileOpening({
      ...emptyMatchdayEditorialProfileOpening(),
      [slot]: moving.sourceId,
    });

    const zoneOverride = fixMatchdayEditorialItemsAtPosition(
      profile,
      [moving],
      [],
      [identity(moving.sourceId)],
      "sporting",
      1,
    );

    const result = reconcileMatchdayEditorialProfileWorkspace(
      profile,
      [moving],
      zoneOverride,
      opening,
      [],
      false,
      [],
    );

    assert.equal(opening[slot], moving.sourceId);
    assert.equal(
      result.zonesAfter.flatMap((zone) => zone.items).some(
        (entry) => entry.sourceId === moving.sourceId,
      ),
      false,
    );
    assert.equal(
      result.faixaAfter.some((entry) => entry.sourceId === moving.sourceId),
      false,
    );
    assert.equal(
      result.bankAfter.some((entry) => entry.sourceId === moving.sourceId),
      false,
    );
  });
}
