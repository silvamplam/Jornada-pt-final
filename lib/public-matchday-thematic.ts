import {
  editorialProfile,
  editorialProfileWithZoneLayouts,
  type EditorialProfileZoneKey,
  type EditorialVisualFamily,
} from "@/lib/editorial-profiles";
import {
  normalizeMatchdayEditorialProfileThematicZoneTitles,
  validateMatchdayEditorialProfilePageControls,
  type MatchdayEditorialProfilePageControls,
} from "@/lib/editorial-matchday-profile-workspace";
import { fetchSupabaseAdminTable } from "@/lib/supabase";

const SUPPORTED_SOURCE_TYPE = "editorial_article";
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type AssignmentRow = Readonly<{
  profile_key: string;
}>;

type ReconcileControlRow = Readonly<{
  revision: number;
  thematic_zone_order: unknown;
  thematic_zone_layouts: unknown;
  thematic_block_order: unknown;
  thematic_zone_titles: unknown;
}>;

type EditorialControlRow = Readonly<{
  title_color: string | null;
  latest_zone_placement: string | null;
  latest_zone_title: string | null;
}>;

type ZoneItemRow = Readonly<{
  source_type: string;
  source_id: string;
  zone_key: string;
  sort_order: number;
}>;

type ArticleRow = Readonly<{
  id: string;
  slug: string | null;
  status: string | null;
  label: string | null;
  title: string | null;
  subtitle: string | null;
  image_url: string | null;
  published_at: string | null;
}>;

export type PublicMatchdayThematicItem = Readonly<{
  id: string;
  sourceId: string;
  sortOrder: number;
  label: string | null;
  title: string;
  subtitle: string;
  imageUrl: string;
  linkUrl: string;
  publishedAt: string | null;
}>;

export type PublicMatchdayThematicZone = Readonly<{
  key: EditorialProfileZoneKey;
  label: string;
  capacity: number;
  visualFamily: EditorialVisualFamily;
  publicTitle: string;
  items: readonly PublicMatchdayThematicItem[];
}>;

export type PublicMatchdayThematicSnapshot = Readonly<{
  kind: "thematic";
  profileKey: string;
  competitionSlug: string;
  revision: number;
  pageControls: MatchdayEditorialProfilePageControls;
  zones: readonly PublicMatchdayThematicZone[];
}>;

export type PublicMatchdayUnsupportedThematicProfile = Readonly<{
  kind: "unsupported_profile";
  profileKey: string;
}>;

export type PublicMatchdayInvalidThematicSnapshot = Readonly<{
  kind: "invalid_snapshot";
  profileKey: string | null;
  reason: string;
}>;

export type PublicMatchdayThematicReadResult =
  | null
  | PublicMatchdayThematicSnapshot
  | PublicMatchdayUnsupportedThematicProfile
  | PublicMatchdayInvalidThematicSnapshot;

export type PublicMatchdayThematicTableFetcher =
  <T>(path: string) => Promise<T[]>;

export type PublicMatchdayThematicDependencies = Readonly<{
  fetchTable?: PublicMatchdayThematicTableFetcher;
}>;

function cleanText(
  value: string | null | undefined,
): string | null {
  const clean = value?.trim();
  return clean || null;
}

function invalidSnapshot(
  profileKey: string | null,
  reason: string,
): PublicMatchdayInvalidThematicSnapshot {
  return {
    kind: "invalid_snapshot",
    profileKey,
    reason,
  };
}

function articleIdsFilter(ids: readonly string[]) {
  return ids
    .map((id) => encodeURIComponent(id))
    .join(",");
}

export async function readPublicMatchdayThematicSnapshot(
  matchdayId: string,
  dependencies: PublicMatchdayThematicDependencies = {},
): Promise<PublicMatchdayThematicReadResult> {
  const cleanMatchdayId = matchdayId.trim();

  if (!UUID_PATTERN.test(cleanMatchdayId)) {
    return invalidSnapshot(
      null,
      "invalid-matchday-id",
    );
  }

  const fetchTable =
    dependencies.fetchTable ?? fetchSupabaseAdminTable;

  let assignmentRows: AssignmentRow[];

  try {
    assignmentRows =
      await fetchTable<AssignmentRow>(
        `matchday_editorial_profile_assignments?select=profile_key&matchday_id=eq.${encodeURIComponent(
          cleanMatchdayId,
        )}&limit=1`,
      );
  } catch {
    return invalidSnapshot(
      null,
      "assignment-read-failed",
    );
  }

  const assignment = assignmentRows[0];

  if (!assignment) {
    return null;
  }

  const profileKey =
    cleanText(assignment.profile_key);

  if (!profileKey) {
    return invalidSnapshot(
      null,
      "empty-profile-key",
    );
  }

  const profile =
    editorialProfile(profileKey);

  if (!profile) {
    return {
      kind: "unsupported_profile",
      profileKey,
    };
  }

  try {
    const [
      controlRows,
      editorialRows,
      zoneRows,
    ] = await Promise.all([
      fetchTable<ReconcileControlRow>(
        `matchday_editorial_profile_reconcile_control?select=revision,thematic_zone_order,thematic_zone_layouts,thematic_block_order,thematic_zone_titles&matchday_id=eq.${encodeURIComponent(
          cleanMatchdayId,
        )}&profile_key=eq.${encodeURIComponent(
          profileKey,
        )}&limit=1`,
      ),
      fetchTable<EditorialControlRow>(
        `matchday_editorials?select=title_color,latest_zone_placement,latest_zone_title&matchday_id=eq.${encodeURIComponent(
          cleanMatchdayId,
        )}&limit=1`,
      ),
      fetchTable<ZoneItemRow>(
        `matchday_editorial_profile_zone_items?select=source_type,source_id,zone_key,sort_order&matchday_id=eq.${encodeURIComponent(
          cleanMatchdayId,
        )}&profile_key=eq.${encodeURIComponent(
          profileKey,
        )}&order=zone_key.asc,sort_order.asc`,
      ),
    ]);

    const control =
      controlRows[0];

    if (
      !control
      || !Number.isSafeInteger(control.revision)
      || control.revision < 0
    ) {
      return invalidSnapshot(
        profileKey,
        "missing-or-invalid-reconcile-control",
      );
    }

    const editorial =
      editorialRows[0] ?? null;

    let pageControls:
      MatchdayEditorialProfilePageControls;

    try {
      pageControls =
        validateMatchdayEditorialProfilePageControls({
          headlineTitleColor:
            cleanText(editorial?.title_color),
          latestZonePlacement:
            cleanText(
              editorial?.latest_zone_placement,
            ) ?? "top",
          latestZoneTitle:
            cleanText(
              editorial?.latest_zone_title,
            ) ?? "",
          thematicZoneOrder:
            control.thematic_zone_order,
          thematicZoneLayouts:
            control.thematic_zone_layouts,
          thematicBlockOrder:
            control.thematic_block_order,
          thematicZoneTitles:
            normalizeMatchdayEditorialProfileThematicZoneTitles(
              control.thematic_zone_titles,
            ),
        });
    } catch {
      return invalidSnapshot(
        profileKey,
        "invalid-page-controls",
      );
    }

    const effectiveProfile =
      editorialProfileWithZoneLayouts(
        profile,
        pageControls.thematicZoneLayouts,
      );

    const zoneByKey =
      new Map(
        effectiveProfile.zones.map(
          (zone) => [zone.key, zone] as const,
        ),
      );

    const sourceIdentities =
      new Set<string>();

    const occupiedPositions =
      new Set<string>();

    for (const row of zoneRows) {
      const sourceType =
        cleanText(row.source_type)?.toLowerCase();

      const sourceId =
        cleanText(row.source_id)?.toLowerCase();

      const zone =
        zoneByKey.get(
          row.zone_key as EditorialProfileZoneKey,
        );

      if (
        sourceType !== SUPPORTED_SOURCE_TYPE
        || !sourceId
        || !UUID_PATTERN.test(sourceId)
        || !zone
        || !Number.isSafeInteger(row.sort_order)
        || row.sort_order < 1
        || row.sort_order > zone.capacity
      ) {
        return invalidSnapshot(
          profileKey,
          "invalid-zone-item",
        );
      }

      const identity =
        `${sourceType}:${sourceId}`;

      const positionIdentity =
        `${zone.key}:${row.sort_order}`;

      if (
        sourceIdentities.has(identity)
        || occupiedPositions.has(positionIdentity)
      ) {
        return invalidSnapshot(
          profileKey,
          "duplicate-zone-item",
        );
      }

      sourceIdentities.add(identity);
      occupiedPositions.add(positionIdentity);
    }

    const articleIds =
      Array.from(
        new Set(
          zoneRows.map(
            (row) =>
              row.source_id.trim().toLowerCase(),
          ),
        ),
      );

    const articles =
      articleIds.length > 0
        ? await fetchTable<ArticleRow>(
            `editorial_articles?select=id,slug,status,label,title,subtitle,image_url,published_at&id=in.(${articleIdsFilter(
              articleIds,
            )})`,
          )
        : [];

    const articleById =
      new Map(
        articles.map(
          (article) => [
            article.id.trim().toLowerCase(),
            article,
          ] as const,
        ),
      );

    const zoneItemsByKey =
      new Map<
        EditorialProfileZoneKey,
        PublicMatchdayThematicItem[]
      >(
        effectiveProfile.zones.map(
          (zone) => [zone.key, []],
        ),
      );

    for (const row of zoneRows) {
      const sourceId =
        row.source_id.trim().toLowerCase();

      const article =
        articleById.get(sourceId);

      const slug =
        cleanText(article?.slug);

      const title =
        cleanText(article?.title);

      const subtitle =
        cleanText(article?.subtitle);

      const imageUrl =
        cleanText(article?.image_url);

      if (
        !article
        || cleanText(article.status)?.toLowerCase()
          !== "published"
        || !slug
        || !title
        || !subtitle
        || !imageUrl
      ) {
        return invalidSnapshot(
          profileKey,
          "unpublishable-applied-article",
        );
      }

      zoneItemsByKey
        .get(
          row.zone_key as EditorialProfileZoneKey,
        )
        ?.push({
          id:
            `${row.zone_key}:${row.sort_order}:${sourceId}`,
          sourceId,
          sortOrder: row.sort_order,
          label:
            cleanText(article.label),
          title,
          subtitle,
          imageUrl,
          linkUrl:
            `/noticias/${slug}`,
          publishedAt:
            article.published_at,
        });
    }

    const zones:
      PublicMatchdayThematicZone[] = [];

    for (
      const zoneKey
      of pageControls.thematicZoneOrder
    ) {
      const zone =
        zoneByKey.get(zoneKey);

      if (!zone) {
        return invalidSnapshot(
          profileKey,
          "unknown-zone",
        );
      }

      const items =
        [
          ...(zoneItemsByKey.get(zoneKey) ?? []),
        ].sort(
          (left, right) =>
            left.sortOrder - right.sortOrder,
        );

      if (items.length !== zone.capacity) {
        return invalidSnapshot(
          profileKey,
          "incomplete-applied-zone",
        );
      }

      zones.push({
        key: zone.key,
        label: zone.label,
        capacity: zone.capacity,
        visualFamily:
          zone.visualFamily,
        publicTitle:
          pageControls.thematicZoneTitles[zone.key],
        items,
      });
    }

    return {
      kind: "thematic",
      profileKey,
      competitionSlug:
        profile.competitionSlug,
      revision:
        control.revision,
      pageControls,
      zones,
    };
  } catch {
    return invalidSnapshot(
      profileKey,
      "snapshot-read-failed",
    );
  }
}