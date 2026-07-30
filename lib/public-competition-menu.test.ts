import assert from "node:assert/strict";
import test from "node:test";

import {
  resolvePublicCompetitionCurrentMatchday,
  type PublicCompetitionMatchdayCandidate
} from "@/lib/public-competition-menu";

function matchday(
  number: number,
  startsOn: string | null,
  endsOn: string | null,
  status = "scheduled"
): PublicCompetitionMatchdayCandidate {
  return {
    number,
    starts_on: startsOn,
    ends_on: endsOn,
    status
  };
}

const calendar = [
  matchday(1, "2026-08-14", "2026-08-17"),
  matchday(2, "2026-08-21", "2026-08-24"),
  matchday(3, "2026-08-28", "2026-08-31")
];

test("before the competition opens the first matchday", () => {
  assert.equal(
    resolvePublicCompetitionCurrentMatchday(
      calendar,
      new Date("2026-07-30T12:00:00.000Z")
    )?.number,
    1
  );
});

test("during a matchday opens the calendar matchday in progress", () => {
  assert.equal(
    resolvePublicCompetitionCurrentMatchday(
      calendar,
      new Date("2026-08-22T12:00:00.000Z")
    )?.number,
    2
  );
});

test("between matchdays opens the next matchday", () => {
  assert.equal(
    resolvePublicCompetitionCurrentMatchday(
      calendar,
      new Date("2026-08-19T12:00:00.000Z")
    )?.number,
    2
  );
});

test("a live status has priority over calendar dates", () => {
  const withLiveMatchday = [
    matchday(1, "2026-08-14", "2026-08-17", "finished"),
    matchday(2, "2026-08-21", "2026-08-24", "live"),
    matchday(3, "2026-08-28", "2026-08-31")
  ];

  assert.equal(
    resolvePublicCompetitionCurrentMatchday(
      withLiveMatchday,
      new Date("2026-08-29T12:00:00.000Z")
    )?.number,
    2
  );
});

test("after the competition opens the last matchday", () => {
  assert.equal(
    resolvePublicCompetitionCurrentMatchday(
      calendar,
      new Date("2026-09-12T12:00:00.000Z")
    )?.number,
    3
  );
});

test("without dates opens the first unfinished matchday", () => {
  const withoutDates = [
    matchday(1, null, null, "finished"),
    matchday(2, null, null, "scheduled"),
    matchday(3, null, null, "scheduled")
  ];

  assert.equal(
    resolvePublicCompetitionCurrentMatchday(withoutDates)?.number,
    2
  );
});

test("without dates and with all matchdays finished opens the last one", () => {
  const finished = [
    matchday(1, null, null, "finished"),
    matchday(2, null, null, "finished"),
    matchday(3, null, null, "finished")
  ];

  assert.equal(
    resolvePublicCompetitionCurrentMatchday(finished)?.number,
    3
  );
});
