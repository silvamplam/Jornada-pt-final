import { EDITORIAL_CONTEXT_POST_TITLE_MAX_CHARS } from "@/lib/editorial-context-post-title";
import {
  isLatestFourNewsSlotType,
  syncLatestFourNewsProjection,
} from "@/lib/editorial-matchday-latest-four-projection";
import {
  projectEditorialArticleToZone,
  type EditorialArticleZoneSource,
} from "@/lib/editorial-zone-presentation";
import { fetchSupabaseAdminTable, writeSupabaseAdmin } from "@/lib/supabase";

export type EditorialArticleLiveSnapshot = EditorialArticleZoneSource & {
  author: string | null;
};

export type EditorialArticleLiveSnapshotTable =
  | "matchday_editorials"
  | "matchday_highlights"
  | "matchday_latest_news"
  | "matchday_horizontal_news"
  | "site_editorials"
  | "site_editorial_highlights"
  | "site_editorial_latest_news"
  | "site_editorial_horizontal_news";

export type EditorialArticleLiveSnapshotPatch = Readonly<{
  table: EditorialArticleLiveSnapshotTable;
  linkField:
    | "headline_link_url"
    | "side_block_link_url"
    | "complementary_link_url"
    | "link_url";
  links: readonly string[];
  payload: Readonly<Record<string, string | null>>;
}>;

export type EditorialArticleLiveLayoutRow = Readonly<{
  id: string;
  matchday_id: string;
  slot_type: string;
  link_url: string | null;
}>;

export type EditorialArticleLiveCarryoverRow = Readonly<{
  matchday_id: string;
  carryover_source_composition_id: string | null;
  carryover_snapshot: unknown;
}>;

export type EditorialArticleLiveSnapshotSyncDependencies = Readonly<{
  readAffectedMatchdayIds(links: readonly string[]): Promise<readonly string[]>;
  readLiveLayoutItems(links: readonly string[]): Promise<readonly EditorialArticleLiveLayoutRow[]>;
  readLiveCarryovers(links: readonly string[]): Promise<readonly EditorialArticleLiveCarryoverRow[]>;
  patchLinkedSnapshots(patch: EditorialArticleLiveSnapshotPatch): Promise<void>;
  patchLiveLayoutItem(
    rowId: string,
    payload: Readonly<Record<string, string | null>>,
  ): Promise<void>;
  patchLiveCarryover(
    row: EditorialArticleLiveCarryoverRow,
    snapshot: unknown,
  ): Promise<void>;
  syncLatestFourNewsProjection(matchdayId: string): Promise<void>;
  now(): string;
}>;

export type EditorialArticleLiveSnapshotSyncInput = Readonly<{
  previousSlug?: string | null;
  article: EditorialArticleLiveSnapshot;
}>;

export type EditorialArticleLiveSnapshotSyncResult = Readonly<{
  affectedMatchdayIds: readonly string[];
  updatedLiveLayoutItemIds: readonly string[];
  updatedCarryoverMatchdayIds: readonly string[];
}>;

type MatchdayIdRow = Readonly<{
  matchday_id: string | null;
}>;

function cleanText(value?: string | null) {
  const clean = value?.trim();
  return clean ? clean : null;
}

function articlePath(slug?: string | null) {
  const cleanSlug = cleanText(slug);
  return cleanSlug ? `/noticias/${cleanSlug}` : null;
}

function uniqueValues(values: readonly (string | null | undefined)[]) {
  return Array.from(new Set(values.flatMap((value) => {
    const clean = cleanText(value);
    return clean ? [clean] : [];
  })));
}

function objectValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function hasLinkedArticle(
  value: Record<string, unknown>,
  links: readonly string[],
) {
  return typeof value.link_url === "string" && links.includes(value.link_url.trim());
}

function syncLiveCarryoverSnapshot(
  snapshot: unknown,
  article: EditorialArticleLiveSnapshot,
  links: readonly string[],
  updatedAt: string,
) {
  const source = objectValue(snapshot);
  if (!source || source.version !== 2) {
    return { changed: false, snapshot };
  }

  const headlineProjection = projectEditorialArticleToZone(article, "headline");
  const sideBlockProjection = projectEditorialArticleToZone(article, "side_block");
  const highlightProjection = projectEditorialArticleToZone(article, "highlight");
  const latestProjection = projectEditorialArticleToZone(article, "editorial_line_item");
  const currentLink = headlineProjection.linkUrl;
  if (!currentLink) {
    throw new Error("editorial-article-live-snapshot-slug-missing");
  }

  let changed = false;
  const next: Record<string, unknown> = { ...source };
  const headline = objectValue(source.headline);
  if (headline && hasLinkedArticle(headline, links)) {
    next.headline = {
      ...headline,
      title: headlineProjection.title,
      summary: headlineProjection.subtitle,
      image_url: headlineProjection.imageUrl,
      link_url: currentLink,
    };
    changed = true;
  }

  const sideBlock = objectValue(source.side_block);
  if (sideBlock && hasLinkedArticle(sideBlock, links)) {
    next.side_block = {
      ...sideBlock,
      label: sideBlockProjection.label,
      title: sideBlockProjection.title,
      author: cleanText(article.author),
      text: cleanText(sideBlockProjection.subtitle)?.slice(
        0,
        EDITORIAL_CONTEXT_POST_TITLE_MAX_CHARS,
      ) ?? null,
      image_url: sideBlockProjection.imageUrl,
      link_url: currentLink,
    };
    changed = true;
  }

  if (Array.isArray(source.highlights)) {
    next.highlights = source.highlights.map((value) => {
      const highlight = objectValue(value);
      if (!highlight || !hasLinkedArticle(highlight, links)) return value;
      changed = true;
      return {
        ...highlight,
        title: highlightProjection.title,
        subtitle: highlightProjection.subtitle,
        image_url: highlightProjection.imageUrl,
        link_url: currentLink,
      };
    });
  }

  if (Array.isArray(source.live_layout_items)) {
    next.live_layout_items = source.live_layout_items.map((value) => {
      const item = objectValue(value);
      if (!item || !hasLinkedArticle(item, links)) return value;
      changed = true;
      const isLatestFour = typeof item.slot_type === "string"
        && isLatestFourNewsSlotType(item.slot_type);
      return {
        ...item,
        label: isLatestFour ? latestProjection.label : cleanText(article.label),
        title: cleanText(article.title),
        subtitle: cleanText(article.subtitle),
        image_url: cleanText(article.image_url),
        link_url: currentLink,
        updated_at: updatedAt,
      };
    });
  }

  return { changed, snapshot: changed ? next : snapshot };
}

function linkedSnapshotPatches(
  article: EditorialArticleLiveSnapshot,
  links: readonly string[],
  updatedAt: string,
): EditorialArticleLiveSnapshotPatch[] {
  const headline = projectEditorialArticleToZone(article, "headline");
  const sideBlock = projectEditorialArticleToZone(article, "side_block");
  const complement = projectEditorialArticleToZone(article, "complement");
  const highlight = projectEditorialArticleToZone(article, "highlight");
  const latest = projectEditorialArticleToZone(article, "editorial_line_item");
  const horizontal = projectEditorialArticleToZone(article, "important_item");
  const currentLink = headline.linkUrl;
  const sideBlockText = cleanText(sideBlock.subtitle)?.slice(
    0,
    EDITORIAL_CONTEXT_POST_TITLE_MAX_CHARS,
  ) ?? null;

  if (!currentLink) {
    throw new Error("editorial-article-live-snapshot-slug-missing");
  }

  return [
    {
      table: "matchday_editorials",
      linkField: "headline_link_url",
      links,
      payload: {
        title: headline.title,
        summary: headline.subtitle,
        image_url: headline.imageUrl,
        headline_link_url: currentLink,
        updated_at: updatedAt,
      },
    },
    {
      table: "matchday_editorials",
      linkField: "side_block_link_url",
      links,
      payload: {
        side_block_label: sideBlock.label,
        side_block_title: sideBlock.title,
        side_block_author: cleanText(article.author),
        side_block_text: sideBlockText,
        side_block_image_url: sideBlock.imageUrl,
        side_block_link_url: currentLink,
        updated_at: updatedAt,
      },
    },
    {
      table: "matchday_editorials",
      linkField: "complementary_link_url",
      links,
      payload: {
        complementary_label: complement.label,
        complementary_title: complement.title,
        complementary_text: complement.subtitle,
        complementary_image_url: complement.imageUrl,
        complementary_link_url: currentLink,
        updated_at: updatedAt,
      },
    },
    {
      table: "matchday_highlights",
      linkField: "link_url",
      links,
      payload: {
        title: highlight.title,
        subtitle: highlight.subtitle,
        image_url: highlight.imageUrl,
        link_url: currentLink,
        updated_at: updatedAt,
      },
    },
    {
      table: "matchday_latest_news",
      linkField: "link_url",
      links,
      payload: {
        time_label: latest.label,
        title: latest.title,
        subtitle: latest.subtitle,
        image_url: latest.imageUrl,
        link_url: currentLink,
        updated_at: updatedAt,
      },
    },
    {
      table: "matchday_horizontal_news",
      linkField: "link_url",
      links,
      payload: {
        label: horizontal.label,
        title: horizontal.title,
        subtitle: horizontal.subtitle,
        image_url: horizontal.imageUrl,
        link_url: currentLink,
        updated_at: updatedAt,
      },
    },
    {
      table: "site_editorials",
      linkField: "headline_link_url",
      links,
      payload: {
        headline_title: headline.title,
        headline_subtitle: headline.subtitle,
        headline_image_url: headline.imageUrl,
        headline_link_url: currentLink,
        updated_at: updatedAt,
      },
    },
    {
      table: "site_editorials",
      linkField: "side_block_link_url",
      links,
      payload: {
        side_block_label: sideBlock.label,
        side_block_title: sideBlock.title,
        side_block_author: cleanText(article.author),
        side_block_text: sideBlockText,
        side_block_image_url: sideBlock.imageUrl,
        side_block_link_url: currentLink,
        updated_at: updatedAt,
      },
    },
    {
      table: "site_editorials",
      linkField: "complementary_link_url",
      links,
      payload: {
        complementary_label: complement.label,
        complementary_title: complement.title,
        complementary_text: complement.subtitle,
        complementary_image_url: complement.imageUrl,
        complementary_link_url: currentLink,
        updated_at: updatedAt,
      },
    },
    {
      table: "site_editorial_highlights",
      linkField: "link_url",
      links,
      payload: {
        title: highlight.title,
        subtitle: highlight.subtitle,
        image_url: highlight.imageUrl,
        link_url: currentLink,
        updated_at: updatedAt,
      },
    },
    {
      table: "site_editorial_latest_news",
      linkField: "link_url",
      links,
      payload: {
        time_label: latest.label,
        title: latest.title,
        subtitle: latest.subtitle,
        image_url: latest.imageUrl,
        link_url: currentLink,
        updated_at: updatedAt,
      },
    },
    {
      table: "site_editorial_horizontal_news",
      linkField: "link_url",
      links,
      payload: {
        label: horizontal.label,
        title: horizontal.title,
        subtitle: horizontal.subtitle,
        image_url: horizontal.imageUrl,
        link_url: currentLink,
        updated_at: updatedAt,
      },
    },
  ];
}

export function createEditorialArticleLiveSnapshotSync(
  dependencies: EditorialArticleLiveSnapshotSyncDependencies,
) {
  return async function syncEditorialArticleLiveSnapshotsWithDependencies({
    previousSlug,
    article,
  }: EditorialArticleLiveSnapshotSyncInput): Promise<EditorialArticleLiveSnapshotSyncResult> {
    const currentLink = articlePath(article.slug);
    if (!currentLink) {
      throw new Error("editorial-article-live-snapshot-slug-missing");
    }

    const links = uniqueValues([articlePath(previousSlug), currentLink]);
    const updatedAt = dependencies.now();
    const [affectedMatchdayIds, liveLayoutItems, liveCarryovers] = await Promise.all([
      dependencies.readAffectedMatchdayIds(links),
      dependencies.readLiveLayoutItems(links),
      dependencies.readLiveCarryovers(links),
    ]);
    const linkedPatches = linkedSnapshotPatches(article, links, updatedAt);
    const liveLayoutPayload = {
      label: cleanText(article.label),
      title: cleanText(article.title),
      subtitle: cleanText(article.subtitle),
      image_url: cleanText(article.image_url),
      link_url: currentLink,
      updated_at: updatedAt,
    };
    const directlyUpdatedLiveLayoutItems = liveLayoutItems.filter(
      (row) => !isLatestFourNewsSlotType(row.slot_type),
    );
    const updatedCarryovers = liveCarryovers.flatMap((row) => {
      const result = syncLiveCarryoverSnapshot(
        row.carryover_snapshot,
        article,
        links,
        updatedAt,
      );
      return result.changed ? [{ row, snapshot: result.snapshot }] : [];
    });

    await Promise.all([
      ...linkedPatches.map((patch) => dependencies.patchLinkedSnapshots(patch)),
      ...directlyUpdatedLiveLayoutItems.map((row) => (
        dependencies.patchLiveLayoutItem(row.id, liveLayoutPayload)
      )),
      ...updatedCarryovers.map(({ row, snapshot }) => (
        dependencies.patchLiveCarryover(row, snapshot)
      )),
    ]);

    const matchdayIds = uniqueValues([
      ...affectedMatchdayIds,
      ...liveLayoutItems.map((row) => row.matchday_id),
    ]);
    await Promise.all(
      matchdayIds.map((matchdayId) => (
        dependencies.syncLatestFourNewsProjection(matchdayId)
      )),
    );

    return {
      affectedMatchdayIds: matchdayIds,
      updatedLiveLayoutItemIds: directlyUpdatedLiveLayoutItems.map((row) => row.id),
      updatedCarryoverMatchdayIds: updatedCarryovers.map(({ row }) => row.matchday_id),
    };
  };
}

function linkFilter(links: readonly string[]) {
  return `in.(${links.map((link) => encodeURIComponent(link)).join(",")})`;
}

async function readAffectedMatchdayIds(links: readonly string[]) {
  const filter = linkFilter(links);
  const rows = await Promise.all([
    fetchSupabaseAdminTable<MatchdayIdRow>(
      `matchday_editorials?select=matchday_id&headline_link_url=${filter}`,
    ),
    fetchSupabaseAdminTable<MatchdayIdRow>(
      `matchday_editorials?select=matchday_id&side_block_link_url=${filter}`,
    ),
    fetchSupabaseAdminTable<MatchdayIdRow>(
      `matchday_editorials?select=matchday_id&complementary_link_url=${filter}`,
    ),
    fetchSupabaseAdminTable<MatchdayIdRow>(
      `matchday_highlights?select=matchday_id&link_url=${filter}`,
    ),
    fetchSupabaseAdminTable<MatchdayIdRow>(
      `matchday_latest_news?select=matchday_id&link_url=${filter}`,
    ),
    fetchSupabaseAdminTable<MatchdayIdRow>(
      `matchday_horizontal_news?select=matchday_id&link_url=${filter}`,
    ),
  ]);

  return uniqueValues(rows.flat().map((row) => row.matchday_id));
}

async function readLiveLayoutItems(links: readonly string[]) {
  return fetchSupabaseAdminTable<EditorialArticleLiveLayoutRow>(
    `matchday_live_layout_items?select=id,matchday_id,slot_type,link_url&link_url=${linkFilter(links)}`,
  );
}

async function readLiveCarryovers(links: readonly string[]) {
  const filters = links.flatMap((link) => [
    { version: 2, headline: { link_url: link } },
    { version: 2, side_block: { link_url: link } },
    { version: 2, highlights: [{ link_url: link }] },
    { version: 2, live_layout_items: [{ link_url: link }] },
  ]);
  const rows = await Promise.all(filters.map((value) => (
    fetchSupabaseAdminTable<EditorialArticleLiveCarryoverRow>(
      "matchday_editorial_desk_control"
        + "?select=matchday_id,carryover_source_composition_id,carryover_snapshot"
        + `&carryover_snapshot=cs.${encodeURIComponent(JSON.stringify(value))}`
        + "&limit=1000",
    )
  )));
  const seen = new Set<string>();

  return rows.flat().filter((row) => {
    const key = `${row.matchday_id}:${row.carryover_source_composition_id ?? ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

const syncEditorialArticleLiveSnapshotsWithSupabase =
  createEditorialArticleLiveSnapshotSync({
    readAffectedMatchdayIds,
    readLiveLayoutItems,
    readLiveCarryovers,
    patchLinkedSnapshots(patch) {
      return writeSupabaseAdmin(
        `${patch.table}?${patch.linkField}=${linkFilter(patch.links)}`,
        {
          method: "PATCH",
          body: JSON.stringify(patch.payload),
        },
      );
    },
    patchLiveLayoutItem(rowId, payload) {
      return writeSupabaseAdmin(
        `matchday_live_layout_items?id=eq.${encodeURIComponent(rowId)}`,
        {
          method: "PATCH",
          body: JSON.stringify(payload),
        },
      );
    },
    patchLiveCarryover(row, snapshot) {
      const sourceFilter = row.carryover_source_composition_id
        ? `eq.${encodeURIComponent(row.carryover_source_composition_id)}`
        : "is.null";
      return writeSupabaseAdmin(
        "matchday_editorial_desk_control"
          + `?matchday_id=eq.${encodeURIComponent(row.matchday_id)}`
          + `&carryover_source_composition_id=${sourceFilter}`,
        {
          method: "PATCH",
          body: JSON.stringify({ carryover_snapshot: snapshot }),
        },
      );
    },
    syncLatestFourNewsProjection,
    now() {
      return new Date().toISOString();
    },
  });

export function syncEditorialArticleLiveSnapshots(
  input: EditorialArticleLiveSnapshotSyncInput,
) {
  return syncEditorialArticleLiveSnapshotsWithSupabase(input);
}
