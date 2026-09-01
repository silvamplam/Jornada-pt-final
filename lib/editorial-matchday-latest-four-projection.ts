import { fetchSupabaseAdminTable, writeSupabaseAdmin } from "@/lib/supabase";

export const LATEST_FOUR_NEWS_SLOT_TYPES = [
  "live_four_news:1",
  "live_four_news:2",
  "live_four_news:3",
  "live_four_news:4",
] as const;

export type LatestFourNewsSlotType = (typeof LATEST_FOUR_NEWS_SLOT_TYPES)[number];

const latestFourNewsSlotTypeSet = new Set<string>(LATEST_FOUR_NEWS_SLOT_TYPES);

export function isLatestFourNewsSlotType(value?: string | null): value is LatestFourNewsSlotType {
  return Boolean(value && latestFourNewsSlotTypeSet.has(value));
}

export type LatestFourNewsSourceRow = {
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

export type LatestFourNewsConflictRow = {
  zone: string;
  article_id: string | null;
  link_url: string | null;
};

export type LatestFourNewsCanonicalArticle = {
  id: string;
  slug: string | null;
  subtitle?: string | null;
  image_url?: string | null;
};

export type LatestFourNewsProjectionRow = {
  matchday_id: string;
  slot_type: LatestFourNewsSlotType;
  article_id: null;
  label: string | null;
  title: string | null;
  subtitle: string | null;
  image_url: string | null;
  link_url: string | null;
  updated_at: string;
};

type LatestFourNewsProjectionDependencies = {
  readLatestNews(matchdayId: string): Promise<readonly LatestFourNewsSourceRow[]>;
  readConflictingNews(matchdayId: string): Promise<readonly LatestFourNewsConflictRow[]>;
  readCanonicalArticles(slugs: readonly string[]): Promise<readonly LatestFourNewsCanonicalArticle[]>;
  writeProjection(rows: readonly LatestFourNewsProjectionRow[]): Promise<void>;
  now(): string;
};

function cleanText(value?: string | null) {
  const clean = value?.trim();
  return clean ? clean : null;
}

function isValidPublishedLatestNews(row: LatestFourNewsSourceRow) {
  return row.status === "published" && Boolean(cleanText(row.title) && cleanText(row.link_url));
}

function normalizedLink(value?: string | null) {
  const link = cleanText(value);
  if (!link) return null;
  const withoutFragment = link.split(/[?#]/u, 1)[0]?.replace(/\/+$/u, "") ?? "";
  return withoutFragment || null;
}

function canonicalArticleSlug(value?: string | null) {
  const link = normalizedLink(value);
  if (!link?.startsWith("/noticias/")) return null;
  const encodedSlug = link.slice("/noticias/".length).split("/", 1)[0] ?? "";
  if (!encodedSlug) return null;

  try {
    return cleanText(decodeURIComponent(encodedSlug));
  } catch {
    return null;
  }
}

function newsIdentityKeys(
  item: Pick<LatestFourNewsSourceRow, "article_id" | "link_url">,
  canonicalArticleIdBySlug: ReadonlyMap<string, string>,
) {
  const keys: string[] = [];
  const slug = canonicalArticleSlug(item.link_url);
  const canonicalArticleId = slug ? canonicalArticleIdBySlug.get(slug) ?? null : null;
  const articleId = cleanText(item.article_id);
  const link = normalizedLink(item.link_url);

  if (canonicalArticleId) keys.push(`article:${canonicalArticleId}`);
  if (articleId) keys.push(`article:${articleId}`);
  if (slug) keys.push(`slug:${slug}`);
  if (link) keys.push(`link:${link}`);
  return keys;
}

type MatchdayEditorialConflictRow = {
  status: string | null;
  headline_link_url: string | null;
  side_block_status: string | null;
  side_block_link_url: string | null;
  complementary_status: string | null;
  complementary_link_url: string | null;
};

type MatchdayListConflictRow = {
  link_url: string | null;
};

type MatchdayLiveLayoutConflictRow = {
  slot_type: string;
  article_id: string | null;
  title: string | null;
  link_url: string | null;
};

type MatchdayProfileAssignmentConflictRow = {
  profile_key: string;
};

type MatchdayProfileZoneConflictRow = {
  source_type: string;
  source_id: string;
  zone_key: string;
};

async function readPublishedLiveNewsConflicts(matchdayId: string) {
  const assignmentRows =
    await fetchSupabaseAdminTable<MatchdayProfileAssignmentConflictRow>(
      `matchday_editorial_profile_assignments?select=profile_key&matchday_id=eq.${encodeURIComponent(
        matchdayId,
      )}&limit=1`,
    );

  const assignedProfileKey =
    cleanText(assignmentRows[0]?.profile_key);

  const hasThematicAssignment =
    Boolean(assignedProfileKey);

  const thematicZoneItemsPromise = assignedProfileKey
    ? fetchSupabaseAdminTable<MatchdayProfileZoneConflictRow>(
        `matchday_editorial_profile_zone_items?select=source_type,source_id,zone_key&matchday_id=eq.${encodeURIComponent(
          matchdayId,
        )}&profile_key=eq.${encodeURIComponent(
          assignedProfileKey,
        )}`,
      )
    : Promise.resolve<MatchdayProfileZoneConflictRow[]>([]);

  const [
    editorialRows,
    highlights,
    horizontalNews,
    liveLayoutItems,
    thematicZoneItems,
  ] = await Promise.all([
    fetchSupabaseAdminTable<MatchdayEditorialConflictRow>(
      `matchday_editorials?select=status,headline_link_url,side_block_status,side_block_link_url,complementary_status,complementary_link_url&matchday_id=eq.${encodeURIComponent(
        matchdayId,
      )}&limit=1`,
    ),
    fetchSupabaseAdminTable<MatchdayListConflictRow>(
      `matchday_highlights?select=link_url&matchday_id=eq.${encodeURIComponent(matchdayId)}&status=eq.published`,
    ),
    fetchSupabaseAdminTable<MatchdayListConflictRow>(
      `matchday_horizontal_news?select=link_url&matchday_id=eq.${encodeURIComponent(matchdayId)}&status=eq.published`,
    ),
    fetchSupabaseAdminTable<MatchdayLiveLayoutConflictRow>(
      `matchday_live_layout_items?select=slot_type,article_id,title,link_url&matchday_id=eq.${encodeURIComponent(matchdayId)}`,
    ),
    thematicZoneItemsPromise,
  ]);

  const conflicts: LatestFourNewsConflictRow[] = [];
  const editorial = editorialRows[0] ?? null;

  if (editorial?.status === "published") {
    conflicts.push({
      zone: "headline",
      article_id: null,
      link_url: editorial.headline_link_url,
    });
  }

  if (editorial?.side_block_status === "published") {
    conflicts.push({
      zone: "side_block",
      article_id: null,
      link_url: editorial.side_block_link_url,
    });
  }

  if (editorial?.complementary_status === "published") {
    conflicts.push({
      zone: "complement",
      article_id: null,
      link_url: editorial.complementary_link_url,
    });
  }

  highlights.forEach((row) => {
    conflicts.push({
      zone: "highlight",
      article_id: null,
      link_url: row.link_url,
    });
  });

  if (!assignedProfileKey) {
    horizontalNews.forEach((row) => {
      conflicts.push({
        zone: "important_item",
        article_id: null,
        link_url: row.link_url,
      });
    });
  }

  if (!hasThematicAssignment) {
    liveLayoutItems.forEach((row) => {
      if (
        isLatestFourNewsSlotType(row.slot_type)
        || !cleanText(row.title)
      ) {
        return;
      }

      conflicts.push({
        zone: row.slot_type,
        article_id: row.article_id,
        link_url: row.link_url,
      });
    });
  }

  thematicZoneItems.forEach((row) => {
    if (
      cleanText(row.source_type)?.toLowerCase()
        !== "editorial_article"
      || !cleanText(row.source_id)
    ) {
      return;
    }

    conflicts.push({
      zone: `thematic:${row.zone_key}`,
      article_id: row.source_id,
      link_url: null,
    });
  });

  return conflicts;
}

export function createLatestFourNewsProjectionSync(
  dependencies: LatestFourNewsProjectionDependencies,
) {
  return async function syncLatestFourNewsProjectionWithDependencies(matchdayId: string) {
    const [latestNews, conflictingNews] = await Promise.all([
      dependencies.readLatestNews(matchdayId),
      dependencies.readConflictingNews(matchdayId),
    ]);
    const canonicalSlugs = Array.from(new Set(
      [...latestNews, ...conflictingNews]
        .map((item) => canonicalArticleSlug(item.link_url))
        .filter((slug): slug is string => Boolean(slug)),
    ));
    const canonicalArticles = await dependencies.readCanonicalArticles(canonicalSlugs);
    const canonicalArticleBySlug = new Map(
      canonicalArticles.flatMap((article) => {
        const slug = cleanText(article.slug);
        return slug ? [[slug, article] as const] : [];
      }),
    );
    const canonicalArticleIdBySlug = new Map(
      Array.from(canonicalArticleBySlug, ([slug, article]) => [slug, article.id] as const),
    );
    const conflictingIdentities = new Set(
      conflictingNews.flatMap((item) => newsIdentityKeys(item, canonicalArticleIdBySlug)),
    );
    const projectedNews = latestNews
      .filter(isValidPublishedLatestNews)
      .filter((item) => (
        newsIdentityKeys(item, canonicalArticleIdBySlug)
          .every((identity) => !conflictingIdentities.has(identity))
      ))
      .slice(0, 4);
    const updatedAt = dependencies.now();
    const rows = LATEST_FOUR_NEWS_SLOT_TYPES.map((slotType, index): LatestFourNewsProjectionRow => {
      const source = projectedNews[index] ?? null;
      const sourceSlug = canonicalArticleSlug(source?.link_url);
      const canonicalSource = sourceSlug
        ? canonicalArticleBySlug.get(sourceSlug) ?? null
        : null;

      return {
        matchday_id: matchdayId,
        slot_type: slotType,
        article_id: null,
        label: cleanText(source?.time_label),
        title: cleanText(source?.title),
        subtitle: cleanText(source?.subtitle) ?? cleanText(canonicalSource?.subtitle),
        image_url: cleanText(source?.image_url) ?? cleanText(canonicalSource?.image_url),
        link_url: cleanText(source?.link_url),
        updated_at: updatedAt,
      };
    });

    await dependencies.writeProjection(rows);
  };
}

const syncLatestFourNewsProjectionWithSupabase = createLatestFourNewsProjectionSync({
  readLatestNews(matchdayId) {
    return fetchSupabaseAdminTable<LatestFourNewsSourceRow>(
      `matchday_latest_news?select=id,article_id,time_label,title,subtitle,image_url,link_url,sort_order,status&matchday_id=eq.${encodeURIComponent(
        matchdayId,
      )}&status=eq.published&order=sort_order.asc`,
    );
  },
  readConflictingNews(matchdayId) {
    return readPublishedLiveNewsConflicts(matchdayId);
  },
  readCanonicalArticles(slugs) {
    if (slugs.length === 0) return Promise.resolve([]);
    const filter = slugs.map((slug) => encodeURIComponent(slug)).join(",");
    return fetchSupabaseAdminTable<LatestFourNewsCanonicalArticle>(
      `editorial_articles?select=id,slug,subtitle,image_url&slug=in.(${filter})&status=eq.published`,
    );
  },
  writeProjection(rows) {
    return writeSupabaseAdmin(
      "matchday_live_layout_items?on_conflict=matchday_id,slot_type",
      {
        method: "POST",
        headers: {
          Prefer: "resolution=merge-duplicates,return=minimal",
        },
        body: JSON.stringify(rows),
      },
    );
  },
  now() {
    return new Date().toISOString();
  },
});

export async function syncLatestFourNewsProjection(
  matchdayId: string,
) {
  await writeSupabaseAdmin("rpc/refresh_matchday_live_layout_legacy", {
    method: "POST",
    body: JSON.stringify({ p_matchday_id: matchdayId }),
  });
}
