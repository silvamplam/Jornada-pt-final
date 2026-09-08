import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  NEWSROOM_ARTICLE_CLASSIFICATION_BATCH_SIZE,
  readNewsroomArticleClassificationRowsByIds,
  type NewsroomArticleClassificationBatchFetcher,
} from "@/lib/redacao-automatica/newsroom-article-classification-read-internal";

function articleId(index: number): string {
  return `94000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
}

test("leitura em lote usa chunks fixos e não executa N+1", async () => {
  const ids = Array.from(
    { length: NEWSROOM_ARTICLE_CLASSIFICATION_BATCH_SIZE * 2 + 5 },
    (_, index) => articleId(index + 1),
  );
  const batches: string[][] = [];
  const fetchBatch: NewsroomArticleClassificationBatchFetcher = async <T>(
    chunk: readonly string[],
  ) => {
    batches.push([...chunk]);
    return chunk.map((newsroomArticleId) => ({
      newsroom_article_id: newsroomArticleId,
    })) as T[];
  };

  const rows = await readNewsroomArticleClassificationRowsByIds<{
    newsroom_article_id: string;
  }>(fetchBatch, ids);

  assert.deepEqual(rows.map((row) => row.newsroom_article_id), ids);
  assert.deepEqual(batches.map((batch) => batch.length), [100, 100, 5]);
});

test("reader em lote preserva todas as linhas para além de uma página", async () => {
  const ids = Array.from({ length: 307 }, (_, index) => articleId(index + 1));
  const fetchBatch: NewsroomArticleClassificationBatchFetcher =
    async <T>(chunk: readonly string[]) => [...chunk] as T[];

  const rows = await readNewsroomArticleClassificationRowsByIds<string>(
    fetchBatch,
    ids,
  );
  assert.deepEqual(rows, ids);
});

test("reader falha em vez de aceitar uma resposta PostgREST truncada", async () => {
  const ids = Array.from({ length: 25 }, (_, index) => articleId(index + 1));
  const truncated: NewsroomArticleClassificationBatchFetcher =
    async <T>(chunk: readonly string[]) => chunk.slice(0, -1) as T[];

  await assert.rejects(
    readNewsroomArticleClassificationRowsByIds(truncated, ids),
    /newsroom_article_classification_relation_invalid/,
  );
});

test("listagem tem paginação explícita, desempate estável e sinal de continuação", () => {
  const repository = readFileSync(
    "lib/redacao-automatica/newsroom-article-classification-repository.ts",
    "utf8",
  );

  assert.match(repository, /const DEFAULT_PAGE_SIZE = 50/);
  assert.match(repository, /const MAX_PAGE_SIZE = 200/);
  assert.match(
    repository,
    /order=classified_at\.desc,newsroom_article_id\.asc/,
  );
  assert.match(repository, /limit=\$\{pagination\.limit \+ 1\}/);
  assert.match(repository, /offset=\$\{pagination\.offset\}/);
  assert.match(repository, /hasNextPage: rows\.length > pagination\.limit/);
});

test("read contract representa ausência como estado, não como classification_key", () => {
  const repository = readFileSync(
    "lib/redacao-automatica/newsroom-article-classification-repository.ts",
    "utf8",
  );
  const contract = readFileSync(
    "lib/redacao-automatica/newsroom-article-classification-service-internal.ts",
    "utf8",
  );

  assert.match(contract, /status: "unclassified";\s*classification: null/);
  assert.match(repository, /status: "unclassified", classification: null/);
  assert.doesNotMatch(contract, /classificationKey:\s*"unclassified"/);
});
