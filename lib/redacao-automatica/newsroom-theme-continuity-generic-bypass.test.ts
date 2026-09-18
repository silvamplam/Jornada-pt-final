import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const route = readFileSync("app/api/admin/editorial/redacao-automatica/mesa/preparar/route.ts", "utf8");
const themePage = readFileSync("app/admin/editorial/redacao-automatica/mesa/temas/[themeId]/page.tsx", "utf8");
const continuityClient = readFileSync("app/admin/editorial/redacao-automatica/mesa/temas/[themeId]/_theme-continuity-client.tsx", "utf8");

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
  assert.match(themePage, /escolhe revisão, revisão com novos ou apenas novos/);
  assert.match(themePage, /: <MesaSelectionTray \/>/);
});


test("Tema publicado aceita incorporação explícita antes de entrar na Continuidade", () => {
  assert.match(route, /incorporatePublishedThemeSourcesForContinuity/);
  assert.match(route, /newsroom_organize_theme_sources_v1/);
  assert.match(route, /contextInput\.incorporateThemeId === continuityRequirement\.themeId/);
  assert.match(route, /workspaceUrl: `\/admin\/editorial\/redacao-automatica\/mesa\/temas\/\$\{input\.incorporateThemeId\}\?continuity=1`/);
});

test("handoff de incorporação abre automaticamente a Continuidade do Tema", () => {
  assert.match(themePage, /autoOpen=\{query\.continuity === "1"\}/);
  // The shared intent UI opens from the handoff flag; actual interaction is
  // covered by .ci/mesa-intents-ui/browser.py (whole Theme + all three modes).
  assert.match(continuityClient, /useState\(autoOpen\)/);
  assert.match(continuityClient, /expanded\?<MesaIntentPreparationClient/);
});
