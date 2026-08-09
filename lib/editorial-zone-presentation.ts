export type EditorialZoneSlotType =
  | "headline"
  | "editorial_line_item"
  | "side_block"
  | "highlight"
  | "roundup"
  | "complement"
  | "important_item";

export type EditorialNewsFlowSlotType = Extract<
  EditorialZoneSlotType,
  "headline" | "editorial_line_item" | "highlight" | "complement" | "important_item"
>;

export type EditorialAuthorMode = "hidden" | "visible" | "optional";

export type EditorialZonePresentationProfile = {
  slotType: EditorialZoneSlotType;
  publicName: string;
  antetitleLines: number;
  titleLines: number;
  subtitleLines: number;
  bodyLines: number;
  showImage: boolean;
  authorMode: EditorialAuthorMode;
  showDateTimeSeparately: boolean;
  isNewsFlowZone: boolean;
  capacity: number | null;
  autoPublishedTimeInAntetitle?: boolean;
  subtitleDefaultVisible?: boolean;
};

export const EDITORIAL_ZONE_PRESENTATION_PROFILES: Record<EditorialZoneSlotType, EditorialZonePresentationProfile> = {
  headline: {
    slotType: "headline",
    publicName: "Manchete",
    antetitleLines: 0,
    titleLines: 5,
    subtitleLines: 6,
    bodyLines: 0,
    showImage: true,
    authorMode: "optional",
    showDateTimeSeparately: false,
    isNewsFlowZone: true,
    capacity: 1,
    subtitleDefaultVisible: true
  },
  editorial_line_item: {
    slotType: "editorial_line_item",
    publicName: "Últimas",
    antetitleLines: 1,
    titleLines: 4,
    subtitleLines: 0,
    bodyLines: 0,
    showImage: false,
    authorMode: "hidden",
    showDateTimeSeparately: false,
    isNewsFlowZone: true,
    capacity: null,
    autoPublishedTimeInAntetitle: true,
    subtitleDefaultVisible: false
  },
  side_block: {
    slotType: "side_block",
    publicName: "Contexto",
    antetitleLines: 2,
    titleLines: 6,
    subtitleLines: 0,
    bodyLines: 15,
    showImage: true,
    authorMode: "visible",
    showDateTimeSeparately: false,
    isNewsFlowZone: false,
    capacity: 1,
    subtitleDefaultVisible: true
  },
  highlight: {
    slotType: "highlight",
    publicName: "3 notícias abaixo da manchete",
    antetitleLines: 0,
    titleLines: 3,
    subtitleLines: 3,
    bodyLines: 0,
    showImage: true,
    authorMode: "hidden",
    showDateTimeSeparately: false,
    isNewsFlowZone: true,
    capacity: 3,
    subtitleDefaultVisible: true
  },
  roundup: {
    slotType: "roundup",
    publicName: "Vídeo",
    antetitleLines: 1,
    titleLines: 1,
    subtitleLines: 1,
    bodyLines: 0,
    showImage: true,
    authorMode: "hidden",
    showDateTimeSeparately: false,
    isNewsFlowZone: false,
    capacity: null,
    subtitleDefaultVisible: true
  },
  complement: {
    slotType: "complement",
    publicName: "Notícia ao lado do vídeo",
    antetitleLines: 1,
    titleLines: 1,
    subtitleLines: 1,
    bodyLines: 0,
    showImage: true,
    authorMode: "hidden",
    showDateTimeSeparately: false,
    isNewsFlowZone: true,
    capacity: 1,
    subtitleDefaultVisible: true
  },
  important_item: {
    slotType: "important_item",
    publicName: "Faixa de notícias",
    antetitleLines: 1,
    titleLines: 3,
    subtitleLines: 3,
    bodyLines: 0,
    showImage: true,
    authorMode: "optional",
    showDateTimeSeparately: false,
    isNewsFlowZone: true,
    capacity: null,
    subtitleDefaultVisible: true
  }
};

export const EDITORIAL_NEWS_FLOW_SLOT_TYPES: EditorialNewsFlowSlotType[] = [
  "headline",
  "editorial_line_item",
  "highlight",
  "complement",
  "important_item"
];

const editorialNewsFlowSlotTypeSet = new Set<string>(EDITORIAL_NEWS_FLOW_SLOT_TYPES);

export function isEditorialNewsFlowSlotType(value?: string | null): value is EditorialNewsFlowSlotType {
  return Boolean(value && editorialNewsFlowSlotTypeSet.has(value));
}

export type EditorialArticleZoneSource = {
  id: string;
  slug: string | null;
  label: string | null;
  title: string | null;
  subtitle: string | null;
  image_url: string | null;
  author?: string | null;
  published_at: string | null;
};

export type EditorialArticleZoneProjection = {
  title: string | null;
  subtitle: string | null;
  imageUrl: string | null;
  linkUrl: string | null;
  label: string | null;
};

function cleanText(value?: string | null) {
  const clean = value?.trim();
  return clean ? clean : null;
}

export function formatEditorialPublishedTime(value?: string | null) {
  const clean = cleanText(value);
  if (!clean) return null;

  const date = new Date(clean);
  if (Number.isNaN(date.getTime())) return null;

  return new Intl.DateTimeFormat("pt-PT", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Europe/Lisbon"
  }).format(date);
}

export function buildLatestNewsAntetitle(source: EditorialArticleZoneSource) {
  const time = formatEditorialPublishedTime(source.published_at);
  const label = cleanText(source.label);

  return [time, label].filter(Boolean).join(" · ") || null;
}

export function projectEditorialArticleToZone(
  source: EditorialArticleZoneSource,
  slotType: EditorialNewsFlowSlotType
): EditorialArticleZoneProjection {
  const profile = EDITORIAL_ZONE_PRESENTATION_PROFILES[slotType];
  const title = cleanText(source.title);
  const sourceSubtitle = cleanText(source.subtitle);
  const sourceImage = cleanText(source.image_url);
  const sourceLabel = cleanText(source.label);
  const linkUrl = cleanText(source.slug) ? `/noticias/${source.slug!.trim()}` : null;

  return {
    title,
    subtitle: profile.subtitleDefaultVisible === false ? null : sourceSubtitle,
    imageUrl: profile.showImage ? sourceImage : null,
    linkUrl,
    label: profile.autoPublishedTimeInAntetitle
      ? buildLatestNewsAntetitle(source)
      : profile.antetitleLines > 0
        ? sourceLabel
        : null
  };
}
