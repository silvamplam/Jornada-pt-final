/** Compare real PostgreSQL preview plans against the independently tested pure planner. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  resolveMesaProductionIntent,
  type MesaProductionIntent,
  type MesaProductionIntentPlan,
  type MesaSourceAuthority,
  type MesaPublishedArticleAuthority,
} from "../../lib/redacao-automatica/newsroom-mesa-production-intents";

type SqlPreview = MesaProductionIntentPlan & { request: MesaProductionIntent };
const filename = process.argv[2];
assert.ok(filename, "Usage: tsx .ci/mesa-intents-sql/compare.ts <sql-previews.json>");
const previews = JSON.parse(readFileSync(filename, "utf8")) as SqlPreview[];
assert.ok(Array.isArray(previews) && previews.length > 0);
const target = (article: MesaPublishedArticleAuthority) => ({
  editorialArticleId: article.editorialArticleId,
  slug: article.slug, title: article.title, matchdayId: article.matchdayId,
  contentFingerprint: article.contentFingerprint,
});
const normalized = (plan: MesaProductionIntentPlan) => ({
  contractVersion: plan.contractVersion, preparationKey: plan.preparationKey,
  title: plan.title, capturedAt: plan.capturedAt,
  contexts: plan.contexts.map((context) => ({
    key: context.key, kind: context.kind, themeId: context.themeId, sourceId: context.sourceId,
    title: context.title, reviewPublished: context.reviewPublished, newArticleCount: context.newArticleCount,
    sources: context.sources.map(({ newsroomArticleId, newsroomSnapshotId, capturedAt }) => ({
      newsroomArticleId, newsroomSnapshotId, capturedAt,
    })),
    publishedArticles: context.publishedArticles.map(target),
  })),
  outputs: plan.outputs.map(({ slot, contextKey, kind, target: article }) => ({
    slot, contextKey, kind, target: article ? target(article) : null,
  })),
  incorporations: plan.incorporations, deferred: plan.deferred, totals: plan.totals,
});
for (const preview of previews) {
  const captures = new Map<string, MesaSourceAuthority>();
  for (const context of preview.contexts) for (const source of context.sources) {
    captures.set(source.newsroomArticleId, { newsroomArticleId: source.newsroomArticleId,
      latestSnapshot: { id: source.newsroomSnapshotId, capturedAt: source.capturedAt, usable: true } });
  }
  const authority = {
    readAt: preview.capturedAt,
    themes: preview.contexts.filter((context) => context.kind === "theme").map((context) => ({
      themeId: context.themeId!, title: context.title, status: "open" as const,
      sources: context.sources.filter((source) => !preview.incorporations.some((incorporation) => (
        incorporation.themeId === context.themeId && incorporation.sourceId === source.newsroomArticleId
      ))).map((source) => captures.get(source.newsroomArticleId)!),
      publishedArticles: context.publishedArticles.map(target),
    })),
    sources: preview.request.sources.flatMap((source) => {
      const capture = captures.get(source.sourceId);
      return source.destination === "defer" || !capture ? [] : [capture];
    }),
  };
  const result = resolveMesaProductionIntent(preview.request, authority);
  assert.ok(result.ok, JSON.stringify(result));
  assert.deepEqual(normalized(preview), normalized(result.value), `SQL/TypeScript drift: ${preview.preparationKey}`);
}
console.log(`PASS: ${previews.length} PostgreSQL previews match the pure per-context planner`);
