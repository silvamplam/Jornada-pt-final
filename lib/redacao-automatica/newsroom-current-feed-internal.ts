import type { ArticleLinkCandidate, SourceCollectionSummary } from "@/lib/redacao-automatica/types";

export type NewsroomCurrentFeedCandidate = Readonly<{
  sourceCode: string;
  articleUrl: string;
}>;

export type NewsroomCurrentFeedPersistenceAction =
  | "created"
  | "updated"
  | "reused";

export type NewsroomCurrentFeedPersistenceSummary = Readonly<{
  createdCount: number;
  updatedCount: number;
  reusedCount: number;
  availableCount: number;
}>;

function identity(sourceCode: string, articleUrl: string): string {
  return `${sourceCode.trim().toLowerCase()}\u0000${articleUrl.trim()}`;
}

function currentListingCandidates(
  collections: readonly SourceCollectionSummary[],
): readonly NewsroomCurrentFeedCandidate[] {
  const seen = new Set<string>();
  const selected: NewsroomCurrentFeedCandidate[] = [];

  for (const collection of collections) {
    for (const candidate of collection.candidates) {
      const candidateIdentity = identity(candidate.sourceCode, candidate.normalizedUrl);
      if (seen.has(candidateIdentity)) {
        continue;
      }

      seen.add(candidateIdentity);
      selected.push({
        sourceCode: candidate.sourceCode,
        articleUrl: candidate.normalizedUrl,
      });
    }
  }

  return selected;
}

export function selectNewsroomCurrentFeedCandidates(
  collections: readonly SourceCollectionSummary[],
): Readonly<{
  candidates: readonly NewsroomCurrentFeedCandidate[];
  truncated: false;
}> {
  return {
    candidates: currentListingCandidates(collections),
    truncated: false,
  };
}

export function summarizeNewsroomCurrentFeedPersistence(
  actions: readonly (NewsroomCurrentFeedPersistenceAction | null)[],
): NewsroomCurrentFeedPersistenceSummary {
  const createdCount = actions.filter((action) => action === "created").length;
  const updatedCount = actions.filter((action) => action === "updated").length;
  const reusedCount = actions.filter((action) => action === "reused").length;

  return {
    createdCount,
    updatedCount,
    reusedCount,
    availableCount: createdCount + updatedCount + reusedCount,
  };
}

export function summarizeNewsroomCurrentFeedRun(input: Readonly<{
  requestedSourceCount: number;
  successfulSourceCount: number;
  actions: readonly (NewsroomCurrentFeedPersistenceAction | null)[];
}>): Readonly<{
  status: "updated" | "up_to_date" | "partial";
  newCandidateCount: number;
  attemptedCount: number;
  availableCount: number;
  createdCount: number;
  updatedCount: number;
  existingCount: number;
  failedCount: number;
}> {
  const persistence = summarizeNewsroomCurrentFeedPersistence(input.actions);
  const failedCount = input.actions.length - persistence.availableCount;
  const partial = input.successfulSourceCount < input.requestedSourceCount
    || failedCount > 0;

  return {
    status: partial
      ? "partial"
      : persistence.createdCount + persistence.updatedCount > 0
        ? "updated"
        : "up_to_date",
    newCandidateCount: persistence.createdCount,
    attemptedCount: input.actions.length,
    availableCount: persistence.availableCount,
    createdCount: persistence.createdCount,
    updatedCount: persistence.updatedCount,
    existingCount: persistence.updatedCount + persistence.reusedCount,
    failedCount,
  };
}
