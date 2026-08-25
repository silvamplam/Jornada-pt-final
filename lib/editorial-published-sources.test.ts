import assert from "node:assert/strict";
import test from "node:test";

import {
  buildEditorialPublishedSourceContextFilter,
  matchesContextScope,
} from "./editorial-published-sources";

type SourceContext = {
  competition_id: string | null;
  season_id: string | null;
  matchday_id: string | null;
};

const context = {
  competitionId: "competition-1",
  seasonId: "season-1",
  matchdayId: "matchday-1",
};

function matchesServerSideNullOrEqualRule(source: SourceContext) {
  return (
    (source.competition_id === null || source.competition_id === context.competitionId) &&
    (source.season_id === null || source.season_id === context.seasonId) &&
    (source.matchday_id === null || source.matchday_id === context.matchdayId)
  );
}

test("o filtro contextual PostgREST aplica NULL ou igualdade em cada dimensão", () => {
  assert.equal(
    buildEditorialPublishedSourceContextFilter(context),
    "&and=(or(competition_id.is.null,competition_id.eq.competition-1),or(season_id.is.null,season_id.eq.season-1),or(matchday_id.is.null,matchday_id.eq.matchday-1))",
  );
});

test("a regra server-side é equivalente ao matchesContextScope anterior", () => {
  const values = [null, "matching", "other"] as const;
  const sources: SourceContext[] = [];

  for (const competition of values) {
    for (const season of values) {
      for (const matchday of values) {
        sources.push({
          competition_id: competition === "matching" ? context.competitionId : competition,
          season_id: season === "matching" ? context.seasonId : season,
          matchday_id: matchday === "matching" ? context.matchdayId : matchday,
        });
      }
    }
  }

  assert.deepEqual(
    sources.filter((source) => matchesContextScope(source, context)),
    sources.filter(matchesServerSideNullOrEqualRule),
  );
});

test("sem contexto não acrescenta filtro e mantém o inventário global", () => {
  assert.equal(buildEditorialPublishedSourceContextFilter(), "");
  assert.equal(
    buildEditorialPublishedSourceContextFilter({ competitionId: "  ", seasonId: null }),
    "",
  );
});
