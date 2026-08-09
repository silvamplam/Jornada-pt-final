import {
  editorialArticleCanonicalMissingLabel,
  missingEditorialArticleCanonicalFields,
} from "@/lib/editorial-article-canonical";
import {
  EDITORIAL_NEWS_FLOW_SLOT_TYPES,
  EDITORIAL_ZONE_PRESENTATION_PROFILES,
  isEditorialNewsFlowSlotType,
  projectEditorialArticleToZone,
  type EditorialArticleZoneSource,
  type EditorialNewsFlowSlotType,
} from "@/lib/editorial-zone-presentation";
import { syncCurrentPublishedReferenceCompositionNewsFlow } from "@/lib/editorial-current-reference-composition-sync";
import { fetchSupabaseAdminTable, writeSupabaseAdmin } from "@/lib/supabase";

const LATEST_NEWS_MAX_ITEMS = 20;
const HIGHLIGHT_SORT_ORDERS = [1, 2, 3] as const;

export class EditorialMatchdayNewsFlowError extends Error {
  constructor(public code: string, message = code) {
    super(message);
  }
}

type NewsFlowArticle = EditorialArticleZoneSource & {
  body: string | null;
  matchday_id: string | null;
  status: string | null;
  created_at?: string | null;
};

type LatestNewsRow = {
  id: string;
  article_id: string | null;
  time_label?: string | null;
  title?: string | null;
  subtitle?: string | null;
  image_url?: string | null;
  link_url: string | null;
  sort_order: number;
  status: string | null;
  created_at: string | null;
};

type ArticleOrderRow = {
  id: string;
  slug: string | null;
  published_at: string | null;
  created_at: string | null;
};

type EditorialRow = {
  id: string;
  title?: string | null;
  summary?: string | null;
  image_url?: string | null;
  headline_link_url?: string | null;
  complementary_label?: string | null;
  complementary_title?: string | null;
  complementary_text?: string | null;
  complementary_image_url?: string | null;
  complementary_link_url?: string | null;
  complementary_status?: string | null;
  status?: string | null;
};

type HighlightRow = {
  id: string;
  sort_order: number;
  label: string | null;
  title: string | null;
  subtitle: string | null;
  image_url: string | null;
  link_url: string | null;
  status: string | null;
};

type HorizontalNewsRow = {
  id: string;
  sort_order: number;
  label: string | null;
  title: string | null;
  subtitle: string | null;
  image_url: string | null;
  link_url: string | null;
  status: string | null;
};

export type EditorialInitialPlacement = "none" | EditorialNewsFlowSlotType;
export type EditorialDisplacedTargetSlotType = EditorialNewsFlowSlotType | "unplaced";

export type EditorialMatchdayNewsTransferInput = {
  matchdayId: string;
  articleId: string;
  sourceSlotType: EditorialNewsFlowSlotType;
  sourceId: string;
  targetSlotType: EditorialNewsFlowSlotType;
  targetId?: string | null;
  displacedTargetSlotType?: EditorialDisplacedTargetSlotType | null;
  displacedTargetOrder?: number | null;
};

type PlacedProjection = {
  slotType: Exclude<EditorialNewsFlowSlotType, "editorial_line_item">;
  sourceId: string;
};

type ZoneOccupant = {
  label: string | null;
  title: string | null;
  subtitle: string | null;
  imageUrl: string | null;
  linkUrl: string | null;
};

type ZoneProjection = {
  label: string | null;
  title: string | null;
  subtitle: string | null;
  imageUrl: string | null;
  linkUrl: string | null;
};

function cleanText(value?: string | null) {
  const clean = value?.trim();
  return clean ? clean : null;
}

function publicArticlePath(slug?: string | null) {
  const cleanSlug = cleanText(slug);
  return cleanSlug ? `/noticias/${encodeURIComponent(cleanSlug)}` : null;
}

function hasContent(...values: Array<string | null | undefined>) {
  return values.some((value) => Boolean(cleanText(value)));
}

function dateValue(value?: string | null) {
  const clean = cleanText(value);
  if (!clean) return 0;
  const date = new Date(clean);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

async function readPublishedCompleteArticle(articleId: string, matchdayId: string): Promise<NewsFlowArticle> {
  const rows = await fetchSupabaseAdminTable<NewsFlowArticle>(
    `editorial_articles?select=id,slug,label,title,subtitle,body,image_url,author,published_at,created_at,matchday_id,status&id=eq.${encodeURIComponent(
      articleId,
    )}&matchday_id=eq.${encodeURIComponent(matchdayId)}&status=eq.published&limit=1`,
  );
  const article = rows[0] ?? null;

  if (!article) {
    throw new EditorialMatchdayNewsFlowError(
      "news-flow-article-invalid",
      "O artigo publicado já não pertence a esta jornada.",
    );
  }

  const missing = missingEditorialArticleCanonicalFields(article);
  if (missing.length > 0) {
    throw new EditorialMatchdayNewsFlowError(
      "news-flow-article-incomplete",
      `Completa primeiro o artigo: ${editorialArticleCanonicalMissingLabel(missing)}.`,
    );
  }

  if (!publicArticlePath(article.slug)) {
    throw new EditorialMatchdayNewsFlowError(
      "news-flow-article-incomplete",
      "O artigo precisa de endereço público antes de entrar no circuito das zonas.",
    );
  }

  return article;
}

async function setLatestNewsMode(matchdayId: string) {
  await writeSupabaseAdmin("matchday_editorials?on_conflict=matchday_id", {
    method: "POST",
    headers: {
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify({
      matchday_id: matchdayId,
      latest_zone_mode: "latest_news",
      updated_at: new Date().toISOString(),
    }),
  });
}

async function readLatestNewsRows(matchdayId: string) {
  return fetchSupabaseAdminTable<LatestNewsRow>(
    `matchday_latest_news?select=id,article_id,time_label,title,subtitle,image_url,link_url,sort_order,status,created_at&matchday_id=eq.${encodeURIComponent(
      matchdayId,
    )}&order=sort_order.asc&limit=${LATEST_NEWS_MAX_ITEMS}`,
  );
}

export async function normalizeLatestNewsOrder(matchdayId: string) {
  const [rows, articles] = await Promise.all([
    readLatestNewsRows(matchdayId),
    fetchSupabaseAdminTable<ArticleOrderRow>(
      `editorial_articles?select=id,slug,published_at,created_at&matchday_id=eq.${encodeURIComponent(
        matchdayId,
      )}&status=eq.published&order=published_at.desc.nullslast,created_at.desc.nullslast`,
    ).catch(() => []),
  ]);

  if (rows.length < 2) return;

  const orderByArticleId = new Map(
    articles.map((article) => [article.id, dateValue(article.published_at) || dateValue(article.created_at)] as const),
  );
  const orderByLink = new Map(
    articles
      .map((article) => [publicArticlePath(article.slug), dateValue(article.published_at) || dateValue(article.created_at)] as const)
      .filter((entry): entry is [string, number] => Boolean(entry[0])),
  );

  const ordered = [...rows].sort((left, right) => {
    const leftTime = (left.article_id ? orderByArticleId.get(left.article_id) : undefined)
      ?? (left.link_url ? orderByLink.get(left.link_url) : undefined)
      ?? 0;
    const rightTime = (right.article_id ? orderByArticleId.get(right.article_id) : undefined)
      ?? (right.link_url ? orderByLink.get(right.link_url) : undefined)
      ?? 0;

    if (leftTime !== rightTime) return rightTime - leftTime;
    return left.sort_order - right.sort_order;
  });

  const now = new Date().toISOString();
  await Promise.all(
    ordered.map((row, index) => {
      const nextOrder = index + 1;
      if (row.sort_order === nextOrder) return Promise.resolve();
      return writeSupabaseAdmin(`matchday_latest_news?id=eq.${encodeURIComponent(row.id)}`, {
        method: "PATCH",
        body: JSON.stringify({ sort_order: nextOrder, updated_at: now }),
      });
    }),
  );
}

export async function ensurePublishedArticleInLatest(matchdayId: string, articleId: string) {
  const article = await readPublishedCompleteArticle(articleId, matchdayId);
  const projection = projectEditorialArticleToZone(article, "editorial_line_item");
  const articlePath = projection.linkUrl;
  const rows = await readLatestNewsRows(matchdayId);
  const existing = rows.find(
    (row) => row.article_id === articleId || Boolean(articlePath && cleanText(row.link_url) === articlePath),
  );
  const now = new Date().toISOString();

  await setLatestNewsMode(matchdayId);

  const payload = {
    matchday_id: matchdayId,
    time_label: projection.label,
    time_label_color: null,
    title: projection.title,
    subtitle: projection.subtitle,
    image_url: projection.imageUrl,
    link_url: projection.linkUrl,
    // matchday_latest_news.article_id still references the legacy public.articles table.
    // Canonical editorial_articles are linked by /noticias/<slug>; the admin resolves
    // that link back to the canonical article whenever a transfer is requested.
    article_id: null,
    status: "published",
    updated_at: now,
  };

  if (existing) {
    await writeSupabaseAdmin(`matchday_latest_news?id=eq.${encodeURIComponent(existing.id)}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
  } else {
    if (rows.length >= LATEST_NEWS_MAX_ITEMS) {
      throw new EditorialMatchdayNewsFlowError(
        "news-flow-latest-full",
        `Últimas atingiu o limite técnico atual de ${LATEST_NEWS_MAX_ITEMS} notícias. Transfere ou retira uma antes de publicar outra.`,
      );
    }

    await writeSupabaseAdmin("matchday_latest_news", {
      method: "POST",
      body: JSON.stringify({
        ...payload,
        sort_order: rows.length + 1,
        created_at: now,
      }),
    });
  }

  await normalizeLatestNewsOrder(matchdayId);
  await syncCurrentPublishedReferenceCompositionNewsFlow(matchdayId);
}

export async function placePublishedArticleInitially(
  matchdayId: string,
  articleId: string,
  targetSlotType: EditorialInitialPlacement,
) {
  if (targetSlotType === "none") return;
  if (!isEditorialNewsFlowSlotType(targetSlotType)) {
    throw new EditorialMatchdayNewsFlowError("news-flow-zone-invalid", "A colocação editorial escolhida não é válida.");
  }

  if (targetSlotType === "editorial_line_item") {
    await ensurePublishedArticleInLatest(matchdayId, articleId);
    return;
  }

  const article = await readPublishedCompleteArticle(articleId, matchdayId);
  await writeArticleToTargetZone(matchdayId, articleId, article, targetSlotType, null);
  await syncCurrentPublishedReferenceCompositionNewsFlow(matchdayId);
}

async function sourceContainsArticle(
  matchdayId: string,
  articleId: string,
  sourceSlotType: EditorialNewsFlowSlotType,
  sourceId: string,
  articlePath: string,
) {
  if (sourceSlotType === "headline" || sourceSlotType === "complement") {
    const rows = await fetchSupabaseAdminTable<EditorialRow>(
      `matchday_editorials?select=id,headline_link_url,complementary_link_url&id=eq.${encodeURIComponent(
        sourceId,
      )}&matchday_id=eq.${encodeURIComponent(matchdayId)}&limit=1`,
    );
    const row = rows[0];
    if (!row) return false;
    return sourceSlotType === "headline"
      ? cleanText(row.headline_link_url) === articlePath
      : cleanText(row.complementary_link_url) === articlePath;
  }

  if (sourceSlotType === "editorial_line_item") {
    const rows = await fetchSupabaseAdminTable<LatestNewsRow>(
      `matchday_latest_news?select=id,article_id,link_url,sort_order,status,created_at&id=eq.${encodeURIComponent(
        sourceId,
      )}&matchday_id=eq.${encodeURIComponent(matchdayId)}&limit=1`,
    );
    const row = rows[0];
    return Boolean(row && (row.article_id === articleId || cleanText(row.link_url) === articlePath));
  }

  if (sourceSlotType === "highlight") {
    const rows = await fetchSupabaseAdminTable<Pick<HighlightRow, "id" | "link_url">>(
      `matchday_highlights?select=id,link_url&id=eq.${encodeURIComponent(sourceId)}&matchday_id=eq.${encodeURIComponent(
        matchdayId,
      )}&limit=1`,
    );
    return cleanText(rows[0]?.link_url) === articlePath;
  }

  const rows = await fetchSupabaseAdminTable<Pick<HorizontalNewsRow, "id" | "link_url">>(
    `matchday_horizontal_news?select=id,link_url&id=eq.${encodeURIComponent(sourceId)}&matchday_id=eq.${encodeURIComponent(
      matchdayId,
    )}&limit=1`,
  );
  return cleanText(rows[0]?.link_url) === articlePath;
}

function slugFromPublicArticleLink(linkUrl?: string | null) {
  const link = cleanText(linkUrl);
  if (!link || !link.startsWith("/noticias/")) return null;
  const encodedSlug = link.slice("/noticias/".length).split(/[?#]/, 1)[0]?.split("/", 1)[0] ?? "";
  if (!encodedSlug) return null;
  try {
    return decodeURIComponent(encodedSlug);
  } catch {
    return null;
  }
}

async function readPublishedCompleteArticleByLink(matchdayId: string, linkUrl?: string | null) {
  const slug = slugFromPublicArticleLink(linkUrl);
  if (!slug) return null;

  const rows = await fetchSupabaseAdminTable<NewsFlowArticle>(
    `editorial_articles?select=id,slug,label,title,subtitle,body,image_url,author,published_at,created_at,matchday_id,status&slug=eq.${encodeURIComponent(
      slug,
    )}&matchday_id=eq.${encodeURIComponent(matchdayId)}&status=eq.published&limit=1`,
  ).catch(() => []);
  const article = rows[0] ?? null;
  if (!article || missingEditorialArticleCanonicalFields(article).length > 0 || !publicArticlePath(article.slug)) {
    return null;
  }
  return article;
}

function fallbackProjectionForZone(occupant: ZoneOccupant, slotType: EditorialNewsFlowSlotType): ZoneProjection {
  if (slotType === "editorial_line_item") {
    return {
      label: occupant.label,
      title: occupant.title,
      subtitle: null,
      imageUrl: null,
      linkUrl: occupant.linkUrl,
    };
  }

  if (slotType === "headline") {
    return {
      label: null,
      title: occupant.title,
      subtitle: occupant.subtitle,
      imageUrl: occupant.imageUrl,
      linkUrl: occupant.linkUrl,
    };
  }

  return { ...occupant };
}

async function readOccupiedTargetZone(
  matchdayId: string,
  targetSlotType: EditorialNewsFlowSlotType,
  targetId: string,
): Promise<ZoneOccupant> {
  if (targetSlotType === "headline") {
    const rows = await fetchSupabaseAdminTable<EditorialRow>(
      `matchday_editorials?select=id,title,summary,image_url,headline_link_url,status&id=eq.${encodeURIComponent(
        targetId,
      )}&matchday_id=eq.${encodeURIComponent(matchdayId)}&limit=1`,
    );
    const row = rows[0] ?? null;
    if (!row || !hasContent(row.title, row.summary, row.image_url, row.headline_link_url)) {
      throw new EditorialMatchdayNewsFlowError(
        "news-flow-target-changed",
        "A Manchete mudou desde que abriste a página. Atualiza antes de trocar.",
      );
    }
    return {
      label: null,
      title: cleanText(row.title),
      subtitle: cleanText(row.summary),
      imageUrl: cleanText(row.image_url),
      linkUrl: cleanText(row.headline_link_url),
    };
  }

  if (targetSlotType === "complement") {
    const rows = await fetchSupabaseAdminTable<EditorialRow>(
      `matchday_editorials?select=id,complementary_label,complementary_title,complementary_text,complementary_image_url,complementary_link_url,complementary_status&id=eq.${encodeURIComponent(
        targetId,
      )}&matchday_id=eq.${encodeURIComponent(matchdayId)}&limit=1`,
    );
    const row = rows[0] ?? null;
    if (!row || !hasContent(row.complementary_label, row.complementary_title, row.complementary_text, row.complementary_image_url, row.complementary_link_url)) {
      throw new EditorialMatchdayNewsFlowError(
        "news-flow-target-changed",
        "A notícia ao lado do vídeo mudou desde que abriste a página. Atualiza antes de trocar.",
      );
    }
    return {
      label: cleanText(row.complementary_label),
      title: cleanText(row.complementary_title),
      subtitle: cleanText(row.complementary_text),
      imageUrl: cleanText(row.complementary_image_url),
      linkUrl: cleanText(row.complementary_link_url),
    };
  }

  if (targetSlotType === "editorial_line_item") {
    const rows = await fetchSupabaseAdminTable<LatestNewsRow>(
      `matchday_latest_news?select=id,article_id,time_label,title,subtitle,image_url,link_url,sort_order,status,created_at&id=eq.${encodeURIComponent(
        targetId,
      )}&matchday_id=eq.${encodeURIComponent(matchdayId)}&limit=1`,
    );
    const row = rows[0] ?? null;
    if (!row || !hasContent(row.time_label, row.title, row.subtitle, row.image_url, row.link_url)) {
      throw new EditorialMatchdayNewsFlowError(
        "news-flow-target-changed",
        "A notícia escolhida em Últimas mudou. Atualiza antes de trocar.",
      );
    }
    return {
      label: cleanText(row.time_label),
      title: cleanText(row.title),
      subtitle: cleanText(row.subtitle),
      imageUrl: cleanText(row.image_url),
      linkUrl: cleanText(row.link_url),
    };
  }

  if (targetSlotType === "highlight") {
    const rows = await fetchSupabaseAdminTable<HighlightRow>(
      `matchday_highlights?select=id,sort_order,label,title,subtitle,image_url,link_url,status&id=eq.${encodeURIComponent(
        targetId,
      )}&matchday_id=eq.${encodeURIComponent(matchdayId)}&limit=1`,
    );
    const row = rows[0] ?? null;
    if (!row || !hasContent(row.label, row.title, row.subtitle, row.image_url, row.link_url)) {
      throw new EditorialMatchdayNewsFlowError(
        "news-flow-target-changed",
        "A notícia escolhida nos Destaques mudou. Atualiza antes de trocar.",
      );
    }
    return {
      label: cleanText(row.label),
      title: cleanText(row.title),
      subtitle: cleanText(row.subtitle),
      imageUrl: cleanText(row.image_url),
      linkUrl: cleanText(row.link_url),
    };
  }

  const rows = await fetchSupabaseAdminTable<HorizontalNewsRow>(
    `matchday_horizontal_news?select=id,sort_order,label,title,subtitle,image_url,link_url,status&id=eq.${encodeURIComponent(
      targetId,
    )}&matchday_id=eq.${encodeURIComponent(matchdayId)}&limit=1`,
  );
  const row = rows[0] ?? null;
  if (!row || !hasContent(row.label, row.title, row.subtitle, row.image_url, row.link_url)) {
    throw new EditorialMatchdayNewsFlowError(
      "news-flow-target-changed",
      "A notícia escolhida na Faixa mudou. Atualiza antes de trocar.",
    );
  }
  return {
    label: cleanText(row.label),
    title: cleanText(row.title),
    subtitle: cleanText(row.subtitle),
    imageUrl: cleanText(row.image_url),
    linkUrl: cleanText(row.link_url),
  };
}

async function projectionForDisplacedOccupant(
  matchdayId: string,
  sourceSlotType: EditorialNewsFlowSlotType,
  occupant: ZoneOccupant,
): Promise<ZoneProjection> {
  const canonicalArticle = await readPublishedCompleteArticleByLink(matchdayId, occupant.linkUrl);
  if (canonicalArticle) {
    return projectEditorialArticleToZone(canonicalArticle, sourceSlotType);
  }
  return fallbackProjectionForZone(occupant, sourceSlotType);
}

async function writeProjectionToExistingSourceZone(
  matchdayId: string,
  sourceSlotType: EditorialNewsFlowSlotType,
  sourceId: string,
  projection: ZoneProjection,
) {
  const now = new Date().toISOString();

  if (sourceSlotType === "headline") {
    await writeSupabaseAdmin(`matchday_editorials?id=eq.${encodeURIComponent(sourceId)}&matchday_id=eq.${encodeURIComponent(matchdayId)}`, {
      method: "PATCH",
      body: JSON.stringify({
        title: projection.title,
        summary: projection.subtitle,
        image_url: projection.imageUrl,
        headline_link_url: projection.linkUrl,
        status: "published",
        updated_at: now,
      }),
    });
    return;
  }

  if (sourceSlotType === "complement") {
    await writeSupabaseAdmin(`matchday_editorials?id=eq.${encodeURIComponent(sourceId)}&matchday_id=eq.${encodeURIComponent(matchdayId)}`, {
      method: "PATCH",
      body: JSON.stringify({
        complementary_label: projection.label,
        complementary_title: projection.title,
        complementary_text: projection.subtitle,
        complementary_image_url: projection.imageUrl,
        complementary_link_url: projection.linkUrl,
        complementary_status: "published",
        updated_at: now,
      }),
    });
    return;
  }

  if (sourceSlotType === "editorial_line_item") {
    await setLatestNewsMode(matchdayId);
    await writeSupabaseAdmin(`matchday_latest_news?id=eq.${encodeURIComponent(sourceId)}&matchday_id=eq.${encodeURIComponent(matchdayId)}`, {
      method: "PATCH",
      body: JSON.stringify({
        time_label: projection.label,
        time_label_color: null,
        title: projection.title,
        subtitle: projection.subtitle,
        image_url: projection.imageUrl,
        link_url: projection.linkUrl,
        article_id: null,
        status: "published",
        updated_at: now,
      }),
    });
    await normalizeLatestNewsOrder(matchdayId);
    return;
  }

  const table = sourceSlotType === "highlight" ? "matchday_highlights" : "matchday_horizontal_news";
  await writeSupabaseAdmin(`${table}?id=eq.${encodeURIComponent(sourceId)}&matchday_id=eq.${encodeURIComponent(matchdayId)}`, {
    method: "PATCH",
    body: JSON.stringify({
      label: projection.label,
      label_color: null,
      title: projection.title,
      subtitle: projection.subtitle,
      image_url: projection.imageUrl,
      link_url: projection.linkUrl,
      status: "published",
      updated_at: now,
    }),
  });
}

async function restoreSourceArticleAfterFailedSwap(
  matchdayId: string,
  article: NewsFlowArticle,
  sourceSlotType: EditorialNewsFlowSlotType,
  sourceId: string,
) {
  try {
    await writeProjectionToExistingSourceZone(
      matchdayId,
      sourceSlotType,
      sourceId,
      projectEditorialArticleToZone(article, sourceSlotType),
    );
  } catch {
    // Best-effort compensation. The original target was not changed yet.
  }
}

async function placeProjectionInAvailableZone(
  matchdayId: string,
  slotType: EditorialDisplacedTargetSlotType,
  projection: ZoneProjection,
  targetOrder?: number | null,
): Promise<PlacedProjection | null> {
  if (slotType === "unplaced") return null;
  if (slotType === "editorial_line_item") {
    throw new EditorialMatchdayNewsFlowError(
      "news-flow-latest-new-only",
      "Últimas só recebe novidades escolhidas no momento da publicação.",
    );
  }

  const now = new Date().toISOString();

  if (slotType === "headline") {
    const rows = await fetchSupabaseAdminTable<EditorialRow>(
      `matchday_editorials?select=id,title,summary,image_url,headline_link_url&matchday_id=eq.${encodeURIComponent(matchdayId)}&limit=1`,
    );
    const existing = rows[0] ?? null;
    if (existing && hasContent(existing.title, existing.summary, existing.image_url, existing.headline_link_url)) {
      throw new EditorialMatchdayNewsFlowError(
        "news-flow-displaced-target-full",
        "A zona escolhida para receber a notícia substituída já está ocupada.",
      );
    }
    const payload = {
      title: projection.title,
      summary: projection.subtitle,
      image_url: projection.imageUrl,
      headline_link_url: projection.linkUrl,
      status: "published",
      updated_at: now,
    };
    if (existing) {
      await writeSupabaseAdmin(`matchday_editorials?id=eq.${encodeURIComponent(existing.id)}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
      return { slotType, sourceId: existing.id };
    }
    await writeSupabaseAdmin("matchday_editorials", {
      method: "POST",
      body: JSON.stringify({ matchday_id: matchdayId, ...payload }),
    });
    const inserted = await fetchSupabaseAdminTable<Pick<EditorialRow, "id">>(
      `matchday_editorials?select=id&matchday_id=eq.${encodeURIComponent(matchdayId)}&limit=1`,
    );
    if (!inserted[0]?.id) throw new EditorialMatchdayNewsFlowError("news-flow-placement-failed");
    return { slotType, sourceId: inserted[0].id };
  }

  if (slotType === "complement") {
    const rows = await fetchSupabaseAdminTable<EditorialRow>(
      `matchday_editorials?select=id,complementary_label,complementary_title,complementary_text,complementary_image_url,complementary_link_url&matchday_id=eq.${encodeURIComponent(matchdayId)}&limit=1`,
    );
    const existing = rows[0] ?? null;
    if (
      existing
      && hasContent(
        existing.complementary_label,
        existing.complementary_title,
        existing.complementary_text,
        existing.complementary_image_url,
        existing.complementary_link_url,
      )
    ) {
      throw new EditorialMatchdayNewsFlowError(
        "news-flow-displaced-target-full",
        "A zona escolhida para receber a notícia substituída já está ocupada.",
      );
    }
    const payload = {
      complementary_label: projection.label,
      complementary_title: projection.title,
      complementary_text: projection.subtitle,
      complementary_image_url: projection.imageUrl,
      complementary_link_url: projection.linkUrl,
      complementary_status: "published",
      updated_at: now,
    };
    if (existing) {
      await writeSupabaseAdmin(`matchday_editorials?id=eq.${encodeURIComponent(existing.id)}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
      return { slotType, sourceId: existing.id };
    }
    await writeSupabaseAdmin("matchday_editorials", {
      method: "POST",
      body: JSON.stringify({ matchday_id: matchdayId, ...payload }),
    });
    const inserted = await fetchSupabaseAdminTable<Pick<EditorialRow, "id">>(
      `matchday_editorials?select=id&matchday_id=eq.${encodeURIComponent(matchdayId)}&limit=1`,
    );
    if (!inserted[0]?.id) throw new EditorialMatchdayNewsFlowError("news-flow-placement-failed");
    return { slotType, sourceId: inserted[0].id };
  }

  if (slotType === "highlight") {
    const rows = await fetchSupabaseAdminTable<HighlightRow>(
      `matchday_highlights?select=id,sort_order,label,title,subtitle,image_url,link_url,status&matchday_id=eq.${encodeURIComponent(matchdayId)}&order=sort_order.asc&limit=3`,
    );
    const rowByOrder = new Map(rows.map((row) => [row.sort_order, row] as const));
    const requestedOrder = targetOrder && HIGHLIGHT_SORT_ORDERS.includes(targetOrder as 1 | 2 | 3)
      ? targetOrder
      : null;
    const freeOrder = requestedOrder ?? HIGHLIGHT_SORT_ORDERS.find((order) => {
      const row = rowByOrder.get(order);
      return !row || !hasContent(row.label, row.title, row.subtitle, row.image_url, row.link_url);
    });
    if (!freeOrder) {
      throw new EditorialMatchdayNewsFlowError(
        "news-flow-displaced-target-full",
        "As 3 notícias abaixo da manchete estão ocupadas.",
      );
    }
    const existing = rowByOrder.get(freeOrder) ?? null;
    if (existing && hasContent(existing.label, existing.title, existing.subtitle, existing.image_url, existing.link_url)) {
      throw new EditorialMatchdayNewsFlowError(
        "news-flow-displaced-target-full",
        "A posição escolhida para receber a notícia substituída já está ocupada.",
      );
    }
    const payload = {
      matchday_id: matchdayId,
      label: projection.label,
      label_color: null,
      title: projection.title,
      subtitle: projection.subtitle,
      image_url: projection.imageUrl,
      link_url: projection.linkUrl,
      sort_order: freeOrder,
      status: "published",
      updated_at: now,
    };
    if (existing) {
      await writeSupabaseAdmin(`matchday_highlights?id=eq.${encodeURIComponent(existing.id)}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
      return { slotType, sourceId: existing.id };
    }
    await writeSupabaseAdmin("matchday_highlights", {
      method: "POST",
      body: JSON.stringify({ ...payload, created_at: now }),
    });
    const inserted = await fetchSupabaseAdminTable<Pick<HighlightRow, "id">>(
      `matchday_highlights?select=id&matchday_id=eq.${encodeURIComponent(matchdayId)}&sort_order=eq.${freeOrder}&limit=1`,
    );
    if (!inserted[0]?.id) throw new EditorialMatchdayNewsFlowError("news-flow-placement-failed");
    return { slotType, sourceId: inserted[0].id };
  }

  const rows = await fetchSupabaseAdminTable<HorizontalNewsRow>(
    `matchday_horizontal_news?select=id,sort_order,label,title,subtitle,image_url,link_url,status&matchday_id=eq.${encodeURIComponent(matchdayId)}&order=sort_order.asc`,
  );
  const reusable = rows.find((row) => !hasContent(row.label, row.title, row.subtitle, row.image_url, row.link_url)) ?? null;
  const sortOrder = reusable?.sort_order ?? Math.max(0, ...rows.map((row) => row.sort_order)) + 1;
  const payload = {
    matchday_id: matchdayId,
    label: projection.label,
    label_color: null,
    title: projection.title,
    subtitle: projection.subtitle,
    image_url: projection.imageUrl,
    link_url: projection.linkUrl,
    sort_order: sortOrder,
    status: "published",
    updated_at: now,
  };
  if (reusable) {
    await writeSupabaseAdmin(`matchday_horizontal_news?id=eq.${encodeURIComponent(reusable.id)}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
    return { slotType, sourceId: reusable.id };
  }
  await writeSupabaseAdmin("matchday_horizontal_news", {
    method: "POST",
    body: JSON.stringify({ ...payload, created_at: now }),
  });
  const inserted = await fetchSupabaseAdminTable<Pick<HorizontalNewsRow, "id">>(
    `matchday_horizontal_news?select=id&matchday_id=eq.${encodeURIComponent(matchdayId)}&sort_order=eq.${sortOrder}&limit=1`,
  );
  if (!inserted[0]?.id) throw new EditorialMatchdayNewsFlowError("news-flow-placement-failed");
  return { slotType, sourceId: inserted[0].id };
}

async function writeArticleToTargetZone(
  matchdayId: string,
  articleId: string,
  article: NewsFlowArticle,
  targetSlotType: EditorialNewsFlowSlotType,
  targetId?: string | null,
) {
  const projection = projectEditorialArticleToZone(article, targetSlotType);
  const now = new Date().toISOString();

  if (targetSlotType === "editorial_line_item") {
    if (!targetId) {
      await ensurePublishedArticleInLatest(matchdayId, articleId);
      return;
    }

    const rows = await readLatestNewsRows(matchdayId);
    const target = rows.find((row) => row.id === targetId) ?? null;
    if (!target) {
      throw new EditorialMatchdayNewsFlowError(
        "news-flow-target-changed",
        "A notícia escolhida para trocar em Últimas já mudou. Atualiza a página e tenta novamente.",
      );
    }

    await setLatestNewsMode(matchdayId);
    await writeSupabaseAdmin(`matchday_latest_news?id=eq.${encodeURIComponent(target.id)}&matchday_id=eq.${encodeURIComponent(matchdayId)}`, {
      method: "PATCH",
      body: JSON.stringify({
        time_label: projection.label,
        time_label_color: null,
        title: projection.title,
        subtitle: projection.subtitle,
        image_url: projection.imageUrl,
        link_url: projection.linkUrl,
        article_id: null,
        status: "published",
        updated_at: now,
      }),
    });
    await normalizeLatestNewsOrder(matchdayId);
    return;
  }

  if (targetSlotType === "headline") {
    const rows = await fetchSupabaseAdminTable<EditorialRow>(
      `matchday_editorials?select=id,title,summary,image_url,headline_link_url&matchday_id=eq.${encodeURIComponent(matchdayId)}&limit=1`,
    );
    const existing = rows[0] ?? null;
    const occupied = Boolean(existing && hasContent(existing.title, existing.summary, existing.image_url, existing.headline_link_url));

    if (occupied && targetId !== existing?.id) {
      throw new EditorialMatchdayNewsFlowError(
        "news-flow-target-full",
        "Manchete já está ocupada. Escolhe explicitamente a notícia atual para fazer a troca.",
      );
    }
    if (targetId && (!existing || targetId !== existing.id)) {
      throw new EditorialMatchdayNewsFlowError(
        "news-flow-target-changed",
        "A Manchete mudou desde que abriste a página. Atualiza antes de trocar.",
      );
    }

    const payload = {
      title: projection.title,
      summary: projection.subtitle,
      image_url: projection.imageUrl,
      headline_link_url: projection.linkUrl,
      status: "published",
      updated_at: now,
    };

    if (existing) {
      await writeSupabaseAdmin(`matchday_editorials?id=eq.${encodeURIComponent(existing.id)}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
    } else {
      await writeSupabaseAdmin("matchday_editorials", {
        method: "POST",
        body: JSON.stringify({ matchday_id: matchdayId, ...payload }),
      });
    }
    return;
  }

  if (targetSlotType === "complement") {
    const rows = await fetchSupabaseAdminTable<EditorialRow>(
      `matchday_editorials?select=id,complementary_label,complementary_title,complementary_text,complementary_image_url,complementary_link_url,complementary_status&matchday_id=eq.${encodeURIComponent(
        matchdayId,
      )}&limit=1`,
    );
    const existing = rows[0] ?? null;
    const occupied = Boolean(
      existing
      && hasContent(
        existing.complementary_label,
        existing.complementary_title,
        existing.complementary_text,
        existing.complementary_image_url,
        existing.complementary_link_url,
      )
    );

    if (occupied && targetId !== existing?.id) {
      throw new EditorialMatchdayNewsFlowError(
        "news-flow-target-full",
        "Notícia ao lado do vídeo já está ocupada. Escolhe explicitamente a notícia atual para fazer a troca.",
      );
    }
    if (targetId && (!existing || targetId !== existing.id)) {
      throw new EditorialMatchdayNewsFlowError(
        "news-flow-target-changed",
        "A notícia ao lado do vídeo mudou desde que abriste a página. Atualiza antes de trocar.",
      );
    }

    const payload = {
      complementary_label: projection.label,
      complementary_title: projection.title,
      complementary_text: projection.subtitle,
      complementary_image_url: projection.imageUrl,
      complementary_link_url: projection.linkUrl,
      complementary_status: "published",
      updated_at: now,
    };

    if (existing) {
      await writeSupabaseAdmin(`matchday_editorials?id=eq.${encodeURIComponent(existing.id)}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
    } else {
      await writeSupabaseAdmin("matchday_editorials", {
        method: "POST",
        body: JSON.stringify({ matchday_id: matchdayId, ...payload }),
      });
    }
    return;
  }

  if (targetSlotType === "highlight") {
    const rows = await fetchSupabaseAdminTable<HighlightRow>(
      `matchday_highlights?select=id,sort_order,label,title,subtitle,image_url,link_url,status&matchday_id=eq.${encodeURIComponent(
        matchdayId,
      )}&order=sort_order.asc&limit=3`,
    );
    const rowByOrder = new Map(rows.map((row) => [row.sort_order, row] as const));
    const explicitTarget = targetId ? rows.find((row) => row.id === targetId) ?? null : null;
    if (targetId && !explicitTarget) {
      throw new EditorialMatchdayNewsFlowError(
        "news-flow-target-changed",
        "A notícia escolhida para trocar nos Destaques já mudou. Atualiza a página e tenta novamente.",
      );
    }

    const freeOrder = HIGHLIGHT_SORT_ORDERS.find((order) => {
      const row = rowByOrder.get(order);
      return !row || !hasContent(row.label, row.title, row.subtitle, row.image_url, row.link_url);
    });
    const targetOrder = explicitTarget?.sort_order ?? freeOrder;
    if (!targetOrder) {
      throw new EditorialMatchdayNewsFlowError(
        "news-flow-target-full",
        "3 notícias abaixo da manchete já tem três notícias. Escolhe com qual delas queres trocar.",
      );
    }

    const payload = {
      matchday_id: matchdayId,
      label: projection.label,
      label_color: null,
      title: projection.title,
      subtitle: projection.subtitle,
      image_url: projection.imageUrl,
      link_url: projection.linkUrl,
      sort_order: targetOrder,
      status: "published",
      updated_at: now,
    };
    const existing = explicitTarget ?? rowByOrder.get(targetOrder);
    if (existing) {
      await writeSupabaseAdmin(`matchday_highlights?id=eq.${encodeURIComponent(existing.id)}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
    } else {
      await writeSupabaseAdmin("matchday_highlights", {
        method: "POST",
        body: JSON.stringify({ ...payload, created_at: now }),
      });
    }
    return;
  }

  const rows = await fetchSupabaseAdminTable<HorizontalNewsRow>(
    `matchday_horizontal_news?select=id,sort_order,label,title,subtitle,image_url,link_url,status&matchday_id=eq.${encodeURIComponent(
      matchdayId,
    )}&order=sort_order.asc`,
  );
  const rowByOrder = new Map(rows.map((row) => [row.sort_order, row] as const));
  const explicitTarget = targetId ? rows.find((row) => row.id === targetId) ?? null : null;
  if (targetId && !explicitTarget) {
    throw new EditorialMatchdayNewsFlowError(
      "news-flow-target-changed",
      "A notícia escolhida para trocar na Faixa já mudou. Atualiza a página e tenta novamente.",
    );
  }
  const reusableOrder = rows.find((row) => !hasContent(row.label, row.title, row.subtitle, row.image_url, row.link_url))?.sort_order;
  const targetOrder = explicitTarget?.sort_order ?? reusableOrder ?? Math.max(0, ...rows.map((row) => row.sort_order)) + 1;

  const payload = {
    matchday_id: matchdayId,
    label: projection.label,
    label_color: null,
    title: projection.title,
    subtitle: projection.subtitle,
    image_url: projection.imageUrl,
    link_url: projection.linkUrl,
    sort_order: targetOrder,
    status: "published",
    updated_at: now,
  };
  const existing = explicitTarget ?? rowByOrder.get(targetOrder);
  if (existing) {
    await writeSupabaseAdmin(`matchday_horizontal_news?id=eq.${encodeURIComponent(existing.id)}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
  } else {
    await writeSupabaseAdmin("matchday_horizontal_news", {
      method: "POST",
      body: JSON.stringify({ ...payload, created_at: now }),
    });
  }
}
async function clearArticleFromSourceZone(
  matchdayId: string,
  sourceSlotType: EditorialNewsFlowSlotType,
  sourceId: string,
) {
  const now = new Date().toISOString();

  if (sourceSlotType === "headline") {
    await writeSupabaseAdmin(`matchday_editorials?id=eq.${encodeURIComponent(sourceId)}&matchday_id=eq.${encodeURIComponent(matchdayId)}`, {
      method: "PATCH",
      body: JSON.stringify({
        title: null,
        summary: null,
        image_url: null,
        headline_link_url: null,
        status: "draft",
        updated_at: now,
      }),
    });
    return;
  }

  if (sourceSlotType === "complement") {
    await writeSupabaseAdmin(`matchday_editorials?id=eq.${encodeURIComponent(sourceId)}&matchday_id=eq.${encodeURIComponent(matchdayId)}`, {
      method: "PATCH",
      body: JSON.stringify({
        complementary_label: null,
        complementary_title: null,
        complementary_text: null,
        complementary_image_url: null,
        complementary_link_url: null,
        complementary_status: "draft",
        updated_at: now,
      }),
    });
    return;
  }

  const table = sourceSlotType === "editorial_line_item"
    ? "matchday_latest_news"
    : sourceSlotType === "highlight"
      ? "matchday_highlights"
      : "matchday_horizontal_news";
  await writeSupabaseAdmin(
    `${table}?id=eq.${encodeURIComponent(sourceId)}&matchday_id=eq.${encodeURIComponent(matchdayId)}`,
    { method: "DELETE" },
  );

  if (sourceSlotType === "editorial_line_item") {
    await normalizeLatestNewsOrder(matchdayId);
  }
}

export async function transferPublishedArticleBetweenMatchdayZones(input: EditorialMatchdayNewsTransferInput) {
  if (!isEditorialNewsFlowSlotType(input.sourceSlotType) || !isEditorialNewsFlowSlotType(input.targetSlotType)) {
    throw new EditorialMatchdayNewsFlowError(
      "news-flow-zone-invalid",
      "Contexto e Vídeo não pertencem ao circuito normal de transferência de notícias.",
    );
  }
  if (input.sourceSlotType === input.targetSlotType) {
    throw new EditorialMatchdayNewsFlowError("news-flow-same-zone", "Escolhe uma zona de destino diferente.");
  }
  if (input.targetSlotType === "editorial_line_item") {
    throw new EditorialMatchdayNewsFlowError(
      "news-flow-latest-new-only",
      "Últimas só recebe novidades escolhidas no momento da publicação.",
    );
  }

  const article = await readPublishedCompleteArticle(input.articleId, input.matchdayId);
  const articlePath = publicArticlePath(article.slug);
  if (!articlePath) {
    throw new EditorialMatchdayNewsFlowError("news-flow-article-incomplete");
  }

  if (!(await sourceContainsArticle(input.matchdayId, input.articleId, input.sourceSlotType, input.sourceId, articlePath))) {
    throw new EditorialMatchdayNewsFlowError(
      "news-flow-source-changed",
      "A notícia desta zona já mudou. Atualiza a página antes de voltar a transferir.",
    );
  }

  if (input.sourceSlotType === "editorial_line_item") {
    let displacedPlacement: PlacedProjection | null = null;

    if (input.targetId) {
      const displacedOccupant = await readOccupiedTargetZone(input.matchdayId, input.targetSlotType, input.targetId);
      const displacedTargetSlotType = input.displacedTargetSlotType ?? null;
      if (!displacedTargetSlotType) {
        throw new EditorialMatchdayNewsFlowError(
          "news-flow-displaced-target-required",
          "Escolhe para onde deve ir a notícia que será substituída.",
        );
      }

      if (displacedTargetSlotType !== "unplaced") {
        const displacedProjection = await projectionForDisplacedOccupant(
          input.matchdayId,
          displacedTargetSlotType,
          displacedOccupant,
        );
        displacedPlacement = await placeProjectionInAvailableZone(
          input.matchdayId,
          displacedTargetSlotType,
          displacedProjection,
          input.displacedTargetOrder,
        );
      }

      try {
        await writeArticleToTargetZone(input.matchdayId, input.articleId, article, input.targetSlotType, input.targetId);
      } catch (error) {
        if (displacedPlacement) {
          await clearArticleFromSourceZone(
            input.matchdayId,
            displacedPlacement.slotType,
            displacedPlacement.sourceId,
          ).catch(() => undefined);
        }
        throw error;
      }
    } else {
      await writeArticleToTargetZone(input.matchdayId, input.articleId, article, input.targetSlotType, null);
    }

    await clearArticleFromSourceZone(input.matchdayId, input.sourceSlotType, input.sourceId);
    await normalizeLatestNewsOrder(input.matchdayId);
    await syncCurrentPublishedReferenceCompositionNewsFlow(input.matchdayId);

    return {
      articleId: input.articleId,
      from: input.sourceSlotType,
      to: input.targetSlotType,
      targetName: EDITORIAL_ZONE_PRESENTATION_PROFILES[input.targetSlotType].publicName,
    };
  }

  if (input.targetId) {
    const displacedOccupant = await readOccupiedTargetZone(input.matchdayId, input.targetSlotType, input.targetId);
    const displacedProjection = await projectionForDisplacedOccupant(
      input.matchdayId,
      input.sourceSlotType,
      displacedOccupant,
    );

    // Entre zonas hierárquicas mantém-se a troca bidirecional já validada.
    await writeProjectionToExistingSourceZone(
      input.matchdayId,
      input.sourceSlotType,
      input.sourceId,
      displacedProjection,
    );
    try {
      await writeArticleToTargetZone(input.matchdayId, input.articleId, article, input.targetSlotType, input.targetId);
    } catch (error) {
      await restoreSourceArticleAfterFailedSwap(input.matchdayId, article, input.sourceSlotType, input.sourceId);
      throw error;
    }
  } else {
    await writeArticleToTargetZone(input.matchdayId, input.articleId, article, input.targetSlotType, null);
    await clearArticleFromSourceZone(input.matchdayId, input.sourceSlotType, input.sourceId);
  }
  await syncCurrentPublishedReferenceCompositionNewsFlow(input.matchdayId);

  return {
    articleId: input.articleId,
    from: input.sourceSlotType,
    to: input.targetSlotType,
    targetName: EDITORIAL_ZONE_PRESENTATION_PROFILES[input.targetSlotType].publicName,
  };
}

export function editorialNewsFlowTransferTargets(sourceSlotType: EditorialNewsFlowSlotType) {
  return EDITORIAL_NEWS_FLOW_SLOT_TYPES.filter(
    (slotType) => slotType !== sourceSlotType && slotType !== "editorial_line_item",
  );
}
