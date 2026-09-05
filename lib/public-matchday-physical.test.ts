import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { buildLiveLayoutWorkspaceState } from "@/lib/editorial-matchday-live-layout-workspace";
import { readPublicMatchdayEditorialSnapshot } from "@/lib/public-matchday-editorial";
import {
  buildPublicMatchdayPhysicalSnapshot,
  type PublicMatchdayPhysicalArticleRow,
  type PublicMatchdayPhysicalTableFetcher,
} from "@/lib/public-matchday-physical";

const MATCHDAY_ID = "00000000-0000-4000-8000-000000000001";
const PROFILE_KEY = "liga_portugal_v1";
const NOW = "2026-09-05T10:00:00.000Z";

type ZoneSpec = Readonly<{
  id: string;
  title: string;
  layout: string;
}>;

type PlacementSpec = Readonly<{
  type: "opening" | "faixa" | "selection" | "video_highlight" | "zone";
  position: number;
  zoneId?: string;
}>;

function id(group: number, index: number): string {
  return `${String(group).padStart(8, "0")}-0000-4000-8000-${String(index).padStart(12, "0")}`;
}

function zone(index: number, layout = "six_news", title = `Zona ${index}`): ZoneSpec {
  return { id: id(10, index), title, layout };
}

function fixture({
  zones = [zone(1)],
  placements = [],
  videoActive = false,
  faixaSlotCount = 4,
  marker = true,
  projectedZoneIds = zones.map((item) => item.id),
}: Readonly<{
  zones?: readonly ZoneSpec[];
  placements?: readonly PlacementSpec[];
  videoActive?: boolean;
  faixaSlotCount?: number;
  marker?: boolean;
  projectedZoneIds?: readonly string[];
}> = {}) {
  const articles: PublicMatchdayPhysicalArticleRow[] = placements.map((placement, index) => ({
    id: id(40, index + 1),
    slug: `artigo-${index + 1}`,
    status: "published",
    label: `Etiqueta ${index + 1}`,
    title: `Título ${index + 1}`,
    subtitle: `Subtítulo ${index + 1}`,
    image_url: `/images/${index + 1}.jpg`,
    author: `Autor ${index + 1}`,
    published_at: NOW,
  }));

  const bankItems = placements.map((placement, index) => ({
    id: id(30, index + 1),
    matchday_id: MATCHDAY_ID,
    source_type: "editorial_article",
    source_id: articles[index]!.id,
    status: "active",
    label: articles[index]!.label,
    title: articles[index]!.title,
    subtitle: articles[index]!.subtitle,
    image_url: articles[index]!.image_url,
    link_url: `/noticias/${articles[index]!.slug}`,
    automatic_eligible: true,
    editorially_worked_at: null,
    classification_key: null,
    classification_source: null,
    classified_at: null,
    continuity_source_matchday_id: null,
    continuity_source_composition_id: null,
    is_explicit_bank: false,
  }));

  const raw = {
    state_token: "physical-state-token",
    zones: zones.map((item) => ({
      id: item.id,
      matchday_id: MATCHDAY_ID,
      public_title: item.title,
      visual_family: item.layout,
    })),
    blocks: [
      ...zones.map((item, index) => ({
        id: id(20, index + 1),
        matchday_id: MATCHDAY_ID,
        block_type: "zone",
        zone_id: item.id,
        sort_order: index + 1,
      })),
      {
        id: id(20, zones.length + 1),
        matchday_id: MATCHDAY_ID,
        block_type: "latest",
        zone_id: null,
        sort_order: zones.length + 1,
      },
      ...(videoActive ? [{
        id: id(20, zones.length + 2),
        matchday_id: MATCHDAY_ID,
        block_type: "video",
        zone_id: null,
        sort_order: zones.length + 2,
      }] : []),
    ],
    placements: placements.map((placement, index) => ({
      id: id(50, index + 1),
      matchday_id: MATCHDAY_ID,
      bank_item_id: bankItems[index]!.id,
      placement_type: placement.type,
      zone_id: placement.type === "zone" ? placement.zoneId : null,
      slot_position: placement.position,
      created_at: NOW,
      updated_at: NOW,
    })),
    bank_items: bankItems,
    state_memory: [],
    explicit_bank_item_ids: [],
    displaced_bank_item_ids: [],
    worked_bank_item_ids: [],
    legacy_zone_projection: projectedZoneIds.map((zoneId, index) => ({
      matchday_id: MATCHDAY_ID,
      legacy_zone_key: `legacy_${index + 1}`,
      zone_id: zoneId,
    })),
    workspace_settings: marker ? {
      matchday_id: MATCHDAY_ID,
      faixa_slot_count: faixaSlotCount,
      headline_title_color: "#123456",
      latest_zone_mode: "latest_news",
      latest_zone_placement: "four_news",
      latest_zone_title: "Últimas",
      latest_zone_title_color: "#654321",
      video_module_active: videoActive,
      created_at: NOW,
      updated_at: NOW,
    } : null,
    physical_cutover: marker ? {
      matchday_id: MATCHDAY_ID,
      profile_key: PROFILE_KEY,
      cutover_at: NOW,
    } : null,
  };

  return { raw, articles };
}

function buildFixture(input: Parameters<typeof fixture>[0] = {}) {
  const current = fixture(input);
  const workspace = buildLiveLayoutWorkspaceState(MATCHDAY_ID, current.raw);
  return buildPublicMatchdayPhysicalSnapshot(workspace, current.articles);
}

function fetcherFor(
  current: ReturnType<typeof fixture>,
  paths: string[] = [],
): PublicMatchdayPhysicalTableFetcher {
  return async <T>(path: string) => {
    paths.push(path);
    if (path.startsWith("rpc/read_matchday_live_layout_workspace_v13?")) {
      return [structuredClone(current.raw)] as T[];
    }
    if (path.startsWith("matchday_editorial_profile_assignments?")) {
      return [{ profile_key: PROFILE_KEY }] as T[];
    }
    if (path.startsWith("editorial_articles?")) {
      return structuredClone(current.articles) as T[];
    }
    throw new Error(`unexpected-read:${path}`);
  };
}

test("marker físico escolhe exclusivamente o reader físico", async () => {
  const current = fixture();
  const paths: string[] = [];
  const result = await readPublicMatchdayEditorialSnapshot(MATCHDAY_ID, {
    fetchTable: fetcherFor(current, paths),
  });

  assert.equal(result.kind, "physical");
  assert.equal(paths.some((path) => path.includes("profile_zone_items")), false);
  assert.equal(paths.some((path) => path.includes("reconcile_control")), false);
});

test("snapshot físico inválido não tenta o reader legacy", async () => {
  const current = fixture({ zones: [zone(1, "layout_desconhecido")] });
  const paths: string[] = [];
  const result = await readPublicMatchdayEditorialSnapshot(MATCHDAY_ID, {
    fetchTable: fetcherFor(current, paths),
  });

  assert.equal(result.kind, "invalid_physical_snapshot");
  assert.equal(paths.length, 1);
});

test("zona não projetada sem marcador é evidência física e fecha sem legacy", async () => {
  const zones = Array.from({ length: 6 }, (_, index) => zone(index + 1));
  const current = fixture({
    zones,
    marker: false,
    projectedZoneIds: zones.slice(0, 5).map((item) => item.id),
  });
  const paths: string[] = [];
  const result = await readPublicMatchdayEditorialSnapshot(MATCHDAY_ID, {
    fetchTable: fetcherFor(current, paths),
  });

  assert.deepEqual(result, {
    kind: "invalid_physical_snapshot",
    reason: "physical-evidence-without-authority",
  });
  assert.equal(paths.length, 1);
});

test("Jornada genuinamente legacy preserva o percurso legacy", async () => {
  const current = fixture({ zones: [], marker: false, projectedZoneIds: [] });
  const paths: string[] = [];
  const result = await readPublicMatchdayEditorialSnapshot(MATCHDAY_ID, {
    fetchTable: async <T>(path: string) => {
      paths.push(path);
      if (path.startsWith("rpc/read_matchday_live_layout_workspace_v13?")) {
        return [structuredClone(current.raw)] as T[];
      }
      if (path.startsWith("matchday_editorial_profile_assignments?")) {
        return [] as T[];
      }
      throw new Error(`unexpected-read:${path}`);
    },
  });

  assert.deepEqual(result, { kind: "legacy" });
  assert.equal(paths.length, 2);
});

test("sexta zona arbitrária usa UUID, título e sort_order físicos", () => {
  const zones = Array.from({ length: 6 }, (_, index) =>
    zone(index + 1, index === 5 ? "five_news_secondary" : "six_news", index === 5 ? "Observatório" : `Zona ${index + 1}`),
  );
  const snapshot = buildFixture({ zones });

  assert.equal(snapshot.zones.length, 6);
  assert.deepEqual(snapshot.zones[5], {
    zoneId: zones[5]!.id,
    publicTitle: "Observatório",
    layoutId: "five_news_secondary",
    slots: snapshot.zones[5]!.slots,
  });
  assert.deepEqual(
    snapshot.blocks.slice(0, 6).map((block) => block.kind === "zone" ? block.zoneId : block.kind),
    zones.map((item) => item.id),
  );
});

test("sort_order dos blocks é a única autoridade da ordem pública", () => {
  const zones = [zone(1), zone(2), zone(3)];
  const current = fixture({ zones });
  current.raw.blocks[0]!.sort_order = 3;
  current.raw.blocks[1]!.sort_order = 1;
  current.raw.blocks[2]!.sort_order = 2;
  const workspace = buildLiveLayoutWorkspaceState(MATCHDAY_ID, current.raw);
  const snapshot = buildPublicMatchdayPhysicalSnapshot(workspace, current.articles);

  assert.deepEqual(
    snapshot.blocks.flatMap((block) => block.kind === "zone" ? [block.zoneId] : []),
    [zones[1]!.id, zones[2]!.id, zones[0]!.id],
  );
});

test("zonas vazias, parciais e gaps são válidos e não compactam slots", () => {
  const zones = [zone(1), zone(2)];
  const snapshot = buildFixture({
    zones,
    placements: [
      { type: "zone", zoneId: zones[1]!.id, position: 1 },
      { type: "zone", zoneId: zones[1]!.id, position: 3 },
    ],
  });

  assert.equal(snapshot.zones[0]!.slots.every((slot) => slot.item === null), true);
  assert.equal(snapshot.zones[1]!.slots[0]!.item?.title, "Título 1");
  assert.equal(snapshot.zones[1]!.slots[1]!.item, null);
  assert.equal(snapshot.zones[1]!.slots[2]!.item?.title, "Título 2");
});

test("placement fora do schema e layout desconhecido falham explicitamente", async () => {
  const outside = fixture({
    zones: [zone(1, "five_news_balanced")],
    placements: [{ type: "zone", zoneId: zone(1).id, position: 6 }],
  });
  const outsideResult = await readPublicMatchdayEditorialSnapshot(MATCHDAY_ID, {
    fetchTable: fetcherFor(outside),
  });
  assert.equal(outsideResult.kind, "invalid_physical_snapshot");
  if (outsideResult.kind === "invalid_physical_snapshot") {
    assert.match(outsideResult.reason, /slot-out-of-capacity/);
  }

  const unknown = fixture({ zones: [zone(1, "layout_desconhecido")] });
  const unknownResult = await readPublicMatchdayEditorialSnapshot(MATCHDAY_ID, {
    fetchTable: fetcherFor(unknown),
  });
  assert.equal(unknownResult.kind, "invalid_physical_snapshot");
  if (unknownResult.kind === "invalid_physical_snapshot") {
    assert.match(unknownResult.reason, /visual-family-invalid/);
  }
});

test("cinco zonas atuais preservam layouts, títulos, posições e ocupação completa", () => {
  const zones = [
    zone(1, "five_news_balanced", "Benfica"),
    zone(2, "six_news", "Sporting"),
    zone(3, "five_news_balanced", "FC Porto"),
    zone(4, "six_news", "Outros clubes"),
    zone(5, "five_news_secondary", "Fora da Liga / outros"),
  ];
  const capacities = [5, 6, 5, 6, 5];
  const placements = zones.flatMap((item, zoneIndex) =>
    Array.from({ length: capacities[zoneIndex]! }, (_, slotIndex) => ({
      type: "zone" as const,
      zoneId: item.id,
      position: slotIndex + 1,
    })),
  );
  const snapshot = buildFixture({ zones, placements });

  assert.deepEqual(
    snapshot.zones.map((item) => [
      item.publicTitle,
      item.layoutId,
      item.slots.length,
      item.slots.filter((slot) => slot.item).length,
    ]),
    [
      ["Benfica", "five_news_balanced", 5, 5],
      ["Sporting", "six_news", 6, 6],
      ["FC Porto", "five_news_balanced", 5, 5],
      ["Outros clubes", "six_news", 6, 6],
      ["Fora da Liga / outros", "five_news_secondary", 5, 5],
    ],
  );
});

test("Abertura, Faixa, Últimas e Vídeo conservam placements e settings físicos", () => {
  const snapshot = buildFixture({
    videoActive: true,
    faixaSlotCount: 3,
    placements: [
      { type: "opening", position: 1 },
      { type: "opening", position: 3 },
      { type: "opening", position: 5 },
      { type: "faixa", position: 2 },
      { type: "selection", position: 1 },
      { type: "selection", position: 3 },
      { type: "video_highlight", position: 1 },
    ],
  });

  assert.deepEqual(snapshot.opening.slots.map((slot) => [slot.role, Boolean(slot.item)]), [
    ["headline", true],
    ["highlight", false],
    ["highlight", true],
    ["highlight", false],
    ["context", true],
  ]);
  assert.deepEqual(snapshot.faixa.slots.map((slot) => Boolean(slot.item)), [false, true, false]);
  assert.deepEqual(snapshot.latest.slots.map((slot) => Boolean(slot.item)), [true, false, true, false]);
  assert.equal(snapshot.latest.placement, "four_news");
  assert.equal(snapshot.video.active, true);
  assert.equal(snapshot.video.highlight?.title, "Título 7");
  assert.deepEqual(snapshot.blocks.map((block) => block.kind), ["zone", "latest", "video"]);
});

test("singletons físicos incoerentes falham explicitamente", async () => {
  const missingLatest = fixture();
  missingLatest.raw.blocks = missingLatest.raw.blocks.filter(
    (block) => block.block_type !== "latest",
  );
  const missingLatestResult = await readPublicMatchdayEditorialSnapshot(MATCHDAY_ID, {
    fetchTable: fetcherFor(missingLatest),
  });
  assert.equal(missingLatestResult.kind, "invalid_physical_snapshot");
  if (missingLatestResult.kind === "invalid_physical_snapshot") {
    assert.equal(missingLatestResult.reason, "latest-block-invalid");
  }

  const incompleteVideo = fixture({ videoActive: true });
  const incompleteVideoResult = await readPublicMatchdayEditorialSnapshot(MATCHDAY_ID, {
    fetchTable: fetcherFor(incompleteVideo),
  });
  assert.deepEqual(incompleteVideoResult, {
    kind: "invalid_physical_snapshot",
    reason: "video-module-incomplete",
  });
});

test("DTO e reader físicos não contêm classificação nem fontes temáticas", () => {
  const source = readFileSync("lib/public-matchday-physical.ts", "utf8");
  const snapshot = buildFixture();

  assert.doesNotMatch(source, /EditorialProfileZoneKey/);
  assert.doesNotMatch(source, /matchday_editorial_profile_zone_items/);
  assert.doesNotMatch(source, /reconcile_control/);
  assert.doesNotMatch(source, /writeSupabase|\bPOST\b|\bPATCH\b|\bDELETE\b/);
  assert.doesNotMatch(JSON.stringify(snapshot), /classification|automaticEligible|bankItems|memory/);
});
