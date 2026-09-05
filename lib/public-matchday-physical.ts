import {
  materializeEditorialVisualFamilySlots,
  type EditorialVisualFamily,
  type EditorialVisualFamilySlot,
} from "@/lib/editorial-visual-families";
import {
  buildLiveLayoutWorkspaceState,
  type LiveLayoutWorkspaceBankItem,
  type LiveLayoutWorkspacePlacement,
  type LiveLayoutWorkspaceState,
  type MatchdayLiveLayoutWorkspaceReaderRow,
} from "@/lib/editorial-matchday-live-layout-workspace";
import { fetchSupabaseAdminTable } from "@/lib/supabase";

const SUPPORTED_SOURCE_TYPE = "editorial_article";
const PUBLIC_READER_PROFILE_PROBE = "public_physical_reader_v1";
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type AssignmentRow = Readonly<{
  profile_key: string | null;
}>;

export type PublicMatchdayPhysicalArticleRow = Readonly<{
  id: string;
  slug: string | null;
  status: string | null;
  label: string | null;
  title: string | null;
  subtitle: string | null;
  image_url: string | null;
  author: string | null;
  published_at: string | null;
}>;

export type PublicMatchdayPhysicalItem = Readonly<{
  id: string;
  sourceId: string;
  sortOrder: number;
  label: string | null;
  title: string;
  subtitle: string;
  imageUrl: string;
  linkUrl: string;
  author: string | null;
  publishedAt: string | null;
}>;

export type PublicMatchdayPhysicalZoneSlot =
  EditorialVisualFamilySlot<PublicMatchdayPhysicalItem>;

export type PublicMatchdayPhysicalZone = Readonly<{
  zoneId: string;
  publicTitle: string;
  layoutId: EditorialVisualFamily;
  slots: readonly PublicMatchdayPhysicalZoneSlot[];
}>;

export type PublicMatchdayPhysicalSpecialSlot = Readonly<{
  position: number;
  role: "headline" | "highlight" | "context" | "faixa" | "selection";
  item: PublicMatchdayPhysicalItem | null;
}>;

export type PublicMatchdayPhysicalBlock =
  | Readonly<{
      blockId: string;
      kind: "zone";
      zoneId: string;
      sortOrder: number;
    }>
  | Readonly<{
      blockId: string;
      kind: "latest";
      sortOrder: number;
    }>
  | Readonly<{
      blockId: string;
      kind: "video";
      sortOrder: number;
    }>;

export type PublicMatchdayPhysicalSnapshot = Readonly<{
  kind: "physical";
  authority: "physical";
  stateToken: string;
  opening: Readonly<{
    slots: readonly PublicMatchdayPhysicalSpecialSlot[];
  }>;
  faixa: Readonly<{
    slots: readonly PublicMatchdayPhysicalSpecialSlot[];
  }>;
  blocks: readonly PublicMatchdayPhysicalBlock[];
  zones: readonly PublicMatchdayPhysicalZone[];
  latest: Readonly<{
    mode: "latest_news" | "editorial_line";
    placement: "top" | "four_news" | "hidden";
    title: string;
    titleColor: string | null;
    slots: readonly PublicMatchdayPhysicalSpecialSlot[];
  }>;
  video: Readonly<{
    active: boolean;
    highlight: PublicMatchdayPhysicalItem | null;
  }>;
  settings: Readonly<{
    headlineTitleColor: string | null;
  }>;
}>;

export type PublicMatchdayInvalidPhysicalSnapshot = Readonly<{
  kind: "invalid_physical_snapshot";
  reason: string;
}>;

export type PublicMatchdayPhysicalReadResult =
  | PublicMatchdayPhysicalSnapshot
  | PublicMatchdayInvalidPhysicalSnapshot
  | Readonly<{ kind: "legacy_candidate" }>;

export type PublicMatchdayPhysicalTableFetcher =
  <T>(path: string) => Promise<T[]>;

export type PublicMatchdayPhysicalDependencies = Readonly<{
  fetchTable?: PublicMatchdayPhysicalTableFetcher;
}>;

function physicalError(code: string): never {
  throw new Error(`public-matchday-physical-${code}`);
}

function cleanText(value: string | null | undefined): string | null {
  const clean = value?.trim();
  return clean || null;
}

function invalidPhysicalSnapshot(
  reason: string,
): PublicMatchdayInvalidPhysicalSnapshot {
  return {
    kind: "invalid_physical_snapshot",
    reason,
  };
}

function errorReason(error: unknown): string {
  if (!(error instanceof Error)) return "snapshot-invalid";

  return error.message
    .replace(/^public-matchday-physical-/, "")
    .replace(/^matchday-live-layout-workspace-/, "workspace-")
    .replace(/^matchday-live-layout-physical-/, "workspace-");
}

function recordId(value: unknown): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const id = (value as Record<string, unknown>).id;
  return typeof id === "string" && UUID_PATTERN.test(id.trim())
    ? id.trim().toLowerCase()
    : null;
}

function projectionZoneId(value: unknown): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const id = (value as Record<string, unknown>).zone_id;
  return typeof id === "string" && UUID_PATTERN.test(id.trim())
    ? id.trim().toLowerCase()
    : null;
}

function hasPhysicalEvidenceWithoutMarker(
  row: MatchdayLiveLayoutWorkspaceReaderRow,
): boolean {
  if (row.workspace_settings !== null) return true;
  if (!Array.isArray(row.zones) || !Array.isArray(row.legacy_zone_projection)) {
    return physicalError("authority-evidence-invalid");
  }

  const projectedZoneIds = new Set<string>();
  for (const projection of row.legacy_zone_projection) {
    const zoneId = projectionZoneId(projection);
    if (!zoneId) return physicalError("authority-evidence-invalid");
    projectedZoneIds.add(zoneId);
  }

  for (const zone of row.zones) {
    const zoneId = recordId(zone);
    if (!zoneId) return physicalError("authority-evidence-invalid");
    if (!projectedZoneIds.has(zoneId)) return true;
  }

  return false;
}

function articleIdsFilter(ids: readonly string[]): string {
  return ids.map((id) => encodeURIComponent(id)).join(",");
}

function materializeSpecialSlots(
  count: number,
  roleAt: (position: number) => PublicMatchdayPhysicalSpecialSlot["role"],
  placements: readonly LiveLayoutWorkspacePlacement[],
  itemByPlacementId: ReadonlyMap<string, PublicMatchdayPhysicalItem>,
): PublicMatchdayPhysicalSpecialSlot[] {
  const itemByPosition = new Map(
    placements.map((placement) => [
      placement.slotPosition,
      itemByPlacementId.get(placement.id)
        ?? physicalError("placement-article-missing"),
    ] as const),
  );

  return Array.from({ length: count }, (_, index) => {
    const position = index + 1;
    return {
      position,
      role: roleAt(position),
      item: itemByPosition.get(position) ?? null,
    };
  });
}

function resolvePublicItems(
  workspace: LiveLayoutWorkspaceState,
  articleRows: readonly PublicMatchdayPhysicalArticleRow[],
): ReadonlyMap<string, PublicMatchdayPhysicalItem> {
  const articleById = new Map<string, PublicMatchdayPhysicalArticleRow>();
  for (const article of articleRows) {
    const id = cleanText(article.id)?.toLowerCase();
    if (!id || !UUID_PATTERN.test(id) || articleById.has(id)) {
      return physicalError("article-result-invalid");
    }
    articleById.set(id, article);
  }

  const bankItemById = new Map<string, LiveLayoutWorkspaceBankItem>(
    workspace.bankItems.map((item) => [item.id, item]),
  );
  const itemByPlacementId = new Map<string, PublicMatchdayPhysicalItem>();

  for (const placement of workspace.placements) {
    const bankItem = bankItemById.get(placement.bankItemId);
    if (!bankItem) return physicalError("placement-bank-item-missing");
    if (bankItem.sourceType !== SUPPORTED_SOURCE_TYPE) {
      return physicalError("placement-source-unsupported");
    }
    if (bankItem.status !== "active") {
      return physicalError("placed-bank-item-inactive");
    }

    const article = articleById.get(bankItem.sourceId);
    const slug = cleanText(article?.slug);
    const title = cleanText(article?.title);
    const subtitle = cleanText(article?.subtitle);
    const imageUrl = cleanText(article?.image_url);

    if (
      !article
      || cleanText(article.status)?.toLowerCase() !== "published"
      || !slug
      || !title
      || !subtitle
      || !imageUrl
    ) {
      return physicalError("placed-article-unpublishable");
    }

    itemByPlacementId.set(placement.id, {
      id: placement.id,
      sourceId: bankItem.sourceId,
      sortOrder: placement.slotPosition,
      label: cleanText(article.label),
      title,
      subtitle,
      imageUrl,
      linkUrl: `/noticias/${slug}`,
      author: cleanText(article.author),
      publishedAt: article.published_at,
    });
  }

  return itemByPlacementId;
}

export function buildPublicMatchdayPhysicalSnapshot(
  workspace: LiveLayoutWorkspaceState,
  articleRows: readonly PublicMatchdayPhysicalArticleRow[],
): PublicMatchdayPhysicalSnapshot {
  const settings = workspace.workspaceSettings;
  const cutover = workspace.physicalCutover;
  if (!settings || !cutover) return physicalError("authority-missing");
  if (workspace.zones.length === 0) return physicalError("zones-missing");

  const latestBlocks = workspace.blocks.filter((block) => block.kind === "latest");
  const videoBlocks = workspace.blocks.filter((block) => block.kind === "video");
  if (latestBlocks.length !== 1) return physicalError("latest-block-invalid");
  if (videoBlocks.length > 1) return physicalError("video-block-invalid");

  const itemByPlacementId = resolvePublicItems(workspace, articleRows);
  const placementsOfType = (
    type: LiveLayoutWorkspacePlacement["placementType"],
  ) => workspace.placements.filter((placement) => placement.placementType === type);

  const openingPlacements = placementsOfType("opening");
  const faixaPlacements = placementsOfType("faixa");
  const selectionPlacements = placementsOfType("selection");
  const videoPlacements = placementsOfType("video_highlight");

  if (faixaPlacements.some((placement) => placement.slotPosition > settings.faixaSlotCount)) {
    return physicalError("faixa-placement-out-of-capacity");
  }
  if (videoPlacements.length > 1) return physicalError("video-highlight-invalid");
  if (!settings.videoModuleActive && videoPlacements.length > 0) {
    return physicalError("video-highlight-inactive");
  }
  if (
    settings.videoModuleActive
    && (videoBlocks.length !== 1 || videoPlacements.length !== 1)
  ) {
    return physicalError("video-module-incomplete");
  }

  const zones = workspace.zones.map((zone) => {
    const placements = workspace.placements.filter(
      (placement) => placement.placementType === "zone" && placement.zoneId === zone.id,
    );
    const slotResult = materializeEditorialVisualFamilySlots(
      zone.visualFamily,
      placements.map((placement) => ({
        position: placement.slotPosition,
        item: itemByPlacementId.get(placement.id)
          ?? physicalError("placement-article-missing"),
      })),
    );

    if (!slotResult.ok) {
      return physicalError(`zone-slots-${slotResult.reason}`);
    }

    return {
      zoneId: zone.id,
      publicTitle: zone.publicTitle,
      layoutId: zone.visualFamily,
      slots: slotResult.slots,
    } satisfies PublicMatchdayPhysicalZone;
  });

  return {
    kind: "physical",
    authority: "physical",
    stateToken: workspace.stateToken,
    opening: {
      slots: materializeSpecialSlots(
        5,
        (position) => position === 1
          ? "headline"
          : position === 5
            ? "context"
            : "highlight",
        openingPlacements,
        itemByPlacementId,
      ),
    },
    faixa: {
      slots: materializeSpecialSlots(
        settings.faixaSlotCount,
        () => "faixa",
        faixaPlacements,
        itemByPlacementId,
      ),
    },
    blocks: workspace.blocks.map((block) => block.kind === "zone"
      ? {
          blockId: block.id,
          kind: block.kind,
          zoneId: block.zoneId,
          sortOrder: block.sortOrder,
        }
      : {
          blockId: block.id,
          kind: block.kind,
          sortOrder: block.sortOrder,
        }),
    zones,
    latest: {
      mode: settings.latestZoneMode,
      placement: settings.latestZonePlacement,
      title: settings.latestZoneTitle,
      titleColor: settings.latestZoneTitleColor,
      slots: materializeSpecialSlots(
        4,
        () => "selection",
        selectionPlacements,
        itemByPlacementId,
      ),
    },
    video: {
      active: settings.videoModuleActive,
      highlight: videoPlacements[0]
        ? itemByPlacementId.get(videoPlacements[0].id)
          ?? physicalError("placement-article-missing")
        : null,
    },
    settings: {
      headlineTitleColor: settings.headlineTitleColor,
    },
  };
}

export async function readPublicMatchdayPhysicalSnapshot(
  matchdayId: string,
  dependencies: PublicMatchdayPhysicalDependencies = {},
): Promise<PublicMatchdayPhysicalReadResult> {
  const cleanMatchdayId = matchdayId.trim().toLowerCase();
  if (!UUID_PATTERN.test(cleanMatchdayId)) {
    return invalidPhysicalSnapshot("invalid-matchday-id");
  }

  const fetchTable = dependencies.fetchTable ?? fetchSupabaseAdminTable;
  let row: MatchdayLiveLayoutWorkspaceReaderRow | undefined;

  try {
    [row] = await fetchTable<MatchdayLiveLayoutWorkspaceReaderRow>(
      `rpc/read_matchday_live_layout_workspace_v13?p_matchday_id=${encodeURIComponent(
        cleanMatchdayId,
      )}&p_profile_key=${encodeURIComponent(PUBLIC_READER_PROFILE_PROBE)}`,
    );
  } catch {
    return invalidPhysicalSnapshot("workspace-read-failed");
  }

  if (!row) return invalidPhysicalSnapshot("workspace-row-missing");
  if (!("physical_cutover" in row) || !("workspace_settings" in row)) {
    return invalidPhysicalSnapshot("workspace-authority-shape-invalid");
  }

  const markerPresent = row.physical_cutover !== null;
  if (!markerPresent) {
    try {
      return hasPhysicalEvidenceWithoutMarker(row)
        ? invalidPhysicalSnapshot("physical-evidence-without-authority")
        : { kind: "legacy_candidate" };
    } catch (error) {
      return invalidPhysicalSnapshot(errorReason(error));
    }
  }

  try {
    const workspace = buildLiveLayoutWorkspaceState(cleanMatchdayId, row);
    if (!workspace.physicalCutover) return physicalError("authority-missing");

    const assignments = await fetchTable<AssignmentRow>(
      `matchday_editorial_profile_assignments?select=profile_key&matchday_id=eq.${encodeURIComponent(
        cleanMatchdayId,
      )}&limit=2`,
    );
    if (
      assignments.length !== 1
      || cleanText(assignments[0]?.profile_key) !== workspace.physicalCutover.profileKey
    ) {
      return physicalError("authority-profile-mismatch");
    }

    const placedSourceIds = Array.from(new Set(
      workspace.placements.map((placement) => {
        const bankItem = workspace.bankItems.find(
          (candidate) => candidate.id === placement.bankItemId,
        );
        if (!bankItem) return physicalError("placement-bank-item-missing");
        if (bankItem.sourceType !== SUPPORTED_SOURCE_TYPE) {
          return physicalError("placement-source-unsupported");
        }
        return bankItem.sourceId;
      }),
    ));

    const articles = placedSourceIds.length > 0
      ? await fetchTable<PublicMatchdayPhysicalArticleRow>(
          `editorial_articles?select=id,slug,status,label,title,subtitle,image_url,author,published_at&id=in.(${articleIdsFilter(
            placedSourceIds,
          )})`,
        )
      : [];

    return buildPublicMatchdayPhysicalSnapshot(workspace, articles);
  } catch (error) {
    return invalidPhysicalSnapshot(errorReason(error));
  }
}
