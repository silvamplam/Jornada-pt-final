import type { EditorialBatchArticle } from "./editorial-batch-parser";

export const EDITORIAL_HISTORICAL_COMPOSITION_ROUTE =
  "/api/admin/editorial/composicao";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type EditorialBatchHistoricalChoices = Readonly<Record<string, boolean>>;

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
      .map((identity) => [identity, choices[identity]] as const),
  ) as Record<string, boolean>;

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
  decision = "selected",
}: Readonly<{
  matchdayId: string;
  articleIds: readonly string[];
  fetcher?: typeof fetch;
  decision?: "selected" | "undecided";
}>) {
  const uniqueArticleIds = [...new Set(
    articleIds
      .filter((articleId) => UUID_PATTERN.test(articleId))
      .map((articleId) => articleId.toLowerCase()),
  )];
  if (uniqueArticleIds.length === 0) {
    return { applied: false, articleIds: uniqueArticleIds } as const;
  }

  if (!UUID_PATTERN.test(matchdayId)) throw new Error("A decisão Histórica não tem Jornada válida.");
  const body = new FormData();
  body.set("action_type", "set_historical_article_decision");
  body.set("matchday_id", matchdayId);
  body.set("article_ids_json", JSON.stringify(uniqueArticleIds));
  body.set("decision", decision);

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

export type HistoricalTarget = Readonly<{ matchdayId: string | null; articleId: string | null }>;
export type HistoricalDecisionGroup = Readonly<{ matchdayId: string; articleIds: readonly string[]; decision: "selected" | "undecided" }>;
export const HISTORICAL_PENDING_STORAGE_KEY = "jornada.editorial.historical-pending.v1";

export function historicalTargetsForBatch(articles: readonly EditorialBatchArticle[], slots: readonly Readonly<{
  outputId: string; kind: "existing" | "new"; targetEditorialArticleId: string | null; targetMatchdayId?: string | null;
}>[], selectedMatchdayId: string): Readonly<Record<string, HistoricalTarget>> {
  return Object.fromEntries(articles.map((article) => {
    const slot = slots.find((candidate) => candidate.outputId === article.outputId);
    const matchdayId = slot?.kind === "existing" ? slot.targetMatchdayId : selectedMatchdayId;
    return [editorialBatchHistoricalChoiceIdentity(article), {
      matchdayId: matchdayId && UUID_PATTERN.test(matchdayId) ? matchdayId : null,
      articleId: slot?.kind === "existing" ? slot.targetEditorialArticleId : null,
    }];
  }));
}

export function historicalDecisionGroups(articles: readonly EditorialBatchArticle[], choices: EditorialBatchHistoricalChoices,
  completions: readonly EditorialBatchHistoricalCompletion[], targets: Readonly<Record<string, HistoricalTarget>>): HistoricalDecisionGroup[] {
  const groups = new Map<string, { matchdayId: string; articleIds: string[]; decision: "selected" | "undecided" }>();
  for (const article of articles) {
    const identity = editorialBatchHistoricalChoiceIdentity(article);
    if (!Object.hasOwn(choices, identity)) continue;
    const ids = editorialBatchSelectedHistoricalArticleIds({ articles: [article], choices: { [identity]: true }, completions });
    if (ids.length === 0) continue;
    const target = targets[identity];
    if (!target?.matchdayId) throw new Error("O artigo existente não tem Jornada válida para Histórica.");
    if (target.articleId && ids.some((id) => id !== target.articleId)) throw new Error("O artigo publicado difere do target congelado.");
    const decision = choices[identity] ? "selected" : "undecided";
    const key = target.matchdayId + ":" + decision;
    const group = groups.get(key) ?? { matchdayId: target.matchdayId, articleIds: [], decision };
    group.articleIds = [...new Set([...group.articleIds, ...ids])];
    groups.set(key, group);
  }
  return [...groups.values()];
}

/** Progress is saved after each Jornada. A failed retry never enters article publication. */
export async function applyHistoricalDecisionGroups(groups: readonly HistoricalDecisionGroup[],
  saveRemaining: (groups: readonly HistoricalDecisionGroup[]) => void, fetcher: typeof fetch = fetch) {
  saveRemaining(groups);
  for (let index = 0; index < groups.length; index++) {
    await applyEditorialBatchHistoricalDecisions({ ...groups[index], fetcher });
    saveRemaining(groups.slice(index + 1));
  }
}

export function readPendingHistoricalDecisions(value: string | null): Readonly<{
  fingerprint: string; groups: readonly HistoricalDecisionGroup[]; complete: boolean;
}> | null {
  try {
    const parsed = JSON.parse(value ?? "null");
    if (!parsed || typeof parsed.fingerprint !== "string" || typeof parsed.complete !== "boolean"
      || !Array.isArray(parsed.groups) || parsed.groups.length > 60 || !parsed.groups.every((group: HistoricalDecisionGroup) =>
        group && UUID_PATTERN.test(group.matchdayId) && ["selected", "undecided"].includes(group.decision)
        && Array.isArray(group.articleIds) && group.articleIds.length > 0 && group.articleIds.length <= 30
        && group.articleIds.every((id) => typeof id === "string" && UUID_PATTERN.test(id)))) return null;
    return parsed;
  } catch { return null; }
}
