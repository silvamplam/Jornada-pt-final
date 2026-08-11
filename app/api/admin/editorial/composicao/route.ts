import { adminRelativeRedirect } from "@/lib/admin-relative-redirect";
import {
  editorialArticleCanonicalMissingLabel,
  missingEditorialArticleCanonicalFields,
} from "@/lib/editorial-article-canonical";
import {
  EDITORIAL_NEWS_FLOW_SLOT_TYPES,
  EDITORIAL_ZONE_PRESENTATION_PROFILES,
  isEditorialNewsFlowSlotType,
  projectEditorialArticleToZone,
  requireEditorialArticleZoneProjectionTitle,
  type EditorialArticleZoneProjectionWithTitle,
  type EditorialArticleZoneSource
} from "@/lib/editorial-zone-presentation";
import {
  HIERARCHICAL_BEYOND_MATCHDAY_POSITIONS,
  hierarchicalBeyondMatchdayPositionLabel,
  hierarchicalSlotLabel,
  incompleteHierarchicalCompositionSlots,
  isHierarchicalBeyondMatchdaySortOrder,
  isHierarchicalCompositionSlotKey,
  isReferenceCompositionPresentationMode,
  isPublishableHierarchicalBeyondMatchday,
  missingHierarchicalCompositionSlots,
  type HierarchicalCompositionReferenceItem,
  type HierarchicalCompositionSlot,
  type ReferenceCompositionPresentationMode,
} from "@/lib/editorial-hierarchical-composition";
import { fetchSupabaseAdminTable, getSupabaseServiceConfig, writeSupabaseAdmin, writeSupabaseAdminReturning } from "@/lib/supabase";

function cleanText(value: FormDataEntryValue | null): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function cleanInteger(value: FormDataEntryValue | null): number {
  const text = cleanText(value);
  const parsed = text ? Number.parseInt(text, 10) : Number.NaN;
  return Number.isNaN(parsed) ? 1 : parsed;
}

function normalizeIdentityValue(value?: string | null) {
  return value?.trim().toLowerCase() ?? "";
}

function normalizeSourceType(sourceType?: string | null) {
  const normalized = normalizeIdentityValue(sourceType);

  if (normalized === "matchday_editorials") return "matchday_editorial";
  if (normalized === "matchday_highlights") return "matchday_highlight";
  if (normalized === "matchday_roundup_items") return "matchday_roundup_item";
  if (normalized === "articles") return "article";

  return normalized;
}

function isEditorialArticleSourceType(sourceType?: string | null) {
  const normalized = normalizeSourceType(sourceType);
  return normalized === "editorial_article";
}

function redirectTo(_request: Request, path: string) {
  return adminRelativeRedirect(path);
}

function compositionReturnTarget(returnTo: string, resultParam: string, returnAnchor?: string | null) {
  const fragmentIndex = returnTo.indexOf("#");
  const base = fragmentIndex >= 0 ? returnTo.slice(0, fragmentIndex) : returnTo;
  const existingAnchor = fragmentIndex >= 0 ? returnTo.slice(fragmentIndex + 1) : "";
  const anchor = returnAnchor?.trim() || existingAnchor.trim();
  const separator = base.includes("?") ? "&" : "?";
  const feedback = anchor ? `&feedback_anchor=${encodeURIComponent(anchor)}` : "";
  const fragment = anchor ? `#${encodeURIComponent(anchor)}` : "";

  return `${base}${separator}${resultParam}${feedback}${fragment}`;
}

type DraftComposition = {
  id: string;
  matchday_id: string;
  status: string;
  use_roundup_items: boolean;
  presentation_mode: ReferenceCompositionPresentationMode;
};

type ReferenceCompositionState = DraftComposition & {
  is_current: boolean;
  published_at: string | null;
};

type CurrentEditorial = {
  id: string;
  title: string | null;
  summary: string | null;
  image_url: string | null;
  headline_link_url?: string | null;
  complementary_mode: string | null;
  complementary_label: string | null;
  complementary_title: string | null;
  complementary_text: string | null;
  complementary_image_url: string | null;
  complementary_link_url: string | null;
  complementary_status: string | null;
  side_block_status: string | null;
  side_block_type: string | null;
  side_block_label: string | null;
  side_block_label_color: string | null;
  side_block_title: string | null;
  side_block_text: string | null;
  side_block_image_url: string | null;
  side_block_link_url: string | null;
};

type CurrentHighlight = {
  id: string;
  label: string | null;
  label_color: string | null;
  title: string | null;
  image_url: string | null;
  link_url: string | null;
  sort_order: number;
  status: string | null;
};

type CurrentLatestNews = {
  id: string;
  time_label: string | null;
  time_label_color: string | null;
  title: string | null;
  subtitle: string | null;
  image_url: string | null;
  link_url: string | null;
  article_id: string | null;
  sort_order: number;
  status: string | null;
};

type CurrentHorizontalNews = {
  id: string;
  label: string | null;
  label_color: string | null;
  title: string | null;
  subtitle: string | null;
  image_url: string | null;
  link_url: string | null;
  sort_order: number;
  status: string | null;
};

type CurrentEditorialArticlePublication = {
  id: string;
  slug: string | null;
  label: string | null;
  title: string | null;
  subtitle: string | null;
  image_url: string | null;
  status: string | null;
  published_at: string | null;
};

type EditorialArticleForZone = EditorialArticleZoneSource & {
  body: string | null;
  matchday_id: string | null;
  status: string | null;
};

type CurrentEditorialContentPublication = {
  id: string;
  slug: string | null;
  label: string | null;
  title: string | null;
  subtitle: string | null;
  summary: string | null;
  image_url: string | null;
  thumbnail_url: string | null;
  content_type: string | null;
  status: string | null;
  published_at: string | null;
};

type CurrentImportantReferenceItem = {
  id: string;
  slot_type: string | null;
  source_type: string | null;
  source_id: string | null;
  sort_order: number;
  title_snapshot: string | null;
  subtitle_snapshot: string | null;
  image_url_snapshot: string | null;
  link_url_snapshot: string | null;
  label_snapshot: string | null;
  label_color_snapshot: string | null;
  status: string | null;
};

type CurrentRoundupItem = {
  id: string;
  label: string | null;
  title: string | null;
  subtitle: string | null;
  image_url: string | null;
  video_url: string | null;
  duration: string | null;
  type: string | null;
  sort_order: number;
  status: string | null;
};

type HierarchicalAuxiliaryTarget = {
  slotType: "complement" | "beyond_matchday";
  sortOrder: number;
  label: string;
};

type HierarchicalArticleCardProjection = EditorialArticleZoneProjectionWithTitle & {
  subtitle: string;
  imageUrl: string;
  linkUrl: string;
  label: string;
};

type CompositionSnapshot = {
  slot_type: string;
  source_type: string;
  source_id: string | null;
  article_id: string | null;
  title_snapshot: string | null;
  subtitle_snapshot: string | null;
  image_url_snapshot: string | null;
  link_url_snapshot: string | null;
  label_snapshot: string | null;
  label_color_snapshot: string | null;
};

type CompositionPublicationItem = {
  slot_type: string | null;
};

type CompositionIdentityItem = {
  source_type: string | null;
  source_id: string | null;
  article_id: string | null;
  title_snapshot: string | null;
  subtitle_snapshot: string | null;
  image_url_snapshot: string | null;
  link_url_snapshot: string | null;
};

type CompositionMoveItem = {
  id: string;
  composition_id: string;
  slot_type: string;
  source_type: string | null;
  source_id: string | null;
  article_id: string | null;
  link_url_snapshot: string | null;
  sort_order: number;
  created_at: string;
};

type MatchdayEditorialBankCandidate = {
  matchday_id: string;
  label: string | null;
  label_color: string | null;
  title: string;
  subtitle: string | null;
  image_url: string | null;
  link_url: string | null;
  source_type: string | null;
  source_id: string | null;
  source_slug: string | null;
  origin_slot_type: string | null;
  sort_order: number | null;
  status: "active";
};

type ExistingBankItem = {
  id: string;
  label?: string | null;
  label_color?: string | null;
  source_type: string | null;
  source_id: string | null;
  source_slug: string | null;
  link_url: string | null;
  title: string | null;
  subtitle: string | null;
  image_url: string | null;
};

type BankItemForAssignment = {
  id: string;
  status: string | null;
  label: string | null;
  label_color: string | null;
  title: string;
  subtitle: string | null;
  image_url: string | null;
  link_url: string | null;
  source_type: string | null;
  source_id: string | null;
  source_slug: string | null;
};

type CompositionBankSourceItem = {
  id: string;
  composition_id: string;
  source_type: string | null;
  source_id: string | null;
};

type CompositionBankIdentityItem = {
  id: string;
  source_type: string | null;
  source_id: string | null;
  title_snapshot: string | null;
  subtitle_snapshot: string | null;
  image_url_snapshot: string | null;
  link_url_snapshot: string | null;
};

type SaveBankResult = {
  saved: number;
  updated: number;
  existing: number;
  repeated: number;
  skipped: number;
};

function cleanPresentationMode(value: FormDataEntryValue | null): ReferenceCompositionPresentationMode {
  const mode = cleanText(value);
  return isReferenceCompositionPresentationMode(mode) ? mode : "standard";
}

class CompositionPublicationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CompositionPublicationError";
  }
}

async function readFirst<T>(path: string): Promise<T | null> {
  const rows = await fetchSupabaseAdminTable<T>(`${path}&limit=1`);
  return rows[0] ?? null;
}

async function hasRows(path: string) {
  const rows = await fetchSupabaseAdminTable<{ id: string }>(`${path}&limit=1`);
  return rows.length > 0;
}

async function compositionBelongsToMatchday(
  compositionId: string,
  matchdayId: string,
  presentationMode: ReferenceCompositionPresentationMode = "standard",
) {
  return hasRows(
    `matchday_reference_compositions?select=id&id=eq.${encodeURIComponent(compositionId)}&matchday_id=eq.${encodeURIComponent(
      matchdayId
    )}&status=eq.draft&presentation_mode=eq.${encodeURIComponent(presentationMode)}`
  );
}

function hasContent(...values: Array<string | null | undefined>) {
  return values.some((value) => Boolean(value?.trim()));
}

function isPublished(status?: string | null) {
  return status === "published";
}

function cleanSnapshotValue(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed || null;
}

function sourceSlugFromLink(linkUrl?: string | null) {
  const cleanLink = cleanSnapshotValue(linkUrl);
  const prefix = "/noticias/";

  if (!cleanLink?.startsWith(prefix)) {
    return null;
  }

  return cleanSnapshotValue(cleanLink.slice(prefix.length).split(/[?#]/)[0]);
}

function bankCandidate({
  matchdayId,
  label,
  labelColor,
  title,
  subtitle,
  imageUrl,
  linkUrl,
  sourceType,
  sourceId,
  sourceSlug,
  originSlotType,
  sortOrder
}: {
  matchdayId: string;
  label?: string | null;
  labelColor?: string | null;
  title?: string | null;
  subtitle?: string | null;
  imageUrl?: string | null;
  linkUrl?: string | null;
  sourceType?: string | null;
  sourceId?: string | null;
  sourceSlug?: string | null;
  originSlotType?: string | null;
  sortOrder?: number | null;
}): MatchdayEditorialBankCandidate | null {
  const cleanTitle = cleanSnapshotValue(title);

  if (!cleanTitle) {
    return null;
  }

  const cleanLink = cleanSnapshotValue(linkUrl);

  return {
    matchday_id: matchdayId,
    label: cleanSnapshotValue(label),
    label_color: cleanSnapshotValue(labelColor),
    title: cleanTitle,
    subtitle: cleanSnapshotValue(subtitle),
    image_url: cleanSnapshotValue(imageUrl),
    link_url: cleanLink,
    source_type: cleanSnapshotValue(sourceType),
    source_id: cleanSnapshotValue(sourceId),
    source_slug: cleanSnapshotValue(sourceSlug) ?? sourceSlugFromLink(cleanLink),
    origin_slot_type: cleanSnapshotValue(originSlotType),
    sort_order: sortOrder ?? null,
    status: "active"
  };
}

type BankIdentityInput = {
  link_url?: string | null;
  source_slug?: string | null;
  title?: string | null;
  subtitle?: string | null;
  image_url?: string | null;
  source_type?: string | null;
  source_id?: string | null;
};

function normalizeEditorialIdentityValue(value?: string | null) {
  return value?.trim().replace(/\s+/g, " ").toLowerCase() ?? "";
}

function normalizeEditorialLinkValue(value?: string | null) {
  const normalized = normalizeEditorialIdentityValue(value);
  return normalized ? normalized.split(/[?#]/)[0].replace(/\/$/, "") : "";
}

function bankEditorialIdentityParts(item: BankIdentityInput) {
  const title = normalizeEditorialIdentityValue(item.title);
  const subtitle = normalizeEditorialIdentityValue(item.subtitle);
  const imageUrl = normalizeEditorialLinkValue(item.image_url);
  const sourceType = normalizeIdentityValue(item.source_type);
  const sourceId = normalizeIdentityValue(item.source_id);
  const parts: Array<{ kind: string; key: string }> = [];

  const linkUrl = normalizeEditorialLinkValue(item.link_url);
  if (linkUrl) parts.push({ kind: "link", key: linkUrl });

  const sourceSlug = normalizeEditorialIdentityValue(item.source_slug);
  if (sourceSlug) parts.push({ kind: "slug", key: sourceSlug });

  if (title && imageUrl) parts.push({ kind: "title_image", key: `${title}|${imageUrl}` });
  if (title && subtitle) parts.push({ kind: "title_subtitle", key: `${title}|${subtitle}` });
  if (sourceType && sourceId) parts.push({ kind: "source", key: `${sourceType}|${sourceId}` });

  return parts;
}

function bankIdentitiesMatch(left: BankIdentityInput, right: BankIdentityInput) {
  const leftParts = bankEditorialIdentityParts(left);
  const rightParts = bankEditorialIdentityParts(right);

  for (const kind of ["link", "slug", "title_image", "title_subtitle", "source"]) {
    const leftKeys = new Set(leftParts.filter((part) => part.kind === kind).map((part) => part.key));
    const rightKeys = rightParts.filter((part) => part.kind === kind).map((part) => part.key);

    if (leftKeys.size === 0 || rightKeys.length === 0) {
      continue;
    }

    if (rightKeys.some((key) => leftKeys.has(key))) {
      return true;
    }
  }

  return false;
}

function isBankSourceType(sourceType?: string | null) {
  const normalizedSourceType = normalizeSourceType(sourceType);
  return normalizedSourceType === "manual_link" || normalizedSourceType === "matchday_editorial_bank_item";
}

function compositionItemEditorialIdentity(
  item: CompositionBankIdentityItem,
  bankItemsById: Map<string, ExistingBankItem>
): BankIdentityInput {
  if (item.source_id && isBankSourceType(item.source_type)) {
    const bankItem = bankItemsById.get(item.source_id);
    if (bankItem) {
      return bankItem;
    }
  }

  return {
    link_url: item.link_url_snapshot,
    title: item.title_snapshot,
    subtitle: item.subtitle_snapshot,
    image_url: item.image_url_snapshot,
    source_type: item.source_type,
    source_id: item.source_id
  };
}

async function readMatchdayBankIdentityItems(matchdayId: string) {
  return fetchSupabaseAdminTable<ExistingBankItem>(
    `matchday_editorial_bank_items?select=id,label_color,source_type,source_id,source_slug,link_url,title,subtitle,image_url&matchday_id=eq.${encodeURIComponent(
      matchdayId
    )}&limit=1000`
  );
}

function validatePublishableCompositionItems(items: CompositionPublicationItem[]) {
  const counts = items.reduce<Record<string, number>>((result, item) => {
    const slotType = item.slot_type ?? "";
    result[slotType] = (result[slotType] ?? 0) + 1;
    return result;
  }, {});

  const headlineCount = counts.headline ?? 0;
  if (headlineCount === 0) {
    throw new CompositionPublicationError("Adiciona uma manchete antes de publicar.");
  }
  if (headlineCount > 1) {
    throw new CompositionPublicationError("A composição só pode ter uma manchete. Remove as manchetes extra antes de publicar.");
  }
  if ((counts.complement ?? 0) > 1) {
    throw new CompositionPublicationError("A composição só pode ter um complemento da manchete.");
  }
  if ((counts.side_block ?? 0) > 1) {
    throw new CompositionPublicationError("A composição só pode ter um Contexto.");
  }
  if ((counts.highlight ?? 0) > 3) {
    throw new CompositionPublicationError("A zona 3 notícias abaixo da manchete só pode ter três notícias.");
  }
}

function compositionIdentityMatches(item: CompositionIdentityItem, candidate: CompositionIdentityItem) {
  const itemTitle = normalizeIdentityValue(item.title_snapshot);
  const candidateTitle = normalizeIdentityValue(candidate.title_snapshot);

  if (itemTitle && candidateTitle && itemTitle !== candidateTitle) {
    return false;
  }

  if (item.article_id && candidate.article_id && item.article_id === candidate.article_id) {
    return true;
  }

  const itemLinkUrl = normalizeIdentityValue(item.link_url_snapshot);
  const candidateLinkUrl = normalizeIdentityValue(candidate.link_url_snapshot);

  if (itemLinkUrl && candidateLinkUrl && itemLinkUrl === candidateLinkUrl) {
    return true;
  }

  const itemSourceType = normalizeSourceType(item.source_type);
  const candidateSourceType = normalizeSourceType(candidate.source_type);

  if (
    itemSourceType &&
    candidateSourceType &&
    itemSourceType === candidateSourceType &&
    item.source_id &&
    candidate.source_id &&
    item.source_id === candidate.source_id &&
    itemSourceType !== "matchday_editorial"
  ) {
    return true;
  }

  if (itemTitle && candidateTitle && itemTitle === candidateTitle) {
    const itemImageUrl = normalizeIdentityValue(item.image_url_snapshot);
    const candidateImageUrl = normalizeIdentityValue(candidate.image_url_snapshot);
    const itemSubtitle = normalizeIdentityValue(item.subtitle_snapshot);
    const candidateSubtitle = normalizeIdentityValue(candidate.subtitle_snapshot);
    const canCompareImage = Boolean(itemImageUrl && candidateImageUrl);
    const canCompareSubtitle = Boolean(itemSubtitle && candidateSubtitle);

    return (canCompareImage && itemImageUrl === candidateImageUrl) || (canCompareSubtitle && itemSubtitle === candidateSubtitle);
  }

  return false;
}

async function readCompositionIdentityItems(compositionId: string) {
  return fetchSupabaseAdminTable<CompositionIdentityItem>(
    `matchday_reference_composition_items?select=source_type,source_id,article_id,title_snapshot,subtitle_snapshot,image_url_snapshot,link_url_snapshot&composition_id=eq.${encodeURIComponent(
      compositionId
    )}&limit=500`
  );
}

function filterNewCompositionSnapshots(snapshots: CompositionSnapshot[], existingItems: CompositionIdentityItem[]) {
  const knownItems: CompositionIdentityItem[] = [...existingItems];
  const newSnapshots: CompositionSnapshot[] = [];

  for (const snapshot of snapshots) {
    if (knownItems.some((item) => compositionIdentityMatches(item, snapshot))) {
      continue;
    }

    newSnapshots.push(snapshot);
    knownItems.push(snapshot);
  }

  return newSnapshots;
}

async function readDraftComposition(compositionId: string, matchdayId: string) {
  return readFirst<DraftComposition>(
    `matchday_reference_compositions?select=id,matchday_id,status,use_roundup_items,presentation_mode&id=eq.${encodeURIComponent(
      compositionId
    )}&matchday_id=eq.${encodeURIComponent(matchdayId)}&status=eq.draft`
  );
}

async function readReferenceCompositionState(compositionId: string, matchdayId: string) {
  return readFirst<ReferenceCompositionState>(
    `matchday_reference_compositions?select=id,matchday_id,status,use_roundup_items,presentation_mode,is_current,published_at&id=eq.${encodeURIComponent(
      compositionId
    )}&matchday_id=eq.${encodeURIComponent(matchdayId)}`
  );
}

async function readMaxSortOrder(compositionId: string) {
  const row = await readFirst<{ sort_order: number | null }>(
    `matchday_reference_composition_items?select=sort_order&composition_id=eq.${encodeURIComponent(
      compositionId
    )}&order=sort_order.desc`
  );
  return row?.sort_order ?? 0;
}

async function readMaxSortOrderForSlot(compositionId: string, slotType: string) {
  const row = await readFirst<{ sort_order: number | null }>(
    `matchday_reference_composition_items?select=sort_order&composition_id=eq.${encodeURIComponent(
      compositionId
    )}&slot_type=eq.${encodeURIComponent(slotType)}&order=sort_order.desc`
  );
  return row?.sort_order ?? 0;
}

async function readEditorialArticleForZone(articleId: string, matchdayId: string) {
  const article = await readFirst<EditorialArticleForZone>(
    `editorial_articles?select=id,slug,label,title,subtitle,body,image_url,author,published_at,matchday_id,status&id=eq.${encodeURIComponent(
      articleId
    )}&matchday_id=eq.${encodeURIComponent(matchdayId)}&status=eq.published`
  );

  if (!article) {
    throw new CompositionPublicationError("O artigo-fonte já não está publicado nesta jornada.");
  }

  const missing = missingEditorialArticleCanonicalFields(article);
  if (missing.length > 0) {
    throw new CompositionPublicationError(
      `O artigo-fonte está incompleto: falta ${editorialArticleCanonicalMissingLabel(missing)}. Completa o artigo antes de o publicar ou transferir entre zonas.`,
    );
  }

  return article;
}

async function readPublishedEditorialArticleForHierarchicalAuxiliary(articleId: string) {
  const article = await readFirst<EditorialArticleForZone>(
    `editorial_articles?select=id,slug,label,title,subtitle,body,image_url,author,published_at,matchday_id,status&id=eq.${encodeURIComponent(
      articleId
    )}&status=eq.published`
  );

  if (!article) {
    throw new CompositionPublicationError("O artigo-fonte já não está publicado.");
  }

  const missing = missingEditorialArticleCanonicalFields(article);
  if (missing.length > 0) {
    throw new CompositionPublicationError(
      `O artigo-fonte está incompleto: falta ${editorialArticleCanonicalMissingLabel(missing)}. Completa o artigo antes de o usar na Composição.`,
    );
  }

  return article;
}

function projectHierarchicalAuxiliaryArticle(
  article: EditorialArticleForZone,
): HierarchicalArticleCardProjection {
  const projection = requireEditorialArticleZoneProjectionTitle(
    projectEditorialArticleToZone(article, "complement"),
  );
  const subtitle = cleanText(projection.subtitle);
  const imageUrl = cleanText(projection.imageUrl);
  const linkUrl = cleanText(projection.linkUrl);
  const label = cleanText(projection.label);

  if (!subtitle || !imageUrl || !linkUrl || !label) {
    throw new CompositionPublicationError(
      "O artigo-fonte não tem todos os campos necessários para esta posição da Composição.",
    );
  }

  return { ...projection, subtitle, imageUrl, linkUrl, label };
}

function projectHierarchicalAuxiliaryBankItem(
  bankItem: BankItemForAssignment,
): HierarchicalArticleCardProjection {
  const title = cleanText(bankItem.title);
  const subtitle = cleanText(bankItem.subtitle);
  const imageUrl = cleanText(bankItem.image_url);
  const linkUrl = cleanText(bankItem.link_url);
  const label = cleanText(bankItem.label);

  if (!title || !subtitle || !imageUrl || !linkUrl || !label) {
    throw new CompositionPublicationError(
      "A notícia do banco não tem todos os campos necessários para esta posição da Composição.",
    );
  }

  return { title, subtitle, imageUrl, linkUrl, label };
}

function hierarchicalAuxiliaryTarget(value: string | null): HierarchicalAuxiliaryTarget | null {
  if (value === "video_highlight") {
    return { slotType: "complement", sortOrder: 1, label: "Destaque da Jornada" };
  }

  const match = value?.match(/^beyond_matchday_(\d+)$/);
  const sortOrder = match?.[1] ? Number.parseInt(match[1], 10) : 0;
  if (!isHierarchicalBeyondMatchdaySortOrder(sortOrder)) return null;

  return {
    slotType: "beyond_matchday",
    sortOrder,
    label: `Para Lá da Jornada — ${hierarchicalBeyondMatchdayPositionLabel(sortOrder)}`,
  };
}

function editorialArticleSlugFromLink(linkUrl: string | null | undefined) {
  const cleanLink = linkUrl?.trim();
  if (!cleanLink) return null;

  try {
    const url = new URL(cleanLink, "https://jornada.invalid");
    const match = url.pathname.match(/^\/noticias\/([^/]+)\/?$/);
    return match?.[1] ? decodeURIComponent(match[1]).trim() || null : null;
  } catch {
    return null;
  }
}

async function editorialArticleIdFromLink(linkUrl: string | null | undefined, matchdayId: string) {
  const slug = editorialArticleSlugFromLink(linkUrl);
  if (!slug) return null;

  const article = await readFirst<{ id: string }>(
    `editorial_articles?select=id&slug=eq.${encodeURIComponent(slug)}&matchday_id=eq.${encodeURIComponent(matchdayId)}&status=eq.published&limit=1`
  );
  return article?.id ?? null;
}

async function resolveEditorialArticleIdForCompositionItem(
  item: CompositionMoveItem,
  matchdayId: string,
) {
  if (isEditorialArticleSourceType(item.source_type) && item.source_id) return item.source_id;

  if (normalizeSourceType(item.source_type) === "matchday_editorial_bank_item" && item.source_id) {
    const bankItem = await readFirst<{
      source_type: string | null;
      source_id: string | null;
      link_url: string | null;
    }>(
      `matchday_editorial_bank_items?select=source_type,source_id,link_url&id=eq.${encodeURIComponent(item.source_id)}`
    );

    if (bankItem && isEditorialArticleSourceType(bankItem.source_type) && bankItem.source_id) {
      return bankItem.source_id;
    }
    const linkedBankArticleId = await editorialArticleIdFromLink(bankItem?.link_url, matchdayId);
    if (linkedBankArticleId) return linkedBankArticleId;
  }

  return editorialArticleIdFromLink(item.link_url_snapshot, matchdayId);
}

async function assertCompositionSlotCapacity(compositionId: string, slotType: string, ignoreItemId?: string | null) {
  const profile = EDITORIAL_ZONE_PRESENTATION_PROFILES[slotType as keyof typeof EDITORIAL_ZONE_PRESENTATION_PROFILES];
  const capacity = profile?.capacity ?? null;
  if (!capacity) return;

  const items = await fetchSupabaseAdminTable<{ id: string }>(
    `matchday_reference_composition_items?select=id&composition_id=eq.${encodeURIComponent(
      compositionId
    )}&slot_type=eq.${encodeURIComponent(slotType)}&limit=50`
  );
  const occupied = items.filter((item) => !ignoreItemId || item.id !== ignoreItemId).length;

  if (occupied >= capacity) {
    throw new CompositionPublicationError(
      `${profile.publicName} já ${capacity === 1 ? "está ocupada" : `tem o máximo de ${capacity} notícias`}. Transfere ou retira primeiro um item dessa zona.`
    );
  }
}

async function readPublishedImportantReferenceItems(matchdayId: string) {
  const composition = await readFirst<{ id: string }>(
    `matchday_reference_compositions?select=id&matchday_id=eq.${encodeURIComponent(
      matchdayId
    )}&status=eq.published&is_current=is.true&presentation_mode=eq.standard&order=published_at.desc.nullslast`
  );

  if (!composition) {
    return [];
  }

  return fetchSupabaseAdminTable<CurrentImportantReferenceItem>(
    `matchday_reference_composition_items?select=id,slot_type,source_type,source_id,sort_order,title_snapshot,subtitle_snapshot,image_url_snapshot,link_url_snapshot,label_snapshot,label_color_snapshot,status&composition_id=eq.${encodeURIComponent(
      composition.id
    )}&slot_type=eq.important_item&order=sort_order.asc`
  ).catch(() => []);
}

async function buildCurrentBankCandidates(matchdayId: string): Promise<MatchdayEditorialBankCandidate[]> {
  const [editorialArticles, editorialContents, editorial, highlights, latestNews, horizontalNews, importantItems] = await Promise.all([
    fetchSupabaseAdminTable<CurrentEditorialArticlePublication>(
      `editorial_articles?select=id,slug,label,title,subtitle,image_url,status,published_at&matchday_id=eq.${encodeURIComponent(
        matchdayId
      )}&status=eq.published&order=published_at.asc.nullslast,created_at.asc`
    ).catch(() => []),
    fetchSupabaseAdminTable<CurrentEditorialContentPublication>(
      `editorial_contents?select=id,slug,label,title,subtitle,summary,image_url,thumbnail_url,content_type,status,published_at&matchday_id=eq.${encodeURIComponent(
        matchdayId
      )}&status=eq.published&order=published_at.asc.nullslast,created_at.asc`
    ).catch(() => []),
    readFirst<CurrentEditorial>(
      `matchday_editorials?select=id,title,summary,image_url,headline_link_url,complementary_mode,complementary_label,complementary_title,complementary_text,complementary_image_url,complementary_link_url,complementary_status,side_block_status,side_block_type,side_block_label,side_block_label_color,side_block_title,side_block_text,side_block_image_url,side_block_link_url&matchday_id=eq.${encodeURIComponent(
        matchdayId
      )}`
    ),
    fetchSupabaseAdminTable<CurrentHighlight>(
      `matchday_highlights?select=id,label,label_color,title,image_url,link_url,sort_order,status&matchday_id=eq.${encodeURIComponent(
        matchdayId
      )}&status=eq.published&order=sort_order.asc&limit=50`
    ).catch(() => []),
    fetchSupabaseAdminTable<CurrentLatestNews>(
      `matchday_latest_news?select=id,time_label,time_label_color,title,subtitle,image_url,link_url,sort_order,status&matchday_id=eq.${encodeURIComponent(
        matchdayId
      )}&status=eq.published&order=sort_order.asc`
    ).catch(() => []),
    fetchSupabaseAdminTable<CurrentHorizontalNews>(
      `matchday_horizontal_news?select=id,label,label_color,title,subtitle,image_url,link_url,sort_order,status&matchday_id=eq.${encodeURIComponent(
        matchdayId
      )}&status=eq.published&order=sort_order.asc`
    ).catch(() => []),
    readPublishedImportantReferenceItems(matchdayId)
  ]);

  const candidates: Array<MatchdayEditorialBankCandidate | null> = [];

  editorialArticles.forEach((item, index) => {
    candidates.push(
      bankCandidate({
        matchdayId,
        label: item.label,
        title: item.title,
        subtitle: item.subtitle,
        imageUrl: item.image_url,
        linkUrl: item.slug ? `/noticias/${item.slug}` : null,
        sourceType: "editorial_article",
        sourceId: item.id,
        sourceSlug: item.slug,
        sortOrder: index + 1
      })
    );
  });

  editorialContents.forEach((item, index) => {
    candidates.push(
      bankCandidate({
        matchdayId,
        label: item.label || item.content_type,
        title: item.title,
        subtitle: item.summary || item.subtitle,
        imageUrl: item.thumbnail_url || item.image_url,
        linkUrl: item.slug ? `/conteudos/${item.slug}` : null,
        sourceType: "editorial_content",
        sourceId: item.id,
        sourceSlug: item.slug,
        sortOrder: editorialArticles.length + index + 1
      })
    );
  });

  if (editorial && hasContent(editorial.title, editorial.summary, editorial.image_url)) {
    candidates.push(
      bankCandidate({
        matchdayId,
        title: editorial.title,
        subtitle: editorial.summary,
        imageUrl: editorial.image_url,
        linkUrl: editorial.headline_link_url,
        sourceType: "matchday_editorial_headline",
        sourceId: editorial.id,
        originSlotType: "headline",
        sortOrder: 1
      })
    );
  }

  if (
    editorial &&
    Boolean(editorial.complementary_mode) &&
    editorial.complementary_mode !== "none" &&
    isPublished(editorial.complementary_status) &&
    hasContent(editorial.complementary_title, editorial.complementary_text, editorial.complementary_image_url)
  ) {
    candidates.push(
      bankCandidate({
        matchdayId,
        label: editorial.complementary_label,
        title: editorial.complementary_title,
        subtitle: editorial.complementary_text,
        imageUrl: editorial.complementary_image_url,
        linkUrl: editorial.complementary_link_url,
        sourceType: "matchday_editorial_complement",
        sourceId: editorial.id,
        originSlotType: "complement",
        sortOrder: 2
      })
    );
  }

  if (editorial && isPublished(editorial.side_block_status) && hasContent(editorial.side_block_title, editorial.side_block_text, editorial.side_block_image_url)) {
    candidates.push(
      bankCandidate({
        matchdayId,
        label: editorial.side_block_label || editorial.side_block_type,
        labelColor: editorial.side_block_label_color,
        title: editorial.side_block_title,
        subtitle: editorial.side_block_text,
        imageUrl: editorial.side_block_image_url,
        linkUrl: editorial.side_block_link_url,
        sourceType: "matchday_editorial_side_block",
        sourceId: editorial.id,
        originSlotType: "side_block",
        sortOrder: 3
      })
    );
  }

  highlights.forEach((item) => {
    candidates.push(
      bankCandidate({
        matchdayId,
        label: item.label,
        labelColor: item.label_color,
        title: item.title,
        imageUrl: item.image_url,
        linkUrl: item.link_url,
        sourceType: "matchday_highlight",
        sourceId: item.id,
        originSlotType: "highlight",
        sortOrder: 10 + item.sort_order
      })
    );
  });

  latestNews.forEach((item) => {
    candidates.push(
      bankCandidate({
        matchdayId,
        label: item.time_label,
        labelColor: item.time_label_color,
        title: item.title,
        subtitle: item.subtitle,
        imageUrl: item.image_url,
        linkUrl: item.link_url,
        sourceType: "matchday_latest_news",
        sourceId: item.id,
        originSlotType: "editorial_line_item",
        sortOrder: 100 + item.sort_order
      })
    );
  });

  horizontalNews.forEach((item) => {
    candidates.push(
      bankCandidate({
        matchdayId,
        label: item.label,
        labelColor: item.label_color,
        title: item.title,
        subtitle: item.subtitle,
        imageUrl: item.image_url,
        linkUrl: item.link_url,
        sourceType: "matchday_horizontal_news",
        sourceId: item.id,
        originSlotType: "important_item",
        sortOrder: 200 + item.sort_order
      })
    );
  });

  importantItems
    .filter((item) => normalizeSourceType(item.source_type) !== "article")
    .forEach((item) => {
      candidates.push(
        bankCandidate({
          matchdayId,
          label: item.label_snapshot,
          labelColor: item.label_color_snapshot,
          title: item.title_snapshot,
          subtitle: item.subtitle_snapshot,
          imageUrl: item.image_url_snapshot,
          linkUrl: item.link_url_snapshot,
          sourceType: item.source_type || "matchday_reference_composition_item",
          sourceId: item.source_id || item.id,
          originSlotType: "important_item",
          sortOrder: 200 + item.sort_order
        })
      );
    });

  return candidates.filter((item): item is MatchdayEditorialBankCandidate => Boolean(item));
}

async function saveCurrentMatchdayEditorialBank(matchdayId: string): Promise<SaveBankResult> {
  if (!(await hasRows(`matchdays?select=id&id=eq.${encodeURIComponent(matchdayId)}`))) {
    throw new Error("matchday-invalid");
  }

  const rawCandidates = await buildCurrentBankCandidates(matchdayId);
  const candidates: MatchdayEditorialBankCandidate[] = [];
  let repeated = 0;

  for (const candidate of rawCandidates) {
    if (candidates.some((item) => bankIdentitiesMatch(item, candidate))) {
      repeated += 1;
      continue;
    }

    candidates.push(candidate);
  }

  const knownItems = await fetchSupabaseAdminTable<ExistingBankItem>(
    `matchday_editorial_bank_items?select=id,label,label_color,source_type,source_id,source_slug,link_url,title,subtitle,image_url&matchday_id=eq.${encodeURIComponent(
      matchdayId
    )}&limit=1000`
  );
  let saved = 0;
  let updated = 0;
  let existing = 0;

  for (const candidate of candidates) {
    const knownItem = knownItems.find((item) => bankIdentitiesMatch(item, candidate));

    if (knownItem) {
      const payload = {
        label: candidate.label,
        label_color: candidate.label_color ?? knownItem.label_color ?? null,
        title: candidate.title,
        subtitle: candidate.subtitle,
        image_url: candidate.image_url,
        link_url: candidate.link_url,
        source_type: candidate.source_type,
        source_id: candidate.source_id,
        source_slug: candidate.source_slug,
        origin_slot_type: candidate.origin_slot_type,
        sort_order: candidate.sort_order
      };
      const changed =
        normalizeIdentityValue(knownItem.label) !== normalizeIdentityValue(payload.label) ||
        normalizeIdentityValue(knownItem.label_color) !== normalizeIdentityValue(payload.label_color) ||
        normalizeIdentityValue(knownItem.title) !== normalizeIdentityValue(payload.title) ||
        normalizeIdentityValue(knownItem.subtitle) !== normalizeIdentityValue(payload.subtitle) ||
        normalizeEditorialLinkValue(knownItem.image_url) !== normalizeEditorialLinkValue(payload.image_url) ||
        normalizeEditorialLinkValue(knownItem.link_url) !== normalizeEditorialLinkValue(payload.link_url) ||
        normalizeIdentityValue(knownItem.source_type) !== normalizeIdentityValue(payload.source_type) ||
        normalizeIdentityValue(knownItem.source_id) !== normalizeIdentityValue(payload.source_id) ||
        normalizeIdentityValue(knownItem.source_slug) !== normalizeIdentityValue(payload.source_slug);

      if (changed && knownItem.id) {
        await writeSupabaseAdmin(`matchday_editorial_bank_items?id=eq.${encodeURIComponent(knownItem.id)}`, {
          method: "PATCH",
          body: JSON.stringify(payload)
        });
        Object.assign(knownItem, payload);
        updated += 1;
      } else {
        existing += 1;
      }
      continue;
    }

    await writeSupabaseAdmin("matchday_editorial_bank_items", {
      method: "POST",
      body: JSON.stringify(candidate)
    });

    knownItems.push({
      id: "",
      label: candidate.label,
      label_color: candidate.label_color,
      source_type: candidate.source_type,
      source_id: candidate.source_id,
      source_slug: candidate.source_slug,
      link_url: candidate.link_url,
      title: candidate.title,
      subtitle: candidate.subtitle,
      image_url: candidate.image_url
    });
    saved += 1;
  }

  return { saved, updated, existing, repeated, skipped: existing + repeated };
}

async function updateBankItemStatus(formData: FormData, nextStatus: "active" | "archived") {
  const matchdayId = cleanText(formData.get("matchday_id"));
  const bankItemId = cleanText(formData.get("bank_item_id"));
  if (!matchdayId || !bankItemId) throw new Error("bank-item-invalid");

  const bankItem = await readFirst<ExistingBankItem & { status: string | null }>(
    `matchday_editorial_bank_items?select=id,status,source_type,source_id,source_slug,link_url,title,subtitle,image_url&id=eq.${encodeURIComponent(
      bankItemId
    )}&matchday_id=eq.${encodeURIComponent(matchdayId)}`
  );

  if (!bankItem) throw new Error("bank-item-invalid");
  if (nextStatus === "archived" && bankItem.status !== "active") throw new Error("bank-item-invalid");
  if (nextStatus === "active" && bankItem.status !== "archived") throw new Error("bank-item-invalid");

  if (nextStatus === "active") {
    const activeItems = await fetchSupabaseAdminTable<ExistingBankItem>(
      `matchday_editorial_bank_items?select=id,source_type,source_id,source_slug,link_url,title,subtitle,image_url&matchday_id=eq.${encodeURIComponent(
        matchdayId
      )}&status=eq.active&id=neq.${encodeURIComponent(bankItem.id)}&limit=1000`
    );

    if (activeItems.some((item) => bankIdentitiesMatch(bankItem, item))) {
      throw new CompositionPublicationError("Ja existe uma versao ativa desta noticia no banco. Nao foi reativada.");
    }
  }

  await writeSupabaseAdmin(
    `matchday_editorial_bank_items?id=eq.${encodeURIComponent(bankItem.id)}&matchday_id=eq.${encodeURIComponent(matchdayId)}`,
    {
      method: "PATCH",
      body: JSON.stringify({ status: nextStatus })
    }
  );
}

const bankCompositionSlotTypes = new Set(["headline", "complement", "side_block", "highlight", "important_item", "editorial_line_item"]);
const articleNewsFlowSlotTypes = new Set<string>(EDITORIAL_NEWS_FLOW_SLOT_TYPES);

async function assignBankItemToCompositionSlot(formData: FormData) {
  const matchdayId = cleanText(formData.get("matchday_id"));
  const compositionId = cleanText(formData.get("composition_id"));
  const bankItemId = cleanText(formData.get("bank_item_id"));
  const slotType = cleanText(formData.get("slot_type"));

  if (
    !matchdayId ||
    !compositionId ||
    !bankItemId ||
    !slotType ||
    !bankCompositionSlotTypes.has(slotType) ||
    !(await compositionBelongsToMatchday(compositionId, matchdayId))
  ) {
    throw new Error("bank-assignment-invalid");
  }

  const bankItem = await readFirst<BankItemForAssignment>(
    `matchday_editorial_bank_items?select=id,status,label,label_color,title,subtitle,image_url,link_url,source_type,source_id,source_slug&id=eq.${encodeURIComponent(
      bankItemId
    )}&matchday_id=eq.${encodeURIComponent(matchdayId)}`
  );

  if (!bankItem || bankItem.status !== "active") {
    throw new Error("bank-assignment-invalid");
  }

  const articleId = isEditorialArticleSourceType(bankItem.source_type) ? bankItem.source_id : null;
  if (articleId && !articleNewsFlowSlotTypes.has(slotType)) {
    throw new CompositionPublicationError("Os artigos noticiosos só podem circular pelas cinco zonas noticiosas.");
  }

  const existingBankCompositionItems = await fetchSupabaseAdminTable<CompositionBankSourceItem>(
    `matchday_reference_composition_items?select=id,composition_id,source_type,source_id&composition_id=eq.${encodeURIComponent(
      compositionId
    )}&source_id=eq.${encodeURIComponent(bankItem.id)}&limit=10`
  );

  if (
    existingBankCompositionItems.some((item) => {
      return isBankSourceType(item.source_type);
    })
  ) {
    throw new CompositionPublicationError("Esta noticia ja esta associada a composicao.");
  }

  const existingCompositionItems = await fetchSupabaseAdminTable<CompositionBankIdentityItem>(
    `matchday_reference_composition_items?select=id,source_type,source_id,title_snapshot,subtitle_snapshot,image_url_snapshot,link_url_snapshot&composition_id=eq.${encodeURIComponent(
      compositionId
    )}&limit=500`
  );
  const bankItemsById = new Map((await readMatchdayBankIdentityItems(matchdayId)).map((item) => [item.id, item]));

  if (
    existingCompositionItems.some((item) =>
      bankIdentitiesMatch(bankItem, compositionItemEditorialIdentity(item, bankItemsById))
    )
  ) {
    throw new CompositionPublicationError("Esta noticia ja esta associada a composicao.");
  }

  await assertCompositionSlotCapacity(compositionId, slotType);

  let projected: EditorialArticleZoneProjectionWithTitle = {
    title: bankItem.title,
    subtitle: bankItem.subtitle,
    imageUrl: bankItem.image_url,
    linkUrl: bankItem.link_url,
    label: bankItem.label
  };

  if (articleId) {
    if (!isEditorialNewsFlowSlotType(slotType)) {
      throw new CompositionPublicationError("A zona escolhida não pertence ao circuito noticioso.");
    }
    projected = requireEditorialArticleZoneProjectionTitle(
      projectEditorialArticleToZone(await readEditorialArticleForZone(articleId, matchdayId), slotType),
    );
  }

  const nextSortOrder = (await readMaxSortOrderForSlot(compositionId, slotType)) + 1;
  const createdItems = await writeSupabaseAdminReturning<{ id: string }>(
    "matchday_reference_composition_items?select=id",
    {
      method: "POST",
      body: JSON.stringify({
        composition_id: compositionId,
        slot_type: slotType,
        source_type: "matchday_editorial_bank_item",
        source_id: bankItem.id,
        article_id: null,
        sort_order: nextSortOrder,
        title_snapshot: projected.title,
        subtitle_snapshot: projected.subtitle,
        image_url_snapshot: projected.imageUrl,
        link_url_snapshot: projected.linkUrl,
        label_snapshot: projected.label,
        label_color_snapshot: articleId ? null : bankItem.label_color,
        status: "draft"
      })
    }
  );

  if (!createdItems[0]?.id) {
    throw new Error("bank-assignment-invalid");
  }
}

async function unassignBankItemFromCompositionSlot(formData: FormData) {
  const matchdayId = cleanText(formData.get("matchday_id"));
  const compositionId = cleanText(formData.get("composition_id"));
  const itemId = cleanText(formData.get("composition_item_id"));

  if (!matchdayId || !compositionId || !itemId || !(await compositionBelongsToMatchday(compositionId, matchdayId))) {
    throw new Error("bank-unassignment-invalid");
  }

  const item = await readFirst<CompositionBankSourceItem>(
    `matchday_reference_composition_items?select=id,composition_id,source_type,source_id&id=eq.${encodeURIComponent(
      itemId
    )}&composition_id=eq.${encodeURIComponent(compositionId)}`
  );

  const normalizedSourceType = normalizeSourceType(item?.source_type);

  if (!item || !item.source_id || (normalizedSourceType !== "manual_link" && normalizedSourceType !== "matchday_editorial_bank_item")) {
    throw new Error("bank-unassignment-invalid");
  }
  if (
    !(await hasRows(
      `matchday_editorial_bank_items?select=id&id=eq.${encodeURIComponent(item.source_id)}&matchday_id=eq.${encodeURIComponent(matchdayId)}`
    ))
  ) {
    throw new Error("bank-unassignment-invalid");
  }

  await writeSupabaseAdmin(
    `matchday_reference_composition_items?id=eq.${encodeURIComponent(item.id)}&composition_id=eq.${encodeURIComponent(compositionId)}`,
    { method: "DELETE" }
  );
}

function hierarchicalBankSourceIdentity(item: BankItemForAssignment) {
  const sourceType = normalizeIdentityValue(item.source_type);
  const sourceId = normalizeIdentityValue(item.source_id);
  if (sourceType && sourceId) return `${sourceType}:${sourceId}`;

  const link = normalizeEditorialLinkValue(item.link_url);
  if (link) return `link:${link}`;

  return `bank:${item.id.toLowerCase()}`;
}

async function assignBankItemToHierarchicalSlot(formData: FormData) {
  const matchdayId = cleanText(formData.get("matchday_id"));
  const compositionId = cleanText(formData.get("composition_id"));
  const bankItemId = cleanText(formData.get("bank_item_id"));
  const slotKey = cleanText(formData.get("slot_key"));

  if (
    !matchdayId ||
    !compositionId ||
    !bankItemId ||
    !isHierarchicalCompositionSlotKey(slotKey) ||
    !(await compositionBelongsToMatchday(compositionId, matchdayId, "hierarchical"))
  ) {
    throw new Error("hierarchical-assignment-invalid");
  }

  const bankItem = await readFirst<BankItemForAssignment>(
    `matchday_editorial_bank_items?select=id,status,label,label_color,title,subtitle,image_url,link_url,source_type,source_id,source_slug&id=eq.${encodeURIComponent(
      bankItemId
    )}&matchday_id=eq.${encodeURIComponent(matchdayId)}`
  );
  if (!bankItem || bankItem.status !== "active") {
    throw new Error("hierarchical-assignment-invalid");
  }

  const sourceIdentity = hierarchicalBankSourceIdentity(bankItem);
  const existingSlots = await fetchSupabaseAdminTable<Pick<HierarchicalCompositionSlot, "slot_key" | "source_identity">>(
    `matchday_hierarchical_composition_slots?select=slot_key,source_identity&composition_id=eq.${encodeURIComponent(compositionId)}`
  );

  if (existingSlots.some((slot) => slot.slot_key === slotKey)) {
    throw new CompositionPublicationError(`${hierarchicalSlotLabel(slotKey)} já está ocupado. Retira primeiro o conteúdo atual.`);
  }
  if (existingSlots.some((slot) => slot.source_identity === sourceIdentity)) {
    throw new CompositionPublicationError("Esta notícia já ocupa outro lugar da composição hierárquica.");
  }
  if (await hierarchicalCompositionUsesBankItem(compositionId, bankItem.id)) {
    throw new CompositionPublicationError("Esta notícia já ocupa outro lugar da composição hierárquica.");
  }
  if (
    isEditorialArticleSourceType(bankItem.source_type) &&
    bankItem.source_id &&
    (await hierarchicalCompositionUsesEditorialArticle(compositionId, bankItem.source_id))
  ) {
    throw new CompositionPublicationError("Este artigo já ocupa outro lugar da composição hierárquica.");
  }

  await writeSupabaseAdmin("matchday_hierarchical_composition_slots", {
    method: "POST",
    body: JSON.stringify({
      composition_id: compositionId,
      slot_key: slotKey,
      bank_item_id: bankItem.id,
      source_identity: sourceIdentity,
      label_snapshot: bankItem.label,
      title_snapshot: bankItem.title,
      subtitle_snapshot: bankItem.subtitle,
      image_url_snapshot: bankItem.image_url,
      link_url_snapshot: bankItem.link_url,
    }),
  });
}

async function unassignHierarchicalSlot(formData: FormData) {
  const matchdayId = cleanText(formData.get("matchday_id"));
  const compositionId = cleanText(formData.get("composition_id"));
  const slotId = cleanText(formData.get("hierarchical_slot_id"));

  if (
    !matchdayId ||
    !compositionId ||
    !slotId ||
    !(await compositionBelongsToMatchday(compositionId, matchdayId, "hierarchical"))
  ) {
    throw new Error("hierarchical-unassignment-invalid");
  }

  await writeSupabaseAdmin(
    `matchday_hierarchical_composition_slots?id=eq.${encodeURIComponent(slotId)}&composition_id=eq.${encodeURIComponent(compositionId)}`,
    { method: "DELETE" },
  );
}

async function readHierarchicalCompositionSlots(compositionId: string) {
  return fetchSupabaseAdminTable<HierarchicalCompositionSlot>(
    `matchday_hierarchical_composition_slots?select=id,composition_id,slot_key,bank_item_id,source_identity,label_snapshot,title_snapshot,subtitle_snapshot,image_url_snapshot,link_url_snapshot,created_at,updated_at&composition_id=eq.${encodeURIComponent(
      compositionId
    )}`,
  );
}

async function readHierarchicalCompositionReferenceItems(compositionId: string) {
  return fetchSupabaseAdminTable<HierarchicalCompositionReferenceItem>(
    `matchday_reference_composition_items?select=slot_type,sort_order,title_snapshot,subtitle_snapshot,image_url_snapshot,link_url_snapshot,label_snapshot&composition_id=eq.${encodeURIComponent(
      compositionId
    )}`,
  );
}

async function hierarchicalCompositionUsesEditorialArticle(
  compositionId: string,
  articleId: string,
) {
  const normalizedArticleId = normalizeIdentityValue(articleId);
  const [slots, referenceItems] = await Promise.all([
    fetchSupabaseAdminTable<Pick<HierarchicalCompositionSlot, "source_identity">>(
      `matchday_hierarchical_composition_slots?select=source_identity&composition_id=eq.${encodeURIComponent(compositionId)}`,
    ),
    fetchSupabaseAdminTable<{
      source_type: string | null;
      source_id: string | null;
    }>(
      `matchday_reference_composition_items?select=source_type,source_id&composition_id=eq.${encodeURIComponent(
        compositionId
      )}&slot_type=in.(complement,beyond_matchday)`,
    ),
  ]);

  if (slots.some((slot) => normalizeIdentityValue(slot.source_identity) === `editorial_article:${normalizedArticleId}`)) {
    return true;
  }

  if (
    referenceItems.some(
      (item) => isEditorialArticleSourceType(item.source_type) && normalizeIdentityValue(item.source_id) === normalizedArticleId,
    )
  ) {
    return true;
  }

  const bankItemIds = referenceItems
    .filter((item) => isBankSourceType(item.source_type) && item.source_id)
    .map((item) => item.source_id as string);
  if (bankItemIds.length === 0) return false;

  const bankItems = await fetchSupabaseAdminTable<Pick<BankItemForAssignment, "source_type" | "source_id">>(
    `matchday_editorial_bank_items?select=source_type,source_id&id=in.(${bankItemIds.map(encodeURIComponent).join(",")})`,
  );
  return bankItems.some(
    (item) => isEditorialArticleSourceType(item.source_type) && normalizeIdentityValue(item.source_id) === normalizedArticleId,
  );
}

async function hierarchicalCompositionUsesBankItem(
  compositionId: string,
  bankItemId: string,
) {
  const [slot, auxiliaryItem] = await Promise.all([
    readFirst<{ id: string }>(
      `matchday_hierarchical_composition_slots?select=id&composition_id=eq.${encodeURIComponent(
        compositionId
      )}&bank_item_id=eq.${encodeURIComponent(bankItemId)}`,
    ),
    readFirst<{ id: string }>(
      `matchday_reference_composition_items?select=id&composition_id=eq.${encodeURIComponent(
        compositionId
      )}&slot_type=in.(complement,beyond_matchday)&source_type=eq.matchday_editorial_bank_item&source_id=eq.${encodeURIComponent(bankItemId)}`,
    ),
  ]);

  return Boolean(slot || auxiliaryItem);
}

async function persistHierarchicalAuxiliaryArticle(input: {
  articleId: string | null;
  bankItemId?: string | null;
  compositionId: string;
  projection: HierarchicalArticleCardProjection;
  target: HierarchicalAuxiliaryTarget;
}) {
  const existingTarget = await readFirst<{ id: string }>(
    `matchday_reference_composition_items?select=id&composition_id=eq.${encodeURIComponent(
      input.compositionId
    )}&slot_type=eq.${encodeURIComponent(input.target.slotType)}&sort_order=eq.${input.target.sortOrder}`,
  );
  if (existingTarget) {
    throw new CompositionPublicationError(`${input.target.label} já está ocupado. Retira primeiro o artigo atual.`);
  }

  if (
    input.bankItemId &&
    (await hierarchicalCompositionUsesBankItem(input.compositionId, input.bankItemId))
  ) {
    throw new CompositionPublicationError("Esta notícia já ocupa outro lugar da composição hierárquica.");
  }

  if (
    input.articleId &&
    (await hierarchicalCompositionUsesEditorialArticle(input.compositionId, input.articleId))
  ) {
    throw new CompositionPublicationError("Este artigo já ocupa outro lugar da composição hierárquica.");
  }

  const sourceId = input.bankItemId ?? input.articleId;
  if (!sourceId) throw new Error("hierarchical-auxiliary-source-invalid");

  await writeSupabaseAdmin("matchday_reference_composition_items", {
    method: "POST",
    body: JSON.stringify({
      composition_id: input.compositionId,
      slot_type: input.target.slotType,
      source_type: input.bankItemId ? "matchday_editorial_bank_item" : "editorial_article",
      source_id: sourceId,
      article_id: null,
      sort_order: input.target.sortOrder,
      title_snapshot: input.projection.title,
      subtitle_snapshot: input.projection.subtitle,
      image_url_snapshot: input.projection.imageUrl,
      link_url_snapshot: input.projection.linkUrl,
      label_snapshot: input.projection.label,
      label_color_snapshot: null,
      status: "draft",
    }),
  });
}

async function assignBankItemToHierarchicalAuxiliary(formData: FormData) {
  const matchdayId = cleanText(formData.get("matchday_id"));
  const compositionId = cleanText(formData.get("composition_id"));
  const bankItemId = cleanText(formData.get("bank_item_id"));
  const target = hierarchicalAuxiliaryTarget(cleanText(formData.get("auxiliary_target")));

  if (
    !matchdayId ||
    !compositionId ||
    !bankItemId ||
    !target ||
    !(await compositionBelongsToMatchday(compositionId, matchdayId, "hierarchical"))
  ) {
    throw new Error("hierarchical-auxiliary-assignment-invalid");
  }

  const bankItem = await readFirst<BankItemForAssignment>(
    `matchday_editorial_bank_items?select=id,status,label,label_color,title,subtitle,image_url,link_url,source_type,source_id,source_slug&id=eq.${encodeURIComponent(
      bankItemId
    )}&matchday_id=eq.${encodeURIComponent(matchdayId)}`,
  );
  if (!bankItem || bankItem.status !== "active") {
    throw new CompositionPublicationError("Esta notícia já não está disponível no banco da Jornada.");
  }

  const articleId = isEditorialArticleSourceType(bankItem.source_type) ? bankItem.source_id : null;
  const projection = articleId
    ? projectHierarchicalAuxiliaryArticle(await readPublishedEditorialArticleForHierarchicalAuxiliary(articleId))
    : projectHierarchicalAuxiliaryBankItem(bankItem);
  await persistHierarchicalAuxiliaryArticle({
    articleId,
    bankItemId: bankItem.id,
    compositionId,
    projection,
    target,
  });
}

async function assignPublishedArticleToHierarchicalAuxiliary(formData: FormData) {
  const matchdayId = cleanText(formData.get("matchday_id"));
  const compositionId = cleanText(formData.get("composition_id"));
  const articleId = cleanText(formData.get("editorial_article_id"));
  const target = hierarchicalAuxiliaryTarget(cleanText(formData.get("auxiliary_target")));

  if (
    !matchdayId ||
    !compositionId ||
    !articleId ||
    !target ||
    !(await compositionBelongsToMatchday(compositionId, matchdayId, "hierarchical"))
  ) {
    throw new Error("hierarchical-auxiliary-assignment-invalid");
  }

  const article = await readPublishedEditorialArticleForHierarchicalAuxiliary(articleId);
  await persistHierarchicalAuxiliaryArticle({
    articleId,
    compositionId,
    projection: projectHierarchicalAuxiliaryArticle(article),
    target,
  });
}

async function assignRoundupItemToHierarchicalComposition(formData: FormData) {
  const matchdayId = cleanText(formData.get("matchday_id"));
  const compositionId = cleanText(formData.get("composition_id"));
  const roundupItemId = cleanText(formData.get("roundup_item_id"));

  if (
    !matchdayId ||
    !compositionId ||
    !roundupItemId ||
    !(await compositionBelongsToMatchday(compositionId, matchdayId, "hierarchical"))
  ) {
    throw new Error("hierarchical-roundup-assignment-invalid");
  }

  const roundupItem = await readFirst<CurrentRoundupItem>(
    `matchday_roundup_items?select=id,label,title,subtitle,image_url,video_url,duration,type,sort_order,status&id=eq.${encodeURIComponent(
      roundupItemId
    )}&matchday_id=eq.${encodeURIComponent(matchdayId)}&status=eq.published`,
  );
  if (!roundupItem || !cleanText(roundupItem.video_url)) {
    throw new CompositionPublicationError("O vídeo tem de estar publicado e ter URL antes de entrar na Composição.");
  }

  const existing = await readFirst<{ id: string }>(
    `matchday_reference_composition_items?select=id&composition_id=eq.${encodeURIComponent(
      compositionId
    )}&slot_type=eq.roundup&source_type=eq.matchday_roundup_item&source_id=eq.${encodeURIComponent(roundupItem.id)}`,
  );
  if (existing) {
    throw new CompositionPublicationError("Este vídeo já faz parte da Composição.");
  }

  const nextSortOrder = (await readMaxSortOrderForSlot(compositionId, "roundup")) + 1;
  await writeSupabaseAdmin("matchday_reference_composition_items", {
    method: "POST",
    body: JSON.stringify({
      composition_id: compositionId,
      slot_type: "roundup",
      source_type: "matchday_roundup_item",
      source_id: roundupItem.id,
      article_id: null,
      sort_order: nextSortOrder,
      title_snapshot: roundupItem.title,
      subtitle_snapshot: roundupItem.subtitle,
      image_url_snapshot: roundupItem.image_url,
      link_url_snapshot: roundupItem.video_url,
      label_snapshot: roundupItem.label || roundupItem.type,
      label_color_snapshot: null,
      status: "draft",
    }),
  });
}

async function activateReferenceComposition(formData: FormData, publishDraft: boolean) {
  const matchdayId = cleanText(formData.get("matchday_id"));
  const compositionId = cleanText(formData.get("composition_id"));
  if (!matchdayId || !compositionId) throw new Error("composition-invalid");

  await writeSupabaseAdmin("rpc/activate_matchday_reference_composition", {
    method: "POST",
    body: JSON.stringify({
      p_matchday_id: matchdayId,
      p_composition_id: compositionId,
      p_publish_draft: publishDraft,
    }),
  });
}

async function buildCurrentPageSnapshots(matchdayId: string, useRoundupItems: boolean): Promise<CompositionSnapshot[]> {
  const [editorial, highlights, latestNews, horizontalNews, roundupItems] = await Promise.all([
    readFirst<CurrentEditorial>(
      `matchday_editorials?select=id,title,summary,image_url,headline_link_url,complementary_mode,complementary_label,complementary_title,complementary_text,complementary_image_url,complementary_link_url,complementary_status,side_block_status,side_block_type,side_block_label,side_block_label_color,side_block_title,side_block_text,side_block_image_url,side_block_link_url&matchday_id=eq.${encodeURIComponent(
        matchdayId
      )}`
    ),
    fetchSupabaseAdminTable<CurrentHighlight>(
      `matchday_highlights?select=id,label,label_color,title,image_url,link_url,sort_order,status&matchday_id=eq.${encodeURIComponent(
        matchdayId
      )}&status=eq.published&order=sort_order.asc&limit=50`
    ).catch(() => []),
    fetchSupabaseAdminTable<CurrentLatestNews>(
      `matchday_latest_news?select=id,time_label,time_label_color,title,subtitle,image_url,link_url,article_id,sort_order,status&matchday_id=eq.${encodeURIComponent(
        matchdayId
      )}&status=eq.published&order=sort_order.asc`
    ).catch(() => []),
    fetchSupabaseAdminTable<CurrentHorizontalNews>(
      `matchday_horizontal_news?select=id,label,label_color,title,subtitle,image_url,link_url,sort_order,status&matchday_id=eq.${encodeURIComponent(
        matchdayId
      )}&status=eq.published&order=sort_order.asc`
    ).catch(() => []),
    useRoundupItems
      ? fetchSupabaseAdminTable<CurrentRoundupItem>(
          `matchday_roundup_items?select=id,label,title,subtitle,image_url,video_url,type,sort_order,status&matchday_id=eq.${encodeURIComponent(
            matchdayId
          )}&status=eq.published&order=sort_order.asc&limit=50`
        ).catch(() => [])
      : Promise.resolve([])
  ]);

  const snapshots: CompositionSnapshot[] = [];

  if (editorial && hasContent(editorial.title, editorial.summary, editorial.image_url)) {
    snapshots.push({
      slot_type: "headline",
      source_type: "matchday_editorial",
      source_id: editorial.id,
      article_id: null,
      title_snapshot: editorial.title,
      subtitle_snapshot: editorial.summary,
      image_url_snapshot: editorial.image_url,
      link_url_snapshot: editorial.headline_link_url ?? null,
      label_snapshot: "Manchete",
      label_color_snapshot: null
    });
  }

  if (
    editorial &&
    Boolean(editorial.complementary_mode) &&
    editorial.complementary_mode !== "none" &&
    isPublished(editorial.complementary_status) &&
    hasContent(editorial.complementary_title, editorial.complementary_text, editorial.complementary_image_url)
  ) {
    snapshots.push({
      slot_type: "complement",
      source_type: "matchday_editorial",
      source_id: editorial.id,
      article_id: null,
      title_snapshot: editorial.complementary_title,
      subtitle_snapshot: editorial.complementary_text,
      image_url_snapshot: editorial.complementary_image_url,
      link_url_snapshot: editorial.complementary_link_url,
      label_snapshot: editorial.complementary_label,
      label_color_snapshot: null
    });
  }

  if (editorial && isPublished(editorial.side_block_status) && hasContent(editorial.side_block_title, editorial.side_block_text, editorial.side_block_image_url)) {
    snapshots.push({
      slot_type: "side_block",
      source_type: "matchday_editorial",
      source_id: editorial.id,
      article_id: null,
      title_snapshot: editorial.side_block_title,
      subtitle_snapshot: editorial.side_block_text,
      image_url_snapshot: editorial.side_block_image_url,
      link_url_snapshot: editorial.side_block_link_url,
      label_snapshot: editorial.side_block_label || editorial.side_block_type,
      label_color_snapshot: editorial.side_block_label_color
    });
  }

  highlights.forEach((item) => {
    snapshots.push({
      slot_type: "highlight",
      source_type: "matchday_highlight",
      source_id: item.id,
      article_id: null,
      title_snapshot: item.title,
      subtitle_snapshot: null,
      image_url_snapshot: item.image_url,
      link_url_snapshot: item.link_url,
      label_snapshot: item.label,
      label_color_snapshot: item.label_color
    });
  });

  latestNews.forEach((item) => {
    snapshots.push({
      slot_type: "editorial_line_item",
      source_type: "matchday_latest_news",
      source_id: item.id,
      article_id: item.article_id,
      title_snapshot: item.title,
      subtitle_snapshot: item.subtitle,
      image_url_snapshot: item.image_url,
      link_url_snapshot: item.link_url,
      label_snapshot: item.time_label,
      label_color_snapshot: item.time_label_color
    });
  });

  horizontalNews.forEach((item) => {
    snapshots.push({
      slot_type: "important_item",
      source_type: "matchday_horizontal_news",
      source_id: item.id,
      article_id: null,
      title_snapshot: item.title,
      subtitle_snapshot: item.subtitle,
      image_url_snapshot: item.image_url,
      link_url_snapshot: item.link_url,
      label_snapshot: item.label,
      label_color_snapshot: item.label_color
    });
  });

  roundupItems.forEach((item) => {
    snapshots.push({
      slot_type: "roundup",
      source_type: "matchday_roundup_item",
      source_id: item.id,
      article_id: null,
      title_snapshot: item.title,
      subtitle_snapshot: item.subtitle,
      image_url_snapshot: item.image_url,
      link_url_snapshot: item.video_url,
      label_snapshot: item.label || item.type,
      label_color_snapshot: null
    });
  });

  return snapshots;
}

async function createDraft(
  matchdayId: string,
  internalName: string | null,
  presentationMode: ReferenceCompositionPresentationMode,
) {
  if (!(await hasRows(`matchdays?select=id&id=eq.${encodeURIComponent(matchdayId)}`))) throw new Error("matchday-invalid");
  if (await hasRows(`matchday_reference_compositions?select=id&matchday_id=eq.${encodeURIComponent(matchdayId)}&status=eq.draft&presentation_mode=eq.${encodeURIComponent(presentationMode)}`)) return;
  await writeSupabaseAdmin("matchday_reference_compositions", {
    method: "POST",
    body: JSON.stringify({
      matchday_id: matchdayId,
      status: "draft",
      is_current: false,
      internal_name: internalName,
      use_roundup_items: true,
      presentation_mode: presentationMode,
    })
  });
}

async function updateDraft(formData: FormData) {
  const matchdayId = cleanText(formData.get("matchday_id"));
  const compositionId = cleanText(formData.get("composition_id"));
  const presentationMode = cleanPresentationMode(formData.get("presentation_mode"));
  if (!matchdayId || !compositionId || !(await compositionBelongsToMatchday(compositionId, matchdayId, presentationMode))) throw new Error("composition-invalid");
  await writeSupabaseAdmin(
    `matchday_reference_compositions?id=eq.${encodeURIComponent(compositionId)}&matchday_id=eq.${encodeURIComponent(
      matchdayId
    )}&status=eq.draft`,
    {
      method: "PATCH",
      body: JSON.stringify({
        internal_name: cleanText(formData.get("internal_name")),
        use_roundup_items: cleanText(formData.get("use_roundup_items")) === "1"
      })
    }
  );
}

async function addItem(formData: FormData) {
  const matchdayId = cleanText(formData.get("matchday_id"));
  const compositionId = cleanText(formData.get("composition_id"));
  if (!matchdayId || !compositionId || !(await compositionBelongsToMatchday(compositionId, matchdayId))) throw new Error("composition-invalid");

  const nextItem: CompositionIdentityItem & {
    slot_type: string | null;
    sort_order: number;
    label_snapshot: string | null;
    label_color_snapshot: string | null;
  } = {
    slot_type: cleanText(formData.get("slot_type")),
    source_type: cleanText(formData.get("source_type")),
    source_id: cleanText(formData.get("source_id")),
    article_id: cleanText(formData.get("article_id")),
    sort_order: cleanInteger(formData.get("sort_order")),
    title_snapshot: cleanText(formData.get("title_snapshot")),
    subtitle_snapshot: cleanText(formData.get("subtitle_snapshot")),
    image_url_snapshot: cleanText(formData.get("image_url_snapshot")),
    link_url_snapshot: cleanText(formData.get("link_url_snapshot")),
    label_snapshot: cleanText(formData.get("label_snapshot")),
    label_color_snapshot: cleanText(formData.get("label_color_snapshot"))
  };

  const existingItems = await readCompositionIdentityItems(compositionId);

  if (existingItems.some((item) => compositionIdentityMatches(item, nextItem))) {
    throw new CompositionPublicationError("Esta notícia já está adicionada à composição.");
  }

  await writeSupabaseAdmin("matchday_reference_composition_items", {
    method: "POST",
    body: JSON.stringify({
      composition_id: compositionId,
      ...nextItem,
      status: "draft"
    })
  });
}

async function removeItem(formData: FormData) {
  const matchdayId = cleanText(formData.get("matchday_id"));
  const compositionId = cleanText(formData.get("composition_id"));
  const itemId = cleanText(formData.get("item_id"));
  const presentationMode = cleanPresentationMode(formData.get("presentation_mode"));
  if (!matchdayId || !compositionId || !itemId || !(await compositionBelongsToMatchday(compositionId, matchdayId, presentationMode))) throw new Error("composition-invalid");
  await writeSupabaseAdmin(
    `matchday_reference_composition_items?id=eq.${encodeURIComponent(itemId)}&composition_id=eq.${encodeURIComponent(compositionId)}`,
    { method: "DELETE" }
  );
}

async function moveCompositionItem(formData: FormData) {
  const matchdayId = cleanText(formData.get("matchday_id"));
  const compositionId = cleanText(formData.get("composition_id"));
  const itemId = cleanText(formData.get("item_id"));
  const targetSlotType = cleanText(formData.get("target_slot_type"));

  if (
    !matchdayId ||
    !compositionId ||
    !itemId ||
    !targetSlotType ||
    !bankCompositionSlotTypes.has(targetSlotType) ||
    !(await compositionBelongsToMatchday(compositionId, matchdayId))
  ) {
    throw new Error("composition-invalid");
  }

  const item = await readFirst<CompositionMoveItem>(
    `matchday_reference_composition_items?select=id,composition_id,slot_type,source_type,source_id,article_id,link_url_snapshot,sort_order,created_at&id=eq.${encodeURIComponent(
      itemId
    )}&composition_id=eq.${encodeURIComponent(compositionId)}`
  );

  if (!item) throw new Error("composition-invalid");
  if (item.slot_type === "roundup" || normalizeSourceType(item.source_type) === "matchday_roundup_item") {
    throw new Error("composition-invalid");
  }
  if (item.slot_type === targetSlotType) return;

  const articleId = await resolveEditorialArticleIdForCompositionItem(item, matchdayId);
  if (
    !articleId
    && isEditorialNewsFlowSlotType(item.slot_type)
    && isEditorialNewsFlowSlotType(targetSlotType)
  ) {
    throw new CompositionPublicationError(
      "Esta notícia é um registo antigo sem artigo-fonte completo. Abre ou cria o artigo antes de a transferir entre zonas.",
    );
  }
  if (articleId && !articleNewsFlowSlotTypes.has(targetSlotType)) {
    throw new CompositionPublicationError("Os artigos noticiosos não podem ser transferidos para Contexto ou Vídeo.");
  }

  await assertCompositionSlotCapacity(compositionId, targetSlotType, item.id);
  const nextSortOrder = (await readMaxSortOrderForSlot(compositionId, targetSlotType)) + 1;
  const payload: Record<string, string | number | null> = {
    slot_type: targetSlotType,
    sort_order: nextSortOrder,
    updated_at: new Date().toISOString()
  };

  if (articleId) {
    if (!isEditorialNewsFlowSlotType(targetSlotType)) {
      throw new CompositionPublicationError("A zona escolhida não pertence ao circuito noticioso.");
    }
    const projection = projectEditorialArticleToZone(
      await readEditorialArticleForZone(articleId, matchdayId),
      targetSlotType
    );
    payload.title_snapshot = projection.title;
    payload.subtitle_snapshot = projection.subtitle;
    payload.image_url_snapshot = projection.imageUrl;
    payload.link_url_snapshot = projection.linkUrl;
    payload.label_snapshot = projection.label;
    payload.label_color_snapshot = null;
  }

  await writeSupabaseAdmin(
    `matchday_reference_composition_items?id=eq.${encodeURIComponent(itemId)}&composition_id=eq.${encodeURIComponent(compositionId)}`,
    { method: "PATCH", body: JSON.stringify(payload) }
  );
}

async function updateArticleZonePresentation(formData: FormData) {
  const matchdayId = cleanText(formData.get("matchday_id"));
  const compositionId = cleanText(formData.get("composition_id"));
  const itemId = cleanText(formData.get("item_id"));

  if (!matchdayId || !compositionId || !itemId || !(await readDraftComposition(compositionId, matchdayId))) {
    throw new Error("composition-invalid");
  }

  const item = await readFirst<CompositionMoveItem>(
    `matchday_reference_composition_items?select=id,composition_id,slot_type,source_type,source_id,article_id,link_url_snapshot,sort_order,created_at&id=eq.${encodeURIComponent(
      itemId
    )}&composition_id=eq.${encodeURIComponent(compositionId)}`
  );

  if (!item || item.slot_type !== "editorial_line_item") {
    throw new Error("composition-invalid");
  }

  const articleId = await resolveEditorialArticleIdForCompositionItem(item, matchdayId);
  if (!articleId) {
    throw new CompositionPublicationError("A apresentação manual de Últimas só está disponível para artigos completos.");
  }

  await writeSupabaseAdmin(
    `matchday_reference_composition_items?id=eq.${encodeURIComponent(itemId)}&composition_id=eq.${encodeURIComponent(compositionId)}`,
    {
      method: "PATCH",
      body: JSON.stringify({
        label_snapshot: cleanText(formData.get("label_snapshot")),
        subtitle_snapshot: cleanText(formData.get("subtitle_snapshot")),
        updated_at: new Date().toISOString()
      })
    }
  );
}

async function reorderCompositionItem(formData: FormData) {
  const matchdayId = cleanText(formData.get("matchday_id"));
  const compositionId = cleanText(formData.get("composition_id"));
  const itemId = cleanText(formData.get("item_id"));
  const direction = cleanText(formData.get("direction"));
  const presentationMode = cleanPresentationMode(formData.get("presentation_mode"));

  if (
    !matchdayId ||
    !compositionId ||
    !itemId ||
    (direction !== "up" && direction !== "down") ||
    !(await compositionBelongsToMatchday(compositionId, matchdayId, presentationMode))
  ) {
    throw new Error("composition-invalid");
  }

  const item = await readFirst<CompositionMoveItem>(
    `matchday_reference_composition_items?select=id,composition_id,slot_type,source_type,source_id,article_id,link_url_snapshot,sort_order,created_at&id=eq.${encodeURIComponent(
      itemId
    )}&composition_id=eq.${encodeURIComponent(compositionId)}`
  );
  if (!item) throw new Error("composition-invalid");

  const items = await fetchSupabaseAdminTable<CompositionMoveItem>(
    `matchday_reference_composition_items?select=id,composition_id,slot_type,source_type,source_id,article_id,sort_order,created_at&composition_id=eq.${encodeURIComponent(
      compositionId
    )}&slot_type=eq.${encodeURIComponent(item.slot_type)}&order=sort_order.asc,created_at.asc`
  );
  const currentIndex = items.findIndex((candidate) => candidate.id === item.id);
  const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;

  if (currentIndex < 0 || targetIndex < 0 || targetIndex >= items.length) return;

  const reordered = [...items];
  const currentItem = reordered[currentIndex];
  if (!currentItem) return;
  reordered.splice(currentIndex, 1);
  reordered.splice(targetIndex, 0, currentItem);

  for (const [index, candidate] of reordered.entries()) {
    const nextOrder = index + 1;
    if (candidate.sort_order === nextOrder) continue;

    await writeSupabaseAdmin(
      `matchday_reference_composition_items?id=eq.${encodeURIComponent(candidate.id)}&composition_id=eq.${encodeURIComponent(compositionId)}`,
      {
        method: "PATCH",
        body: JSON.stringify({ sort_order: nextOrder, updated_at: new Date().toISOString() })
      }
    );
  }
}

async function saveCurrentPageState(formData: FormData) {
  const matchdayId = cleanText(formData.get("matchday_id"));
  const compositionId = cleanText(formData.get("composition_id"));
  if (!matchdayId || !compositionId) throw new Error("composition-invalid");
  const composition = await readDraftComposition(compositionId, matchdayId);
  if (!composition || composition.presentation_mode !== "standard") throw new Error("composition-invalid");

  const snapshots = await buildCurrentPageSnapshots(matchdayId, composition.use_roundup_items);
  if (snapshots.length === 0) return;

  const existingItems = await readCompositionIdentityItems(composition.id);
  const newSnapshots = filterNewCompositionSnapshots(snapshots, existingItems);
  if (newSnapshots.length === 0) return;

  const maxSortOrder = await readMaxSortOrder(composition.id);
  for (const [index, snapshot] of newSnapshots.entries()) {
    await writeSupabaseAdmin("matchday_reference_composition_items", {
      method: "POST",
      body: JSON.stringify({
        composition_id: composition.id,
        ...snapshot,
        sort_order: maxSortOrder + index + 1,
        status: "draft"
      })
    });
  }
}

async function publishReferenceComposition(formData: FormData) {
  const matchdayId = cleanText(formData.get("matchday_id"));
  const compositionId = cleanText(formData.get("composition_id"));
  const confirmed = cleanText(formData.get("confirm_publish")) === "yes";
  if (!matchdayId || !compositionId || !confirmed) throw new CompositionPublicationError("Confirma a revisão da composição antes de publicar.");

  const composition = await readReferenceCompositionState(compositionId, matchdayId);
  if (!composition) throw new Error("composition-invalid");
  if (composition.status === "published") return;
  if (composition.status !== "draft") throw new Error("composition-invalid");

  if (composition.presentation_mode === "hierarchical") {
    const hierarchicalSlots = await readHierarchicalCompositionSlots(composition.id);
    const hierarchicalReferenceItems = await readHierarchicalCompositionReferenceItems(composition.id);
    const missing = missingHierarchicalCompositionSlots(hierarchicalSlots);
    const incomplete = incompleteHierarchicalCompositionSlots(hierarchicalSlots);
    if (missing.length > 0 || incomplete.length > 0) {
      const labels = Array.from(new Set([...missing, ...incomplete])).map(hierarchicalSlotLabel);
      throw new CompositionPublicationError(`Completa os 15 lugares antes de publicar. Em falta: ${labels.join(", ")}.`);
    }
    if (!isPublishableHierarchicalBeyondMatchday(hierarchicalReferenceItems)) {
      const missingBeyond = HIERARCHICAL_BEYOND_MATCHDAY_POSITIONS
        .filter((position) => {
          const item = hierarchicalReferenceItems.find(
            (candidate) => candidate.slot_type === "beyond_matchday" && candidate.sort_order === position.sortOrder,
          );
          return !item ||
            !item.label_snapshot?.trim() ||
            !item.title_snapshot?.trim() ||
            !item.subtitle_snapshot?.trim() ||
            !item.image_url_snapshot?.trim() ||
            !item.link_url_snapshot?.trim();
        })
        .map((position) => position.label);
      throw new CompositionPublicationError(
        `Completa as 5 posições de Para Lá da Jornada antes de publicar. Em falta: ${missingBeyond.join(", ")}.`,
      );
    }
  } else {
    const compositionItems = await fetchSupabaseAdminTable<CompositionPublicationItem>(
      `matchday_reference_composition_items?select=slot_type&composition_id=eq.${encodeURIComponent(composition.id)}&limit=500`
    );
    validatePublishableCompositionItems(compositionItems);
  }

  await activateReferenceComposition(formData, true);
}

async function reopenReferenceComposition(formData: FormData) {
  const matchdayId = cleanText(formData.get("matchday_id"));
  const compositionId = cleanText(formData.get("composition_id"));
  if (!matchdayId || !compositionId) throw new Error("composition-invalid");

  const composition = await readReferenceCompositionState(compositionId, matchdayId);
  if (!composition) throw new Error("composition-invalid");
  if (composition.status !== "published" || !composition.is_current) throw new Error("composition-invalid");

  const now = new Date().toISOString();
  await writeSupabaseAdmin(
    `matchday_reference_compositions?id=eq.${encodeURIComponent(composition.id)}&matchday_id=eq.${encodeURIComponent(
      matchdayId
    )}&status=eq.published&is_current=is.true`,
    {
      method: "PATCH",
      body: JSON.stringify({
        status: "draft",
        is_current: false,
        published_at: null,
        updated_at: now
      })
    }
  );
}

export async function POST(request: Request) {
  if (!getSupabaseServiceConfig()) return redirectTo(request, "/admin?error=missing-service");
  const formData = await request.formData();
  const actionType = cleanText(formData.get("action_type"));
  const matchdayId = cleanText(formData.get("matchday_id"));
  const returnTo = cleanText(formData.get("return_to")) ?? "/admin/gestor";
  const returnAnchor = cleanText(formData.get("return_anchor"));

  try {
    if (!matchdayId) throw new Error("missing-matchday");
    if (actionType === "create_draft") await createDraft(matchdayId, cleanText(formData.get("internal_name")), cleanPresentationMode(formData.get("presentation_mode")));
    else if (actionType === "update_draft") await updateDraft(formData);
    else if (actionType === "add_item") await addItem(formData);
    else if (actionType === "remove_item") await removeItem(formData);
    else if (actionType === "move_composition_item") await moveCompositionItem(formData);
    else if (actionType === "update_article_zone_presentation") await updateArticleZonePresentation(formData);
    else if (actionType === "reorder_composition_item") await reorderCompositionItem(formData);
    else if (actionType === "save_current_page_state") await saveCurrentPageState(formData);
    else if (actionType === "save_matchday_editorial_bank_current") {
      const result = await saveCurrentMatchdayEditorialBank(matchdayId);
      return redirectTo(
        request,
        `${returnTo}${returnTo.includes("?") ? "&" : "?"}bank_saved=${result.saved}&bank_updated=${result.updated}&bank_existing=${result.existing}&bank_repeated=${result.repeated}&bank_skipped=${result.skipped}#matchday-editorial-bank`
      );
    }
    else if (actionType === "archive_bank_item") {
      await updateBankItemStatus(formData, "archived");
      return redirectTo(request, `${returnTo}${returnTo.includes("?") ? "&" : "?"}bank_archived=1#matchday-editorial-bank`);
    }
    else if (actionType === "reactivate_bank_item") {
      await updateBankItemStatus(formData, "active");
      return redirectTo(request, `${returnTo}${returnTo.includes("?") ? "&" : "?"}bank_reactivated=1#matchday-editorial-bank`);
    }
    else if (actionType === "assign_bank_item_to_composition_slot") {
      await assignBankItemToCompositionSlot(formData);
      return redirectTo(request, `${returnTo}${returnTo.includes("?") ? "&" : "?"}bank_assigned=1#matchday-editorial-bank`);
    }
    else if (actionType === "unassign_bank_item_from_composition_slot") {
      await unassignBankItemFromCompositionSlot(formData);
      return redirectTo(request, `${returnTo}${returnTo.includes("?") ? "&" : "?"}bank_unassigned=1#matchday-editorial-bank`);
    }
    else if (actionType === "assign_bank_item_to_hierarchical_slot") {
      await assignBankItemToHierarchicalSlot(formData);
      return redirectTo(request, `${returnTo}${returnTo.includes("?") ? "&" : "?"}bank_assigned=1#matchday-editorial-bank`);
    }
    else if (actionType === "assign_bank_item_to_hierarchical_auxiliary") {
      await assignBankItemToHierarchicalAuxiliary(formData);
      return redirectTo(request, `${returnTo}${returnTo.includes("?") ? "&" : "?"}bank_assigned=1#matchday-editorial-bank`);
    }
    else if (actionType === "assign_published_article_to_hierarchical_auxiliary") {
      await assignPublishedArticleToHierarchicalAuxiliary(formData);
      return redirectTo(request, compositionReturnTarget(returnTo, "composition_saved=1", returnAnchor));
    }
    else if (actionType === "assign_roundup_item_to_hierarchical_composition") {
      await assignRoundupItemToHierarchicalComposition(formData);
      return redirectTo(request, compositionReturnTarget(returnTo, "composition_saved=1", returnAnchor));
    }
    else if (actionType === "unassign_hierarchical_slot") {
      await unassignHierarchicalSlot(formData);
      return redirectTo(request, compositionReturnTarget(returnTo, "composition_saved=1", returnAnchor));
    }
    else if (actionType === "publish_reference_composition") await publishReferenceComposition(formData);
    else if (actionType === "activate_reference_composition") await activateReferenceComposition(formData, false);
    else if (actionType === "reopen_reference_composition") await reopenReferenceComposition(formData);
    else throw new Error("unknown-action");
  } catch (error) {
    if (actionType === "save_matchday_editorial_bank_current") {
      return redirectTo(request, `${returnTo}${returnTo.includes("?") ? "&" : "?"}bank_error=1#matchday-editorial-bank`);
    }
    if (actionType === "archive_bank_item" || actionType === "reactivate_bank_item") {
      const errorValue = error instanceof CompositionPublicationError ? encodeURIComponent(error.message) : "1";
      return redirectTo(request, `${returnTo}${returnTo.includes("?") ? "&" : "?"}bank_status_error=${errorValue}#matchday-editorial-bank`);
    }
    if (
      actionType === "assign_bank_item_to_composition_slot" ||
      actionType === "unassign_bank_item_from_composition_slot" ||
      actionType === "assign_bank_item_to_hierarchical_slot" ||
      actionType === "assign_bank_item_to_hierarchical_auxiliary"
    ) {
      const errorValue = error instanceof CompositionPublicationError ? encodeURIComponent(error.message) : "1";
      return redirectTo(request, `${returnTo}${returnTo.includes("?") ? "&" : "?"}bank_assignment_error=${errorValue}#matchday-editorial-bank`);
    }

    const errorValue = error instanceof CompositionPublicationError ? encodeURIComponent(error.message) : "1";
    return redirectTo(request, compositionReturnTarget(returnTo, `composition_error=${errorValue}`, returnAnchor));
  }

  return redirectTo(request, compositionReturnTarget(returnTo, "composition_saved=1", returnAnchor));
}
