import assert from "node:assert/strict";
import test from "node:test";

import {
  PUBLIC_MATCHDAY_ROLLOVER_MS,
  selectPublicCompetitionEntryMatchday,
  type PublicCompetitionEntryMatch
} from "@/lib/public-competition-matchday-entry";

const matchdays = [
  { id: "j1", number: 1 },
  { id: "j2", number: 2 },
  { id: "j3", number: 3 }
];

function game(
  matchdayId: string,
  kickoffAt: string,
  overrides: Partial<PublicCompetitionEntryMatch> = {}
): PublicCompetitionEntryMatch {
  return {
    matchday_id: matchdayId,
    status: "scheduled",
    kickoff_at: kickoffAt,
    rollover_excluded: false,
    ...overrides
  };
}

test("janela editorial mantém a jornada durante 50 horas após o kickoff do último jogo normal", () => {
  assert.equal(PUBLIC_MATCHDAY_ROLLOVER_MS, 50 * 60 * 60 * 1000);

  const matches = [game("j1", "2026-08-10T20:00:00.000Z")];

  assert.equal(
    selectPublicCompetitionEntryMatchday(
      matchdays,
      matches,
      new Date("2026-08-12T21:59:59.999Z")
    )?.id,
    "j1"
  );

  assert.equal(
    selectPublicCompetitionEntryMatchday(
      matchdays,
      matches,
      new Date("2026-08-12T22:00:00.000Z")
    )?.id,
    "j2"
  );
});

test("jogo atualmente adiado não prolonga a jornada", () => {
  const matches = [
    game("j1", "2026-08-10T20:00:00.000Z"),
    game("j1", "2026-09-10T20:00:00.000Z", { status: "postponed" })
  ];

  assert.equal(
    selectPublicCompetitionEntryMatchday(
      matchdays,
      matches,
      new Date("2026-08-12T22:00:00.000Z")
    )?.id,
    "j2"
  );
});

test("jogo que foi adiado continua excluído depois de reagendado", () => {
  const matches = [
    game("j1", "2026-08-10T20:00:00.000Z"),
    game("j1", "2026-09-10T20:00:00.000Z", {
      status: "scheduled",
      rollover_excluded: true
    })
  ];

  assert.equal(
    selectPublicCompetitionEntryMatchday(
      matchdays,
      matches,
      new Date("2026-08-12T22:00:00.000Z")
    )?.id,
    "j2"
  );
});

test("avanços sucessivos escolhem a jornada mais recente cujo limiar já passou", () => {
  const matches = [
    game("j1", "2026-08-10T20:00:00.000Z"),
    game("j2", "2026-08-17T20:00:00.000Z")
  ];

  assert.equal(
    selectPublicCompetitionEntryMatchday(
      matchdays,
      matches,
      new Date("2026-08-19T22:00:00.000Z")
    )?.id,
    "j3"
  );
});

test("a última jornada permanece como entrada no fim da época", () => {
  const matches = [
    game("j1", "2026-08-10T20:00:00.000Z"),
    game("j2", "2026-08-17T20:00:00.000Z"),
    game("j3", "2026-08-24T20:00:00.000Z")
  ];

  assert.equal(
    selectPublicCompetitionEntryMatchday(
      matchdays,
      matches,
      new Date("2026-09-15T12:00:00.000Z")
    )?.id,
    "j3"
  );
});
