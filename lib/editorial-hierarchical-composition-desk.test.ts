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
const modernStyles = client.slice(
  client.indexOf("/* Mesa histórica modernizada"),
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
    modernStyles,
    /\.hc-desk-workspace \{[\s\S]*display: grid;[\s\S]*grid-template-columns: minmax\(145px, 170px\) minmax\(0, 1\.08fr\) minmax\(0, 1fr\);/,
  );

  assert.match(
    modernStyles,
    /\.hc-zone-rail \{[\s\S]*?grid-column: 1;[\s\S]*?overflow-y: auto;/,
  );

  assert.match(
    modernStyles,
    /\.hc-desk-map \{[\s\S]*?grid-column: 2;[\s\S]*?overflow-y: auto;/,
  );

  assert.match(
    modernStyles,
    /\.hc-desk-library \{[\s\S]*?grid-column: 3;[\s\S]*?min-height: 0;[\s\S]*?overflow: hidden;/,
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

test("a rail apresenta zonas verticalmente e só a zona ativa é renderizada", () => {
  assert.match(client, /<aside className="hc-zone-rail" aria-label="Zonas da Composição">/);
  assert.match(client, /<nav className="hc-zone-tabs" aria-label="Lista vertical de zonas">/);
  assert.match(modernStyles, /\.hc-zone-tabs \{[\s\S]*display: grid;/);
  assert.match(client, /activeWorkspaceKey === "opening" && openingSection/);
  assert.match(client, /activeWorkspaceKey === "editorial"/);
  assert.match(client, /activeWorkspaceKey === "highlight"/);
  assert.match(client, /activeWorkspaceKey === "faixa"/);
  assert.match(client, /activeDynamicZone \?/);
  assert.match(client, /name="composition-tools"/);
  assert.match(page, /name="composition-tools"/);
});

test("centro e candidatos têm scroll independente sem medições JS", () => {
  assert.match(modernStyles, /\.hc-desk-map \{[\s\S]*?min-height: 0;[\s\S]*?overflow-y: auto;/);
  assert.match(modernStyles, /\.hc-desk-scroll \{[\s\S]*?min-height: 0;[\s\S]*?overflow-y: auto;/);
  assert.match(modernStyles, /\.hc-desk-workspace \{[\s\S]*?min-height: 0;/);
  assert.doesNotMatch(client, /ResizeObserver|addEventListener\(["']resize|offsetHeight|clientHeight/);
  assert.match(client, /\.hc-desk-pending \{[\s\S]*?position: fixed;/);
});
