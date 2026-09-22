import type { EditorialBatchArticle } from "./editorial-batch-parser";

export const EDITORIAL_HISTORICAL_COMPOSITION_ROUTE =
  "/api/admin/editorial/composicao";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type EditorialBatchHistoricalChoices = Readonly<Record<string, true>>;

export type EditorialBatchHistoricalCompletion = Readonly<{
  key: string;
  outputId?: string | null;
  articleId?: string;
  status:
    | "published"
    | "published_missing_latest"
    | "published_missing_usage"
    | "error"
    | "not_attempted";
}>;

type HistoricalDecisionResponse = Readonly<{
  ok?: boolean;
  message?: string;
  updatedCount?: number;
}>;

export function editorialBatchHistoricalChoiceIdentity(
  article: Pick<
    EditorialBatchArticle,
    "key" | "outputId" | "label" | "title" | "subtitle" | "body"
  >,
) {
  if (article.outputId) {
    return `output:${article.outputId}`;
  }

  return `article:${JSON.stringify([
    article.key,
    article.label,
    article.title,
    article.subtitle,
    article.body,
  ])}`;
}

export function pruneEditorialBatchHistoricalChoices(
  choices: EditorialBatchHistoricalChoices,
  articles: readonly EditorialBatchArticle[],
) {
  const currentIdentities = new Set(
    articles.map(editorialBatchHistoricalChoiceIdentity),
  );
  const next = Object.fromEntries(
    Object.keys(choices)
      .filter((identity) => currentIdentities.has(identity))
      .map((identity) => [identity, true] as const),
  ) as Record<string, true>;

  return Object.keys(next).length === Object.keys(choices).length
    ? choices
    : next;
}

export function editorialBatchSelectedHistoricalArticleIds({
  articles,
  choices,
  completions,
}: Readonly<{
  articles: readonly EditorialBatchArticle[];
  choices: EditorialBatchHistoricalChoices;
  completions: readonly EditorialBatchHistoricalCompletion[];
}>) {
  const completionByOutputId = new Map(
    completions.flatMap((completion) => (
      completion.outputId
        ? [[completion.outputId, completion] as const]
        : []
    )),
  );
  const completionByKey = new Map(
    completions.map((completion) => [completion.key, completion] as const),
  );
  const eligibleStatuses = new Set<EditorialBatchHistoricalCompletion["status"]>([
    "published",
    "published_missing_latest",
    "published_missing_usage",
  ]);
  const selectedIds = new Set<string>();

  for (const article of articles) {
    if (!choices[editorialBatchHistoricalChoiceIdentity(article)]) continue;
    const completion = article.outputId
      ? completionByOutputId.get(article.outputId)
      : completionByKey.get(article.key);
    if (
      !completion
      || !eligibleStatuses.has(completion.status)
      || !completion.articleId
      || !UUID_PATTERN.test(completion.articleId)
    ) continue;
    selectedIds.add(completion.articleId.toLowerCase());
  }

  return [...selectedIds];
}

export async function applyEditorialBatchHistoricalDecisions({
  matchdayId,
  articleIds,
  fetcher = fetch,
}: Readonly<{
  matchdayId: string;
  articleIds: readonly string[];
  fetcher?: typeof fetch;
}>) {
  const uniqueArticleIds = [...new Set(
    articleIds
      .filter((articleId) => UUID_PATTERN.test(articleId))
      .map((articleId) => articleId.toLowerCase()),
  )];
  if (uniqueArticleIds.length === 0) {
    return { applied: false, articleIds: uniqueArticleIds } as const;
  }

  const body = new FormData();
  body.set("action_type", "set_historical_article_decision");
  body.set("matchday_id", matchdayId);
  body.set("article_ids_json", JSON.stringify(uniqueArticleIds));
  body.set("decision", "selected");

  const response = await fetcher(EDITORIAL_HISTORICAL_COMPOSITION_ROUTE, {
    method: "POST",
    body,
  });
  const result = await response.json().catch(() => null) as
    | HistoricalDecisionResponse
    | null;
  if (
    !response.ok
    || !result?.ok
    || result.updatedCount !== uniqueArticleIds.length
  ) {
    throw new Error(
      result?.message?.trim()
      || "Não foi possível gravar a decisão Histórica.",
    );
  }

  return { applied: true, articleIds: uniqueArticleIds } as const;
}
