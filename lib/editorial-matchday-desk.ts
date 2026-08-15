import { fetchSupabaseAdminTable } from "@/lib/supabase";
import type {
  MatchdayDeskBlockedPlacement,
  MatchdayDeskSnapshot,
} from "@/lib/editorial-matchday-desk-model";

function cleanText(value?: string | null) {
  const clean = value?.trim();
  return clean || null;
}

function publicArticlePath(slug?: string | null) {
  const cleanSlug = cleanText(slug);
  return cleanSlug ? `/noticias/${encodeURIComponent(cleanSlug)}` : null;
}

function hasContent(...values: Array<string | null | undefined>) {
  return values.some((value) => Boolean(cleanText(value)));
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
  side_block_title: string | null;
  side_block_link_url: string | null;
  complementary_status: string | null;
  complementary_title: string | null;
  complementary_link_url: string | null;
};

type HighlightRow = {
  id: string;
  title: string | null;
  link_url: string | null;
  sort_order: number;
  status: string | null;
};

type LatestRow = {
  id: string;
  article_id: string | null;
  title: string | null;
  link_url: string | null;
  sort_order: number;
  status: string | null;
};

type HorizontalRow = {
  id: string;
  title: string | null;
  link_url: string | null;
  sort_order: number;
  status: string | null;
};

type LiveLayoutRow = {
  id: string;
  slot_type: string;
  article_id: string | null;
  title: string | null;
  link_url: string | null;
};

export async function readMatchdayEditorialDesk(matchdayId: string): Promise<MatchdayDeskSnapshot | null> {
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

  const [articles, editorialRows, highlights, latestRows, horizontalRows, liveRows] = await Promise.all([
    fetchSupabaseAdminTable<ArticleRow>(
      `editorial_articles?select=id,slug,label,title,subtitle,image_url,author,published_at,created_at&matchday_id=eq.${encodeURIComponent(
        matchdayId,
      )}&status=eq.published&order=published_at.desc.nullslast,created_at.desc.nullslast&limit=1000`,
    ).catch(() => []),
    fetchSupabaseAdminTable<EditorialRow>(
      `matchday_editorials?select=id,title,summary,image_url,headline_link_url,status,side_block_status,side_block_title,side_block_link_url,complementary_status,complementary_title,complementary_link_url&matchday_id=eq.${encodeURIComponent(
        matchdayId,
      )}&limit=1`,
    ).catch(() => []),
    fetchSupabaseAdminTable<HighlightRow>(
      `matchday_highlights?select=id,title,link_url,sort_order,status&matchday_id=eq.${encodeURIComponent(
        matchdayId,
      )}&order=sort_order.asc&limit=20`,
    ).catch(() => []),
    fetchSupabaseAdminTable<LatestRow>(
      `matchday_latest_news?select=id,article_id,title,link_url,sort_order,status&matchday_id=eq.${encodeURIComponent(
        matchdayId,
      )}&order=sort_order.asc&limit=1000`,
    ).catch(() => []),
    fetchSupabaseAdminTable<HorizontalRow>(
      `matchday_horizontal_news?select=id,title,link_url,sort_order,status&matchday_id=eq.${encodeURIComponent(
        matchdayId,
      )}&order=sort_order.asc&limit=1000`,
    ).catch(() => []),
    fetchSupabaseAdminTable<LiveLayoutRow>(
      `matchday_live_layout_items?select=id,slot_type,article_id,title,link_url&matchday_id=eq.${encodeURIComponent(
        matchdayId,
      )}&order=created_at.asc&limit=1000`,
    ).catch(() => []),
  ]);

  const editorial = editorialRows[0] ?? null;
  const articleById = new Map(articles.map((article) => [article.id, article] as const));
  const articleIdByLink = new Map<string, string>();
  articles.forEach((article) => {
    const link = publicArticlePath(article.slug);
    if (link) articleIdByLink.set(link, article.id);
  });
  const placementKeysByArticleId = new Map<string, string[]>();
  const blockedPlacements: MatchdayDeskBlockedPlacement[] = [];

  function registerPlacementByArticleId(articleId: string | null, placementKey: string, title?: string | null) {
    if (articleId && articleById.has(articleId)) {
      const placements = placementKeysByArticleId.get(articleId) ?? [];
      if (!placements.includes(placementKey)) placements.push(placementKey);
      placementKeysByArticleId.set(articleId, placements);
      return;
    }

    if (hasContent(title)) {
      blockedPlacements.push({
        placementKey,
        title: cleanText(title) ?? "Conteúdo atual",
        reason: "Conteúdo da zona não associado a um artigo publicado desta jornada.",
      });
    }
  }

  function registerPlacementByLink(linkUrl: string | null, placementKey: string, title?: string | null) {
    const link = cleanText(linkUrl);
    const articleId = link ? articleIdByLink.get(link) ?? null : null;
    registerPlacementByArticleId(articleId, placementKey, title);
  }

  if (editorial?.status === "published" && hasContent(editorial.title, editorial.summary, editorial.image_url, editorial.headline_link_url)) {
    registerPlacementByLink(editorial.headline_link_url, "headline", editorial.title);
  }

  if (editorial?.side_block_status === "published" && hasContent(editorial.side_block_title, editorial.side_block_link_url)) {
    registerPlacementByLink(editorial.side_block_link_url, "side_block", editorial.side_block_title);
  }

  if (editorial?.complementary_status === "published" && hasContent(editorial.complementary_title, editorial.complementary_link_url)) {
    registerPlacementByLink(editorial.complementary_link_url, "complement", editorial.complementary_title);
  }

  highlights
    .filter((item) => item.status === "published")
    .forEach((item) => registerPlacementByLink(item.link_url, `highlight:${item.sort_order}`, item.title));

  liveRows.forEach((item) => {
    const directArticleId = item.article_id && articleById.has(item.article_id) ? item.article_id : null;
    const linkedArticleId = item.link_url ? articleIdByLink.get(item.link_url) ?? null : null;
    registerPlacementByArticleId(directArticleId ?? linkedArticleId, item.slot_type, item.title);
  });

  horizontalRows.forEach((item) => {
    registerPlacementByLink(item.link_url, `important_item:${item.sort_order}`, item.title);
  });

  const latestArticleIds = new Set<string>();
  latestRows
    .filter((item) => item.status === "published")
    .forEach((item) => {
      if (item.article_id && articleById.has(item.article_id)) {
        latestArticleIds.add(item.article_id);
        return;
      }
      const link = cleanText(item.link_url);
      const articleId = link ? articleIdByLink.get(link) ?? null : null;
      if (articleId) latestArticleIds.add(articleId);
    });

  return {
    matchdayId,
    matchdayNumber: matchday.number,
    matchdayLabel: cleanText(matchday.label) ?? `Jornada ${matchday.number}`,
    seasonLabel: season.label,
    competitionName: competition.name,
    articles: articles
      .filter((article): article is ArticleRow & { slug: string; title: string } => Boolean(cleanText(article.slug) && cleanText(article.title)))
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