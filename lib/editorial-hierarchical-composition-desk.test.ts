import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

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

test("a Composição hierárquica usa workspace tipo Mesa viva", () => {
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
    /grid-template-columns: minmax\(420px, \.9fr\) minmax\(620px, 1\.1fr\)/,
  );

  assert.match(
    client,
    /height: calc\(100vh - 205px\)/,
  );

  assert.match(
    client,
    /position: fixed/,
  );

  assert.match(
    client,
    /Aplicar alterações/,
  );
});

test("os filtros da Mesa são controlados por React", () => {
  for (const label of [
    "Todas",
    "Últimas",
    "Sem zona nas Últimas",
    "4 notícias",
    "6 notícias",
    "5 notícias principais",
    "5 notícias secundárias",
    "Faixa",
    "Vídeos",
    "Destaque da Jornada",
    "Sem colocação",
  ]) {
    assert.ok(
      client.includes(label),
      `falta o filtro ${label}`,
    );
  }

  assert.match(
    client,
    /setFilter\(key\)/,
  );

  assert.match(
    client,
    /filter === "four_news"/,
  );

  assert.match(
    client,
    /filter === "six_news"/,
  );

  assert.match(
    client,
    /filter === "five_news_balanced"/,
  );

  assert.match(
    client,
    /filter === "five_news_secondary"/,
  );

  assert.match(
    client,
    /filter === "faixa"/,
  );

  assert.match(
    client,
    /filter === "unplaced"/,
  );
});

test("Colocar planeia, limpa a seleção e só Apply persiste", () => {
  assert.match(
    client,
    /Colocação planeada/,
  );

  assert.match(
    client,
    /setSelectedBankItemId\(null\);[\s\S]*setDestination\(""\);/,
  );

  assert.match(
    client,
    /apply_hierarchical_desk_plan/,
  );

  assert.match(
    route,
    /async function applyHierarchicalDeskPlan/,
  );

  assert.match(
    route,
    /actionType === "apply_hierarchical_desk_plan"/,
  );

  assert.match(
    route,
    /return Response\.json\(\{\s*ok: true,\s*applied,/,
  );
});

test("vídeo e Editorial permanecem em ferramentas próprias", () => {
  assert.match(
    page,
    /<summary>A Jornada em Vídeo<\/summary>/,
  );

  assert.match(
    page,
    /<summary>Editorial da Jornada<\/summary>/,
  );

  assert.match(
    page,
    /<summary>Publicação e estado<\/summary>/,
  );

  assert.match(
    page,
    /<summary>Pré-visualização<\/summary>/,
  );
});