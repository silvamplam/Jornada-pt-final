export type EditorialBatchUpdateTarget = Readonly<{
  publishedArticleId: string;
  publishedSlug: string;
}>;

export type EditorialBatchUpdateTargetArticle = Readonly<{
  id: string;
  slug: string | null;
  status: string | null;
  matchdayId: string | null;
  publishedAt: string | null;
}>;

export type EditorialBatchUpdateTargetIssue =
  | "not_found"
  | "not_published"
  | "matchday_mismatch"
  | "slug_mismatch"
  | "published_at_invalid";

export function editorialBatchUpdateTargetIssue(
  article: EditorialBatchUpdateTargetArticle | null,
  target: EditorialBatchUpdateTarget,
  matchdayId: string,
): EditorialBatchUpdateTargetIssue | null {
  if (!article || article.id !== target.publishedArticleId) {
    return "not_found";
  }
  if (article.status !== "published") {
    return "not_published";
  }
  if (article.matchdayId !== matchdayId) {
    return "matchday_mismatch";
  }
  if (article.slug !== target.publishedSlug) {
    return "slug_mismatch";
  }
  if (
    !article.publishedAt
    || Number.isNaN(Date.parse(article.publishedAt))
  ) {
    return "published_at_invalid";
  }

  return null;
}

export type EditorialBatchTargetPublicationMode =
  | "resume"
  | "update_required"
  | "update"
  | "confirmation_mismatch";

export function editorialBatchTargetPublicationMode(input: Readonly<{
  targetArticleId: string;
  existingMatches: boolean;
  confirmedArticleId: string | null;
}>): EditorialBatchTargetPublicationMode {
  if (
    input.confirmedArticleId
    && input.confirmedArticleId !== input.targetArticleId
  ) {
    return "confirmation_mismatch";
  }
  if (input.existingMatches) {
    return "resume";
  }

  return input.confirmedArticleId === input.targetArticleId
    ? "update"
    : "update_required";
}
