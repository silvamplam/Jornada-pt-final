import type {
  ArticleBodyBlock,
  ArticleProcessingStatus,
  OperationResult,
} from "@/lib/redacao-automatica/types";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type NewsroomDraftSource = Readonly<{
  id: string;
  title: string;
  subtitle: string | null;
  imageUrl: string | null;
  processingStatus: ArticleProcessingStatus;
  body: readonly ArticleBodyBlock[] | null;
}>;

export type LinkedEditorialArticle = Readonly<{
  id: string;
  status: "draft" | "published";
}>;

export type EditorialDraftInsert = Readonly<{
  id: string;
  newsroom_article_id: string;
  title: string;
  slug: string;
  status: "draft";
  scope: "general";
  subtitle: string | null;
  body: string;
  image_url: string | null;
  published_at: null;
  competition_id: null;
  season_id: null;
  matchday_id: null;
  created_at: string;
  updated_at: string;
}>;

export interface NewsroomEditorialDraftTransport {
  isConfigured(): boolean;
  readSource(newsroomArticleId: string): Promise<NewsroomDraftSource | null>;
  findLinkedArticle(newsroomArticleId: string): Promise<LinkedEditorialArticle | null>;
  insertDraft(payload: EditorialDraftInsert): Promise<LinkedEditorialArticle>;
  randomUuid(): string;
  now(): string;
}

export type NewsroomEditorialDraftSuccess = Readonly<{
  editorialArticle: LinkedEditorialArticle;
  action: "created" | "reused";
}>;

export type NewsroomEditorialDraftErrorCode =
  | "input_invalid"
  | "service_unavailable"
  | "newsroom_article_not_found"
  | "newsroom_article_not_ready"
  | "newsroom_snapshot_missing"
  | "draft_creation_failed";

export type NewsroomEditorialDraftError = Readonly<{
  code: NewsroomEditorialDraftErrorCode;
  message: string;
}>;

export type NewsroomEditorialDraftResult = OperationResult<
  NewsroomEditorialDraftSuccess,
  NewsroomEditorialDraftError
>;

export type NewsroomEditorialDraftLookupResult = OperationResult<
  LinkedEditorialArticle | null,
  Readonly<{
    code: "input_invalid" | "service_unavailable" | "draft_lookup_failed";
    message: string;
  }>
>;

function failure(
  code: NewsroomEditorialDraftErrorCode,
  message: string,
): NewsroomEditorialDraftResult {
  return { ok: false, error: { code, message } };
}

function normalizedArticleId(value: string): string | null {
  const normalized = value.trim().toLowerCase();
  return UUID_PATTERN.test(normalized) ? normalized : null;
}

function normalizedBody(blocks: readonly ArticleBodyBlock[]): string {
  return blocks
    .map((block) => block.text.trim())
    .filter(Boolean)
    .join("\n\n");
}

function deterministicSlug(newsroomArticleId: string): string {
  return `newsroom-${newsroomArticleId.replaceAll("-", "")}`;
}

function validLinkedArticle(
  article: LinkedEditorialArticle | null,
): article is LinkedEditorialArticle {
  return Boolean(
    article
      && UUID_PATTERN.test(article.id)
      && (article.status === "draft" || article.status === "published"),
  );
}

export function createNewsroomEditorialDraftLookup(
  transport: NewsroomEditorialDraftTransport,
) {
  return async function findNewsroomEditorialDraft(
    newsroomArticleIdValue: string,
  ): Promise<NewsroomEditorialDraftLookupResult> {
    const newsroomArticleId = normalizedArticleId(newsroomArticleIdValue);
    if (!newsroomArticleId) {
      return {
        ok: false,
        error: {
          code: "input_invalid",
          message: "O artigo da caixa de entrada não é válido.",
        },
      };
    }

    if (!transport.isConfigured()) {
      return {
        ok: false,
        error: {
          code: "service_unavailable",
          message: "O serviço editorial não está configurado.",
        },
      };
    }

    try {
      const linkedArticle = await transport.findLinkedArticle(newsroomArticleId);
      return {
        ok: true,
        value: validLinkedArticle(linkedArticle) ? linkedArticle : null,
      };
    } catch {
      return {
        ok: false,
        error: {
          code: "draft_lookup_failed",
          message: "Não foi possível confirmar o rascunho editorial.",
        },
      };
    }
  };
}

export function createNewsroomEditorialDraftService(
  transport: NewsroomEditorialDraftTransport,
) {
  return async function createNewsroomEditorialDraft(
    newsroomArticleIdValue: string,
  ): Promise<NewsroomEditorialDraftResult> {
    const newsroomArticleId = normalizedArticleId(newsroomArticleIdValue);
    if (!newsroomArticleId) {
      return failure("input_invalid", "O artigo da caixa de entrada não é válido.");
    }

    if (!transport.isConfigured()) {
      return failure("service_unavailable", "O serviço editorial não está configurado.");
    }

    try {
      const existing = await transport.findLinkedArticle(newsroomArticleId);
      if (validLinkedArticle(existing)) {
        return {
          ok: true,
          value: { editorialArticle: existing, action: "reused" },
        };
      }
    } catch {
      return failure("draft_creation_failed", "Não foi possível confirmar a proveniência editorial.");
    }

    let source: NewsroomDraftSource | null;
    try {
      source = await transport.readSource(newsroomArticleId);
    } catch {
      return failure("draft_creation_failed", "Não foi possível ler o artigo da caixa de entrada.");
    }

    if (!source || source.id !== newsroomArticleId) {
      return failure("newsroom_article_not_found", "O artigo da caixa de entrada já não existe.");
    }

    if (source.processingStatus !== "ready_for_review") {
      return failure(
        "newsroom_article_not_ready",
        "O artigo ainda não está disponível para validação editorial.",
      );
    }

    const body = source.body ? normalizedBody(source.body) : "";
    if (!body) {
      return failure(
        "newsroom_snapshot_missing",
        "O artigo ainda não tem um snapshot normalizado utilizável.",
      );
    }

    const now = transport.now();
    const payload: EditorialDraftInsert = {
      id: transport.randomUuid(),
      newsroom_article_id: newsroomArticleId,
      title: source.title,
      slug: deterministicSlug(newsroomArticleId),
      status: "draft",
      scope: "general",
      subtitle: source.subtitle,
      body,
      image_url: source.imageUrl,
      published_at: null,
      competition_id: null,
      season_id: null,
      matchday_id: null,
      created_at: now,
      updated_at: now,
    };

    try {
      const created = await transport.insertDraft(payload);
      if (!validLinkedArticle(created) || created.status !== "draft") {
        return failure("draft_creation_failed", "O serviço não devolveu um rascunho editorial válido.");
      }

      return {
        ok: true,
        value: { editorialArticle: created, action: "created" },
      };
    } catch {
      try {
        const existingAfterConflict = await transport.findLinkedArticle(newsroomArticleId);
        if (validLinkedArticle(existingAfterConflict)) {
          return {
            ok: true,
            value: { editorialArticle: existingAfterConflict, action: "reused" },
          };
        }
      } catch {
        // A resposta controlada abaixo não expõe detalhes do transporte.
      }

      return failure("draft_creation_failed", "Não foi possível criar o rascunho editorial.");
    }
  };
}
