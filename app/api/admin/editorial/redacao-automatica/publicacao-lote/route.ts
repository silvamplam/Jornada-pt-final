import { NextResponse } from "next/server";

import {
  createEditorialArticle,
  EditorialArticleServiceError,
  normalizeEditorialArticleSlug,
  resolveCanonicalArticleContext,
} from "@/lib/editorial-article-service";
import {
  ensurePublishedArticleInLatest,
  EditorialMatchdayNewsFlowError,
} from "@/lib/editorial-matchday-news-flow";
import {
  fetchSupabaseAdminTable,
  getSupabaseServiceConfig,
} from "@/lib/supabase";

const MAX_BATCH_ARTICLES = 30;
const OFFICIAL_BATCH_KEY = /^\d{2}$/;

type BatchArticlePayload = Readonly<{
  index: number;
  key: string;
  label: string;
  title: string;
  subtitle: string;
  body: string;
}>;

type BatchPublicationPayload = Readonly<{
  action?: unknown;
  matchdayId?: unknown;
  author?: unknown;
  articles?: unknown;
  article?: unknown;
  imageUrl?: unknown;
  publishedAt?: unknown;
}>;

type ExistingArticleRow = Readonly<{
  id: string;
  slug: string | null;
  label: string | null;
  title: string | null;
  subtitle: string | null;
  body: string | null;
  image_url: string | null;
  author: string | null;
  published_at: string | null;
  matchday_id: string | null;
  status: string | null;
}>;

type PreparedBatchItem = Readonly<{
  article: BatchArticlePayload;
  slug: string;
  existing: ExistingArticleRow | null;
}>;

function cleanText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizedBody(value: unknown) {
  return cleanText(value).replace(/\r\n?/g, "\n");
}

function safeDetail(value: string) {
  return value.replace(/\s+/g, " ").trim().slice(0, 320);
}

function jsonError(error: string, status = 400, detail?: string) {
  return NextResponse.json({
    ok: false,
    error,
    detail: detail ? safeDetail(detail) : undefined,
  }, { status });
}

function parseArticle(value: unknown, expectedPosition?: number): BatchArticlePayload | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Record<string, unknown>;
  const index = Number(candidate.index);
  const key = cleanText(candidate.key);
  const label = cleanText(candidate.label);
  const title = cleanText(candidate.title);
  const subtitle = cleanText(candidate.subtitle);
  const body = normalizedBody(candidate.body);

  if (!Number.isInteger(index) || index < 1 || index > MAX_BATCH_ARTICLES) {
    return null;
  }
  if (!OFFICIAL_BATCH_KEY.test(key) || key !== String(index).padStart(2, "0")) {
    return null;
  }
  if (expectedPosition !== undefined && index !== expectedPosition + 1) {
    return null;
  }
  if (!label || !title || !subtitle || !body) {
    return null;
  }

  return { index, key, label, title, subtitle, body };
}

function parseBatchArticles(value: unknown) {
  if (!Array.isArray(value) || value.length < 1 || value.length > MAX_BATCH_ARTICLES) {
    return null;
  }

  const articles = value.map((item, index) => parseArticle(item, index));
  if (articles.some((article) => !article)) {
    return null;
  }

  return articles as BatchArticlePayload[];
}

function parsePublishedAt(value: unknown) {
  const clean = cleanText(value);
  if (!clean) return null;
  const date = new Date(clean);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

async function readExistingArticleBySlug(slug: string) {
  const rows = await fetchSupabaseAdminTable<ExistingArticleRow>(
    `editorial_articles?select=id,slug,label,title,subtitle,body,image_url,author,published_at,matchday_id,status&slug=eq.${encodeURIComponent(slug)}&limit=1`,
  );
  return rows[0] ?? null;
}

function existingArticleMatches(
  existing: ExistingArticleRow,
  article: BatchArticlePayload,
  author: string,
  matchdayId: string,
  publishedAt?: string | null,
) {
  if (existing.status !== "published") return false;
  if (cleanText(existing.slug) !== normalizeEditorialArticleSlug(article.title)) return false;
  if (cleanText(existing.label) !== article.label) return false;
  if (cleanText(existing.title) !== article.title) return false;
  if (cleanText(existing.subtitle) !== article.subtitle) return false;
  if (normalizedBody(existing.body) !== article.body) return false;
  if (cleanText(existing.author) !== author) return false;
  if (cleanText(existing.matchday_id) !== matchdayId) return false;
  if (publishedAt && parsePublishedAt(existing.published_at) !== publishedAt) return false;
  return Boolean(parsePublishedAt(existing.published_at));
}

async function prepareBatch(
  articles: readonly BatchArticlePayload[],
  author: string,
  matchdayId: string,
) {
  const context = await resolveCanonicalArticleContext({ competition_id: null, season_id: null, matchday_id: matchdayId });
  if (!context.matchday_id || context.matchday_id !== matchdayId) {
    throw new EditorialArticleServiceError("invalid-context");
  }

  const seenSlugs = new Map<string, string>();
  const prepared: PreparedBatchItem[] = [];

  for (const article of articles) {
    const slug = normalizeEditorialArticleSlug(article.title);
    if (!slug) {
      throw new EditorialArticleServiceError("missing-slug");
    }

    const previousKey = seenSlugs.get(slug);
    if (previousKey) {
      throw new Error(`slug-intra-batch:${previousKey}:${article.key}:${slug}`);
    }
    seenSlugs.set(slug, article.key);

    const existing = await readExistingArticleBySlug(slug);
    if (existing && !existingArticleMatches(existing, article, author, matchdayId)) {
      throw new Error(`slug-collision:${article.key}:${slug}`);
    }

    prepared.push({ article, slug, existing });
  }

  return prepared;
}

function publicationPlan(prepared: readonly PreparedBatchItem[]) {
  const anchor = prepared.find((item) => item.existing && parsePublishedAt(item.existing.published_at));
  const anchorPublishedAt = anchor?.existing ? parsePublishedAt(anchor.existing.published_at) : null;
  const anchorTime = anchorPublishedAt ? new Date(anchorPublishedAt).getTime() : Date.now();
  const anchorIndex = anchor ? anchor.article.index - 1 : 0;
  const baseTimeMs = anchorTime + anchorIndex;

  for (const item of prepared) {
    if (!item.existing) continue;
    const existingPublishedAt = parsePublishedAt(item.existing.published_at);
    const expectedPublishedAt = new Date(baseTimeMs - (item.article.index - 1)).toISOString();
    if (!existingPublishedAt || existingPublishedAt !== expectedPublishedAt) {
      throw new Error(`resume-order-mismatch:${item.article.key}`);
    }
  }

  return prepared.map((item) => ({
    key: item.article.key,
    slug: item.slug,
    mode: item.existing ? "resume" as const : "create" as const,
    ...(item.existing ? { articleId: item.existing.id } : {}),
    publishedAt: item.existing
      ? parsePublishedAt(item.existing.published_at) as string
      : new Date(baseTimeMs - (item.article.index - 1)).toISOString(),
  }));
}

async function preflightPublication(payload: BatchPublicationPayload) {
  const matchdayId = cleanText(payload.matchdayId);
  const author = cleanText(payload.author);
  const articles = parseBatchArticles(payload.articles);

  if (!matchdayId) return jsonError("missing-matchday");
  if (!author) return jsonError("missing-author");
  if (!articles) return jsonError("invalid-batch");

  try {
    const prepared = await prepareBatch(articles, author, matchdayId);
    return NextResponse.json({
      ok: true,
      items: publicationPlan(prepared),
    });
  } catch (error) {
    if (error instanceof EditorialArticleServiceError) {
      return jsonError(error.code, error.code === "duplicate-slug" ? 409 : 400, error.message);
    }

    const message = error instanceof Error ? error.message : "batch-preflight-failed";
    if (message.startsWith("slug-intra-batch:")) {
      const [, firstKey, secondKey, slug] = message.split(":");
      return jsonError(
        "duplicate-slug-in-batch",
        409,
        `Os artigos ${firstKey} e ${secondKey} produzem o mesmo slug canónico: ${slug}.`,
      );
    }
    if (message.startsWith("slug-collision:")) {
      const [, key, slug] = message.split(":");
      return jsonError(
        "slug-collision",
        409,
        `O artigo ${key} colide com um artigo existente incompatível: ${slug}.`,
      );
    }
    if (message.startsWith("resume-order-mismatch:")) {
      const [, key] = message.split(":");
      return jsonError(
        "resume-order-mismatch",
        409,
        `O artigo ${key} já existe, mas a sua data não é compatível com a retoma segura deste lote.`,
      );
    }

    return jsonError("batch-preflight-failed", 500, message);
  }
}

async function publishItem(payload: BatchPublicationPayload) {
  const matchdayId = cleanText(payload.matchdayId);
  const author = cleanText(payload.author);
  const article = parseArticle(payload.article);
  const imageUrl = cleanText(payload.imageUrl);
  const publishedAt = parsePublishedAt(payload.publishedAt);

  if (!matchdayId) return jsonError("missing-matchday");
  if (!author) return jsonError("missing-author");
  if (!article) return jsonError("invalid-article");
  if (!publishedAt) return jsonError("invalid-published-at");

  try {
    const context = await resolveCanonicalArticleContext({ competition_id: null, season_id: null, matchday_id: matchdayId });
    if (!context.matchday_id || context.matchday_id !== matchdayId) {
      throw new EditorialArticleServiceError("invalid-context");
    }

    const slug = normalizeEditorialArticleSlug(article.title);
    if (!slug) {
      throw new EditorialArticleServiceError("missing-slug");
    }

    const existing = await readExistingArticleBySlug(slug);
    if (existing) {
      if (!existingArticleMatches(existing, article, author, matchdayId, publishedAt)) {
        return jsonError(
          "slug-collision",
          409,
          `O slug ${slug} já pertence a um artigo incompatível com esta publicação.`,
        );
      }

      try {
        await ensurePublishedArticleInLatest(matchdayId, existing.id);
      } catch (error) {
        return NextResponse.json({
          ok: false,
          error: "latest-placement-failed",
          detail: safeDetail(error instanceof Error ? error.message : "Falhou a entrada em Últimas."),
          published: true,
          articleId: existing.id,
          slug,
        }, { status: 502 });
      }

      return NextResponse.json({
        ok: true,
        resumed: true,
        articleId: existing.id,
        slug,
      });
    }

    if (!imageUrl) {
      return jsonError("missing-image-url");
    }

    const result = await createEditorialArticle({
      label: article.label,
      title: article.title,
      subtitle: article.subtitle,
      body: article.body,
      slug,
      image_url: imageUrl,
      image_caption: null,
      author,
      published_at: publishedAt,
      competition_id: null,
      season_id: null,
      matchday_id: matchdayId,
    }, {
      action: "publish",
      initialPlacement: "editorial_line_item",
    });

    if (result.placementFailure) {
      return NextResponse.json({
        ok: false,
        error: "latest-placement-failed",
        detail: safeDetail(
          result.placementFailure.cause instanceof Error
            ? result.placementFailure.cause.message
            : "O artigo foi publicado, mas falhou a entrada em Últimas.",
        ),
        published: true,
        articleId: result.articleId,
        slug: result.slug,
      }, { status: 502 });
    }

    return NextResponse.json({
      ok: true,
      resumed: false,
      articleId: result.articleId,
      slug: result.slug,
    });
  } catch (error) {
    if (error instanceof EditorialArticleServiceError) {
      return jsonError(error.code, error.code === "duplicate-slug" ? 409 : 400, error.message);
    }
    if (error instanceof EditorialMatchdayNewsFlowError) {
      return jsonError(error.code, 502, error.message);
    }

    return jsonError(
      "batch-publication-failed",
      500,
      error instanceof Error ? error.message : "A publicação do artigo falhou.",
    );
  }
}

export async function POST(request: Request) {
  try {
    getSupabaseServiceConfig();
  } catch {
    return jsonError("missing-service", 500);
  }

  let payload: BatchPublicationPayload;
  try {
    payload = await request.json() as BatchPublicationPayload;
  } catch {
    return jsonError("invalid-json");
  }

  const action = cleanText(payload.action);
  if (action === "preflight") {
    return preflightPublication(payload);
  }
  if (action === "publish_item") {
    return publishItem(payload);
  }

  return jsonError("invalid-action");
}
