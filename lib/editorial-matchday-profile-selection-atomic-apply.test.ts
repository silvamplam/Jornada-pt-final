import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

function source(relativePath: string) {
  return readFileSync(
    path.join(
      process.cwd(),
      relativePath,
    ),
    "utf8",
  );
}

const route = source(
  "app/api/admin/editorial/jornada/[matchdayId]/organizar/tematico/route.ts",
);

const client = source(
  "app/admin/editorial/jornada/[matchdayId]/organizar/MatchdayEditorialThematicDeskClient.tsx",
);

const migration = source(
  "supabase/migrations/20260823222923_thematic_editorial_selection_atomic_apply.sql",
);

test(
  "Seleção não grava no onChange",
  () => {
    assert.doesNotMatch(
      client,
      /selection_set/,
    );

    assert.doesNotMatch(
      client,
      /selection_clear/,
    );

    assert.match(
      client,
      /setDraftEditorialSelection/,
    );
  },
);

test(
  "dirty da Seleção participa no pending da Mesa",
  () => {
    assert.match(
      client,
      /const pending =[\s\S]*?draftEditorialSelection[\s\S]*?persistedEditorialSelection/,
    );
  },
);

test(
  "Apply envia os quatro lugares da Seleção",
  () => {
    assert.match(
      client,
      /selectionBankItemIds:[\s\S]*?draftEditorialSelection/,
    );

    assert.match(
      route,
      /input\.selectionBankItemIds/,
    );

    assert.match(
      route,
      /apply_matchday_editorial_profile_workspace_v11/,
    );
  },
);

test(
  "Apply recompõe a exclusividade da Seleção no servidor sem override técnico de Banco",
  () => {
    assert.match(
      route,
      /matchdayEditorialProfileSelectionIdentities/,
    );
    assert.match(
      route,
      /const circuitOverrides = withoutMatchdayEditorialProfileOpeningOverrides/,
    );
    assert.match(
      route,
      /returnMatchdayEditorialItemsToAutomatic\([\s\S]*selectionIdentities/,
    );
    assert.match(
      route,
      /selectionIdentities,[\s\S]*workedIdentities/,
    );
    assert.match(
      route,
      /p_overrides: circuitOverrides\.map/,
    );
  },
);

test(
  "V5 inclui Seleção no mesmo workspace atómico",
  () => {
    assert.match(
      migration,
      /apply_matchday_editorial_profile_workspace_v5/,
    );

    assert.match(
      migration,
      /apply_matchday_editorial_profile_workspace_v4/,
    );

    assert.match(
      migration,
      /editorial_selection/,
    );

    assert.match(
      migration,
      /matchday_editorial_profile_workspace_token/,
    );
  },
);
