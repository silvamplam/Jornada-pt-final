import "server-only";

import {
  getSupabaseServiceConfig,
  writeSupabaseAdminReturning,
} from "@/lib/supabase";
import {
  createNewsroomReviewService,
  type NewsroomReviewSource,
  type NewsroomReviewUpdate,
} from "@/lib/redacao-automatica/newsroom-review-service-internal";
import { getNewsroomArticleById } from "@/lib/redacao-automatica/newsroom-article-repository";

export type {
  NewsroomReviewErrorCode,
  NewsroomReviewResult,
  NewsroomReviewSuccess,
} from "@/lib/redacao-automatica/newsroom-review-service-internal";

type ReviewUpdateRow = {
  id: string;
  processing_status: string;
};

function reviewUpdate(row: ReviewUpdateRow | undefined): NewsroomReviewUpdate | null {
  if (!row || row.processing_status !== "ready_for_review") {
    return null;
  }

  return { id: row.id, processingStatus: "ready_for_review" };
}

const transport = {
  isConfigured() {
    return Boolean(getSupabaseServiceConfig());
  },

  async readSource(newsroomArticleId: string): Promise<NewsroomReviewSource | null> {
    const result = await getNewsroomArticleById(newsroomArticleId);
    if (!result.ok) {
      throw new Error(result.error.code);
    }

    const article = result.value;
    if (!article) {
      return null;
    }

    return {
      id: article.id,
      processingStatus: article.processingStatus,
      body: article.snapshot?.body ?? null,
    };
  },

  async updateReadyForReview(newsroomArticleId: string): Promise<NewsroomReviewUpdate | null> {
    const rows = await writeSupabaseAdminReturning<ReviewUpdateRow>(
      "newsroom_articles?select=id,processing_status"
      + `&id=eq.${encodeURIComponent(newsroomArticleId)}`
      + "&processing_status=in.(detected,normalized)",
      {
        method: "PATCH",
        body: JSON.stringify({ processing_status: "ready_for_review" }),
      },
    );

    return reviewUpdate(rows[0]);
  },
};

const markReadyForReview = createNewsroomReviewService(transport);

export function markNewsroomArticleReadyForReview(newsroomArticleId: string) {
  return markReadyForReview(newsroomArticleId);
}
