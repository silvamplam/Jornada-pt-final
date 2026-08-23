import type { ClassificationMatch } from "@/lib/classification";
import { fetchSupabaseAdminTable, type SupabaseBroadcastChannel, type SupabaseCompetition, type SupabaseMatch, type SupabaseMatchday, type SupabaseMatchdayEditorial, type SupabaseMatchdayHighlight, type SupabaseMatchdayHorizontalNews, type SupabaseMatchdayLatestNews, type SupabaseMatchdayRoundupItem, type SupabaseSeason, type SupabaseSeasonTeam, type SupabaseTeam } from "@/lib/supabase";
import type { HierarchicalCompositionSlot, ReferenceCompositionPresentationMode } from "@/lib/editorial-hierarchical-composition";
import type { MatchdayLiveLayoutItem } from "@/lib/editorial-matchday-live-layout";
import {
  normalizeMatchdayLivePublicZoneOrder,
  type MatchdayLivePublicZoneKey,
} from "@/lib/editorial-matchday-live-zone-order";

export type PublicSeasonParticipant = SupabaseSeasonTeam & {
  team: SupabaseTeam | null;
};

export type PublicSeasonMatch = SupabaseMatch & {
  live_started_at: string | null;
  live_base_minute: number | null;
  is_clock_running: boolean | null;
  matchday: SupabaseMatchday | null;
  homeTeam: SupabaseTeam | null;
  awayTeam: SupabaseTeam | null;
  broadcastChannel: SupabaseBroadcastChannel | null;
};

export type PublicReferenceComposition = {
  id: string;
  matchday_id: string;
  status: "draft" | "published";
  is_current: boolean;
  internal_name: string | null;
  use_roundup_items: boolean | null;
  presentation_mode: ReferenceCompositionPresentationMode;
  hierarchical_editorial_title: string | null;
  hierarchical_editorial_excerpt: string | null;
  hierarchical_editorial_text: string | null;
  hierarchical_editorial_author: string | null;
  published_at: string | null;
};

export type PublicReferenceCompositionItem = {
  id: string;
  composition_id: string;
  slot_type: string;
  source_type: string | null;
  source_id: string | null;
  article_id: string | null;
  sort_order: number;
  title_snapshot: string | null;
  subtitle_snapshot: string | null;
  image_url_snapshot: string | null;
  link_url_snapshot: string | null;
  label_snapshot: string | null;
  label_color_snapshot: string | null;
  media_kind_snapshot?: string | null;
  media_embed_url_snapshot?: string | null;
  media_video_url_snapshot?: string | null;
  status: string | null;
};

export type PublicReferenceCompositionSlots = Record<string, PublicReferenceCompositionItem[]>;

export type PublicMatchdayHighlight = SupabaseMatchdayHighlight & {
  subtitle?: string | null;
  link_url?: string | null;
};

export type PublicMatchdayEditorial = SupabaseMatchdayEditorial & {
  latest_zone_title_color?: string | null;
};

export type PublicMatchdayHeadlineMedia = {
  kind: "embed" | "direct_video";
  embed_url: string | null;
  video_url: string | null;
  poster_url: string | null;
  caption: string | null;
  content_slug: string;
  content_type: string | null;
  title: string | null;
};

export type PublicMatchdayEditorialCarryover = {
  sourceMatchdayId: string;
  sourceCompositionId: string;
  headline: {
    title: string | null;
    summary: string | null;
    imageUrl: string | null;
    linkUrl: string | null;
  } | null;
  sideBlock: {
    label: string | null;
    labelColor: string | null;
    title: string | null;
    titleColor: string | null;
    author: string | null;
    text: string | null;
    imageUrl: string | null;
    linkUrl: string | null;
  } | null;
  highlights: Array<{
    id: string;
    sortOrder: number;
    label: string | null;
    labelColor: string | null;
    title: string | null;
    subtitle: string | null;
    imageUrl: string | null;
    linkUrl: string | null;
  }>;
  liveLayoutItems: MatchdayLiveLayoutItem[];
};

export type PublicMatchdayEditorialDeskControl = {
  isManaged: boolean;
  faixaVisible: boolean;
  revision: number;
  liveZoneOrder: MatchdayLivePublicZoneKey[];
  carryover: PublicMatchdayEditorialCarryover | null;
};

export type PublicMatchdayContext = {
  competition: SupabaseCompetition;
  season: SupabaseSeason;
  seasons: SupabaseSeason[];
  matchday: SupabaseMatchday;
  matchdays: SupabaseMatchday[];
  activeParticipantCount: number;
  participants: PublicSeasonParticipant[];
  matchesForSeason: ClassificationMatch[];
  matchesForMatchday: PublicSeasonMatch[];
  editorial: PublicMatchdayEditorial | null;
  highlights: PublicMatchdayHighlight[];
  roundupItems: SupabaseMatchdayRoundupItem[];
  latestNews: SupabaseMatchdayLatestNews[];
  horizontalNews: SupabaseMatchdayHorizontalNews[];
  liveLayoutItems: MatchdayLiveLayoutItem[];
  editorialDeskControl: PublicMatchdayEditorialDeskControl;
  headlineMedia: PublicMatchdayHeadlineMedia | null;
  complementMedia: PublicMatchdayHeadlineMedia | null;
  referenceComposition: PublicReferenceComposition | null;
  referenceCompositionItems: PublicReferenceCompositionItem[];
  hierarchicalCompositionSlots: HierarchicalCompositionSlot[];
  referenceSlots: PublicReferenceCompositionSlots;
  referenceRoundupItems: SupabaseMatchdayRoundupItem[];
  hasPublishedReferenceComposition: boolean;
  hasReferenceRoundupItems: boolean;
};

export type PublicMatchdayDiagnostic = {
  params: {
    competitionSlug: string;
    seasonLabel: string;
    normalizedSeasonLabel: string;
    matchdayNumber: number;
  };
  step: string;
  message: string;
  competitionsFound?: number;
  availableCompetitionSlugs?: string[];
  seasonsFound?: number;
  availableSeasonLabels?: string[];
  availableSeasonUrlLabels?: string[];
  matchdaysFound?: number;
  availableMatchdayNumbers?: number[];
  participantsFound?: number;
  matchesFound?: number;
  error?: string;
};

export type PublicMatchdayDiagnosticResult = {
  context: PublicMatchdayContext | null;
  diagnostic: PublicMatchdayDiagnostic;
};

export type PublicSeasonMatchdaySummary = SupabaseMatchday & {
  matchCount: number;
  finishedMatchCount: number;
};

export type PublicSeasonContext = {
  competition: SupabaseCompetition;
  season: SupabaseSeason;
  matchdays: PublicSeasonMatchdaySummary[];
};

export function seasonLabelToUrlSegment(label: string) {
  return label.trim().replace(/\//g, "-");
}

function normalizeSeasonSegment(value: string) {
  return value.trim().toLowerCase().replace(/\//g, "-");
}

function byId<T extends { id: string }>(items: T[]) {
  return new Map(items.map((item) => [item.id, item]));
}

function idList(ids: string[]) {
  return ids.map((id) => encodeURIComponent(id)).join(",");
}

async function readTeams(ids: string[]) {
  const uniqueIds = Array.from(new Set(ids.filter(Boolean)));
  if (uniqueIds.length === 0) {
    return [];
  }

  return fetchSupabaseAdminTable<SupabaseTeam>(
    `teams?select=id,name,public_name,short_name,code,slug,country,logo_url,primary_color&id=in.(${idList(uniqueIds)})&limit=1000`
  );
}

async function readBroadcastChannels(ids: string[]) {
  const uniqueIds = Array.from(new Set(ids.filter(Boolean)));
  if (uniqueIds.length === 0) {
    return [];
  }

  return fetchSupabaseAdminTable<SupabaseBroadcastChannel>(
    `broadcast_channels?select=id,name,platform,country,logo_url&id=in.(${idList(uniqueIds)})&limit=500`
  );
}

async function readMatchdayEditorial(matchdayId: string): Promise<PublicMatchdayEditorial | null> {
  try {
    const rows = await fetchSupabaseAdminTable<PublicMatchdayEditorial>(
      `matchday_editorials?select=id,matchday_id,title,summary,title_color,image_url,headline_link_url,below_headline_mode,below_headline_heading,below_headline_heading_color,complementary_mode,complementary_roundup_item_id,complementary_label,complementary_text_color,complementary_title,complementary_text,complementary_image_url,complementary_link_url,complementary_status,roundup_video_heading,roundup_video_heading_color,side_block_status,side_block_type,side_block_label,side_block_label_color,side_block_title,side_block_title_color,side_block_author,side_block_text,side_block_image_url,side_block_link_url,latest_zone_mode,latest_zone_placement,latest_zone_title,latest_zone_title_color,status,created_at,updated_at&matchday_id=eq.${encodeURIComponent(
        matchdayId
      )}&limit=1`
    );

    return rows[0] ?? null;
  } catch {
    try {
      const rows = await fetchSupabaseAdminTable<PublicMatchdayEditorial>(
        `matchday_editorials?select=id,matchday_id,title,summary,title_color,image_url,headline_link_url,below_headline_mode,below_headline_heading,below_headline_heading_color,complementary_mode,complementary_roundup_item_id,complementary_label,complementary_text_color,complementary_title,complementary_text,complementary_image_url,complementary_link_url,complementary_status,roundup_video_heading,roundup_video_heading_color,side_block_status,side_block_type,side_block_label,side_block_title,side_block_title_color,side_block_author,side_block_text,side_block_image_url,side_block_link_url,status,created_at,updated_at&matchday_id=eq.${encodeURIComponent(
          matchdayId
        )}&limit=1`
      );

      return rows[0] ?? null;
    } catch {
      return null;
    }
  }
}

async function readPublishedMatchdayHighlights(matchdayId: string) {
  try {
    return fetchSupabaseAdminTable<PublicMatchdayHighlight>(
      `matchday_highlights?select=id,matchday_id,label,label_color,title,subtitle,image_url,link_url,sort_order,status,created_at,updated_at&matchday_id=eq.${encodeURIComponent(
        matchdayId
      )}&status=eq.published&order=sort_order.asc&limit=3`
    );
  } catch {
    try {
      return fetchSupabaseAdminTable<PublicMatchdayHighlight>(
        `matchday_highlights?select=id,matchday_id,label,title,subtitle,image_url,link_url,sort_order,status,created_at,updated_at&matchday_id=eq.${encodeURIComponent(
          matchdayId
        )}&status=eq.published&order=sort_order.asc&limit=3`
      );
    } catch {
      return [];
    }
  }
}

async function readPublishedMatchdayRoundupItems(matchdayId: string) {
  try {
    return fetchSupabaseAdminTable<SupabaseMatchdayRoundupItem>(
      `matchday_roundup_items?select=id,matchday_id,label,title,subtitle,image_url,video_url,duration,is_embeddable,type,sort_order,status,created_at,updated_at&matchday_id=eq.${encodeURIComponent(
        matchdayId
      )}&status=eq.published&order=sort_order.asc&limit=50`
    );
  } catch {
    return [];
  }
}

async function readPublishedMatchdayLatestNews(matchdayId: string) {
  try {
    return fetchSupabaseAdminTable<SupabaseMatchdayLatestNews>(
      `matchday_latest_news?select=id,matchday_id,time_label,time_label_color,title,subtitle,image_url,link_url,article_id,sort_order,status,created_at,updated_at&matchday_id=eq.${encodeURIComponent(
        matchdayId
      )}&status=eq.published&order=sort_order.asc`
    );
  } catch {
    try {
      return fetchSupabaseAdminTable<SupabaseMatchdayLatestNews>(
        `matchday_latest_news?select=id,matchday_id,time_label,title,image_url,sort_order,status,created_at,updated_at&matchday_id=eq.${encodeURIComponent(
          matchdayId
        )}&status=eq.published&order=sort_order.asc`
      );
    } catch {
      return [];
    }
  }
}

async function readPublishedMatchdayHorizontalNews(matchdayId: string) {
  return fetchSupabaseAdminTable<SupabaseMatchdayHorizontalNews>(
    `matchday_horizontal_news?select=id,matchday_id,label,label_color,title,subtitle,image_url,link_url,sort_order,status,created_at,updated_at&matchday_id=eq.${encodeURIComponent(
      matchdayId
    )}&status=eq.published&order=sort_order.asc`
  ).catch(() => []);
}

async function readMatchdayLiveLayoutItems(matchdayId: string) {
  return fetchSupabaseAdminTable<MatchdayLiveLayoutItem>(
    `matchday_live_layout_items?select=id,matchday_id,slot_type,article_id,label,title,subtitle,image_url,link_url,created_at,updated_at&matchday_id=eq.${encodeURIComponent(
      matchdayId
    )}&order=created_at.asc`
  ).catch(() => []);
}

function cleanCarryoverText(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function normalizeEditorialCarryover(
  sourceCompositionId: string | null | undefined,
  value: unknown,
): PublicMatchdayEditorialCarryover | null {
  if (
    !sourceCompositionId ||
    !value ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    return null;
  }

  const snapshot = value as Record<string, unknown>;
  const snapshotCompositionId =
    cleanCarryoverText(snapshot.source_composition_id);
  const sourceMatchdayId =
    cleanCarryoverText(snapshot.source_matchday_id);

  if (
    snapshot.version !== 2 ||
    snapshotCompositionId !== sourceCompositionId ||
    !sourceMatchdayId
  ) {
    return null;
  }

  const objectValue = (candidate: unknown) =>
    candidate &&
    typeof candidate === "object" &&
    !Array.isArray(candidate)
      ? candidate as Record<string, unknown>
      : null;

  const headline = objectValue(snapshot.headline);
  const sideBlock = objectValue(snapshot.side_block);

  const highlights = Array.isArray(snapshot.highlights)
    ? snapshot.highlights
        .map((candidate) => objectValue(candidate))
        .filter(
          (candidate): candidate is Record<string, unknown> =>
            Boolean(candidate)
        )
        .map((candidate) => ({
          id: cleanCarryoverText(candidate.id) ?? "",
          sortOrder:
            typeof candidate.sort_order === "number"
              ? candidate.sort_order
              : 0,
          label: cleanCarryoverText(candidate.label),
          labelColor: cleanCarryoverText(candidate.label_color),
          title: cleanCarryoverText(candidate.title),
          subtitle: cleanCarryoverText(candidate.subtitle),
          imageUrl: cleanCarryoverText(candidate.image_url),
          linkUrl: cleanCarryoverText(candidate.link_url),
        }))
        .filter(
          (candidate) =>
            candidate.id &&
            Number.isSafeInteger(candidate.sortOrder) &&
            candidate.sortOrder > 0
        )
    : [];

  return {
    sourceMatchdayId,
    sourceCompositionId,
    headline: headline
      ? {
          title: cleanCarryoverText(headline.title),
          summary: cleanCarryoverText(headline.summary),
          imageUrl: cleanCarryoverText(headline.image_url),
          linkUrl: cleanCarryoverText(headline.link_url),
        }
      : null,
    sideBlock: sideBlock
      ? {
          label: cleanCarryoverText(sideBlock.label),
          labelColor: cleanCarryoverText(sideBlock.label_color),
          title: cleanCarryoverText(sideBlock.title),
          titleColor: cleanCarryoverText(sideBlock.title_color),
          author: cleanCarryoverText(sideBlock.author),
          text: cleanCarryoverText(sideBlock.text),
          imageUrl: cleanCarryoverText(sideBlock.image_url),
          linkUrl: cleanCarryoverText(sideBlock.link_url),
        }
      : null,
    highlights,
    liveLayoutItems: Array.isArray(snapshot.live_layout_items)
      ? snapshot.live_layout_items as MatchdayLiveLayoutItem[]
      : [],
  };
}

async function readMatchdayEditorialDeskControl(
  matchdayId: string,
): Promise<PublicMatchdayEditorialDeskControl> {
  const rows = await fetchSupabaseAdminTable<{
    is_managed: boolean;
    faixa_visible: boolean;
    revision: number;
    live_public_zone_order: unknown;
    carryover_source_composition_id: string | null;
    carryover_snapshot: unknown;
  }>(
    `matchday_editorial_desk_control?select=is_managed,faixa_visible,revision,live_public_zone_order,carryover_source_composition_id,carryover_snapshot&matchday_id=eq.${encodeURIComponent(
      matchdayId,
    )}&limit=1`,
  ).catch(() => []);

  const control = rows[0] ?? null;

  if (control) {
    return {
      isManaged: control.is_managed === true,
      faixaVisible: control.faixa_visible !== false,
      revision: Number.isSafeInteger(control.revision)
        ? control.revision
        : 0,
      liveZoneOrder: normalizeMatchdayLivePublicZoneOrder(
        control.live_public_zone_order,
      ),
      carryover: normalizeEditorialCarryover(
        control.carryover_source_composition_id,
        control.carryover_snapshot,
      ),
    };
  }

  // Compatibilidade enquanto a migração ainda não existir no ambiente.
  const legacyRows = await fetchSupabaseAdminTable<{
    is_managed: boolean;
    faixa_visible: boolean;
    revision: number;
  }>(
    `matchday_editorial_desk_control?select=is_managed,faixa_visible,revision&matchday_id=eq.${encodeURIComponent(
      matchdayId,
    )}&limit=1`,
  ).catch(() => []);

  const legacy = legacyRows[0] ?? null;

  return {
    isManaged: legacy?.is_managed === true,
    faixaVisible: legacy?.faixa_visible !== false,
    revision: Number.isSafeInteger(legacy?.revision)
      ? legacy?.revision ?? 0
      : 0,
    liveZoneOrder: normalizeMatchdayLivePublicZoneOrder(null),
    carryover: null,
  };
}

function groupReferenceCompositionSlots(items: PublicReferenceCompositionItem[]) {
  return items.reduce<PublicReferenceCompositionSlots>((slots, item) => {
    const slotType = item.slot_type || "unknown";
    slots[slotType] = [...(slots[slotType] ?? []), item];
    return slots;
  }, {});
}

function cleanReferenceSnapshotText(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed || null;
}

type EditorialHeadlineContentRow = {
  slug: string | null;
  status: string | null;
  content_type: string | null;
  video_url: string | null;
  video_provider: string | null;
  embed_url: string | null;
  is_embeddable: boolean | null;
  thumbnail_url: string | null;
  image_url: string | null;
  image_caption: string | null;
  title: string | null;
};

function contentSlugFromHref(value?: string | null) {
  const cleanValue = cleanReferenceSnapshotText(value);
  if (!cleanValue) {
    return null;
  }

  try {
    const isAbsoluteUrl = /^https?:\/\//i.test(cleanValue);
    const url = new URL(cleanValue, "https://jornada.pt");
    if (isAbsoluteUrl && url.hostname !== "jornada.pt" && url.hostname !== "www.jornada.pt") {
      return null;
    }

    const [section, slug] = url.pathname.split("/").filter(Boolean);
    return section === "conteudos" && slug ? decodeURIComponent(slug) : null;
  } catch {
    return null;
  }
}

function isDirectVideoUrl(value: string) {
  try {
    const url = new URL(value);
    return /\.(mp4|webm|ogg)$/i.test(url.pathname);
  } catch {
    return false;
  }
}

async function readPublishedHeadlineMedia(linkUrl?: string | null): Promise<PublicMatchdayHeadlineMedia | null> {
  const slug = contentSlugFromHref(linkUrl);
  if (!slug) {
    return null;
  }

  try {
    const rows = await fetchSupabaseAdminTable<EditorialHeadlineContentRow>(
      `editorial_contents?select=slug,status,content_type,video_url,video_provider,embed_url,is_embeddable,thumbnail_url,image_url,image_caption,title&slug=eq.${encodeURIComponent(
        slug
      )}&status=eq.published&limit=1`
    );
    const content = rows[0] ?? null;
    if (!content) {
      return null;
    }

    const posterUrl = cleanReferenceSnapshotText(content.thumbnail_url) ?? cleanReferenceSnapshotText(content.image_url);
    const embedUrl = content.is_embeddable ? cleanReferenceSnapshotText(content.embed_url) : null;
    if (embedUrl) {
      return {
        kind: "embed",
        embed_url: embedUrl,
        video_url: null,
        poster_url: posterUrl,
        caption: cleanReferenceSnapshotText(content.image_caption),
        content_slug: slug,
        content_type: cleanReferenceSnapshotText(content.content_type),
        title: cleanReferenceSnapshotText(content.title)
      };
    }

    const videoUrl = cleanReferenceSnapshotText(content.video_url);
    if (videoUrl && isDirectVideoUrl(videoUrl)) {
      return {
        kind: "direct_video",
        embed_url: null,
        video_url: videoUrl,
        poster_url: posterUrl,
        caption: cleanReferenceSnapshotText(content.image_caption),
        content_slug: slug,
        content_type: cleanReferenceSnapshotText(content.content_type),
        title: cleanReferenceSnapshotText(content.title)
      };
    }
  } catch {
    return null;
  }

  return null;
}

function normalizeRoundupType(value?: string | null): SupabaseMatchdayRoundupItem["type"] {
  if (value === "video" || value === "golos" || value === "resumo" || value === "noticia") {
    return value;
  }

  return "video";
}

async function readRoundupItemsByIds(matchdayId: string, ids: string[]) {
  const uniqueIds = Array.from(new Set(ids.filter(Boolean)));

  if (uniqueIds.length === 0) {
    return [];
  }

  try {
    return fetchSupabaseAdminTable<SupabaseMatchdayRoundupItem>(
      `matchday_roundup_items?select=id,matchday_id,label,title,subtitle,image_url,video_url,duration,is_embeddable,type,sort_order,status,created_at,updated_at&id=in.(${idList(
        uniqueIds
      )})&matchday_id=eq.${encodeURIComponent(matchdayId)}&limit=200`
    );
  } catch {
    return [];
  }
}

async function buildReferenceRoundupItems(matchdayId: string, referenceItems: PublicReferenceCompositionItem[]) {
  const roundupReferenceItems = referenceItems
    .filter((item) => item.slot_type === "roundup")
    .sort((a, b) => a.sort_order - b.sort_order);
  const sourceIds = roundupReferenceItems
    .filter((item) => item.source_type === "matchday_roundup_item" && Boolean(item.source_id))
    .map((item) => item.source_id as string);
  const sourceRoundupItems = await readRoundupItemsByIds(matchdayId, sourceIds);
  const sourceRoundupItemsById = byId(sourceRoundupItems);

  return roundupReferenceItems.map((item): SupabaseMatchdayRoundupItem => {
    const sourceItem = item.source_id ? sourceRoundupItemsById.get(item.source_id) ?? null : null;

    return {
      id: item.source_id || item.id,
      matchday_id: sourceItem?.matchday_id ?? matchdayId,
      label: cleanReferenceSnapshotText(item.label_snapshot) ?? sourceItem?.label ?? null,
      title: cleanReferenceSnapshotText(item.title_snapshot) ?? sourceItem?.title ?? null,
      subtitle: cleanReferenceSnapshotText(item.subtitle_snapshot) ?? sourceItem?.subtitle ?? null,
      image_url: cleanReferenceSnapshotText(item.image_url_snapshot) ?? sourceItem?.image_url ?? null,
      video_url: cleanReferenceSnapshotText(item.link_url_snapshot) ?? sourceItem?.video_url ?? null,
      duration: sourceItem?.duration ?? null,
      type: normalizeRoundupType(sourceItem?.type ?? item.label_snapshot),
      sort_order: item.sort_order,
      status: sourceItem?.status ?? "published",
      created_at: sourceItem?.created_at ?? "",
      updated_at: sourceItem?.updated_at ?? ""
    };
  });
}

async function readPublishedReferenceCompositionBundle(matchdayId: string) {
  try {
    const compositions = await fetchSupabaseAdminTable<PublicReferenceComposition>(
      `matchday_reference_compositions?select=id,matchday_id,status,is_current,internal_name,use_roundup_items,presentation_mode,hierarchical_editorial_title,hierarchical_editorial_excerpt,hierarchical_editorial_text,hierarchical_editorial_author,published_at&matchday_id=eq.${encodeURIComponent(
        matchdayId
      )}&status=eq.published&is_current=is.true&order=published_at.desc.nullslast&limit=1`
    );
    const referenceComposition = compositions[0] ?? null;

    if (!referenceComposition) {
      return {
        referenceComposition: null,
        referenceCompositionItems: [],
        hierarchicalCompositionSlots: [],
        referenceSlots: {},
        referenceRoundupItems: [],
        hasPublishedReferenceComposition: false,
        hasReferenceRoundupItems: false
      };
    }

    const referenceItemsQuery =
      `matchday_reference_composition_items?select=id,composition_id,slot_type,source_type,source_id,article_id,sort_order,title_snapshot,subtitle_snapshot,image_url_snapshot,link_url_snapshot,label_snapshot,label_color_snapshot,media_kind_snapshot,media_embed_url_snapshot,media_video_url_snapshot,status&composition_id=eq.${encodeURIComponent(
        referenceComposition.id
      )}&order=sort_order.asc`;
    const referenceCompositionItems = referenceComposition.presentation_mode === "hierarchical"
      ? await fetchSupabaseAdminTable<PublicReferenceCompositionItem>(referenceItemsQuery).catch(() => [])
      : await fetchSupabaseAdminTable<PublicReferenceCompositionItem>(referenceItemsQuery);
    const hierarchicalCompositionSlots = await fetchSupabaseAdminTable<HierarchicalCompositionSlot>(
      `matchday_hierarchical_composition_slots?select=id,composition_id,slot_key,bank_item_id,source_identity,label_snapshot,title_snapshot,subtitle_snapshot,image_url_snapshot,link_url_snapshot,media_kind_snapshot,media_embed_url_snapshot,media_video_url_snapshot,created_at,updated_at&composition_id=eq.${encodeURIComponent(
        referenceComposition.id
      )}`
    ).catch(() => []);
    const referenceSlots = groupReferenceCompositionSlots(referenceCompositionItems);
    const referenceRoundupItems = await buildReferenceRoundupItems(matchdayId, referenceSlots.roundup ?? []);

    return {
      referenceComposition,
      referenceCompositionItems,
      hierarchicalCompositionSlots,
      referenceSlots,
      referenceRoundupItems,
      hasPublishedReferenceComposition: true,
      hasReferenceRoundupItems: referenceRoundupItems.length > 0
    };
  } catch {
    return {
      referenceComposition: null,
      referenceCompositionItems: [],
      hierarchicalCompositionSlots: [],
      referenceSlots: {},
      referenceRoundupItems: [],
      hasPublishedReferenceComposition: false,
      hasReferenceRoundupItems: false
    };
  }
}

export async function getPublicSeasonContext({
  competitionSlug,
  seasonLabel
}: {
  competitionSlug: string;
  seasonLabel: string;
}): Promise<PublicSeasonContext | null> {
  const normalizedSeasonLabel = normalizeSeasonSegment(seasonLabel);
  const competitions = await fetchSupabaseAdminTable<SupabaseCompetition>(
    "competitions?select=id,name,slug,country_id,country,logo_url,accent_color,is_active&order=name.asc&limit=500"
  );
  const competition = competitions.find((item) => item.slug === competitionSlug && item.is_active !== false) ?? null;

  if (!competition) {
    return null;
  }

  const seasons = await fetchSupabaseAdminTable<SupabaseSeason>(
    `seasons?select=id,competition_id,label,starts_on,ends_on,is_current&competition_id=eq.${encodeURIComponent(competition.id)}&order=label.desc&limit=100`
  );
  const season =
    seasons.find((item) => normalizeSeasonSegment(seasonLabelToUrlSegment(item.label)) === normalizedSeasonLabel) ?? null;

  if (!season) {
    return null;
  }

  const [matchdays, matches] = await Promise.all([
    fetchSupabaseAdminTable<SupabaseMatchday>(
      `matchdays?select=id,season_id,number,label,starts_on,ends_on,status,context_summary&season_id=eq.${encodeURIComponent(season.id)}&order=number.asc&limit=100`
    ),
    fetchSupabaseAdminTable<SupabaseMatch>(
      `matches?select=id,season_id,matchday_id,status&season_id=eq.${encodeURIComponent(season.id)}&limit=1000`
    )
  ]);
  const matchdaysWithCounts = matchdays.map((matchday) => {
    const matchdayMatches = matches.filter((match) => match.matchday_id === matchday.id);

    return {
      ...matchday,
      matchCount: matchdayMatches.length,
      finishedMatchCount: matchdayMatches.filter((match) => match.status === "finished").length
    };
  });

  return {
    competition,
    season,
    matchdays: matchdaysWithCounts
  };
}

export async function getPublicMatchdayContext({
  competitionSlug,
  seasonLabel,
  matchdayNumber
}: {
  competitionSlug: string;
  seasonLabel: string;
  matchdayNumber: number;
}): Promise<PublicMatchdayContext | null> {
  return (await getPublicMatchdayDiagnostic({ competitionSlug, seasonLabel, matchdayNumber })).context;
}

export async function getPublicMatchdayDiagnostic({
  competitionSlug,
  seasonLabel,
  matchdayNumber
}: {
  competitionSlug: string;
  seasonLabel: string;
  matchdayNumber: number;
}): Promise<PublicMatchdayDiagnosticResult> {
  const normalizedSeasonLabel = normalizeSeasonSegment(seasonLabel);
  const baseDiagnostic: PublicMatchdayDiagnostic = {
    params: {
      competitionSlug,
      seasonLabel,
      normalizedSeasonLabel,
      matchdayNumber
    },
    step: "start",
    message: "Diagnostico iniciado."
  };

  if (!Number.isInteger(matchdayNumber) || matchdayNumber < 1) {
    return {
      context: null,
      diagnostic: {
        ...baseDiagnostic,
        step: "invalid-matchday-number",
        message: "O parametro matchdayNumber nao e um numero inteiro valido."
      }
    };
  }

  try {
    const competitions = await fetchSupabaseAdminTable<SupabaseCompetition>(
      "competitions?select=id,name,slug,country_id,country,logo_url,accent_color,is_active&order=name.asc&limit=500"
    );
    const competition = competitions.find((item) => item.slug === competitionSlug) ?? null;

    if (!competition) {
      return {
        context: null,
        diagnostic: {
          ...baseDiagnostic,
          step: "competition-not-found",
          message: "Competicao nao encontrada pelo slug recebido.",
          competitionsFound: competitions.length,
          availableCompetitionSlugs: competitions.map((item) => item.slug).filter(Boolean).slice(0, 40)
        }
      };
    }

    if (competition.is_active === false) {
      return {
        context: null,
        diagnostic: {
          ...baseDiagnostic,
          step: "competition-inactive",
          message: "A competicao existe, mas esta marcada como inativa.",
          competitionsFound: competitions.length,
          availableCompetitionSlugs: competitions.map((item) => item.slug).filter(Boolean).slice(0, 40)
        }
      };
    }

    const seasons = await fetchSupabaseAdminTable<SupabaseSeason>(
      `seasons?select=id,competition_id,label,starts_on,ends_on,is_current&competition_id=eq.${encodeURIComponent(competition.id)}&order=label.desc&limit=100`
    );
    const season =
      seasons.find((item) => normalizeSeasonSegment(seasonLabelToUrlSegment(item.label)) === normalizedSeasonLabel) ?? null;

    if (!season) {
      return {
        context: null,
        diagnostic: {
          ...baseDiagnostic,
          step: "season-not-found",
          message: "Epoca nao encontrada para esta competicao.",
          competitionsFound: competitions.length,
          seasonsFound: seasons.length,
          availableSeasonLabels: seasons.map((item) => item.label),
          availableSeasonUrlLabels: seasons.map((item) => seasonLabelToUrlSegment(item.label))
        }
      };
    }

    const [matchdays, participants] = await Promise.all([
      fetchSupabaseAdminTable<SupabaseMatchday>(
        `matchdays?select=id,season_id,number,label,starts_on,ends_on,status,context_summary&season_id=eq.${encodeURIComponent(season.id)}&order=number.asc&limit=100`
      ),
      fetchSupabaseAdminTable<SupabaseSeasonTeam>(
        `season_teams?select=id,season_id,team_id,display_order,status,data_source,sync_status,manual_override&season_id=eq.${encodeURIComponent(season.id)}&order=display_order.asc&limit=1000`
      )
    ]);
    const matchday = matchdays.find((item) => item.number === matchdayNumber) ?? null;

    if (!matchday) {
      return {
        context: null,
        diagnostic: {
          ...baseDiagnostic,
          step: "matchday-not-found",
          message: "Jornada nao encontrada para esta epoca.",
          competitionsFound: competitions.length,
          seasonsFound: seasons.length,
          matchdaysFound: matchdays.length,
          availableMatchdayNumbers: matchdays.map((item) => item.number)
        }
      };
    }

    const activeParticipantCount = participants.filter((participant) => participant.status !== "inactive").length;
    const manualParticipants = participants.filter(
      (participant) =>
        participant.data_source === "manual" &&
        participant.sync_status === "manual" &&
        participant.manual_override === true
    );
    const classificationMatchdayIds = matchdays
      .filter((item) => item.number <= matchday.number)
      .map((item) => item.id);
    const [matchesForSeason, matchdayMatches] = await Promise.all([
      fetchSupabaseAdminTable<ClassificationMatch>(
        `matches?select=season_id,matchday_id,home_team_id,away_team_id,scheduled_date,kickoff_at,status,home_score,away_score&season_id=eq.${encodeURIComponent(season.id)}&matchday_id=in.(${classificationMatchdayIds.join(",")})&limit=1000`
      ),
      fetchSupabaseAdminTable<PublicSeasonMatch>(
        `matches?select=id,competition_id,season_id,matchday_id,home_team_id,away_team_id,status,minute,live_started_at,live_base_minute,is_clock_running,scheduled_date,kickoff_at,home_score,away_score,venue,broadcast_channel_id&season_id=eq.${encodeURIComponent(season.id)}&matchday_id=eq.${encodeURIComponent(matchday.id)}&order=scheduled_date.asc.nullslast,kickoff_at.asc.nullslast,id.asc&limit=1000`
      )
    ]);

    const teams = await readTeams([
      ...manualParticipants.map((participant) => participant.team_id),
      ...matchdayMatches.flatMap((match) => [match.home_team_id, match.away_team_id])
    ]);
    const [broadcastChannels, editorial, highlights, roundupItems, latestNews, horizontalNews, liveLayoutItems, editorialDeskControl, referenceCompositionBundle] = await Promise.all([
      readBroadcastChannels(matchdayMatches.map((match) => match.broadcast_channel_id ?? "")),
      readMatchdayEditorial(matchday.id),
      readPublishedMatchdayHighlights(matchday.id),
      readPublishedMatchdayRoundupItems(matchday.id),
      readPublishedMatchdayLatestNews(matchday.id),
      readPublishedMatchdayHorizontalNews(matchday.id),
      readMatchdayLiveLayoutItems(matchday.id),
      readMatchdayEditorialDeskControl(matchday.id),
      readPublishedReferenceCompositionBundle(matchday.id)
    ]);
    const teamsById = byId(teams);
    const broadcastChannelsById = byId(broadcastChannels);
    const matchesForMatchday = matchdayMatches.map((match) => ({
      ...match,
      matchday,
      homeTeam: teamsById.get(match.home_team_id) ?? null,
      awayTeam: teamsById.get(match.away_team_id) ?? null,
      broadcastChannel: match.broadcast_channel_id ? broadcastChannelsById.get(match.broadcast_channel_id) ?? null : null
    }));
    const usePublishedReferenceForLivePage =
      referenceCompositionBundle.hasPublishedReferenceComposition && !editorialDeskControl.isManaged;
    const referenceSlots = usePublishedReferenceForLivePage
      ? (referenceCompositionBundle.referenceSlots as PublicReferenceCompositionSlots)
      : null;
    const referenceHeadline = referenceSlots
      ? [...(referenceSlots.headline ?? [])].sort((a, b) => a.sort_order - b.sort_order)[0] ?? null
      : null;
    const referenceComplement = referenceSlots
      ? [...(referenceSlots.complement ?? [])].sort((a, b) => a.sort_order - b.sort_order)[0] ?? null
      : null;
    const publishedHeadline = editorial?.status === "published" ? editorial : null;
    const headlineLinkUrl = referenceHeadline
      ? cleanReferenceSnapshotText(referenceHeadline.link_url_snapshot)
      : cleanReferenceSnapshotText(publishedHeadline?.headline_link_url);
    const headlineMedia = await readPublishedHeadlineMedia(headlineLinkUrl);
    const complementLinkUrl = referenceComplement
      ? cleanReferenceSnapshotText(referenceComplement.link_url_snapshot)
      : editorial?.complementary_status === "published"
        ? cleanReferenceSnapshotText(editorial.complementary_link_url)
        : null;
    const complementMedia =
      complementLinkUrl && complementLinkUrl === headlineLinkUrl ? headlineMedia : await readPublishedHeadlineMedia(complementLinkUrl);

    return {
      context: {
        competition,
        season,
        seasons,
        matchday,
        matchdays,
        activeParticipantCount,
        participants: manualParticipants.map((participant) => ({
          ...participant,
          team: teamsById.get(participant.team_id) ?? null
        })),
        matchesForSeason,
        matchesForMatchday,
        editorial,
        highlights,
        roundupItems,
        latestNews,
        horizontalNews,
        liveLayoutItems,
        editorialDeskControl,
        headlineMedia,
        complementMedia,
        referenceComposition: referenceCompositionBundle.referenceComposition,
        referenceCompositionItems: referenceCompositionBundle.referenceCompositionItems,
        hierarchicalCompositionSlots: referenceCompositionBundle.hierarchicalCompositionSlots,
        referenceSlots: referenceCompositionBundle.referenceSlots,
        referenceRoundupItems: referenceCompositionBundle.referenceRoundupItems,
        hasPublishedReferenceComposition: referenceCompositionBundle.hasPublishedReferenceComposition,
        hasReferenceRoundupItems: referenceCompositionBundle.hasReferenceRoundupItems
      },
      diagnostic: {
        ...baseDiagnostic,
        step: "ok",
        message: "Dados carregados com sucesso.",
        competitionsFound: competitions.length,
        seasonsFound: seasons.length,
        matchdaysFound: matchdays.length,
        participantsFound: manualParticipants.length,
        matchesFound: matchesForSeason.length
      }
    };
  } catch (error) {
    return {
      context: null,
      diagnostic: {
        ...baseDiagnostic,
        step: "load-error",
        message: "Erro ao carregar dados da Supabase.",
        error: error instanceof Error ? error.message : "Erro desconhecido"
      }
    };
  }
}
