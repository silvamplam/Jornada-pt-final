import { NextResponse } from "next/server";

import { searchExternalNewsroomTopic } from "@/lib/redacao-automatica/newsroom-external-topic-search";
import { searchNewsroomArticles } from "@/lib/redacao-automatica/newsroom-article-repository";
import {
  compactNewsroomExternalTopicSearchSourceReports,
} from "@/lib/redacao-automatica/newsroom-external-topic-search-internal";
import {
  classifyNewsroomTopicSearchResultOrigins,
  newsroomTopicPeriod,
  newsroomTopicPeriodDays,
} from "@/lib/redacao-automatica/newsroom-topic-search";

export const maxDuration = 60;

function cleanText(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value.trim() : "";
}

function redirectTo(path: string, params: Record<string, string>) {
  const url = new URL(path, "https://jornada.local");
  for (const [key, value] of Object.entries(params)) {
    if (value) {
      url.searchParams.set(key, value);
    }
  }

  const location = `${url.pathname}${url.search}`;
  return new NextResponse(null, {
    status: 303,
    headers: { Location: location },
  });
}

export async function POST(request: Request) {
  const formData = await request.formData();
  const topic = cleanText(formData.get("topic"));
  const period = newsroomTopicPeriod(cleanText(formData.get("period")));
  const periodDays = newsroomTopicPeriodDays(period);
  const sourceCode = cleanText(formData.get("source"));
  const baseParams = {
    topic,
    period,
    ...(sourceCode ? { source: sourceCode } : {}),
  };
  const searchOptions = {
    query: topic,
    periodDays,
    sourceCode: sourceCode || null,
  };
  const initialArchive = await searchNewsroomArticles(searchOptions);

  if (!initialArchive.ok) {
    return redirectTo("/admin/editorial/redacao-automatica", {
      ...baseParams,
      external_search_error: "archive_unavailable",
    });
  }

  const externalSearch = await searchExternalNewsroomTopic({
    topic,
    periodDays,
    sourceCode: sourceCode || null,
  });
  const finalArchive = await searchNewsroomArticles(searchOptions);

  if (!finalArchive.ok) {
    return redirectTo("/admin/editorial/redacao-automatica", {
      ...baseParams,
      external_search_error: "archive_unavailable",
    });
  }

  const resultOrigins = classifyNewsroomTopicSearchResultOrigins({
    initialArticleIds: initialArchive.value.items.map((article) => article.id),
    finalArticleIds: finalArchive.value.items.map((article) => article.id),
    persistedArticles: externalSearch.ok ? externalSearch.value.articles : [],
  });

  return redirectTo("/admin/editorial/redacao-automatica", {
    ...baseParams,
    ...(externalSearch.ok
      ? { external_search_state: externalSearch.value.status }
      : { external_search_error: externalSearch.error.code }),
    external_search_candidate_links: String(
      externalSearch.ok ? externalSearch.value.candidateLinkCount : 0,
    ),
    external_search_raw_discovered: String(
      externalSearch.ok ? externalSearch.value.rawDiscoveredLinkCount : 0,
    ),
    external_search_rejected_links: String(
      externalSearch.ok ? externalSearch.value.rejectedNormalizationCount : 0,
    ),
    external_search_listing_duplicates: String(
      externalSearch.ok ? externalSearch.value.listingDuplicateCount : 0,
    ),
    external_search_unique_candidates: String(
      externalSearch.ok ? externalSearch.value.uniqueCandidateCount : 0,
    ),
    external_search_positive_candidates: String(
      externalSearch.ok ? externalSearch.value.positiveCandidateCount : 0,
    ),
    external_search_zero_candidates: String(
      externalSearch.ok ? externalSearch.value.zeroScoreCandidateCount : 0,
    ),
    external_search_positive_truncated: String(
      externalSearch.ok ? externalSearch.value.positiveNotAttemptedByLimitCount : 0,
    ),
    external_search_recovery_attempted: String(
      externalSearch.ok ? externalSearch.value.recoveryAttemptedCount : 0,
    ),
    external_search_attempted_articles: String(
      externalSearch.ok ? externalSearch.value.attemptedArticleCount : 0,
    ),
    external_search_read_articles: String(
      externalSearch.ok ? externalSearch.value.readArticleCount : 0,
    ),
    external_search_failed_sources: String(
      externalSearch.ok ? externalSearch.value.failedSourceCount : 0,
    ),
    external_search_failed_articles: String(
      externalSearch.ok ? externalSearch.value.failedArticleCount : 0,
    ),
    external_search_excluded_missing_date: String(
      externalSearch.ok
        ? externalSearch.value.attemptedExclusionCounts.published_at_missing ?? 0
        : 0,
    ),
    external_search_excluded_invalid_date: String(
      externalSearch.ok
        ? externalSearch.value.attemptedExclusionCounts.published_at_invalid ?? 0
        : 0,
    ),
    external_search_excluded_future: String(
      externalSearch.ok
        ? externalSearch.value.attemptedExclusionCounts.published_at_future ?? 0
        : 0,
    ),
    external_search_excluded_period: String(
      externalSearch.ok
        ? externalSearch.value.attemptedExclusionCounts.outside_period ?? 0
        : 0,
    ),
    external_search_excluded_snapshot: String(
      externalSearch.ok
        ? (externalSearch.value.attemptedExclusionCounts.snapshot_missing ?? 0)
          + (externalSearch.value.attemptedExclusionCounts.snapshot_unusable ?? 0)
        : 0,
    ),
    external_search_excluded_state: String(
      externalSearch.ok
        ? externalSearch.value.attemptedExclusionCounts.state_ineligible ?? 0
        : 0,
    ),
    external_search_excluded_topic: String(
      externalSearch.ok
        ? (externalSearch.value.attemptedExclusionCounts.entity_missing ?? 0)
          + (externalSearch.value.attemptedExclusionCounts.body_context_missing ?? 0)
          + (externalSearch.value.attemptedExclusionCounts.relevance_insufficient ?? 0)
        : 0,
    ),
    external_search_excluded_duplicate: String(
      externalSearch.ok
        ? externalSearch.value.attemptedExclusionCounts.canonical_duplicate ?? 0
        : 0,
    ),
    external_search_stop_reason: externalSearch.ok ? externalSearch.value.stopReason : "",
    external_search_source_reports: externalSearch.ok
      ? JSON.stringify(compactNewsroomExternalTopicSearchSourceReports(
          externalSearch.value.sources,
        ))
      : "",
    external_search_related: String(resultOrigins.relatedCount),
    external_search_available: String(resultOrigins.availableCount),
    external_search_collected: String(resultOrigins.collectedCount),
    external_search_collected_ids: resultOrigins.collectedIds.join(","),
  });
}
