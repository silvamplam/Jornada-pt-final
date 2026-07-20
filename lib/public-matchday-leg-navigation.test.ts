import assert from "node:assert/strict";
import test from "node:test";

import { buildPublicMatchdayLegNavigation } from "@/lib/public-matchday-leg-navigation";

type Matchday = {
  id: string;
  number: number;
};

function matchdays(first: number, last: number): Matchday[] {
  return Array.from({ length: last - first + 1 }, (_, index) => {
    const number = first + index;
    return { id: `matchday-${number}`, number };
  });
}

function numbers(items: readonly Matchday[]) {
  return items.map((item) => item.number);
}

test("18 participantes dividem a época entre J17 e J18", () => {
  const navigation = buildPublicMatchdayLegNavigation(matchdays(1, 34), 18, "matchday-1");

  assert.equal(navigation.applies, true);
  assert.equal(navigation.matchdaysPerLeg, 17);
  assert.deepEqual(numbers(navigation.firstLegMatchdays), matchdays(1, 17).map((item) => item.number));
  assert.deepEqual(numbers(navigation.secondLegMatchdays), matchdays(18, 34).map((item) => item.number));
  assert.equal(navigation.secondLegTarget?.number, 18);
});

test("20 participantes dividem a época entre J19 e J20", () => {
  const navigation = buildPublicMatchdayLegNavigation(matchdays(1, 38), 20, "matchday-1");

  assert.equal(navigation.matchdaysPerLeg, 19);
  assert.equal(navigation.firstLegMatchdays.at(-1)?.number, 19);
  assert.equal(navigation.secondLegMatchdays[0]?.number, 20);
  assert.equal(navigation.secondLegMatchdays.at(-1)?.number, 38);
});

test("um calendário parcial não altera o limite estrutural", () => {
  const navigation = buildPublicMatchdayLegNavigation(matchdays(1, 20), 18, "matchday-17");

  assert.equal(navigation.applies, true);
  assert.equal(navigation.matchdaysPerLeg, 17);
  assert.equal(navigation.firstLegMatchdays.at(-1)?.number, 17);
  assert.deepEqual(numbers(navigation.secondLegMatchdays), [18, 19, 20]);
});

test("a mudança de volta escolhe a primeira jornada disponível da volta de destino", () => {
  const portugal = buildPublicMatchdayLegNavigation(matchdays(1, 34), 18, "matchday-12");
  const spain = buildPublicMatchdayLegNavigation(matchdays(1, 38), 20, "matchday-12");

  assert.equal(portugal.secondLegTarget?.number, 18);
  assert.equal(spain.secondLegTarget?.number, 20);
});

test("a jornada selecionada é preservada quando pertence à volta ativa", () => {
  const firstLeg = buildPublicMatchdayLegNavigation(matchdays(1, 34), 18, "matchday-9");
  const secondLeg = buildPublicMatchdayLegNavigation(matchdays(1, 34), 18, "matchday-23");

  assert.equal(firstLeg.activeLeg, "first");
  assert.equal(firstLeg.firstLegTarget?.number, 9);
  assert.equal(secondLeg.activeLeg, "second");
  assert.equal(secondLeg.secondLegTarget?.number, 23);
  assert.equal(secondLeg.firstLegTarget?.number, 1);
});

test("as duas voltas não sobrepõem nem perdem jornadas", () => {
  const allMatchdays = matchdays(1, 34);
  const navigation = buildPublicMatchdayLegNavigation(allMatchdays, 18, "matchday-18");
  const firstIds = new Set(navigation.firstLegMatchdays.map((item) => item.id));
  const secondIds = new Set(navigation.secondLegMatchdays.map((item) => item.id));

  assert.equal([...firstIds].some((id) => secondIds.has(id)), false);
  assert.deepEqual(
    [...navigation.firstLegMatchdays, ...navigation.secondLegMatchdays].map((item) => item.id).sort(),
    allMatchdays.map((item) => item.id).sort()
  );
});

test("formatos sem estrutura par compatível mantêm uma navegação única", () => {
  const oddParticipants = buildPublicMatchdayLegNavigation(matchdays(1, 10), 5, "matchday-4");
  const roundsOutsideExpectedFormat = buildPublicMatchdayLegNavigation(matchdays(1, 35), 18, "matchday-20");

  assert.equal(oddParticipants.applies, false);
  assert.equal(oddParticipants.visibleMatchdays.length, 10);
  assert.equal(roundsOutsideExpectedFormat.applies, false);
  assert.equal(roundsOutsideExpectedFormat.visibleMatchdays.length, 35);
});

test("a ordenação e a navegação móvel usam o mesmo conjunto determinístico", () => {
  const unordered = [matchdays(18, 34), matchdays(1, 17)].flat();
  const navigation = buildPublicMatchdayLegNavigation(unordered, 18, "matchday-18");

  assert.deepEqual(numbers(navigation.firstLegMatchdays), numbers(matchdays(1, 17)));
  assert.deepEqual(numbers(navigation.secondLegMatchdays), numbers(matchdays(18, 34)));
  assert.equal(navigation.visibleMatchdays, navigation.secondLegMatchdays);
});
