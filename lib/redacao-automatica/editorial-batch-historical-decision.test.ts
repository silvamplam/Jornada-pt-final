import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import type { EditorialBatchArticle } from "./editorial-batch-parser";
import {
  applyEditorialBatchHistoricalDecisions,
  editorialBatchHistoricalChoiceIdentity,
  editorialBatchSelectedHistoricalArticleIds,
  pruneEditorialBatchHistoricalChoices,
} from "./editorial-batch-historical-decision";

const ARTICLE_1 = "10000000-0000-4000-8000-000000000001";
const ARTICLE_2 = "10000000-0000-4000-8000-000000000002";
const OUTPUT_1 = "20000000-0000-4000-8000-000000000001";
const OUTPUT_2 = "20000000-0000-4000-8000-000000000002";

function article(
  key: string,
  outputId: string | null,
  title = `Título ${key}`,
): EditorialBatchArticle {
  return {
    index: Number(key),
    key,
    outputId,
    sourceIds: [],
    label: `Antetítulo ${key}`,
    title,
    subtitle: `Subtítulo ${key}`,
    body: `Corpo ${key}`,
  };
}

test("a escolha transitória usa outputId e não sobrevive a outro artigo na mesma posição", () => {
  const withOutput = article("01", OUTPUT_1);
  assert.equal(
    editorialBatchHistoricalChoiceIdentity(withOutput),
    `output:${OUTPUT_1}`,
  );

  const original = article("01", null, "Original");
  const replacement = article("01", null, "Substituto");
  const choice = editorialBatchHistoricalChoiceIdentity(original);
  assert.notEqual(choice, editorialBatchHistoricalChoiceIdentity(replacement));
  assert.deepEqual(
    pruneEditorialBatchHistoricalChoices({ [choice]: true }, [replacement]),
    {},
  );
});

test("só artigos marcados, concluídos e com articleId real entram na decisão", () => {
  const first = article("01", OUTPUT_1);
  const second = article("02", OUTPUT_2);
  const choices = {
    [editorialBatchHistoricalChoiceIdentity(first)]: true,
    [editorialBatchHistoricalChoiceIdentity(second)]: true,
  } as const;

  assert.deepEqual(editorialBatchSelectedHistoricalArticleIds({
    articles: [first, second],
    choices,
    completions: [
      { key: "01", outputId: OUTPUT_1, articleId: ARTICLE_1, status: "published" },
      { key: "02", outputId: OUTPUT_2, articleId: ARTICLE_2, status: "not_attempted" },
    ],
  }), [ARTICLE_1]);

  assert.deepEqual(editorialBatchSelectedHistoricalArticleIds({
    articles: [first, second],
    choices: { [editorialBatchHistoricalChoiceIdentity(first)]: true },
    completions: [
      { key: "01", outputId: OUTPUT_1, articleId: ARTICLE_1, status: "error" },
      { key: "02", outputId: OUTPUT_2, articleId: ARTICLE_2, status: "published" },
    ],
  }), []);
});

test("uma reconciliação parcial aceita os artigos já publicados e nunca os não tentados", () => {
  const first = article("01", OUTPUT_1);
  const second = article("02", OUTPUT_2);
  const choices = {
    [editorialBatchHistoricalChoiceIdentity(first)]: true,
    [editorialBatchHistoricalChoiceIdentity(second)]: true,
  } as const;

  assert.deepEqual(editorialBatchSelectedHistoricalArticleIds({
    articles: [first, second],
    choices,
    completions: [
      {
        key: "01",
        outputId: OUTPUT_1,
        articleId: ARTICLE_1,
        status: "published_missing_usage",
      },
      {
        key: "02",
        outputId: OUTPUT_2,
        articleId: ARTICLE_2,
        status: "not_attempted",
      },
    ],
  }), [ARTICLE_1]);
});

test("UPDATE e RESUME reutilizam a identidade canónica devolvida pela publicação", () => {
  const update = article("01", OUTPUT_1);
  const resume = article("02", OUTPUT_2);
  const choices = {
    [editorialBatchHistoricalChoiceIdentity(update)]: true,
    [editorialBatchHistoricalChoiceIdentity(resume)]: true,
  } as const;

  assert.deepEqual(editorialBatchSelectedHistoricalArticleIds({
    articles: [update, resume],
    choices,
    completions: [
      { key: "01", outputId: OUTPUT_1, articleId: ARTICLE_1, status: "published" },
      { key: "02", outputId: OUTPUT_2, articleId: ARTICLE_2, status: "published" },
    ],
  }), [ARTICLE_1, ARTICLE_2]);
});

test("Production Intents cruza completed por outputId e elimina articleIds duplicados", () => {
  const first = article("01", OUTPUT_1);
  const second = article("02", OUTPUT_2);
  const choices = {
    [editorialBatchHistoricalChoiceIdentity(first)]: true,
    [editorialBatchHistoricalChoiceIdentity(second)]: true,
  } as const;

  assert.deepEqual(editorialBatchSelectedHistoricalArticleIds({
    articles: [first, second],
    choices,
    completions: [
      { key: "stale-key", outputId: OUTPUT_1, articleId: ARTICLE_1, status: "published" },
      { key: "02", outputId: OUTPUT_2, articleId: ARTICLE_1, status: "published" },
    ],
  }), [ARTICLE_1]);
});

test("sem artigos marcados não existe pedido histórico", async () => {
  let requests = 0;
  const result = await applyEditorialBatchHistoricalDecisions({
    matchdayId: "30000000-0000-4000-8000-000000000001",
    articleIds: [],
    fetcher: async () => {
      requests += 1;
      return Response.json({ ok: true, updatedCount: 0 });
    },
  });

  assert.equal(requests, 0);
  assert.equal(result.applied, false);
});

test("várias escolhas fazem uma única chamada batch selected com IDs únicos", async () => {
  const requests: Array<{ url: string; form: FormData }> = [];
  const result = await applyEditorialBatchHistoricalDecisions({
    matchdayId: "30000000-0000-4000-8000-000000000001",
    articleIds: [ARTICLE_1, ARTICLE_2, ARTICLE_1],
    fetcher: async (input, init) => {
      requests.push({ url: String(input), form: init?.body as FormData });
      return Response.json({ ok: true, updatedCount: 2 });
    },
  });

  assert.equal(requests.length, 1);
  assert.equal(requests[0]?.url, "/api/admin/editorial/composicao");
  assert.equal(requests[0]?.form.get("action_type"), "set_historical_article_decision");
  assert.equal(requests[0]?.form.get("matchday_id"), "30000000-0000-4000-8000-000000000001");
  assert.equal(requests[0]?.form.get("decision"), "selected");
  assert.deepEqual(
    JSON.parse(String(requests[0]?.form.get("article_ids_json"))),
    [ARTICLE_1, ARTICLE_2],
  );
  assert.deepEqual(result.articleIds, [ARTICLE_1, ARTICLE_2]);
});

test("uma falha histórica é concreta e mantém a publicação separada da mutação", async () => {
  await assert.rejects(
    applyEditorialBatchHistoricalDecisions({
      matchdayId: "30000000-0000-4000-8000-000000000001",
      articleIds: [ARTICLE_1],
      fetcher: async () => Response.json(
        { ok: false, message: "Uma das notícias já não é elegível para esta Jornada." },
        { status: 400 },
      ),
    }),
    /já não é elegível/,
  );
});

test("a UI adiciona apenas Histórica aos cards e não ao painel por artigo", () => {
  const client = readFileSync(
    "app/admin/editorial/redacao-automatica/publicacao-lote/_batchPreflightClient.tsx",
    "utf8",
  );
  const resultSummary = client.slice(
    client.indexOf("function ResultSummary"),
    client.indexOf("function PublicationPanel"),
  );
  const publicationPanel = client.slice(
    client.indexOf("function PublicationPanel"),
    client.indexOf("export default function BatchPreflightClient"),
  );
  assert.match(resultSummary, /type="checkbox"[\s\S]*Histórica indisponível/);
  assert.match(resultSummary, /disabled=\{historicalChoiceDisabled \|\| !historicalTargets/);
  assert.doesNotMatch(publicationPanel, /Histórica|type="checkbox"/);
  assert.doesNotMatch(client, /Prioritário|Composição Histórica/);
});

test("a escolha histórica não entra na fingerprint nem reinicia o preflight", () => {
  const client = readFileSync(
    "app/admin/editorial/redacao-automatica/publicacao-lote/_batchPreflightClient.tsx",
    "utf8",
  );
  const fingerprint = client.slice(
    client.indexOf("const publicationFingerprint = useMemo"),
    client.indexOf("latestPublicationFingerprintRef.current"),
  );
  const setter = client.slice(
    client.indexOf("function setHistoricalChoice"),
    client.indexOf("async function applyHistoricalChoices"),
  );
  assert.doesNotMatch(fingerprint, /historical/i);
  assert.doesNotMatch(setter, /resetPublicationRun|invalidatePublicationPreflightRequest|setPreflightRetryVersion/);
});

test("a decisão acontece depois da finalização e antes de limpar ou regressar à Mesa", () => {
  const client = readFileSync(
    "app/admin/editorial/redacao-automatica/publicacao-lote/_batchPreflightClient.tsx",
    "utf8",
  );
  assert.match(
    client,
    /await finalizeBatchEditorialFlow\(\);[\s\S]*await applyHistoricalChoices\([\s\S]*setBatchFinalized\(true\);[\s\S]*clearTransferredBatch\(\);[\s\S]*returnToMesaAfterSuccessfulPublication\(\);/,
  );
  assert.match(
    client,
    /if \(!response\.ok \|\| !result\?\.ok \|\| !result\.finalized\)[\s\S]*throw new Error[\s\S]*await applyHistoricalChoices\(\(result\.completed/,
  );
  assert.match(client, /Os artigos foram publicados e o lote finalizado, mas a decisão Histórica falhou/);
});
