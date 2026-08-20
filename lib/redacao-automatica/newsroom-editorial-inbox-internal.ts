import type { NewsroomArticleSummary } from "@/lib/redacao-automatica/newsroom-article-repository";

export const NEWSROOM_EDITORIAL_INBOX_VIEWS = [
  "pending",
  "working",
  "archive",
  "used",
] as const;

export type NewsroomEditorialInboxView =
  (typeof NEWSROOM_EDITORIAL_INBOX_VIEWS)[number];

export const NEWSROOM_EDITORIAL_DECISIONS = [
  "working",
  "seen",
  "dismissed",
] as const;

export type NewsroomEditorialDecision =
  (typeof NEWSROOM_EDITORIAL_DECISIONS)[number];

export type NewsroomEditorialReviewState = Readonly<{
  articleId: string;
  decision: NewsroomEditorialDecision;
  reviewedSnapshotId: string;
  reviewedAt: string;
}>;

export type NewsroomEditorialUsedDossierState = Readonly<{
  key: string;
  packageId: string;
  year: string;
  month: string;
  articlePosition: number;
  sourcePosition: number;
  publishedArticleId: string | null;
  publishedSlug: string | null;
  publishedArticleTitle: string | null;
}>;

export type NewsroomEditorialUsedState = Readonly<{
  articleId: string;
  snapshotId: string;
  usedAt: string;
  dossier?: NewsroomEditorialUsedDossierState | null;
}>;

export type NewsroomEditorialInboxClassification = Readonly<{
  view: NewsroomEditorialInboxView;
  label: "new" | "updated" | "working" | "used" | "seen" | "dismissed";
  changedAfterReview: boolean;
}>;

export type NewsroomEditorialInboxItem = NewsroomArticleSummary &
  Readonly<{
    editorial: NewsroomEditorialInboxClassification;
    reviewedAt: string | null;
    usedAt: string | null;
    usedDossier: NewsroomEditorialUsedDossierState | null;
    usedUpdateAvailable: boolean;
  }>;

export function newsroomEditorialUsedUpdateAvailable(
  article: NewsroomArticleSummary,
  usedState: NewsroomEditorialUsedState | null,
): boolean {
  return Boolean(
    usedState
    && article.latestSnapshotId
    && article.latestSnapshotId !== usedState.snapshotId,
  );
}

export function newsroomEditorialInboxView(
  value: string | null | undefined,
): NewsroomEditorialInboxView {
  return NEWSROOM_EDITORIAL_INBOX_VIEWS.includes(
    value as NewsroomEditorialInboxView,
  )
    ? (value as NewsroomEditorialInboxView)
    : "pending";
}

export function classifyNewsroomEditorialInboxItem(
  article: NewsroomArticleSummary,
  state: NewsroomEditorialReviewState | null,
  usedState: NewsroomEditorialUsedState | null = null,
): NewsroomEditorialInboxClassification {
  if (
    usedState
    && article.latestSnapshotId
    && article.latestSnapshotId === usedState.snapshotId
  ) {
    return {
      view: "used",
      label: "used",
      changedAfterReview: false,
    };
  }

  if (!state) {
    return {
      view: "pending",
      label: "new",
      changedAfterReview: false,
    };
  }

  const changedAfterReview = Boolean(
    article.latestSnapshotId
    && article.latestSnapshotId !== state.reviewedSnapshotId,
  );

  if (state.decision === "working") {
    return {
      view: "working",
      label: "working",
      changedAfterReview,
    };
  }

  if (changedAfterReview) {
    return {
      view: "pending",
      label: "updated",
      changedAfterReview: true,
    };
  }

  return {
    view: "archive",
    label: state.decision,
    changedAfterReview: false,
  };
}

export function decorateNewsroomEditorialInboxItem(
  article: NewsroomArticleSummary,
  state: NewsroomEditorialReviewState | null,
  usedState: NewsroomEditorialUsedState | null = null,
): NewsroomEditorialInboxItem {
  return {
    ...article,
    editorial: classifyNewsroomEditorialInboxItem(article, state, usedState),
    reviewedAt: state?.reviewedAt ?? null,
    usedAt: usedState?.usedAt ?? null,
    usedDossier: usedState?.dossier ?? null,
    usedUpdateAvailable: newsroomEditorialUsedUpdateAvailable(
      article,
      usedState,
    ),
  };
}

export function newsroomEditorialInboxActionValue(
  action: "working" | "seen" | "dismissed" | "reopen",
  articleId: string,
  snapshotId: string,
): string {
  return `${action}:${articleId}:${snapshotId}`;
}
