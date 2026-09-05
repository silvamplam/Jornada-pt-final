import assert from "node:assert/strict";
import test from "node:test";

import {
  ensurePublishedArticleInLatest,
  finalizePublishedArticlesInLatestBatch,
} from "@/lib/editorial-matchday-news-flow";

const matchdayId = "8a000000-0000-4000-8000-000000000001";
const articleId = "8a000000-0000-4000-8000-000000000101";

const article = {
  id: articleId,
  slug: "boundary-runtime-article",
  label: "TESTE",
  title: "Boundary runtime article",
  subtitle: "Subtitle",
  body: "Body",
  image_url: "https://example.test/runtime.jpg",
  author: "Author",
  published_at: "2026-09-05T10:30:00.000Z",
  created_at: "2026-09-05T10:00:00.000Z",
  matchday_id: matchdayId,
  status: "published",
};

type RecordedRequest = Readonly<{
  url: string;
  method: string;
  body: unknown;
}>;

function withSupabaseFetch(
  respond: (url: string, method: string) => Response,
) {
  const requests: RecordedRequest[] = [];
  const previousUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const previousKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const previousFetch = globalThis.fetch;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://boundary-runtime.supabase.test";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role";
  globalThis.fetch = (async (input, init) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    requests.push({
      url,
      method,
      body: typeof init?.body === "string" ? JSON.parse(init.body) : null,
    });
    return respond(url, method);
  }) as typeof fetch;

  return {
    requests,
    restore() {
      globalThis.fetch = previousFetch;
      if (previousUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
      else process.env.NEXT_PUBLIC_SUPABASE_URL = previousUrl;
      if (previousKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
      else process.env.SUPABASE_SERVICE_ROLE_KEY = previousKey;
    },
  };
}

test("finalize batch chama settings autorizado antes de normalize", async () => {
  const mock = withSupabaseFetch(() => new Response(null, { status: 204 }));
  try {
    await finalizePublishedArticlesInLatestBatch(matchdayId);
  } finally {
    mock.restore();
  }

  assert.deepEqual(
    mock.requests.map(({ url }) => new URL(url).pathname),
    [
      "/rest/v1/rpc/set_matchday_latest_news_settings_v15",
      "/rest/v1/rpc/normalize_matchday_latest_news_order",
    ],
  );
  assert.equal(
    mock.requests.some(({ url }) => url.includes("matchday_editorials")),
    false,
  );
});

test("create de lote entra em Ultimas sem placement e finalize completa", async () => {
  const mock = withSupabaseFetch((url, method) => {
    if (url.includes("editorial_articles?")) {
      return Response.json([article]);
    }
    if (url.includes("matchday_latest_news?") && method === "GET") {
      return Response.json([]);
    }
    return new Response(null, { status: 204 });
  });
  try {
    await ensurePublishedArticleInLatest(matchdayId, articleId, {
      deferGlobalSync: true,
    });
    await finalizePublishedArticlesInLatestBatch(matchdayId);
  } finally {
    mock.restore();
  }

  assert.equal(
    mock.requests.filter(({ url, method }) => (
      url.includes("/matchday_latest_news") && method === "POST"
    )).length,
    1,
  );
  assert.equal(
    mock.requests.some(({ url }) => (
      url.includes("apply_matchday_live_layout")
      || url.includes("matchday_live_layout_placements")
      || url.includes("matchday_editorials")
    )),
    false,
  );
  assert.equal(
    mock.requests.at(-1)?.url.includes(
      "/rpc/normalize_matchday_latest_news_order",
    ),
    true,
  );
});

test("resume atualiza a mesma row de Ultimas sem duplicar nem colocar", async () => {
  const mock = withSupabaseFetch((url, method) => {
    if (url.includes("editorial_articles?")) {
      return Response.json([article]);
    }
    if (url.includes("matchday_latest_news?") && method === "GET") {
      return Response.json([{
        id: "8a000000-0000-4000-8000-000000000201",
        article_id: null,
        link_url: "/noticias/boundary-runtime-article",
        sort_order: 1,
        status: "published",
        created_at: "2026-09-05T10:30:00.000Z",
      }]);
    }
    return new Response(null, { status: 204 });
  });
  try {
    await ensurePublishedArticleInLatest(matchdayId, articleId, {
      deferGlobalSync: true,
    });
  } finally {
    mock.restore();
  }

  assert.equal(
    mock.requests.filter(({ url, method }) => (
      url.includes("/matchday_latest_news") && method === "PATCH"
    )).length,
    1,
  );
  assert.equal(
    mock.requests.some(({ method }) => method === "POST"),
    false,
  );
  assert.equal(
    mock.requests.some(({ url }) => url.includes("apply_matchday_live_layout")),
    false,
  );
});
