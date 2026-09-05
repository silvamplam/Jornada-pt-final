import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  createLatestFourNewsProjectionSync,
  type LatestFourNewsCanonicalArticle,
  type LatestFourNewsConflictRow,
  type LatestFourNewsProjectionRow,
  type LatestFourNewsSourceRow,
} from "@/lib/editorial-matchday-latest-four-projection";

const MATCHDAY_ID = "00000000-0000-4000-8000-000000000001";
const NOW = "2026-08-20T12:00:00.000Z";

function latestNews(title: string, sortOrder: number): LatestFourNewsSourceRow {
  return {
    id: `latest-${title}`,
    article_id: null,
    time_label: `Hora ${title}`,
    title,
    subtitle: `Subtítulo ${title}`,
    image_url: `/images/${title.toLowerCase()}.jpg`,
    link_url: `/noticias/${title.toLowerCase()}`,
    sort_order: sortOrder,
    status: "published",
  };
}

function fixture(
  initialLatestNews: LatestFourNewsSourceRow[],
  initialConflicts: LatestFourNewsConflictRow[] = [],
  canonicalArticles: LatestFourNewsCanonicalArticle[] = [],
) {
  let sourceRows = initialLatestNews;
  let conflictRows = initialConflicts;
  let projectedRows: readonly LatestFourNewsProjectionRow[] = [];
  const sync = createLatestFourNewsProjectionSync({
    async readLatestNews(matchdayId) {
      assert.equal(matchdayId, MATCHDAY_ID);
      return sourceRows;
    },
    async readConflictingNews(matchdayId) {
      assert.equal(matchdayId, MATCHDAY_ID);
      return conflictRows;
    },
    async readCanonicalArticles(slugs) {
      return canonicalArticles.filter((article) => article.slug && slugs.includes(article.slug));
    },
    async writeProjection(rows) {
      projectedRows = structuredClone(rows);
    },
    now() {
      return NOW;
    },
  });

  return {
    sync,
    latestNews() {
      return sourceRows;
    },
    replaceLatestNews(rows: LatestFourNewsSourceRow[]) {
      sourceRows = rows;
    },
    replaceConflicts(rows: LatestFourNewsConflictRow[]) {
      conflictRows = rows;
    },
    projection() {
      return projectedRows;
    },
  };
}

function projectedTitles(rows: readonly LatestFourNewsProjectionRow[]) {
  return rows.map((row) => row.title);
}

test("projeta [A,B,C,D] e uma nova primeira passa a produzir [X,A,B,C] sem mover Últimas", async () => {
  const initialRows = ["A", "B", "C", "D", "E"].map(latestNews);
  const state = fixture(initialRows);
  const sourceBeforeFirstSync = structuredClone(initialRows);

  await state.sync(MATCHDAY_ID);

  assert.deepEqual(projectedTitles(state.projection()), ["A", "B", "C", "D"]);
  assert.deepEqual(state.latestNews(), sourceBeforeFirstSync);

  const rowsWithNewFirst = ["X", "A", "B", "C", "D", "E"].map(latestNews);
  const sourceBeforeSecondSync = structuredClone(rowsWithNewFirst);
  state.replaceLatestNews(rowsWithNewFirst);

  await state.sync(MATCHDAY_ID);

  assert.deepEqual(projectedTitles(state.projection()), ["X", "A", "B", "C"]);
  assert.deepEqual(state.latestNews(), sourceBeforeSecondSync);
  assert.equal(state.latestNews().some((row) => row.title === "D"), true);
});

test("B noutra zona viva fica inelegível e produz [A,C,D,E] por identidade canónica", async () => {
  const latestRows = ["A", "B", "C", "D", "E"].map(latestNews);
  const state = fixture(
    latestRows,
    [{ zone: "headline", article_id: "canonical-b", link_url: null }],
    [{ id: "canonical-b", slug: "b" }],
  );

  await state.sync(MATCHDAY_ID);

  assert.deepEqual(projectedTitles(state.projection()), ["A", "C", "D", "E"]);
  assert.deepEqual(state.latestNews(), latestRows);
});

test("B e D noutras zonas produzem [A,C,E,F] sem saírem de Últimas", async () => {
  const latestRows = ["A", "B", "C", "D", "E", "F"].map(latestNews);
  const sourceBeforeSync = structuredClone(latestRows);
  const state = fixture(
    latestRows,
    [
      { zone: "headline", article_id: "canonical-b", link_url: null },
      { zone: "important_item", article_id: null, link_url: "/noticias/d?origem=faixa" },
    ],
    [{ id: "canonical-b", slug: "b" }],
  );

  await state.sync(MATCHDAY_ID);

  assert.deepEqual(projectedTitles(state.projection()), ["A", "C", "E", "F"]);
  assert.deepEqual(state.latestNews(), sourceBeforeSync);
  assert.equal(state.latestNews().some((row) => row.title === "B"), true);
  assert.equal(state.latestNews().some((row) => row.title === "D"), true);
});

test("uma notícia volta ao grupo quando deixa a outra zona viva", async () => {
  const state = fixture(
    ["A", "B", "C", "D", "E"].map(latestNews),
    [{ zone: "highlight", article_id: null, link_url: "/noticias/b" }],
  );

  await state.sync(MATCHDAY_ID);
  assert.deepEqual(projectedTitles(state.projection()), ["A", "C", "D", "E"]);

  state.replaceConflicts([]);
  await state.sync(MATCHDAY_ID);

  assert.deepEqual(projectedTitles(state.projection()), ["A", "B", "C", "D"]);
});

test("grupo automático nunca contém uma identidade em conflito e continua a duplicar apenas Últimas", async () => {
  const latestRows = ["A", "B", "C", "D", "E"].map(latestNews);
  const conflict = { zone: "live_hierarchical:secondary_1", article_id: null, link_url: "/noticias/c" };
  const state = fixture(latestRows, [conflict]);

  await state.sync(MATCHDAY_ID);

  const projectionLinks = new Set(state.projection().map((row) => row.link_url));
  assert.equal(projectionLinks.has(conflict.link_url), false);
  assert.equal(projectionLinks.has("/noticias/a"), true);
  assert.equal(state.latestNews().some((row) => row.link_url === "/noticias/a"), true);
});

test("menos de quatro Últimas válidas limpa os slots automáticos excedentes", async () => {
  const state = fixture([latestNews("A", 1), latestNews("B", 2)]);

  await state.sync(MATCHDAY_ID);

  assert.deepEqual(projectedTitles(state.projection()), ["A", "B", null, null]);
  assert.deepEqual(
    state.projection().slice(2),
    ["live_four_news:3", "live_four_news:4"].map((slotType) => ({
      matchday_id: MATCHDAY_ID,
      slot_type: slotType,
      article_id: null,
      label: null,
      title: null,
      subtitle: null,
      image_url: null,
      link_url: null,
      updated_at: NOW,
    })),
  );
});

test("ignora entradas draft ou sem título/link mantendo a ordem recebida das Últimas", async () => {
  const draft = { ...latestNews("Rascunho", 1), status: "draft" };
  const withoutLink = { ...latestNews("SemLink", 2), link_url: null };
  const state = fixture([
    draft,
    withoutLink,
    latestNews("A", 3),
    latestNews("B", 4),
    latestNews("C", 5),
    latestNews("D", 6),
  ]);

  await state.sync(MATCHDAY_ID);

  assert.deepEqual(projectedTitles(state.projection()), ["A", "B", "C", "D"]);
});

test("a sincronização fica isolada da placement, das fontes e das tabelas de Composição", () => {
  const projectionSource = readFileSync(
    fileURLToPath(new URL("./editorial-matchday-latest-four-projection.ts", import.meta.url)),
    "utf8",
  );

  assert.doesNotMatch(projectionSource, /latest_zone_placement/);
  assert.doesNotMatch(
    projectionSource,
    /matchday_reference_compositions|matchday_reference_composition_items|matchday_hierarchical_composition_slots/,
  );
  const runtime = projectionSource.slice(
    projectionSource.indexOf("export async function syncLatestFourNewsProjection"),
  );
  assert.match(runtime, /rpc\/refresh_matchday_live_layout_legacy/);
  assert.doesNotMatch(runtime, /matchday_live_layout_items|matchday_latest_news/);
  assert.doesNotMatch(
    projectionSource,
    /matchday_live_layout_items\?on_conflict=matchday_id,slot_type/,
  );
});

test("refresh de compatibility parte sempre dos placements autoritativos", () => {
  const projectionSource = readFileSync(
    fileURLToPath(new URL("./editorial-matchday-latest-four-projection.ts", import.meta.url)),
    "utf8",
  );
  const flow = readFileSync(
    fileURLToPath(new URL("./editorial-matchday-news-flow.ts", import.meta.url)),
    "utf8",
  );
  const desk = readFileSync(
    fileURLToPath(new URL("./editorial-matchday-desk.ts", import.meta.url)),
    "utf8",
  );
  const deskResolution = readFileSync(
    fileURLToPath(new URL("./editorial-matchday-desk-resolution.ts", import.meta.url)),
    "utf8",
  );
  const contentSnapshotSync = readFileSync(
    fileURLToPath(new URL("./editorial-content-snapshot-sync.ts", import.meta.url)),
    "utf8",
  );
  const articleSnapshotSync = readFileSync(
    fileURLToPath(new URL("./editorial-article-live-snapshot-sync.ts", import.meta.url)),
    "utf8",
  );
  const articleRoute = readFileSync(
    fileURLToPath(new URL("../app/api/admin/editorial/artigos/route.ts", import.meta.url)),
    "utf8",
  );
  const gestorRoute = readFileSync(
    fileURLToPath(new URL("../app/api/admin/gestor/route.ts", import.meta.url)),
    "utf8",
  );
  const boundaryMigration = readFileSync(
    fileURLToPath(new URL("../supabase/migrations/20260905110018_matchday_publication_physical_placement_boundary_v15.sql", import.meta.url)),
    "utf8",
  );

  const exportedSync = projectionSource.slice(
    projectionSource.indexOf("export async function syncLatestFourNewsProjection"),
  );
  assert.match(exportedSync, /rpc\/refresh_matchday_live_layout_legacy/);
  assert.doesNotMatch(exportedSync, /matchday_live_layout_items/);
  assert.doesNotMatch(
    flow.slice(flow.indexOf("export async function transferPublishedArticleBetweenMatchdayZones")),
    /syncLatestFourNewsProjection|matchday_live_layout_items/,
  );
  assert.match(desk, /applyMatchdayEditorialDeskState[\s\S]*syncLatestFourNewsProjection\(input\.matchdayId\)/);
  assert.match(deskResolution, /syncLatestProjectionAfterRelevantPlacement/);
  assert.match(contentSnapshotSync, /rpc\/sync_editorial_content_live_snapshots_v15/);
  assert.doesNotMatch(contentSnapshotSync, /Promise\.all|matchday_editorials\?/);
  assert.match(articleSnapshotSync, /rpc\/sync_editorial_article_live_snapshots_v15/);
  assert.match(
    boundaryMigration,
    /create function public\.sync_editorial_article_live_snapshots_v15\([\s\S]*?refresh_matchday_live_layout_legacy/,
  );
  assert.doesNotMatch(
    articleSnapshotSync,
    /matchday_reference_composition_items|matchday_hierarchical_composition_slots/,
  );
  assert.match(articleRoute, /liveMatchdayLinkRemovalTargets[\s\S]*syncLatestFourNewsProjection/);
  assert.match(gestorRoute, /applyMatchdayPlacementByLink/);
  assert.doesNotMatch(gestorRoute, /LATEST_FOUR_CONFLICT_SYNC_ACTIONS/);
});
