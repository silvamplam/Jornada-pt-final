import type { ArticleBodyBlock, ArticleProcessingStatus } from "@/lib/redacao-automatica/types";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type NewsroomReviewSource = Readonly<{
  id: string;
  processingStatus: ArticleProcessingStatus;
  body: readonly ArticleBodyBlock[] | null;
}>;

export type NewsroomReviewUpdate = Readonly<{
  id: string;
  processingStatus: "ready_for_review";
}>;

export interface NewsroomReviewTransport {
  isConfigured(): boolean;
  readSource(newsroomArticleId: string): Promise<NewsroomReviewSource | null>;
  updateReadyForReview(newsroomArticleId: string): Promise<NewsroomReviewUpdate | null>;
}

export type NewsroomReviewSuccess = Readonly<{
  article: NewsroomReviewUpdate;
  action: "updated" | "reused";
}>;

export type NewsroomReviewErrorCode =
  | "input_invalid"
  | "service_unavailable"
  | "newsroom_article_not_found"
  | "newsroom_snapshot_missing"
  | "newsroom_article_not_reviewable"
  | "status_update_failed";

export type NewsroomReviewResult =
  | Readonly<{ ok: true; value: NewsroomReviewSuccess }>
  | Readonly<{
      ok: false;
      error: Readonly<{
        code: NewsroomReviewErrorCode;
        message: string;
      }>;
    }>;

function failure(
  code: NewsroomReviewErrorCode,
  message: string,
): NewsroomReviewResult {
  return { ok: false, error: { code, message } };
}

function normalizedArticleId(value: string): string | null {
  const normalized = value.trim().toLowerCase();
  return UUID_PATTERN.test(normalized) ? normalized : null;
}

function hasUsableBody(body: readonly ArticleBodyBlock[] | null): boolean {
  return Boolean(body?.some((block) => block.text.trim().length > 0));
}

function readyArticle(source: NewsroomReviewSource | null): NewsroomReviewUpdate | null {
  if (!source || source.processingStatus !== "ready_for_review") {
    return null;
  }

  return { id: source.id, processingStatus: "ready_for_review" };
}

export function createNewsroomReviewService(transport: NewsroomReviewTransport) {
  return async function markNewsroomArticleReadyForReview(
    newsroomArticleIdValue: string,
  ): Promise<NewsroomReviewResult> {
    const newsroomArticleId = normalizedArticleId(newsroomArticleIdValue);
    if (!newsroomArticleId) {
      return failure("input_invalid", "O artigo da caixa de entrada não é válido.");
    }

    if (!transport.isConfigured()) {
      return failure("service_unavailable", "O serviço da caixa de entrada não está configurado.");
    }

    let source: NewsroomReviewSource | null;
    try {
      source = await transport.readSource(newsroomArticleId);
    } catch {
      return failure("status_update_failed", "Não foi possível ler o artigo da caixa de entrada.");
    }

    if (!source || source.id !== newsroomArticleId) {
      return failure("newsroom_article_not_found", "O artigo da caixa de entrada já não existe.");
    }

    const alreadyReady = readyArticle(source);
    if (alreadyReady) {
      return {
        ok: true,
        value: { article: alreadyReady, action: "reused" },
      };
    }

    if (!hasUsableBody(source.body)) {
      return failure(
        "newsroom_snapshot_missing",
        "O artigo ainda não tem um snapshot normalizado utilizável.",
      );
    }

    if (source.processingStatus !== "detected" && source.processingStatus !== "normalized") {
      return failure(
        "newsroom_article_not_reviewable",
        "O estado atual do artigo não permite marcá-lo como Por rever.",
      );
    }

    try {
      const updated = await transport.updateReadyForReview(newsroomArticleId);
      if (updated?.id === newsroomArticleId && updated.processingStatus === "ready_for_review") {
        return {
          ok: true,
          value: { article: updated, action: "updated" },
        };
      }
    } catch {
      // Uma nova leitura abaixo resolve atualizações concorrentes sem duplicar ações.
    }

    try {
      const sourceAfterConflict = await transport.readSource(newsroomArticleId);
      const readyAfterConflict = readyArticle(sourceAfterConflict);
      if (readyAfterConflict) {
        return {
          ok: true,
          value: { article: readyAfterConflict, action: "reused" },
        };
      }
    } catch {
      // A resposta controlada abaixo não expõe detalhes do transporte.
    }

    return failure("status_update_failed", "Não foi possível marcar o artigo como Por rever.");
  };
}
