import assert from "node:assert/strict";
import test from "node:test";
import {
  MATCHDAY_DESK_GROUPS,
  applyDeskPlacementSelection,
  moveDeskArticleWithinPlacementGroup,
  placementGroupForKey,
  placeDeskArticleInSlot,
  setDeskLatestMembership,
  swapDeskArticleToSlot,
  type MatchdayDeskDesiredState,
} from "@/lib/editorial-matchday-desk-model";
import { LIVE_MATCHDAY_HIERARCHICAL_LAYOUT_POSITIONS } from "@/lib/editorial-hierarchical-composition";

function state(): MatchdayDeskDesiredState {
  return {
    a: { inLatest: true, placementKey: null },
    b: { inLatest: true, placementKey: "live_four_news:1" },
    c: { inLatest: false, placementKey: "live_four_news:2" },
    d: { inLatest: true, placementKey: "important_item:1" },
    e: { inLatest: false, placementKey: "important_item:2" },
    f: { inLatest: true, placementKey: null },
  };
}

test("a Mesa cobre todas as posições dos layouts vivos sem usar a composição", () => {
  const deskLiveSlots = MATCHDAY_DESK_GROUPS.flatMap((group) => group.slots.map((slot) => slot.key))
    .filter((key) => key.startsWith("live_"));
  const expected = LIVE_MATCHDAY_HIERARCHICAL_LAYOUT_POSITIONS.map((position) => position.transferSlotType);
  assert.deepEqual([...deskLiveSlots].sort(), [...expected].sort());
});

test("Últimas é independente da única colocação editorial", () => {
  const placed = applyDeskPlacementSelection(state(), ["a"], "four_news");
  assert.equal(placed.a.inLatest, true);
  assert.equal(placed.a.placementKey, "live_four_news:1");
  assert.equal(placed.b.placementKey, null);

  const outsideLatest = setDeskLatestMembership(placed, ["a"], false);
  assert.equal(outsideLatest.a.inLatest, false);
  assert.equal(outsideLatest.a.placementKey, "live_four_news:1");
});

test("Sem colocação total é representável sem criar uma segunda zona", () => {
  const noEditorial = applyDeskPlacementSelection(state(), ["b"], "none");
  const unplaced = setDeskLatestMembership(noEditorial, ["b"], false);
  assert.equal(unplaced.b.inLatest, false);
  assert.equal(unplaced.b.placementKey, null);
});

test("a ordem de seleção preenche uma zona e desaloja apenas os lugares usados", () => {
  const next = applyDeskPlacementSelection(state(), ["f", "a"], "four_news");
  assert.equal(next.f.placementKey, "live_four_news:1");
  assert.equal(next.a.placementKey, "live_four_news:2");
  assert.equal(next.b.placementKey, null);
  assert.equal(next.c.placementKey, null);
});

test("a Faixa aceita várias notícias, preserva uma única colocação e normaliza a ordem", () => {
  const next = applyDeskPlacementSelection(state(), ["a", "b"], "faixa");
  assert.equal(next.d.placementKey, "important_item:1");
  assert.equal(next.e.placementKey, "important_item:2");
  assert.equal(next.a.placementKey, "important_item:3");
  assert.equal(next.b.placementKey, "important_item:4");

  const moved = moveDeskArticleWithinPlacementGroup(next, "b", "up");
  assert.equal(moved.b.placementKey, "important_item:3");
  assert.equal(moved.a.placementKey, "important_item:4");
});

test("arrastar dentro de uma zona troca as posições sem duplicar a notícia", () => {
  const next = swapDeskArticleToSlot(state(), "b", "live_four_news:2");
  assert.equal(next.b.placementKey, "live_four_news:2");
  assert.equal(next.c.placementKey, "live_four_news:1");
  assert.equal(placementGroupForKey(next.b.placementKey), "four_news");
});
test("uma noticia pode ir diretamente para um slot especifico", () => {
  const highlight = placeDeskArticleInSlot(state(), "a", "highlight:2");
  assert.equal(highlight.a.placementKey, "highlight:2");
  assert.equal(highlight.a.inLatest, true);

  const occupied = placeDeskArticleInSlot(state(), "a", "live_four_news:2");
  assert.equal(occupied.a.placementKey, "live_four_news:2");
  assert.equal(occupied.c.placementKey, null);
  assert.equal(occupied.a.inLatest, true);
});
