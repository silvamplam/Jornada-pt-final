import { NextResponse } from "next/server";

import {
  createEditorialArticle,
  EditorialArticleServiceError,
  normalizeEditorialArticleSlug,
  resolveCanonicalArticleContext,
  updateEditorialArticle,
} from "@/lib/editorial-article-service";
import {
  ensurePublishedArticleInLatest,
  EditorialMatchdayNewsFlowError,
  finalizePublishedArticlesInLatestBatch,
} from "@/lib/editorial-matchday-news-flow";
import {
  fetchSupabaseAdminTable,
  getSupabaseServiceConfig,
} from "@/lib/supabase";
import {
  markEditorialSourcePackageArticleUsed,
  readEditorialSourcePackage,
} from "@/lib/redacao-automatica/editorial-source-package";
import {
  isEditorialSourcePackageLocation,
} from "@/lib/redacao-automatica/editorial-source-package-internal";
import {
  editorialBatchTargetPublicationMode,
  editorialBatchUpdateTargetIssue,
  type EditorialBatchUpdateTarget,
} from "@/lib/redacao-automatica/editorial-batch-update-target";

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
  sourcePackage?: unknown;
  confirmedUpdates?: unknown;
  publicationMode?: unknown;
  updateArticleId?: unknown;
}>;

type ExistingArticleRow = Readonly<{
  id: string;
  slug: string | null;
  label: string | null;
  title: string | null;
  subtitle: string | null;
  body: string | null;
  image_url: string | null;
  image_caption?: string | null;
  author: string | null;
  published_at: string | null;
  matchday_id: string | null;
  status: string | null;
}>;

type PreparedBatchItem = Readonly<{
  article: BatchArticlePayload;
  slug: string;
  existing: ExistingArticleRow | null;
  updateCandidate: boolean;
  updateTarget: SourcePackageUpdateTarget | null;
}>;

type SourcePackagePayload = Readonly<{
  year: string;
  month: string;
  packageId: string;
}>;

type SourcePackageUpdateTarget = EditorialBatchUpdateTarget;

type ReconcileArticleRow = ExistingArticleRow & Readonly<{
  image_caption: string | null;
}>;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function cleanText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function parseSourcePackage(value: unknown): SourcePackagePayload | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const candidate = value as Record<string, unknown>;
  const sourcePackage = {
    year: cleanText(candidate.year),
    month: cleanText(candidate.month),
    packageId: cleanText(candidate.packageId).toLowerCase(),
  };

  return isEditorialSourcePackageLocation(sourcePackage) ? sourcePackage : null;
}

async function markSourcePackageUsed(
  sourcePackage: SourcePackagePayload | null,
  articlePosition: number,
  articleId: string,
  slug: string,
) {
  if (!sourcePackage) {
    return null;
  }

  const result = await markEditorialSourcePackageArticleUsed({
    ...sourcePackage,
    articlePosition,
    publishedArticleId: articleId,
    publishedSlug: slug,
  });

  return result.ok ? null : result.error.code;
}

function parseConfirmedUpdates(
  value: unknown,
): ReadonlyMap<string, string> | null {
  if (
    !value
    || typeof value !== "object"
    || Array.isArray(value)
  ) {
    return null;
  }

  const updates =
    new Map<string, string>();

  for (
    const [key, rawArticleId]
    of Object.entries(
      value as Record<string, unknown>,
    )
  ) {
    const articleId =
      cleanText(rawArticleId).toLowerCase();

    if (
      !OFFICIAL_BATCH_KEY.test(key)
      || !UUID_PATTERN.test(articleId)
    ) {
      return null;
    }

    updates.set(key, articleId);
  }

  return updates;
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


async function sourcePublishedAtByArticle(
  sourcePackage: SourcePackagePayload,
) {
  const sourcePackageResult =
    await readEditorialSourcePackage(
      sourcePackage,
    );

  if (!sourcePackageResult.ok) {
    throw new Error(
      `source-package-read-failed:${sourcePackageResult.error.code}`,
    );
  }

  const preparedEntries =
    sourcePackageResult.value.manifest.entries
      .filter(
        (entry) =>
          entry.status === "prepared",
      );

  const latestPublishedAtBySourceGroup =
    new Map<number, string>();

  for (const entry of preparedEntries) {
    const sourcePublishedAt =
      entry.publishedAtPrecision === "instant"
        ? parsePublishedAt(
            entry.publishedAt,
          )
        : null;

    if (!sourcePublishedAt) {
      continue;
    }

    const current =
      latestPublishedAtBySourceGroup.get(
        entry.articlePosition,
      );

    if (
      !current
      || new Date(sourcePublishedAt).getTime()
        > new Date(current).getTime()
    ) {
      latestPublishedAtBySourceGroup.set(
        entry.articlePosition,
        sourcePublishedAt,
      );
    }
  }

  const publishedAtByArticle =
    new Map<number, string>();
  const updateTargetByArticle =
    new Map<number, SourcePackageUpdateTarget>();

  for (
    const output
    of sourcePackageResult.value.manifest.outputs
  ) {
    if (output.publishedArticleId && output.publishedSlug) {
      updateTargetByArticle.set(output.position, {
        publishedArticleId: output.publishedArticleId,
        publishedSlug: output.publishedSlug,
      });
    }

    const sourcePublishedAt =
      latestPublishedAtBySourceGroup.get(
        output.sourceArticlePosition,
      );

    if (!sourcePublishedAt) {
      continue;
    }

    publishedAtByArticle.set(
      output.position,
      sourcePublishedAt,
    );
  }

  return {
    package: sourcePackageResult.value,
    publishedAtByArticle,
    updateTargetByArticle,
  };
}

async function readExistingArticleBySlug(slug: string) {
  const rows = await fetchSupabaseAdminTable<ExistingArticleRow>(
    `editorial_articles?select=id,slug,label,title,subtitle,body,image_url,author,published_at,matchday_id,status&slug=eq.${encodeURIComponent(slug)}&limit=1`,
  );
  return rows[0] ?? null;
}

async function readExistingArticleById(articleId: string) {
  const rows = await fetchSupabaseAdminTable<ExistingArticleRow>(
    "editorial_articles?select=id,slug,label,title,subtitle,body,image_url,author,published_at,matchday_id,status"
    + `&id=eq.${encodeURIComponent(articleId)}&limit=1`,
  );
  return rows[0] ?? null;
}

function assertValidSourcePackageUpdateTarget(
  existing: ExistingArticleRow | null,
  target: SourcePackageUpdateTarget,
  matchdayId: string,
  articleKey: string,
): asserts existing is ExistingArticleRow {
  const issue = editorialBatchUpdateTargetIssue(
    existing
      ? {
          id: existing.id,
          slug: existing.slug,
          status: existing.status,
          matchdayId: existing.matchday_id,
          publishedAt: existing.published_at,
        }
      : null,
    target,
    matchdayId,
  );

  if (issue) {
    throw new Error(`update-target-${issue}:${articleKey}`);
  }
}

function existingArticleMatches(
  existing: ExistingArticleRow,
  article: BatchArticlePayload,
  author: string,
  matchdayId: string,
  publishedAt?: string | null,
  expectedSlug = normalizeEditorialArticleSlug(article.title),
) {
  if (existing.status !== "published") return false;
  if (cleanText(existing.slug) !== expectedSlug) return false;
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
  allowUpdates: boolean,
  updateTargetByArticle: ReadonlyMap<number, SourcePackageUpdateTarget>,
) {
  const context = await resolveCanonicalArticleContext({ competition_id: null, season_id: null, matchday_id: matchdayId });
  if (!context.matchday_id || context.matchday_id !== matchdayId) {
    throw new EditorialArticleServiceError("invalid-context");
  }

  const seenSlugs = new Map<string, string>();
  const prepared: PreparedBatchItem[] = [];

  for (const article of articles) {
    const updateTarget = updateTargetByArticle.get(article.index) ?? null;
    const slug = updateTarget?.publishedSlug
      ?? normalizeEditorialArticleSlug(article.title);
    if (!slug) {
      throw new EditorialArticleServiceError("missing-slug");
    }

    const previousKey = seenSlugs.get(slug);
    if (previousKey) {
      throw new Error(`slug-intra-batch:${previousKey}:${article.key}:${slug}`);
    }
    seenSlugs.set(slug, article.key);

    const existing = updateTarget
      ? await readExistingArticleById(updateTarget.publishedArticleId)
      : await readExistingArticleBySlug(slug);

    if (updateTarget) {
      assertValidSourcePackageUpdateTarget(
        existing,
        updateTarget,
        matchdayId,
        article.key,
      );
    }

    const existingMatches =
      existing
        ? existingArticleMatches(
            existing,
            article,
            author,
            matchdayId,
            null,
            updateTarget?.publishedSlug,
          )
        : false;

    const updateCandidate =
      Boolean(
        existing
        && !existingMatches
        && (allowUpdates || Boolean(updateTarget))
        && existing.status === "published"
        && cleanText(existing.matchday_id)
          === matchdayId,
      );

    if (
      existing
      && !existingMatches
      && !updateCandidate
    ) {
      throw new Error(
        `slug-collision:${article.key}:${slug}`,
      );
    }

    prepared.push({
      article,
      slug,
      existing,
      updateCandidate,
      updateTarget,
    });
  }

  return prepared;
}

function publicationPlan(
  prepared: readonly PreparedBatchItem[],
  sourcePublishedAt:
    ReadonlyMap<number, string> | null,
  confirmedUpdates:
    ReadonlyMap<string, string>,
) {
  function itemMode(item: PreparedBatchItem) {
    const confirmedArticleId = confirmedUpdates.get(item.article.key);

    if (item.updateTarget && item.existing) {
      const targetMode = editorialBatchTargetPublicationMode({
        targetArticleId: item.updateTarget.publishedArticleId,
        existingMatches: !item.updateCandidate,
        confirmedArticleId: confirmedArticleId ?? null,
      });

      if (targetMode === "confirmation_mismatch") {
        throw new Error(`confirmed-update-target-mismatch:${item.article.key}`);
      }

      return targetMode;
    }

    if (item.updateCandidate && item.existing) {
      return confirmedArticleId
        === item.existing.id
          ? "update" as const
          : "update_required" as const;
    }

    return item.existing
      ? "resume" as const
      : "create" as const;
  }

  if (sourcePublishedAt) {
    return prepared.map((item) => {
      const publishedAt = item.updateTarget && item.existing
        ? parsePublishedAt(item.existing.published_at)
        : sourcePublishedAt.get(item.article.index);

      if (!publishedAt) {
        throw new Error(
          `missing-source-published-at:${item.article.key}`,
        );
      }

      const mode = itemMode(item);

      if (
        mode === "resume"
        && item.existing
        && !item.updateTarget
      ) {
        const existingPublishedAt =
          parsePublishedAt(
            item.existing.published_at,
          );

        if (
          existingPublishedAt
          !== publishedAt
        ) {
          throw new Error(
            `resume-source-time-mismatch:${item.article.key}`,
          );
        }
      }

      return {
        key: item.article.key,
        slug: item.slug,
        mode,
        updateTargetFromDossier: Boolean(item.updateTarget),
        ...(item.existing
          ? {
              articleId:
                item.existing.id,
              existingTitle:
                item.existing.title,
              existingSlug:
                item.existing.slug,
            }
          : {}),
        publishedAt,
      };
    });
  }

  const anchor =
    prepared.find(
      (item) =>
        item.existing
        && parsePublishedAt(
          item.existing.published_at,
        ),
    );

  const anchorPublishedAt =
    anchor?.existing
      ? parsePublishedAt(
          anchor.existing.published_at,
        )
      : null;

  const anchorTime =
    anchorPublishedAt
      ? new Date(
          anchorPublishedAt,
        ).getTime()
      : Date.now();

  const anchorIndex =
    anchor
      ? anchor.article.index - 1
      : 0;

  const baseTimeMs =
    anchorTime + anchorIndex;

  for (const item of prepared) {
    const mode = itemMode(item);

    if (
      mode !== "resume"
      || !item.existing
    ) {
      continue;
    }

    const existingPublishedAt =
      parsePublishedAt(
        item.existing.published_at,
      );

    const expectedPublishedAt =
      new Date(
        baseTimeMs
        - (item.article.index - 1),
      ).toISOString();

    if (
      !existingPublishedAt
      || existingPublishedAt
        !== expectedPublishedAt
    ) {
      throw new Error(
        `resume-order-mismatch:${item.article.key}`,
      );
    }
  }

  return prepared.map((item) => {
    const mode = itemMode(item);

    return {
      key: item.article.key,
      slug: item.slug,
      mode,
      updateTargetFromDossier: Boolean(item.updateTarget),
      ...(item.existing
        ? {
            articleId:
              item.existing.id,
            existingTitle:
              item.existing.title,
            existingSlug:
              item.existing.slug,
          }
        : {}),
      publishedAt:
        mode === "resume"
        && item.existing
          ? parsePublishedAt(
              item.existing.published_at,
            ) as string
          : new Date(
              baseTimeMs
              - (item.article.index - 1),
            ).toISOString(),
    };
  });
}

async function preflightPublication(payload: BatchPublicationPayload) {
  const matchdayId = cleanText(payload.matchdayId);
  const author = cleanText(payload.author);
  const articles = parseBatchArticles(payload.articles);
  const sourcePackage =
    payload.sourcePackage === undefined
      ? null
      : parseSourcePackage(
          payload.sourcePackage,
        );

  const confirmedUpdates =
    payload.confirmedUpdates === undefined
      ? new Map<string, string>()
      : parseConfirmedUpdates(
          payload.confirmedUpdates,
        );

  if (!matchdayId) {
    return jsonError("missing-matchday");
  }

  if (!author) {
    return jsonError("missing-author");
  }

  if (!articles) {
    return jsonError("invalid-batch");
  }

  if (
    payload.sourcePackage !== undefined
    && !sourcePackage
  ) {
    return jsonError(
      "invalid-source-package",
    );
  }

  if (!confirmedUpdates) {
    return jsonError(
      "invalid-confirmed-updates",
    );
  }

  try {
    const sourceContext = sourcePackage
      ? await sourcePublishedAtByArticle(sourcePackage)
      : null;

    const prepared =
      await prepareBatch(
        articles,
        author,
        matchdayId,
        Boolean(sourcePackage),
        sourceContext?.updateTargetByArticle ?? new Map(),
      );

    return NextResponse.json({
      ok: true,
      items: publicationPlan(
        prepared,
        sourceContext?.publishedAtByArticle ?? null,
        confirmedUpdates,
      ),
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
    if (message.startsWith("missing-source-published-at:")) {
      const [, key] = message.split(":");
      return jsonError(
        "missing-source-published-at",
        409,
        `O artigo ${key} não tem uma hora de fonte utilizável no pacote editorial.`,
      );
    }
    if (message.startsWith("resume-source-time-mismatch:")) {
      const [, key] = message.split(":");
      return jsonError(
        "resume-source-time-mismatch",
        409,
        `O artigo ${key} já existe com uma hora diferente da hora da fonte.`,
      );
    }
    if (message.startsWith("source-package-read-failed:")) {
      return jsonError(
        "source-package-read-failed",
        409,
        "Não foi possível recuperar as horas das fontes deste pacote editorial.",
      );
    }
    if (message.startsWith("confirmed-update-target-mismatch:")) {
      return jsonError(
        "update-target-mismatch",
        409,
        "A confirmação recebida não corresponde ao artigo publicado identificado pelo Dossiê.",
      );
    }
    if (message.startsWith("update-target-")) {
      return jsonError(
        "invalid-dossier-update-target",
        409,
        "O artigo publicado identificado pelo Dossiê deixou de ser um alvo válido nesta Jornada.",
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
  const sourcePackage =
    payload.sourcePackage === undefined
      ? null
      : parseSourcePackage(
          payload.sourcePackage,
        );

  const publicationMode =
    cleanText(payload.publicationMode);

  const updateArticleId =
    cleanText(
      payload.updateArticleId,
    ).toLowerCase();

  if (!matchdayId) {
    return jsonError("missing-matchday");
  }

  if (!author) {
    return jsonError("missing-author");
  }

  if (!article) {
    return jsonError("invalid-article");
  }

  if (!publishedAt) {
    return jsonError(
      "invalid-published-at",
    );
  }

  if (
    payload.sourcePackage !== undefined
    && !sourcePackage
  ) {
    return jsonError(
      "invalid-source-package",
    );
  }

  if (
    publicationMode
    && publicationMode !== "create"
    && publicationMode !== "resume"
    && publicationMode !== "update"
  ) {
    return jsonError(
      "invalid-publication-mode",
    );
  }

  try {
    const context = await resolveCanonicalArticleContext({ competition_id: null, season_id: null, matchday_id: matchdayId });
    if (!context.matchday_id || context.matchday_id !== matchdayId) {
      throw new EditorialArticleServiceError("invalid-context");
    }

    const sourceContext = sourcePackage
      ? await sourcePublishedAtByArticle(sourcePackage)
      : null;
    const updateTarget = sourceContext?.updateTargetByArticle.get(article.index)
      ?? null;
    const slug = updateTarget?.publishedSlug
      ?? normalizeEditorialArticleSlug(article.title);
    if (!slug) {
      throw new EditorialArticleServiceError("missing-slug");
    }

    const existing = updateTarget
      ? await readExistingArticleById(updateTarget.publishedArticleId)
      : await readExistingArticleBySlug(slug);

    if (updateTarget) {
      assertValidSourcePackageUpdateTarget(
        existing,
        updateTarget,
        matchdayId,
        article.key,
      );

      if (publicationMode !== "update" && publicationMode !== "resume") {
        return jsonError(
          "dossier-update-target-requires-existing-mode",
          409,
          "Este Dossiê identifica um artigo publicado e não pode criar automaticamente um segundo artigo.",
        );
      }
    }

    if (publicationMode === "update") {
      if (!sourcePackage) {
        return jsonError(
          "update-requires-source-package",
          409,
          "A atualização automática só é permitida a partir de um Dossiê editorial.",
        );
      }

      if (
        !UUID_PATTERN.test(
          updateArticleId,
        )
        || !existing
        || existing.id
          !== updateArticleId
        || (
          updateTarget
          && updateArticleId !== updateTarget.publishedArticleId
        )
        || existing.status
          !== "published"
        || cleanText(
          existing.matchday_id,
        ) !== matchdayId
      ) {
        return jsonError(
          "update-target-mismatch",
          409,
          "O artigo existente já não corresponde ao alvo confirmado para esta atualização.",
        );
      }

      if (!imageUrl) {
        return jsonError(
          "missing-image-url",
        );
      }

      const result =
        await updateEditorialArticle(
          existing.id,
          {
            label: article.label,
            title: article.title,
            subtitle:
              article.subtitle,
            body: article.body,
            slug:
              existing.slug
              ?? slug,
            image_url: imageUrl,
            image_caption: null,
            author,
            published_at:
              existing.published_at,
            competition_id: null,
            season_id: null,
            matchday_id:
              matchdayId,
          },
          {
            action: "publish",
            initialPlacement: "none",
          },
        );

      try {
        await ensurePublishedArticleInLatest(
          matchdayId,
          existing.id,
          { deferGlobalSync: true },
        );
      } catch (error) {
        return NextResponse.json({
          ok: false,
          error:
            "latest-placement-failed",
          detail: safeDetail(
            error instanceof Error
              ? error.message
              : "Falhou a manutenção do artigo atualizado em Últimas.",
          ),
          published: true,
          articleId: existing.id,
          slug: result.slug,
        }, { status: 502 });
      }

      const usageError =
        await markSourcePackageUsed(
          sourcePackage,
          article.index,
          existing.id,
          result.slug,
        );

      if (usageError) {
        return NextResponse.json({
          ok: false,
          error:
            "source-usage-mark-failed",
          detail:
            `O artigo foi atualizado em Últimas, mas as fontes não ficaram marcadas como utilizadas (${usageError}).`,
          published: true,
          latest: true,
          articleId: existing.id,
          slug: result.slug,
        }, { status: 502 });
      }

      return NextResponse.json({
        ok: true,
        updated: true,
        articleId:
          existing.id,
        slug: result.slug,
      });
    }

    if (existing) {
      if (!existingArticleMatches(
        existing,
        article,
        author,
        matchdayId,
        publishedAt,
        updateTarget?.publishedSlug,
      )) {
        return jsonError(
          "slug-collision",
          409,
          `O slug ${slug} já pertence a um artigo incompatível com esta publicação.`,
        );
      }

      try {
        await ensurePublishedArticleInLatest(
          matchdayId,
          existing.id,
          { deferGlobalSync: true },
        );
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

      const usageError = await markSourcePackageUsed(
        sourcePackage,
        article.index,
        existing.id,
        slug,
      );
      if (usageError) {
        return NextResponse.json({
          ok: false,
          error: "source-usage-mark-failed",
          detail: `O artigo está publicado em Últimas, mas as fontes não ficaram marcadas como utilizadas (${usageError}).`,
          published: true,
          latest: true,
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
      initialPlacement: "none",
    });

    try {
      await ensurePublishedArticleInLatest(
        matchdayId,
        result.articleId,
        { deferGlobalSync: true },
      );
    } catch (error) {
      return NextResponse.json({
        ok: false,
        error: "latest-placement-failed",
        detail: safeDetail(
          error instanceof Error
            ? error.message
            : "O artigo foi publicado, mas falhou a entrada em Últimas.",
        ),
        published: true,
        articleId: result.articleId,
        slug: result.slug,
      }, { status: 502 });
    }

    const usageError = await markSourcePackageUsed(
      sourcePackage,
      article.index,
      result.articleId,
      result.slug,
    );
    if (usageError) {
      return NextResponse.json({
        ok: false,
        error: "source-usage-mark-failed",
        detail: `O artigo está publicado em Últimas, mas as fontes não ficaram marcadas como utilizadas (${usageError}).`,
        published: true,
        latest: true,
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

    const message = error instanceof Error
      ? error.message
      : "A publicação do artigo falhou.";
    if (message.startsWith("source-package-read-failed:")) {
      return jsonError(
        "source-package-read-failed",
        409,
        "Não foi possível validar o Dossiê desta publicação.",
      );
    }
    if (message.startsWith("update-target-")) {
      return jsonError(
        "invalid-dossier-update-target",
        409,
        "O artigo publicado identificado pelo Dossiê deixou de ser um alvo válido nesta Jornada.",
      );
    }

    return jsonError(
      "batch-publication-failed",
      500,
      message,
    );
  }
}


async function reconcileSourcePackageTimes(payload: BatchPublicationPayload) {
  const sourcePackage = parseSourcePackage(payload.sourcePackage);
  if (!sourcePackage) return jsonError("invalid-source-package");

  try {
    const sourceTimes = await sourcePublishedAtByArticle(sourcePackage);
    const groupedEntries = new Map<number, typeof sourceTimes.package.manifest.entries>();
    for (const entry of sourceTimes.package.manifest.entries) {
      if (entry.status !== "prepared") continue;
      const group = groupedEntries.get(entry.articlePosition) ?? [];
      groupedEntries.set(entry.articlePosition, [...group, entry]);
    }

    const reconciled: Array<Readonly<{
      articlePosition: number;
      articleId: string;
      publishedAt: string;
    }>> = [];

    const affectedMatchdayIds =
      new Set<string>();

    for (const [articlePosition, entries] of [...groupedEntries.entries()].sort((a, b) => a[0] - b[0])) {
      const articleIds = [...new Set(entries.map((entry) => cleanText(entry.publishedArticleId)).filter(Boolean))];
      const slugs = [...new Set(entries.map((entry) => cleanText(entry.publishedSlug)).filter(Boolean))];
      if (articleIds.length === 0 && slugs.length === 0) continue;
      if (articleIds.length !== 1 || slugs.length !== 1 || !UUID_PATTERN.test(articleIds[0])) {
        throw new Error(`usage-conflict:${articlePosition}`);
      }

      const publishedAt = sourceTimes.publishedAtByArticle.get(articlePosition);
      if (!publishedAt) {
        throw new Error(`missing-source-published-at:${String(articlePosition).padStart(2, "0")}`);
      }

      const rows = await fetchSupabaseAdminTable<ReconcileArticleRow>(
        "editorial_articles"
        + "?select=id,slug,label,title,subtitle,body,image_url,image_caption,author,published_at,matchday_id,status"
        + `&id=eq.${encodeURIComponent(articleIds[0])}&limit=1`,
      );
      const article = rows[0];
      if (
        !article
        || article.status !== "published"
        || cleanText(article.slug) !== slugs[0]
        || !article.matchday_id
      ) {
        throw new Error(`published-article-mismatch:${articlePosition}`);
      }

      if (parsePublishedAt(article.published_at) !== publishedAt) {
        await updateEditorialArticle(article.id, {
          label: article.label,
          title: article.title,
          subtitle: article.subtitle,
          body: article.body,
          slug: article.slug,
          image_url: article.image_url,
          image_caption: article.image_caption,
          author: article.author,
          published_at: publishedAt,
          competition_id: null,
          season_id: null,
          matchday_id: article.matchday_id,
        }, {
          action: "save",
          initialPlacement: "none",
        });
      }

      await ensurePublishedArticleInLatest(
        article.matchday_id,
        article.id,
        { deferGlobalSync: true },
      );

      affectedMatchdayIds.add(
        article.matchday_id,
      );

      reconciled.push({
        articlePosition,
        articleId: article.id,
        publishedAt,
      });
    }

    for (
      const affectedMatchdayId
      of affectedMatchdayIds
    ) {
      await finalizePublishedArticlesInLatestBatch(
        affectedMatchdayId,
      );
    }

    return NextResponse.json({
      ok: true,
      items: reconciled,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "source-time-reconcile-failed";
    if (message.startsWith("missing-source-published-at:")) {
      const [, key] = message.split(":");
      return jsonError(
        "missing-source-published-at",
        409,
        `O artigo ${key} não tem uma hora de fonte utilizável no pacote editorial.`,
      );
    }
    if (message.startsWith("source-package-read-failed:")) {
      return jsonError("source-package-read-failed", 409, "Não foi possível ler o pacote editorial.");
    }
    if (message.startsWith("usage-conflict:") || message.startsWith("published-article-mismatch:")) {
      return jsonError("source-time-reconcile-conflict", 409, message);
    }
    if (error instanceof EditorialArticleServiceError) {
      return jsonError(error.code, 400, error.message);
    }
    if (error instanceof EditorialMatchdayNewsFlowError) {
      return jsonError(error.code, 502, error.message);
    }
    return jsonError("source-time-reconcile-failed", 500, message);
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

  if (action === "finalize_batch") {
    const matchdayId =
      cleanText(payload.matchdayId);

    if (
      !UUID_PATTERN.test(
        matchdayId,
      )
    ) {
      return jsonError(
        "invalid-matchday",
      );
    }

    try {
      await finalizePublishedArticlesInLatestBatch(
        matchdayId,
      );

      return NextResponse.json({
        ok: true,
        finalized: true,
      });
    } catch (error) {
      return jsonError(
        "batch-finalization-failed",
        500,
        error instanceof Error
          ? error.message
          : "Falhou a reconciliação editorial final do lote.",
      );
    }
  }
  if (action === "reconcile_source_times") {
    return reconcileSourcePackageTimes(payload);
  }

  return jsonError("invalid-action");
}
