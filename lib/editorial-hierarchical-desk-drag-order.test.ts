import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const client = readFileSync(
  "app/admin/editorial/composicao/[matchdayId]/HierarchicalCompositionDeskClient.tsx",
  "utf8",
);

test("peças colocadas e artigos do reservatório podem ser arrastados", () => {
  assert.match(client, /draggable=\{Boolean\(location\)\}/);
  assert.match(client, /setDragged\(location\)/);
  assert.match(client, /kind: "reservoir"/);
  assert.match(client, /dataTransfer\.effectAllowed =\s*"move"/);
});

test("o drag move diretamente entre zonas e rejeita destino ocupado", () => {
  assert.match(client, /moveHistoricalCompositionPiece\(plan, dragged, target\)/);
  assert.match(client, /result\.occupied/);
  assert.match(client, /O destino está ocupado\. A notícia atual não foi substituída/);
  assert.match(client, /Mudança direta entre zonas planeada/);
  assert.doesNotMatch(client, /Só podes arrastar notícias dentro da mesma zona/);
});

test("a troca interna da mesma zona continua preservada", () => {
  assert.match(client, /result\.swapped/);
  assert.match(client, /Troca de posição planeada/);
});

test("todas as famílias históricas aceitam drag", () => {
  assert.match(
    client,
    /type DynamicDragLocation/,
  );

  assert.match(
    client,
    /zoneKey: activeDynamicZone\.clientId/,
  );

  assert.match(
    client,
    /historicalDynamicZonePositions\(activeDynamicZone\.visualFamily\)\.map/,
  );

  assert.match(
    client,
    /zoneKey: "faixa"/,
  );
});

test("o drag continua dependente de Guardar montagem", () => {
  assert.match(client, /Guardar montagem não publica/);
  assert.match(client, /apply_hierarchical_desk_plan/);
});
