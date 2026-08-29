import assert from "node:assert/strict";
import test from "node:test";

import { EDITORIAL_PROFILES, type EditorialProfileZoneKey } from "@/lib/editorial-profiles";
import type { MatchdayEditorialProfileDeskAutomaticItem } from "@/lib/editorial-matchday-profile-desk";
import type {
  MatchdayEditorialProfileManualOverride,
  MatchdayEditorialProfileManualPlacementTarget,
} from "@/lib/editorial-matchday-profile-desk-operations";
import {
  reconcileMatchdayEditorialProfileDistribution,
  type MatchdayEditorialProfileAppliedZoneItem,
  type MatchdayEditorialProfileFaixaItem,
} from "@/lib/editorial-matchday-profile-reconcile";

const profile = EDITORIAL_PROFILES.liga_portugal_v1;

function item(
  sourceId: string,
  classifiedZoneKey: EditorialProfileZoneKey,
  circuitOrder: number,
  actuality = 24 - circuitOrder,
): MatchdayEditorialProfileDeskAutomaticItem {
  const hour = String(Math.max(0, actuality)).padStart(2, "0");
  return {
    sourceType: "editorial_article",
    sourceId,
    sortOrder: circuitOrder,
    classifiedZoneKey,
    circuitOrder,
    label: `Label ${sourceId}`,
    title: `TÃƒÂ­tulo ${sourceId}`,
    subtitle: null,
    imageUrl: null,
    publishedAt: `2026-08-22T${hour}:00:00.000Z`,
    updatedAt: `2026-08-22T${hour}:00:00.000Z`,
  };
}

function override(
  sourceId: string,
  placementTarget: MatchdayEditorialProfileManualPlacementTarget,
  zoneKey: EditorialProfileZoneKey | null,
  sortOrder: number | null,
): MatchdayEditorialProfileManualOverride {
  return { sourceType: "editorial_article", sourceId, placementTarget, zoneKey, sortOrder };
}

function applied(
  sourceId: string,
  zoneKey: EditorialProfileZoneKey,
  sortOrder: number,
): MatchdayEditorialProfileAppliedZoneItem {
  return { sourceType: "editorial_article", sourceId, zoneKey, sortOrder };
}

function faixa(sourceId: string, sortOrder: number): MatchdayEditorialProfileFaixaItem {
  return {
    sourceType: "editorial_article",
    sourceId,
    sortOrder,
    label: `Label ${sourceId}`,
    title: `TÃƒÂ­tulo ${sourceId}`,
    subtitle: null,
    imageUrl: null,
    publishedAt: "2026-08-20T12:00:00.000Z",
    updatedAt: "2026-08-20T12:00:00.000Z",
    manualOverride: null,
  };
}

function zoneIds(result: ReturnType<typeof reconcileMatchdayEditorialProfileDistribution>, key: EditorialProfileZoneKey) {
  return result.zonesAfter.find((zone) => zone.key === key)?.items.map((entry) => entry.sourceId) ?? [];
}

function eightyFourCandidates(): MatchdayEditorialProfileDeskAutomaticItem[] {
  return profile.zones.flatMap((zone, zoneIndex) => {
    const count = zoneIndex < 4 ? 17 : 16;
    return Array.from({ length: count }, (_, index) => (
      item(`${zone.key}-${index + 1}`, zone.key, index + 1, 23 - index)
    ));
  });
}

test("um candidato Benfica #7 que nunca ocupou uma zona entra na Faixa automÃƒÂ¡tica", () => {
  const active = Array.from({ length: 7 }, (_, index) => item(`a${index + 1}`, "benfica", index + 1));
  const result = reconcileMatchdayEditorialProfileDistribution(profile, active, [], [], false, []);

  assert.deepEqual(zoneIds(result, "benfica"), ["a1", "a2", "a3", "a4", "a5", "a6"]);
  assert.deepEqual(result.faixaAfter.map((entry) => [entry.sourceId, entry.manualOverride]), [["a7", null]]);
  assert.deepEqual(result.bankAfter, []);
});

test("os candidatos #7 a #17 permanecem representados na Faixa e nunca no Banco implÃƒÂ­cito", () => {
  const active = Array.from({ length: 17 }, (_, index) => item(`a${index + 1}`, "benfica", index + 1));
  const result = reconcileMatchdayEditorialProfileDistribution(profile, active, [], [], false, []);

  assert.deepEqual(
    result.faixaAfter.map((entry) => entry.sourceId),
    Array.from({ length: 11 }, (_, index) => `a${index + 7}`),
  );
  assert.deepEqual(result.bankAfter, []);
});

test("84 candidatos sem decisÃƒÂµes de Banco produzem exatamente 27 zonas e 57 itens de Faixa", () => {
  const active = eightyFourCandidates();
  const result = reconcileMatchdayEditorialProfileDistribution(profile, active, [], [], false, []);
  const zoneItems = result.zonesAfter.flatMap((zone) => zone.items);
  const allIdentities = [
    ...zoneItems.map((entry) => entry.sourceId),
    ...result.faixaAfter.map((entry) => entry.sourceId),
    ...result.bankAfter.map((entry) => entry.sourceId),
  ];

  assert.equal(zoneItems.length, 27);
  assert.equal(result.faixaAfter.length, 57);
  assert.equal(result.bankAfter.length, 0);
  assert.equal(new Set(allIdentities).size, 84);
  assert.deepEqual(result.faixaAfter.slice(0, 3).map((entry) => entry.sourceId), [
    "fc_porto-6",
    "outside_liga_other-6",
    "sporting-6",
  ]);
});

test("um Bank override explÃƒÂ­cito retira apenas essa identidade dos 57 overflows", () => {
  const active = eightyFourCandidates();
  const result = reconcileMatchdayEditorialProfileDistribution(
    profile,
    active,
    [override("benfica-7", "bank", null, null)],
    [],
    false,
    [],
  );

  assert.equal(result.zonesAfter.flatMap((zone) => zone.items).length, 27);
  assert.equal(result.faixaAfter.length, 56);
  assert.deepEqual(result.bankAfter.map((entry) => [entry.sourceId, entry.manualOverride]), [["benfica-7", "bank"]]);
});

test("pertenÃƒÂ§a legacy ÃƒÂ  Faixa sem slot usa a ordem estÃ¡vel do circuito", () => {
  const forcedOlder = item("forced-older", "benfica", 1, 10);
  const sportingZone = Array.from(
    { length: profile.zones.find((zone) => zone.key === "sporting")?.capacity ?? 0 },
    (_, index) => item(`sporting-zone-${index + 1}`, "sporting", index + 1, 23),
  );
  const automaticNewer = item("automatic-newer", "sporting", sportingZone.length + 1, 20);
  const automaticOlder = item("automatic-older", "sporting", sportingZone.length + 2, 5);

  const result = reconcileMatchdayEditorialProfileDistribution(
    profile,
    [forcedOlder, ...sportingZone, automaticNewer, automaticOlder],
    [override("forced-older", "faixa", null, null)],
    [],
    false,
    [],
  );

  assert.deepEqual(zoneIds(result, "sporting"), sportingZone.map((entry) => entry.sourceId));
  assert.deepEqual(
    result.faixaAfter.map((entry) => [entry.sourceId, entry.manualOverride]),
    [
      ["forced-older", "faixa"],
      ["automatic-newer", null],
      ["automatic-older", null],
    ],
  );
});

test("snapshot aplicado preserva a composiÃƒÂ§ÃƒÂ£o quando a decisÃƒÂ£o manual ÃƒÂ© libertada", () => {
  const active = Array.from({ length: 7 }, (_, index) => item(`a${index + 1}`, "benfica", index + 1));
  const manual = reconcileMatchdayEditorialProfileDistribution(
    profile,
    active,
    [override("a1", "faixa", null, 1)],
    [],
    false,
    [],
  );

  assert.deepEqual(zoneIds(manual, "benfica"), ["a2", "a3", "a4", "a5", "a6", "a7"]);
  assert.deepEqual(manual.faixaAfter.map((entry) => [entry.sourceId, entry.manualOverride]), [["a1", "faixa"]]);

  const automatic = reconcileMatchdayEditorialProfileDistribution(
    profile,
    active,
    [],
    manual.zonesAfter.flatMap((zone) => zone.items.map((entry) => applied(entry.sourceId, zone.key, entry.sortOrder))),
    true,
    manual.faixaAfter,
  );
  const identities = [
    ...automatic.zonesAfter.flatMap((zone) => zone.items.map((entry) => entry.sourceId)),
    ...automatic.faixaAfter.map((entry) => entry.sourceId),
    ...automatic.bankAfter.map((entry) => entry.sourceId),
  ];

  assert.deepEqual(zoneIds(automatic, "benfica"), ["a2", "a3", "a4", "a5", "a6", "a7"]);
  assert.deepEqual(automatic.faixaAfter.map((entry) => [entry.sourceId, entry.manualOverride]), [["a1", null]]);
  assert.equal(new Set(identities).size, active.length);
});

test("X na posiÃƒÂ§ÃƒÂ£o 2 desaloja F do Benfica para o inÃƒÂ­cio da Faixa", () => {
  const benfica = ["a", "b", "c", "d", "e", "f"].map((id, index) => item(id, "benfica", index + 1));
  const x = item("x", "outside_liga_other", 1, 23);
  const sporting = [1, 2, 3, 4, 5].map((number) => item(`s${number}`, "sporting", number));
  const result = reconcileMatchdayEditorialProfileDistribution(
    profile,
    [...benfica, x, ...sporting, item("g", "sporting", 8), item("h", "sporting", 9), item("i", "sporting", 10)],
    [override("x", "zone", "benfica", 2)],
    [],
    false,
    [faixa("g", 1), faixa("h", 2), faixa("i", 3)],
  );

  assert.deepEqual(zoneIds(result, "benfica"), ["a", "x", "b", "c", "d", "e"]);
  assert.deepEqual(result.faixaAfter.map((entry) => entry.sourceId), ["f", "g", "h", "i"]);
});

test("snapshot aplicado nÃƒÂ£o ÃƒÂ© reescrito pela classificaÃƒÂ§ÃƒÂ£o automÃƒÂ¡tica sem nova decisÃƒÂ£o", () => {
  const benfica = ["a", "b", "c", "d", "e", "f"].map((id, index) => item(id, "benfica", index + 1));
  const x = item("x", "outside_liga_other", 1, 23);
  const sporting = [1, 2, 3, 4, 5].map((number) => item(`s${number}`, "sporting", number));
  const previousApplied = ["a", "x", "b", "c", "d", "e"].map((id, index) => applied(id, "benfica", index + 1));
  const result = reconcileMatchdayEditorialProfileDistribution(
    profile,
    [...benfica, x, ...sporting, item("g", "sporting", 8)],
    [],
    previousApplied,
    true,
    [faixa("f", 1), faixa("g", 2)],
  );

  assert.deepEqual(zoneIds(result, "benfica"), ["a", "x", "b", "c", "d", "e"]);
  assert.deepEqual(result.faixaAfter.map((entry) => entry.sourceId), ["f", "g"]);
});

test("snapshot aplicado conserva no lugar um override legacy zone/null", () => {
  const active = [
    item("a", "benfica", 3, 23),
    item("b", "benfica", 1, 1),
    item("c", "benfica", 2, 12),
  ];
  const result = reconcileMatchdayEditorialProfileDistribution(
    profile,
    active,
    [override("a", "zone", "benfica", null)],
    [
      applied("a", "benfica", 1),
      applied("b", "benfica", 2),
      applied("c", "benfica", 3),
    ],
    true,
    [],
  );

  assert.deepEqual(zoneIds(result, "benfica"), ["a", "b", "c"]);
  assert.equal(
    result.zonesAfter[0].items.find((entry) => entry.sourceId === "a")
      ?.manualOverride,
    "zone",
  );
  assert.equal(result.hasChanges, false);
});

test("uma Faixa com 24 itens recebe overflow no topo sem reordenar o existente", () => {
  const benfica = ["a", "b", "c", "d", "e", "f"].map((id, index) => item(id, "benfica", index + 1));
  const x = item("x", "outside_liga_other", 1, 23);
  const faixaItems = Array.from({ length: 24 }, (_, index) => faixa(`q${index + 1}`, index + 1));
  const activeFaixa = faixaItems.map((entry, index) => item(entry.sourceId, "sporting", index + 20));
  const sporting = [1, 2, 3, 4, 5].map((number) => item(`s${number}`, "sporting", number));
  const result = reconcileMatchdayEditorialProfileDistribution(
    profile,
    [...benfica, x, ...sporting, ...activeFaixa],
    [override("x", "zone", "benfica", 2)],
    [],
    false,
    faixaItems,
  );

  assert.equal(result.faixaAfter.length, 25);
  assert.deepEqual(
    result.faixaAfter.slice(0, 5).map((entry) => entry.sourceId),
    ["f", "q1", "q2", "q3", "q4"],
  );
  assert.deepEqual(
    result.faixaAfter.map((entry) => entry.sortOrder),
    Array.from({ length: 25 }, (_, index) => index + 1),
  );
  assert.equal(new Set(result.faixaAfter.map((entry) => entry.sourceId)).size, 25);
  for (const expected of ["f", ...Array.from({ length: 24 }, (_, index) => `q${index + 1}`)]) {
    assert.equal(result.faixaAfter.some((entry) => entry.sourceId === expected), true, expected);
  }
  assert.deepEqual(
    result.faixaAfter.slice(1).map((entry) => entry.sourceId),
    faixaItems.map((entry) => entry.sourceId),
  );
});

test("um item na posiÃƒÂ§ÃƒÂ£o 17 que regressa ÃƒÂ  zona ÃƒÂ© removido e a Faixa compacta", () => {
  const returning = item("returning", "benfica", 1);
  const faixaItems = Array.from({ length: 20 }, (_, index) => faixa(index === 16 ? "returning" : `q${index + 1}`, index + 1));
  const remainingFaixa = faixaItems.filter((entry) => entry.sourceId !== "returning");
  const sporting = [1, 2, 3, 4, 5].map((number) => item(`s${number}`, "sporting", number));
  const active = [returning, ...sporting, ...remainingFaixa.map((entry, index) => item(entry.sourceId, "sporting", index + 10))];
  const result = reconcileMatchdayEditorialProfileDistribution(profile, active, [], [], false, faixaItems);

  assert.equal(result.faixaAfter.some((entry) => entry.sourceId === "returning"), false);
  assert.equal(result.faixaAfter[16].sourceId, "q18");
  assert.deepEqual(result.faixaAfter.map((entry) => entry.sortOrder), Array.from({ length: 19 }, (_, index) => index + 1));
});

test("identidade jÃƒÂ¡ presente em zonesAfter nunca permanece duplicada na Faixa", () => {
  const a = item("a", "benfica", 1);
  const result = reconcileMatchdayEditorialProfileDistribution(profile, [a], [], [], false, [faixa("a", 1)]);
  assert.deepEqual(zoneIds(result, "benfica"), ["a"]);
  assert.deepEqual(result.faixaAfter, []);
});

test("dois desalojados entram como bloco e preservam a ordem relativa", () => {
  const baseline = ["a", "b", "c", "d", "e", "f"].map((id, index) => item(id, "benfica", index + 1));
  const x = item("x", "outside_liga_other", 1, 23);
  const y = item("y", "outside_liga_other", 2, 22);
  const sporting = [1, 2, 3, 4, 5].map((number) => item(`s${number}`, "sporting", number));
  const result = reconcileMatchdayEditorialProfileDistribution(
    profile,
    [...baseline, x, y, ...sporting, item("g", "sporting", 9)],
    [override("x", "zone", "benfica", 2), override("y", "zone", "benfica", 3)],
    [],
    false,
    [faixa("g", 1)],
  );
  assert.deepEqual(result.faixaAfter.map((entry) => entry.sourceId), ["e", "f", "g"]);
});

test("Banco explÃƒÂ­cito nunca ÃƒÂ© promovido automaticamente ÃƒÂ  Faixa", () => {
  const a = item("a", "benfica", 1);
  const result = reconcileMatchdayEditorialProfileDistribution(
    profile,
    [a],
    [override("a", "bank", null, null)],
    [],
    false,
    [],
  );
  assert.deepEqual(result.faixaAfter, []);
  assert.deepEqual(result.bankAfter.map((entry) => entry.sourceId), ["a"]);
});

test("uma decisÃƒÂ£o manual de Faixa sobrevive a uma baseline que voltaria a colocar a notÃƒÂ­cia", () => {
  const x = item("x", "benfica", 1);
  const result = reconcileMatchdayEditorialProfileDistribution(
    profile,
    [x],
    [override("x", "faixa", null, 1)],
    [],
    false,
    [],
  );

  assert.deepEqual(zoneIds(result, "benfica"), []);
  assert.deepEqual(result.faixaAfter.map((entry) => [entry.sourceId, entry.manualOverride]), [["x", "faixa"]]);
  assert.deepEqual(result.bankAfter, []);
});

test("uma notÃƒÂ­cia da Faixa movida para zona desaparece da Faixa", () => {
  const x = item("x", "sporting", 8);
  const result = reconcileMatchdayEditorialProfileDistribution(
    profile,
    [x],
    [override("x", "zone", "benfica", null)],
    [],
    false,
    [faixa("x", 1)],
  );

  assert.deepEqual(zoneIds(result, "benfica"), ["x"]);
  assert.deepEqual(result.faixaAfter, []);
});

test("fixaÃƒÂ§ÃƒÂµes de zona e posiÃƒÂ§ÃƒÂ£o vencem a ordem automÃ¡tica do circuito", () => {
  const automatic = [1, 2, 3, 4, 5, 6].map((number) => item(`a${number}`, "benfica", number));
  const protectedItem = item("protected", "sporting", 8, 1);
  const fixedItem = item("fixed", "sporting", 9, 0);
  const result = reconcileMatchdayEditorialProfileDistribution(
    profile,
    [...automatic, protectedItem, fixedItem],
    [
      override("protected", "zone", "benfica", null),
      override("fixed", "zone", "benfica", 3),
    ],
    [],
    false,
    [],
  );
  const benfica = result.zonesAfter[0].items;
  assert.equal(benfica.some((entry) => entry.sourceId === "protected"), true);
  assert.equal(benfica.find((entry) => entry.sourceId === "fixed")?.sortOrder, 3);
});

test("bootstrap usa baseline sem overrides como before", () => {
  const baseline = ["a", "b", "c", "d", "e", "f"].map((id, index) => item(id, "benfica", index + 1));
  const x = item("x", "outside_liga_other", 1, 23);
  const result = reconcileMatchdayEditorialProfileDistribution(
    profile,
    [...baseline, x],
    [override("x", "zone", "benfica", 2)],
    [],
    false,
    [],
  );
  assert.deepEqual(result.zonesBefore[0].items.map((entry) => entry.sourceId), ["a", "b", "c", "d", "e", "f"]);
  assert.deepEqual(result.zonesAfter[0].items.map((entry) => entry.sourceId), ["a", "x", "b", "c", "d", "e"]);
});

test("segundo Apply ÃƒÂ© idempotente e nÃƒÂ£o cria movimentos adicionais", () => {
  const baseline = ["a", "b", "c", "d", "e", "f"].map((id, index) => item(id, "benfica", index + 1));
  const x = item("x", "outside_liga_other", 1, 23);
  const overrides = [override("x", "zone", "benfica", 2)];
  const first = reconcileMatchdayEditorialProfileDistribution(profile, [...baseline, x], overrides, [], false, []);
  const appliedRows = first.zonesAfter.flatMap((zone) => zone.items.map((entry) => (
    applied(entry.sourceId, zone.key, entry.sortOrder)
  )));
  const second = reconcileMatchdayEditorialProfileDistribution(
    profile,
    [...baseline, x],
    overrides,
    appliedRows,
    true,
    first.faixaAfter,
  );
  assert.equal(second.hasChanges, false);
  assert.deepEqual(second.movements, []);
});

test("snapshot aplicado preserva a ordem aplicada perante datas editoriais divergentes", () => {
  const baseline = [
    item("a", "benfica", 1, 1),
    item("b", "benfica", 2, 23),
    item("c", "benfica", 3, 5),
    item("d", "benfica", 4, 22),
    item("e", "benfica", 5, 2),
    item("f", "benfica", 6, 21),
  ];

  const result =
    reconcileMatchdayEditorialProfileDistribution(
      profile,
      baseline,
      [],
      baseline.map(
        (entry, index) =>
          applied(
            entry.sourceId,
            "benfica",
            index + 1,
          ),
      ),
      true,
      [],
    );

  assert.deepEqual(
    zoneIds(result, "benfica"),
    ["a", "b", "c", "d", "e", "f"],
  );
  assert.equal(result.hasChanges, false);
  assert.deepEqual(result.movements, []);
});
test("snapshot aplicado coloca artigo novo numa vaga livre da zona natural", () => {
  const baseline = ["a", "b", "c", "d", "e", "f"].map(
    (id, index) => item(id, "benfica", index + 1),
  );
  const proposal = item("proposal", "sporting", 1, 23);
  const faixaItems = [faixa("q1", 1), faixa("q2", 2)];
  const activeFaixa = [
    item("q1", "sporting", 20),
    item("q2", "sporting", 21),
  ];

  const result = reconcileMatchdayEditorialProfileDistribution(
    profile,
    [...baseline, proposal, ...activeFaixa],
    [],
    baseline.map((entry, index) =>
      applied(entry.sourceId, "benfica", index + 1)),
    true,
    faixaItems,
  );

  assert.deepEqual(
    zoneIds(result, "benfica"),
    ["a", "b", "c", "d", "e", "f"],
  );
  assert.deepEqual(zoneIds(result, "sporting"), ["proposal"]);
  assert.deepEqual(
    result.faixaAfter.map((entry) => entry.sourceId),
    ["q1", "q2"],
  );
  assert.deepEqual(result.bankAfter, []);
  assert.equal(result.hasChanges, true);
  assert.deepEqual(
    result.movements.map((movement) => [movement.sourceId, movement.to.kind]),
    [["proposal", "zone"]],
  );
});

test("snapshot aplicado envia artigo novo para a Faixa quando a zona natural esta cheia", () => {
  const baseline = ["a", "b", "c", "d", "e", "f"].map(
    (id, index) => item(id, "benfica", index + 1),
  );
  const proposal = item("proposal", "benfica", 7, 23);
  const result = reconcileMatchdayEditorialProfileDistribution(
    profile,
    [...baseline, proposal],
    [],
    baseline.map((entry, index) => applied(entry.sourceId, "benfica", index + 1)),
    true,
    [],
  );

  assert.deepEqual(zoneIds(result, "benfica"), ["a", "b", "c", "d", "e", "f"]);
  assert.deepEqual(result.faixaAfter.map((entry) => entry.sourceId), ["proposal"]);
  assert.deepEqual(result.bankAfter, []);
});

test("snapshot aplicado reserva Banco exclusivamente para override explicito", () => {
  const baseline = ["a", "b", "c", "d", "e", "f"].map(
    (id, index) => item(id, "benfica", index + 1),
  );
  const proposal = item("proposal", "benfica", 7, 23);
  const result = reconcileMatchdayEditorialProfileDistribution(
    profile,
    [...baseline, proposal],
    [override("proposal", "bank", null, null)],
    baseline.map((entry, index) => applied(entry.sourceId, "benfica", index + 1)),
    true,
    [],
  );

  assert.deepEqual(zoneIds(result, "benfica"), ["a", "b", "c", "d", "e", "f"]);
  assert.deepEqual(result.faixaAfter, []);
  assert.deepEqual(
    result.bankAfter.map((entry) => [entry.sourceId, entry.manualOverride]),
    [["proposal", "bank"]],
  );
});

test("varias entradas novas com zonas cheias entram completas na Faixa por ordem do circuito", () => {
  const baseline = ["a", "b", "c", "d", "e", "f"].map(
    (id, index) => item(id, "benfica", index + 1),
  );
  const newItems = [
    item("new-old", "benfica", 7, 5),
    item("new-newest", "benfica", 8, 23),
    item("new-middle", "benfica", 9, 15),
  ];
  const result = reconcileMatchdayEditorialProfileDistribution(
    profile,
    [...baseline, ...newItems],
    [],
    baseline.map((entry, index) => applied(entry.sourceId, "benfica", index + 1)),
    true,
    [],
  );

  assert.deepEqual(
    result.faixaAfter.map((entry) => entry.sourceId),
    ["new-old", "new-newest", "new-middle"],
  );
  assert.deepEqual(result.bankAfter, []);
  assert.equal(new Set(result.faixaAfter.map((entry) => entry.sourceId)).size, newItems.length);
});

test("snapshot e posicao manual permanecem intactos perante entrada nova", () => {
  const baseline = ["a", "b", "c", "d", "e", "f"].map(
    (id, index) => item(id, "benfica", index + 1),
  );
  const proposal = item("proposal", "benfica", 7, 23);
  const result = reconcileMatchdayEditorialProfileDistribution(
    profile,
    [...baseline, proposal],
    [override("c", "zone", "benfica", 3)],
    baseline.map((entry, index) => applied(entry.sourceId, "benfica", index + 1)),
    true,
    [],
  );

  assert.deepEqual(zoneIds(result, "benfica"), ["a", "b", "c", "d", "e", "f"]);
  assert.equal(
    result.zonesAfter.find((zone) => zone.key === "benfica")?.items
      .find((entry) => entry.sourceId === "c")?.manualOverride,
    "position",
  );
  assert.deepEqual(result.faixaAfter.map((entry) => entry.sourceId), ["proposal"]);
  assert.deepEqual(result.bankAfter, []);
});

test("snapshot mantem particao exclusiva entre zona, Faixa e Banco", () => {
  const baseline = ["a", "b", "c", "d", "e", "f"].map(
    (id, index) => item(id, "benfica", index + 1),
  );
  const active = [
    ...baseline,
    item("faixa-new", "benfica", 7, 22),
    item("bank-explicit", "benfica", 8, 23),
    item("zone-free", "sporting", 1, 21),
  ];
  const result = reconcileMatchdayEditorialProfileDistribution(
    profile,
    active,
    [override("bank-explicit", "bank", null, null)],
    baseline.map((entry, index) => applied(entry.sourceId, "benfica", index + 1)),
    true,
    [],
  );
  const identities = [
    ...result.zonesAfter.flatMap((zone) => zone.items.map((entry) => entry.sourceId)),
    ...result.faixaAfter.map((entry) => entry.sourceId),
    ...result.bankAfter.map((entry) => entry.sourceId),
  ];

  assert.equal(identities.length, active.length);
  assert.equal(new Set(identities).size, active.length);
  assert.deepEqual(result.faixaAfter.map((entry) => entry.sourceId), ["faixa-new"]);
  assert.deepEqual(result.bankAfter.map((entry) => entry.sourceId), ["bank-explicit"]);
  assert.deepEqual(zoneIds(result, "sporting"), ["zone-free"]);
});

test("decisÃƒÂ£o explÃƒÂ­cita incorpora proposta e desaloja apenas a baseline necessÃƒÂ¡ria", () => {
  const baseline = ["a", "b", "c", "d", "e", "f"].map(
    (id, index) => item(id, "benfica", index + 1),
  );
  const proposal = item("proposal", "sporting", 1, 23);
  const faixaItems = [faixa("q1", 1), faixa("q2", 2)];
  const activeFaixa = [
    item("q1", "sporting", 20),
    item("q2", "sporting", 21),
  ];

  const result = reconcileMatchdayEditorialProfileDistribution(
    profile,
    [...baseline, proposal, ...activeFaixa],
    [override("proposal", "zone", "benfica", 2)],
    baseline.map((entry, index) =>
      applied(entry.sourceId, "benfica", index + 1)),
    true,
    faixaItems,
  );

  assert.deepEqual(
    zoneIds(result, "benfica"),
    ["a", "proposal", "b", "c", "d", "e"],
  );
  assert.deepEqual(
    result.faixaAfter.map((entry) => entry.sourceId),
    ["f", "q1", "q2"],
  );
  assert.deepEqual(
    result.faixaAfter.map((entry) => entry.sourceId),
    ["f", "q1", "q2"],
  );
  assert.deepEqual(
    result.bankAfter.map((entry) => entry.sourceId),
    [],
  );
});
test("reconcile nunca duplica identidades entre zonas, Faixa e Banco", () => {
  const active = [1, 2, 3, 4, 5, 6, 7].map((number) => item(`a${number}`, "benfica", number));
  const result = reconcileMatchdayEditorialProfileDistribution(profile, active, [], [], false, [faixa("a1", 1)]);
  const identities = [
    ...result.zonesAfter.flatMap((zone) => zone.items.map((entry) => entry.sourceId)),
    ...result.faixaAfter.map((entry) => entry.sourceId),
    ...result.bankAfter.map((entry) => entry.sourceId),
  ];
  assert.equal(new Set(identities).size, identities.length);
  assert.equal(identities.length, active.length);
});
