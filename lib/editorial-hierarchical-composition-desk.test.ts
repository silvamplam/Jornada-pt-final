import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const page = fs.readFileSync(
  "app/admin/editorial/composicao/[matchdayId]/page.tsx",
  "utf8",
);
const client = fs.readFileSync(
  "app/admin/editorial/composicao/[matchdayId]/HierarchicalCompositionDeskClient.tsx",
  "utf8",
);
const route = fs.readFileSync(
  "app/api/admin/editorial/composicao/route.ts",
  "utf8",
);

test("a Composição hierárquica é a única Mesa administrativa visível", () => {
  assert.match(
    page,
    /HierarchicalCompositionDeskClient/,
  );

  assert.match(
    page,
    /composition-admin-shell-desk/,
  );

  assert.match(
    client,
    /\.hc-desk-workspace \{[\s\S]*display: flex;[\s\S]*flex-direction: column;/,
  );

  assert.match(
    client,
    /\.hc-desk-map \{[\s\S]*order: 1;/,
  );

  assert.match(
    client,
    /\.hc-desk-library \{[\s\S]*order: 2;/,
  );

  assert.match(
    client,
    /position: fixed/,
  );

  assert.match(
    client,
    /GUARDAR MONTAGEM/,
  );
});

test("o reservatório representa apenas peças livres e é controlado por React", () => {
  assert.match(client, /filterHistoricalCompositionReservoir/);
  assert.match(client, /placedBankItemIds/);
  assert.match(client, /selectedGroupKeys/);
  assert.match(client, /selectedGroupKey/);
  assert.match(client, /type="search"/);
  assert.match(client, /visibleArticles/);
  assert.doesNotMatch(client, /"latest_without_zone"/);
  assert.doesNotMatch(client, /Na composição/);
});

test("colocar planeia, limpa a seleção e só Guardar montagem persiste", () => {
  assert.match(client, /Colocação planeada/);
  assert.match(client, /setSelectedBankItemIds\(\[\]\)/);
  assert.match(client, /apply_hierarchical_desk_plan/);
  assert.match(route, /async function applyHierarchicalDeskPlan/);
  assert.match(route, /actionType === "apply_hierarchical_desk_plan"/);
  assert.match(route, /return Response\.json\(\{\s*ok: true,\s*applied,/);
});

test("vídeo, publicação e preview ficam em menus recolhidos; Editorial é um slot canónico", () => {
  assert.match(page, /<summary>Vídeo \+ Destaque<\/summary>/);
  assert.match(page, /<summary>Publicar composição<\/summary>/);
  assert.match(page, /<summary>Pré-visualização<\/summary>/);
  assert.match(client, /<summary>Página e blocos<\/summary>/);
  assert.match(client, /data-historical-editorial-slot="canonical-article"/);
  assert.doesNotMatch(page, /<summary>Editorial da Jornada<\/summary>/);
});

test("menus e zonas permanecem numa linha e só a zona ativa é renderizada", () => {
  assert.match(client, /\.hc-zone-tabs \{[\s\S]*flex-wrap: nowrap;[\s\S]*overflow-x: auto;/);
  assert.match(client, /activeWorkspaceKey === "opening" && openingSection/);
  assert.match(client, /activeWorkspaceKey === "editorial"/);
  assert.match(client, /activeWorkspaceKey === "highlight"/);
  assert.match(client, /activeWorkspaceKey === "faixa"/);
  assert.match(client, /activeDynamicZone \?/);
  assert.match(client, /name="composition-tools"/);
  assert.match(page, /name="composition-tools"/);
});

test("a zona ativa fica sticky e a lista é a área de scroll independente", () => {
  assert.match(client, /\.composition-admin-shell-desk \{[\s\S]*height: 100dvh;[\s\S]*overflow: hidden;/);
  assert.match(client, /\.hc-desk-map \{[\s\S]*position: sticky;[\s\S]*order: 1;/);
  assert.match(client, /\.hc-desk-scroll \{[\s\S]*overflow-y: auto;/);
});
