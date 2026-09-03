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

const projection =
  source(
    "lib/editorial-matchday-latest-four-projection.ts",
  );

const thematicRoute =
  source(
    "app/api/admin/editorial/jornada/[matchdayId]/organizar/tematico/route.ts",
  );

const thematicClient =
  source(
    "app/admin/editorial/jornada/[matchdayId]/organizar/MatchdayEditorialThematicDeskClient.tsx",
  );

const publicPage =
  source(
    "app/competicoes/[competitionSlug]/[seasonLabel]/jornadas/[matchdayNumber]/page.tsx",
  );

const publicLayout =
  source(
    "components/public/PublicFourNewsLatestLayout.tsx",
  );

test(
  "perfil temático não executa a projeção automática dos quatro",
  () => {
    assert.match(
      projection,
      /matchday_editorial_profile_assignments\?select=profile_key/,
    );

    assert.match(
      projection,
      /if \([\s\S]*?assignmentRows\[0\]\?\.profile_key[\s\S]*?\) \{\s*return;/,
    );

    assert.doesNotMatch(
      thematicRoute,
      /syncLatestFourNewsProjection/,
    );
  },
);

test(
  "sem assignment o sincronizador Legacy continua disponível",
  () => {
    assert.match(
      projection,
      /syncLatestFourNewsProjectionWithSupabase/,
    );

    assert.match(
      projection,
      /matchday_horizontal_news\?select=link_url/,
    );

    assert.match(
      projection,
      /matchday_live_layout_items\?on_conflict=matchday_id,slot_type/,
    );
  },
);

test(
  "As quatro ao lado das Últimas são manuais e aceitam artigo ou conteúdo",
  () => {
    assert.match(
      thematicRoute,
      /apply_matchday_editorial_profile_workspace_v11/,
    );

    assert.match(
      thematicRoute,
      /p_selection_bank_item_ids/,
    );

    assert.match(thematicRoute, /desk\.selectionCandidates/);

    assert.match(
      thematicClient,
      /Quatro ao lado das Últimas/,
    );

    assert.match(
      thematicClient,
      /Conteúdo editorial/,
    );
  },
);

test(
  "renderer temático aceita ocupação de zero a quatro conteúdos",
  () => {
    assert.match(
      publicLayout,
      /visibleItems\.length === 0/,
    );

    assert.doesNotMatch(
      publicLayout,
      /visibleItems\.length !== 4/,
    );

    assert.match(
      publicPage,
      /thematicSnapshot[\s\S]*?liveFourNewsItems\.length > 0/,
    );
  },
);

test(
  "As quatro ao lado das Últimas não usam carryover; Legacy mantém carryover",
  () => {
    assert.match(
      publicPage,
      /thematicSnapshot[\s\S]*?liveLayoutItemBySlotType\.get[\s\S]*?: liveLayoutItemBySlotType\.get[\s\S]*?carryoverLiveLayoutItemBySlotType/,
    );
  },
);
