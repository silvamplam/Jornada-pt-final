import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const route = readFileSync("app/api/admin/editorial/redacao-automatica/mesa/preparar/route.ts", "utf8");
const themePage = readFileSync("app/admin/editorial/redacao-automatica/mesa/temas/[themeId]/page.tsx", "utf8");

test("Tema publicado bloqueia a preparação genérica no servidor", () => {
  assert.match(route, /readThemeContinuity/);
  assert.match(route, /continuity\.publishedArticleCount > 0/);
  assert.match(route, /code: "theme_continuity_required"/);
  assert.match(route, /genericThemeContinuityRequirement\(themeIds\)/);
  assert.match(route, /genericThemeContinuityRequirement\(\[input\.themeId\]\)/);
  assert.match(route, /Nenhuma Produção genérica foi criada/);
});

test("Tema publicado deixa de expor o PREPARAR PRODUÇÃO genérico na página do Tema", () => {
  assert.match(themePage, /context\.articleCount > 0/);
  assert.match(themePage, /Voltar a levar à Produção/);
  assert.match(themePage, /artigos existentes serão revistos/);
  assert.match(themePage, /: <MesaSelectionTray \/>/);
});
