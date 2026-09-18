import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  MESA_CLASSIFICATION_OPTIONS,
  MESA_PAGE_SIZE,
  mesaHref,
  mesaPageReadModelInput,
  parseMesaQuery,
} from "../../app/admin/editorial/redacao-automatica/mesa/_mesa-query";

const MESA_PAGE = path.join(
  process.cwd(),
  "app/admin/editorial/redacao-automatica/mesa/page.tsx",
);
const MESA_CSS = path.join(
  process.cwd(),
  "app/admin/editorial/redacao-automatica/mesa/mesa.module.css",
);
const LEGACY_PAGE = path.join(
  process.cwd(),
  "app/admin/editorial/redacao-automatica/page.tsx",
);

function source(file: string): string {
  return readFileSync(file, "utf8");
}

function validQuery(
  params: Record<string, string> = {},
) {
  const parsed = parseMesaQuery(params);
  if (!parsed.ok) assert.fail("expected valid Mesa query");
  return parsed.value;
}

test("Mesa uses the server-paged read-model and not either global desk read-model", () => {
  assert.equal(existsSync(MESA_PAGE), true);
  assert.equal(existsSync(MESA_CSS), true);
  const page = source(MESA_PAGE);
  assert.match(
    page,
    /loadMesaPageReadModel\(mesaPageReadModelInput\(query\)\)/,
  );
  assert.match(page, /MesaSelectionProvider/);
  assert.doesNotMatch(page, /loadEditorialDeskReadModel/);
  assert.doesNotMatch(page, /loadOperationalDeskReadModel/);
  assert.match(page, /export const dynamic = "force-dynamic"/);
});

test("Mesa mostra NOVAS, PUBLICADAS, ARQUIVO e mantém Temas/Dossiês", () => {
  const page = source(MESA_PAGE);
  assert.match(page, /sourceIsUnassigned/);
  assert.match(page, /MesaOrganizationPanel/);
  assert.match(page, /MesaLooseSourcesPanel/);
  assert.doesNotMatch(page, /title="PUBLICADAS"/);
  assert.match(page, /loadMesaArchiveReadModel/);
  assert.match(page, /searchNewsroomArticles/);
  assert.match(page, /archiveItems/);
  assert.doesNotMatch(page, /previousHref=|nextHref=/);
});

test("fixture visual is development-only, locally rendered and isolated from writers", () => {
  const page = source(MESA_PAGE);
  const client = source(path.join(
    process.cwd(),
    "app/admin/editorial/redacao-automatica/mesa/_mesa-selection-client.tsx",
  ));
  assert.match(page, /process\.env\.NODE_ENV !== "production"/);
  assert.match(page, /data:image\/svg\+xml/);
  assert.doesNotMatch(page, /picsum\.photos/);
  assert.match(page, /initialSelection=\{isFixture \? FIXTURE_INITIAL_SELECTION : \[\]\}/);
  assert.match(client, /if \(fixtureMode\) \{[\s\S]*?nenhuma produção foi enviada/);
  assert.match(client, /if \(fixtureMode\) \{[\s\S]*?setLoaded\(true\)/);
  assert.match(client, /if \(!loaded \|\| total === 0\) return null/);
});

test("classificacao transversal keeps all canonical keys and POR CLASSIFICAR", () => {
  const all = validQuery({ classification: "all" });
  assert.deepEqual(all.classification, { mode: "all" });

  const canonicalKeys = [
    "benfica",
    "sporting",
    "fc_porto",
    "other_liga_clubs",
    "outside_liga_other",
  ] as const;
  for (const classificationKey of canonicalKeys) {
    const query = validQuery({ classification: classificationKey });
    assert.deepEqual(query.classification, { mode: "classified", classificationKey });
  }

  const unclassified = validQuery({ classification: "unclassified" });
  assert.deepEqual(unclassified.classification, { mode: "unclassified" });
  assert.equal(Object.hasOwn(unclassified.classification, "classificationKey"), false);
  assert.deepEqual(
    MESA_CLASSIFICATION_OPTIONS.map((option) => option.value),
    ["all", ...canonicalKeys, "unclassified"],
  );
});

test("invalid request is distinguished from empty dataset", () => {
  assert.deepEqual(parseMesaQuery({ tab: "quarta-area" }), { ok: false });
  assert.deepEqual(parseMesaQuery({ classification: "sexta_classificacao" }), { ok: false });
  assert.deepEqual(parseMesaQuery({ page: "0" }), { ok: false });
  const page = source(MESA_PAGE);
  assert.match(page, /Pedido/);
  assert.match(page, /Leitura/);
  assert.match(page, /Mesa/);
});

test("tema is not a new source state and does not alter transversal filter semantics", () => {
  const query = validQuery({ tab: "temas", classification: "unclassified" });
  assert.equal(query.tab, "temas");
  assert.deepEqual(mesaPageReadModelInput(query).classification, { mode: "unclassified" });
  assert.match(source(MESA_PAGE), /MesaSelectionTray/);
  assert.doesNotMatch(source(MESA_PAGE), /classificationKey:\s*["']unclassified["']/);
});

test("published contributions are shown and UPDATE is not inferred", () => {
  const page = source(MESA_PAGE) + source(path.join(process.cwd(), "app/admin/editorial/redacao-automatica/mesa/_mesa-source-item.tsx"));
  assert.match(page, /item\.publishedContributions\.map/);
  assert.match(page, /contribution\.editorialArticleId/);
  assert.match(page, /<small>\s*Artigo publicado\s*<\/small>/);
  assert.doesNotMatch(page, /Dossiê anterior/);
  assert.doesNotMatch(page, /updateTarget|Atualizar artigo/);
});

test("Fonte atualizada is kept as secondary notice only", () => {
  const page = source(MESA_PAGE) + source(path.join(process.cwd(), "app/admin/editorial/redacao-automatica/mesa/_mesa-source-item.tsx"));
  assert.match(page, /item\.sourceUpdated/);
  assert.match(page, /Fonte atualizada/);
  assert.doesNotMatch(page, />Utilizada<|>Em trabalho</);
});

test("PUBLICADAS keep newsroom article identity and article links", () => {
  const page = source(MESA_PAGE) + source(path.join(process.cwd(), "app/admin/editorial/redacao-automatica/mesa/_mesa-source-item.tsx"));
  assert.match(page, /key=\{item\.newsroomArticleId\}/);
  assert.match(page, /newsroomArticleId:\s*item\.newsroomArticleId/);
  assert.doesNotMatch(page, /function PublishedItem/);
  assert.match(page, /\/admin\/editorial\/artigos\/\$\{contribution\.editorialArticleId\}/);
});

test("pagination keeps tab + classification + extra filters", () => {
  const query = validQuery({
    tab: "publicadas",
    classification: "sporting",
    page: "2",
    source: "record",
    competitionId: "70000000-0000-4000-8000-000000000001",
    seasonId: "71000000-0000-4000-8000-000000000001",
    matchdayId: "72000000-0000-4000-8000-000000000001",
    themeStatus: "archived",
  });
  const href = new URL(mesaHref(query, { page: 3 }), "https://jornada.test");
  assert.equal(href.searchParams.get("tab"), "publicadas");
  assert.equal(href.searchParams.get("classification"), "sporting");
  assert.equal(href.searchParams.get("page"), "3");
  assert.equal(href.searchParams.get("source"), "record");
  assert.equal(href.searchParams.get("competitionId"), query.competitionId);
  assert.equal(href.searchParams.get("seasonId"), query.seasonId);
  assert.equal(href.searchParams.get("matchdayId"), query.matchdayId);
  assert.equal(href.searchParams.get("themeStatus"), "archived");

  const input = mesaPageReadModelInput(query);
  assert.equal(input.lifecycle, "published");
  assert.equal(input.pagination.limit, MESA_PAGE_SIZE);
  assert.equal(input.pagination.offset, 0);
  assert.equal(input.sourceCode, "record");

  const page = source(MESA_PAGE);
  const organization = source(path.join(
    process.cwd(),
    "app/admin/editorial/redacao-automatica/mesa/_mesa-organization-client.tsx",
  ));
  assert.doesNotMatch(page, /previousHref=|nextHref=/);
  assert.match(organization, /showAll/);
  assert.doesNotMatch(organization, /sourcePagination/);
});

test("barra da Mesa mantém pesquisa, filtros e Atualizar na ordem editorial", () => {
  const page = source(MESA_PAGE);
  const selection = source(path.join(
    process.cwd(),
    "app/admin/editorial/redacao-automatica/mesa/_mesa-selection-client.tsx",
  ));
  const control = page.slice(
    page.indexOf('<section className={styles.controlStrip}>'),
    page.indexOf('<MesaSelectionTray sourceThemeActions />'),
  );
  assert.doesNotMatch(control, /<span>Pesquisar<\/span>/);
  assert.doesNotMatch(control, /name="source"|>Temas<\/Link>/);
  assert.ok(control.indexOf('name="query"') < control.indexOf(">Filtrar</button>"));
  assert.ok(control.indexOf(">Filtrar</button>") < control.indexOf("classificationFilters"));
  assert.ok(control.indexOf("classificationFilters") < control.indexOf(">Atualizar</button>"));

  const selectionActions = selection.slice(
    selection.indexOf('<div className={styles.selectionActions}>'),
    selection.indexOf('{sourceThemeActions && selectionPanelOpen'),
  );
  assert.match(selectionActions, /selectionPanelToggle/);
  assert.match(selectionActions, /aria-label="Título de trabalho"/);
});

test("Arquivo e pesquisa ficam disponíveis na nova Mesa", () => {
  const archive = validQuery({ tab: "arquivo", query: "quaresma" });
  assert.equal(archive.tab, "arquivo");
  assert.equal(archive.query, "quaresma");
  const page = source(MESA_PAGE);
  const route = source(path.join(
    process.cwd(),
    "app/api/admin/editorial/redacao-automatica/mesa/source/route.ts",
  ));
  assert.match(page, /name="query"/);
  assert.match(page, /tab: "arquivo"/);
  assert.match(page, /MesaArchiveSourceItemView/);
  assert.match(route, /action === "reopen"/);
});


test("Mesa remains server-side read and mutations stay in dedicated APIs", () => {
  const page = source(MESA_PAGE);
  assert.doesNotMatch(page, /writeSupabase|\.insert\(|\.update\(|\.upsert\(|\.delete\(/);
  assert.doesNotMatch(page, /method=["']post["']|method:\s*["'](?:POST|PUT|PATCH|DELETE)/i);
  assert.match(page, /<form method=\"get\"/);
  assert.equal(existsSync(path.join(
    process.cwd(),
    "app/api/admin/editorial/redacao-automatica/mesa/preparar/route.ts",
  )), true);
  assert.equal(existsSync(path.join(
    process.cwd(),
    "app/api/admin/editorial/redacao-automatica/mesa/source/route.ts",
  )), true);
});

test("legacy redacao route continues present and still links to Mesa", () => {
  assert.equal(existsSync(LEGACY_PAGE), true);
  const legacyPage = source(LEGACY_PAGE);
  assert.match(
    legacyPage,
    /href=\"\/admin\/editorial\/redacao-automatica\/mesa\">Mesa da Redação<\/a>/,
  );
  assert.match(legacyPage, /export default async function AutomaticNewsroomPage/);
});
