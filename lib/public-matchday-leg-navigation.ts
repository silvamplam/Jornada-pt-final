export type PublicMatchdayLeg = "first" | "second";

export type PublicMatchdayNavigationItem = {
  id: string;
  number: number | null;
};

export type PublicMatchdayLegNavigation<T extends PublicMatchdayNavigationItem> = {
  applies: boolean;
  matchdaysPerLeg: number | null;
  expectedMatchdayCount: number | null;
  activeLeg: PublicMatchdayLeg;
  firstLegMatchdays: T[];
  secondLegMatchdays: T[];
  visibleMatchdays: T[];
  firstLegTarget: T | null;
  secondLegTarget: T | null;
};

function selectedOrFirst<T extends PublicMatchdayNavigationItem>(matchdays: T[], selectedMatchdayId: string | null | undefined) {
  return matchdays.find((matchday) => matchday.id === selectedMatchdayId) ?? matchdays[0] ?? null;
}

export function buildPublicMatchdayLegNavigation<T extends PublicMatchdayNavigationItem>(
  matchdays: readonly T[],
  activeParticipantCount: number | null | undefined,
  selectedMatchdayId: string | null | undefined
): PublicMatchdayLegNavigation<T> {
  const orderedMatchdays = [...matchdays].sort((left, right) => (left.number ?? Number.MAX_SAFE_INTEGER) - (right.number ?? Number.MAX_SAFE_INTEGER));
  const hasSupportedParticipantCount =
    Number.isInteger(activeParticipantCount) && (activeParticipantCount ?? 0) >= 2 && (activeParticipantCount ?? 0) % 2 === 0;

  if (!hasSupportedParticipantCount) {
    const firstLegTarget = selectedOrFirst(orderedMatchdays, selectedMatchdayId);

    return {
      applies: false,
      matchdaysPerLeg: null,
      expectedMatchdayCount: null,
      activeLeg: "first",
      firstLegMatchdays: orderedMatchdays,
      secondLegMatchdays: [],
      visibleMatchdays: orderedMatchdays,
      firstLegTarget,
      secondLegTarget: null
    };
  }

  const matchdaysPerLeg = (activeParticipantCount as number) - 1;
  const expectedMatchdayCount = matchdaysPerLeg * 2;
  const hasOnlyRoundRobinNumbers = orderedMatchdays.every(
    (matchday) =>
      Number.isInteger(matchday.number) &&
      (matchday.number ?? 0) >= 1 &&
      (matchday.number ?? 0) <= expectedMatchdayCount
  );
  const firstLegMatchdays = orderedMatchdays.filter((matchday) => (matchday.number ?? 0) <= matchdaysPerLeg);
  const secondLegMatchdays = orderedMatchdays.filter((matchday) => (matchday.number ?? 0) > matchdaysPerLeg);
  const applies = hasOnlyRoundRobinNumbers && firstLegMatchdays.length > 0 && secondLegMatchdays.length > 0;

  if (!applies) {
    const firstLegTarget = selectedOrFirst(orderedMatchdays, selectedMatchdayId);

    return {
      applies: false,
      matchdaysPerLeg,
      expectedMatchdayCount,
      activeLeg: "first",
      firstLegMatchdays: orderedMatchdays,
      secondLegMatchdays: [],
      visibleMatchdays: orderedMatchdays,
      firstLegTarget,
      secondLegTarget: null
    };
  }

  const activeLeg: PublicMatchdayLeg = secondLegMatchdays.some((matchday) => matchday.id === selectedMatchdayId)
    ? "second"
    : "first";

  return {
    applies,
    matchdaysPerLeg,
    expectedMatchdayCount,
    activeLeg,
    firstLegMatchdays,
    secondLegMatchdays,
    visibleMatchdays: activeLeg === "second" ? secondLegMatchdays : firstLegMatchdays,
    firstLegTarget: selectedOrFirst(firstLegMatchdays, selectedMatchdayId),
    secondLegTarget: selectedOrFirst(secondLegMatchdays, selectedMatchdayId)
  };
}
