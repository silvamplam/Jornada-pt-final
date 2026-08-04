import "server-only";

import {
  fetchSupabaseAdminTable,
  getSupabaseServiceConfig,
  writeSupabaseAdminReturning,
} from "@/lib/supabase";
import {
  getNewsroomArticleById,
  listCurrentNewsroomArticles,
  searchNewsroomArticles,
  type NewsroomArticleSummary,
} from "@/lib/redacao-automatica/newsroom-article-repository";
import {
  decorateNewsroomEditorialInboxItem,
  type NewsroomEditorialDecision,
  type NewsroomEditorialInboxItem,
  type NewsroomEditorialInboxView,
  type NewsroomEditorialReviewState,
} from "@/lib/redacao-automatica/newsroom-editorial-inbox-internal";

const STATE_PAGE_SIZE = 1000;
const ARCHIVE_LIMIT = 100;

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

async function readArticlesByStates(
  states: readonly NewsroomEditorialReviewState[],
): Promise<readonly NewsroomArticleSummary[]> {
  const details = await Promise.all(states.map(async (state) => {
    const result = await getNewsroomArticleById(state.articleId);
    return result.ok ? result.value : null;
  }));

  return details.flatMap((detail) => detail ? [detail] : []);
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
    const states = await readAllReviewStates();
    const statesByArticleId = new Map(states.map((state) => [state.articleId, state]));
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
      )
    ));
    const pendingItems = currentItems.filter((item) => item.editorial.view === "pending");
    const workingStates = states.filter((state) => state.decision === "working");
    const archivedStates = states.filter((state) => state.decision !== "working");

    let items: readonly NewsroomEditorialInboxItem[];

    if (options.view === "pending") {
      items = pendingItems;
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
        ))
        .filter((item) => item.editorial.view === options.view)
        .sort((left, right) => (
          Date.parse(right.reviewedAt ?? "") - Date.parse(left.reviewedAt ?? "")
          || itemTimestamp(right) - itemTimestamp(left)
          || right.id.localeCompare(left.id)
        ));
    }

    const archiveCount = states.filter((state) => state.decision !== "working").length;

    return {
      ok: true,
      value: {
        items,
        total: items.length,
        pendingCount: pendingItems.length,
        workingCount: workingStates.length,
        archiveCount,
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
