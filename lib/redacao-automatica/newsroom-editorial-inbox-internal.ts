import type { NewsroomArticleSummary } from "@/lib/redacao-automatica/newsroom-article-repository";

export const NEWSROOM_EDITORIAL_INBOX_VIEWS = [
  "pending",
  "working",
  "archive",
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

export type NewsroomEditorialInboxClassification = Readonly<{
  view: NewsroomEditorialInboxView;
  label: "new" | "updated" | "working" | "seen" | "dismissed";
  changedAfterReview: boolean;
}>;

export type NewsroomEditorialInboxItem = NewsroomArticleSummary &
  Readonly<{
    editorial: NewsroomEditorialInboxClassification;
    reviewedAt: string | null;
  }>;

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
): NewsroomEditorialInboxClassification {
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
): NewsroomEditorialInboxItem {
  return {
    ...article,
    editorial: classifyNewsroomEditorialInboxItem(article, state),
    reviewedAt: state?.reviewedAt ?? null,
  };
}

export function newsroomEditorialInboxActionValue(
  action: "working" | "seen" | "dismissed" | "reopen",
  articleId: string,
  snapshotId: string,
): string {
  return `${action}:${articleId}:${snapshotId}`;
}
