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
} from "@/lib/editorial-matchday-profile-desk";
import { EDITORIAL_PROFILES } from "@/lib/editorial-profiles";

const profile = EDITORIAL_PROFILES.liga_portugal_v1;

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
    source_type: "editorial_article",
    source_id: sourceId,
    status,
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
  assert.deepEqual(result.overflow.map((item) => item.sourceId), ["overflow-new", "overflow-null"]);
  assert.equal(result.overflow.some((item) => item.sourceId === "historical"), false);
  assert.equal(result.inactiveHistoricalCount, 1);
  assert.deepEqual(
    result.diagnostics.map((diagnostic) => diagnostic.code).sort(),
    ["active_bank_without_state", "missing_article", "unknown_zone"],
  );
});

test("o overflow usa atualidade, NULLS LAST e identidade estável sem recalcular zonas", () => {
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

  assert.deepEqual(result.overflow.map((item) => item.sourceId), [ids[1], ids[0], ids[2], ids[3]]);
  assert.equal(result.zones.every((zone) => zone.items.length === 0), true);
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
  assert.deepEqual(result.zones[2].items.map((item) => item.sourceId), [articleId]);
  assert.equal(paths.some((path) => path.includes("/rpc/") || path.startsWith("rpc/")), false);
  assert.equal(paths.every((path) => path.includes("?")), true);
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

test("o ramo server-side decide antes de carregar a Mesa legacy e a UI temática é só leitura", () => {
  const readerSource = source("lib/editorial-matchday-profile-desk.ts");
  const pageSource = source("app/admin/editorial/jornada/[matchdayId]/organizar/page.tsx");
  const componentSource = source(
    "app/admin/editorial/jornada/[matchdayId]/organizar/MatchdayEditorialThematicDesk.tsx",
  );
  const thematicDecision = pageSource.indexOf("if (thematicDesk)");
  const legacyRead = pageSource.indexOf("const snapshot = await readMatchdayEditorialDesk");

  assert.ok(thematicDecision >= 0 && legacyRead > thematicDecision);
  assert.match(pageSource, /if \(thematicDesk\) \{\s*return <MatchdayEditorialThematicDesk desk=\{thematicDesk\} \/>;\s*\}/);
  assert.doesNotMatch(readerSource, /refresh_matchday_editorial_profile_distribution|writeSupabaseAdmin|\/rpc\//);
  assert.match(componentSource, /<img[\s\S]*className="thematic-desk-image"/);
  assert.doesNotMatch(componentSource, /next\/image|<Image/);
  assert.doesNotMatch(componentSource, /["']use client["']|<form|<button|<input|draggable|onDrop|onDrag|method=["']post/i);
});
