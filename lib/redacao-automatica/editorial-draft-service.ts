import "server-only";

import { randomUUID } from "node:crypto";

import {
  fetchSupabaseAdminTable,
  getSupabaseServiceConfig,
  writeSupabaseAdminReturning,
} from "@/lib/supabase";
import {
  createNewsroomEditorialDraftLookup,
  createNewsroomEditorialDraftService,
  type EditorialDraftInsert,
  type LinkedEditorialArticle,
  type NewsroomDraftSource,
} from "@/lib/redacao-automatica/editorial-draft-service-internal";
import { editorialSourceAnteTitle } from "@/lib/redacao-automatica/editorial-source-package-internal";
import { getNewsroomArticleById } from "@/lib/redacao-automatica/newsroom-article-repository";

export type {
  LinkedEditorialArticle,
  NewsroomEditorialDraftError,
  NewsroomEditorialDraftErrorCode,
  NewsroomEditorialDraftLookupResult,
  NewsroomEditorialDraftResult,
  NewsroomEditorialDraftSuccess,
} from "@/lib/redacao-automatica/editorial-draft-service-internal";

type LinkedEditorialArticleRow = {
  id: string;
  status: string;
};

function linkedArticle(row: LinkedEditorialArticleRow | undefined): LinkedEditorialArticle | null {
  if (!row || (row.status !== "draft" && row.status !== "published")) {
    return null;
  }

  return { id: row.id, status: row.status };
}

const transport = {
  isConfigured() {
    return Boolean(getSupabaseServiceConfig());
  },

  async readSource(newsroomArticleId: string): Promise<NewsroomDraftSource | null> {
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
      label: article.snapshot ? editorialSourceAnteTitle(article.snapshot.sourceMetadata) : null,
      title: article.title,
      subtitle: article.subtitle,
      summary: article.summary,
      author: article.author,
      imageUrl: article.imageUrl,
      processingStatus: article.processingStatus,
      body: article.snapshot?.body ?? null,
    };
  },

  async findLinkedArticle(newsroomArticleId: string): Promise<LinkedEditorialArticle | null> {
    const rows = await fetchSupabaseAdminTable<LinkedEditorialArticleRow>(
      "editorial_articles?select=id,status"
      + `&newsroom_article_id=eq.${encodeURIComponent(newsroomArticleId)}`
      + "&limit=1",
    );

    return linkedArticle(rows[0]);
  },

  async insertDraft(payload: EditorialDraftInsert): Promise<LinkedEditorialArticle> {
    const rows = await writeSupabaseAdminReturning<LinkedEditorialArticleRow>(
      "editorial_articles?select=id,status",
      {
        method: "POST",
        body: JSON.stringify(payload),
      },
    );
    const created = linkedArticle(rows[0]);

    if (!created) {
      throw new Error("invalid-draft-response");
    }

    return created;
  },

  randomUuid() {
    return randomUUID();
  },

  now() {
    return new Date().toISOString();
  },
};

const createDraft = createNewsroomEditorialDraftService(transport);
const findDraft = createNewsroomEditorialDraftLookup(transport);

export function createNewsroomEditorialDraft(newsroomArticleId: string) {
  return createDraft(newsroomArticleId);
}

export function findNewsroomEditorialDraft(newsroomArticleId: string) {
  return findDraft(newsroomArticleId);
}
