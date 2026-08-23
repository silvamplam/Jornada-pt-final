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
import { fixMatchdayEditorialItemsInZone } from "@/lib/editorial-matchday-profile-desk-operations";
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
  assert.deepEqual(
    result.overflow.map((item) => item.sourceId),
    ["without-state", "overflow-new", "unknown", "overflow-null"],
  );
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
  assert.deepEqual(result.zones[2].items.map((item) => item.sourceId), [articleId]);
  assert.equal(paths.some((path) => path.startsWith("rpc/apply_")), false);
  assert.equal(paths.some((path) => path.startsWith("rpc/matchday_editorial_profile_classification_plan?")), true);
  assert.equal(paths.every((path) => path.includes("?")), true);
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

test("uma Faixa canónica fora do banco ativo bloqueia o Apply sem ser apagada durante GET", async () => {
  const activeArticleId = "00000000-0000-4000-8000-000000000014";
  const inactiveFaixaArticleId = "00000000-0000-4000-8000-000000000015";
  const fetchTable: MatchdayEditorialProfileDeskTableFetcher = async <T>(path: string) => {
    let rows: unknown[] = [];
    if (path.startsWith("matchday_editorial_profile_assignments?")) {
      rows = [{ profile_key: "liga_portugal_v1" }];
    } else if (path.startsWith("matchdays?")) {
      rows = [{ id: "matchday-1", season_id: "season-1", number: 3, label: "3.ª Jornada" }];
    } else if (path.startsWith("matchday_editorial_profile_state_items?")) {
      rows = [{ source_type: "editorial_article", source_id: activeArticleId, zone_key: "benfica", sort_order: 1 }];
    } else if (path.startsWith("matchday_editorial_bank_items?")) {
      rows = [activeBank(activeArticleId)];
    } else if (path.startsWith("rpc/matchday_editorial_profile_classification_plan?")) {
      rows = [{ source_type: "editorial_article", source_id: activeArticleId, classified_zone_key: "benfica", actuality_order: 1 }];
    } else if (path.startsWith("matchday_horizontal_news?")) {
      rows = [{
        id: "faixa-row-1",
        label: "Faixa",
        label_color: null,
        title: "Inativo",
        subtitle: null,
        image_url: null,
        link_url: "/noticias/inactive-faixa",
        sort_order: 1,
        status: "published",
        created_at: "2026-08-22T10:00:00.000Z",
        updated_at: "2026-08-22T10:00:00.000Z",
      }];
    } else if (path.startsWith("editorial_articles?") && path.includes("slug=in.")) {
      rows = [{ ...article(inactiveFaixaArticleId, "2026-08-22T09:00:00.000Z"), slug: "inactive-faixa" }];
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
    diagnostic.code === "inactive_faixa" && diagnostic.sourceId === inactiveFaixaArticleId
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
  assert.match(pageSource, /if \(thematicDesk\) \{\s*return <MatchdayEditorialThematicDesk desk=\{thematicDesk\} \/>;\s*\}/);
  assert.doesNotMatch(readerSource, /refresh_matchday_editorial_profile_distribution|writeSupabaseAdmin/);
  assert.doesNotMatch(componentSource, /["']use client["']|next\/image|<Image/);
  assert.match(componentSource, /MatchdayEditorialThematicDeskClient/);
  assert.match(clientSource, /^"use client";/);
  assert.match(clientSource, /reconcileMatchdayEditorialProfileDeskSnapshot/);
  assert.match(clientSource, /useRouter[\s\S]*router\.refresh\(\)/);
  assert.match(clientSource, /expectedRevision: desk\.reconcileRevision[\s\S]*expectedStateToken: desk\.reconcileStateToken[\s\S]*overrides: operationalOverrides/);
  assert.match(clientSource, /next\/image[\s\S]*<Image/);
  assert.match(clientSource, /Fixar na zona|Colocar e fixar posição|Libertar posição|Devolver ao automático/);
  assert.match(clientSource, /draggable[\s\S]*onDragStart[\s\S]*onDrop/);
  assert.match(routeSource, /reconcileMatchdayEditorialProfileWorkspace/);
  assert.match(routeSource, /rpc\/apply_matchday_editorial_profile_workspace/);
  assert.match(routeSource, /p_zone_items: reconcile\.zonesAfter/);
  assert.match(routeSource, /p_faixa_source_ids: reconcile\.faixaAfter/);
  assert.doesNotMatch(routeSource, /refresh_matchday_editorial_profile_distribution|profile_state_items/);
});
