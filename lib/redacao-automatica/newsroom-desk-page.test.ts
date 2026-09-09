import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  MESA_CLASSIFICATION_OPTIONS,
  MESA_PAGE_SIZE,
  MESA_TABS,
  mesaHref,
  mesaReadModelInput,
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

test("existe rota server-side da Mesa e chama diretamente o read-model", () => {
  assert.equal(existsSync(MESA_PAGE), true);
  assert.equal(existsSync(MESA_CSS), true);
  const page = source(MESA_PAGE);
  assert.match(page, /loadEditorialDeskReadModel\(mesaReadModelInput\(query\)\)/);
  assert.match(page, /export const dynamic = "force-dynamic"/);
  assert.doesNotMatch(page, /fetch\(\s*["']\/api\/admin/);
});

test("a navegação principal contém exatamente NOVAS, PUBLICADAS e TEMAS", () => {
  assert.deepEqual(
    MESA_TABS.map(({ value, label }) => ({ value, label })),
    [
      { value: "novas", label: "NOVAS" },
      { value: "publicadas", label: "PUBLICADAS" },
      { value: "temas", label: "TEMAS" },
    ],
  );
  assert.equal(MESA_TABS.length, 3);
  assert.match(source(MESA_PAGE), /aria-label="Universos da Mesa"/);
});

test("classificação transversal converte all, cinco chaves e unclassified", () => {
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

test("pedido inválido é distinguido de um universo vazio", () => {
  assert.deepEqual(parseMesaQuery({ tab: "quarta-area" }), { ok: false });
  assert.deepEqual(parseMesaQuery({ classification: "sexta_classificacao" }), { ok: false });
  assert.deepEqual(parseMesaQuery({ page: "0" }), { ok: false });
  const page = source(MESA_PAGE);
  assert.match(page, /Pedido inválido/);
  assert.match(page, /Leitura indisponível/);
  assert.match(page, /Mesa não configurada/);
  assert.match(page, /Universo vazio/);
  assert.match(page, /Página sem resultados/);
});

test("TEMAS com unclassified produz o estado vazio legítimo", () => {
  const query = validQuery({ tab: "temas", classification: "unclassified" });
  assert.equal(query.tab, "temas");
  assert.deepEqual(mesaReadModelInput(query).classification, { mode: "unclassified" });
  const page = source(MESA_PAGE);
  assert.match(page, /query\.tab === "temas"[\s\S]*query\.classification\.mode === "unclassified"/);
  assert.match(page, /Não existem Temas por classificar/);
  assert.doesNotMatch(page, /classificationKey:\s*["']unclassified["']/);
});

test("NOVAS mostram toda a memória PUBLICADA conhecida sem eleger alvo", () => {
  const page = source(MESA_PAGE);
  assert.match(page, /item\.publishedRelations\.status === "known"/);
  assert.match(page, /JORNADA JÁ PUBLICOU/);
  assert.match(page, /item\.publishedRelations\.items\.map/);
  assert.match(page, /relation\.editorialArticleId/);
  assert.match(page, /relation\.evidence\.filter/);
  assert.doesNotMatch(page, /updateTarget|Atualizar artigo/);
});

test("Fonte atualizada permanece estado de leitura sem CTA de UPDATE", () => {
  const page = source(MESA_PAGE);
  assert.match(page, /item\.sourceState\.changedAfterKnownUsage/);
  assert.match(page, />Fonte atualizada</);
  assert.doesNotMatch(page, /formAction|formMethod=["']post["']|Produzir|UPDATE/);
});

test("PUBLICADAS usam identidade canónica e contextos não criam cópias", () => {
  const page = source(MESA_PAGE);
  assert.match(page, /data-editorial-article-id=\{item\.editorialArticleId\}/);
  assert.match(page, /key=\{item\.editorialArticleId\}/);
  assert.match(page, /item\.bankContexts\.map/);
  assert.match(page, /key=\{context\.bankItemId\}/);
  assert.match(page, /\/admin\/editorial\/artigos\?articleId=/);
});

test("Tema mostra contagens persistidas e não inventa última atividade", () => {
  const page = source(MESA_PAGE);
  assert.match(page, /item\.sourceCount/);
  assert.match(page, /item\.articleCount/);
  assert.match(page, /item\.updatedAt/);
  assert.doesNotMatch(page, /lastActivityAt/);
});

test("paginação preserva tab, classificação e restantes filtros", () => {
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

  const input = mesaReadModelInput(query);
  assert.equal(input.publicadas?.offset, MESA_PAGE_SIZE);
  assert.equal(input.novas?.offset, 0);
  assert.equal(input.temas?.offset, 0);
});

test("superfície é read-only e não cria API de mutation", () => {
  const page = source(MESA_PAGE);
  assert.doesNotMatch(page, /writeSupabase|\.insert\(|\.update\(|\.upsert\(|\.delete\(/);
  assert.doesNotMatch(page, /method=["']post["']|method:\s*["'](?:POST|PUT|PATCH|DELETE)/i);
  assert.match(page, /<form method="get"/);
  assert.equal(existsSync(path.join(
    process.cwd(),
    "app/api/admin/editorial/redacao-automatica/mesa",
  )), false);
});

test("Redação Automática anterior permanece acessível e liga discretamente à Mesa", () => {
  assert.equal(existsSync(LEGACY_PAGE), true);
  const legacyPage = source(LEGACY_PAGE);
  assert.match(
    legacyPage,
    /href="\/admin\/editorial\/redacao-automatica\/mesa">Mesa da Redação<\/a>/,
  );
  assert.match(legacyPage, /export default async function AutomaticNewsroomPage/);
});
