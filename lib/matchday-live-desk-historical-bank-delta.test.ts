import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(path: string) {
  return readFileSync(path, "utf8");
}

const deskEntry = source("app/admin/editorial/jornada/page.tsx");
const editorialPage = source("app/admin/editorial/jornada/[matchdayId]/page.tsx");
const organizerPage = source("app/admin/editorial/jornada/[matchdayId]/organizar/page.tsx");
const selector = source(
  "app/admin/editorial/jornada/[matchdayId]/organizar/MatchdayEditorialContextSelector.tsx",
);
const thematicRoute = source(
  "app/api/admin/editorial/jornada/[matchdayId]/organizar/tematico/route.ts",
);
const compositionPage = source(
  "app/admin/editorial/composicao/[matchdayId]/page.tsx",
);
const compositionRoute = source("app/api/admin/editorial/composicao/route.ts");
const articleRoute = source("app/api/admin/editorial/artigos/route.ts");
const articleService = source("lib/editorial-article-service-internal.ts");
const automaticBank = source(
  "supabase/steps/73-composicao-historica-banco-automatico-apply.sql",
);
const historicalWorkspace = source(
  "supabase/migrations/20260825145814_historical_composition_workspace.sql",
);

test("Mesa Viva resolve sempre e apenas a linha is_managed atual", () => {
  assert.match(
    deskEntry,
    /matchday_editorial_desk_control\?select=matchday_id&is_managed=eq\.true&limit=2/,
  );
  assert.match(
    organizerPage,
    /readManagedDesk\(matchdayId\)[\s\S]*if \(managedDesk\.length !== 1\)[\s\S]*redirect\("\/admin\/editorial\/jornada"\)/,
  );
  assert.match(
    organizerPage,
    /managedMatchdays\.has\(assignment\.matchday_id\)[\s\S]*isEditorialProfileKey\(assignment\.profile_key\)/,
  );
  assert.match(selector, /Esta Jornada não é a Mesa Viva atual/);
});

test("atalhos de Jornada histórica abrem composição; Mesa abre pela autoridade atual", () => {
  assert.match(
    editorialPage,
    /editorialProfileAssignment && editorialDeskControl\?\.is_managed === true[\s\S]*\/organizar/,
  );
  assert.match(
    editorialPage,
    /editorialProfileAssignment && editorialDeskControl\?\.is_managed === false[\s\S]*\/admin\/editorial\/composicao\//,
  );
  assert.match(
    compositionPage,
    /href="\/admin\/editorial\/jornada"[\s\S]*Abrir Mesa Viva/,
  );
  assert.doesNotMatch(
    compositionPage,
    /href=\{`\/admin\/editorial\/jornada\/\$\{encodeURIComponent\(matchday\.id\)\}`\}/,
  );
});

test("API temática recusa leitura e escrita de Mesa para Jornada não-live", () => {
  assert.match(
    thematicRoute,
    /isManagedMatchdayEditorialDesk\(matchdayId\)/,
  );
  assert.equal(
    (thematicRoute.match(/"thematic-desk-not-live"/g) ?? []).length,
    2,
  );
  assert.match(
    thematicRoute,
    /matchday_editorial_desk_control\?select=matchday_id[^`]+is_managed=eq\.true/,
  );
});

test("publicação contextual alimenta o Bank da própria Jornada sem exigir Mesa live", () => {
  assert.match(
    articleRoute,
    /competition_id[\s\S]*season_id[\s\S]*matchday_id/,
  );
  assert.match(
    articleService,
    /resolveCanonicalEditorialArticleContext/,
  );
  assert.doesNotMatch(articleService, /is_managed/);
  assert.match(
    automaticBank,
    /sync_published_editorial_article_to_matchday_bank[\s\S]*after insert or update on public\.editorial_articles/,
  );
  assert.match(
    automaticBank,
    /publication_status <> 'published'[\s\S]*publication_matchday_id := \(payload ->> 'matchday_id'\)::uuid/,
  );
  assert.doesNotMatch(automaticBank, /is_managed/);
});

test("Bank histórico e workspace validam pertença à Jornada, não placements live", () => {
  assert.match(
    compositionPage,
    /matchday_editorial_bank_items\?select=[^`]+&matchday_id=eq\.\$\{encodeURIComponent\([\s\S]*matchdayId/,
  );
  assert.match(
    compositionRoute,
    /matchday_editorial_bank_items\?select=id,status[^`]+&matchday_id=eq\.\$\{encodeURIComponent\(matchdayId\)\}/,
  );
  assert.match(
    historicalWorkspace,
    /bank\.matchday_id = p_matchday_id[\s\S]*bank\.status = 'active'/,
  );
  assert.doesNotMatch(historicalWorkspace, /is_managed/);
  assert.doesNotMatch(historicalWorkspace, /matchday_live_layout_placements/);
});
