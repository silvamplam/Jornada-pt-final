import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const client = readFileSync(
  "app/admin/editorial/composicao/[matchdayId]/HierarchicalCompositionDeskClient.tsx",
  "utf8",
);

test("notícias colocadas podem ser arrastadas", () => {
  assert.match(
    client,
    /draggable=\{Boolean\(location\)\}/,
  );

  assert.match(
    client,
    /setDraggedLocation\(location\)/,
  );

  assert.match(
    client,
    /dataTransfer\.effectAllowed =\s*"move"/,
  );
});

test("o drag só permite mudança dentro da mesma zona", () => {
  assert.match(
    client,
    /source\.kind !== target\.kind \|\|[\s\S]*?source\.zoneKey !== target\.zoneKey/,
  );

  assert.match(
    client,
    /Só podes arrastar notícias dentro da mesma zona/,
  );
});

test("arrastar para posição vazia move e para ocupada troca", () => {
  assert.match(
    client,
    /\[source\.targetKey\]: targetCard,[\s\S]*?\[target\.targetKey\]: sourceCard/,
  );

  assert.match(
    client,
    /Troca de posição planeada/,
  );

  assert.match(
    client,
    /Mudança de posição planeada/,
  );
});

test("as três famílias de zonas noticiosas aceitam drag", () => {
  assert.match(
    client,
    /zoneKey: `core:\$\{section\.key\}`/,
  );

  assert.match(
    client,
    /zoneKey: "beyond"/,
  );

  assert.match(
    client,
    /zoneKey: "faixa"/,
  );
});

test("o drag continua dependente de Aplicar alterações", () => {
  assert.match(
    client,
    /commit\([\s\S]*?Usa Aplicar alterações para guardar/,
  );

  assert.match(
    client,
    /apply_hierarchical_desk_plan/,
  );
});
