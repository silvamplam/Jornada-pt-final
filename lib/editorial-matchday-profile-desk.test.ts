import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  buildMatchdayEditorialProfileDeskDistribution,
  readMatchdayEditorialProfileDesk,
  type MatchdayEditorialProfileActiveBankRow,
  type MatchdayEditorialProfileArticleRow,
  type MatchdayEditorialProfileDeskTableFetcher,
  type MatchdayEditorialProfileStateRow,
  type MatchdayLiveDeskAggregateRow,
} from "@/lib/editorial-matchday-profile-desk";
import type {
  MatchdayLiveLayoutWorkspaceReaderRow,
} from "@/lib/editorial-matchday-live-layout-workspace";
import { fixMatchdayEditorialItemsInZone } from "@/lib/editorial-matchday-profile-desk-operations";
import { EDITORIAL_PROFILES } from "@/lib/editorial-profiles";

const profile = EDITORIAL_PROFILES.liga_portugal_v1;
const PHYSICAL_ZONE_IDS = profile.zones.map((_, index) => (
  `20000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`
));

function physicalWorkspaceReaderRow(
  zoneCount = 5,
): MatchdayLiveLayoutWorkspaceReaderRow {
  const zones = Array.from({ length: zoneCount }, (_, index) => ({
    id: index < PHYSICAL_ZONE_IDS.length
      ? PHYSICAL_ZONE_IDS[index]
      : `20000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    matchday_id: "matchday-1",
    public_title: profile.zones[index]?.label ?? `Zona fisica ${index + 1}`,
    visual_family: profile.zones[index]?.visualFamily ?? "six_news",
  }));
  return {
    state_token: "physical-token-v13",
    zones,
    blocks: zones.map((zone, index) => ({
      id: `30000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
      matchday_id: "matchday-1",
      block_type: "zone",
      zone_id: zone.id,
      sort_order: index + 1,
    })),
    placements: [],
    bank_items: [],
    state_memory: [],
    explicit_bank_item_ids: [],
    displaced_bank_item_ids: [],
    worked_bank_item_ids: [],
    legacy_zone_projection: profile.zones.map((zone, index) => ({
      matchday_id: "matchday-1",
      legacy_zone_key: zone.key,
      zone_id: PHYSICAL_ZONE_IDS[index],
    })),
  };
}

function source(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(`../${relativePath}`, import.meta.url)), "utf8");
}

function article(
  id: string,
  publishedAt: string | null,
  updatedAt = "2026-08-22T10:00:00.000Z",
): MatchdayEditorialProfileArticleRow {
  return {
    id,
    slug: `article-${id}`,
    status: "published",
    label: `Label ${id}`,
    title: `Título ${id}`,
    subtitle: `Subtítulo ${id}`,
    image_url: `https://images.example/${id}.jpg`,
    published_at: publishedAt,
    updated_at: updatedAt,
  };
}

function activeBank(sourceId: string, status = "active"): MatchdayEditorialProfileActiveBankRow {
  return {
    id: `bank-${sourceId}`,
    source_type: "editorial_article",
    source_id: sourceId,
    status,
    editorially_worked_at: "2026-08-22T09:00:00.000Z",
  };
}

function aggregateRow(
  sourceId: string,
  options: Readonly<{
    bankItemId?: string;
    bankStatus?: string;
    zoneKey?: string;
    sortOrder?: number;
    automaticEligible?: boolean;
    editorialState?: MatchdayLiveDeskAggregateRow["editorial_state"];
    placementType?: string | null;
    placementZoneKey?: string | null;
    slotPosition?: number | null;
  }> = {},
): MatchdayLiveDeskAggregateRow {
  const placementType = options.placementType ?? null;
  const placementCount = placementType ? 1 : 0;
  const zoneKey = options.zoneKey ?? "benfica";
  const baseArticle = article(sourceId, "2026-08-22T12:00:00.000Z");
  return {
    bank_item_id: options.bankItemId ?? `bank-${sourceId}`,
    source_type: "editorial_article",
    source_id: sourceId,
    label: baseArticle.label,
    title: baseArticle.title ?? sourceId,
    subtitle: baseArticle.subtitle,
    image_url: baseArticle.image_url,
    link_url: `/noticias/${baseArticle.slug}`,
    bank_status: options.bankStatus ?? "active",
    automatic_eligible: options.automaticEligible ?? true,
    classification_key: zoneKey,
    classification_source: options.automaticEligible === false
      ? "continuity_assisted"
      : "automatic",
    classified_at: "2026-08-22T12:00:00.000Z",
    article_id: sourceId,
    article_published_at: baseArticle.published_at,
    article_updated_at: baseArticle.updated_at,
    has_automatic_state: true,
    automatic_zone_key: zoneKey,
    automatic_sort_order: options.sortOrder ?? 1,
    placement_count: placementCount,
    transversal_conflict: false,
    memory_kind: null,
    history_unknown: false,
    memory_placement_conflict: false,
    is_explicit_bank: false,
    bank_placement_conflict: false,
    editorial_state: options.editorialState
      ?? (placementType === "faixa" ? "FAIXA" : placementType ? "COLOCADA" : "NOVA"),
    placement_id: placementType ? `placement-${options.bankItemId ?? sourceId}` : null,
    placement_type: placementType,
    zone_id: placementType === "zone" ? `zone-${zoneKey}` : null,
    placement_zone_key: options.placementZoneKey ?? (placementType === "zone" ? zoneKey : null),
    slot_position: placementType ? options.slotPosition ?? 1 : null,
    inactive_historical_count: 0,
  };
}

test("a transformação deriva zonas do registry e observa apenas a colocação persistida", () => {
  const stateRows: MatchdayEditorialProfileStateRow[] = [
    { source_type: "editorial_article", source_id: "article-a", zone_key: "benfica", sort_order: 2 },
    { source_type: "editorial_article", source_id: "article-b", zone_key: "benfica", sort_order: 1 },
    { source_type: "editorial_article", source_id: "article-a", zone_key: "sporting", sort_order: 1 },
    { source_type: "editorial_article", source_id: "overflow-new", zone_key: null, sort_order: null },
    { source_type: "editorial_article", source_id: "overflow-null", zone_key: null, sort_order: null },
    { source_type: "editorial_article", source_id: "historical", zone_key: null, sort_order: null },
    { source_type: "editorial_article", source_id: "missing", zone_key: "sporting", sort_order: 2 },
    { source_type: "editorial_article", source_id: "unknown", zone_key: "unexpected_zone", sort_order: 1 },
  ];
  const bankRows = [
    activeBank("article-a"),
    activeBank("article-b"),
    activeBank("overflow-new"),
    activeBank("overflow-null"),
    activeBank("historical", "archived"),
    activeBank("missing"),
    activeBank("unknown"),
    activeBank("without-state"),
  ];
  const articleRows = [
    article("article-a", "2026-08-21T12:00:00.000Z"),
    article("article-b", "2026-08-22T12:00:00.000Z"),
    article("overflow-new", "2026-08-22T15:00:00.000Z"),
    article("overflow-null", null),
    article("historical", "2026-08-20T12:00:00.000Z"),
    article("unknown", "2026-08-22T11:00:00.000Z"),
    article("without-state", "2026-08-22T16:00:00.000Z"),
  ];

  const result = buildMatchdayEditorialProfileDeskDistribution(
    profile,
    stateRows,
    bankRows,
    articleRows,
  );

  assert.deepEqual(
    result.zones.map(({ key, label, capacity, visualFamily, placementMode }) => ({
      key,
      label,
      capacity,
      visualFamily,
      placementMode,
    })),
    profile.zones.map(({ key, label, capacity, visualFamily, placementMode }) => ({
      key,
      label,
      capacity,
      visualFamily,
      placementMode,
    })),
  );
  assert.deepEqual(
    result.zones[0].items.map((item) => [item.sourceId, item.sortOrder]),
    [["article-b", 1], ["article-a", 2]],
  );
  assert.equal(result.zones[1].items.some((item) => item.sourceId === "article-a"), false);
  assert.deepEqual(
    result.overflow.map((item) => item.sourceId),
    ["unknown", "overflow-new", "overflow-null", "without-state"],
  );
  assert.equal(result.overflow.some((item) => item.sourceId === "historical"), false);
  assert.equal(result.inactiveHistoricalCount, 1);
  assert.deepEqual(
    result.diagnostics.map((diagnostic) => diagnostic.code).sort(),
    ["active_bank_without_state", "missing_article", "unknown_zone"],
  );
});

test("o overflow ignora datas editoriais e conserva uma ordem estrutural estável", () => {
  const ids = [
    "00000000-0000-4000-8000-000000000001",
    "00000000-0000-4000-8000-000000000002",
    "00000000-0000-4000-8000-000000000003",
    "00000000-0000-4000-8000-000000000004",
  ];
  const stateRows = ids.map((id) => ({
    source_type: "editorial_article",
    source_id: id,
    zone_key: null,
    sort_order: null,
  })) satisfies MatchdayEditorialProfileStateRow[];
  const result = buildMatchdayEditorialProfileDeskDistribution(
    profile,
    stateRows,
    ids.map((id) => activeBank(id)),
    [
      article(ids[0], "2026-08-22T12:00:00.000Z", "2026-08-22T10:00:00.000Z"),
      article(ids[1], "2026-08-22T12:00:00.000Z", "2026-08-22T11:00:00.000Z"),
      article(ids[2], null, "2026-08-22T13:00:00.000Z"),
      article(ids[3], null, "2026-08-22T12:00:00.000Z"),
    ],
  );

  assert.deepEqual(result.overflow.map((item) => item.sourceId), [ids[0], ids[1], ids[2], ids[3]]);
  assert.equal(result.zones.every((zone) => zone.items.length === 0), true);
});

test("circuitOrder global is converted into local zone positions", () => {
  const ids = [
    "00000000-0000-4000-8000-000000000021",
    "00000000-0000-4000-8000-000000000022",
    "00000000-0000-4000-8000-000000000023",
  ];
  const stateRows: MatchdayEditorialProfileStateRow[] = [
    { source_type: "editorial_article", source_id: ids[0], zone_key: "benfica", sort_order: 1 },
    { source_type: "editorial_article", source_id: ids[1], zone_key: "sporting", sort_order: 1 },
    { source_type: "editorial_article", source_id: ids[2], zone_key: "benfica", sort_order: 2 },
  ];
  const result = buildMatchdayEditorialProfileDeskDistribution(
    profile,
    stateRows,
    ids.map((id) => activeBank(id)),
    ids.map((id) => article(id, "2026-08-22T12:00:00.000Z")),
    [
      { source_type: "editorial_article", source_id: ids[0], classified_zone_key: "benfica", actuality_order: 10 },
      { source_type: "editorial_article", source_id: ids[1], classified_zone_key: "sporting", actuality_order: 20 },
      { source_type: "editorial_article", source_id: ids[2], classified_zone_key: "benfica", actuality_order: 30 },
    ],
  );

  assert.deepEqual(
    result.zones[0].items.map((item) => [item.sourceId, item.sortOrder]),
    [[ids[0], 1], [ids[2], 2]],
  );
  assert.deepEqual(
    result.zones[1].items.map((item) => [item.sourceId, item.sortOrder]),
    [[ids[1], 1]],
  );
  assert.deepEqual(result.overflow, []);
});

test("sem assignment o leitor retorna null e não inicia outras leituras", async () => {
  const paths: string[] = [];
  const fetchTable: MatchdayEditorialProfileDeskTableFetcher = async <T>(path: string) => {
    paths.push(path);
    return [] as T[];
  };

  assert.equal(await readMatchdayEditorialProfileDesk("matchday-1", { fetchTable }), null);
  assert.equal(paths.length, 1);
  assert.match(paths[0], /^matchday_editorial_profile_assignments\?/);
});

test("uma assignment liga_portugal_v1 produz snapshot temático exclusivamente por leituras", async () => {
  const articleId = "00000000-0000-4000-8000-000000000010";
  const paths: string[] = [];
  const fetchTable: MatchdayEditorialProfileDeskTableFetcher = async <T>(path: string) => {
    paths.push(path);
    let rows: unknown[] = [];
    if (path.startsWith("matchday_editorial_profile_assignments?")) {
      rows = [{ profile_key: "liga_portugal_v1" }];
    } else if (path.startsWith("matchdays?")) {
      rows = [{ id: "matchday-1", season_id: "season-1", number: 3, label: "3.ª Jornada" }];
    } else if (path.startsWith("rpc/read_matchday_live_desk_aggregate_tracking?")) {
      rows = [aggregateRow(articleId, { zoneKey: "fc_porto" })];
    } else if (path.startsWith("rpc/read_matchday_live_layout_workspace_v13?")) {
      rows = [physicalWorkspaceReaderRow(6)];
    } else if (path.startsWith("matchday_editorial_profile_state_items?")) {
      rows = [{ source_type: "editorial_article", source_id: articleId, zone_key: "fc_porto", sort_order: 1 }];
    } else if (path.startsWith("matchday_editorial_bank_items?")) {
      rows = [activeBank(articleId)];
    } else if (path.startsWith("seasons?")) {
      rows = [{ id: "season-1", competition_id: "competition-1", label: "2026/27" }];
    } else if (path.startsWith("competitions?")) {
      rows = [{ id: "competition-1", name: "Liga Portugal", slug: "liga-portugal" }];
    } else if (path.startsWith("editorial_articles?")) {
      rows = [article(articleId, "2026-08-22T12:00:00.000Z")];
    } else if (path.startsWith("rpc/matchday_editorial_profile_classification_plan?")) {
      rows = [{ source_type: "editorial_article", source_id: articleId, classified_zone_key: "fc_porto", actuality_order: 1 }];
    } else if (path.startsWith("matchday_editorial_profile_zone_items?")) {
      rows = [];
    } else if (path.startsWith("matchday_editorial_profile_reconcile_control?")) {
      rows = [];
    } else if (path.startsWith("matchday_horizontal_news?")) {
      rows = [];
    } else if (path.startsWith("rpc/matchday_editorial_profile_workspace_token?")) {
      rows = [{ state_token: "stable-token" }];
    }
    return rows as T[];
  };

  const result = await readMatchdayEditorialProfileDesk("matchday-1", { fetchTable });

  assert.ok(result);
  assert.equal(result.kind, "thematic");
  if (result.kind !== "thematic") return;
  assert.equal(result.profileDisplayName, profile.displayName);
  assert.equal(result.competitionName, "Liga Portugal");
  assert.deepEqual(result.zones.map((zone) => zone.key), profile.zones.map((zone) => zone.key));
  assert.deepEqual(result.zones[2].items, []);
  assert.deepEqual(
    result.tracking.items.map((item) => [
      item.sourceId,
      item.classifiedZoneKey,
      item.editorialState,
    ]),
    [[articleId, "fc_porto", "NOVA"]],
  );
  assert.equal(paths.some((path) => path.startsWith("rpc/apply_")), false);
  assert.equal(paths.some((path) => path.startsWith("rpc/read_matchday_live_desk_aggregate_tracking?")), true);
  assert.equal(paths.some((path) => path.startsWith("rpc/read_matchday_live_layout_workspace_v13?")), true);
  assert.equal(paths.some((path) => path.startsWith("matchday_live_layout_zones?")), false);
  assert.equal(paths.some((path) => path.startsWith("matchday_live_layout_blocks?")), false);
  assert.equal(paths.some((path) => path.startsWith("rpc/matchday_editorial_profile_classification_plan?")), false);
  assert.equal(paths.every((path) => path.includes("?")), true);
  assert.equal(result.physicalLayout.zones.length, 6);
  assert.equal(result.physicalWorkspace.stateToken, "physical-token-v13");
  assert.equal(result.physicalCompatibility.compatibility, "notLegacyRepresentable");
  assert.equal(result.physicalCompatibility.additionalPhysicalZoneIds.length, 1);
  assert.equal(paths.length, 12);
});

test("o leitor falha fechado se o token mudar durante a construção do snapshot", async () => {
  const articleId = "00000000-0000-4000-8000-000000000016";
  let tokenReadCount = 0;
  const fetchTable: MatchdayEditorialProfileDeskTableFetcher = async <T>(path: string) => {
    let rows: unknown[] = [];
    if (path.startsWith("matchday_editorial_profile_assignments?")) {
      rows = [{ profile_key: "liga_portugal_v1" }];
    } else if (path.startsWith("matchdays?")) {
      rows = [{ id: "matchday-1", season_id: "season-1", number: 3, label: "3.ª Jornada" }];
    } else if (path.startsWith("rpc/matchday_editorial_profile_workspace_token?")) {
      tokenReadCount += 1;
      rows = [{ state_token: tokenReadCount === 1 ? "token-before" : "token-after" }];
    } else if (path.startsWith("matchday_editorial_profile_state_items?")) {
      rows = [{ source_type: "editorial_article", source_id: articleId, zone_key: "benfica", sort_order: 1 }];
    } else if (path.startsWith("matchday_editorial_bank_items?")) {
      rows = [activeBank(articleId)];
    } else if (path.startsWith("rpc/matchday_editorial_profile_classification_plan?")) {
      rows = [{ source_type: "editorial_article", source_id: articleId, classified_zone_key: "benfica", actuality_order: 1 }];
    } else if (path.startsWith("editorial_articles?")) {
      rows = [article(articleId, "2026-08-22T12:00:00.000Z")];
    } else if (path.startsWith("seasons?")) {
      rows = [{ id: "season-1", competition_id: "competition-1", label: "2026/27" }];
    } else if (path.startsWith("competitions?")) {
      rows = [{ id: "competition-1", name: "Liga Portugal", slug: "liga-portugal" }];
    }
    return rows as T[];
  };

  await assert.rejects(
    () => readMatchdayEditorialProfileDesk("matchday-1", { fetchTable }),
    /matchday-editorial-profile-desk-concurrent-read/,
  );
  assert.equal(tokenReadCount, 2);
});

test("o leitor rejeita a Mesa se a assignment desaparecer dentro da janela do snapshot", async () => {
  let assignmentReadCount = 0;
  const fetchTable: MatchdayEditorialProfileDeskTableFetcher = async <T>(path: string) => {
    let rows: unknown[] = [];
    if (path.startsWith("matchday_editorial_profile_assignments?")) {
      assignmentReadCount += 1;
      rows = assignmentReadCount === 1 ? [{ profile_key: "liga_portugal_v1" }] : [];
    } else if (path.startsWith("matchdays?")) {
      rows = [{ id: "matchday-1", season_id: "season-1", number: 3, label: "3.ª Jornada" }];
    } else if (path.startsWith("rpc/matchday_editorial_profile_workspace_token?")) {
      rows = [{ state_token: "stable-token" }];
    }
    return rows as T[];
  };

  await assert.rejects(
    () => readMatchdayEditorialProfileDesk("matchday-1", { fetchTable }),
    /matchday-editorial-profile-desk-concurrent-read/,
  );
  assert.equal(assignmentReadCount, 2);
});

test("o leitor sobrepõe overrides persistidos sem alterar a baseline automática", async () => {
  const articleId = "00000000-0000-4000-8000-000000000011";
  const fetchTable: MatchdayEditorialProfileDeskTableFetcher = async <T>(path: string) => {
    let rows: unknown[] = [];
    if (path.startsWith("matchday_editorial_profile_assignments?")) {
      rows = [{ profile_key: "liga_portugal_v1" }];
    } else if (path.startsWith("matchdays?")) {
      rows = [{ id: "matchday-1", season_id: "season-1", number: 3, label: "3.ª Jornada" }];
    } else if (path.startsWith("rpc/read_matchday_live_desk_aggregate_tracking?")) {
      rows = [aggregateRow(articleId, { zoneKey: "fc_porto" })];
    } else if (path.startsWith("rpc/read_matchday_live_layout_workspace_v13?")) {
      rows = [physicalWorkspaceReaderRow()];
    } else if (path.startsWith("matchday_editorial_profile_state_items?")) {
      rows = [{ source_type: "editorial_article", source_id: articleId, zone_key: "fc_porto", sort_order: 1 }];
    } else if (path.startsWith("matchday_editorial_profile_manual_overrides?")) {
      rows = [{ source_type: "editorial_article", source_id: articleId, placement_target: "zone", zone_key: "benfica", sort_order: null }];
    } else if (path.startsWith("matchday_editorial_bank_items?")) {
      rows = [activeBank(articleId)];
    } else if (path.startsWith("seasons?")) {
      rows = [{ id: "season-1", competition_id: "competition-1", label: "2026/27" }];
    } else if (path.startsWith("competitions?")) {
      rows = [{ id: "competition-1", name: "Liga Portugal", slug: "liga-portugal" }];
    } else if (path.startsWith("editorial_articles?")) {
      rows = [article(articleId, "2026-08-22T12:00:00.000Z")];
    } else if (path.startsWith("rpc/matchday_editorial_profile_classification_plan?")) {
      rows = [{ source_type: "editorial_article", source_id: articleId, classified_zone_key: "fc_porto", actuality_order: 1 }];
    } else if (path.startsWith("matchday_editorial_profile_zone_items?")) {
      rows = [];
    } else if (path.startsWith("matchday_editorial_profile_reconcile_control?")) {
      rows = [];
    } else if (path.startsWith("matchday_horizontal_news?")) {
      rows = [];
    } else if (path.startsWith("rpc/matchday_editorial_profile_workspace_token?")) {
      rows = [{ state_token: "stable-token" }];
    }
    return rows as T[];
  };

  const result = await readMatchdayEditorialProfileDesk("matchday-1", { fetchTable });
  assert.ok(result && result.kind === "thematic");
  if (!result || result.kind !== "thematic") return;
  assert.deepEqual(result.automaticDistribution.zones[2].items.map((item) => item.sourceId), [articleId]);
  assert.deepEqual(result.zones[0].items.map((item) => [item.sourceId, item.manualOverride]), [[articleId, "zone"]]);
  assert.deepEqual(result.zones[2].items, []);
});

test("overrides inativos ficam históricos e não bloqueiam a Mesa operacional", async () => {
  const activeArticleId = "00000000-0000-4000-8000-000000000012";
  const secondActiveArticleId = "00000000-0000-4000-8000-000000000013";
  const inactiveArticleIds = Array.from({ length: 6 }, (_, index) => (
    `00000000-0000-4000-8000-${String(index + 20).padStart(12, "0")}`
  ));
  const fetchTable: MatchdayEditorialProfileDeskTableFetcher = async <T>(path: string) => {
    let rows: unknown[] = [];
    if (path.startsWith("matchday_editorial_profile_assignments?")) {
      rows = [{ profile_key: "liga_portugal_v1" }];
    } else if (path.startsWith("matchdays?")) {
      rows = [{ id: "matchday-1", season_id: "season-1", number: 3, label: "3.ª Jornada" }];
    } else if (path.startsWith("rpc/read_matchday_live_desk_aggregate_tracking?")) {
      rows = [
        aggregateRow(activeArticleId, { zoneKey: "benfica", sortOrder: 1 }),
        aggregateRow(secondActiveArticleId, { zoneKey: "benfica", sortOrder: 2 }),
      ];
    } else if (path.startsWith("rpc/read_matchday_live_layout_workspace_v13?")) {
      rows = [physicalWorkspaceReaderRow()];
    } else if (path.startsWith("matchday_editorial_profile_state_items?")) {
      rows = [
        { source_type: "editorial_article", source_id: activeArticleId, zone_key: "benfica", sort_order: 1 },
        { source_type: "editorial_article", source_id: secondActiveArticleId, zone_key: "benfica", sort_order: 2 },
      ];
    } else if (path.startsWith("matchday_editorial_profile_manual_overrides?")) {
      rows = [
        ...inactiveArticleIds.map((sourceId) => ({
          source_type: "editorial_article",
          source_id: sourceId,
          placement_target: "zone",
          zone_key: "sporting",
          sort_order: null,
        })),
        { source_type: "editorial_article", source_id: secondActiveArticleId, placement_target: "zone", zone_key: "benfica", sort_order: null },
        { source_type: "editorial_article", source_id: activeArticleId, placement_target: "zone", zone_key: "benfica", sort_order: null },
      ];
    } else if (path.startsWith("matchday_editorial_bank_items?")) {
      rows = [activeBank(activeArticleId), activeBank(secondActiveArticleId)];
    } else if (path.startsWith("seasons?")) {
      rows = [{ id: "season-1", competition_id: "competition-1", label: "2026/27" }];
    } else if (path.startsWith("competitions?")) {
      rows = [{ id: "competition-1", name: "Liga Portugal", slug: "liga-portugal" }];
    } else if (path.startsWith("editorial_articles?")) {
      rows = [
        article(activeArticleId, "2026-08-22T12:00:00.000Z"),
        article(secondActiveArticleId, "2026-08-22T11:00:00.000Z"),
      ];
    } else if (path.startsWith("rpc/matchday_editorial_profile_classification_plan?")) {
      rows = [
        { source_type: "editorial_article", source_id: activeArticleId, classified_zone_key: "benfica", actuality_order: 1 },
        { source_type: "editorial_article", source_id: secondActiveArticleId, classified_zone_key: "benfica", actuality_order: 2 },
      ];
    } else if (path.startsWith("matchday_editorial_profile_zone_items?")) {
      rows = [];
    } else if (path.startsWith("matchday_editorial_profile_reconcile_control?")) {
      rows = [];
    } else if (path.startsWith("matchday_horizontal_news?")) {
      rows = [];
    } else if (path.startsWith("rpc/matchday_editorial_profile_workspace_token?")) {
      rows = [{ state_token: "stable-token" }];
    }
    return rows as T[];
  };

  const result = await readMatchdayEditorialProfileDesk("matchday-1", { fetchTable });
  assert.ok(result && result.kind === "thematic");
  if (!result || result.kind !== "thematic") return;

  assert.deepEqual(
    result.manualOverrides.map((override) => override.sourceId),
    [activeArticleId, secondActiveArticleId],
  );
  assert.equal(result.zones.flatMap((zone) => zone.items).some((item) => inactiveArticleIds.includes(item.sourceId)), false);
  assert.equal(result.bank.some((item) => inactiveArticleIds.includes(item.sourceId)), false);
  assert.doesNotThrow(() => fixMatchdayEditorialItemsInZone(
    profile,
    result.automaticDistribution.activeItems,
    result.manualOverrides,
    [`editorial_article\u0000${activeArticleId}`],
    "sporting",
  ));
});

test("o reader usa placements autoritativos e não reinsere o Vídeo na Faixa", async () => {
  const faixaArticleId = "00000000-0000-4000-8000-000000000031";
  const videoArticleId = "00000000-0000-4000-8000-000000000032";
  const faixaBankItemId = "00000000-0000-4000-8000-000000000041";
  const videoBankItemId = "00000000-0000-4000-8000-000000000042";
  const paths: string[] = [];
  const fetchTable: MatchdayEditorialProfileDeskTableFetcher = async <T>(path: string) => {
    paths.push(path);
    let rows: unknown[] = [];
    if (path.startsWith("matchday_editorial_profile_assignments?")) {
      rows = [{ profile_key: "liga_portugal_v1" }];
    } else if (path.startsWith("matchdays?")) {
      rows = [{ id: "matchday-1", season_id: "season-1", number: 5, label: "5.ª Jornada" }];
    } else if (path.startsWith("rpc/read_matchday_live_desk_aggregate_tracking?")) {
      rows = [
        aggregateRow(faixaArticleId, {
          bankItemId: faixaBankItemId,
          zoneKey: "benfica",
          sortOrder: 1,
          placementType: "faixa",
          slotPosition: 1,
        }),
        aggregateRow(videoArticleId, {
          bankItemId: videoBankItemId,
          zoneKey: "sporting",
          sortOrder: 2,
          automaticEligible: false,
          placementType: "video_highlight",
          slotPosition: 1,
        }),
      ];
    } else if (path.startsWith("rpc/read_matchday_live_layout_workspace_v13?")) {
      rows = [physicalWorkspaceReaderRow()];
    } else if (path.startsWith("matchday_editorial_profile_state_items?")) {
      rows = [faixaArticleId, videoArticleId].map((sourceId, index) => ({
        source_type: "editorial_article",
        source_id: sourceId,
        zone_key: index === 0 ? "benfica" : "sporting",
        sort_order: index + 1,
      }));
    } else if (path.startsWith("matchday_editorial_bank_items?")) {
      rows = [
        { ...activeBank(faixaArticleId), id: faixaBankItemId },
        {
          ...activeBank(videoArticleId),
          id: videoBankItemId,
          automatic_eligible: false,
        },
      ];
    } else if (path.startsWith("rpc/matchday_editorial_profile_classification_plan?")) {
      rows = [{
        source_type: "editorial_article",
        source_id: faixaArticleId,
        classified_zone_key: "benfica",
        actuality_order: 1,
      }];
    } else if (path.startsWith("rpc/matchday_editorial_profile_continuity_classification_plan?")) {
      rows = [{
        source_type: "editorial_article",
        source_id: videoArticleId,
        classified_zone_key: "sporting",
      }];
    } else if (path.startsWith("matchday_editorial_profile_zone_items?")) {
      rows = [];
    } else if (path.startsWith("matchday_editorial_profile_reconcile_control?")) {
      rows = [{ revision: 0 }];
    } else if (path.startsWith("matchday_live_layout_placements?")) {
      rows = [
        {
          bank_item_id: faixaBankItemId,
          placement_type: "faixa",
          zone_id: null,
          slot_position: 1,
        },
        {
          bank_item_id: videoBankItemId,
          placement_type: "video_highlight",
          zone_id: null,
          slot_position: 1,
        },
      ];
    } else if (path.startsWith("editorial_articles?")) {
      rows = [
        article(faixaArticleId, "2026-09-02T09:00:00.000Z"),
        article(videoArticleId, "2026-09-01T09:00:00.000Z"),
      ];
    } else if (path.startsWith("seasons?")) {
      rows = [{ id: "season-1", competition_id: "competition-1", label: "2026/27" }];
    } else if (path.startsWith("competitions?")) {
      rows = [{ id: "competition-1", name: "Liga Portugal", slug: "liga-portugal" }];
    } else if (path.startsWith("rpc/matchday_editorial_profile_workspace_token?")) {
      rows = [{ state_token: "stable-token" }];
    }
    return rows as T[];
  };

  const result = await readMatchdayEditorialProfileDesk("matchday-1", { fetchTable });
  assert.ok(result && result.kind === "thematic");
  if (!result || result.kind !== "thematic") return;

  assert.deepEqual(result.currentFaixa.map((item) => item.sourceId), [faixaArticleId]);
  assert.deepEqual(result.reconcile.faixaAfter.map((item) => item.sourceId), [faixaArticleId]);
  assert.equal(result.videoModule.highlight.placement?.bankItemId, videoBankItemId);
  assert.equal(result.videoModule.highlight.placement?.sourceId, videoArticleId);
  assert.equal(
    result.reconcile.zonesAfter.flatMap((zone) => zone.items)
      .some((item) => item.sourceId === videoArticleId),
    false,
  );
  assert.equal(result.reconcile.bankAfter.some((item) => item.sourceId === videoArticleId), false);
  assert.equal(paths.some((path) => path.startsWith("matchday_horizontal_news?")), false);
});

test("um placement Faixa fora do banco ativo bloqueia o Apply sem ser apagado durante GET", async () => {
  const activeArticleId = "00000000-0000-4000-8000-000000000014";
  const inactiveArticleId = "00000000-0000-4000-8000-000000000015";
  const fetchTable: MatchdayEditorialProfileDeskTableFetcher = async <T>(path: string) => {
    let rows: unknown[] = [];
    if (path.startsWith("matchday_editorial_profile_assignments?")) {
      rows = [{ profile_key: "liga_portugal_v1" }];
    } else if (path.startsWith("matchdays?")) {
      rows = [{ id: "matchday-1", season_id: "season-1", number: 3, label: "3.ª Jornada" }];
    } else if (path.startsWith("rpc/read_matchday_live_desk_aggregate_tracking?")) {
      rows = [
        aggregateRow(activeArticleId, { zoneKey: "benfica" }),
        aggregateRow(inactiveArticleId, {
          bankItemId: "inactive-bank-item",
          bankStatus: "archived",
          zoneKey: "sporting",
          placementType: "faixa",
          slotPosition: 1,
        }),
      ];
    } else if (path.startsWith("rpc/read_matchday_live_layout_workspace_v13?")) {
      rows = [physicalWorkspaceReaderRow()];
    } else if (path.startsWith("matchday_editorial_profile_state_items?")) {
      rows = [{ source_type: "editorial_article", source_id: activeArticleId, zone_key: "benfica", sort_order: 1 }];
    } else if (path.startsWith("matchday_editorial_bank_items?")) {
      rows = [activeBank(activeArticleId)];
    } else if (path.startsWith("rpc/matchday_editorial_profile_classification_plan?")) {
      rows = [{ source_type: "editorial_article", source_id: activeArticleId, classified_zone_key: "benfica", actuality_order: 1 }];
    } else if (path.startsWith("matchday_live_layout_placements?")) {
      rows = [{
        bank_item_id: "inactive-bank-item",
        placement_type: "faixa",
        zone_id: null,
        slot_position: 1,
      }];
    } else if (path.startsWith("editorial_articles?")) {
      rows = [article(activeArticleId, "2026-08-22T12:00:00.000Z")];
    } else if (path.startsWith("seasons?")) {
      rows = [{ id: "season-1", competition_id: "competition-1", label: "2026/27" }];
    } else if (path.startsWith("competitions?")) {
      rows = [{ id: "competition-1", name: "Liga Portugal", slug: "liga-portugal" }];
    } else if (path.startsWith("matchday_editorial_profile_reconcile_control?")) {
      rows = [];
    } else if (path.startsWith("matchday_editorial_profile_zone_items?")) {
      rows = [];
    } else if (path.startsWith("rpc/matchday_editorial_profile_workspace_token?")) {
      rows = [{ state_token: "stable-token" }];
    }
    return rows as T[];
  };

  const result = await readMatchdayEditorialProfileDesk("matchday-1", { fetchTable });
  assert.ok(result && result.kind === "thematic");
  if (!result || result.kind !== "thematic") return;
  assert.deepEqual(result.currentFaixa, []);
  assert.equal(result.diagnostics.some((diagnostic) => (
    diagnostic.code === "inactive_faixa" && diagnostic.sourceId === inactiveArticleId
  )), true);
});

test("uma assignment desconhecida devolve unsupported_profile e nunca cai no legacy", async () => {
  const paths: string[] = [];
  const fetchTable: MatchdayEditorialProfileDeskTableFetcher = async <T>(path: string) => {
    paths.push(path);
    let rows: unknown[] = [];
    if (path.startsWith("matchday_editorial_profile_assignments?")) {
      rows = [{ profile_key: "future_profile" }];
    } else if (path.startsWith("matchdays?")) {
      rows = [{ id: "matchday-1", season_id: "season-1", number: 3, label: "3.ª Jornada" }];
    } else if (path.startsWith("seasons?")) {
      rows = [{ id: "season-1", competition_id: "competition-1", label: "2026/27" }];
    } else if (path.startsWith("competitions?")) {
      rows = [{ id: "competition-1", name: "Liga Portugal", slug: "liga-portugal" }];
    }
    return rows as T[];
  };

  const result = await readMatchdayEditorialProfileDesk("matchday-1", { fetchTable });

  assert.ok(result);
  assert.equal(result.kind, "unsupported_profile");
  assert.equal(result.profileKey, "future_profile");
  assert.deepEqual(result.diagnostics.map((diagnostic) => diagnostic.code), ["unsupported_profile"]);
  assert.equal(paths.some((path) => path.startsWith("matchday_editorial_profile_state_items?")), false);
  assert.equal(paths.some((path) => path.startsWith("matchday_editorial_bank_items?")), false);
});

test("o ramo server-side preserva o legacy e delega a operação ao cliente temático isolado", () => {
  const readerSource = source("lib/editorial-matchday-profile-desk.ts");
  const pageSource = source("app/admin/editorial/jornada/[matchdayId]/organizar/page.tsx");
  const componentSource = source(
    "app/admin/editorial/jornada/[matchdayId]/organizar/MatchdayEditorialThematicDesk.tsx",
  );
  const clientSource = source(
    "app/admin/editorial/jornada/[matchdayId]/organizar/MatchdayEditorialThematicDeskClient.tsx",
  );
  const routeSource = source(
    "app/api/admin/editorial/jornada/[matchdayId]/organizar/tematico/route.ts",
  );
  const thematicDecision = pageSource.indexOf("if (thematicDesk)");
  const legacyRead = pageSource.indexOf("const snapshot = await readMatchdayEditorialDesk");

  assert.ok(thematicDecision >= 0 && legacyRead > thematicDecision);
  assert.match(pageSource, /if \(thematicDesk\) \{\s*return \(\s*<MatchdayEditorialThematicDesk\s+contextSelector=\{contextSelector\}\s+desk=\{thematicDesk\}\s*\/>\s*\);\s*\}/);
  assert.doesNotMatch(readerSource, /refresh_matchday_editorial_profile_distribution|writeSupabaseAdmin/);
  assert.doesNotMatch(componentSource, /["']use client["']|next\/image|<Image/);
  assert.match(componentSource, /MatchdayEditorialThematicDeskClient/);
  assert.match(clientSource, /^"use client";/);
  assert.match(clientSource, /useState<PhysicalDeskState>/);
  assert.match(clientSource, /createPhysicalDeskState\(desk\.physicalWorkspace/);
  assert.doesNotMatch(clientSource, /WorkspaceEditorState|reconcile\.zonesAfter/);
  assert.match(clientSource, /useRouter[\s\S]*router\.refresh\(\)/);
  assert.match(clientSource, /buildPhysicalDeskLegacyApplyProjection\([\s\S]*physicalDesk,[\s\S]*desk\.physicalCompatibility/);
  assert.match(clientSource, /body: JSON\.stringify\(projection\)/);
  assert.match(clientSource, /next\/image[\s\S]*<Image/);
  assert.doesNotMatch(clientSource, /manual · posição|manual · zona|manual · Faixa|manual · Banco|manual · Abertura|Fixar nesta posição|Proteger na zona|Libertar posição/);
  assert.doesNotMatch(clientSource, /Devolver ao automático/);
  assert.match(clientSource, /draggable[\s\S]*onDragStart[\s\S]*onDrop/);
  assert.match(routeSource, /reconcileMatchdayEditorialProfileWorkspace/);
  assert.match(routeSource, /rpc\/apply_matchday_editorial_profile_workspace/);
  assert.match(routeSource, /p_zone_items: compatibilityReconcile\.zonesAfter/);
  assert.match(routeSource, /p_authoritative_zone_items: reconcile\.zonesAfter/);
  assert.match(routeSource, /p_authoritative_faixa_items: reconcile\.faixaAfter/);
  assert.doesNotMatch(routeSource, /refresh_matchday_editorial_profile_distribution|profile_state_items/);
});
