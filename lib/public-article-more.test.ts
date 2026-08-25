import assert from "node:assert/strict";
import test from "node:test";

import {
  PUBLIC_MORE_ARTICLES_LIMIT,
  buildPublicMoreArticleScopes,
  publicArticleContextPriority,
  selectPublicMoreArticles,
  type PublicMoreArticleContext,
  type PublicMoreArticleScope,
} from "./public-article-more";

type Candidate = PublicMoreArticleContext & Readonly<{ slug: string }>;

const current: Candidate = {
  id: "current",
  slug: "current",
  competition_id: "competition-1",
  season_id: "season-1",
  matchday_id: "matchday-1",
};

function candidate(id: string, context: Partial<PublicMoreArticleContext>): Candidate {
  return {
    id,
    slug: id,
    competition_id: null,
    season_id: null,
    matchday_id: null,
    ...context,
  };
}

test("preserva a prioridade dos quatro níveis e pede apenas o número ainda em falta", async () => {
  const byPriority = new Map<PublicMoreArticleScope["priority"], Candidate[]>([
    [
      1,
      [
        candidate("matchday-a", { matchday_id: "matchday-1" }),
        candidate("matchday-b", { matchday_id: "matchday-1" }),
      ],
    ],
    [2, [candidate("season", { competition_id: "competition-1", season_id: "season-1" })]],
    [3, [candidate("competition", { competition_id: "competition-1" })]],
    [4, [candidate("general-a", {}), candidate("general-b", {})]],
  ]);
  const requested: Array<{ priority: number; limit: number }> = [];

  const selected = await selectPublicMoreArticles(current, async (scope, limit) => {
    requested.push({ priority: scope.priority, limit });
    return (byPriority.get(scope.priority) ?? []).slice(0, limit);
  });

  assert.deepEqual(selected.map((article) => article.id), [
    "matchday-a",
    "matchday-b",
    "season",
    "competition",
    "general-a",
  ]);
  assert.deepEqual(requested, [
    { priority: 1, limit: 5 },
    { priority: 2, limit: 3 },
    { priority: 3, limit: 2 },
    { priority: 4, limit: 1 },
  ]);
});

test("exclui o artigo atual, duplicados e candidatos de contexto incompatível", async () => {
  const selected = await selectPublicMoreArticles(current, async (scope) => {
    if (scope.priority === 1) {
      return [
        current,
        candidate("wrong-matchday", { matchday_id: "matchday-2" }),
        candidate("valid-matchday", { matchday_id: "matchday-1" }),
      ];
    }

    if (scope.priority === 2) {
      return [
        candidate("valid-matchday", { competition_id: "competition-1", season_id: "season-1" }),
        candidate("wrong-season", { competition_id: "competition-1", season_id: "season-2" }),
        candidate("valid-season", { competition_id: "competition-1", season_id: "season-1" }),
      ];
    }

    return [];
  });

  assert.deepEqual(selected.map((article) => article.id), ["valid-matchday", "valid-season"]);
  assert.ok(selected.every((article) => article.id !== current.id));
});

test("nunca devolve mais de cinco artigos", async () => {
  const selected = await selectPublicMoreArticles(current, async (scope, limit) =>
    Array.from({ length: limit + 3 }, (_, index) =>
      candidate(`article-${index}`, { matchday_id: scope.priority === 1 ? "matchday-1" : null }),
    ),
  );

  assert.equal(PUBLIC_MORE_ARTICLES_LIMIT, 5);
  assert.equal(selected.length, 5);
});

test("os scopes PostgREST representam exatamente os níveis disponíveis", () => {
  assert.deepEqual(buildPublicMoreArticleScopes(current), [
    { priority: 1, filter: "matchday_id=eq.matchday-1" },
    {
      priority: 2,
      filter: "competition_id=eq.competition-1&season_id=eq.season-1&matchday_id=is.null",
    },
    {
      priority: 3,
      filter: "competition_id=eq.competition-1&season_id=is.null&matchday_id=is.null",
    },
    {
      priority: 4,
      filter: "competition_id=is.null&season_id=is.null&matchday_id=is.null",
    },
  ]);

  assert.equal(
    publicArticleContextPriority(candidate("incompatible", { competition_id: "competition-2" }), current),
    null,
  );
});
