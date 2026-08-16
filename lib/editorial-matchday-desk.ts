import type {
  MatchdayDeskApplyArticle,
  MatchdayDeskApplyResult,
  MatchdayDeskBlockedPlacement,
  MatchdayDeskSnapshot,
} from "@/lib/editorial-matchday-desk-model";
import {
  fetchSupabaseAdminTable,
  getSupabaseServiceConfig,
} from "@/lib/supabase";

const ARTICLE_SELECT = "id,slug,label,title,subtitle,image_url,author,published_at,created_at";

function cleanText(value?: string | null) {
  const clean = value?.trim();
  return clean || null;
}

function publicArticlePath(slug?: string | null) {
  const cleanSlug = cleanText(slug);
  return cleanSlug ? `/noticias/${encodeURIComponent(cleanSlug)}` : null;
}

function slugFromPublicArticleLink(value?: string | null) {
  const link = cleanText(value);
  if (!link) return null;

  try {
    const absolute = /^https?:\/\//i.test(link);
    const url = new URL(link, "https://jornada.pt");
    if (absolute && url.hostname !== "jornada.pt" && url.hostname !== "www.jornada.pt") {
      return null;
    }

    const segments = url.pathname.split("/").filter(Boolean);
    if (segments.length !== 2 || segments[0] !== "noticias") return null;
    return decodeURIComponent(segments[1]);
  } catch {
    return null;
  }
}

function hasContent(...values: Array<string | null | undefined>) {
  return values.some((value) => Boolean(cleanText(value)));
}

function chunks<T>(values: T[], size = 50) {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
}

type MatchdayRow = {
  id: string;
  season_id: string;
  number: number;
  label: string | null;
};

type SeasonRow = {
  id: string;
  competition_id: string;
  label: string;
};

type CompetitionRow = {
  id: string;
  name: string;
};

type ArticleRow = {
  id: string;
  slug: string | null;
  label: string | null;
  title: string | null;
  subtitle: string | null;
  image_url: string | null;
  author: string | null;
  published_at: string | null;
  created_at: string | null;
};

type EditorialRow = {
  id: string;
  title: string | null;
  summary: string | null;
  image_url: string | null;
  headline_link_url: string | null;
  status: string | null;
  side_block_status: string | null;
  side_block_label: string | null;
  side_block_title: string | null;
  side_block_author: string | null;
  side_block_text: string | null;
  side_block_image_url: string | null;
  side_block_link_url: string | null;
  complementary_status: string | null;
  complementary_label: string | null;
  complementary_title: string | null;
  complementary_text: string | null;
  complementary_image_url: string | null;
  complementary_link_url: string | null;
};

type HighlightRow = {
  id: string;
  label: string | null;
  title: string | null;
  subtitle: string | null;
  image_url: string | null;
  link_url: string | null;
  sort_order: number;
  status: string | null;
};

type LatestRow = {
  id: string;
  article_id: string | null;
  time_label: string | null;
  title: string | null;
  subtitle: string | null;
  image_url: string | null;
  link_url: string | null;
  sort_order: number;
  status: string | null;
};

type HorizontalRow = {
  id: string;
  label: string | null;
  title: string | null;
  subtitle: string | null;
  image_url: string | null;
  link_url: string | null;
  sort_order: number;
  status: string | null;
};

type LiveLayoutRow = {
  id: string;
  slot_type: string;
  article_id: string | null;
  label: string | null;
  title: string | null;
  subtitle: string | null;
  image_url: string | null;
  link_url: string | null;
};

type DeskControlRow = {
  is_managed: boolean;
  faixa_visible: boolean;
  revision: number;
};

async function callDeskRpc<T>(functionName: string, body: Record<string, unknown>): Promise<T> {
  const config = getSupabaseServiceConfig();
  if (!config) {
    throw new MatchdayEditorialDeskApplyError(
      "missing-service",
      "A escrita administrativa não está configurada.",
      503,
    );
  }

  const response = await fetch(
    `${config.url.replace(/\/$/, "")}/rest/v1/rpc/${functionName}`,
    {
      method: "POST",
      cache: "no-store",
      headers: {
        apikey: config.serviceRoleKey,
        Authorization: `Bearer ${config.serviceRoleKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    },
  );

  if (!response.ok) {
    const detail = await response.text();
    let message = detail;
    try {
      const parsed = JSON.parse(detail) as { message?: string };
      message = parsed.message ?? detail;
    } catch {
      // PostgREST may return plain text for infrastructure failures.
    }
    throw new MatchdayEditorialDeskApplyError(
      "rpc-failed",
      message || "Não foi possível aplicar o estado da Mesa.",
      response.status,
    );
  }

  return response.json() as Promise<T>;
}

async function readDeskStateToken(matchdayId: string) {
  try {
    const token = await callDeskRpc<string>("matchday_editorial_desk_state_token_v2", {
      p_matchday_id: matchdayId,
    });
    return cleanText(token);
  } catch {
    return null;
  }
}

async function fetchPublishedArticlesByReferences(input: {
  slugs: string[];
  articleIds: string[];
}) {
  const queries: Array<Promise<ArticleRow[]>> = [];

  chunks([...new Set(input.slugs.filter(Boolean))]).forEach((slugChunk) => {
    if (slugChunk.length === 0) return;
    const filter = slugChunk.map((slug) => encodeURIComponent(slug)).join(",");
    queries.push(
      fetchSupabaseAdminTable<ArticleRow>(
        `editorial_articles?select=${ARTICLE_SELECT}&slug=in.(${filter})&status=eq.published&limit=1000`,
      ).catch(() => []),
    );
  });

  chunks([...new Set(input.articleIds.filter(Boolean))]).forEach((idChunk) => {
    if (idChunk.length === 0) return;
    const filter = idChunk.map((articleId) => encodeURIComponent(articleId)).join(",");
    queries.push(
      fetchSupabaseAdminTable<ArticleRow>(
        `editorial_articles?select=${ARTICLE_SELECT}&id=in.(${filter})&status=eq.published&limit=1000`,
      ).catch(() => []),
    );
  });

  if (queries.length === 0) return [];
  return (await Promise.all(queries)).flat();
}

function articleSortTime(article: ArticleRow) {
  const value = article.published_at ?? article.created_at;
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

async function readMatchdayEditorialDeskCore(matchdayId: string): Promise<MatchdayDeskSnapshot | null> {
  const matchdays = await fetchSupabaseAdminTable<MatchdayRow>(
    `matchdays?select=id,season_id,number,label&id=eq.${encodeURIComponent(matchdayId)}&limit=1`,
  ).catch(() => []);
  const matchday = matchdays[0] ?? null;
  if (!matchday) return null;

  const seasons = await fetchSupabaseAdminTable<SeasonRow>(
    `seasons?select=id,competition_id,label&id=eq.${encodeURIComponent(matchday.season_id)}&limit=1`,
  ).catch(() => []);
  const season = seasons[0] ?? null;
  if (!season) return null;

  const competitions = await fetchSupabaseAdminTable<CompetitionRow>(
    `competitions?select=id,name&id=eq.${encodeURIComponent(season.competition_id)}&limit=1`,
  ).catch(() => []);
  const competition = competitions[0] ?? null;
  if (!competition) return null;

  const [
    currentArticles,
    editorialRows,
    highlights,
    latestRows,
    horizontalRows,
    liveRows,
    controls,
  ] = await Promise.all([
    fetchSupabaseAdminTable<ArticleRow>(
      `editorial_articles?select=${ARTICLE_SELECT}&matchday_id=eq.${encodeURIComponent(
        matchdayId,
      )}&status=eq.published&order=published_at.desc.nullslast,created_at.desc.nullslast&limit=1000`,
    ).catch(() => []),
    fetchSupabaseAdminTable<EditorialRow>(
      `matchday_editorials?select=id,title,summary,image_url,headline_link_url,status,side_block_status,side_block_label,side_block_title,side_block_author,side_block_text,side_block_image_url,side_block_link_url,complementary_status,complementary_label,complementary_title,complementary_text,complementary_image_url,complementary_link_url&matchday_id=eq.${encodeURIComponent(
        matchdayId,
      )}&limit=1`,
    ).catch(() => []),
    fetchSupabaseAdminTable<HighlightRow>(
      `matchday_highlights?select=id,label,title,subtitle,image_url,link_url,sort_order,status&matchday_id=eq.${encodeURIComponent(
        matchdayId,
      )}&order=sort_order.asc&limit=20`,
    ).catch(() => []),
    fetchSupabaseAdminTable<LatestRow>(
      `matchday_latest_news?select=id,article_id,time_label,title,subtitle,image_url,link_url,sort_order,status&matchday_id=eq.${encodeURIComponent(
        matchdayId,
      )}&order=sort_order.asc&limit=1000`,
    ).catch(() => []),
    fetchSupabaseAdminTable<HorizontalRow>(
      `matchday_horizontal_news?select=id,label,title,subtitle,image_url,link_url,sort_order,status&matchday_id=eq.${encodeURIComponent(
        matchdayId,
      )}&order=sort_order.asc&limit=1000`,
    ).catch(() => []),
    fetchSupabaseAdminTable<LiveLayoutRow>(
      `matchday_live_layout_items?select=id,slot_type,article_id,label,title,subtitle,image_url,link_url&matchday_id=eq.${encodeURIComponent(
        matchdayId,
      )}&order=created_at.asc&limit=1000`,
    ).catch(() => []),
    fetchSupabaseAdminTable<DeskControlRow>(
      `matchday_editorial_desk_control?select=is_managed,faixa_visible,revision&matchday_id=eq.${encodeURIComponent(
        matchdayId,
      )}&limit=1`,
    ).catch(() => []),
  ]);

  const editorial = editorialRows[0] ?? null;
  const control = controls[0] ?? null;

  const referencedSlugs = new Set<string>();
  const referencedArticleIds = new Set<string>();

  function registerLinkReference(linkUrl?: string | null) {
    const slug = slugFromPublicArticleLink(linkUrl);
    if (slug) referencedSlugs.add(slug);
  }

  if (editorial) {
    registerLinkReference(editorial.headline_link_url);
    registerLinkReference(editorial.side_block_link_url);
    registerLinkReference(editorial.complementary_link_url);
  }
  highlights.forEach((item) => registerLinkReference(item.link_url));
  latestRows.forEach((item) => registerLinkReference(item.link_url));
  horizontalRows.forEach((item) => registerLinkReference(item.link_url));
  liveRows.forEach((item) => {
    registerLinkReference(item.link_url);
    if (item.article_id) referencedArticleIds.add(item.article_id);
  });

  const referencedArticles = await fetchPublishedArticlesByReferences({
    slugs: [...referencedSlugs],
    articleIds: [...referencedArticleIds],
  });

  const articleMap = new Map<string, ArticleRow>();
  currentArticles.forEach((article) => articleMap.set(article.id, article));
  referencedArticles.forEach((article) => articleMap.set(article.id, article));

  const articles = [...articleMap.values()].sort((left, right) => {
    const timeDifference = articleSortTime(right) - articleSortTime(left);
    return timeDifference || left.id.localeCompare(right.id);
  });

  const articleById = new Map(articles.map((article) => [article.id, article] as const));
  const articleIdsBySlug = new Map<string, string[]>();
  articles.forEach((article) => {
    const slug = cleanText(article.slug);
    if (!slug) return;
    articleIdsBySlug.set(slug, [...(articleIdsBySlug.get(slug) ?? []), article.id]);
  });

  const placementKeysByArticleId = new Map<string, string[]>();
  const blockedPlacements: MatchdayDeskBlockedPlacement[] = [];

  function articleIdByLink(linkUrl?: string | null) {
    const slug = slugFromPublicArticleLink(linkUrl);
    if (!slug) return null;
    const ids = articleIdsBySlug.get(slug) ?? [];
    return ids.length === 1 ? ids[0] : null;
  }

  function blockPlacement(placementKey: string, title: string | null | undefined, reason: string) {
    blockedPlacements.push({
      placementKey,
      title: cleanText(title) ?? "Conteúdo atual",
      reason,
    });
  }

  function registerPlacement(
    placementKey: string,
    input: {
      articleId?: string | null;
      linkUrl?: string | null;
      title?: string | null;
      content: boolean;
      published?: boolean;
    },
  ) {
    if (!input.content) return;
    if (input.published === false) {
      blockPlacement(
        placementKey,
        input.title,
        "Existe conteúdo não publicado nesta posição. Deve ser resolvido no Editorial antes de aplicar a Mesa.",
      );
      return;
    }

    const directArticleId = input.articleId && articleById.has(input.articleId) ? input.articleId : null;
    const linkedArticleId = articleIdByLink(input.linkUrl);
    if (directArticleId && linkedArticleId && directArticleId !== linkedArticleId) {
      blockPlacement(
        placementKey,
        input.title,
        "A posição contém identidades canónicas contraditórias e não pode ser substituída com segurança.",
      );
      return;
    }

    const articleId = directArticleId ?? linkedArticleId;
    if (!articleId) {
      blockPlacement(
        placementKey,
        input.title,
        "Conteúdo da zona não associado com segurança a um artigo canónico publicado.",
      );
      return;
    }

    const placements = placementKeysByArticleId.get(articleId) ?? [];
    if (!placements.includes(placementKey)) placements.push(placementKey);
    placementKeysByArticleId.set(articleId, placements);
  }

  if (editorial) {
    registerPlacement("headline", {
      linkUrl: editorial.headline_link_url,
      title: editorial.title,
      content: hasContent(editorial.title, editorial.summary, editorial.image_url, editorial.headline_link_url),
      published: editorial.status === "published",
    });
    registerPlacement("side_block", {
      linkUrl: editorial.side_block_link_url,
      title: editorial.side_block_title,
      content: hasContent(
        editorial.side_block_label,
        editorial.side_block_title,
        editorial.side_block_author,
        editorial.side_block_text,
        editorial.side_block_image_url,
        editorial.side_block_link_url,
      ),
      published: editorial.side_block_status === "published",
    });
    registerPlacement("complement", {
      linkUrl: editorial.complementary_link_url,
      title: editorial.complementary_title,
      content: hasContent(
        editorial.complementary_label,
        editorial.complementary_title,
        editorial.complementary_text,
        editorial.complementary_image_url,
        editorial.complementary_link_url,
      ),
      published: editorial.complementary_status === "published",
    });
  }

  highlights.forEach((item) => registerPlacement(`highlight:${item.sort_order}`, {
    linkUrl: item.link_url,
    title: item.title,
    content: hasContent(item.label, item.title, item.subtitle, item.image_url, item.link_url),
    published: item.status === "published",
  }));

  liveRows.forEach((item) => registerPlacement(item.slot_type, {
    articleId: item.article_id,
    linkUrl: item.link_url,
    title: item.title,
    content: hasContent(item.label, item.title, item.subtitle, item.image_url, item.link_url),
  }));

  horizontalRows.forEach((item) => registerPlacement(`important_item:${item.sort_order}`, {
    linkUrl: item.link_url,
    title: item.title,
    content: hasContent(item.label, item.title, item.subtitle, item.image_url, item.link_url),
    published: item.status === "published",
  }));

  const latestArticleIds = new Set<string>();
  latestRows.forEach((item) => {
    const content = hasContent(item.time_label, item.title, item.subtitle, item.image_url, item.link_url);
    if (!content) return;
    if (item.status !== "published") {
      blockPlacement(
        `latest:${item.sort_order}`,
        item.title,
        "Existe conteúdo não publicado em Últimas. Deve ser resolvido no Editorial antes de aplicar a Mesa.",
      );
      return;
    }

    // article_id still points to public.articles (legacy). The canonical identity is the public article URL.
    const articleId = articleIdByLink(item.link_url);
    if (articleId) {
      latestArticleIds.add(articleId);
    } else {
      blockPlacement(
        `latest:${item.sort_order}`,
        item.title,
        "Conteúdo de Últimas não associado com segurança a um artigo canónico publicado.",
      );
    }
  });

  articles.forEach((article) => {
    if (cleanText(article.slug) && cleanText(article.title)) return;
    blockPlacement(
      `article:${article.id}`,
      article.title,
      "Artigo publicado incompleto: é necessário título e endereço público antes de aplicar o estado final.",
    );
  });

  return {
    matchdayId,
    matchdayNumber: matchday.number,
    matchdayLabel: cleanText(matchday.label) ?? `Jornada ${matchday.number}`,
    seasonLabel: season.label,
    competitionName: competition.name,
    isManaged: control?.is_managed === true,
    faixaVisible: control?.faixa_visible !== false,
    revision: Number.isSafeInteger(control?.revision) && (control?.revision ?? 0) >= 0
      ? control?.revision ?? 0
      : 0,
    stateToken: null,
    articles: articles
      .filter((article): article is ArticleRow & { slug: string; title: string } =>
        Boolean(cleanText(article.slug) && cleanText(article.title))
      )
      .map((article) => {
        const placementKeys = placementKeysByArticleId.get(article.id) ?? [];
        return {
          id: article.id,
          slug: cleanText(article.slug) as string,
          label: cleanText(article.label),
          title: cleanText(article.title) as string,
          subtitle: cleanText(article.subtitle),
          imageUrl: cleanText(article.image_url),
          author: cleanText(article.author),
          publishedAt: article.published_at,
          createdAt: article.created_at,
          inLatest: latestArticleIds.has(article.id),
          placementKey: placementKeys[0] ?? null,
          placementConflictKeys: placementKeys.slice(1),
        };
      }),
    blockedPlacements,
  };
}

export async function readMatchdayEditorialDesk(matchdayId: string): Promise<MatchdayDeskSnapshot | null> {
  let latestSnapshot: MatchdayDeskSnapshot | null = null;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const beforeToken = await readDeskStateToken(matchdayId);
    const snapshot = await readMatchdayEditorialDeskCore(matchdayId);
    if (!snapshot) return null;
    const afterToken = await readDeskStateToken(matchdayId);
    latestSnapshot = { ...snapshot, stateToken: afterToken ?? beforeToken };

    if (!beforeToken || !afterToken || beforeToken === afterToken) {
      return latestSnapshot;
    }
  }

  return latestSnapshot ? { ...latestSnapshot, stateToken: null } : null;
}

export class MatchdayEditorialDeskApplyError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

export async function applyMatchdayEditorialDeskState(input: {
  matchdayId: string;
  expectedRevision: number;
  expectedStateToken: string;
  faixaVisible: boolean;
  articles: MatchdayDeskApplyArticle[];
}) {
  return callDeskRpc<MatchdayDeskApplyResult>("apply_matchday_editorial_desk_state_v2", {
    p_matchday_id: input.matchdayId,
    p_expected_revision: input.expectedRevision,
    p_expected_state_token: input.expectedStateToken,
    p_faixa_visible: input.faixaVisible,
    p_articles: input.articles.map((article) => ({
      article_id: article.articleId,
      in_latest: article.inLatest,
      placement_key: article.placementKey,
    })),
  });
}
