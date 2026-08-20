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
import {
  LIVE_MATCHDAY_HIERARCHICAL_TRANSFER_SLOT_TYPES,
  isLiveMatchdayHierarchicalTransferSlotType,
  liveMatchdayHierarchicalLayoutPosition,
  type LiveMatchdayHierarchicalTransferSlotType,
} from "@/lib/editorial-hierarchical-composition";
import { EDITORIAL_CONTEXT_POST_TITLE_MAX_CHARS } from "@/lib/editorial-context-post-title";
import type { MatchdayLiveLayoutItem } from "@/lib/editorial-matchday-live-layout";
import {
  isLatestFourNewsSlotType,
  syncLatestFourNewsProjection,
} from "@/lib/editorial-matchday-latest-four-projection";
import {
  moveEditorialHorizontalNewsItem,
  prioritizeEditorialHorizontalNewsItem,
  type EditorialHorizontalNewsMoveDirection,
} from "@/lib/editorial-horizontal-news";
import { fetchSupabaseAdminTable, writeSupabaseAdmin } from "@/lib/supabase";

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
  side_block_status?: string | null;
  side_block_label?: string | null;
  side_block_title?: string | null;
  side_block_author?: string | null;
  side_block_text?: string | null;
  side_block_image_url?: string | null;
  side_block_link_url?: string | null;
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
export type EditorialMatchdayTransferSlotType =
  | EditorialNewsFlowSlotType
  | "side_block"
  | LiveMatchdayHierarchicalTransferSlotType;
export type EditorialDisplacedTargetSlotType = EditorialMatchdayTransferSlotType | "unplaced";

export function isEditorialMatchdayTransferSlotType(value: unknown): value is EditorialMatchdayTransferSlotType {
  return value === "side_block"
    || (typeof value === "string" && (
      isEditorialNewsFlowSlotType(value)
      || isLiveMatchdayHierarchicalTransferSlotType(value)
    ));
}

export type EditorialMatchdayNewsTransferInput = {
  matchdayId: string;
  articleId: string;
  sourceSlotType: EditorialMatchdayTransferSlotType;
  sourceId: string;
  targetSlotType: EditorialMatchdayTransferSlotType;
  targetId?: string | null;
  displacedTargetSlotType?: EditorialDisplacedTargetSlotType | null;
  displacedTargetOrder?: number | null;
};

type PlacedProjection = {
  slotType: EditorialMatchdayTransferSlotType;
  sourceId: string;
};

type ZoneOccupant = {
  label: string | null;
  title: string | null;
  subtitle: string | null;
  author: string | null;
  imageUrl: string | null;
  linkUrl: string | null;
};

type ZoneProjection = {
  label: string | null;
  title: string | null;
  subtitle: string | null;
  author: string | null;
  imageUrl: string | null;
  linkUrl: string | null;
  articleId: string | null;
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

async function readHorizontalNewsOrderRows(matchdayId: string) {
  return fetchSupabaseAdminTable<Pick<HorizontalNewsRow, "id" | "sort_order">>(
    `matchday_horizontal_news?select=id,sort_order&matchday_id=eq.${encodeURIComponent(matchdayId)}&order=sort_order.asc`,
  );
}

async function persistHorizontalNewsOrder(
  matchdayId: string,
  orderedRows: readonly Pick<HorizontalNewsRow, "id" | "sort_order">[],
) {
  const normalizedRows = orderedRows.filter((row, index, rows) =>
    rows.findIndex((candidate) => candidate.id === row.id) === index
  );
  const alreadyNormalized = normalizedRows.every((row, index) => row.sort_order === index + 1);
  if (alreadyNormalized) return;

  const maxSortOrder = Math.max(0, ...normalizedRows.map((row) => row.sort_order));
  const temporaryStart = maxSortOrder + normalizedRows.length + 1;

  for (let index = 0; index < normalizedRows.length; index += 1) {
    await writeSupabaseAdmin(
      `matchday_horizontal_news?id=eq.${encodeURIComponent(normalizedRows[index].id)}&matchday_id=eq.${encodeURIComponent(matchdayId)}`,
      {
        method: "PATCH",
        body: JSON.stringify({ sort_order: temporaryStart + index }),
      },
    );
  }

  for (let index = 0; index < normalizedRows.length; index += 1) {
    await writeSupabaseAdmin(
      `matchday_horizontal_news?id=eq.${encodeURIComponent(normalizedRows[index].id)}&matchday_id=eq.${encodeURIComponent(matchdayId)}`,
      {
        method: "PATCH",
        body: JSON.stringify({ sort_order: index + 1 }),
      },
    );
  }
}

export async function normalizeMatchdayHorizontalNewsOrder(matchdayId: string) {
  const rows = await readHorizontalNewsOrderRows(matchdayId);
  await persistHorizontalNewsOrder(matchdayId, rows);
}

async function prioritizeMatchdayHorizontalNewsItem(matchdayId: string, itemId: string) {
  const rows = await readHorizontalNewsOrderRows(matchdayId);
  const reordered = prioritizeEditorialHorizontalNewsItem(rows, itemId);
  await persistHorizontalNewsOrder(matchdayId, reordered);
}

export async function moveMatchdayHorizontalNewsItem(
  matchdayId: string,
  itemId: string,
  direction: EditorialHorizontalNewsMoveDirection,
) {
  const rows = await readHorizontalNewsOrderRows(matchdayId);
  if (!rows.some((row) => row.id === itemId)) {
    throw new EditorialMatchdayNewsFlowError(
      "horizontal-news-item-invalid",
      "A notícia escolhida já não pertence à Faixa. Atualiza a página e tenta novamente.",
    );
  }

  const reordered = moveEditorialHorizontalNewsItem(rows, itemId, direction);
  await persistHorizontalNewsOrder(matchdayId, reordered);
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
    )}&order=sort_order.asc`,
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

  if (rows.length < 2) {
    await syncLatestFourNewsProjection(matchdayId);
    return;
  }

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
  await syncLatestFourNewsProjection(matchdayId);
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
  await syncLatestFourNewsProjection(matchdayId);
  await syncCurrentPublishedReferenceCompositionNewsFlow(matchdayId);
}

async function sourceContainsArticle(
  matchdayId: string,
  articleId: string,
  sourceSlotType: EditorialMatchdayTransferSlotType,
  sourceId: string,
  articlePath: string,
) {
  if (isLiveMatchdayHierarchicalTransferSlotType(sourceSlotType)) {
    const row = await readLiveLayoutRow(matchdayId, sourceSlotType);
    if (!row || row.id !== sourceId) return false;
    if (cleanText(row.link_url) === articlePath) return true;
    return row.article_id === articleId;
  }

  if (sourceSlotType === "side_block") {
    const rows = await fetchSupabaseAdminTable<EditorialRow>(
      `matchday_editorials?select=id,side_block_link_url&id=eq.${encodeURIComponent(sourceId)}&matchday_id=eq.${encodeURIComponent(
        matchdayId,
      )}&limit=1`,
    );
    return cleanText(rows[0]?.side_block_link_url) === articlePath;
  }

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

function projectArticleToTransferZone(
  article: NewsFlowArticle,
  slotType: EditorialMatchdayTransferSlotType,
): ZoneProjection {
  if (isLiveMatchdayHierarchicalTransferSlotType(slotType)) {
    return {
      label: cleanText(article.label),
      title: cleanText(article.title),
      subtitle: cleanText(article.subtitle),
      author: cleanText(article.author),
      imageUrl: cleanText(article.image_url),
      linkUrl: publicArticlePath(article.slug),
      articleId: article.id,
    };
  }

  if (slotType === "side_block") {
    return {
      label: cleanText(article.label),
      title: cleanText(article.title),
      subtitle: cleanText(article.subtitle)?.slice(0, EDITORIAL_CONTEXT_POST_TITLE_MAX_CHARS) ?? null,
      author: cleanText(article.author),
      imageUrl: cleanText(article.image_url),
      linkUrl: publicArticlePath(article.slug),
      articleId: article.id,
    };
  }

  const projection = projectEditorialArticleToZone(article, slotType);
  return {
    ...projection,
    author: cleanText(article.author),
    articleId: article.id,
  };
}

function fallbackProjectionForZone(
  occupant: ZoneOccupant,
  slotType: EditorialMatchdayTransferSlotType,
): ZoneProjection {
  if (slotType === "editorial_line_item") {
    return {
      label: occupant.label,
      title: occupant.title,
      subtitle: null,
      author: occupant.author,
      imageUrl: null,
      linkUrl: occupant.linkUrl,
      articleId: null,
    };
  }

  if (slotType === "headline") {
    return {
      label: null,
      title: occupant.title,
      subtitle: occupant.subtitle,
      author: occupant.author,
      imageUrl: occupant.imageUrl,
      linkUrl: occupant.linkUrl,
      articleId: null,
    };
  }

  if (slotType === "side_block") {
    return {
      ...occupant,
      subtitle: occupant.subtitle?.slice(0, EDITORIAL_CONTEXT_POST_TITLE_MAX_CHARS) ?? null,
      articleId: null,
    };
  }

  return { ...occupant, articleId: null };
}

async function readLiveLayoutRow(
  matchdayId: string,
  slotType: LiveMatchdayHierarchicalTransferSlotType,
) {
  const rows = await fetchSupabaseAdminTable<MatchdayLiveLayoutItem>(
    `matchday_live_layout_items?select=id,matchday_id,slot_type,article_id,label,title,subtitle,image_url,link_url,created_at,updated_at&matchday_id=eq.${encodeURIComponent(
      matchdayId,
    )}&slot_type=eq.${encodeURIComponent(slotType)}&limit=1`,
  ).catch(() => []);
  return rows[0] ?? null;
}

function liveLayoutRowOccupant(row: MatchdayLiveLayoutItem): ZoneOccupant {
  return {
    label: cleanText(row.label),
    title: cleanText(row.title),
    subtitle: cleanText(row.subtitle),
    author: null,
    imageUrl: cleanText(row.image_url),
    linkUrl: cleanText(row.link_url),
  };
}

async function writeProjectionToLiveLayoutSlot(
  matchdayId: string,
  slotType: LiveMatchdayHierarchicalTransferSlotType,
  projection: ZoneProjection,
  targetId: string | null,
) {
  const row = await readLiveLayoutRow(matchdayId, slotType);
  const occupied = Boolean(
    row
    && hasContent(
      row.label,
      row.title,
      row.subtitle,
      row.image_url,
      row.link_url,
    )
  );

  if (occupied && targetId !== row?.id) {
    throw new EditorialMatchdayNewsFlowError(
      "news-flow-target-full",
      "A posição escolhida no layout da atualidade já está ocupada. Escolhe explicitamente a notícia atual para a substituir.",
    );
  }
  if (targetId && (!row || targetId !== row.id)) {
    throw new EditorialMatchdayNewsFlowError(
      "news-flow-target-changed",
      "A posição escolhida no layout da atualidade mudou. Atualiza a página e tenta novamente.",
    );
  }

  const now = new Date().toISOString();
  const payload = {
    matchday_id: matchdayId,
    slot_type: slotType,
    article_id: projection.articleId,
    label: projection.label,
    title: projection.title,
    subtitle: projection.subtitle,
    image_url: projection.imageUrl,
    link_url: projection.linkUrl,
    updated_at: now,
  };

  if (row) {
    await writeSupabaseAdmin(
      `matchday_live_layout_items?id=eq.${encodeURIComponent(row.id)}&matchday_id=eq.${encodeURIComponent(matchdayId)}`,
      { method: "PATCH", body: JSON.stringify(payload) },
    );
    return row.id;
  }

  await writeSupabaseAdmin("matchday_live_layout_items", {
    method: "POST",
    body: JSON.stringify({ ...payload, created_at: now }),
  });
  const inserted = await fetchSupabaseAdminTable<Pick<MatchdayLiveLayoutItem, "id">>(
    `matchday_live_layout_items?select=id&matchday_id=eq.${encodeURIComponent(
      matchdayId,
    )}&slot_type=eq.${encodeURIComponent(slotType)}&limit=1`,
  );
  if (!inserted[0]?.id) throw new EditorialMatchdayNewsFlowError("news-flow-placement-failed");
  return inserted[0].id;
}

async function readOccupiedTargetZone(
  matchdayId: string,
  targetSlotType: EditorialMatchdayTransferSlotType,
  targetId: string,
): Promise<ZoneOccupant> {
  if (isLiveMatchdayHierarchicalTransferSlotType(targetSlotType)) {
    const row = await readLiveLayoutRow(matchdayId, targetSlotType);
    if (!row || row.id !== targetId || !hasContent(
      row.label,
      row.title,
      row.subtitle,
      row.image_url,
      row.link_url,
    )) {
      throw new EditorialMatchdayNewsFlowError(
        "news-flow-target-changed",
        "A posição escolhida no layout da atualidade mudou. Atualiza a página e tenta novamente.",
      );
    }
    return liveLayoutRowOccupant(row);
  }

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
        "A Manchete mudou desde que abriste a página. Atualiza antes de transferir.",
      );
    }
    return {
      label: null,
      title: cleanText(row.title),
      subtitle: cleanText(row.summary),
      author: null,
      imageUrl: cleanText(row.image_url),
      linkUrl: cleanText(row.headline_link_url),
    };
  }

  if (targetSlotType === "side_block") {
    const rows = await fetchSupabaseAdminTable<EditorialRow>(
      `matchday_editorials?select=id,side_block_status,side_block_label,side_block_title,side_block_author,side_block_text,side_block_image_url,side_block_link_url&id=eq.${encodeURIComponent(
        targetId,
      )}&matchday_id=eq.${encodeURIComponent(matchdayId)}&limit=1`,
    );
    const row = rows[0] ?? null;
    if (
      !row
      || !hasContent(
        row.side_block_label,
        row.side_block_title,
        row.side_block_author,
        row.side_block_text,
        row.side_block_image_url,
        row.side_block_link_url,
      )
    ) {
      throw new EditorialMatchdayNewsFlowError(
        "news-flow-target-changed",
        "O Contexto mudou desde que abriste a página. Atualiza antes de transferir.",
      );
    }
    return {
      label: cleanText(row.side_block_label),
      title: cleanText(row.side_block_title),
      subtitle: cleanText(row.side_block_text),
      author: cleanText(row.side_block_author),
      imageUrl: cleanText(row.side_block_image_url),
      linkUrl: cleanText(row.side_block_link_url),
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
        "A notícia ao lado do vídeo mudou desde que abriste a página. Atualiza antes de transferir.",
      );
    }
    return {
      label: cleanText(row.complementary_label),
      title: cleanText(row.complementary_title),
      subtitle: cleanText(row.complementary_text),
      author: null,
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
        "A notícia escolhida em Últimas mudou. Atualiza antes de transferir.",
      );
    }
    return {
      label: cleanText(row.time_label),
      title: cleanText(row.title),
      subtitle: cleanText(row.subtitle),
      author: null,
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
        "A notícia escolhida nos Destaques mudou. Atualiza antes de transferir.",
      );
    }
    return {
      label: cleanText(row.label),
      title: cleanText(row.title),
      subtitle: cleanText(row.subtitle),
      author: null,
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
      "A notícia escolhida na Faixa mudou. Atualiza antes de transferir.",
    );
  }
  return {
    label: cleanText(row.label),
    title: cleanText(row.title),
    subtitle: cleanText(row.subtitle),
    author: null,
    imageUrl: cleanText(row.image_url),
    linkUrl: cleanText(row.link_url),
  };
}

async function projectionForDisplacedOccupant(
  matchdayId: string,
  destinationSlotType: EditorialMatchdayTransferSlotType,
  occupant: ZoneOccupant,
): Promise<ZoneProjection> {
  const canonicalArticle = await readPublishedCompleteArticleByLink(matchdayId, occupant.linkUrl);
  if (canonicalArticle) {
    return projectArticleToTransferZone(canonicalArticle, destinationSlotType);
  }
  return fallbackProjectionForZone(occupant, destinationSlotType);
}

async function writeProjectionToExistingSourceZone(
  matchdayId: string,
  sourceSlotType: EditorialMatchdayTransferSlotType,
  sourceId: string,
  projection: ZoneProjection,
) {
  const now = new Date().toISOString();

  if (isLiveMatchdayHierarchicalTransferSlotType(sourceSlotType)) {
    await writeProjectionToLiveLayoutSlot(matchdayId, sourceSlotType, projection, sourceId);
    return;
  }

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

  if (sourceSlotType === "side_block") {
    await writeSupabaseAdmin(`matchday_editorials?id=eq.${encodeURIComponent(sourceId)}&matchday_id=eq.${encodeURIComponent(matchdayId)}`, {
      method: "PATCH",
      body: JSON.stringify({
        side_block_status: "published",
        side_block_label: projection.label,
        side_block_title: projection.title,
        side_block_author: projection.author,
        side_block_text: projection.subtitle,
        side_block_image_url: projection.imageUrl,
        side_block_link_url: projection.linkUrl,
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
  sourceSlotType: EditorialMatchdayTransferSlotType,
  sourceId: string,
) {
  try {
    await writeProjectionToExistingSourceZone(
      matchdayId,
      sourceSlotType,
      sourceId,
      projectArticleToTransferZone(article, sourceSlotType),
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

  if (isLiveMatchdayHierarchicalTransferSlotType(slotType)) {
    const sourceId = await writeProjectionToLiveLayoutSlot(matchdayId, slotType, projection, null);
    return { slotType, sourceId };
  }

  const now = new Date().toISOString();

  if (slotType === "editorial_line_item") {
    const rows = await readLatestNewsRows(matchdayId);
    const sortOrder = Math.max(0, ...rows.map((row) => row.sort_order)) + 1;
    await setLatestNewsMode(matchdayId);
    await writeSupabaseAdmin("matchday_latest_news", {
      method: "POST",
      body: JSON.stringify({
        matchday_id: matchdayId,
        article_id: null,
        time_label: projection.label,
        time_label_color: null,
        title: projection.title,
        subtitle: projection.subtitle,
        image_url: projection.imageUrl,
        link_url: projection.linkUrl,
        sort_order: sortOrder,
        status: "published",
        created_at: now,
        updated_at: now,
      }),
    });
    const inserted = await fetchSupabaseAdminTable<Pick<LatestNewsRow, "id">>(
      `matchday_latest_news?select=id&matchday_id=eq.${encodeURIComponent(matchdayId)}&sort_order=eq.${sortOrder}&limit=1`,
    );
    if (!inserted[0]?.id) throw new EditorialMatchdayNewsFlowError("news-flow-placement-failed");
    await normalizeLatestNewsOrder(matchdayId);
    return { slotType, sourceId: inserted[0].id };
  }

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

  if (slotType === "side_block") {
    const rows = await fetchSupabaseAdminTable<EditorialRow>(
      `matchday_editorials?select=id,side_block_label,side_block_title,side_block_author,side_block_text,side_block_image_url,side_block_link_url&matchday_id=eq.${encodeURIComponent(matchdayId)}&limit=1`,
    );
    const existing = rows[0] ?? null;
    if (
      existing
      && hasContent(
        existing.side_block_label,
        existing.side_block_title,
        existing.side_block_author,
        existing.side_block_text,
        existing.side_block_image_url,
        existing.side_block_link_url,
      )
    ) {
      throw new EditorialMatchdayNewsFlowError(
        "news-flow-displaced-target-full",
        "O Contexto escolhido para receber a notícia substituída já está ocupado.",
      );
    }
    const payload = {
      side_block_status: "published",
      side_block_label: projection.label,
      side_block_title: projection.title,
      side_block_author: projection.author,
      side_block_text: projection.subtitle,
      side_block_image_url: projection.imageUrl,
      side_block_link_url: projection.linkUrl,
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
    await prioritizeMatchdayHorizontalNewsItem(matchdayId, reusable.id);
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
  await prioritizeMatchdayHorizontalNewsItem(matchdayId, inserted[0].id);
  return { slotType, sourceId: inserted[0].id };
}

async function writeArticleToTargetZone(
  matchdayId: string,
  articleId: string,
  article: NewsFlowArticle,
  targetSlotType: EditorialMatchdayTransferSlotType,
  targetId?: string | null,
) {
  const projection = projectArticleToTransferZone(article, targetSlotType);

  if (isLiveMatchdayHierarchicalTransferSlotType(targetSlotType)) {
    await writeProjectionToLiveLayoutSlot(matchdayId, targetSlotType, projection, targetId ?? null);
    return;
  }

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
        "A notícia escolhida em Últimas já mudou. Atualiza a página e tenta novamente.",
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
        "Manchete já está ocupada. Escolhe explicitamente a notícia atual para a substituir.",
      );
    }
    if (targetId && (!existing || targetId !== existing.id)) {
      throw new EditorialMatchdayNewsFlowError(
        "news-flow-target-changed",
        "A Manchete mudou desde que abriste a página. Atualiza antes de transferir.",
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

  if (targetSlotType === "side_block") {
    const rows = await fetchSupabaseAdminTable<EditorialRow>(
      `matchday_editorials?select=id,side_block_label,side_block_title,side_block_author,side_block_text,side_block_image_url,side_block_link_url&matchday_id=eq.${encodeURIComponent(matchdayId)}&limit=1`,
    );
    const existing = rows[0] ?? null;
    const occupied = Boolean(
      existing
      && hasContent(
        existing.side_block_label,
        existing.side_block_title,
        existing.side_block_author,
        existing.side_block_text,
        existing.side_block_image_url,
        existing.side_block_link_url,
      )
    );

    if (occupied && targetId !== existing?.id) {
      throw new EditorialMatchdayNewsFlowError(
        "news-flow-target-full",
        "Contexto já está ocupado. Escolhe explicitamente a notícia atual para a substituir.",
      );
    }
    if (targetId && (!existing || targetId !== existing.id)) {
      throw new EditorialMatchdayNewsFlowError(
        "news-flow-target-changed",
        "O Contexto mudou desde que abriste a página. Atualiza antes de transferir.",
      );
    }

    const payload = {
      side_block_status: "published",
      side_block_label: projection.label,
      side_block_title: projection.title,
      side_block_author: projection.author,
      side_block_text: projection.subtitle,
      side_block_image_url: projection.imageUrl,
      side_block_link_url: projection.linkUrl,
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
        "Notícia ao lado do vídeo já está ocupada. Escolhe explicitamente a notícia atual para a substituir.",
      );
    }
    if (targetId && (!existing || targetId !== existing.id)) {
      throw new EditorialMatchdayNewsFlowError(
        "news-flow-target-changed",
        "A notícia ao lado do vídeo mudou desde que abriste a página. Atualiza antes de transferir.",
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
        "A notícia escolhida nos Destaques já mudou. Atualiza a página e tenta novamente.",
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
        "3 notícias abaixo da manchete já tem três notícias. Escolhe qual delas queres substituir.",
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
      "A notícia escolhida na Faixa já mudou. Atualiza a página e tenta novamente.",
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
  let incomingId = existing?.id ?? null;
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
    const inserted = await fetchSupabaseAdminTable<Pick<HorizontalNewsRow, "id">>(
      `matchday_horizontal_news?select=id&matchday_id=eq.${encodeURIComponent(matchdayId)}&sort_order=eq.${targetOrder}&limit=1`,
    );
    incomingId = inserted[0]?.id ?? null;
  }
  if (!incomingId) {
    throw new EditorialMatchdayNewsFlowError("news-flow-placement-failed");
  }
  await prioritizeMatchdayHorizontalNewsItem(matchdayId, incomingId);
}
async function clearArticleFromSourceZone(
  matchdayId: string,
  sourceSlotType: EditorialMatchdayTransferSlotType,
  sourceId: string,
) {
  const now = new Date().toISOString();

  if (isLiveMatchdayHierarchicalTransferSlotType(sourceSlotType)) {
    const row = await readLiveLayoutRow(matchdayId, sourceSlotType);
    if (!row || row.id !== sourceId) {
      throw new EditorialMatchdayNewsFlowError(
        "news-flow-source-changed",
        "A posição de origem no layout da atualidade mudou. Atualiza a página e tenta novamente.",
      );
    }
    await writeSupabaseAdmin(
      `matchday_live_layout_items?id=eq.${encodeURIComponent(sourceId)}&matchday_id=eq.${encodeURIComponent(matchdayId)}`,
      { method: "DELETE" },
    );
    return;
  }

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

  if (sourceSlotType === "side_block") {
    await writeSupabaseAdmin(`matchday_editorials?id=eq.${encodeURIComponent(sourceId)}&matchday_id=eq.${encodeURIComponent(matchdayId)}`, {
      method: "PATCH",
      body: JSON.stringify({
        side_block_status: "draft",
        side_block_label: null,
        side_block_title: null,
        side_block_author: null,
        side_block_text: null,
        side_block_image_url: null,
        side_block_link_url: null,
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
  } else if (sourceSlotType === "important_item") {
    await normalizeMatchdayHorizontalNewsOrder(matchdayId);
  }
}

function transferSlotPublicName(slotType: EditorialMatchdayTransferSlotType) {
  if (isLiveMatchdayHierarchicalTransferSlotType(slotType)) {
    return liveMatchdayHierarchicalLayoutPosition(slotType)?.publicName ?? "Layout da atualidade";
  }
  return slotType === "side_block"
    ? "Contexto"
    : EDITORIAL_ZONE_PRESENTATION_PROFILES[slotType].publicName;
}

export async function transferPublishedArticleBetweenMatchdayZones(input: EditorialMatchdayNewsTransferInput) {
  if (
    !isEditorialMatchdayTransferSlotType(input.sourceSlotType)
    || !isEditorialMatchdayTransferSlotType(input.targetSlotType)
  ) {
    throw new EditorialMatchdayNewsFlowError(
      "news-flow-zone-invalid",
      "A zona escolhida não pertence ao circuito de transferência de notícias.",
    );
  }
  if (input.sourceSlotType === input.targetSlotType) {
    throw new EditorialMatchdayNewsFlowError("news-flow-same-zone", "Escolhe uma zona de destino diferente.");
  }
  if (
    isLatestFourNewsSlotType(input.targetSlotType)
    || isLatestFourNewsSlotType(input.displacedTargetSlotType)
  ) {
    throw new EditorialMatchdayNewsFlowError(
      "news-flow-automatic-latest-projection",
      "Os quatro lugares junto de Últimas não podem ser escolhidos como destino porque são preenchidos automaticamente.",
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

  let displacedPlacement: PlacedProjection | null = null;
  let displacedMovedToSource = false;

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

      if (displacedTargetSlotType === input.sourceSlotType) {
        // A posição de origem só recebe a notícia desalojada quando o editor
        // escolhe explicitamente esse destino. Nunca existe troca automática.
        await writeProjectionToExistingSourceZone(
          input.matchdayId,
          input.sourceSlotType,
          input.sourceId,
          displacedProjection,
        );
        displacedMovedToSource = true;
      } else {
        displacedPlacement = await placeProjectionInAvailableZone(
          input.matchdayId,
          displacedTargetSlotType,
          displacedProjection,
          input.displacedTargetOrder,
        );
      }
    }

    try {
      await writeArticleToTargetZone(
        input.matchdayId,
        input.articleId,
        article,
        input.targetSlotType,
        input.targetId,
      );
    } catch (error) {
      if (displacedMovedToSource) {
        await restoreSourceArticleAfterFailedSwap(
          input.matchdayId,
          article,
          input.sourceSlotType,
          input.sourceId,
        );
      } else if (displacedPlacement) {
        await clearArticleFromSourceZone(
          input.matchdayId,
          displacedPlacement.slotType,
          displacedPlacement.sourceId,
        ).catch(() => undefined);
      }
      throw error;
    }

    if (!displacedMovedToSource) {
      await clearArticleFromSourceZone(input.matchdayId, input.sourceSlotType, input.sourceId);
    }
  } else {
    await writeArticleToTargetZone(input.matchdayId, input.articleId, article, input.targetSlotType, null);
    await clearArticleFromSourceZone(input.matchdayId, input.sourceSlotType, input.sourceId);
  }

  await syncLatestFourNewsProjection(input.matchdayId);
  await syncCurrentPublishedReferenceCompositionNewsFlow(input.matchdayId);

  return {
    articleId: input.articleId,
    from: input.sourceSlotType,
    to: input.targetSlotType,
    targetName: transferSlotPublicName(input.targetSlotType),
  };
}

export function editorialNewsFlowTransferTargets(sourceSlotType: EditorialMatchdayTransferSlotType) {
  const slotTypes: EditorialMatchdayTransferSlotType[] = [
    ...EDITORIAL_NEWS_FLOW_SLOT_TYPES,
    "side_block",
    ...LIVE_MATCHDAY_HIERARCHICAL_TRANSFER_SLOT_TYPES,
  ];
  return slotTypes.filter(
    (slotType) => slotType !== sourceSlotType && !isLatestFourNewsSlotType(slotType),
  );
}
