import assert from "node:assert/strict";
import test from "node:test";

import { createLatestFourNewsProjectionSync } from "@/lib/editorial-matchday-latest-four-projection";
import type { MatchdayEditorialProfileDeskAutomaticItem } from "@/lib/editorial-matchday-profile-desk";
import {
  moveMatchdayEditorialItemsToBank,
  thematicEditorialIdentity,
  type MatchdayEditorialProfileManualOverride,
} from "@/lib/editorial-matchday-profile-desk-operations";
import {
  matchdayEditorialProfileSelectionIdentities,
  prepareExclusiveMatchdayEditorialProfileSelection,
  removeExclusiveMatchdayEditorialProfileSelection,
} from "@/lib/editorial-matchday-profile-selection";
import {
  emptyMatchdayEditorialProfileOpening,
  reconcileMatchdayEditorialProfileWorkspace,
  validateMatchdayEditorialProfileOpening,
} from "@/lib/editorial-matchday-profile-workspace";
import { EDITORIAL_PROFILES } from "@/lib/editorial-profiles";

const profile = EDITORIAL_PROFILES.liga_portugal_v1;
const latestMatchdayId = "00000000-0000-4000-8000-000000000001";

function item(
  sourceId: string,
  circuitOrder: number,
  isNew = false,
): MatchdayEditorialProfileDeskAutomaticItem {
  return {
    sourceType: "editorial_article",
    sourceId,
    sortOrder: circuitOrder,
    classifiedZoneKey: "benfica",
    circuitOrder,
    label: "BENFICA",
    title: `Notícia ${sourceId}`,
    subtitle: null,
    imageUrl: null,
    publishedAt: `2026-08-28T${String(23 - circuitOrder).padStart(2, "0")}:00:00.000Z`,
    updatedAt: `2026-08-28T${String(23 - circuitOrder).padStart(2, "0")}:00:00.000Z`,
    isNew,
  };
}

function identity(sourceId: string): string {
  return thematicEditorialIdentity("editorial_article", sourceId);
}

function override(
  sourceId: string,
  placementTarget: "bank" | "faixa" | "zone",
  sortOrder: number | null = null,
): MatchdayEditorialProfileManualOverride {
  return {
    sourceType: "editorial_article",
    sourceId,
    placementTarget,
    zoneKey: placementTarget === "zone" ? "benfica" : null,
    sortOrder,
  };
}

test("Novas, Abertura, Seleção, Zona, Faixa e Banco formam uma partição exclusiva", () => {
  const activeItems = [
    item("fresh", 1, true),
    item("opening", 2),
    item("selection", 3),
    item("zone", 4),
    item("faixa", 5),
    item("bank", 6),
  ];
  const opening = validateMatchdayEditorialProfileOpening({
    headline: "opening",
    highlight_1: null,
    highlight_2: null,
    highlight_3: null,
    context: null,
  });
  const selectionIdentities = [identity("selection")];
  const workedIdentities = activeItems
    .filter((entry) => entry.sourceId !== "fresh")
    .map((entry) => identity(entry.sourceId));
  const reconciled = reconcileMatchdayEditorialProfileWorkspace(
    profile,
    activeItems,
    [
      override("selection", "bank"),
      override("faixa", "faixa", 1),
      override("bank", "bank"),
    ],
    opening,
    [],
    false,
    [],
    { selectionIdentities, workedIdentities },
  );

  const locations = new Map<string, string[]>();
  const register = (sourceId: string, location: string) => {
    locations.set(sourceId, [...(locations.get(sourceId) ?? []), location]);
  };
  register("fresh", "new");
  register("opening", "opening");
  register("selection", "selection");
  reconciled.zonesAfter.forEach((zone) => zone.items.forEach((entry) =>
    register(entry.sourceId, `zone:${zone.key}`)));
  reconciled.faixaAfter.forEach((entry) => register(entry.sourceId, "faixa"));
  reconciled.bankAfter.forEach((entry) => register(entry.sourceId, "bank"));

  assert.deepEqual(
    Object.fromEntries(Array.from(locations).sort(([left], [right]) => left.localeCompare(right))),
    {
      bank: ["bank"],
      faixa: ["faixa"],
      fresh: ["new"],
      opening: ["opening"],
      selection: ["selection"],
      zone: ["zone:benfica"],
    },
  );
  assert.equal(reconciled.bankAfter.some((entry) => entry.sourceId === "selection"), false);
});

test("um placement independente de Vídeo não pode ser reintroduzido pela Faixa compatibility", () => {
  const faixa = item("faixa-authority", 1);
  const video = item("video-authority", 2);
  const selection = item("selection-authority", 3);
  const reconciled = reconcileMatchdayEditorialProfileWorkspace(
    profile,
    [faixa, video, selection],
    [],
    emptyMatchdayEditorialProfileOpening(),
    [],
    true,
    [faixa, video].map((entry, index) => ({
      ...entry,
      sortOrder: index + 1,
      manualOverride: null,
    })),
    {
      selectionIdentities: [identity(selection.sourceId)],
      independentPlacementIdentities: [identity(video.sourceId)],
    },
  );

  assert.deepEqual(
    reconciled.faixaAfter.map((entry) => entry.sourceId),
    [faixa.sourceId],
  );
  const thematicCircuit = [
    ...reconciled.zonesAfter.flatMap((zone) => zone.items),
    ...reconciled.faixaAfter,
    ...reconciled.bankAfter,
  ];
  assert.equal(
    thematicCircuit.some((entry) => entry.sourceId === video.sourceId),
    false,
  );
  assert.equal(
    thematicCircuit.some((entry) => entry.sourceId === selection.sourceId),
    false,
  );
});

test("Últimas mantém uma notícia cronológica na Abertura sem alterar o seu lugar exclusivo", async () => {
  const opening = validateMatchdayEditorialProfileOpening({
    headline: "article-a",
    highlight_1: null,
    highlight_2: null,
    highlight_3: null,
    context: null,
  });
  const reconciled = reconcileMatchdayEditorialProfileWorkspace(
    profile,
    [item("article-a", 1)],
    [],
    opening,
    [],
    false,
    [],
  );
  const latestRows = [{
    id: "latest-a",
    article_id: "article-a",
    time_label: "Agora",
    title: "Notícia A",
    subtitle: null,
    image_url: null,
    link_url: "/noticias/a",
    sort_order: 1,
    status: "published",
  }];
  let derivedFourNewsTitle: string | null = null;
  const sync = createLatestFourNewsProjectionSync({
    async readLatestNews() {
      return latestRows;
    },
    async readConflictingNews() {
      return [{
        zone: "headline",
        article_id: "article-a",
        link_url: "/noticias/a",
      }];
    },
    async readCanonicalArticles() {
      return [];
    },
    async writeProjection(rows) {
      derivedFourNewsTitle = rows[0]?.title ?? null;
    },
    now() {
      return "2026-08-28T12:00:00.000Z";
    },
  });

  await sync(latestMatchdayId);

  assert.equal(latestRows[0]?.title, "Notícia A");
  assert.equal(derivedFourNewsTitle, null);
  assert.equal(opening.headline, "article-a");
  assert.equal(
    reconciled.zonesAfter.flatMap((zone) => zone.items)
      .some((entry) => entry.sourceId === "article-a"),
    false,
  );
});

test("entrar na Seleção remove o destino anterior sem criar placement de Banco", () => {
  const activeItem = item("article-a", 1);
  const candidates = [{
    bankItemId: "bank-a",
    sourceType: "editorial_article",
    sourceId: "article-a",
  }];
  const transition = prepareExclusiveMatchdayEditorialProfileSelection({
    profile,
    activeItems: [activeItem],
    overrides: [override("article-a", "faixa", 1)],
    opening: emptyMatchdayEditorialProfileOpening(),
    selection: [null, null, null, null],
    candidates,
    targetPosition: 1,
    bankItemId: "bank-a",
  });
  const selectionIdentities = matchdayEditorialProfileSelectionIdentities(
    transition.selection,
    candidates,
  );
  const reconciled = reconcileMatchdayEditorialProfileWorkspace(
    profile,
    [activeItem],
    transition.overrides,
    transition.opening,
    [],
    false,
    [],
    { selectionIdentities, workedIdentities: [identity("article-a")] },
  );

  assert.deepEqual(transition.overrides, []);
  assert.deepEqual(selectionIdentities, [identity("article-a")]);
  assert.equal(reconciled.zonesAfter.flatMap((zone) => zone.items).length, 0);
  assert.equal(reconciled.faixaAfter.length, 0);
  assert.equal(reconciled.bankAfter.length, 0);
});

test("retirar da Seleção devolve notícia trabalhada à Zona e nunca a Novas ou Banco", () => {
  const released = item("released", 1, true);
  const candidates = [{
    bankItemId: "bank-released",
    sourceType: "editorial_article",
    sourceId: "released",
  }];
  const transition = removeExclusiveMatchdayEditorialProfileSelection({
    profile,
    overrides: [override("released", "bank")],
    selection: ["bank-released", null, null, null],
    candidates,
    position: 1,
  });
  const reconciled = reconcileMatchdayEditorialProfileWorkspace(
    profile,
    [released],
    transition.overrides,
    emptyMatchdayEditorialProfileOpening(),
    [],
    false,
    [],
    { workedIdentities: [identity("released")] },
  );

  assert.deepEqual(transition.selection, [null, null, null, null]);
  assert.deepEqual(transition.overrides, []);
  assert.deepEqual(
    reconciled.zonesAfter.find((zone) => zone.key === "benfica")?.items
      .map((entry) => entry.sourceId),
    ["released"],
  );
  assert.equal(reconciled.bankAfter.length, 0);
});

test("substituir na Seleção devolve a notícia anterior ao circuito automático", () => {
  const released = item("released", 1, true);
  const incoming = item("incoming", 2);
  const candidates = [
    {
      bankItemId: "bank-released",
      sourceType: "editorial_article",
      sourceId: "released",
    },
    {
      bankItemId: "bank-incoming",
      sourceType: "editorial_article",
      sourceId: "incoming",
    },
  ];
  const transition = prepareExclusiveMatchdayEditorialProfileSelection({
    profile,
    activeItems: [released, incoming],
    overrides: [],
    opening: emptyMatchdayEditorialProfileOpening(),
    selection: ["bank-released", null, null, null],
    candidates,
    targetPosition: 1,
    bankItemId: "bank-incoming",
  });
  const selectionIdentities = matchdayEditorialProfileSelectionIdentities(
    transition.selection,
    candidates,
  );
  const reconciled = reconcileMatchdayEditorialProfileWorkspace(
    profile,
    [released, incoming],
    transition.overrides,
    transition.opening,
    [],
    false,
    [],
    {
      selectionIdentities,
      workedIdentities: [identity("released"), identity("incoming")],
    },
  );

  assert.deepEqual(transition.selection, ["bank-incoming", null, null, null]);
  assert.deepEqual(
    reconciled.zonesAfter.find((zone) => zone.key === "benfica")?.items
      .map((entry) => entry.sourceId),
    ["released"],
  );
  assert.equal(reconciled.bankAfter.length, 0);
});

test("retirar da Seleção com Zona cheia devolve a notícia automaticamente à Faixa", () => {
  const automatic = Array.from({ length: 6 }, (_, index) =>
    item(`zone-${index + 1}`, index + 1));
  const released = item("released", 7, true);
  const candidates = [{
    bankItemId: "bank-released",
    sourceType: "editorial_article",
    sourceId: "released",
  }];
  const transition = removeExclusiveMatchdayEditorialProfileSelection({
    profile,
    overrides: [],
    selection: ["bank-released", null, null, null],
    candidates,
    position: 1,
  });
  const reconciled = reconcileMatchdayEditorialProfileWorkspace(
    profile,
    [...automatic, released],
    transition.overrides,
    emptyMatchdayEditorialProfileOpening(),
    [],
    false,
    [],
    { workedIdentities: [identity("released")] },
  );

  assert.deepEqual(
    reconciled.zonesAfter.find((zone) => zone.key === "benfica")?.items
      .map((entry) => entry.sourceId),
    automatic.map((entry) => entry.sourceId),
  );
  assert.deepEqual(
    reconciled.faixaAfter.map((entry) => entry.sourceId),
    ["released"],
  );
  assert.equal(reconciled.bankAfter.length, 0);
});

test("Banco só recebe uma notícia através da operação editorial explícita", () => {
  const activeItem = item("article-a", 1);
  const automatic = reconcileMatchdayEditorialProfileWorkspace(
    profile,
    [activeItem],
    [],
    emptyMatchdayEditorialProfileOpening(),
    [],
    false,
    [],
  );
  const bankOverrides = moveMatchdayEditorialItemsToBank(
    profile,
    [activeItem],
    [],
    [identity("article-a")],
  );
  const explicitBank = reconcileMatchdayEditorialProfileWorkspace(
    profile,
    [activeItem],
    bankOverrides,
    emptyMatchdayEditorialProfileOpening(),
    [],
    false,
    [],
  );

  assert.equal(automatic.bankAfter.length, 0);
  assert.deepEqual(explicitBank.bankAfter.map((entry) => entry.sourceId), ["article-a"]);
});

test("uma identidade já materializada numa Zona nunca é reinterpretada como Nova", () => {
  const previouslyUsed = item("previously-used", 1, true);
  const reconciled = reconcileMatchdayEditorialProfileWorkspace(
    profile,
    [previouslyUsed],
    [],
    emptyMatchdayEditorialProfileOpening(),
    [{
      sourceType: "editorial_article",
      sourceId: "previously-used",
      zoneKey: "benfica",
      sortOrder: 1,
    }],
    true,
    [],
  );

  assert.deepEqual(
    reconciled.zonesAfter.find((zone) => zone.key === "benfica")?.items
      .map((entry) => entry.sourceId),
    ["previously-used"],
  );
  assert.equal(reconciled.faixaAfter.length, 0);
  assert.equal(reconciled.bankAfter.length, 0);
});
