import "server-only";

import {
  fetchSupabaseAdminTable,
  getSupabaseServiceConfig,
  writeSupabaseAdminReturning,
} from "@/lib/supabase";
import {
  getNewsroomArticleSummariesByIds,
  listCurrentNewsroomArticles,
  searchNewsroomArticles,
  type NewsroomArticleSummary,
} from "@/lib/redacao-automatica/newsroom-article-repository";
import {
  editorialSourcePackageUsedDossierRefs,
  editorialSourcePackageUsedSourceRefs,
} from "@/lib/redacao-automatica/editorial-source-package-internal";
import {
  decorateNewsroomEditorialInboxItem,
  type NewsroomEditorialDecision,
  type NewsroomEditorialInboxItem,
  type NewsroomEditorialInboxView,
  type NewsroomEditorialReviewState,
  type NewsroomEditorialUsedState,
} from "@/lib/redacao-automatica/newsroom-editorial-inbox-internal";

const STATE_PAGE_SIZE = 1000;
const PACKAGE_PAGE_SIZE = 1000;
const ARCHIVE_LIMIT = 100;
const USED_LIMIT = 100;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type NewsroomEditorialInboxAction =
  | "working"
  | "seen"
  | "dismissed"
  | "reopen"
  | "close_block";

export type NewsroomEditorialInboxActionItem = Readonly<{
  articleId: string;
  snapshotId: string;
}>;

type ReviewStateRow = {
  newsroom_article_id: string;
  decision: string;
  reviewed_snapshot_id: string;
  reviewed_at: string;
};

type SourcePackageRow = {
  manifest: unknown;
};

type UsedPublishedArticleRow = {
  id: string;
  title: string | null;
  slug: string | null;
  status: string | null;
};

type ApplyReviewRpcRow = {
  applied_action: string;
  review_batch_id: string | null;
  affected_count: number;
};

export type LoadNewsroomEditorialInboxOptions = Readonly<{
  view: NewsroomEditorialInboxView;
  query: string;
  periodDays: number | null;
  sourceCode: string | null;
}>;

export type NewsroomEditorialInboxResult =
  | Readonly<{
      ok: true;
      value: Readonly<{
        items: readonly NewsroomEditorialInboxItem[];
        total: number;
        pendingCount: number;
        workingCount: number;
        usedCount: number;
        archiveCount: number;
      }>;
    }>
  | Readonly<{
      ok: false;
      error: Readonly<{
        code: "read_unavailable";
        message: string;
      }>;
    }>;

export type ApplyNewsroomEditorialInboxResult =
  | Readonly<{
      ok: true;
      value: Readonly<{
        action: NewsroomEditorialInboxAction;
        batchId: string | null;
        affectedCount: number;
      }>;
    }>
  | Readonly<{
      ok: false;
      error: Readonly<{
        code:
          | "input_invalid"
          | "service_unavailable"
          | "snapshot_stale"
          | "write_failed";
        message: string;
      }>;
    }>;

function readFailure(): NewsroomEditorialInboxResult {
  return {
    ok: false,
    error: {
      code: "read_unavailable",
      message: "Não foi possível ler a organização editorial da atualidade.",
    },
  };
}

function validDecision(value: string): value is NewsroomEditorialDecision {
  return value === "working" || value === "seen" || value === "dismissed";
}

function reviewState(row: ReviewStateRow): NewsroomEditorialReviewState | null {
  if (
    !UUID_PATTERN.test(row.newsroom_article_id)
    || !UUID_PATTERN.test(row.reviewed_snapshot_id)
    || !validDecision(row.decision)
  ) {
    return null;
  }

  return {
    articleId: row.newsroom_article_id,
    decision: row.decision,
    reviewedSnapshotId: row.reviewed_snapshot_id,
    reviewedAt: row.reviewed_at,
  };
}

async function readAllReviewStates(): Promise<readonly NewsroomEditorialReviewState[]> {
  const states: NewsroomEditorialReviewState[] = [];
  let offset = 0;

  while (true) {
    const rows = await fetchSupabaseAdminTable<ReviewStateRow>(
      "newsroom_editorial_review_states"
      + "?select=newsroom_article_id,decision,reviewed_snapshot_id,reviewed_at"
      + `&order=reviewed_at.desc,newsroom_article_id.asc&offset=${offset}&limit=${STATE_PAGE_SIZE}`,
    );

    states.push(...rows.flatMap((row) => {
      const normalized = reviewState(row);
      return normalized ? [normalized] : [];
    }));

    if (rows.length < STATE_PAGE_SIZE) {
      return states;
    }
    offset += STATE_PAGE_SIZE;
  }
}

async function readAllHistoricalUsedStates(): Promise<readonly NewsroomEditorialUsedState[]> {
  const historicalStates: NewsroomEditorialUsedState[] = [];
  let offset = 0;

  while (true) {
    const rows = await fetchSupabaseAdminTable<SourcePackageRow>(
      "newsroom_editorial_source_packages"
      + "?select=manifest"
      + `&order=updated_at.desc,id.desc&offset=${offset}&limit=${PACKAGE_PAGE_SIZE}`,
    );

    for (const row of rows) {
      const dossierReferences = editorialSourcePackageUsedDossierRefs(row.manifest);
      const dossierByIdentity = new Map(dossierReferences.map((reference) => [
        `${reference.newsroomArticleId}\u0000${reference.newsroomSnapshotId}\u0000${reference.usedAt}`,
        reference,
      ]));

      for (const reference of editorialSourcePackageUsedSourceRefs(row.manifest)) {
        const dossierReference = dossierByIdentity.get(
          `${reference.newsroomArticleId}\u0000${reference.newsroomSnapshotId}\u0000${reference.usedAt}`,
        );

        historicalStates.push({
          articleId: reference.newsroomArticleId,
          snapshotId: reference.newsroomSnapshotId,
          usedAt: reference.usedAt,
          dossier: dossierReference
            ? {
                key: dossierReference.dossierKey,
                packageId: dossierReference.packageId,
                year: dossierReference.year,
                month: dossierReference.month,
                articlePosition: dossierReference.articlePosition,
                sourcePosition: dossierReference.sourcePosition,
                publishedArticleId: dossierReference.publishedArticleId,
                publishedSlug: dossierReference.publishedSlug,
                publishedArticleTitle: null,
              }
            : null,
        });
      }
    }

    if (rows.length < PACKAGE_PAGE_SIZE) {
      return historicalStates;
    }
    offset += PACKAGE_PAGE_SIZE;
  }
}

async function readUsedPublishedArticles(
  states: readonly NewsroomEditorialUsedState[],
): Promise<ReadonlyMap<string, UsedPublishedArticleRow>> {
  const articleIds = [...new Set(states.flatMap((state) => (
    state.dossier?.publishedArticleId ? [state.dossier.publishedArticleId] : []
  )))];

  const result = new Map<string, UsedPublishedArticleRow>();

  for (let offset = 0; offset < articleIds.length; offset += 50) {
    const batch = articleIds.slice(offset, offset + 50);

    const rows = await fetchSupabaseAdminTable<UsedPublishedArticleRow>(
      "editorial_articles?select=id,title,slug,status"
      + `&id=in.(${batch.map((id) => encodeURIComponent(id)).join(",")})`
      + `&limit=${batch.length}`,
    );

    for (const row of rows) {
      if (row.status === "published") {
        result.set(row.id, row);
      }
    }
  }

  return result;
}

async function readArticlesByStates(
  states: readonly NewsroomEditorialReviewState[],
): Promise<readonly NewsroomArticleSummary[]> {
  const result = await getNewsroomArticleSummariesByIds(
    states.map((state) => state.articleId),
  );

  return result.ok ? result.value : [];
}

async function readHistoricalUsedItems(
  usedStates: readonly NewsroomEditorialUsedState[],
): Promise<readonly Readonly<{
  article: NewsroomArticleSummary;
  usedState: NewsroomEditorialUsedState;
}>[]> {
  type CurrentUsedItem = Readonly<{
    article: NewsroomArticleSummary;
    usedState: NewsroomEditorialUsedState;
  }>;

  const articleIds = [...new Set(usedStates.map((state) => state.articleId))];
  const result = await getNewsroomArticleSummariesByIds(articleIds);
  const details = result.ok ? result.value : [];
  const articlesById = new Map(
    details.map((article) => [article.id, article]),
  );

  return usedStates.flatMap((usedState): CurrentUsedItem[] => {
    const article = articlesById.get(usedState.articleId);
    return article ? [{ article, usedState }] : [];
  });
}

function newestUsedState(
  current: NewsroomEditorialUsedState | undefined,
  candidate: NewsroomEditorialUsedState,
): NewsroomEditorialUsedState {
  return !current || Date.parse(candidate.usedAt) > Date.parse(current.usedAt)
    ? candidate
    : current;
}

function itemTimestamp(item: NewsroomArticleSummary): number {
  const value = item.publishedAt ?? item.detectedAt;
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function sourceMatches(item: NewsroomArticleSummary, sourceCode: string | null): boolean {
  return !sourceCode || item.sourceCode === sourceCode;
}

function periodMatches(
  item: NewsroomArticleSummary,
  periodDays: number | null,
): boolean {
  return periodDays === null
    || itemTimestamp(item) >= Date.now() - periodDays * 24 * 60 * 60 * 1000;
}

export async function loadNewsroomEditorialInbox(
  options: LoadNewsroomEditorialInboxOptions,
): Promise<NewsroomEditorialInboxResult> {
  try {
    const [states, historicalUsedStates] = await Promise.all([
      readAllReviewStates(),
      readAllHistoricalUsedStates(),
    ]);
    const statesByArticleId = new Map(states.map((state) => [state.articleId, state]));
    const historicalUsedItems = await readHistoricalUsedItems(historicalUsedStates);
    const newestHistoricalUsedByArticleId = new Map<string, NewsroomEditorialUsedState>();
    const currentSnapshotUsedByArticleId = new Map<string, NewsroomEditorialUsedState>();

    for (const { article, usedState } of historicalUsedItems) {
      newestHistoricalUsedByArticleId.set(
        article.id,
        newestUsedState(
          newestHistoricalUsedByArticleId.get(article.id),
          usedState,
        ),
      );

      if (article.latestSnapshotId === usedState.snapshotId) {
        currentSnapshotUsedByArticleId.set(
          article.id,
          newestUsedState(
            currentSnapshotUsedByArticleId.get(article.id),
            usedState,
          ),
        );
      }
    }

    const usedByArticleId = new Map([
      ...newestHistoricalUsedByArticleId,
      ...currentSnapshotUsedByArticleId,
    ]);
    const currentSnapshotUsedIds = new Set(currentSnapshotUsedByArticleId.keys());
    const usedPublishedArticles = options.view === "used"
      ? await readUsedPublishedArticles(historicalUsedItems.map(({ usedState }) => usedState))
      : new Map<string, UsedPublishedArticleRow>();
    const currentResult = options.query
      ? await searchNewsroomArticles({
          query: options.query,
          periodDays: options.periodDays,
          sourceCode: options.sourceCode,
        })
      : await listCurrentNewsroomArticles({
          periodDays: options.periodDays,
          sourceCode: options.sourceCode,
        });

    if (!currentResult.ok) {
      return readFailure();
    }

    const currentItems = currentResult.value.items.map((article) => (
      decorateNewsroomEditorialInboxItem(
        article,
        statesByArticleId.get(article.id) ?? null,
        usedByArticleId.get(article.id) ?? null,
      )
    ));
    const pendingItems = currentItems.filter((item) => item.editorial.view === "pending");
    const workingStates = states.filter(
      (state) => state.decision === "working" && !currentSnapshotUsedIds.has(state.articleId),
    );
    const archivedStates = states.filter(
      (state) => state.decision !== "working" && !currentSnapshotUsedIds.has(state.articleId),
    );

    let items: readonly NewsroomEditorialInboxItem[];

    if (options.view === "pending") {
      items = pendingItems;
    } else if (options.view === "used") {
      items = historicalUsedItems
        .filter(({ article }) => (
          sourceMatches(article, options.sourceCode)
          && periodMatches(article, options.periodDays)
          && (!options.query || currentItems.some((item) => item.id === article.id))
        ))
        .map(({ article, usedState }) => {
          const publishedArticle = usedState.dossier?.publishedArticleId
            ? usedPublishedArticles.get(usedState.dossier.publishedArticleId) ?? null
            : null;

          const enrichedUsedState = usedState.dossier
            ? {
                ...usedState,
                dossier: {
                  ...usedState.dossier,
                  publishedArticleTitle: publishedArticle?.title?.trim() || null,
                  publishedSlug: publishedArticle?.slug?.trim()
                    || usedState.dossier.publishedSlug,
                },
              }
            : usedState;

          return decorateNewsroomEditorialInboxItem(
            article,
            statesByArticleId.get(article.id) ?? null,
            enrichedUsedState,
          );
        })
        .sort((left, right) => (
          Date.parse(right.usedAt ?? "") - Date.parse(left.usedAt ?? "")
          || itemTimestamp(right) - itemTimestamp(left)
          || right.id.localeCompare(left.id)
        ))
        .slice(0, USED_LIMIT);
    } else if (options.query) {
      items = currentItems.filter((item) => item.editorial.view === options.view);
    } else {
      const selectedStates = options.view === "working"
        ? workingStates
        : archivedStates.slice(0, ARCHIVE_LIMIT);
      const selectedArticles = await readArticlesByStates(selectedStates);
      items = selectedArticles
        .filter((article) => (
          sourceMatches(article, options.sourceCode)
          && (options.view === "working" || periodMatches(article, options.periodDays))
        ))
        .map((article) => decorateNewsroomEditorialInboxItem(
          article,
          statesByArticleId.get(article.id) ?? null,
          usedByArticleId.get(article.id) ?? null,
        ))
        .filter((item) => item.editorial.view === options.view)
        .sort((left, right) => (
          Date.parse(right.reviewedAt ?? "") - Date.parse(left.reviewedAt ?? "")
          || itemTimestamp(right) - itemTimestamp(left)
          || right.id.localeCompare(left.id)
        ));
    }

    return {
      ok: true,
      value: {
        items,
        total: items.length,
        pendingCount: pendingItems.length,
        workingCount: workingStates.length,
        usedCount: historicalUsedItems.length,
        archiveCount: archivedStates.length,
      },
    };
  } catch {
    return readFailure();
  }
}

function normalizedActionItems(
  items: readonly NewsroomEditorialInboxActionItem[],
): readonly NewsroomEditorialInboxActionItem[] | null {
  const normalized = items.flatMap((item) => {
    const articleId = item.articleId.trim().toLowerCase();
    const snapshotId = item.snapshotId.trim().toLowerCase();
    return UUID_PATTERN.test(articleId) && UUID_PATTERN.test(snapshotId)
      ? [{ articleId, snapshotId }]
      : [];
  });
  const identities = new Set(normalized.map((item) => item.articleId));

  return normalized.length === items.length
    && normalized.length > 0
    && normalized.length <= 100
    && identities.size === normalized.length
    ? normalized
    : null;
}

export async function applyNewsroomEditorialInboxAction(
  action: NewsroomEditorialInboxAction,
  itemsValue: readonly NewsroomEditorialInboxActionItem[],
): Promise<ApplyNewsroomEditorialInboxResult> {
  const items = normalizedActionItems(itemsValue);
  if (!items || (action !== "close_block" && items.length !== 1)) {
    return {
      ok: false,
      error: { code: "input_invalid", message: "A decisão editorial não é válida." },
    };
  }

  if (!getSupabaseServiceConfig()) {
    return {
      ok: false,
      error: { code: "service_unavailable", message: "O serviço editorial não está configurado." },
    };
  }

  try {
    const rows = await writeSupabaseAdminReturning<ApplyReviewRpcRow>(
      "rpc/newsroom_apply_editorial_review",
      {
        method: "POST",
        body: JSON.stringify({
          p_action: action,
          p_items: items.map((item) => ({
            articleId: item.articleId,
            snapshotId: item.snapshotId,
          })),
        }),
      },
    );
    const row = rows[0];

    if (!row || row.applied_action !== action || row.affected_count < 1) {
      return {
        ok: false,
        error: { code: "write_failed", message: "A decisão editorial não foi guardada." },
      };
    }

    return {
      ok: true,
      value: {
        action,
        batchId: row.review_batch_id,
        affectedCount: row.affected_count,
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("snapshot_stale")) {
      return {
        ok: false,
        error: {
          code: "snapshot_stale",
          message: "A notícia mudou entretanto. Atualiza a página antes de decidir.",
        },
      };
    }

    return {
      ok: false,
      error: { code: "write_failed", message: "A decisão editorial não foi guardada." },
    };
  }
}
