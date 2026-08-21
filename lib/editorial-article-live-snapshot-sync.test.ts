import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  createEditorialArticleLiveSnapshotSync,
  type EditorialArticleLiveCarryoverRow,
  type EditorialArticleLiveLayoutRow,
  type EditorialArticleLiveSnapshot,
  type EditorialArticleLiveSnapshotPatch,
  type EditorialArticleLiveSnapshotTable,
} from "@/lib/editorial-article-live-snapshot-sync";

const ARTICLE_ID = "11111111-1111-4111-8111-111111111111";
const MATCHDAY_ID = "22222222-2222-4222-8222-222222222222";
const OTHER_MATCHDAY_ID = "33333333-3333-4333-8333-333333333333";
const CARRYOVER_MATCHDAY_ID = "44444444-4444-4444-8444-444444444444";
const OLD_LINK = "/noticias/palhinha-antigo";
const NEW_LINK = OLD_LINK;
const NOW = "2026-08-21T12:00:00.000Z";

type MutableRow = Record<string, string | number | null>;

const updatedArticle: EditorialArticleLiveSnapshot = {
  id: ARTICLE_ID,
  slug: "palhinha-antigo",
  label: "MERCADO",
  title: "Palhinha muito perto do Benfica: acordo pode chegar aos 19 milhões de euros",
  subtitle: "O médio português está perto de regressar ao futebol nacional.",
  image_url: "https://example.test/palhinha-novo.jpg",
  author: "Redação Jornada",
  published_at: "2026-08-20T18:15:00.000Z",
};

function row(overrides: MutableRow): MutableRow {
  return { ...overrides };
}

function seededTables(): Record<EditorialArticleLiveSnapshotTable, MutableRow[]> {
  return {
    matchday_editorials: [row({
      id: "editorial-1",
      matchday_id: MATCHDAY_ID,
      title: "Título antigo",
      summary: "Resumo antigo",
      image_url: "old-headline.jpg",
      headline_link_url: OLD_LINK,
      title_color: "#112233",
      status: "published",
      side_block_type: "analise",
      side_block_label: "RÓTULO ANTIGO",
      side_block_label_color: "#223344",
      side_block_title: "Contexto antigo",
      side_block_title_color: "#334455",
      side_block_author: "Autor antigo",
      side_block_text: "Texto antigo",
      side_block_image_url: "old-side.jpg",
      side_block_link_url: OLD_LINK,
      side_block_status: "draft",
      complementary_label: "COMPLEMENTO ANTIGO",
      complementary_title: "Complemento antigo",
      complementary_text: "Texto complementar antigo",
      complementary_image_url: "old-complement.jpg",
      complementary_link_url: OLD_LINK,
      complementary_text_color: "#445566",
      complementary_status: "published",
      updated_at: "2026-08-20T00:00:00.000Z",
    })],
    matchday_highlights: [row({
      id: "highlight-1",
      matchday_id: MATCHDAY_ID,
      label: "RÓTULO EDITORIAL PRÓPRIO",
      label_color: "#556677",
      title: "Destaque antigo",
      subtitle: "Subtítulo antigo",
      image_url: "old-highlight.jpg",
      link_url: OLD_LINK,
      sort_order: 3,
      status: "published",
      updated_at: "2026-08-20T00:00:00.000Z",
    })],
    matchday_latest_news: [row({
      id: "latest-1",
      matchday_id: MATCHDAY_ID,
      article_id: null,
      time_label: "18:15 · ANTIGO",
      time_label_color: "#667788",
      title: "Última antiga",
      subtitle: null,
      image_url: null,
      link_url: OLD_LINK,
      sort_order: 7,
      status: "published",
      updated_at: "2026-08-20T00:00:00.000Z",
    })],
    matchday_horizontal_news: [row({
      id: "horizontal-1",
      matchday_id: OTHER_MATCHDAY_ID,
      label: "FAIXA ANTIGA",
      label_color: "#778899",
      title: "Faixa antiga",
      subtitle: "Subtítulo antigo",
      image_url: "old-horizontal.jpg",
      link_url: OLD_LINK,
      sort_order: 5,
      status: "draft",
      updated_at: "2026-08-20T00:00:00.000Z",
    })],
    site_editorials: [row({
      id: "home-1",
      headline_title: "Home antiga",
      headline_subtitle: "Resumo antigo",
      headline_image_url: "old-home.jpg",
      headline_link_url: OLD_LINK,
      headline_title_color: "#8899aa",
      status: "published",
      side_block_type: "opiniao",
      side_block_label: "HOME LATERAL",
      side_block_label_color: "#99aabb",
      side_block_title: "Lateral antiga",
      side_block_title_color: "#aabbcc",
      side_block_author: "Autor antigo",
      side_block_text: "Texto antigo",
      side_block_image_url: "old-home-side.jpg",
      side_block_link_url: OLD_LINK,
      side_block_status: "draft",
      complementary_label: "HOME COMPLEMENTO",
      complementary_title: "Complemento antigo",
      complementary_text: "Texto antigo",
      complementary_image_url: "old-home-complement.jpg",
      complementary_link_url: OLD_LINK,
      complementary_status: "published",
      updated_at: "2026-08-20T00:00:00.000Z",
    })],
    site_editorial_highlights: [row({
      id: "home-highlight-1",
      label: "RÓTULO HOME PRÓPRIO",
      label_color: "#bbccdd",
      title: "Destaque Home antigo",
      subtitle: "Subtítulo antigo",
      image_url: "old-home-highlight.jpg",
      link_url: OLD_LINK,
      sort_order: 2,
      status: "published",
      updated_at: "2026-08-20T00:00:00.000Z",
    })],
    site_editorial_latest_news: [row({
      id: "home-latest-1",
      time_label: "ANTIGO",
      time_label_color: "#ccddee",
      title: "Última Home antiga",
      subtitle: "Override antigo",
      image_url: "old-home-latest.jpg",
      link_url: OLD_LINK,
      sort_order: 8,
      status: "published",
      updated_at: "2026-08-20T00:00:00.000Z",
    })],
    site_editorial_horizontal_news: [row({
      id: "home-horizontal-1",
      label: "FAIXA HOME ANTIGA",
      label_color: "#ddeeff",
      title: "Faixa Home antiga",
      subtitle: "Subtítulo antigo",
      image_url: "old-home-horizontal.jpg",
      link_url: OLD_LINK,
      sort_order: 9,
      status: "published",
      updated_at: "2026-08-20T00:00:00.000Z",
    })],
  };
}

function emptyTables(): Record<EditorialArticleLiveSnapshotTable, MutableRow[]> {
  return {
    matchday_editorials: [],
    matchday_highlights: [],
    matchday_latest_news: [],
    matchday_horizontal_news: [],
    site_editorials: [],
    site_editorial_highlights: [],
    site_editorial_latest_news: [],
    site_editorial_horizontal_news: [],
  };
}

function seededLiveLayout(): MutableRow[] {
  return [
    row({
      id: "live-direct-1",
      matchday_id: MATCHDAY_ID,
      slot_type: "live_hierarchical:secondary_strong_1",
      article_id: ARTICLE_ID,
      label: "ANTIGO",
      title: "Live antigo",
      subtitle: "Subtítulo antigo",
      image_url: "old-live.jpg",
      link_url: OLD_LINK,
      created_at: "2026-08-19T00:00:00.000Z",
      updated_at: "2026-08-20T00:00:00.000Z",
    }),
    row({
      id: "live-direct-2",
      matchday_id: OTHER_MATCHDAY_ID,
      slot_type: "live_beyond_matchday:3",
      article_id: ARTICLE_ID,
      label: "ANTIGO 2",
      title: "Live antigo 2",
      subtitle: "Subtítulo antigo 2",
      image_url: "old-live-2.jpg",
      link_url: OLD_LINK,
      created_at: "2026-08-19T01:00:00.000Z",
      updated_at: "2026-08-20T00:00:00.000Z",
    }),
    row({
      id: "live-auto-1",
      matchday_id: MATCHDAY_ID,
      slot_type: "live_four_news:1",
      article_id: null,
      label: "ANTIGO AUTO",
      title: "Auto antigo",
      subtitle: "Auto antigo",
      image_url: "old-auto.jpg",
      link_url: OLD_LINK,
      created_at: "2026-08-19T02:00:00.000Z",
      updated_at: "2026-08-20T00:00:00.000Z",
    }),
  ];
}

function seededLiveCarryovers(): Array<{
  matchday_id: string;
  carryover_source_composition_id: string | null;
  carryover_snapshot: unknown;
}> {
  return [{
    matchday_id: CARRYOVER_MATCHDAY_ID,
    carryover_source_composition_id: "55555555-5555-4555-8555-555555555555",
    carryover_snapshot: {
      version: 2,
      source_matchday_id: MATCHDAY_ID,
      source_composition_id: "55555555-5555-4555-8555-555555555555",
      untouched_metadata: "preservar",
      headline: {
        title: "Manchete herdada antiga",
        summary: "Resumo herdado antigo",
        image_url: "old-carryover-headline.jpg",
        link_url: OLD_LINK,
      },
      side_block: {
        label: "CONTEXTO ANTIGO",
        label_color: "#102030",
        title: "Contexto herdado antigo",
        title_color: "#203040",
        author: "Autor antigo",
        text: "Texto antigo",
        image_url: "old-carryover-side.jpg",
        link_url: OLD_LINK,
      },
      highlights: [{
        id: "carryover-highlight-1",
        sort_order: 2,
        label: "RÓTULO HERDADO PRÓPRIO",
        label_color: "#304050",
        title: "Destaque herdado antigo",
        subtitle: "Subtítulo antigo",
        image_url: "old-carryover-highlight.jpg",
        link_url: OLD_LINK,
      }],
      live_layout_items: [{
        id: "carryover-live-direct",
        matchday_id: MATCHDAY_ID,
        slot_type: "live_hierarchical:secondary_2",
        article_id: null,
        label: "ANTIGO",
        title: "Layout herdado antigo",
        subtitle: "Subtítulo antigo",
        image_url: "old-carryover-live.jpg",
        link_url: OLD_LINK,
        created_at: "2026-08-19T00:00:00.000Z",
        updated_at: "2026-08-20T00:00:00.000Z",
      }, {
        id: "carryover-live-auto",
        matchday_id: MATCHDAY_ID,
        slot_type: "live_four_news:2",
        article_id: null,
        label: "AUTO ANTIGO",
        title: "Auto herdado antigo",
        subtitle: "Subtítulo antigo",
        image_url: "old-carryover-auto.jpg",
        link_url: OLD_LINK,
        created_at: "2026-08-19T01:00:00.000Z",
        updated_at: "2026-08-20T00:00:00.000Z",
      }],
    },
  }];
}

function fixture(options: { empty?: boolean } = {}) {
  const tables = options.empty ? emptyTables() : seededTables();
  const liveLayout = options.empty ? [] : seededLiveLayout();
  const liveCarryovers = options.empty ? [] : seededLiveCarryovers();
  const referenceRows = [row({
    id: "reference-1",
    title_snapshot: "Snapshot histórico antigo",
    link_url_snapshot: OLD_LINK,
    sort_order: 3,
  })];
  const hierarchicalReferenceRows = [row({
    id: "hierarchical-reference-1",
    title_snapshot: "Hierarquia histórica antiga",
    link_url_snapshot: OLD_LINK,
  })];
  const patchCalls: EditorialArticleLiveSnapshotPatch[] = [];
  const latestProjectionCalls: string[] = [];

  function matchesLinks(candidate: unknown, links: readonly string[]) {
    return typeof candidate === "string" && links.includes(candidate);
  }

  const sync = createEditorialArticleLiveSnapshotSync({
    async readAffectedMatchdayIds(links) {
      return [...new Set(([
        ...tables.matchday_editorials.flatMap((candidate) => [
          candidate.headline_link_url,
          candidate.side_block_link_url,
          candidate.complementary_link_url,
        ].some((link) => matchesLinks(link, links)) ? candidate.matchday_id : null),
        ...tables.matchday_highlights.map((candidate) => (
          matchesLinks(candidate.link_url, links) ? candidate.matchday_id : null
        )),
        ...tables.matchday_latest_news.map((candidate) => (
          matchesLinks(candidate.link_url, links) ? candidate.matchday_id : null
        )),
        ...tables.matchday_horizontal_news.map((candidate) => (
          matchesLinks(candidate.link_url, links) ? candidate.matchday_id : null
        )),
      ]).filter((value): value is string => typeof value === "string"))];
    },
    async readLiveLayoutItems(links) {
      return liveLayout
        .filter((candidate) => matchesLinks(candidate.link_url, links))
        .map((candidate): EditorialArticleLiveLayoutRow => ({
          id: String(candidate.id),
          matchday_id: String(candidate.matchday_id),
          slot_type: String(candidate.slot_type),
          link_url: typeof candidate.link_url === "string" ? candidate.link_url : null,
        }));
    },
    async readLiveCarryovers() {
      return liveCarryovers.map((candidate): EditorialArticleLiveCarryoverRow => ({
        ...candidate,
      }));
    },
    async patchLinkedSnapshots(patch) {
      patchCalls.push(structuredClone(patch));
      tables[patch.table].forEach((candidate) => {
        if (matchesLinks(candidate[patch.linkField], patch.links)) {
          Object.assign(candidate, patch.payload);
        }
      });
    },
    async patchLiveLayoutItem(rowId, payload) {
      const candidate = liveLayout.find((item) => item.id === rowId);
      if (candidate) Object.assign(candidate, payload);
    },
    async patchLiveCarryover(row, snapshot) {
      const candidate = liveCarryovers.find((item) => (
        item.matchday_id === row.matchday_id
        && item.carryover_source_composition_id === row.carryover_source_composition_id
      ));
      if (candidate) candidate.carryover_snapshot = snapshot;
    },
    async syncLatestFourNewsProjection(matchdayId) {
      latestProjectionCalls.push(matchdayId);
      const latest = tables.matchday_latest_news.find(
        (candidate) => candidate.matchday_id === matchdayId && candidate.link_url === NEW_LINK,
      );
      if (!latest) return;
      liveLayout
        .filter((candidate) => (
          candidate.matchday_id === matchdayId
          && typeof candidate.slot_type === "string"
          && candidate.slot_type.startsWith("live_four_news:")
          && candidate.link_url === OLD_LINK
        ))
        .forEach((candidate) => Object.assign(candidate, {
          label: latest.time_label,
          title: latest.title,
          subtitle: updatedArticle.subtitle,
          image_url: updatedArticle.image_url,
          link_url: latest.link_url,
          updated_at: NOW,
        }));
    },
    now() {
      return NOW;
    },
  });

  return {
    tables,
    liveLayout,
    liveCarryovers,
    referenceRows,
    hierarchicalReferenceRows,
    patchCalls,
    latestProjectionCalls,
    sync,
  };
}

test("uma atualização canónica refresca headline, contexto, complemento, destaque, Últimas, Faixa e Home", async () => {
  const state = fixture();

  const result = await state.sync({
    previousSlug: "palhinha-antigo",
    article: updatedArticle,
  });

  const editorial = state.tables.matchday_editorials[0];
  assert.equal(editorial.title, updatedArticle.title);
  assert.equal(editorial.summary, updatedArticle.subtitle);
  assert.equal(editorial.image_url, updatedArticle.image_url);
  assert.equal(editorial.headline_link_url, NEW_LINK);
  assert.equal(editorial.side_block_label, updatedArticle.label);
  assert.equal(editorial.side_block_title, updatedArticle.title);
  assert.equal(editorial.side_block_text, updatedArticle.subtitle);
  assert.equal(editorial.side_block_author, updatedArticle.author);
  assert.equal(editorial.side_block_image_url, updatedArticle.image_url);
  assert.equal(editorial.side_block_link_url, NEW_LINK);
  assert.equal(editorial.complementary_label, updatedArticle.label);
  assert.equal(editorial.complementary_title, updatedArticle.title);
  assert.equal(editorial.complementary_text, updatedArticle.subtitle);
  assert.equal(editorial.complementary_image_url, updatedArticle.image_url);
  assert.equal(editorial.complementary_link_url, NEW_LINK);

  for (const table of ["matchday_highlights", "matchday_horizontal_news"] as const) {
    assert.equal(state.tables[table][0].title, updatedArticle.title);
    assert.equal(state.tables[table][0].subtitle, updatedArticle.subtitle);
    assert.equal(state.tables[table][0].image_url, updatedArticle.image_url);
    assert.equal(state.tables[table][0].link_url, NEW_LINK);
  }
  assert.equal(state.tables.matchday_latest_news[0].title, updatedArticle.title);
  assert.match(String(state.tables.matchday_latest_news[0].time_label), /MERCADO/);
  assert.equal(state.tables.matchday_latest_news[0].subtitle, null);
  assert.equal(state.tables.matchday_latest_news[0].image_url, null);
  assert.equal(state.tables.matchday_latest_news[0].link_url, NEW_LINK);
  assert.equal(state.tables.matchday_horizontal_news[0].label, updatedArticle.label);

  const home = state.tables.site_editorials[0];
  assert.equal(home.headline_title, updatedArticle.title);
  assert.equal(home.side_block_label, updatedArticle.label);
  assert.equal(home.side_block_title, updatedArticle.title);
  assert.equal(home.complementary_label, updatedArticle.label);
  assert.equal(home.complementary_title, updatedArticle.title);
  for (const table of [
    "site_editorial_highlights",
    "site_editorial_latest_news",
    "site_editorial_horizontal_news",
  ] as const) {
    assert.equal(state.tables[table][0].title, updatedArticle.title);
    assert.equal(state.tables[table][0].link_url, NEW_LINK);
  }
  assert.match(String(state.tables.site_editorial_latest_news[0].time_label), /MERCADO/);
  assert.equal(state.tables.site_editorial_latest_news[0].subtitle, null);
  assert.equal(state.tables.site_editorial_latest_news[0].image_url, null);
  assert.equal(state.tables.site_editorial_horizontal_news[0].label, updatedArticle.label);
  assert.deepEqual([...result.affectedMatchdayIds].sort(), [MATCHDAY_ID, OTHER_MATCHDAY_ID].sort());
  assert.deepEqual(result.updatedCarryoverMatchdayIds, [CARRYOVER_MATCHDAY_ID]);
  assert.equal(state.patchCalls.length, 12);
});

test("live_layout mantém slots e identidade, e os quatro automáticos são recalculados por Últimas", async () => {
  const state = fixture();
  const before = structuredClone(state.liveLayout);

  const result = await state.sync({ previousSlug: "palhinha-antigo", article: updatedArticle });

  for (const [index, item] of state.liveLayout.slice(0, 2).entries()) {
    assert.equal(item.id, before[index].id);
    assert.equal(item.matchday_id, before[index].matchday_id);
    assert.equal(item.slot_type, before[index].slot_type);
    assert.equal(item.article_id, before[index].article_id);
    assert.equal(item.created_at, before[index].created_at);
    assert.equal(item.label, updatedArticle.label);
    assert.equal(item.title, updatedArticle.title);
    assert.equal(item.subtitle, updatedArticle.subtitle);
    assert.equal(item.image_url, updatedArticle.image_url);
    assert.equal(item.link_url, NEW_LINK);
  }
  assert.deepEqual(result.updatedLiveLayoutItemIds, ["live-direct-1", "live-direct-2"]);
  assert.equal(state.liveLayout[2].title, updatedArticle.title);
  assert.equal(state.liveLayout[2].subtitle, updatedArticle.subtitle);
  assert.equal(state.liveLayout[2].image_url, updatedArticle.image_url);
  assert.equal(state.liveLayout[2].slot_type, "live_four_news:1");
  assert.deepEqual(state.latestProjectionCalls.sort(), [MATCHDAY_ID, OTHER_MATCHDAY_ID].sort());
});

test("a sincronização preserva posição, ordem, cores, estados e rótulos não derivados pelo perfil", async () => {
  const state = fixture();

  await state.sync({ previousSlug: "palhinha-antigo", article: updatedArticle });

  const editorial = state.tables.matchday_editorials[0];
  assert.equal(editorial.title_color, "#112233");
  assert.equal(editorial.status, "published");
  assert.equal(editorial.side_block_type, "analise");
  assert.equal(editorial.side_block_label_color, "#223344");
  assert.equal(editorial.side_block_title_color, "#334455");
  assert.equal(editorial.side_block_status, "draft");
  assert.equal(editorial.complementary_text_color, "#445566");
  assert.equal(editorial.complementary_status, "published");

  const highlight = state.tables.matchday_highlights[0];
  assert.equal(highlight.sort_order, 3);
  assert.equal(highlight.status, "published");
  assert.equal(highlight.label, "RÓTULO EDITORIAL PRÓPRIO");
  assert.equal(highlight.label_color, "#556677");
  const latest = state.tables.matchday_latest_news[0];
  assert.equal(latest.sort_order, 7);
  assert.equal(latest.status, "published");
  assert.equal(latest.time_label_color, "#667788");
  const horizontal = state.tables.matchday_horizontal_news[0];
  assert.equal(horizontal.sort_order, 5);
  assert.equal(horizontal.status, "draft");
  assert.equal(horizontal.label_color, "#778899");
  assert.equal(state.tables.site_editorial_highlights[0].label, "RÓTULO HOME PRÓPRIO");
  assert.equal(state.tables.site_editorial_highlights[0].label_color, "#bbccdd");
});

test("o carryover usado pela página viva recebe dados novos sem perder estrutura ou configuração", async () => {
  const state = fixture();
  const before = structuredClone(state.liveCarryovers[0].carryover_snapshot) as Record<string, any>;

  const result = await state.sync({ previousSlug: "palhinha-antigo", article: updatedArticle });

  const snapshot = state.liveCarryovers[0].carryover_snapshot as Record<string, any>;
  assert.equal(snapshot.version, 2);
  assert.equal(snapshot.source_matchday_id, before.source_matchday_id);
  assert.equal(snapshot.source_composition_id, before.source_composition_id);
  assert.equal(snapshot.untouched_metadata, "preservar");
  assert.equal(snapshot.headline.title, updatedArticle.title);
  assert.equal(snapshot.headline.summary, updatedArticle.subtitle);
  assert.equal(snapshot.headline.image_url, updatedArticle.image_url);
  assert.equal(snapshot.headline.link_url, NEW_LINK);
  assert.equal(snapshot.side_block.label, updatedArticle.label);
  assert.equal(snapshot.side_block.title, updatedArticle.title);
  assert.equal(snapshot.side_block.author, updatedArticle.author);
  assert.equal(snapshot.side_block.text, updatedArticle.subtitle);
  assert.equal(snapshot.side_block.label_color, "#102030");
  assert.equal(snapshot.side_block.title_color, "#203040");
  assert.equal(snapshot.highlights[0].title, updatedArticle.title);
  assert.equal(snapshot.highlights[0].label, "RÓTULO HERDADO PRÓPRIO");
  assert.equal(snapshot.highlights[0].label_color, "#304050");
  assert.equal(snapshot.highlights[0].sort_order, 2);
  for (const [index, item] of snapshot.live_layout_items.entries()) {
    assert.equal(item.id, before.live_layout_items[index].id);
    assert.equal(item.slot_type, before.live_layout_items[index].slot_type);
    assert.equal(item.created_at, before.live_layout_items[index].created_at);
    assert.equal(item.title, updatedArticle.title);
    assert.equal(item.subtitle, updatedArticle.subtitle);
    assert.equal(item.image_url, updatedArticle.image_url);
    assert.equal(item.link_url, NEW_LINK);
  }
  assert.match(String(snapshot.live_layout_items[1].label), /MERCADO/);
  assert.deepEqual(result.updatedCarryoverMatchdayIds, [CARRYOVER_MATCHDAY_ID]);
  assert.equal(state.latestProjectionCalls.includes(CARRYOVER_MATCHDAY_ID), false);
});

test("um artigo em várias jornadas e zonas é atualizado uma vez por linha sem criar posições", async () => {
  const state = fixture();
  const countsBefore = Object.fromEntries(
    Object.entries(state.tables).map(([table, rows]) => [table, rows.length]),
  );
  const liveCountBefore = state.liveLayout.length;

  await state.sync({ previousSlug: "palhinha-antigo", article: updatedArticle });

  assert.deepEqual(
    Object.fromEntries(Object.entries(state.tables).map(([table, rows]) => [table, rows.length])),
    countsBefore,
  );
  assert.equal(state.liveLayout.length, liveCountBefore);
  assert.equal(state.liveLayout.filter((item) => item.link_url === NEW_LINK).length, 3);
});

test("um artigo não colocado não cria qualquer zona nem recalcula projeções", async () => {
  const state = fixture({ empty: true });
  state.liveCarryovers.push({
    matchday_id: CARRYOVER_MATCHDAY_ID,
    carryover_source_composition_id: null,
    carryover_snapshot: {
      version: 2,
      headline: {
        title: "Outro artigo",
        link_url: "/noticias/outro-artigo",
      },
    },
  });
  const unrelatedCarryoverBefore = structuredClone(state.liveCarryovers);

  const result = await state.sync({ previousSlug: "palhinha-antigo", article: updatedArticle });

  assert.deepEqual(result.affectedMatchdayIds, []);
  assert.deepEqual(result.updatedLiveLayoutItemIds, []);
  assert.deepEqual(result.updatedCarryoverMatchdayIds, []);
  assert.deepEqual(state.latestProjectionCalls, []);
  assert.equal(Object.values(state.tables).every((rows) => rows.length === 0), true);
  assert.equal(state.liveLayout.length, 0);
  assert.deepEqual(state.liveCarryovers, unrelatedCarryoverBefore);
});

test("slug, published_at e snapshots históricos permanecem fora da escrita viva", async () => {
  const state = fixture();
  const articleBefore = structuredClone(updatedArticle);
  const referenceBefore = structuredClone(state.referenceRows);
  const hierarchicalBefore = structuredClone(state.hierarchicalReferenceRows);

  await state.sync({ previousSlug: "palhinha-antigo", article: updatedArticle });

  assert.deepEqual(updatedArticle, articleBefore);
  assert.equal(updatedArticle.slug, "palhinha-antigo");
  assert.equal(updatedArticle.published_at, "2026-08-20T18:15:00.000Z");
  assert.deepEqual(state.referenceRows, referenceBefore);
  assert.deepEqual(state.hierarchicalReferenceRows, hierarchicalBefore);
});

test("o helper runtime só escreve tabelas vivas e delega os quatro slots automáticos", () => {
  const source = readFileSync(
    fileURLToPath(new URL("./editorial-article-live-snapshot-sync.ts", import.meta.url)),
    "utf8",
  );

  assert.doesNotMatch(
    source,
    /matchday_reference_composition_items|matchday_hierarchical_composition_slots/,
  );
  assert.doesNotMatch(source, /method:\s*"POST"|method:\s*"DELETE"/);
  assert.match(source, /isLatestFourNewsSlotType\(row\.slot_type\)/);
  assert.match(source, /syncLatestFourNewsProjection\(matchdayId\)/);
  for (const table of [
    "matchday_editorials",
    "matchday_highlights",
    "matchday_latest_news",
    "matchday_horizontal_news",
    "matchday_live_layout_items",
    "matchday_editorial_desk_control",
    "site_editorials",
    "site_editorial_highlights",
    "site_editorial_latest_news",
    "site_editorial_horizontal_news",
  ]) {
    assert.match(source, new RegExp(table));
  }
});
