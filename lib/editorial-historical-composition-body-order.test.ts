import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const client = readFileSync(
  "app/admin/editorial/composicao/[matchdayId]/HierarchicalCompositionDeskClient.tsx",
  "utf8",
);

const page = readFileSync(
  "app/admin/editorial/composicao/[matchdayId]/page.tsx",
  "utf8",
);

const route = readFileSync(
  "app/api/admin/editorial/composicao/route.ts",
  "utf8",
);

const migration = readFileSync(
  "supabase/migrations/20260826103000_historical_composition_body_order.sql",
  "utf8",
);

test("Abertura e Editorial ficam fixos antes do corpo editorial", () => {
  const opening = client.indexOf("01 · Abertura");
  const editorial = client.indexOf("02 · Editorial da Jornada");
  const body = client.indexOf("bodyBlockKeys(");

  assert.ok(opening >= 0);
  assert.ok(editorial > opening);
  assert.ok(body >= 0);
});

test("o reservatório organiza temas, seleção e pesquisa na mesma linha de desktop", () => {
  assert.match(client, /\.hc-desk-groups\s*\{[\s\S]*?order:\s*1;/);
  assert.match(client, /\.hc-desk-bulk\s*\{[\s\S]*?order:\s*2;/);
  assert.match(client, /\.hc-desk-search\s*\{[\s\S]*?order:\s*3;/);
  assert.match(client, /\.hc-desk-toolbar\s*\{[\s\S]*?flex-wrap:\s*nowrap;/);
});

test("Vídeo + Destaque partilha a ordem do corpo com as zonas dinâmicas", () => {
  assert.match(client, /videoPosition/);
  assert.match(client, /moveBodyBlock\("video", "up"\)/);
  assert.match(client, /moveBodyBlock\("video", "down"\)/);
  assert.match(client, /móvel no corpo editorial/);
});

test("a posição do vídeo é carregada e persistida", () => {
  assert.match(page, /hierarchical_video_position/);
  assert.match(page, /initialVideoPosition=/);
  assert.match(route, /videoPosition/);
  assert.match(
    route,
    /rpc\/apply_historical_composition_workspace_plan_v3/,
  );
});

test("a RPC v3 preserva atomicidade e permissões", () => {
  assert.match(
    migration,
    /apply_historical_composition_workspace_plan_v2\(/,
  );
  assert.match(
    migration,
    /hierarchical_video_position/,
  );
  assert.match(migration, /security invoker/i);
  assert.match(migration, /from public,\s*anon,\s*authenticated/i);
  assert.match(migration, /to service_role/i);
});