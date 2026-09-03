import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  promoteMatchdayEditorialProfileSelection,
} from "@/lib/editorial-matchday-profile-selection";

const client = readFileSync(
  "app/admin/editorial/jornada/[matchdayId]/organizar/MatchdayEditorialThematicDeskClient.tsx",
  "utf8",
);

const route = readFileSync(
  "app/api/admin/editorial/jornada/[matchdayId]/organizar/tematico/route.ts",
  "utf8",
);

const migration = readFileSync(
  "supabase/migrations/20260904001500_matchday_selection_optional_capacity.sql",
  "utf8",
);

test("7C3: duas notícias das quatro fazem swap puro", () => {
  assert.deepEqual(
    promoteMatchdayEditorialProfileSelection(
      ["bank-a", "bank-b", null, null],
      2,
      "bank-a",
    ),
    ["bank-b", "bank-a", null, null],
  );
});

test("7C3: mover para posição vazia deixa vaga na origem", () => {
  assert.deepEqual(
    promoteMatchdayEditorialProfileSelection(
      ["bank-a", null, null, null],
      3,
      "bank-a",
    ),
    [null, null, "bank-a", null],
  );
});

test("7C3: entrada externa substitui apenas o alvo", () => {
  assert.deepEqual(
    promoteMatchdayEditorialProfileSelection(
      ["bank-a", "bank-b", null, null],
      2,
      "bank-x",
    ),
    ["bank-a", "bank-x", null, null],
  );
});

test("7C3: drag das quatro participa no circuito transversal", () => {
  assert.match(
    client,
    /setDraggingIdentity\(itemIdentity\)/u,
  );
  assert.match(
    client,
    /placeAtFaixaTop\(itemIdentity\)/u,
  );
  assert.match(
    client,
    /placeInBank\(itemIdentity\)/u,
  );
  assert.match(
    client,
    /target: \{ kind: "displaced" \}/u,
  );
});

test("7C3: rota deixa de exigir quatro notícias ocupadas", () => {
  assert.doesNotMatch(
    route,
    /thematic-desk-incomplete-selection/u,
  );
  assert.doesNotMatch(
    route,
    /tem de ter quatro notícias antes de aplicar/u,
  );
  assert.match(
    route,
    /input\.selectionBankItemIds\.length !== 4/u,
  );
});

test("7C3: drag genérico reconhece também o payload das quatro", () => {
  assert.match(
    client,
    /function dragged[\s\S]*parseMatchdayEditorialProfileSelectionDrag\(raw\)[\s\S]*identityForBankItemId\(selectionDrag\.bankItemId\)/u,
  );
});

test("7C3: migration altera apenas o V9 privado pré-bridge", () => {
  assert.match(
    migration,
    /create or replace function jornada_private\.apply_matchday_editorial_profile_workspace_v9_pre_bridge/u,
  );
  assert.doesNotMatch(
    migration,
    /create or replace function public\.apply_matchday_editorial_profile_workspace_v9\(/u,
  );

  assert.match(
    migration,
    /jsonb_array_length\(p_selection_bank_item_ids\) <> 4/u,
  );
  assert.match(
    migration,
    /not in \('string', 'null'\)/u,
  );

  assert.doesNotMatch(
    migration,
    /matchday-editorial-profile-workspace-v9-incomplete-selection/u,
  );
  assert.match(
    migration,
    /matchday-editorial-profile-workspace-v9-invalid-selection-shape/u,
  );

  assert.match(
    migration,
    /apply_matchday_editorial_profile_workspace_v9_pre_cutover/u,
  );
  assert.match(
    migration,
    /apply_matchday_editorial_profile_workspace_v9_pre_bridge/u,
  );
  assert.match(
    migration,
    /from public, anon, authenticated, service_role/u,
  );
});